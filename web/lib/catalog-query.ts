/**
 * Kontrak bersama "katalog menembus 200" (owner setuju 2026-08-26; owner:
 * batas 200 "一定會超過"). SATU bentuk query untuk ENAM layar katalog:
 * /cabang/produk, /cabang/kalkulator, /admin/kalkulator, /admin/produk,
 * picker Isi Pesanan (dua form), dan pemilih produk Package.
 *
 * Bentuk kontrak:
 *   input : { q?, category?, offset }  (limit selalu CATALOG_PAGE_SIZE)
 *   output: { products, hasMore, categories? }
 *
 * Prinsip yang MENGIKAT semua pemakai:
 *   1. Pencarian & filter kategori dieksekusi DATABASE (ilike %q%), bukan
 *      di memori client — menggantikan pola lama `.limit(200)` + peringatan
 *      catalogListCappedMsg (stopgap audit 2026-08-22 #11, sekarang usang).
 *   2. Urutan SELALU `order("name").order("id")` — tiebreak `id` membuat
 *      urutan deterministik: tanpa itu, dua produk bernama sama boleh
 *      bertukar posisi antar request dan offset-paging melompati/menduakan
 *      baris di perbatasan halaman.
 *   3. `hasMore` didapat dengan meminta SATU baris ekstra (range inklusif
 *      offset..offset+PAGE_SIZE = PAGE_SIZE+1 baris) lalu memotongnya —
 *      tanpa query count terpisah.
 *   4. Filter keamanan/status TIDAK diseragamkan di sini: tiap area membawa
 *      filternya sendiri persis seperti sebelumnya (cabang: gerbang
 *      sanci_catalog_access + RLS sp_partner_read; admin ACTIVE-only untuk
 *      kalkulator/picker; /admin/produk semua status). File ini hanya
 *      menyumbang potongan query yang identik.
 *
 * File ini PURE (tipe + fungsi murni + satu helper yang menerima client
 * lewat parameter) supaya boleh diimpor komponen client MAUPUN Server
 * Action — jangan menambahkan import runtime dari "@/lib/supabase/server"
 * (next/headers akan meledakkan bundle client). Tipe client diimpor
 * type-only, terhapus saat kompilasi.
 */

import type { SupabaseServerClient } from "@/lib/order-create-shared";
import type { StockStatus } from "@/lib/catalog-shared";

export const CATALOG_PAGE_SIZE = 60;

/**
 * Batas atas pemindaian kolom `category` untuk daftar chip/dropdown.
 *
 * PostgREST tidak punya SELECT DISTINCT (agregat Supabase juga nonaktif
 * secara default), jadi daftar kategori diambil dengan membaca SATU kolom
 * `category` dari (maksimal) 2000 baris lalu di-dedupe di server action —
 * ±60 byte/baris berarti ±120 KB kasus terburuk yang tidak pernah menyentuh
 * browser (dedupe terjadi sebelum respons). Pada 169–2000 produk ini murah;
 * kalau katalog benar-benar menembus 2000, daftar kategori mulai bisa
 * terpotong — saat itu solusinya RPC `select distinct` khusus (keputusan
 * migrasi tersendiri), bukan menaikkan angka ini diam-diam.
 */
export const CATALOG_CATEGORY_SCAN_LIMIT = 2000;

/** Offset di luar akal ditolak (input client tidak dipercaya, LESSONS #6). */
const MAX_CATALOG_OFFSET = 100_000;
/** Kata kunci super panjang tidak berguna — potong sebelum jadi pattern. */
const MAX_QUERY_LENGTH = 200;

