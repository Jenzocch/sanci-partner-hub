import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCabangMessages, type CabangMessages } from "@/lib/i18n";
import { retryHref } from "@/lib/retry-href";
import { catatGagal } from "@/lib/safe-write";
import { fetchSalesReport, parseReportParams, reportQueryString, totalOf } from "@/lib/sales-report-shared";
import { PeriodTable, RangeLine, ReportFilters, ReportFootnotes, SummaryTiles } from "@/lib/sales-report-view";

export const dynamic = "force-dynamic";

/**
 * Laporan Penjualan sisi cabang (/cabang/analisis, migration 0033, owner
 * 2026-09-23): ringkasan + tabel per periode, TANPA pemilih cakupan.
 *
 * Batasnya murni RLS (LESSONS #5/#6): halaman ini tidak mengirim partner_id
 * atau branch_id apa pun — fn_sales_report SECURITY INVOKER hanya
 * menjumlahkan pesanan yang memang sudah boleh dibaca akun ini
 * (fn_can_view_branch: cabang sendiri, atau semua cabang partner kalau
 * kebijakannya PARTNER_ALL_BRANCHES).
 *
 * Kolom "Sudah Invoice" SENGAJA tidak ditampilkan di sini: order_documents
 * khusus admin (0016), jadi bagi cabang angkanya selalu 0 — menampilkannya
 * berarti bilang "belum ada Invoice" padahal yang benar "tidak terlihat".
 * Penjualan = total pelanggan (customer_total_amount 0026, keputusan owner
 * 0034) — ada di partner_orders yang memang boleh dibaca cabang. Pesanan
 * yang totalnya belum dicatat dihitung di catatan `reportUnpricedNote`,
 * bukan diam-diam jadi Rp 0 (LESSONS #10).
 */
function BackRow({ m }: { m: CabangMessages }) {
  return (
    <div className="backrow">
      <Link href="/cabang" className="linkbtn">
        {m.cabang.navBackHome}
      </Link>
    </div>
  );
}

export default async function CabangSalesReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const m = await getCabangMessages();
  const c = m.common;
  const sp = await searchParams;
  const supabase = await createClient();

  // Pola sama dengan halaman cabang lain: baris partner_users = sudah login
  // sebagai staf toko. Error DB ≠ belum login (LESSONS #10).
  const { data: pu, error: puError } = await supabase.from("partner_users").select("id").maybeSingle();
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

  const params = parseReportParams(sp);
  const result = await fetchSalesReport(supabase, params);
  const path = "/cabang/analisis";

  if (result.kind === "featureOff") {
    return (
      <main className="pwrap">
        <BackRow m={m} />
        <h2 className="mtitle">{m.cabang.reportTitle}</h2>
        <div className="card emptybox">{c.reportFeatureOff}</div>
      </main>
    );
  }

  const rows = result.kind === "ok" ? result.rows : [];
  const total = totalOf(rows);
  const kode = result.kind === "error" ? catatGagal("sales_report_cabang", { error: result.error }) : null;

  return (
    <main className="pwrap">
      <BackRow m={m} />
      <h2 className="mtitle">{m.cabang.reportTitle}</h2>
      <ReportFilters
        c={c}
        path={path}
        params={params}
        keep={{}}
        exportHref={`/cabang/analisis/export?${reportQueryString(params)}`}
      />
      <RangeLine c={c} params={params} />
      <p className="muted small">{m.cabang.reportScopeNote}</p>

      {result.kind === "error" ? (
        <div className="card">
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
          <SummaryTiles c={c} total={total} includeInvoice={false} />
          <PeriodTable c={c} rows={rows} total={total} params={params} includeInvoice={false} />
          <ReportFootnotes
            c={c}
            total={total}
            capped={result.capped}
            unpricedNote={m.cabang.reportUnpricedNote}
            showDateBasis={false}
          />
        </>
      )}
    </main>
  );
}
