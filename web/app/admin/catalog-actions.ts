"use server";

/**
 * Server Action katalog sisi ADMIN — kontrak bentuknya di
 * lib/catalog-query.ts (search/kategori dieksekusi database, halaman 60,
 * hasMore lewat baris sentinel). Dua action karena dua kebijakan status yang
 * SUDAH ADA dan dipertahankan apa adanya:
 *
 *   - getCatalogPageAdmin  : produk ACTIVE saja — kalkulator admin, picker
 *     Isi Pesanan admin, dan pemilih produk Package menawar/menyusun barang
 *     yang benar-benar bisa dipesan (keputusan slice 2026-08-22; INACTIVE
 *     tampil di /admin/produk, tidak di sini). Menggantikan
 *     getPickerProductsAdmin lama (yang memuat ≤200 sekali jalan).
 *   - getProdukPageAdmin   : SEMUA status — layar kelola /admin/produk memang
 *     harus melihat produk nonaktif. Select-nya lebih lebar (description +
 *     status) karena modal Ubah butuh prefill description dan kartunya
 *     menampilkan chip status; created_at/updated_at TIDAK ikut lagi (audit
 *     2026-08-22: diambil tapi tidak pernah dirender di layar mana pun).
 *
 * Verifikasi admin di depan memakai idiom actions-users.ts/actions-create-
 * order.ts (error DB ≠ "bukan admin", LESSONS #10); penegak sesungguhnya
 * tetap RLS sp_admin_all (0010). TANPA gerbang sanci_catalog_access — itu
 * gerbang "katalog dibuka untuk partner mana", admin pemilik katalognya.
 */

import { createClient } from "@/lib/supabase/server";
import { isMissingTableError } from "@/lib/orders-shared";
import type { ProductStatus, StockStatus } from "@/lib/catalog-shared";
import type { SupabaseServerClient } from "@/lib/order-create-shared";
import {
  catalogIlikeOrFilter,
  catalogPageRange,
  finishCatalogPage,
  normalizeCatalogPageInput,
  fetchCatalogCategories,
  type CatalogPageInput,
  type CatalogPageOutcome,
  type CatalogProductRow,
} from "@/lib/catalog-query";
import { attachAdminBasePrices, attachEffectivePrices, fetchEffectivePrices } from "@/lib/price-query";

/** Idiom verifikasi admin yang sama dengan actions-create-order.ts — untuk
 *  action baca-saja ini semua kegagalan cukup dipetakan ke "error". */
async function isAdminSession(supabase: SupabaseServerClient): Promise<boolean> {
  const { data: sesi, error: sesiErr } = await supabase.auth.getUser();
  if (sesiErr || !sesi?.user) return false;
  const { data: adminRow, error: adminErr } = await supabase
    .from("platform_admins")
    .select("auth_user_id")
    .eq("auth_user_id", sesi.user.id)
    .maybeSingle();
  if (adminErr || !adminRow) return false;
  return true;
}

/**
 * Input admin menambah DUA field opsional di atas kontrak bersama:
 *   - `matchCategory:false` membatasi pencarian ke nama/kode saja — dipakai
 *     pemilih produk Package, yang memo `filtered` lamanya memang tidak
 *     pernah mencocokkan kategori (placeholder-nya pun berbunyi "nama atau
 *     kode"). Kalkulator/picker memakai default (nama/kode/kategori, sama
 *     dengan cabang).
 *   - `pricePartnerId` (hanya berarti bersama `withPrices`, 0021): harga
 *     efektif dihitung untuk PARTNER TERPILIH itu (form pesanan admin —
 *     partnernya sudah dipilih di form). Kosong/absen = hanya Harga Dasar
 *     SANCI (kalkulator admin — tanpa konteks partner, keputusan rencana
 *     0021). Nilai ini dipakai murni sebagai filter baca di bawah sesi
 *     ADMIN (sudah diverifikasi isAdminSession + RLS pp_admin_all) — bukan
 *     kolom tulisan, jadi bukan permukaan penyalahgunaan LESSONS #6.
 */
export type AdminCatalogPageInput = CatalogPageInput & {
  matchCategory?: boolean;
  pricePartnerId?: string | null;
};

