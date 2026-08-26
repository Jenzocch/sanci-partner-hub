"use server";

/**
 * Server Action halaman "Harga Normal" cabang (/cabang/harga, 0021) —
 * daftar produk katalog + dua kolom harga TERPISAH per baris (Harga Dasar
 * SANCI vs Harga Normal toko ini), plus tulis/hapus override.
 *
 * Kontrak daftarnya = kontrak katalog bersama (lib/catalog-query.ts:
 * pencarian/kategori di database, halaman 60, hasMore lewat baris
 * sentinel) — layar ini pemakai KETUJUH kontrak itu. Beda dari
 * getCatalogPageBranch: baris di sini membawa base_price + my_price
 * TERPISAH (bukan harga efektif gabungan) karena layar ini justru
 * menampilkan hubungan keduanya ("dasar → milikku, kosong = ikut dasar").
 *
 * Gerbang SAMA PERSIS dengan katalog cabang: partner_users →
 * sanci_catalog_access (dicek DULU) → sanci_products (RLS sp_partner_read)
 * → product_prices (RLS pp_partner_read 0021 — hanya baris dasar + milik
 * partner sendiri yang bisa kembali; zero-trust frontend). Error DB tidak
 * disamarkan jadi "belum dibuka"/"kosong" (LESSONS #10). `module_inactive`
 * juga mencakup product_prices yang belum ada (migrasi 0021 belum jalan —
 * LESSONS #12; layar ini TIDAK punya mode degradasi tanpa tabel harga,
 * beda dari prefill kalkulator, karena tabel itu adalah isinya sendiri).
 *
 * Tulisan (set/clear) — LESSONS #6: partner_id TIDAK PERNAH dari client;
 * di-resolve dari partner_users sesi ini, dan RLS 0021 tetap penegak
 * terakhirnya. Idempotency LESSONS #3: upsert bertarget unique
 * (product_id, partner_id) — kiriman ulang menimpa baris yang sama, tidak
 * pernah membuat baris kedua. Respons hilang ≠ gagal ≠ sukses (LESSONS
 * #2): dilaporkan sebagai "belum pasti" dan layar TIDAK menampilkan
 * centang sukses untuknya.
 */

import { createClient } from "@/lib/supabase/server";
import { isMissingTableError } from "@/lib/orders-shared";
import { safeWrite } from "@/lib/safe-write";
import { getCabangMessages } from "@/lib/i18n";
import {
  catalogIlikeOrFilter,
  catalogPageRange,
  fetchCatalogCategories,
  finishCatalogPage,
  normalizeCatalogPageInput,
  type CatalogPageInput,
} from "@/lib/catalog-query";
import type { StockStatus } from "@/lib/catalog-shared";

export type HargaRow = {
  id: string;
  name: string;
  code: string | null;
  category: string | null;
  photo_url: string | null;
  stock_status: StockStatus;
  /** Harga Dasar SANCI (baris partner_id NULL); null = SANCI belum menetapkan. */
  base_price: number | null;
  /** Harga Normal toko ini (override); null = mengikuti harga dasar. */
  my_price: number | null;
};

export type HargaPageOutcome =
  | { status: "ok"; products: HargaRow[]; hasMore: boolean; categories?: string[] }
  | { status: "not_opened" }
  | { status: "module_inactive" }
  | { status: "error" };

type ProductRow = {
  id: string;
  name: string;
  code: string | null;
  category: string | null;
  photo_url: string | null;
  stock_status: StockStatus;
};
type PriceRow = { product_id: string; partner_id: string | null; price: number };

