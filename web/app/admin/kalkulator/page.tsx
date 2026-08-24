import { createClient } from "@/lib/supabase/server";
import type { StockStatus } from "@/lib/catalog-shared";
import { getAdminMessages } from "@/lib/i18n";
import KalkulatorClient, { type KalkulatorProduct } from "@/lib/kalkulator-client";

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

  // Sama dengan query /cabang/kalkulator (order by name, limit 200) supaya
  // kedua kalkulator menampilkan katalog dengan cara yang sama — bedanya
  // hanya filter status eksplisit (lihat catatan #1 di atas).
  const { data: products, error } = await supabase
    .from("sanci_products")
    .select("id, name, code, category, photo_url, stock_status")
    .eq("status", "ACTIVE")
    .order("name")
    .limit(200);

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

  const items: KalkulatorProduct[] = ((products ?? []) as ProductQueryRow[]).map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    category: p.category,
    photoUrl: p.photo_url,
    stockStatus: p.stock_status,
  }));

  return (
    <div>
      <div className="worktop">
        <h1>{m.common.calcPageTitle}</h1>
      </div>
      {/* .limit(200) di atas bisa memotong diam-diam (audit 2026-08-22 #11). */}
      {items.length === 200 && <div className="banner warn">{m.common.catalogListCappedMsg}</div>}
      <div className="banner info">{m.admin.calcAdminIntroNote}</div>
      <KalkulatorClient
        products={items}
        area="admin"
        convert={{
          cta: m.admin.calcAdminConvertCta,
          scopeNote: m.admin.calcAdminConvertScopeNote,
          href: "/admin/orders/baru",
        }}
      />
    </div>
  );
}
