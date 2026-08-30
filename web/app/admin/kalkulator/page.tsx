import { createClient } from "@/lib/supabase/server";
import type { StockStatus } from "@/lib/catalog-shared";
import { CATALOG_PAGE_SIZE, fetchCatalogCategories, finishCatalogPage } from "@/lib/catalog-query";
import { fetchEffectivePrices } from "@/lib/price-query";
import { getAdminMessages } from "@/lib/i18n";
import KalkulatorClient, { type KalkulatorProduct } from "@/lib/kalkulator-client";
import { getCatalogPageAdmin } from "@/app/admin/catalog-actions";

export const dynamic = "force-dynamic";

/**
 * Kalkulator Penawaran sisi ADMIN (/admin/kalkulator) — 2026-08-22.
 *
 * Alat yang SAMA dengan /cabang/kalkulator (satu komponen bersama,
 * lib/kalkulator-client.tsx — matematika rantai diskon, keranjang, dan draf
 * localStorage semuanya identik), untuk akun platform_admins milik owner
 * tanpa harus berganti ke akun cabang.
 *
 * DUA perbedaan sengaja dari sisi cabang, keduanya keputusan slice ini:
 *
 *  1. SUMBER PRODUK: tanpa gerbang sanci_catalog_access — gerbang itu
 *     mengatur "katalog dibuka untuk partner mana", sedangkan admin adalah
 *     pemilik katalognya. Query di bawah mengambil SEMUA produk ACTIVE lewat
 *     RLS admin `sp_admin_all` (migration 0010) — pola yang sama dengan
 *     /admin/produk, hanya ditambah filter status=ACTIVE karena kalkulator
 *     menawar barang yang benar-benar bisa dipesan, bukan mengelola katalog
 *     (produk INACTIVE tampil di /admin/produk tapi TIDAK di sini; di sisi
 *     cabang penyaringan ACTIVE dilakukan RLS `sp_partner_read`).
 *  2. "Buat Pesanan" menuju FORM ADMIN (/admin/orders/baru, sejak
 *     2026-08-24 — v1 sengaja tanpa CTA, sekarang gap-nya ditutup):
 *     hand-off ditulis ke key localStorage area "admin" (terpisah dari key
 *     cabang, lib/calculator-shared.ts) dan dibaca form pesanan admin.
 *     Teks CTA/scope note pakai key slice admin sendiri — teks cabang
 *     menyebut izin/alur khas cabang yang tidak berlaku untuk admin.
 *
 * Auth: layout /admin sudah menggerbang platform_admins (redirect kalau
 * bukan); RLS tetap batas sesungguhnya (LESSONS #5) — halaman ini tidak
 * menulis apa pun ke database sama sekali.
 */

type ProductQueryRow = {
  id: string;
  name: string;
  code: string | null;
  category: string | null;
  photo_url: string | null;
  stock_status: StockStatus;
};

function isMissingTableErr(err: { code?: string } | null): boolean {
  return !!err && err.code === "42P01";
}

export default async function AdminKalkulatorPage() {
  const m = await getAdminMessages();
  const supabase = await createClient();

  // Sama dengan query /cabang/kalkulator (batch pertama 60, order name+id)
  // supaya kedua kalkulator menampilkan katalog dengan cara yang sama —
  // bedanya hanya filter status eksplisit (lihat catatan #1 di atas). Batch
  // berikut + pencarian/kategori dieksekusi server lewat getCatalogPageAdmin
  // (kontrak lib/catalog-query.ts — menggantikan .limit(200) lama). Daftar
  // kategori lengkap diambil sekali; kegagalannya = chip tidak tampil
  // (degradasi kosmetik, lihat fetchCatalogCategories).
  const [{ data: products, error }, categories] = await Promise.all([
    supabase
      .from("sanci_products")
      .select("id, name, code, category, photo_url, stock_status")
      .eq("status", "ACTIVE")
      .order("name")
      .order("id")
      .range(0, CATALOG_PAGE_SIZE),
    fetchCatalogCategories(supabase, { activeOnly: true }),
  ]);

  if (isMissingTableErr(error)) {
    return (
      <div>
        <div className="worktop">
          <h1>{m.common.calcPageTitle}</h1>
        </div>
        <div className="card emptybox">{m.admin.catalogMigrationMsg}</div>
      </div>
    );
  }
  if (error) {
    return (
      <div>
        <div className="worktop">
          <h1>{m.common.calcPageTitle}</h1>
        </div>
        <div className="card" style={{ margin: 0 }}>
          <div className="err">{m.common.errorLoad}</div>
        </div>
      </div>
    );
  }

  const page = finishCatalogPage((products ?? []) as ProductQueryRow[]);

  // Prefill Harga Dasar SANCI (0021) untuk batch pertama — kalkulator admin
  // TIDAK punya konteks partner (keputusan rencana 0021), jadi partnerId
  // null = hanya harga dasar. Batch berikut lewat getCatalogPageAdmin
  // (withPrices, tanpa pricePartnerId — jalur yang sama). Gagal/tabel
  // belum ada (LESSONS #12) = null → prefill degradasi ke perilaku lama.
  const prices = await fetchEffectivePrices(
    supabase,
    page.products.map((p) => p.id),
    null
  );
  const items: KalkulatorProduct[] = page.products.map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    category: p.category,
    photoUrl: p.photo_url,
    stockStatus: p.stock_status,
    price: prices?.get(p.id)?.price ?? null,
  }));

  return (
    <div>
      <div className="worktop">
        <h1>{m.common.calcPageTitle}</h1>
      </div>
      <div className="banner info">{m.admin.calcAdminIntroNote}</div>
      <KalkulatorClient
        initialProducts={items}
        initialHasMore={page.hasMore}
        initialCategories={categories ?? []}
        fetchPage={getCatalogPageAdmin}
        fetchMessages={{
          moduleInactive: m.admin.catalogMigrationMsg,
          loadFailed: m.common.errorLoad,
        }}
        area="admin"
        convert={{
          cta: m.admin.calcAdminConvertCta,
          scopeNote: m.admin.calcAdminConvertScopeNote,
          href: "/admin/orders/baru",
        }}
        proposal={{
          cta: m.admin.calcProposalCta,
          href: "/admin/proposal",
          saveFailed: m.admin.proposalSaveFailed,
        }}
      />
    </div>
  );
}
