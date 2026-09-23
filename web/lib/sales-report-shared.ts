/**
 * Laporan Penjualan (migration 0033 `fn_sales_report`) — logika bersama
 * untuk DUA halaman (/admin/analisis/laporan + /admin/analisis/cabang dan
 * /cabang/analisis) dan DUA route unduhan Excel. Satu tempat untuk: preset
 * periode → tanggal, validasi searchParams, normalisasi baris RPC,
 * agregasi, dan penyusunan lembar .xlsx — supaya layar dan berkas Excel
 * tidak pernah menghitung dengan cara yang berbeda (semangat yang sama
 * dengan customerPaymentStatus di lib/payment-shared.ts).
 *
 * TIDAK ADA identitas partner/cabang di sini yang dikirim ke database:
 * fungsi 0033 adalah SECURITY INVOKER, RLS pemanggil yang menyaring
 * (LESSONS #5/#6). `scope` sisi admin hanya menyaring baris yang SUDAH
 * boleh dilihat admin, di memori.
 */

import type { XlsxCell, XlsxSheet } from "./xlsx-lite";

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Granularity = "month" | "year";
export type PresetKey = "this_month" | "last_month" | "this_year" | "last_year" | "custom";
export const PRESET_KEYS: PresetKey[] = ["this_month", "last_month", "this_year", "last_year", "custom"];

/**
 * Batas atas rentang pilihan sendiri. Bukan batas bisnis — jaring pengaman
 * supaya satu URL yang diketik asal (tahun 0001 s/d 9999) tidak memaksa
 * database memindai seluruh riwayat per bulan (pola "cap + katakan" yang
 * sama dengan ORDER_ITEMS_SCAN_LIMIT di /admin/analisis, LESSONS #10:
 * dilampaui = pesan "tanggal tidak valid", bukan dipotong diam-diam).
 */
const MAX_RANGE_DAYS = 366 * 10;

/** Tanggal kalender HARI INI di Jakarta — BUKAN zona server (Vercel = UTC,
 *  LESSONS #43). "en-CA" dipakai murni karena formatnya YYYY-MM-DD. */
export function jakartaToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Hari terakhir bulan (1–12) — Date.UTC dengan hari 0 = hari terakhir bulan sebelumnya. */
function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Tanggal kalender sungguhan? (DATE_RE saja meloloskan 2026-02-31.) */
function isRealDate(day: string): boolean {
  if (!DATE_RE.test(day)) return false;
  const [y, m, d] = day.split("-").map(Number);
  return y >= 2000 && m >= 1 && m <= 12 && d >= 1 && d <= lastDayOfMonth(y, m);
}

function daysBetween(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000;
}

export function presetRange(preset: Exclude<PresetKey, "custom">, today: string): { from: string; to: string } {
  const [y, m] = today.split("-").map(Number);
  switch (preset) {
    case "this_month":
      return { from: `${y}-${pad2(m)}-01`, to: `${y}-${pad2(m)}-${pad2(lastDayOfMonth(y, m))}` };
    case "last_month": {
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      return { from: `${py}-${pad2(pm)}-01`, to: `${py}-${pad2(pm)}-${pad2(lastDayOfMonth(py, pm))}` };
    }
    case "this_year":
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    case "last_year":
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
  }
}

export type ReportParams = {
  preset: PresetKey;
  from: string;
  to: string;
  granularity: Granularity;
  /** true = pilihan tanggal sendiri tidak valid, jatuh ke bulan ini (layar WAJIB bilang). */
  invalidRange: boolean;
};

type RawSp = Record<string, string | string[] | undefined>;

function one(sp: RawSp, key: string): string {
  const v = sp[key];
  return typeof v === "string" ? v : "";
}

/**
 * searchParams → parameter laporan yang sudah tervalidasi (LESSONS #6: input
 * URL tidak pernah dipercaya). Default: bulan ini, per bulan — preset
 * tahunan tetap per bulan kecuali `gran=year` dipilih (12 baris lebih
 * berguna daripada 1 baris).
 */