export async function getHargaPageBranch(input: CatalogPageInput): Promise<HargaPageOutcome> {
  const supabase = await createClient();

  const { data: pu, error: puError } = await supabase
    .from("partner_users")
    .select("partner_id")
    .maybeSingle();
  if (puError || !pu) return { status: "error" };

  const { data: access, error: accessError } = await supabase
    .from("sanci_catalog_access")
    .select("enabled")
    .eq("partner_id", pu.partner_id)
    .maybeSingle();
  if (accessError) {
    return isMissingTableError(accessError) ? { status: "module_inactive" } : { status: "error" };
  }
  if (!(access as { enabled: boolean } | null)?.enabled) return { status: "not_opened" };

  const norm = normalizeCatalogPageInput(input);
  let query = supabase
    .from("sanci_products")
    .select("id, name, code, category, photo_url, stock_status");
  const orFilter = catalogIlikeOrFilter(norm.q, ["name", "code", "category"]);
  if (orFilter) query = query.or(orFilter);
  if (norm.category) query = query.eq("category", norm.category);
  const range = catalogPageRange(norm.offset);
  const { data: products, error: productsError } = await query
    .order("name")
    .order("id")
    .range(range.from, range.to);
  if (productsError) {
    return isMissingTableError(productsError) ? { status: "module_inactive" } : { status: "error" };
  }

  const page = finishCatalogPage((products ?? []) as ProductRow[]);

  // Satu query untuk KEDUA macam baris harga halaman ini — RLS
  // pp_partner_read sudah membatasi ke "dasar + milik partner sendiri",
  // jadi filternya cukup product_id (tidak perlu dua round-trip).
  const ids = page.products.map((p) => p.id);
  const basePrices = new Map<string, number>();
  const myPrices = new Map<string, number>();
  if (ids.length > 0) {
    const { data: priceRows, error: priceError } = await supabase
      .from("product_prices")
      .select("product_id, partner_id, price")
      .in("product_id", ids);
    if (priceError) {
      return isMissingTableError(priceError) ? { status: "module_inactive" } : { status: "error" };
    }
    for (const row of (priceRows ?? []) as PriceRow[]) {
      if (row.partner_id === null) basePrices.set(row.product_id, row.price);
      else myPrices.set(row.product_id, row.price);
    }
  }

  const rows: HargaRow[] = page.products.map((p) => ({
    ...p,
    base_price: basePrices.get(p.id) ?? null,
    my_price: myPrices.get(p.id) ?? null,
  }));

  let categories: string[] | undefined;
  if (norm.withCategories) {
    categories = (await fetchCatalogCategories(supabase)) ?? undefined;
  }

  return { status: "ok", products: rows, hasMore: page.hasMore, categories };
}

export type HargaWriteResult =
  | { ok: true; myPrice: number | null }
  | { ok: false; message: string };

/**
 * Set Harga Normal toko ini untuk satu produk (upsert override).
 * `priceRaw` di-parse ulang di server (LESSONS #6) — bilangan bulat rupiah
 * >= 0; kosong/tidak valid ditolak dengan pesan field (kosongkan lewat
 * clearMyPrice, bukan lewat string kosong — dua niat yang berbeda).
 */
export async function setMyPrice(productId: string, priceRaw: string): Promise<HargaWriteResult> {
  const m = await getCabangMessages();
  const supabase = await createClient();

  const digits = priceRaw.trim().replace(/[^0-9]/g, "");
  const price = digits === "" ? NaN : Number(digits);
  if (!Number.isSafeInteger(price) || price < 0 || price > 99_999_999_999_999) {
    return { ok: false, message: m.cabang.hargaInvalidInput };
  }

  const { data: pu, error: puError } = await supabase
    .from("partner_users")
    .select("partner_id")
    .maybeSingle();
  if (puError || !pu) return { ok: false, message: m.cabang.hargaSaveFailed };

  const written = await safeWrite(
    supabase
      .from("product_prices")
      .upsert(
        { product_id: productId, partner_id: pu.partner_id, price },
        { onConflict: "product_id,partner_id" }
      )
      .select("price")
      .single()
  );
  if (!written.ok) {
    if (written.reason === "db") {
      if (isMissingTableError({ code: written.code })) {
        return { ok: false, message: m.cabang.hargaModuleInactiveMsg };
      }
      return { ok: false, message: m.cabang.hargaSaveFailed };
    }
    // Respons hilang: tulisan bisa saja sudah mendarat (upsert aman
    // diulang) — jangan klaim sukses, jangan juga klaim gagal (LESSONS #2).
    return { ok: false, message: m.cabang.hargaSaveUnsure };
  }
  return { ok: true, myPrice: (written.data as { price: number }).price };
}

/**
 * Hapus override toko ini (kembali mengikuti Harga Dasar SANCI). 0 baris
 * terhapus = memang sudah tidak ada — hasil akhirnya sama, tetap sukses
 * (idempoten; aman ditekan dua kali di jaringan lemah).
 */
export async function clearMyPrice(productId: string): Promise<HargaWriteResult> {
  const m = await getCabangMessages();
  const supabase = await createClient();

  const { data: pu, error: puError } = await supabase
    .from("partner_users")
    .select("partner_id")
    .maybeSingle();
  if (puError || !pu) return { ok: false, message: m.cabang.hargaSaveFailed };

  const { error } = await supabase
    .from("product_prices")
    .delete()
    .eq("product_id", productId)
    .eq("partner_id", pu.partner_id);
  if (error) {
    if (isMissingTableError(error)) return { ok: false, message: m.cabang.hargaModuleInactiveMsg };
    return { ok: false, message: m.cabang.hargaSaveFailed };
  }
  return { ok: true, myPrice: null };
}
