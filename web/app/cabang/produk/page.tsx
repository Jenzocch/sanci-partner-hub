import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isMissingTableError } from "@/lib/orders-shared";
import type { StockStatus } from "@/lib/catalog-shared";
import { getCabangMessages, type CabangMessages } from "@/lib/i18n";
import ProdukListClient, { type ProdukItem } from "./produk-list-client";

export const dynamic = "force-dynamic";

type CatalogAccessRow = { enabled: boolean };
type ProductQueryRow = {
  id: string;
  name: string;
  code: string | null;
  category: string | null;
  description: string | null;
  photo_url: string | null;
  stock_status: StockStatus;
};

function BackRow({ m }: { m: CabangMessages }) {
  return (
    <div className="backrow">
      <Link href="/cabang" className="linkbtn">
        {m.cabang.navBackHome}
      </Link>
    </div>
  );
}

export default async function ProdukPage() {
  const m = await getCabangMessages();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

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

  // sanci_catalog_access: baris untuk partner ini menandai apakah SANCI sudah
  // membuka katalog ke toko ini. RLS sudah membatasi baris ke partner sendiri
  // (kontrak DB slice 5) — filter eq(partner_id) di sini murni kejelasan
  // query, bukan boundary keamanan tambahan.
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
          <Link href="/cabang/produk" className="btn sm">
            {m.common.retry}
          </Link>
        </div>
      </main>
    );
  }

  const catalogAccess = access as CatalogAccessRow | null;

  // Tidak ada baris ATAU enabled=false = katalog BELUM dibuka SANCI untuk
  // toko ini — beda dari "dibuka tapi kosong" di bawah (kontrak DB slice 5).
  if (!catalogAccess?.enabled) {
    return (
      <main className="pwrap">
        <BackRow m={m} />
        <h2 className="mtitle">{m.cabang.homeProducts}</h2>
        <div className="card">
          <div className="banner info">{m.cabang.catalogNotOpenedMsg}</div>
        </div>
      </main>
    );
  }

  // RLS pada sanci_products sudah membatasi ke produk status ACTIVE milik
  // katalog yang dibuka untuk partner ini — tidak ada filter tambahan di
  // sini (zero-trust frontend: query langsung pakai hasil RLS, LESSONS).
  const { data: products, error: productsError } = await supabase
    .from("sanci_products")
    .select("id, name, code, category, description, photo_url, stock_status")
    .order("name")
    .limit(200);

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
          <Link href="/cabang/produk" className="btn sm">
            {m.common.retry}
          </Link>
        </div>
      </main>
    );
  }

  const items: ProdukItem[] = ((products ?? []) as ProductQueryRow[]).map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    category: p.category,
    description: p.description,
    photoUrl: p.photo_url,
    stockStatus: p.stock_status,
  }));

  return (
    <main className="pwrap">
      <BackRow m={m} />
      <h2 className="mtitle">{m.cabang.homeProducts}</h2>
      <ProdukListClient items={items} />
    </main>
  );
}