export type CatalogPageInput = {
  q?: string;
  category?: string | null;
  offset: number;
  /**
   * Minta daftar kategori lengkap ikut dalam respons (untuk baris chip).
   * Hanya pemuatan PERTAMA sebuah permukaan yang menyetel ini — daftar chip
   * harus lengkap terlepas dari halaman/pencarian yang sedang tampil.
   */
  withCategories?: boolean;
  /**
   * Minta harga EFEKTIF (0021: override partner → Harga Dasar SANCI) ikut
   * menempel di tiap baris (`price`) — HANYA konteks penetapan harga
   * (kalkulator, picker Isi Pesanan) yang menyetel ini. Layar jelajah
   * katalog (/cabang/produk, grid /admin/produk) TIDAK menyetelnya dan
   * tetap bebas harga (aturan 0010 yang dipertahankan 0021). Bukan lubang
   * keamanan kalau client iseng menyetelnya: baris harga yang bisa
   * terbaca dibatasi RLS 0021 (gerbang katalog + partner sendiri), flag
   * ini murni soal tampilan/berat respons.
   */
  withPrices?: boolean;
  /**
   * Minta harga untuk DITAMPILKAN di kartu (`display_price`, kontrak TIGA
   * keadaan applyDisplayPrices — number / null "pasti belum ada" /
   * undefined "gagal dimuat"). Terpisah dari `withPrices` dengan sengaja:
   * `withPrices` berarti "prefill nilai ini" dan boleh mendegradasi diam-
   * diam, sedangkan layar yang MENAMPILKAN angka wajib bisa membedakan
   * "belum ada harga" dari "gagal dimuat" (LESSONS #10). Disetel grid
   * jelajah /cabang/produk sejak keputusan owner 2026-08-28. Sama seperti
   * `withPrices`, ini bukan lubang keamanan kalau client iseng
   * menyetelnya: baris harga yang bisa terbaca dibatasi RLS 0021.
   */
  withDisplayPrices?: boolean;
};

/** Baris produk seperti keluar dari PostgREST (snake_case). TIDAK ada
 *  `description`: tidak satu pun layar yang memakai kontrak ini merendernya
 *  (grid jelajah cabang, kalkulator, picker Isi Pesanan) — dulu ikut karena
 *  disangka dibutuhkan modal detail cabang, padahal detail produk adalah
 *  halaman tersendiri dengan query sendiri (audit kecepatan 2026-08-29).
 *  Layar yang MEMANG menampilkan deskripsi (/cabang/produk/[productId],
 *  /p/[productId], modal Ubah admin) memilih kolomnya di query masing-masing,
 *  bukan lewat tipe ini.
 *  `price` (harga efektif 0021, rupiah bulat) hanya diisi kalau pemanggil
 *  meminta `withPrices` DAN barisnya punya harga — ditempelkan action di
 *  server SETELAH query produk, bukan kolom PostgREST. */
export type CatalogProductRow = {
  id: string;
  name: string;
  code: string | null;
  category: string | null;
  photo_url: string | null;
  stock_status: StockStatus;
  price?: number | null;
  /** Harga untuk DITAMPILKAN di kartu (hanya kalau pemanggil meminta
   *  `withDisplayPrices`). TIGA keadaan, jangan disamakan dengan `price`:
   *  number = harga; null = dipastikan belum ada harga; TANPA field =
   *  query harga gagal / tabel 0021 belum ada (lib/price-query.ts). */
  display_price?: number | null;
};

/**
 * Hasil satu halaman katalog. Statusnya mengikuti pemetaan tiga-keadaan
 * yang sudah dipakai picker (LESSONS #10 — error DB ≠ katalog kosong ≠
 * belum dibuka): `not_opened` hanya pernah dikembalikan action cabang.
 */
export type CatalogPageOutcome =
  | { status: "ok"; products: CatalogProductRow[]; hasMore: boolean; categories?: string[] }
  | { status: "not_opened" }
  | { status: "module_inactive" }
  | { status: "error" };

export function normalizeCatalogPageInput(input: CatalogPageInput): {
  q: string;
  category: string | null;
  offset: number;
  withCategories: boolean;
  withPrices: boolean;
  withDisplayPrices: boolean;
} {
  const rawOffset = input.offset;
  const offset =
    typeof rawOffset === "number" && Number.isInteger(rawOffset) && rawOffset >= 0 && rawOffset <= MAX_CATALOG_OFFSET
      ? rawOffset
      : 0;
  const q = typeof input.q === "string" ? input.q.trim().slice(0, MAX_QUERY_LENGTH) : "";
  const category =
    typeof input.category === "string" && input.category.trim() !== "" ? input.category : null;
  return {
    q,
    category,
    offset,
    withCategories: input.withCategories === true,
    withPrices: input.withPrices === true,
    withDisplayPrices: input.withDisplayPrices === true,
  };
}

