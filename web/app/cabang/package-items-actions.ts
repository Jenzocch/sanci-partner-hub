"use server";

/**
 * Isi Package (partner_package_items, migrasi 0012) — sisi CABANG, HANYA BACA.
 *
 * Kenapa ada: sampai sekarang cabang cuma melihat NAMA package waktu memilih
 * di form pesanan dan waktu membuka detail pesanan. Apa isinya hanya diketahui
 * SANCI. Migrasi 0012 memang sudah membuka jalur bacanya di lapisan basis data
 * (policy `ppi_partner_read`) dan menuliskan sendiri di komentar §"YANG SENGAJA
 * TIDAK DIBUKA": "Tampilan isi paket di sisi cabang … layarnya belum dibuat —
 * itu irisan berikutnya." Berkas ini bagian layar itu.
 *
 * TIDAK ADA jalur tulis di sini, dan tidak boleh ditambahkan: isi Package
 * dikurasi SANCI, dan `partner_package_items` sengaja TIDAK punya satu pun
 * policy INSERT/UPDATE/DELETE untuk pengguna partner (0012 §4 — tanpa policy =
 * tertutup). Menambahkan action tulis di sini hanya akan menghasilkan tombol
 * yang selalu gagal.
 *
 * DUA TABEL, DUA IZIN BERBEDA — ini inti berkas ini, jangan disederhanakan:
 *   partner_package_items → `ppi_partner_read` (0012): terbaca kalau paket
 *     induknya milik partner ini. TIDAK bergantung katalog.
 *   sanci_products        → `sp_partner_read` (0010): terbaca hanya kalau
 *     `status = 'ACTIVE'` DAN SANCI sudah membuka katalog untuk partner ini
 *     (`fn_catalog_enabled()`).
 * Jadi baris isinya bisa terbaca sementara NAMA produknya tidak. Kalau itu
 * dibiarkan lewat begitu saja, layarnya akan bilang "tidak ada produk" atau
 * memajang deretan "—" untuk keadaan yang sebenarnya bernama "katalog belum
 * dibuka SANCI" — persis kekeliruan yang dilarang LESSONS #10. Karena itu
 * status katalog dibaca duluan dan punya status hasil sendiri.
 *
 * Gerbangnya SAMA PERSIS dengan catalog-actions.ts (jangan dilonggarkan):
 * partner_users → sanci_catalog_access → baru daftar isinya. Tanpa
 * auth.getUser(): batas keamanannya RLS, bukan cek di halaman (LESSONS #5) —
 * `packageId` yang dikirim client tidak pernah dipercaya, policy 0012 yang
 * memutuskan baris mana yang boleh pulang (LESSONS #6).
 */

import { createClient } from "@/lib/supabase/server";
import { isMissingTableError } from "@/lib/orders-shared";

export type PackageContentRow = {
  id: string;
  quantity: number;
  /** null = baris isinya terbaca, produknya TIDAK (ditarik dari katalog). */
  name: string | null;
  code: string | null;
};

export type PackageContentsOutcome =
  /** Terbaca. `items` kosong = paketnya memang belum diisi SANCI. */
  | { status: "ok"; items: PackageContentRow[] }
  /** Paket ini ada isinya, tapi katalog produk belum dibuka SANCI untuk toko ini. */
  | { status: "not_opened" }
  /** 42P01 — migrasi 0010/0012 belum jalan di database ini (LESSONS #12). */
  | { status: "module_inactive" }
  /** Sebab lain (jaringan/RLS/timeout) — WAJIB dibedakan dari "kosong". */
  | { status: "error" };

type EmbeddedProduct = { name: string; code: string | null };
type RawItem = {
  id: string;
  quantity: number;
  sanci_products: EmbeddedProduct | EmbeddedProduct[] | null;
};

export async function getPackageContentsBranch(packageId: string): Promise<PackageContentsOutcome> {
  if (!packageId) return { status: "error" };
  const supabase = await createClient();

  const { data: pu, error: puError } = await supabase
    .from("partner_users")
    .select("partner_id")
    .maybeSingle();
  if (puError || !pu) return { status: "error" };

  // Keduanya cuma butuh id yang sudah diketahui, tidak saling bergantung —
  // satu gelombang, bukan dua perjalanan berurutan (pola halaman detail
  // pesanan). partner_package_items.product_id → sanci_products.id adalah
  // foreign key SUNGGUHAN, jadi embed PostgREST di sini sah (LESSONS #24
  // bicara tentang dua tabel TANPA foreign key di antaranya — beda kasus).
  const [{ data: access, error: accessError }, { data: itemRows, error: itemsError }] = await Promise.all([
    supabase.from("sanci_catalog_access").select("enabled").eq("partner_id", pu.partner_id).maybeSingle(),
    supabase
      .from("partner_package_items")
      .select("id, quantity, sanci_products:product_id(name, code)")
      .eq("package_id", packageId)
      // created_at = urutan SANCI menyusunnya (sama seperti layar admin Isi
      // Package); `id` cuma pemecah seri supaya urutannya tidak pernah
      // berubah antar pemuatan kalau dua baris punya cap waktu yang sama.
      .order("created_at")
      .order("id"),
  ]);

  if (itemsError) {
    return isMissingTableError(itemsError) ? { status: "module_inactive" } : { status: "error" };
  }
  if (accessError) {
    return isMissingTableError(accessError) ? { status: "module_inactive" } : { status: "error" };
  }

  const rows = (itemRows ?? []) as unknown as RawItem[];

  // Paket kosong dijawab "ok + 0 baris" TANPA melihat status katalog: baris
  // isinya terbaca lepas dari katalog, jadi 0 baris memang berarti 0 baris.
  // (0 baris juga yang pulang untuk packageId milik partner lain — RLS yang
  // menyaringnya, dan menyamakan "bukan milikmu" dengan "kosong" di sini
  // memang disengaja: jangan sampai beda pesan mengabarkan keberadaan paket
  // partner lain.)
  if (rows.length === 0) return { status: "ok", items: [] };

  // Tidak ada baris ATAU enabled=false = katalog BELUM dibuka SANCI untuk toko
  // ini (kontrak yang sama dengan /cabang/produk) — nama produk tidak akan
  // terbaca, jadi jangan pura-pura punya daftar.
  if (!(access as { enabled: boolean } | null)?.enabled) return { status: "not_opened" };

  return {
    status: "ok",
    items: rows.map((r) => {
      // PostgREST memberi objek untuk relasi to-one, tapi tipe hasil
      // generatednya bisa berupa array — dinormalkan di sini, bukan di
      // komponen (pola sama dengan layar admin Isi Package).
      const p = Array.isArray(r.sanci_products) ? r.sanci_products[0] : r.sanci_products;
      return { id: r.id, quantity: r.quantity, name: p?.name ?? null, code: p?.code ?? null };
    }),
  };
}