export function parseReportParams(sp: RawSp, now: Date = new Date()): ReportParams {
  const today = jakartaToday(now);
  const rawPreset = one(sp, "preset");
  const preset: PresetKey = (PRESET_KEYS as string[]).includes(rawPreset) ? (rawPreset as PresetKey) : "this_month";
  const granularity: Granularity = one(sp, "gran") === "year" ? "year" : "month";

  // Formulir tanggal di layar DIISI AWAL dengan rentang preset yang sedang
  // aktif dan ikut membawa `preset` itu sebagai field tersembunyi. Jadi:
  // tanggal tidak diubah (mis. staf hanya mengganti cakupan) → preset tetap;
  // tanggal diubah → itu pilihan tanggal sendiri. Staf tidak perlu ingat
  // memilih "Pilih tanggal" dulu sebelum mengetik tanggal.
  let custom = preset === "custom";
  let from = one(sp, "from");
  let to = one(sp, "to");
  if (!custom) {
    const r = presetRange(preset as Exclude<PresetKey, "custom">, today);
    if ((from && from !== r.from) || (to && to !== r.to)) {
      custom = true;
      from = from || r.from;
      to = to || r.to;
    }
  }

  if (custom) {
    if (isRealDate(from) && isRealDate(to) && from <= to && daysBetween(from, to) <= MAX_RANGE_DAYS) {
      return { preset: "custom", from, to, granularity, invalidRange: false };
    }
    return { preset: "this_month", ...presetRange("this_month", today), granularity, invalidRange: true };
  }
  return { preset, ...presetRange(preset as Exclude<PresetKey, "custom">, today), granularity, invalidRange: false };
}

/** Query string yang sama untuk tautan unduhan Excel & "Coba lagi". */
export function reportQueryString(p: ReportParams, extra: Record<string, string> = {}): string {
  const qs = new URLSearchParams();
  qs.set("preset", p.preset);
  qs.set("gran", p.granularity);
  if (p.preset === "custom") {
    qs.set("from", p.from);
    qs.set("to", p.to);
  }
  for (const [k, v] of Object.entries(extra)) if (v) qs.set(k, v);
  return qs.toString();
}

// ── Cakupan admin ─────────────────────────────────────────────────────────

export type Scope = { kind: "all" } | { kind: "partner"; id: string } | { kind: "branch"; id: string };

/** `scope` = "" | "p:<uuid>" | "b:<uuid>". Nilai asing → semua (bukan error). */
export function parseScope(raw: string | undefined): Scope {
  if (typeof raw !== "string") return { kind: "all" };
  const [k, id] = raw.split(":");
  if (id && UUID_RE.test(id)) {
    if (k === "p") return { kind: "partner", id };
    if (k === "b") return { kind: "branch", id };
  }
  return { kind: "all" };
}

export function scopeToParam(s: Scope): string {
  return s.kind === "partner" ? `p:${s.id}` : s.kind === "branch" ? `b:${s.id}` : "";
}

export function filterByScope(rows: SalesReportRow[], s: Scope): SalesReportRow[] {
  if (s.kind === "partner") return rows.filter((r) => r.partnerId === s.id);
  if (s.kind === "branch") return rows.filter((r) => r.branchId === s.id);
  return rows;
}

// ── Baris & agregasi ──────────────────────────────────────────────────────

export type SalesReportRow = {
  periodStart: string;
  partnerId: string;
  partnerName: string;
  partnerCode: string;
  branchId: string;
  branchName: string;
  branchCode: string;
  orders: number;
  sales: number;
  qty: number;
  invoiced: number;
  paid: number;
  outstanding: number;
  unpriced: number;
};

export type Metrics = Pick<SalesReportRow, "orders" | "sales" | "qty" | "invoiced" | "paid" | "outstanding" | "unpriced">;

/** PostgREST mengirim numeric/bigint bisa sebagai string — dinormalkan di SATU tempat. */
function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function normalizeRows(data: unknown): SalesReportRow[] {
  if (!Array.isArray(data)) return [];
  return data.map((r: Record<string, unknown>) => ({
    periodStart: str(r.period_start),
    partnerId: str(r.partner_id),
    partnerName: str(r.partner_name),
    partnerCode: str(r.partner_code),
    branchId: str(r.branch_id),
    branchName: str(r.branch_name),
    branchCode: str(r.branch_code),
    orders: num(r.orders),
    sales: num(r.sales_amount),
    qty: num(r.items_qty),
    invoiced: num(r.invoiced_amount),
    paid: num(r.paid_amount),
    outstanding: num(r.outstanding_amount),
    unpriced: num(r.unpriced_orders),
  }));
}

/**
 * Fungsi 0033 belum ada di database (migration belum dijalankan — LESSONS
 * #9/#12): 42883 dari Postgres, PGRST202 dari PostgREST ("function not
 * found in schema cache"). Keduanya = fitur belum aktif, BUKAN error muat.
 */
export function isMissingFunctionError(err: { code?: string } | null): boolean {
  return !!err && (err.code === "42883" || err.code === "PGRST202");
}

