import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminMessages } from "@/lib/i18n";
import type { StockStatus } from "@/lib/catalog-shared";
import { CATALOG_PAGE_SIZE, finishCatalogPage } from "@/lib/catalog-query";
import PackageItemsClient, { type PackageItem, type CatalogProduct } from "./package-items-client";

export const dynamic = "force-dynamic";

function isMissingTableErr(err: { code?: string } | null): boolean {
  return !!err && err.code === "42P01";
}

/**
 * Isi Package — layar admin untuk menyusun komponen produk sebuah Package
 * dari katalog SANCI sungguhan (migrasi 0012).
 */
export default async function PackageItemsPage({
  params,
}: {
  params: Promise<{ id: string; packageId: string }>;
}) {
  const { id, packageId } = await params;
  const m = await getAdminMessages();
  const supabase = await createClient();

  // Keempat pembacaan halaman ini hanya butuh id/packageId dari param rute —
  // tidak ada yang bergantung hasil satu sama lain, jadi diambil dalam SATU
  // gelombang, bukan berurutan (audit kecepatan 2026-08-22, temuan #7).
  //
  // Paket DIAMBIL dengan dua syarat sekaligus: id-nya benar DAN ia milik
  // partner di alamat ini. Mencari hanya lewat id lalu membandingkan
  // partner_id di JavaScript akan membocorkan keberadaan paket partner lain
  // lewat beda pesan/waktu — notFound() untuk keduanya, tanpa membedakan.
  //
  // partner_package_items.product_id → sanci_products.id adalah foreign key
  // SUNGGUHAN, jadi embed PostgREST di sini sah. (Bandingkan LESSONS #24:
  // partner_users → partner_access_policies TIDAK punya FK antar keduanya
  // sehingga embed-nya gagal saat dijalankan — kasus ini berbeda, jangan
  // menerapkan pelajaran itu di tempat yang tidak berlaku.)
  //
  // Katalog untuk pemilih "tambah produk": BATCH PERTAMA (60) dirender
  // server; pencarian & batch berikut dieksekusi database lewat
  // getCatalogPageAdmin (kontrak lib/catalog-query.ts, 2026-08-26 —
  // menggantikan pola lama "muat utuh lalu saring di client"). Kalau query
  // batch pertamanya gagal, client menerima null dan memuat sendiri saat
  // mount (jalur retry dengan banner error — LESSONS #10, error ≠ kosong;
  // versi lama diam-diam menampilkan "katalog kosong" pada error ini).
  const [
    { data: pkg, error: pkgErr },
    { data: partner },
    { data: itemRows, error: itemsErr },
    { data: catalogRows, error: catalogErr },
  ] = await Promise.all([
    supabase
      .from("partner_packages")
      .select("id, name, code, description, status, partner_id")
      .eq("id", packageId)
      .eq("partner_id", id)
      .maybeSingle(),
    supabase
      .from("partners")
      .select("name")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("partner_package_items")
      .select("id, quantity, product_id, sanci_products:product_id(name, code, photo_url, status)")
      .eq("package_id", packageId)
      .order("created_at"),
    supabase
      .from("sanci_products")
      .select("id, name, code, photo_url, stock_status")
      .eq("status", "ACTIVE")
      .order("name")
      .order("id")
      .range(0, CATALOG_PAGE_SIZE),
  ]);

  if (isMissingTableErr(pkgErr)) {
    return (
      <div>
        <div className="worktop">
          <h1>{m.admin.packageItemsTitle}</h1>
        </div>
        <div className="card emptybox">{m.admin.packageMigrationMsg}</div>
      </div>
    );
  }
  if (pkgErr) {
    return (
      <div>
        <div className="worktop">
          <h1>{m.admin.packageItemsTitle}</h1>
        </div>
        <div className="card">
          <div className="err">{m.common.errorLoad}</div>
        </div>
      </div>
    );
  }
  if (!pkg) notFound();

  // Halaman ini bisa saja sudah tayang sebelum 0012 dijalankan di produksi
  // (LESSONS #12). Yang hilang hanya bagian isinya — identitas paketnya tetap
  // ditampilkan supaya admin tahu ia berada di layar yang benar.
  const itemsMissing = isMissingTableErr(itemsErr);
  const itemsOtherError = !!itemsErr && !itemsMissing;

  type EmbeddedProduct = { name: string; code: string | null; photo_url: string | null; status: string };
  type RawItem = {
    id: string;
    quantity: number;
    product_id: string;
    sanci_products: EmbeddedProduct | EmbeddedProduct[] | null;
  };

  const items: PackageItem[] = ((itemRows ?? []) as RawItem[]).map((r) => {
    // PostgREST memberi objek untuk relasi to-one, tapi tipe hasil generatednya
    // bisa berupa array — dinormalkan di satu tempat, bukan di komponen.
    const p = Array.isArray(r.sanci_products) ? r.sanci_products[0] : r.sanci_products;
    return {
      id: r.id,
      quantity: r.quantity,
      productId: r.product_id,
      productName: p?.name ?? "—",
      productCode: p?.code ?? null,
      photoUrl: p?.photo_url ?? null,
      productStatus: p?.status ?? "ACTIVE",
    };
  });

  const catalogPage = catalogErr
    ? null
    : finishCatalogPage(
        (catalogRows ?? []) as {
          id: string;
          name: string;
          code: string | null;
          photo_url: string | null;
          stock_status: StockStatus;
        }[]
      );
  const initialCatalog: { products: CatalogProduct[]; hasMore: boolean } | null = catalogPage
    ? {
        hasMore: catalogPage.hasMore,
        products: catalogPage.products.map((p) => ({
          id: p.id,
          name: p.name,
          code: p.code,
          photoUrl: p.photo_url,
          stockStatus: p.stock_status,
        })),
      }
    : null;

  return (
    <div>
      <div className="worktop">
        <div>
          <h1>{m.admin.packageItemsTitle}</h1>
          <div className="small muted">
            {pkg.name} · <span className="code">{pkg.code}</span>
            {partner?.name ? ` · ${partner.name}` : ""}
          </div>
        </div>
        <Link className="btn" href={`/admin/partners/${id}?tab=packages`}>
          {m.common.back}
        </Link>
      </div>

      {itemsMissing ? (
        <div className="card emptybox">{m.admin.packageItemMigrationMsg}</div>
      ) : itemsOtherError ? (
        <div className="card">
          <div className="err">{m.common.errorLoad}</div>
        </div>
      ) : (
        <PackageItemsClient packageId={packageId} items={items} initialCatalog={initialCatalog} />
      )}
    </div>
  );
}
