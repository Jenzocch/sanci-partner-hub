"use server";

/**
 * Server Action katalog sisi CABANG — satu action untuk TIGA pemakai:
 * /cabang/produk (daftar + detail), /cabang/kalkulator (via prop fetchPage),
 * dan picker Isi Pesanan di /cabang/pesanan/baru. Kontrak bentuknya di
 * lib/catalog-query.ts (search/kategori dieksekusi database, halaman 60,
 * hasMore lewat baris sentinel). Menggantikan getPickerProductsBranch lama
 * (yang memuat ≤200 sekali jalan).
 *
 * Gerbang SAMA PERSIS dengan halaman katalog cabang (jangan dilonggarkan):
 * partner_users → sanci_catalog_access (gerbang sungguhan, dicek DULU) →
 * sanci_products (RLS sp_partner_read membatasi ke produk ACTIVE milik
 * katalog yang dibuka — zero-trust frontend, tanpa filter status di sini).
 * Error DB tidak pernah disamarkan jadi "belum dibuka"/"kosong" (LESSONS
 * #10) — tiap sebab punya status sendiri; client memetakannya ke kalimat
 * slice cabang (catalogNotOpenedMsg / errCatalogModuleInactive /
 * errProductListLoadFailed).
 *
 * Tanpa auth.getUser() (pola halaman kalkulator): RLS batasnya — sesi tak
 * sah membuat partner_users pulang kosong dan dilaporkan sebagai error biasa
 * (pemakai layar-layar ini pasti sudah login; kosong = ada yang tidak beres).
 *
 * `description` ikut di select karena modal detail /cabang/produk
 * menampilkannya; pemakai lain (kalkulator/picker) tinggal tidak memetakan
 * kolomnya — biaya kirimnya kecil dan lebih murah daripada memecah kontrak
 * jadi dua bentuk select.
 */

import { createClient } from "@/lib/supabase/server";
import { isMissingTableError } from "@/lib/orders-shared";
import {
  catalogIlikeOrFilter,
  catalogPageRange,
  fetchCatalogCategories,
  finishCatalogPage,
  normalizeCatalogPageInput,
  type CatalogPageInput,
  type CatalogPageOutcome,
  type CatalogProductRow,
} from "@/lib/catalog-query";
import { attachEffectivePrices, fetchEffectivePrices } from "@/lib/price-query";

export async function getCatalogPageBranch(input: CatalogPageInput): Promise<CatalogPageOutcome> {
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
    .select("id, name, code, category, description, photo_url, stock_status");
  // Semantik pencarian meniru memo `filtered` lama (substring nama ATAU kode
  // ATAU kategori, case-insensitive) — sanitasi di catalogIlikeOrFilter.
  const orFilter = catalogIlikeOrFilter(norm.q, ["name", "code", "category"]);
  if (orFilter) query = query.or(orFilter);
  if (norm.category) query = query.eq("category", norm.category);
  const range = catalogPageRange(norm.offset);
  const { data: products, error: productsError } = await query
    .order("name")
    .order("id") // tiebreak deterministik — offset paging tidak melompat/menduakan baris
    .range(range.from, range.to);
  if (productsError) {
    return isMissingTableError(productsError) ? { status: "module_inactive" } : { status: "error" };
  }

  const page = finishCatalogPage((products ?? []) as CatalogProductRow[]);

  // Harga efektif (0021: override partner sendiri → Harga Dasar SANCI) —
  // hanya kalau pemanggil memintanya (kalkulator/picker; layar jelajah
  // TIDAK). partner_id dari lookup partner_users di atas (LESSONS #6),
  // dan RLS pp_partner_read tetap penegak sesungguhnya. Gagal/tabel belum
  // ada (LESSONS #12) = tanpa field price — prefill mendegradasi diam-diam
  // ke perilaku lama (ketik manual), lihat lib/price-query.ts.
  let rows = page.products;
  if (norm.withPrices) {
    const prices = await fetchEffectivePrices(
      supabase,
      rows.map((p) => p.id),
      pu.partner_id
    );
    rows = attachEffectivePrices(rows, prices);
  }

  let categories: string[] | undefined;
  if (norm.withCategories) {
    // Gagal mengambil kategori = degradasi kosmetik (chip tidak tampil),
    // bukan kegagalan halaman — lihat catatan fetchCatalogCategories.
    categories = (await fetchCatalogCategories(supabase)) ?? undefined;
  }

  return { status: "ok", products: rows, hasMore: page.hasMore, categories };
}