function emptyMetrics(): Metrics {
  return { orders: 0, sales: 0, qty: 0, invoiced: 0, paid: 0, outstanding: 0, unpriced: 0 };
}

function add(into: Metrics, r: Metrics): void {
  into.orders += r.orders;
  into.sales += r.sales;
  into.qty += r.qty;
  into.invoiced += r.invoiced;
  into.paid += r.paid;
  into.outstanding += r.outstanding;
  into.unpriced += r.unpriced;
}

export function totalOf(rows: SalesReportRow[]): Metrics {
  const t = emptyMetrics();
  for (const r of rows) add(t, r);
  return t;
}

export type PeriodAgg = Metrics & { periodStart: string };

/** Satu baris per periode, urut waktu naik (dijumlah lintas cabang). */
export function byPeriod(rows: SalesReportRow[]): PeriodAgg[] {
  const map = new Map<string, PeriodAgg>();
  for (const r of rows) {
    let a = map.get(r.periodStart);
    if (!a) {
      a = { periodStart: r.periodStart, ...emptyMetrics() };
      map.set(r.periodStart, a);
    }
    add(a, r);
  }
  return Array.from(map.values()).sort((x, y) => x.periodStart.localeCompare(y.periodStart));
}

export type BranchAgg = Metrics & {
  partnerId: string;
  partnerName: string;
  partnerCode: string;
  branchId: string;
  branchName: string;
  branchCode: string;
};

export type BranchSort = "sales" | "orders" | "outstanding" | "name";

export function parseBranchSort(raw: string | undefined): BranchSort {
  return raw === "orders" || raw === "outstanding" || raw === "name" ? raw : "sales";
}

/** Satu baris per cabang (dijumlah lintas periode), diurutkan. */
export function byBranch(rows: SalesReportRow[], sort: BranchSort = "sales"): BranchAgg[] {
  const map = new Map<string, BranchAgg>();
  for (const r of rows) {
    let a = map.get(r.branchId);
    if (!a) {
      a = {
        partnerId: r.partnerId,
        partnerName: r.partnerName,
        partnerCode: r.partnerCode,
        branchId: r.branchId,
        branchName: r.branchName,
        branchCode: r.branchCode,
        ...emptyMetrics(),
      };
      map.set(r.branchId, a);
    }
    add(a, r);
  }
  const byName = (x: BranchAgg, y: BranchAgg) =>
    x.partnerName.localeCompare(y.partnerName) || x.branchName.localeCompare(y.branchName);
  return Array.from(map.values()).sort((x, y) => {
    if (sort === "name") return byName(x, y);
    const d = sort === "orders" ? y.orders - x.orders : sort === "outstanding" ? y.outstanding - x.outstanding : y.sales - x.sales;
    return d || byName(x, y);
  });
}

/**
 * Label periode. `period_start` adalah `date` murni (bukan titik waktu) —
 * diformat dengan jangkar UTC di kedua sisi, pola formatCalendarDate
 * (LESSONS #43 bagian `date`), supaya "2026-09-01" tidak pernah jadi Agustus.
 */
export function formatPeriod(periodStart: string, g: Granularity, locale: string): string {
  if (!DATE_RE.test(periodStart)) return periodStart;
  if (g === "year") return periodStart.slice(0, 4);
  return new Intl.DateTimeFormat(locale, { timeZone: "UTC", year: "numeric", month: "long" }).format(
    new Date(`${periodStart}T00:00:00Z`)
  );
}

// ── Excel ─────────────────────────────────────────────────────────────────

/** Nama berkas memuat rentang tanggal (owner): laporan-penjualan_2026-09-01_2026-09-30.xlsx */
export function exportFilename(p: ReportParams, suffix = ""): string {
  const tail = suffix ? `_${suffix.replace(/[^A-Za-z0-9-]/g, "")}` : "";
  return `laporan-penjualan_${p.from}_${p.to}${tail}.xlsx`;
}

type ReportLabels = {
  reportColPeriod: string;
  reportColPartner: string;
  reportColBranch: string;
  reportColOrders: string;
  reportColSales: string;
  reportColQty: string;
  reportColInvoiced: string;
  reportColPaid: string;
  reportColOutstanding: string;
  reportTotal: string;
  reportPeriodTableTitle: string;
  reportSheetDetail: string;
  reportSheetInfo: string;
  reportRangeLine: string;
  reportDateBasisNote: string;
};

