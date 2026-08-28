import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CATALOG_PAGE_SIZE, finishCatalogPage } from "@/lib/catalog-query";
import type { AdminCustomerRow } from "../actions-customers";
import AddCustomerButton from "./add-customer-button";
import MasterDataSection from "./master-data-section";
import PelangganListClient from "./pelanggan-list-client";
import { getAdminMessages } from "@/lib/i18n";

export const dynamic = "force-dynamic";

type QueryErr = { code?: string; message?: string } | null;

function isMissingTableErr(err: QueryErr): boolean {
  return !!err && err.code === "42P01";
}
function isMissingColumnErr(err: QueryErr): boolean {
  return !!err && err.code === "42703";
}

// Sengaja TIDAK memuat address/email: halaman ini tidak menampilkan keduanya
// (kolom yang tidak dipakai = biaya per baris). Bentuk barisnya sekarang milik
// getPelangganPageAdmin (actions-customers.ts) — sejak 2026-08-28 halaman ini
// hanya merender BATCH PERTAMA (60) dan pelanggan-list-client.tsx mencari/
// memuat lanjutan lewat action itu (kontrak lib/catalog-query.ts),
// menggantikan pola lama "SELECT semua baris + saring di memori + form GET".
type SourceRow = { id: string; code: string; label: string; status: string };
type SalesRow = { id: string; code: string; name: string; status: string };
type PartnerRow = { id: string; name: string };
type BranchRow = { id: string; name: string };

export default async function PelangganPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const m = await getAdminMessages();
  const sp = await searchParams;
  const tab = sp.tab === "sumber" || sp.tab === "sales" ? sp.tab : "list";

  const supabase = await createClient();

  // source_id/sales_staff_id (migrasi 0018) BISA belum ada sebagai kolom
  // kalau kodenya sudah naik lebih dulu (LESSONS #12) — coba SELECT lebar
  // dulu, turun ke SELECT sempit kalau 42703 (kolom tak dikenal), supaya
  // daftar pelanggan dasar (nama/telepon/kode lama) tetap tampil walau fitur
  // baru ini belum aktif. Urutan + range HARUS identik dengan
  // getPelangganPageAdmin — batch ini adalah halaman-0 kontrak yang sama.
  let customers: AdminCustomerRow[] = [];
  let customersErr: QueryErr = null;
  let customersHasMore = false;
  let codeFeatureOn = true;

  // Kelima pembacaan ini saling bebas, jadi berangkat bersama — dulu daftar
  // pelanggan menunggu selesai lebih dulu, baru empat sisanya jalan.
  const [wide, { data: sources, error: sourcesErr }, { data: sales, error: salesErr }, { data: partners }, { data: branches }] =
    await Promise.all([
      supabase
        .from("customers")
        .select(
          "id, full_name, phone, customer_code, source_id, sales_staff_id, created_via_partner_id, created_via_branch_id, created_at"
        )
        .order("created_at", { ascending: false })
        .order("id")
        .range(0, CATALOG_PAGE_SIZE),
      supabase.from("customer_sources").select("id, code, label, status").order("code"),
      supabase.from("sanci_sales_staff").select("id, code, name, status").order("code"),
      supabase.from("partners").select("id, name"),
      // partner_id tidak lagi diambil: label "Dibuat via" hanya butuh nama
      // cabangnya (kolom yang tidak dipakai = biaya per baris).
      supabase.from("partner_branches").select("id, name"),
    ]);

  // Percobaan ulang yang sempit hanya terjadi kalau 0018 belum dijalankan
  // (42703) — kasus langka, jadi boleh tetap berurutan di sini.
  if (wide.error && isMissingColumnErr(wide.error)) {
    codeFeatureOn = false;
    const narrow = await supabase
      .from("customers")
      .select("id, full_name, phone, customer_code, created_via_partner_id, created_via_branch_id, created_at")
      .order("created_at", { ascending: false })
      .order("id")
      .range(0, CATALOG_PAGE_SIZE);
    customersErr = narrow.error;
    const page = finishCatalogPage(
      ((narrow.data ?? []) as Omit<AdminCustomerRow, "source_id" | "sales_staff_id">[]).map((c) => ({
        ...c,
        source_id: null,
        sales_staff_id: null,
      }))
    );
    customers = page.products;
    customersHasMore = page.hasMore;
  } else {
    customersErr = wide.error;
    const page = finishCatalogPage((wide.data ?? []) as AdminCustomerRow[]);
    customers = page.products;
    customersHasMore = page.hasMore;
  }

  const migrationMissing = isMissingTableErr(sourcesErr) || isMissingTableErr(salesErr) || !codeFeatureOn;

  const activeSources = ((sources ?? []) as SourceRow[]).filter((s) => s.status === "ACTIVE");
  const activeSales = ((sales ?? []) as SalesRow[]).filter((s) => s.status === "ACTIVE");

  const tabs = [
    { key: "list", label: m.admin.customerTabList },
    { key: "sumber", label: m.admin.customerTabSources },
    { key: "sales", label: m.admin.customerTabSales },
  ];

  return (
    <div>
      <div className="worktop">
        <h1>{m.common.customer}</h1>
        {tab === "list" && (
          <AddCustomerButton
            sources={activeSources.map((s) => ({ id: s.id, code: s.code, label: s.label }))}
            sales={activeSales.map((s) => ({ id: s.id, code: s.code, name: s.name }))}
            codeFeatureOn={codeFeatureOn}
          />
        )}
      </div>

      {/* <Link>, bukan <a>: lihat catatan yang sama di partners/[id]/page.tsx. */}
      <div className="tabs">
        {tabs.map((t) => (
          <Link key={t.key} href={`/admin/pelanggan?tab=${t.key}`} className={`tab${tab === t.key ? " on" : ""}`}>
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "list" &&
        (customersErr ? (
          <div className="card" style={{ margin: 0 }}>
            <div className="err">{m.common.errorLoad}</div>
          </div>
        ) : (
          <PelangganListClient
            initialCustomers={customers}
            initialHasMore={customersHasMore}
            sources={((sources ?? []) as SourceRow[]).map((s) => ({ id: s.id, label: s.label }))}
            sales={((sales ?? []) as SalesRow[]).map((s) => ({ id: s.id, name: s.name }))}
            partners={((partners ?? []) as PartnerRow[]).map((p) => ({ id: p.id, name: p.name }))}
            branches={((branches ?? []) as BranchRow[]).map((b) => ({ id: b.id, name: b.name }))}
          />
        ))}

      {tab === "sumber" && (
        <MasterDataSection
          kind="source"
          migrationMissing={migrationMissing}
          rows={(sources ?? []).map((s: SourceRow) => ({ id: s.id, code: s.code, text: s.label, status: s.status }))}
        />
      )}

      {tab === "sales" && (
        <MasterDataSection
          kind="sales"
          migrationMissing={migrationMissing}
          rows={(sales ?? []).map((s: SalesRow) => ({ id: s.id, code: s.code, text: s.name, status: s.status }))}
        />
      )}

      {migrationMissing && tab === "list" && (
        <p className="footnote">{m.admin.customerCodeMigrationMsg}</p>
      )}
    </div>
  );
}
