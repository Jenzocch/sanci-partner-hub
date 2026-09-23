import { createClient } from "@/lib/supabase/server";
import type { AdminMessages } from "@/lib/i18n";
import {
  fetchSalesReport,
  filterByScope,
  parseReportParams,
  parseScope,
  type ReportFetch,
  type ReportParams,
  type Scope,
} from "@/lib/sales-report-shared";

/**
 * Pemuat data bersama tab "Laporan", tab "Per Cabang" dan route unduhan
 * Excel admin — tiga pemanggil, SATU cara membaca parameter & cakupan,
 * supaya berkas Excel selalu berisi persis baris yang sedang tampil.
 *
 * Bukan Server Action ("use server" TIDAK dipasang): modul ini hanya
 * di-import dari server component & route handler, tidak pernah jadi
 * endpoint yang bisa dipanggil browser.
 */

export type PartnerOpt = { id: string; name: string; code: string };
export type BranchOpt = { id: string; name: string; code: string; partner_id: string };

export type AdminReportData = {
  params: ReportParams;
  scope: Scope;
  result: ReportFetch;
  partners: PartnerOpt[];
  branches: BranchOpt[];
  /** Daftar partner/cabang gagal dimuat — cakupan tetap jalan, pilihannya saja yang miskin. */
  scopeListFailed: boolean;
};

type RawSp = Record<string, string | string[] | undefined>;

export async function loadAdminReport(sp: RawSp): Promise<AdminReportData> {
  const params = parseReportParams(sp);
  const scope = parseScope(typeof sp.scope === "string" ? sp.scope : undefined);
  const supabase = await createClient();

  // Tiga pembacaan independen → satu gelombang. Daftar partner/cabang hanya
  // untuk <select> cakupan & nama di Info Excel; RLS b_admin_all/p_admin_all
  // (0001) meloloskan semuanya ke admin. Nonaktif IKUT ditampilkan: laporan
  // periode lalu tetap harus bisa dibaca per cabang yang kini ditutup
  // (LESSONS #4 — riwayat tidak ikut hilang bersama status).
  const [result, pRes, bRes] = await Promise.all([
    fetchSalesReport(supabase, params),
    supabase.from("partners").select("id, name, code").order("name"),
    supabase.from("partner_branches").select("id, name, code, partner_id").order("name"),
  ]);

  const scoped: ReportFetch = result.kind === "ok" ? { ...result, rows: filterByScope(result.rows, scope) } : result;

  return {
    params,
    scope,
    result: scoped,
    partners: (pRes.data ?? []) as PartnerOpt[],
    branches: (bRes.data ?? []) as BranchOpt[],
    scopeListFailed: !!(pRes.error || bRes.error),
  };
}

/** Teks cakupan untuk baris Info Excel ("Cakupan: Golden Home — semua cabang"). */
export function scopeText(m: AdminMessages, d: Pick<AdminReportData, "scope" | "partners" | "branches">): string {
  const s = d.scope;
  let label = m.admin.reportScopeAll;
  if (s.kind === "partner") {
    const p = d.partners.find((x) => x.id === s.id);
    label = m.admin.reportScopePartnerAll.replace("{name}", p ? p.name : s.id);
  } else if (s.kind === "branch") {
    const b = d.branches.find((x) => x.id === s.id);
    const p = b ? d.partners.find((x) => x.id === b.partner_id) : undefined;
    label = b ? `${p ? `${p.name} · ` : ""}${b.name}` : s.id;
  }
  return `${m.admin.reportScopeLabel}: ${label}`;
}
