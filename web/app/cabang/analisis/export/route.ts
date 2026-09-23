import { createClient } from "@/lib/supabase/server";
import { getCabangMessages } from "@/lib/i18n";
import { catatGagal } from "@/lib/safe-write";
import {
  buildReportSheets,
  exportFilename,
  fetchSalesReport,
  parseReportParams,
  REPORT_ROW_CAP,
  totalOf,
} from "@/lib/sales-report-shared";
import { buildXlsx } from "@/lib/xlsx-lite";

export const dynamic = "force-dynamic";

/**
 * GET /cabang/analisis/export?preset=…&gran=…&from=…&to=… → .xlsx Laporan
 * Penjualan cabang. SAMA seperti halamannya: tidak ada parameter
 * partner/cabang yang diterima dari URL (LESSONS #6) — isinya adalah apa
 * pun yang RLS izinkan akun ini baca lewat fn_sales_report (SECURITY
 * INVOKER, 0033). Tanpa kolom Invoice (alasan di app/cabang/analisis/page.tsx).
 */
function text(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function GET(request: Request) {
  const m = await getCabangMessages();
  const supabase = await createClient();
  const { data: pu, error: puError } = await supabase.from("partner_users").select("id").maybeSingle();
  if (puError) {
    const kode = catatGagal("sales_report_export_cabang_account", { error: puError });
    return text(`${m.cabang.errAccountLoad} ${m.common.netReportCode.replace("{kode}", kode)}`, 500);
  }
  if (!pu) return text("Forbidden", 403);

  const params = parseReportParams(Object.fromEntries(new URL(request.url).searchParams.entries()));
  const result = await fetchSalesReport(supabase, params);
  if (result.kind === "featureOff") return text(m.common.reportFeatureOff, 409);
  if (result.kind === "error") {
    const kode = catatGagal("sales_report_export_cabang", { error: result.error });
    return text(`${m.common.errorLoad} ${m.common.netReportCode.replace("{kode}", kode)}`, 500);
  }

  const total = totalOf(result.rows);
  const sheets = buildReportSheets({
    labels: m.common,
    rows: result.rows,
    params,
    locale: m.common.dateLocale,
    includeInvoice: false,
    perBranchSheetName: null,
    extraInfo: [
      m.cabang.reportScopeNote,
      ...(total.unpriced > 0 ? [m.cabang.reportUnpricedNote.replace("{n}", String(total.unpriced))] : []),
      ...(result.capped ? [m.common.reportCappedNote.replace("{n}", String(REPORT_ROW_CAP))] : []),
    ],
  });
  // Salin ke Uint8Array<ArrayBuffer>: tipe BodyInit tidak menerima view di
  // atas ArrayBufferLike (bisa SharedArrayBuffer) yang dikembalikan buildXlsx.
  return new Response(new Uint8Array(buildXlsx(sheets)), {
    status: 200,
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${exportFilename(params)}"`,
      "cache-control": "no-store",
    },
  });
}