export async function getCatalogPageAdmin(input: AdminCatalogPageInput): Promise<CatalogPageOutcome> {
  const supabase = await createClient();
  if (!(await isAdminSession(supabase))) return { status: "error" };

  const norm = normalizeCatalogPageInput(input);
  let query = supabase
    .from("sanci_products")
    .select("id, name, code, category, photo_url, stock_status")
    .eq("status", "ACTIVE");
  const fields = input.matchCategory === false ? ["name", "code"] : ["name", "code", "category"];
  const orFilter = catalogIlikeOrFilter(norm.q, fields);
  if (orFilter) query = query.or(orFilter);
  if (norm.category) query = query.eq("category", norm.category);
  const range = catalogPageRange(norm.offset);
  const { data: products, error } = await query
    .order("name")
    .order("id") // tiebreak deterministik — offset paging tidak melompat/menduakan baris
    .range(range.from, range.to);
  if (error) {
    return isMissingTableError(error) ? { status: "module_inactive" } : { status: "error" };
  }

  const page = finishCatalogPage((products ?? []) as CatalogProductRow[]);

  // Harga efektif (0021) untuk prefill kalkulator/picker admin — lihat
  // catatan pricePartnerId di atas. Gagal/tabel belum ada (LESSONS #12) =
  // tanpa field price, prefill degradasi diam-diam (lib/price-query.ts).
  let rows = page.products;
  if (norm.withPrices) {
    const pricePartnerId =
      typeof input.pricePartnerId === "string" && input.pricePartnerId.trim() !== ""
        ? input.pricePartnerId
        : null;
    const prices = await fetchEffectivePrices(
      supabase,
      rows.map((p) => p.id),
      pricePartnerId
    );
    rows = attachEffectivePrices(rows, prices);
  }

  let categories: string[] | undefined;
  if (norm.withCategories) {
    categories = (await fetchCatalogCategories(supabase, { activeOnly: true })) ?? undefined;
  }

  return { status: "ok", products: rows, hasMore: page.hasMore, categories };
}

/* ------------------------------------------------------------------ *
 * /admin/produk — semua status + filter stok
 * ------------------------------------------------------------------ */

/** Baris produk layar kelola — persis kolom yang dirender kartu + dibutuhkan
 *  modal Ubah (ProductActions). Tanpa created_at/updated_at (tidak dirender). */
export type AdminProdukRow = {
  id: string;
  name: string;
  code: string | null;
  category: string | null;
  description: string | null;
  photo_url: string | null;
  stock_status: StockStatus;
  status: ProductStatus;
  /**
   * Harga Dasar SANCI untuk KARTU daftar (permintaan owner 2026-08-26:
   * harga langsung terlihat di /admin/produk, bukan hanya di modal Ubah).
   * Kontrak tiga keadaan ada di attachAdminBasePrices (lib/price-query.ts);
   * modal Ubah tetap memuat nilainya sendiri saat dibuka (nilai segar) —
   * kolom ini hanya untuk tampilan kartu.
   */
  base_price?: number | null;
};

export type AdminProdukPageInput = CatalogPageInput & { stock?: "ALL" | StockStatus };

export type AdminProdukPageOutcome =
  | { status: "ok"; products: AdminProdukRow[]; hasMore: boolean }
  | { status: "module_inactive" }
  | { status: "error" };

export async function getProdukPageAdmin(input: AdminProdukPageInput): Promise<AdminProdukPageOutcome> {
  const supabase = await createClient();
  if (!(await isAdminSession(supabase))) return { status: "error" };

  const norm = normalizeCatalogPageInput(input);
  const stock =
    input.stock === "AVAILABLE" || input.stock === "LIMITED" || input.stock === "OUT_OF_STOCK"
      ? input.stock
      : "ALL";

  let query = supabase
    .from("sanci_products")
    .select("id, name, code, category, description, photo_url, stock_status, status");
  // Pencarian layar ini meniru memo lamanya: nama ATAU kode saja (placeholder
  // admin memang lebih sempit dari versi cabang — lihat catatan di common.ts).
  const orFilter = catalogIlikeOrFilter(norm.q, ["name", "code"]);
  if (orFilter) query = query.or(orFilter);
  if (norm.category) query = query.eq("category", norm.category);
  if (stock !== "ALL") query = query.eq("stock_status", stock);
  const range = catalogPageRange(norm.offset);
  const { data: products, error } = await query
    .order("name")
    .order("id")
    .range(range.from, range.to);
  if (error) {
    return isMissingTableError(error) ? { status: "module_inactive" } : { status: "error" };
  }

  const page = finishCatalogPage((products ?? []) as AdminProdukRow[]);
  return {
    status: "ok",
    products: await attachAdminBasePrices(supabase, page.products),
    hasMore: page.hasMore,
  };
}
