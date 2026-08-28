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
