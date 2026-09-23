import Link from "next/link";
import { getAdminMessages } from "@/lib/i18n";
import { retryHref } from "@/lib/retry-href";
import { catatGagal } from "@/lib/safe-write";
import {
  byBranch,
  parseBranchSort,
  reportQueryString,
  scopeToParam,
  totalOf,
  type BranchSort,
} from "@/lib/sales-report-shared";
import { MetricCells, MetricHeads, RangeLine, ReportFilters, ReportFootnotes } from "@/lib/sales-report-view";
import AnalisisTabs from "../tabs";
import { loadAdminReport } from "../report-data";
import ScopeSelect from "../scope-select";

export const dynamic = "force-dynamic";

/**
 * Tab "Per Cabang" (/admin/analisis/cabang) — angka Laporan Penjualan yang
 * SAMA dengan tab "Laporan" (migration 0033), dijumlah lintas periode dan
 * dipecah satu baris per partner/cabang. Urutan lewat tautan (nol JS),
 * default Penjualan terbesar (owner: "sortable by amount"). Data, cakupan
 * dan berkas Excel berasal dari pemuat yang sama (report-data.ts).
 */
export default async function AdminSalesByBranchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const m = await getAdminMessages();
  const sp = await searchParams;
  const d = await loadAdminReport(sp);
  const c = m.common;
  const path = "/admin/analisis/cabang";
  const sort = parseBranchSort(typeof sp.sort === "string" ? sp.sort : undefined);
  const keep = { scope: scopeToParam(d.scope), sort: sort === "sales" ? "" : sort };
  const rows = d.result.kind === "ok" ? d.result.rows : [];
  const total = totalOf(rows);
  // LESSONS #53: error generik membawa kode yang sama di layar dan di log.
  const kode = d.result.kind === "error" ? catatGagal("sales_report_admin_branch", { error: d.result.error }) : null;
  const branches = byBranch(rows, sort);

  const head = (
    <>
      <div className="worktop">
        <h1>{m.admin.navAnalytics}</h1>
      </div>
      <AnalisisTabs active="cabang" m={m} />
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

  const sorts: { key: BranchSort; label: string }[] = [
    { key: "sales", label: m.admin.reportSortSales },
    { key: "orders", label: m.admin.reportSortOrders },
    { key: "outstanding", label: m.admin.reportSortOutstanding },
    { key: "name", label: m.admin.reportSortName },
  ];

  return (
    <div>
      {head}
      <ReportFilters
        c={c}
        path={path}
        params={d.params}
        keep={keep}
        scopeControl={<ScopeSelect m={m} scope={d.scope} partners={d.partners} branches={d.branches} />}
        exportHref={`/admin/analisis/laporan/export?${reportQueryString(d.params, { scope: keep.scope })}`}
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
      ) : branches.length === 0 ? (
        <div className="card emptybox">{c.reportEmpty}</div>
      ) : (
        <>
          <div className="searchrow" style={{ alignItems: "center" }}>
            <span className="small muted">{m.admin.reportSortLabel}</span>
            <div className="segmented" role="group" aria-label={m.admin.reportSortLabel}>
              {sorts.map((s) => (
                <Link
                  key={s.key}
                  href={`${path}?${reportQueryString(d.params, { scope: keep.scope, sort: s.key === "sales" ? "" : s.key })}`}
                  className={`seg${sort === s.key ? " on" : ""}`}
                >
                  {s.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>{c.reportColPartner}</th>
                  <th>{c.reportColBranch}</th>
                  <MetricHeads c={c} includeInvoice />
                </tr>
              </thead>
              <tbody>
                {branches.map((b) => (
                  <tr key={b.branchId}>
                    <td>
                      {b.partnerName} {b.partnerCode && <span className="code">{b.partnerCode}</span>}
                    </td>
                    <td>
                      {b.branchName} {b.branchCode && <span className="code">{b.branchCode}</span>}
                    </td>
                    <MetricCells m={b} includeInvoice />
                  </tr>
                ))}
                <tr>
                  <td colSpan={2}>
                    <strong>{c.reportTotal}</strong>
                  </td>
                  <MetricCells m={total} includeInvoice />
                </tr>
              </tbody>
            </table>
          </div>
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
