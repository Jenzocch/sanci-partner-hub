import { createClient } from "@/lib/supabase/server";
import { getAdminMessages } from "@/lib/i18n";
import { catatGagal } from "@/lib/safe-write";
import { buildReportSheets, exportFilename, REPORT_ROW_CAP, totalOf } from "@/lib/sales-report-shared";
import { buildXlsx } from "@/lib/xlsx-lite";
import { loadAdminReport, scopeText } from "../../report-data";

export const dynamic = "force-dynamic";

/**
 * GET /admin/analisis/laporan/export?preset=…&gran=…&from=…&to=…&scope=…
 * → berkas .xlsx Laporan Penjualan dengan baris yang SAMA persis dengan
 * layar (pemuat report-data.ts yang sama, cakupan yang sama).
 *
 * Route Handler TIDAK dilindungi AdminLayout (layout hanya membungkus
 * halaman), jadi gerbang admin diperiksa DI SINI juga — lapisan API dari
 * LESSONS #5. Lapisan DB-nya tetap RLS: fn_sales_report SECURITY INVOKER,
 * jadi non-admin yang lolos pun hanya akan mendapat barisnya sendiri.
 */
function text(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function GET(request: Request) {
  const m = await getAdminMessages();
  const supabase = await createClient();
  const { data: admin } = await supabase.from("platform_admins").select("auth_user_id").limit(1).maybeSingle();
  if (!admin) return text("Forbidden", 403);

  const sp = Object.fromEntries(new URL(request.url).searchParams.entries());
  const d = await loadAdminReport(sp);

  if (d.result.kind === "featureOff") return text(m.common.reportFeatureOff, 409);
  if (d.result.kind === "error") {
    const kode = catatGagal("sales_report_export_admin", { error: d.result.error });
    return text(`${m.common.errorLoad} ${m.common.netReportCode.replace("{kode}", kode)}`, 500);
  }

  const total = totalOf(d.result.rows);
  const extraInfo = [
    ...(total.unpriced > 0 ? [m.admin.reportUnpricedNote.replace("{n}", String(total.unpriced))] : []),
    ...(d.result.capped ? [m.common.reportCappedNote.replace("{n}", String(REPORT_ROW_CAP))] : []),
  ];
  const sheets = buildReportSheets({
    labels: m.common,
    rows: d.result.rows,
    params: d.params,
    locale: m.common.dateLocale,
    includeInvoice: true,
    perBranchSheetName: m.admin.reportSheetPerBranch,
    scopeLine: scopeText(m, d),
    extraInfo,
  });
  // Salin ke Uint8Array<ArrayBuffer>: tipe BodyInit tidak menerima view di
  // atas ArrayBufferLike (bisa SharedArrayBuffer) yang dikembalikan buildXlsx.
  return new Response(new Uint8Array(buildXlsx(sheets)), {
    status: 200,
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${exportFilename(d.params)}"`,
      "cache-control": "no-store",
    },
  });
}
