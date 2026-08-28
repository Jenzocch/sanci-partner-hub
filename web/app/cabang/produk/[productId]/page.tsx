import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isMissingTableError } from "@/lib/orders-shared";
import type { StockStatus } from "@/lib/catalog-shared";
import { fetchEffectivePrices } from "@/lib/price-query";
import { getCabangMessages, type CabangMessages } from "@/lib/i18n";
import ProdukDetailClient, { type ProdukDetailItem, type GalleryPhoto } from "./produk-detail-client";

export const dynamic = "force-dynamic";

type CatalogAccessRow = { enabled: boolean };
type ProductDetailRow = {
  id: string;
  name: string;
  code: string | null;
  category: string | null;
  description: string | null;
  /** Ukuran produk (0024) — teks bebas, boleh null. */
  size: string | null;
  photo_url: string | null;
  stock_status: StockStatus;
  status: "ACTIVE" | "INACTIVE";
};

function BackRow({ m }: { m: CabangMessages }) {
  return (
    <div className="backrow">
      <Link href="/cabang/produk" className="linkbtn">
        {m.cabang.navBackProducts}
      </Link>
    </div>
  );
}

/**
 * Detail produk sisi cabang (migration 0022) — gerbangnya SAMA PERSIS dengan
 * /cabang/produk (page.tsx sebelah): akun toko wajib ada, katalog SANCI
 * harus dibuka untuk toko ini, baru produk boleh dibaca. Produk yang tidak
 * ada ATAU berstatus INACTIVE → notFound() sungguhan (BEDA dari halaman
 * publik /p/[productId] yang menampilkan kalimat "Produk tidak tersedia" —
 * di sini pengguna sudah login staf toko, 404 standar aplikasi cukup).
 */
export default async function ProdukDetailPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  const m = await getCabangMessages();
  const supabase = await createClient();

  // Pola identik produk/page.tsx: tanpa auth.getUser() terpisah (RLS adalah
  // batasnya, LESSONS #5); error ≠ kosong (LESSONS #10).
  const { data: pu, error: puError } = await supabase
    .from("partner_users")
    .select("partner_id")
    .maybeSingle();
  if (puError) {
    return (
      <main className="pwrap">
        <BackRow m={m} />
        <div className="card">
          <div className="err">{m.cabang.errAccountLoad}</div>
        </div>
      </main>
    );
  }
  if (!pu) redirect("/");

  const { data: access, error: accessError } = await supabase
    .from("sanci_catalog_access")
    .select("enabled")
    .eq("partner_id", pu.partner_id)
    .maybeSingle();

  if (accessError) {
    if (isMissingTableError(accessError)) {
      return (
        <main className="pwrap">
          <BackRow m={m} />
          <div className="card">
            <div className="banner bad">{m.cabang.errCatalogModuleInactive}</div>
          </div>
        </main>
      );
    }
    return (
      <main className="pwrap">
        <BackRow m={m} />
        <div className="card">
          <div className="err">{m.cabang.errCatalogStatusLoadFailed}</div>
          <Link href={`/cabang/produk/${productId}`} className="btn sm">
            {m.common.retry}
          </Link>
        </div>
      </main>
    );
  }

  const catalogAccess = access as CatalogAccessRow | null;
  if (!catalogAccess?.enabled) {
    return (
      <main className="pwrap">
        <BackRow m={m} />
        <div className="card">
          <div className="banner info">{m.cabang.catalogNotOpenedMsg}</div>
        </div>
      </main>
    );
  }

  // RLS sp_partner_read (0010) sudah membatasi ke produk ACTIVE di katalog
  // yang terbuka untuk partner ini — tidak ada filter status tambahan di
  // sini (zero-trust frontend). Galeri (product_photos, 0022) dan harga
  // efektif (product_prices, 0021) tidak saling bergantung dengan produk
  // utama SELAIN butuh product.id-nya — tapi id itu sudah ada dari param
  // rute, jadi ketiganya dijalankan berbarengan (audit kecepatan 2026-08-22,
  // pola yang sama dengan halaman lain).
  const [{ data: product, error: productError }, { data: photosData, error: photosError }, prices] =
    await Promise.all([
      supabase
        .from("sanci_products")
        .select("id, name, code, category, description, size, photo_url, stock_status, status")
        .eq("id", productId)
        .maybeSingle(),
      supabase
        .from("product_photos")
        .select("id, photo_url")
        .eq("product_id", productId)
        .order("sort_order")
        .order("created_at")
        .order("id"),
      fetchEffectivePrices(supabase, [productId], pu.partner_id),
    ]);

  if (productError) {
    if (isMissingTableError(productError)) {
      return (
        <main className="pwrap">
          <BackRow m={m} />
          <div className="card">
            <div className="banner bad">{m.cabang.errCatalogModuleInactive}</div>
          </div>
        </main>
      );
    }
    return (
      <main className="pwrap">
        <BackRow m={m} />
        <div className="card">
          <div className="err">{m.cabang.errProductDetailLoadFailed}</div>
          <Link href={`/cabang/produk/${productId}`} className="btn sm">
            {m.common.retry}
          </Link>
        </div>
      </main>
    );
  }
  if (!product) notFound();

  const row = product as ProductDetailRow;

  // Galeri: kegagalan query DEGRADASI KOSMETIK (foto sampul + info produk
  // tetap tampil) — bukan kegagalan halaman. sesuai catatan lib/price-
  // query.ts: harga "prefill"-style di layar TAMPILAN ini (bukan layar
  // kelola Harga Normal) mendegradasi diam-diam saat gagal/tabel belum ada
  // — tidak menampilkan Rp 0, tidak menampilkan baris harga sama sekali.
  const gallery: GalleryPhoto[] = photosError ? [] : ((photosData ?? []) as GalleryPhoto[]);
  const price = prices?.get(productId)?.price ?? null;

  // URL halaman publik dibangun dari host request SUNGGUHAN (bukan domain
  // ditulis statis) — supaya link WhatsApp benar baik dari *.vercel.app
  // (preview) maupun partner.sanci.co.id (produksi) tanpa kode ini tahu
  // domainnya lebih dulu.
  const h = await headers();
  const host = h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const publicUrl = host ? `${proto}://${host}/p/${row.id}` : `/p/${row.id}`;

  const item: ProdukDetailItem = {
    id: row.id,
    name: row.name,
    code: row.code,
    category: row.category,
    description: row.description,
    size: row.size,
    photoUrl: row.photo_url,
    stockStatus: row.stock_status,
    price,
    publicUrl,
  };

  return (
    <main className="pwrap">
      <BackRow m={m} />
      <ProdukDetailClient item={item} gallery={gallery} />
    </main>
  );
}
