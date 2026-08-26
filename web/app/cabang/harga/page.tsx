import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isMissingTableError } from "@/lib/orders-shared";
import type { StockStatus } from "@/lib/catalog-shared";
import { CATALOG_PAGE_SIZE, fetchCatalogCategories, finishCatalogPage } from "@/lib/catalog-query";
import { getCabangMessages, type CabangMessages } from "@/lib/i18n";
import HargaClient from "./harga-client";
import type { HargaRow } from "./actions";

export const dynamic = "force-dynamic";

/**
 * "Harga Normal" (/cabang/harga, migration 0021) — daftar harga jual
 * normal toko ini per produk katalog. Nama halaman keputusan owner
 * (rencana 0021 §"Owner 已定案" C): harga jual NORMAL ke pelanggan,
 * sebelum diskon — GLOSSARY: Harga Normal / Normal price / 标准售价;
 * pembandingnya "Harga Dasar SANCI" (baris dasar milik SANCI). JANGAN
 * dicampur dengan "Penawaran SANCI" (0013) — itu nilai penawaran TINGKAT
 * PESANAN, bukan harga produk.
 *
 * Gerbang + tiga-keadaan SAMA dengan /cabang/produk & /cabang/kalkulator
 * (LESSONS #10 — katalog belum dibuka ≠ error DB ≠ kosong): partner_users
 * → sanci_catalog_access → sanci_products (RLS). Batch pertama (60)
 * dirender server; pencarian/kategori/muat-lebih lewat getHargaPageBranch
 * (kontrak lib/catalog-query.ts).
 */

type CatalogAccessRow = { enabled: boolean };
type ProductQueryRow = {
  id: string;
  name: string;
  code: string | null;
  category: string | null;
  photo_url: string | null;
  stock_status: StockStatus;
};
type PriceQueryRow = { product_id: string; partner_id: string | null; price: number };

function BackRow({ m }: { m: CabangMessages }) {
  return (
    <div className="backrow">
      <Link href="/cabang" className="linkbtn">
        {m.cabang.navBackHome}
      </Link>
    </div>
  );
}

export default async function HargaPage() {
  const m = await getCabangMessages();
  const supabase = await createClient();

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
          <Link href="/cabang/harga" className="btn sm">
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
        <h2 className="mtitle">{m.cabang.hargaPageTitle}</h2>
        <div className="card">
          <div className="banner info">{m.cabang.catalogNotOpenedMsg}</div>
        </div>
      </main>
    );
  }

  // Batch pertama: produk (RLS sp_partner_read — ACTIVE + katalog terbuka)
  // + kategori lengkap. Query harga menunggu daftar id, jadi berurutan.
  const [{ data: products, error: productsError }, categories] = await Promise.all([
    supabase
      .from("sanci_products")
      .select("id, name, code, category, photo_url, stock_status")
      .order("name")
      .order("id")
      .range(0, CATALOG_PAGE_SIZE),
    fetchCatalogCategories(supabase),
  ]);

  if (productsError) {
    if (isMissingTableError(productsError)) {
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
          <div className="err">{m.cabang.errProductListLoadFailed}</div>
          <Link href="/cabang/harga" className="btn sm">
            {m.common.retry}
          </Link>
        </div>
      </main>
    );
  }

  const page = finishCatalogPage((products ?? []) as ProductQueryRow[]);

  // Harga dasar + override toko ini untuk batch pertama — RLS
  // pp_partner_read (0021) membatasi ke "dasar + milik sendiri". Tabel
  // belum ada (42P01, migrasi 0021 belum jalan) = keadaan sendiri, BUKAN
  // "belum ada harga" (LESSONS #10/#12) — halaman ini isinya harga, tidak
  // ada mode degradasi tanpa tabelnya.
  const basePrices = new Map<string, number>();
  const myPrices = new Map<string, number>();
  if (page.products.length > 0) {
    const { data: priceRows, error: priceError } = await supabase
      .from("product_prices")
      .select("product_id, partner_id, price")
      .in(
        "product_id",
        page.products.map((p) => p.id)
      );
    if (priceError) {
      if (isMissingTableError(priceError)) {
        return (
          <main className="pwrap">
            <BackRow m={m} />
            <h2 className="mtitle">{m.cabang.hargaPageTitle}</h2>
            <div className="card">
              <div className="banner bad">{m.cabang.hargaModuleInactiveMsg}</div>
            </div>
          </main>
        );
      }
      return (
        <main className="pwrap">
          <BackRow m={m} />
          <div className="card">
            <div className="err">{m.cabang.errProductListLoadFailed}</div>
            <Link href="/cabang/harga" className="btn sm">
              {m.common.retry}
            </Link>
          </div>
        </main>
      );
    }
    for (const row of (priceRows ?? []) as PriceQueryRow[]) {
      if (row.partner_id === null) basePrices.set(row.product_id, row.price);
      else myPrices.set(row.product_id, row.price);
    }
  }

  const rows: HargaRow[] = page.products.map((p) => ({
    ...p,
    base_price: basePrices.get(p.id) ?? null,
    my_price: myPrices.get(p.id) ?? null,
  }));

  return (
    <main className="pwrap">
      <BackRow m={m} />
      <h2 className="mtitle">{m.cabang.hargaPageTitle}</h2>
      <div className="banner info">{m.cabang.hargaIntroNote}</div>
      <HargaClient
        initialProducts={rows}
        initialHasMore={page.hasMore}
        initialCategories={categories ?? []}
      />
    </main>
  );
}