/**
 * Bangun string filter untuk `.or()` supabase-js: `name.ilike.<p>,code...`.
 * Mengembalikan null kalau kata kuncinya kosong (jangan panggil `.or("")`).
 *
 * DUA lapis sanitasi, urutannya penting:
 *   1. LIKE-escape: `\` `%` `_` dari pengguna di-escape (`\\` `\%` `\_`)
 *      supaya dicocokkan HARFIAH — meniru semantik substring `includes()`
 *      yang digantikan filter ini (memo `filtered` lama di client).
 *   2. PostgREST-quote: seluruh pattern dibungkus kutip ganda dan `\`/`"`
 *      di dalamnya di-escape. Tanpa ini, koma/kurung/titik dari pengguna
 *      dibaca parser pohon-logika `or=()` PostgREST sebagai pemisah
 *      kondisi — pencarian `Sofa 2,5 Seat (L)` akan mematahkan seluruh
 *      filter string. Di dalam kutip ganda semua karakter itu harfiah;
 *      PostgREST meng-unquote `\\`→`\` dan `\"`→`"` sebelum jadi operand.
 *      (supabase-js `.or()` menempelkan string ini apa adanya ke param
 *      `or=(...)` — dibaca dari source PostgrestFilterBuilder.ts v2.)
 *
 * Batas yang DIKETAHUI dan diterima: PostgREST memperlakukan `*` dalam
 * operand like/ilike sebagai sinonim `%`. Pengguna yang mengetik `*` akan
 * mendapat wildcard (hasil SUPERSET — tidak pernah kehilangan kecocokan,
 * tidak bisa error), jadi tidak dilawan dengan trik escape tambahan.
 */
export function catalogIlikeOrFilter(qNormalized: string, fields: readonly string[]): string | null {
  if (!qNormalized) return null;
  const pattern = `%${likeEscape(qNormalized)}%`;
  const quoted = `"${pattern.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  return fields.map((f) => `${f}.ilike.${quoted}`).join(",");
}

/**
 * LIKE-escape mentah: `\`→`\\`, `%`→`\%`, `_`→`\_` — supaya sebuah string
 * dicocokkan ilike/like HARFIAH (semantik "mengandung", bukan pola). Dipakai
 * SENDIRI (tanpa lapis PostgREST-quote di atas) untuk filter vertikal
 * tunggal — `.ilike("kolom", `%${likeEscape(q)}%`)` di luar `.or()` — yang
 * tidak melewati parser pohon-logika PostgREST sehingga tidak butuh
 * pembungkus kutip ganda (LESSONS #40: koma/kurung aman di `.ilike()`
 * berdiri sendiri, tapi `%`/`_` pengguna tetap wildcard kalau tidak
 * di-escape). Batas yang sama seperti `catalogIlikeOrFilter` berlaku di sini:
 * `*` tetap sinonim `%` di mata PostgREST dan tidak coba dilawan.
 */
export function likeEscape(raw: string): string {
  return raw.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** Range inklusif untuk `.range(from, to)` — meminta PAGE_SIZE+1 baris. */
export function catalogPageRange(offset: number): { from: number; to: number } {
  return { from: offset, to: offset + CATALOG_PAGE_SIZE };
}

/** Potong baris sentinel ke-(PAGE_SIZE+1) menjadi flag `hasMore`. */
export function finishCatalogPage<T>(rows: T[]): { products: T[]; hasMore: boolean } {
  const hasMore = rows.length > CATALOG_PAGE_SIZE;
  return { products: hasMore ? rows.slice(0, CATALOG_PAGE_SIZE) : rows, hasMore };
}

/**
 * Daftar kategori distinct untuk baris chip / dropdown — lihat catatan
 * CATALOG_CATEGORY_SCAN_LIMIT di atas untuk kenapa bentuknya begini.
 *
 * `null` = query GAGAL (bukan "tidak ada kategori") — pemanggil mendegradasi
 * dengan tidak menampilkan chip, TANPA memblokir daftar produk yang sehat;
 * degradasi kosmetik ini sengaja (chip hanyalah jalan pintas filter, dan
 * pencarian teks tetap mencakup kategori). Jangan menyamakan `null` dengan
 * `[]` di sisi pemanggil kalau suatu saat perbedaannya mulai penting.
 */
export async function fetchCatalogCategories(
  supabase: SupabaseServerClient,
  opts?: { activeOnly?: boolean }
): Promise<string[] | null> {
  let query = supabase.from("sanci_products").select("category").not("category", "is", null);
  if (opts?.activeOnly) query = query.eq("status", "ACTIVE");
  const { data, error } = await query.limit(CATALOG_CATEGORY_SCAN_LIMIT);
  if (error) return null;
  const set = new Set<string>();
  for (const row of (data ?? []) as { category: string | null }[]) {
    if (row.category) set.add(row.category);
  }
  return Array.from(set);
}