/**
 * Baris laporan → lembar .xlsx (lib/xlsx-lite). Angka dikirim sebagai
 * NUMBER (bisa dijumlah di Excel), tanggal sebagai teks (xlsx-lite tidak
 * mendukung serial tanggal). `includeInvoice` = false di sisi cabang:
 * order_documents admin-only (0016), kolom itu selalu 0 bagi cabang dan
 * menampilkannya berarti "belum ada Invoice" yang tidak benar.
 */
export function buildReportSheets(opts: {
  labels: ReportLabels;
  rows: SalesReportRow[];
  params: ReportParams;
  locale: string;
  includeInvoice: boolean;
  /** Lembar "per cabang" tambahan (admin). null = tidak ada. */
  perBranchSheetName: string | null;
  scopeLine?: string;
  /** Catatan tambahan untuk lembar Info (pesanan tanpa Harga Akhir, hasil terpotong). */
  extraInfo?: string[];
}): XlsxSheet[] {
  const { labels: L, rows, params, locale, includeInvoice } = opts;
  const metricHead = [
    L.reportColOrders,
    L.reportColSales,
    L.reportColQty,
    ...(includeInvoice ? [L.reportColInvoiced] : []),
    L.reportColPaid,
    L.reportColOutstanding,
  ];
  const metricCells = (m: Metrics): XlsxCell[] => [
    m.orders,
    m.sales,
    m.qty,
    ...(includeInvoice ? [m.invoiced] : []),
    m.paid,
    m.outstanding,
  ];

  const total = totalOf(rows);
  const periodRows: XlsxCell[][] = [
    [L.reportColPeriod, ...metricHead],
    ...byPeriod(rows).map((p) => [formatPeriod(p.periodStart, params.granularity, locale), ...metricCells(p)]),
    [L.reportTotal, ...metricCells(total)],
  ];

  const detailRows: XlsxCell[][] = [
    [L.reportColPeriod, L.reportColPartner, L.reportColBranch, ...metricHead],
    ...rows.map((r) => [
      formatPeriod(r.periodStart, params.granularity, locale),
      r.partnerName || r.partnerCode,
      r.branchName || r.branchCode,
      ...metricCells(r),
    ]),
  ];

  const sheets: XlsxSheet[] = [{ name: L.reportPeriodTableTitle, rows: periodRows }];
  if (opts.perBranchSheetName) {
    sheets.push({
      name: opts.perBranchSheetName,
      rows: [
        [L.reportColPartner, L.reportColBranch, ...metricHead],
        ...byBranch(rows, "sales").map((b) => [b.partnerName || b.partnerCode, b.branchName || b.branchCode, ...metricCells(b)]),
        [L.reportTotal, "", ...metricCells(total)],
      ],
    });
  }
  sheets.push({ name: L.reportSheetDetail, rows: detailRows });
  sheets.push({
    name: L.reportSheetInfo,
    rows: [
      [L.reportRangeLine.replace("{from}", params.from).replace("{to}", params.to)],
      ...(opts.scopeLine ? [[opts.scopeLine]] : []),
      ...(includeInvoice ? [[L.reportDateBasisNote]] : []),
      ...(opts.extraInfo ?? []).map((line) => [line]),
    ],
  });
  return sheets;
}

// ── Pemanggilan RPC ───────────────────────────────────────────────────────

/**
 * Batas baris yang dikembalikan PostgREST per permintaan (Supabase default
 * `max_rows` = 1000). Hasil fungsi ini satu baris per (periode, cabang), jadi
 * batas baru tersentuh di rentang panjang × banyak cabang — kalau tersentuh,
 * layar WAJIB bilang (LESSONS #10: tidak ada pemotongan diam-diam), dan
 * sarannya mempersempit periode / kelompokkan per tahun.
 */
export const REPORT_ROW_CAP = 1000;

type RpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
};

export type ReportFetch =
  | { kind: "ok"; rows: SalesReportRow[]; capped: boolean }
  | { kind: "featureOff" }
  | { kind: "error"; error: { code?: string; message?: string } };

export async function fetchSalesReport(supabase: RpcClient, p: ReportParams): Promise<ReportFetch> {
  const { data, error } = await supabase.rpc("fn_sales_report", {
    p_from: p.from,
    p_to: p.to,
    p_granularity: p.granularity,
  });
  if (error) {
    if (isMissingFunctionError(error)) return { kind: "featureOff" };
    return { kind: "error", error };
  }
  const rows = normalizeRows(data);
  return { kind: "ok", rows, capped: rows.length >= REPORT_ROW_CAP };
}
