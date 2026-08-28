"use server";

/**
 * Server Actions untuk Galeri Foto Produk (migration 0022, `product_photos`)
 * — dikelola SANCI Admin saja (RLS `ph_admin_all`, migration 0022 §3).
 *
 * DI LUAR sanci_products.photo_url (foto sampul, 0010/actions-products.ts —
 * SATU KATA PUN tidak diubah di sana). Galeri ini adalah foto TAMBAHAN,
 * ditampilkan sebagai strip thumbnail di detail cabang/publik.
 *
 * Pola idempotency/safeWrite/pesan MENIRU actions-products.ts (LESSONS #21) —
 * `product_photos` bisa belum ada di database (migration 0022 dikerjakan
 * paralel dengan kode ini, LESSONS #12): setiap error 42P01 diterjemahkan ke
 * pesan degradasi yang sama, bukan dibiarkan bocor sebagai error DB mentah
 * (LESSONS #10).
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { safeWrite, pesan } from "@/lib/safe-write";
import { getAdminMessages } from "@/lib/i18n";

type ActionError = { field?: string; message: string };
type ActionResult<T> = { data: T } | { error: ActionError };

type GalleryPhoto = { id: string; photo_url: string; sort_order: number };

function isMissingTable(code: string | undefined): boolean {
  return code === "42P01";
}

/**
 * Daftar foto galeri satu produk, terurut sesuai kontrak migration 0022
 * (`sort_order, created_at, id`) — urutan yang sama dipakai layar cabang/
 * publik supaya galeri konsisten di semua permukaan.
 */
export async function listProductPhotos(productId: string): Promise<ActionResult<GalleryPhoto[]>> {
  const m = await getAdminMessages();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_photos")
    .select("id, photo_url, sort_order")
    .eq("product_id", productId)
    .order("sort_order")
    .order("created_at")
    .order("id");
  if (error) {
    if (isMissingTable(error.code)) return { error: { message: m.admin.catalogMigrationMsg } };
    return { error: { message: m.common.errorLoad } };
  }
  return { data: (data ?? []) as GalleryPhoto[] };
}

/**
 * Menyimpan satu baris galeri SESUDAH berkasnya berhasil masuk ke storage
 * dari browser (pola sama dengan setProductPhoto — LESSONS #6/#22). Nilai
 * dari browser TIDAK dipercaya: hanya alamat publik di bucket foto milik
 * PRODUK INI, di bawah path `gallery/`, yang boleh masuk ke tabel ini.
 */
export async function addProductPhoto(productId: string, photoUrl: string): Promise<ActionResult<{ id: string }>> {
  const m = await getAdminMessages();
  const PESAN = pesan(m);
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  const prefix = `${base}/storage/v1/object/public/product-photos/${productId}/gallery/`;
  if (!photoUrl.startsWith(prefix)) {
    return { error: { message: m.admin.photoUrlUnrecognized } };
  }

  const supabase = await createClient();
  const written = await safeWrite(
    supabase
      .from("product_photos")
      .insert({ product_id: productId, photo_url: photoUrl })
      .select("id")
      .single()
  );
  if (!written.ok) {
    if (written.reason === "db" && isMissingTable(written.code)) {
      return { error: { message: m.admin.catalogMigrationMsg } };
    }
    return { error: { message: PESAN.serverSibuk } };
  }

  revalidatePath("/admin/produk");
  return { data: { id: written.data.id } };
}

/**
 * Menggeser satu foto galeri satu langkah ke kiri/kanan dalam urutan
 * tampil (kontrak 0022: `sort_order, created_at, id` — urutan yang sama
 * dipakai admin/cabang/publik).
 *
 * Kenapa BUKAN sekadar menukar dua nilai sort_order: semua baris lama
 * lahir dengan default `sort_order = 0` (0022), jadi menukar 0 dengan 0
 * tidak mengubah apa pun. Server membaca urutan kanonis saat ini, menukar
 * posisi kedua foto, lalu MENORMALKAN sort_order menjadi 0..n-1 — hanya
 * baris yang nilainya berubah yang di-UPDATE (galeri kecil, hitungan
 * jari, jadi barisan UPDATE berurutan ini murah).
 *
 * Nilai `direction` dari browser tidak dipercaya begitu saja (LESSONS #6
 * sekeluarga): selain "left"/"right" ditolak. Foto yang sudah di tepi =
 * bukan error — urutan sekarang dikembalikan apa adanya.
 *
 * Yang dikembalikan saat sukses adalah urutan HASIL BACA ULANG dari DB,
 * bukan susunan yang dihitung di memori (LESSONS #7: layar hanya boleh
 * menampilkan urutan yang terbukti tersimpan). Kalau barisan UPDATE putus
 * di tengah, pemanggil menerima error dan wajib memuat ulang daftarnya —
 * pemanggilan geser berikutnya menormalkan ulang dari awal, jadi keadaan
 * "separuh jalan" tidak pernah permanen.
 */
