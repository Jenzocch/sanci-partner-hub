import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isMissingTableError } from "@/lib/orders-shared";
import type { StockStatus } from "@/lib/catalog-shared";
import { getCabangMessages, type CabangMessages } from "@/lib/i18n";
import KalkulatorClient, { type KalkulatorProduct } from "@/lib/kalkulator-client";

export const dynamic = "force-dynamic";

/**
 * Kalkulator Penawaran (/cabang/kalkulator) — owner brief 2026-08-20.
 *
 * Sumber data produk IDENTIK dengan /cabang/produk (sanci_products status
 * ACTIVE, digerbang sanci_catalog_access) — kalkulator murni cara lain
 * memakai katalog yang sama, bukan sumber data baru. Kalau katalog belum
 * dibuka SANCI untuk toko ini, halaman ini menjelaskan dengan jelas (sama
 * prinsip dengan halaman Produk), bukan diam-diam kosong.
 *
 * DUA PENYIMPANGAN SENGAJA dari pola aplikasi lain, dikonfirmasi eksplisit
 * owner (bukan lubang audit — didokumentasikan di sini + FEATURES.md):
 *   1. Halaman ini TIDAK menulis apa pun ke database selagi dipakai — murni
 *      alat hitung lokal (lihat lib/calculator-shared.ts). Baris database
 *      baru HANYA muncul kalau staf menekan "Buat Pesanan" DAN benar-benar
 *      menyelesaikan pembuatan pesanan di /cabang/pesanan/baru — dan jalur
 *      itu tetap lewat Server Action + RLS yang sama seperti biasa.
 *   2. Rantai diskon (diskon/markup/potongan tunai) di sini TIDAK digerbang
 *      can_discount/can_edit_offer (0014/0015) — SEMUA cabang boleh
 *      memakainya untuk menghitung penawaran langsung ke pelanggan, terlepas
 *      dari izin mereka pada pesanan sungguhan. Ini aman karena tidak ada
 *      apa pun yang tersimpan ke order_sanci_offers dari sini — begitu
 *      dikonversi jadi pesanan, penerapan sungguhannya tetap lewat
 *      `setOrderOfferBranch` yang sama dengan OfferSection, yang masih
 *      menegakkan RLS/trigger 0014/0015 seperti biasa.
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

function BackRow({ m }: { m: CabangMessages }) {
  return (
    <div className="backrow">
      <Link href="/cabang" className="linkbtn">
        {m.cabang.navBackHome}
      </Link>
    </div>
  );
}

export default async function KalkulatorPage() {
  const m = await getCabangMessages();
  const supabase = await createClient();
  // Tanpa auth.getUser(): batas keamanannya RLS, bukan cek halaman (LESSONS
  // #5) — untuk pengunjung yang belum login, pembacaan partner_users ini
  // pulang kosong, jadi `!pu` → redirect sama persis; middleware sudah
  // menyegarkan sesi tiap navigasi. Beda error vs kosong TETAP dijaga
  // (LESSONS #10): error DB → kartu error, hanya hasil kosong di-redirect.
  // Gerbang sanci_catalog_access di bawah TETAP berurutan: itu gerbang
  // sungguhan, daftar produk baru boleh diambil setelah lolos.
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
          <Link href="/cabang/kalkulator" className="btn sm">
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
        <h2 className="mtitle">{m.common.calcPageTitle}</h2>
        <div className="card">
          <div className="banner info">{m.cabang.catalogNotOpenedMsg}</div>
        </div>
      </main>
    );
  }

  // RLS pada sanci_products sudah membatasi ke produk ACTIVE milik katalog
  // yang dibuka untuk partner ini (zero-trust frontend, sama seperti /produk).
  const { data: products, error: productsError } = await supabase
    .from("sanci_products")
    .select("id, name, code, category, photo_url, stock_status")
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
          <Link href="/cabang/kalkulator" className="btn sm">
            {m.common.retry}
          </Link>
        </div>
      </main>
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
    <main className="pwrap">
      <BackRow m={m} />
      <h2 className="mtitle">{m.common.calcPageTitle}</h2>
      <div className="banner info">{m.cabang.calcIntroNote}</div>
      {/* `convert` diisi HANYA di route cabang — teks CTA/scope note milik
          slice cabang (menyebut alur pesanan cabang), dan hand-off-nya memang
          dibaca /cabang/pesanan/baru. Route admin mengirim null (v1). */}
      <KalkulatorClient
        products={items}
        area="cabang"
        convert={{ cta: m.cabang.calcConvertCta, scopeNote: m.cabang.calcConvertScopeNote }}
      />
    </main>
  );
}
