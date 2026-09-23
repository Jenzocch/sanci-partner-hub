import Link from "next/link";
import type { ReactNode } from "react";
import type { CommonMessages } from "@/lib/i18n";
import { formatCalendarDate, formatIDR } from "@/lib/orders-shared";
import {
  byPeriod,
  formatPeriod,
  REPORT_ROW_CAP,
  type Metrics,
  type PresetKey,
  type ReportParams,
  type SalesReportRow,
} from "@/lib/sales-report-shared";

/**
 * Potongan tampilan Laporan Penjualan (0033) yang dipakai DUA area — admin
 * (/admin/analisis/laporan, /admin/analisis/cabang) dan cabang
 * (/cabang/analisis). Server component murni, NOL JavaScript di browser:
 * preset & granularity adalah TAUTAN (bukan tombol yang menunggu "Cari",
 * lih. kepala app/admin/orders/filter-segment.tsx — tombol yang tidak
 * langsung berlaku menipu staf), sedangkan tanggal/cakupan memakai form GET
 * biasa. Teks dari `common` (dipakai kedua area); yang khusus area dikirim
 * sebagai prop.
 */

type Q = Record<string, string>;

function href(path: string, q: Q): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v) qs.set(k, v);
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

const PRESETS: Exclude<PresetKey, "custom">[] = ["this_month", "last_month", "this_year", "last_year"];

function presetLabel(c: CommonMessages, p: Exclude<PresetKey, "custom">): string {
  switch (p) {
    case "this_month":
      return c.reportPresetThisMonth;
    case "last_month":
      return c.reportPresetLastMonth;
    case "this_year":
      return c.reportPresetThisYear;
    case "last_year":
      return c.reportPresetLastYear;
  }
}

