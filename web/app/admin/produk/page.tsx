import { createClient } from "@/lib/supabase/server";
import { CATALOG_PAGE_SIZE, fetchCatalogCategories, finishCatalogPage } from "@/lib/catalog-query";
import { attachAdminBasePrices } from "@/lib/price-query";
import { getAdminMessages } from "@/lib/i18n";
import type { AdminProdukRow } from "../catalog-actions";
import ProdukAdminClient from "./produk-admin-client";

export const dynamic = "force-dynamic";

function isMissingTableErr(err: { code?: string } | null): boolean {
  return !!err && err.code === "42P01";
}

/**
 * /admin/produk — sejak 2026-08-26 pencarian & filter dieksekusi DATABASE
 * dengan batch 60 + "Muat Lebih Banyak" (kontrak lib/catalog-query.ts):
 * server merender BATCH PERTAMA (60) supaya halaman langsung terisi, lalu
 * produk-admin-client.tsx mencari/memuat lanjutan lewat getProdukPageAdmin.
 * Menggantikan pola lama "SELECT semua baris + saring di memori + form GET".
 *
 * Layar ini tetap menampilkan SEMUA status (ACTIVE + INACTIVE) — beda
 * sengaja dari kalkulator/picker admin yang ACTIVE-only. Select-nya tidak
 * lagi membawa created_at/updated_at (audit 2026-08-22: diambil tapi tidak
 * pernah dirender); `description` TETAP ikut karena modal Ubah
 * (product-actions.tsx) memakainya sebagai prefill.
 */
export default async function ProdukPage() {
  const m = await getAdminMessages();
  const supabase = await createClient();

  // Batch pertama + daftar kategori lengkap dalam satu gelombang (pola audit
  // kecepatan 2026-08-22 #6/#7). Kegagalan query kategori = dropdown kategori
  // tidak tampil (degradasi kosmetik, lihat fetchCatalogCategories).
  const [{ data: products, error }, categories] = await Promise.all([
    supabase
      .from("sanci_products")
      .select("id, name, code, category, description, photo_url, stock_status, status")
      .order("name")
      .order("id")
      .range(0, CATALOG_PAGE_SIZE),
    fetchCatalogCategories(supabase),
  ]);

  // sanci_products bisa saja belum ada (migrasi 0010 dijalankan terpisah dari
  // kode — LESSONS #12). Ini menggantikan SELURUH isi halaman, bukan cuma
  // tabelnya, karena tanpa tabel itu tidak ada apa pun yang bisa ditampilkan.
  if (isMissingTableErr(error)) {
    return (
      <div>
        <div className="worktop">
          <h1>{m.common.product}</h1>
        </div>
        <div className="card emptybox">{m.admin.catalogMigrationMsg}</div>
      </div>
    );
  }
  if (error) {
    return (
      <div>
        <div className="worktop">
          <h1>{m.common.product}</h1>
        </div>
        <div className="card" style={{ margin: 0 }}>
          <div className="err">{m.common.errorLoad}</div>
        </div>
      </div>
    );
  }

  const page = finishCatalogPage((products ?? []) as AdminProdukRow[]);
  // Harga Dasar SANCI untuk kartu (permintaan owner 2026-08-26) — kontrak
  // tiga keadaan di attachAdminBasePrices; gagal ≠ "belum ada harga".
  const withPrices = await attachAdminBasePrices(supabase, page.products);

  return (
    <ProdukAdminClient
      initialProducts={withPrices}
      initialHasMore={page.hasMore}
      categories={categories ?? []}
    />
  );
}
