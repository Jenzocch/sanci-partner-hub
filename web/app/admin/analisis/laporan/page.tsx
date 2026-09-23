import Link from "next/link";
import { getAdminMessages } from "@/lib/i18n";
import { retryHref } from "@/lib/retry-href";
import { catatGagal } from "@/lib/safe-write";
import { reportQueryString, scopeToParam, totalOf } from "@/lib/sales-report-shared";
import { PeriodTable, RangeLine, ReportFilters, ReportFootnotes, SummaryTiles } from "@/lib/sales-report-view";
import AnalisisTabs from "../tabs";
import { loadAdminReport } from "../report-data";
import ScopeSelect from "../scope-select";

export const dynamic = "force-dynamic";

/**
 * Tab "Laporan" (/admin/analisis/laporan) — Laporan Penjualan, migration
 * 0033 (owner 2026-09-23): petak ringkasan + tabel per periode. Semua
 * admin SANCI (tidak ada peran superadmin). Angka dari `fn_sales_report`
 * (SECURITY INVOKER — RLS admin meloloskan semua baris); cakupan
 * partner/cabang disaring di memori (report-data.ts).
 *
 * Tiga keadaan TIDAK disamakan (LESSONS #10/#12): fungsi belum ada =
 * "fitur belum aktif"; error lain = kartu error + "Coba lagi" yang
 * mempertahankan filter; nol baris = "belum ada pesanan".
 */
export default async function AdminSalesReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const m = await getAdminMessages();
  const sp = await searchParams;
  const d = await loadAdminReport(sp);
  const c = m.common;
  const path = "/admin/analisis/laporan";
  const keep = { scope: scopeToParam(d.scope) };
  const rows = d.result.kind === "ok" ? d.result.rows : [];
  const total = totalOf(rows);
  // LESSONS #53: error generik membawa kode yang sama di layar dan di log.
  const kode = d.result.kind === "error" ? catatGagal("sales_report_admin", { error: d.result.error }) : null;

  const head = (
    <>
      <div className="worktop">
        <h1>{m.admin.navAnalytics}</h1>
      </div>
      <AnalisisTabs active="laporan" m={m} />
    </>
  );

  if (d.result.kind === "featureOff") {
    return (
      <div>
        {head}
        <div className="card emptybox">{c.reportFeatureOff}</div>
      </div>
    );
  }

  return (
    <div>
      {head}
      <ReportFilters
        c={c}
        path={path}
        params={d.params}
        keep={keep}
        scopeControl={<ScopeSelect m={m} scope={d.scope} partners={d.partners} branches={d.branches} />}
        exportHref={`/admin/analisis/laporan/export?${reportQueryString(d.params, keep)}`}
      />
      {d.scopeListFailed && <div className="banner warn">{m.admin.reportScopeLoadFailed}</div>}
      <RangeLine c={c} params={d.params} />

      {d.result.kind === "error" ? (
        <div className="card" style={{ margin: 0 }}>
          <div className="err">
            {c.errorLoad} {kode && c.netReportCode.replace("{kode}", kode)}
          </div>
          <Link href={retryHref(path, sp)} className="btn sm">
            {c.retry}
          </Link>
        </div>
      ) : rows.length === 0 ? (
        <div className="card emptybox">{c.reportEmpty}</div>
      ) : (
        <>
          <SummaryTiles c={c} total={total} includeInvoice />
          <PeriodTable c={c} rows={rows} total={total} params={d.params} includeInvoice />
          <ReportFootnotes
            c={c}
            total={total}
            capped={d.result.kind === "ok" && d.result.capped}
            unpricedNote={m.admin.reportUnpricedNote}
            showDateBasis
          />
        </>
      )}
    </div>
  );
}