export async function moveProductPhoto(
  productId: string,
  photoId: string,
  direction: "left" | "right"
): Promise<ActionResult<GalleryPhoto[]>> {
  const m = await getAdminMessages();
  const PESAN = pesan(m);
  if (direction !== "left" && direction !== "right") {
    return { error: { message: m.admin.productGalleryMoveFailed } };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_photos")
    .select("id, photo_url, sort_order")
    .eq("product_id", productId)
    .order("sort_order")
    .order("created_at")
    .order("id");
  if (error) {
    if (isMissingTable(error.code)) return { error: { message: m.admin.catalogMigrationMsg } };
    return { error: { message: m.common.errorLoad } };
  }

  const photos = (data ?? []) as GalleryPhoto[];
  const from = photos.findIndex((p) => p.id === photoId);
  // Foto tidak ada (mis. baru dihapus dari tab lain) — daftar di layar
  // sudah basi; pemanggil menampilkan error + memuat ulang.
  if (from === -1) return { error: { message: m.admin.productGalleryMoveFailed } };

  const to = direction === "left" ? from - 1 : from + 1;
  if (to < 0 || to >= photos.length) return { data: photos };

  const target = photos.slice();
  [target[from], target[to]] = [target[to], target[from]];

  // SATU pernyataan untuk SELURUH urutan baru — bukan perulangan UPDATE.
  //
  // Versi pertama berkas ini (2026-08-28) menulis satu UPDATE per baris di
  // dalam loop tanpa transaksi. Itu punya dua cacat nyata:
  //
  //   1. GAGAL DI TENGAH JALAN. Semua baris lama lahir dengan sort_order = 0
  //      (default 0022) dan tidak ada unique index pada (product_id,
  //      sort_order), jadi keadaan "semua nol" adalah yang paling umum DAN
  //      yang paling buruk ditangani loop. Contoh: urutan kanonis A,B,C,D
  //      semuanya 0; admin menggeser C ke kiri; i=1 menulis C=1 lalu i=2
  //      untuk B gagal. Hasilnya A=0,B=0,C=1,D=0 → urutan terbaca A,B,D,C:
  //      foto yang digeser ke KIRI justru melompat ke URUTAN TERAKHIR, di
  //      layar admin, halaman cabang, DAN halaman publik. Klaim di kepala
  //      versi lama ("geser berikutnya menormalkan ulang") hanya benar untuk
  //      ANGKA sort_order-nya; URUTANNYA tetap salah selamanya karena
  //      normalisasi berikutnya berangkat dari urutan yang sudah rusak.
  //   2. DUA ADMIN BERSAMAAN. Tanpa penguncian, dua loop bisa berselang-
  //      seling menjadi sort_order ganda (mis. dua baris bernilai 2) dan
  //      KEDUANYA melaporkan sukses.
  //
  // Satu upsert = satu pernyataan = atomik: seluruh urutan tersimpan atau
  // tidak ada satu pun. Dua penulis bersamaan menjadi "yang terakhir menang
  // untuk SELURUH urutan" — hasil yang masih masuk akal, bukan campuran
  // rusak. `product_id` ikut dikirim di setiap baris (dan RLS ph_admin_all
  // tetap penjaga sesungguhnya) supaya id foto dari browser tidak pernah
  // bisa menyentuh baris produk lain.
  const written = await safeWrite(
    supabase
      .from("product_photos")
      .upsert(
        target.map((p, i) => ({
          id: p.id,
          product_id: productId,
          photo_url: p.photo_url,
          sort_order: i,
        })),
        { onConflict: "id" }
      )
      .select("id")
  );
  if (!written.ok) {
    if (written.reason === "db" && isMissingTable(written.code)) {
      return { error: { message: m.admin.catalogMigrationMsg } };
    }
    return {
      error: { message: written.reason === "db" ? PESAN.serverSibuk : PESAN.belumPastiUbah },
    };
  }

  // Baca ulang sebagai bukti (LESSONS #7) — inilah urutan yang benar-benar
  // tersimpan, bukan asumsi client.
  const { data: after, error: afterError } = await supabase
    .from("product_photos")
    .select("id, photo_url, sort_order")
    .eq("product_id", productId)
    .order("sort_order")
    .order("created_at")
    .order("id");
  if (afterError) {
    if (isMissingTable(afterError.code)) return { error: { message: m.admin.catalogMigrationMsg } };
    return { error: { message: m.admin.productGalleryMoveFailed } };
  }

  // Bukti itu DIPERIKSA, bukan cuma dikembalikan. Kalau urutan tersimpan
  // tidak sama dengan yang diminta — penulis lain menyelinap di antara baca
  // dan tulis, atau sebuah foto dihapus di sela itu — ini BUKAN sukses:
  // memulangkan daftar apa adanya akan menampilkan urutan orang lain seolah
  // hasil klik admin ini (LESSONS #7/#10). Klien menampilkan pesan gagal dan
  // memuat ulang, lalu admin bisa menggeser lagi di atas keadaan yang benar.
  const tersimpan = (after ?? []) as GalleryPhoto[];
  const samaUrutannya =
    tersimpan.length === target.length &&
    tersimpan.every((p, i) => p.id === target[i].id);
  if (!samaUrutannya) return { error: { message: m.admin.productGalleryMoveFailed } };

  revalidatePath("/admin/produk");
  return { data: tersimpan };
}

/**
 * Menghapus satu baris galeri. DB adalah otoritatif — begitu baris ini
 * hilang, produk sudah tidak menunjuk ke berkas storage itu lagi dari sisi
 * mana pun (cabang/publik/admin). Pemanggil (client) yang best-effort
 * menghapus berkas storage-nya SESUDAH panggilan ini sukses — lihat catatan
 * di product-gallery-client.tsx kenapa urutannya begini, dan kenapa berkas
 * storage yatim (kalau langkah itu gagal) dianggap DAPAT DITERIMA.
 */
export async function deleteProductPhoto(id: string): Promise<ActionResult<true>> {
  const m = await getAdminMessages();
  const PESAN = pesan(m);
  const supabase = await createClient();
  const { error } = await supabase.from("product_photos").delete().eq("id", id);
  if (error) {
    if (isMissingTable(error.code)) return { error: { message: m.admin.catalogMigrationMsg } };
    return { error: { message: PESAN.serverSibuk } };
  }

  revalidatePath("/admin/produk");
  return { data: true };
}