export function ReportFilters({
  c,
  path,
  params,
  keep,
  scopeControl,
  exportHref,
}: {
  c: CommonMessages;
  path: string;
  params: ReportParams;
  /** Parameter lain halaman ini yang WAJIB ikut terbawa (scope, sort). */
  keep: Q;
  /** <select name="scope"> sisi admin — kalau ada, `scope` tidak dikirim sebagai hidden. */
  scopeControl?: ReactNode;
  exportHref: string;
}) {
  const base: Q = { gran: params.granularity, ...keep };
  const hiddenKeep = Object.entries(keep).filter(([k, v]) => v && !(scopeControl && k === "scope"));
  return (
    <>
      <div className="searchrow wide" style={{ alignItems: "center" }}>
        <div className="segmented" role="group" aria-label={c.reportPeriodLabel}>
          {PRESETS.map((p) => (
            <Link key={p} href={href(path, { ...base, preset: p })} className={`seg${params.preset === p ? " on" : ""}`}>
              {presetLabel(c, p)}
            </Link>
          ))}
          {params.preset === "custom" && <span className="seg on">{c.reportPresetCustom}</span>}
        </div>
        <div className="segmented" role="group" aria-label={c.reportGranularityLabel}>
          {(["month", "year"] as const).map((g) => (
            <Link
              key={g}
              href={
                params.preset === "custom"
                  ? href(path, { ...keep, preset: "custom", from: params.from, to: params.to, gran: g })
                  : href(path, { ...keep, preset: params.preset, gran: g })
              }
              className={`seg${params.granularity === g ? " on" : ""}`}
            >
              {g === "month" ? c.reportGranularityMonth : c.reportGranularityYear}
            </Link>
          ))}
        </div>
        {/* <a> biasa, BUKAN <Link>: tujuannya unduhan berkas dari Route
            Handler — prefetch RSC tidak berarti apa-apa di sana, dan justru
            akan memanggil RPC laporan untuk setiap tampilan halaman. */}
        <a href={exportHref} className="btn sm">
          {c.reportExportBtn}
        </a>
      </div>

      {/* Tanggal diisi awal dengan rentang yang sedang tampil + `preset`
          ikut sebagai hidden: parseReportParams menganggap tanggal yang
          DIUBAH sebagai pilihan tanggal sendiri (lib/sales-report-shared). */}
      <form className="searchrow wide" action={path} method="GET">
        <input type="hidden" name="preset" value={params.preset} />
        <input type="hidden" name="gran" value={params.granularity} />
        {hiddenKeep.map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        {scopeControl}
        <label className="small muted">
          {c.reportDateFromLabel + " "}
          <input type="date" name="from" defaultValue={params.from} className="filter-select" />
        </label>
        <label className="small muted">
          {c.reportDateToLabel + " "}
          <input type="date" name="to" defaultValue={params.to} className="filter-select" />
        </label>
        <button className="btn" type="submit">
          {c.reportApply}
        </button>
      </form>
      {params.invalidRange && <div className="banner warn">{c.reportInvalidRange}</div>}
    </>
  );
}

export function RangeLine({ c, params }: { c: CommonMessages; params: ReportParams }) {
  return (
    <p className="muted small" style={{ marginTop: 0 }}>
      {c.reportRangeLine
        .replace("{from}", formatCalendarDate(params.from, c.dateLocale))
        .replace("{to}", formatCalendarDate(params.to, c.dateLocale))}
    </p>
  );
}

/** Petak ringkasan — angka besar + label (pola .todotile /admin, tanpa tautan). */
export function SummaryTiles({ c, total, includeInvoice }: { c: CommonMessages; total: Metrics; includeInvoice: boolean }) {
  const tiles: { key: string; label: string; value: string }[] = [
    { key: "orders", label: c.reportColOrders, value: total.orders.toLocaleString("en-US") },
    { key: "sales", label: c.reportColSales, value: formatIDR(total.sales) },
    { key: "qty", label: c.reportColQty, value: total.qty.toLocaleString("en-US") },
    ...(includeInvoice ? [{ key: "inv", label: c.reportColInvoiced, value: formatIDR(total.invoiced) }] : []),
    { key: "paid", label: c.reportColPaid, value: formatIDR(total.paid) },
    { key: "out", label: c.reportColOutstanding, value: formatIDR(total.outstanding) },
  ];
  return (
    <div className="todorow" aria-label={c.reportSummaryTitle}>
      {tiles.map((t) => (
        <div key={t.key} className="todotile">
          <span className="todonum">{t.value}</span>
          <span className="todolabel">{t.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Sel angka satu baris metrik — urutan kolom SAMA dengan lembar Excel. */
export function MetricCells({ m, includeInvoice }: { m: Metrics; includeInvoice: boolean }) {
  return (
    <>
      <td className="ta-right num">{m.orders.toLocaleString("en-US")}</td>
      <td className="ta-right num">{formatIDR(m.sales)}</td>
      <td className="ta-right num">{m.qty.toLocaleString("en-US")}</td>
      {includeInvoice && <td className="ta-right num">{formatIDR(m.invoiced)}</td>}
      <td className="ta-right num">{formatIDR(m.paid)}</td>
      <td className="ta-right num">{formatIDR(m.outstanding)}</td>
    </>
  );
}

export function MetricHeads({ c, includeInvoice }: { c: CommonMessages; includeInvoice: boolean }) {
  return (
    <>
      <th className="ta-right">{c.reportColOrders}</th>
      <th className="ta-right">{c.reportColSales}</th>
      <th className="ta-right">{c.reportColQty}</th>
      {includeInvoice && <th className="ta-right">{c.reportColInvoiced}</th>}
      <th className="ta-right">{c.reportColPaid}</th>
      <th className="ta-right">{c.reportColOutstanding}</th>
    </>
  );
}

export function PeriodTable({
  c,
  rows,
  total,
  params,
  includeInvoice,
}: {
  c: CommonMessages;
  rows: SalesReportRow[];
  total: Metrics;
  params: ReportParams;
  includeInvoice: boolean;
}) {
  const periods = byPeriod(rows);
  return (
    <>
      <h2 style={{ margin: "8px 0 12px" }}>{c.reportPeriodTableTitle}</h2>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>{c.reportColPeriod}</th>
              <MetricHeads c={c} includeInvoice={includeInvoice} />
            </tr>
          </thead>
          <tbody>
            {periods.map((p) => (
              <tr key={p.periodStart}>
                <td>{formatPeriod(p.periodStart, params.granularity, c.dateLocale)}</td>
                <MetricCells m={p} includeInvoice={includeInvoice} />
              </tr>
            ))}
            <tr>
              <td>
                <strong>{c.reportTotal}</strong>
              </td>
              <MetricCells m={total} includeInvoice={includeInvoice} />
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

/** Catatan kaki: dasar tanggal, pesanan tanpa total pelanggan, hasil terpotong. */
export function ReportFootnotes({
  c,
  total,
  capped,
  unpricedNote,
  showDateBasis,
}: {
  c: CommonMessages;
  total: Metrics;
  capped: boolean;
  /** Teks khusus area (admin vs cabang punya penjelasan berbeda), berisi {n}. */
  unpricedNote: string;
  showDateBasis: boolean;
}) {
  return (
    <div className="footnote">
      {showDateBasis && <p style={{ margin: "0 0 6px" }}>{c.reportDateBasisNote}</p>}
      {total.unpriced > 0 && <p style={{ margin: "0 0 6px" }}>{unpricedNote.replace("{n}", String(total.unpriced))}</p>}
      {capped && <p style={{ margin: 0 }}>{c.reportCappedNote.replace("{n}", String(REPORT_ROW_CAP))}</p>}
    </div>
  );
}
