import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  fulfillmentLabel,
  orderStatusLabel,
  displayPhoneID,
  formatIDR,
  isMissingTableError,
  type FulfillmentPath,
} from "@/lib/orders-shared";
import { formatActorRole, formatAuditAction, formatAuditDiff } from "@/lib/audit-format";
import CorrectAttributionButton, { type BranchOption } from "./correct-attribution-button";
import MarkArrivedButton from "./mark-arrived-button";
import InternalNoteForm from "./internal-note-form";
import OrderOfferForm from "./order-offer-form";
import { getInvoiceSignedUrl } from "../../actions-orders";
import { getMessages } from "@/lib/i18n";

export const dynamic = "force-dynamic";

type One<T> = T | T[] | null;
function one<T>(v: One<T>): T | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

/**
 * Kolom-kolom dari migration yang dikerjakan paralel (LESSONS #12) dibaca
 * lewat query TERPISAH — tapi "kolom belum ada" (42703, migrasi belum
 * dijalankan) dan "query ini gagal karena sebab lain" (jaringan/DB) BUKAN hal
 * yang sama dan tidak boleh dirender sama seperti "belum diisi" (LESSONS
 * #10). Tiga keadaan eksplisit, bukan boolean `unavailable`.
 */
type ColumnFetch<T> =
  | { status: "ok"; data: T }
  | { status: "missing-column" }
  | { status: "error" };

type OrderDetailRow = {
  id: string;
  order_number: string;
  package_name: string;
  status: "REGISTERED" | "CANCELLED";
  notes: string | null;
  created_at: string;
  branch_id: string;
  partner_id: string;
  customer_id: string;
  partner_sales_staff_id: string | null;
  partner_pic_staff_id: string | null;
  customers: One<{ full_name: string; phone_normalized: string; whatsapp: string | null }>;
  partner_branches: One<{ name: string }>;
  partners: One<{ name: string; code: string }>;
  sales: One<{ full_name: string; status: string }>;
  pic: One<{ full_name: string; status: string }>;
};

/**
 * cancelled_at/cancellation_reason (migration 0005) dibaca TERPISAH dari query
 * utama: kolom yang belum ada (42703) tidak boleh menggagalkan seluruh halaman
 * (LESSONS #12) — bagian ini saja yang harus turun ke pesan degradasi.
 */
type CancelInfo = { cancelled_at: string | null; cancellation_reason: string | null };
async function fetchCancelInfo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderId: string
): Promise<ColumnFetch<CancelInfo | null>> {
  const { data, error } = await supabase
    .from("partner_orders")
    .select("cancelled_at, cancellation_reason")
    .eq("id", orderId)
    .maybeSingle();
  if (error) return { status: error.code === "42703" ? "missing-column" : "error" };
  return { status: "ok", data: (data as CancelInfo | null) ?? null };
}

/**
 * package_id (migration 0008, dikerjakan paralel) juga dibaca terpisah dengan
 * alasan yang sama: kode ini boleh naik sebelum SQL-nya dijalankan.
 */
async function fetchPackageId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderId: string
): Promise<ColumnFetch<string | null>> {
  const { data, error } = await supabase
    .from("partner_orders")
    .select("package_id")
    .eq("id", orderId)
    .maybeSingle();
  if (error) return { status: error.code === "42703" ? "missing-column" : "error" };
  return { status: "ok", data: (data as { package_id: string | null } | null)?.package_id ?? null };
}

type PackageDetail = { name: string; code: string; status: string };
async function fetchPackageDetail(
  supabase: Awaited<ReturnType<typeof createClient>>,
  packageId: string
): Promise<PackageDetail | null> {
  const { data, error } = await supabase
    .from("partner_packages")
    .select("name, code, status")
    .eq("id", packageId)
    .maybeSingle();
  if (error) return null; // tabel/baris hilang → diam-diam pakai package_name sebagai fallback
  return (data as PackageDetail | null) ?? null;
}

/**
 * fulfillment_path/partner_purchase_amount/invoice_url/customer_arrived_at
 * (migration 0009, dikerjakan paralel) dibaca TERPISAH dengan alasan yang
 * sama dengan fetchCancelInfo/fetchPackageId di atas — kolom yang belum ada
 * (42703) tidak boleh menggagalkan seluruh halaman (LESSONS #12).
 */
type FulfillmentInfo = {
  fulfillment_path: FulfillmentPath | null;
  partner_purchase_amount: number | null;
  invoice_url: string | null;
  customer_arrived_at: string | null;
};
async function fetchFulfillmentInfo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderId: string
): Promise<ColumnFetch<FulfillmentInfo | null>> {
  const { data, error } = await supabase
    .from("partner_orders")
    .select("fulfillment_path, partner_purchase_amount, invoice_url, customer_arrived_at")
    .eq("id", orderId)
    .maybeSingle();
  if (error) return { status: error.code === "42703" ? "missing-column" : "error" };
  return { status: "ok", data: (data as FulfillmentInfo | null) ?? null };
}

/**
 * order_internal_notes (migration 0009) — tabel BARU, jadi degradasinya
 * 42P01 (tabel hilang), bukan 42703 (kolom hilang). Admin-only lewat RLS;
 * halaman ini tidak menambah pengecekan role sendiri (zero-trust dari DB,
 * bukan dari UI — LESSONS #5/#6).
 */
type InternalNoteRow = { id: string; note: string; created_at: string };
async function fetchInternalNotes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderId: string
): Promise<{ notes: InternalNoteRow[]; unavailable: boolean }> {
  const { data, error } = await supabase
    .from("order_internal_notes")
    .select("id, note, created_at")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return { notes: [], unavailable: isMissingTableError(error) };
  return { notes: (data ?? []) as InternalNoteRow[], unavailable: false };
}

/**
 * order_sanci_offers (migration 0013) — tabel BARU, jadi degradasinya 42P01
 * (tabel hilang), bukan 42703 (kolom hilang). Admin-only lewat RLS; halaman ini
 * tidak menambah pengecekan role sendiri (zero-trust dari DB, bukan dari UI —
 * LESSONS #5/#6).
 *
 * SENGAJA query TERPISAH, bukan embed `order_sanci_offers(amount)` di dalam
 * query utama. Dua alasan, keduanya sudah pernah dibayar di proyek ini:
 *   1. Kalau tabelnya belum ada (kode naik lebih dulu daripada SQL), embed akan
 *      menggagalkan SELURUH query pesanan — halaman detailnya mati total, bukan
 *      cuma bagian penawaran yang turun ke pesan degradasi (LESSONS #12).
 *   2. Kebenaran string embed hanya terbukti saat DIJALANKAN, tidak pernah saat
 *      typecheck/build (LESSONS #24) — jadi bentuk yang bisa gagal diam-diam
 *      dihindari kalau ada bentuk yang tidak bisa.
 * Pola ini sama dengan fetchInternalNotes di atas.
 */
async function fetchOrderOffer(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderId: string
): Promise<ColumnFetch<number | null>> {
  const { data, error } = await supabase
    .from("order_sanci_offers")
    .select("amount")
    .eq("order_id", orderId)
    .maybeSingle();
  // "missing-column" dipakai ulang di sini untuk arti "fiturnya belum aktif" —
  // yang membedakannya dari "error" adalah pesan yang tampil, dan keduanya
  // memang tidak boleh dirender sama seperti "belum diisi" (LESSONS #10).
  if (error) return { status: isMissingTableError(error) ? "missing-column" : "error" };
  const amount = (data as { amount: number | string | null } | null)?.amount ?? null;
  // numeric(15,2) bisa sampai ke sini sebagai string tergantung versi driver;
  // Number() sekali di sini supaya formatIDR tidak pernah menerima teks.
  return { status: "ok", data: amount === null ? null : Number(amount) };
}

type AuditRow = {
  id: number;
  action: string;
  actor_role: string;
  created_at: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
};

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const m = await getMessages();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("partner_orders")
    .select(
      "id, order_number, package_name, status, notes, created_at, branch_id, partner_id, customer_id, " +
        "partner_sales_staff_id, partner_pic_staff_id, " +
        "customers:customer_id(full_name, phone_normalized, whatsapp), " +
        "partner_branches:branch_id(name), partners:partner_id(name, code), " +
        "sales:partner_sales_staff_id(full_name, status), pic:partner_pic_staff_id(full_name, status)"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return (
        <div>
          <div className="pagehead">
            <h1>{m.common.order}</h1>
          </div>
          <div className="card emptybox">{m.admin.orderFeatureOff}</div>
        </div>
      );
    }
    return (
      <div>
        <div className="pagehead">
          <h1>{m.common.order}</h1>
        </div>
        <div className="card">
          <div className="err">{m.admin.orderDetailLoadFailed}</div>
          <Link href={`/admin/orders/${orderId}`} className="btn sm">
            {m.common.retry}
          </Link>
        </div>
      </div>
    );
  }
  if (!data) notFound();

  const order = data as unknown as OrderDetailRow;
  const customer = one(order.customers);
  const branch = one(order.partner_branches);
  const partner = one(order.partners);
  const sales = one(order.sales);
  const pic = one(order.pic);

  const [cancelResult, packageIdResult, fulfillmentResult, notesResult, offerResult] =
    await Promise.all([
      order.status === "CANCELLED"
        ? fetchCancelInfo(supabase, order.id)
        : Promise.resolve<ColumnFetch<CancelInfo | null>>({ status: "ok", data: null }),
      fetchPackageId(supabase, order.id),
      fetchFulfillmentInfo(supabase, order.id),
      fetchInternalNotes(supabase, order.id),
      fetchOrderOffer(supabase, order.id),
    ]);
  const packageId = packageIdResult.status === "ok" ? packageIdResult.data : null;
  const packageDetail = packageId ? await fetchPackageDetail(supabase, packageId) : null;

  const fulfillment = fulfillmentResult.status === "ok" ? fulfillmentResult.data : null;
  const invoiceResult = fulfillment?.invoice_url
    ? await getInvoiceSignedUrl(fulfillment.invoice_url)
    : null;
  const invoiceUrl = invoiceResult && "url" in invoiceResult ? invoiceResult.url : null;

  // Semua cabang milik partner yang SAMA (semua status) — dipakai dua hal:
  // dropdown Koreksi Atribusi (hanya yang AKTIF, bukan cabang saat ini) dan
  // menerjemahkan branch_id di riwayat audit jadi nama, bukan UUID mentah
  // (SPEC §15/§16: Correct Attribution hanya boleh memindahkan cabang, tidak
  // pernah memindahkan partner — jadi partner lain tidak pernah muncul di sini).
  const { data: partnerBranchesData } = await supabase
    .from("partner_branches")
    .select("id, name, status")
    .eq("partner_id", order.partner_id)
    .order("name");
  const partnerBranches = (partnerBranchesData ?? []) as { id: string; name: string; status: string }[];
  const branchNameById = new Map(partnerBranches.map((b) => [b.id, b.name]));
  const otherBranches: BranchOption[] = partnerBranches
    .filter((b) => b.status === "ACTIVE" && b.id !== order.branch_id)
    .map((b) => ({ id: b.id, name: b.name }));

  const { data: auditData } = await supabase
    .from("audit_logs")
    .select("id, action, actor_role, created_at, before, after, reason")
    .eq("entity_type", "partner_orders")
    .eq("entity_id", order.id)
    .order("created_at", { ascending: false })
    .limit(100);
  const audit = (auditData ?? []) as AuditRow[];

  return (
    <div>
      <div className="crumb">
        <Link href="/admin/orders">{m.admin.navOrders}</Link> / {order.order_number}
      </div>
      <div className="pagehead">
        <h1>{order.order_number}</h1>
        <span className={`chip ${order.status === "REGISTERED" ? "ACTIVE" : "SUSPENDED"}`} style={{ fontSize: 14, padding: "5px 14px" }}>
          {orderStatusLabel(m, order.status)}
        </span>
      </div>

      {/* Attribution — harus sangat menonjol, bukan tersembunyi di bawah (SPEC §50). */}
      <div className="card accent">
        <div className="overline">{m.admin.orderOverline}</div>
        <h2 style={{ fontSize: 21 }}>{partner?.name ?? m.admin.partnerUnknown}</h2>
        <div style={{ fontSize: 16, fontWeight: 650, color: "var(--accent-2)", marginTop: 2 }}>
          {m.admin.orderBranchPrefix.replace("{branch}", branch?.name ?? m.admin.branchUnknown)}
        </div>
        <div className="btnrow-inline">
          <CorrectAttributionButton
            orderId={order.id}
            currentBranchName={branch?.name ?? m.admin.branchUnknown}
            otherBranches={otherBranches}
          />
        </div>
      </div>

      <div className="cardgrid-two">
        <div className="card">
          <h3 style={{ fontSize: 17, marginBottom: 12 }}>{m.admin.customerCardTitle}</h3>
          <dl className="kv">
            <dt>{m.common.name}</dt>
            <dd>{customer?.full_name ?? m.admin.customerUnknown}</dd>
            <dt>{m.common.phone}</dt>
            <dd>{customer?.phone_normalized ? displayPhoneID(customer.phone_normalized) : "—"}</dd>
            <dt>{m.common.whatsapp}</dt>
            <dd>{customer?.whatsapp || "—"}</dd>
          </dl>
        </div>

        <div className="card">
          <h3 style={{ fontSize: 17, marginBottom: 12 }}>{m.admin.orderCardTitle}</h3>
          <dl className="kv">
            <dt>{m.common.package}</dt>
            <dd>
              {order.package_name}
              {packageDetail && packageDetail.status === "INACTIVE" && (
                <span className="small muted">
                  {m.admin.packageCodeInactive.replace("{code}", packageDetail.code)}
                </span>
              )}
              {packageDetail && packageDetail.status === "ACTIVE" && (
                <span className="small muted">
                  {m.admin.packageCodeActive.replace("{code}", packageDetail.code)}
                </span>
              )}
            </dd>
            <dt>{m.admin.colSales}</dt>
            <dd>
              {sales?.full_name ?? "—"}
              {sales && sales.status !== "ACTIVE" && <span className="small muted">{m.admin.personInactiveSuffix}</span>}
            </dd>
            <dt>{m.admin.picLabel}</dt>
            <dd>
              {pic?.full_name ?? "—"}
              {pic && pic.status !== "ACTIVE" && <span className="small muted">{m.admin.personInactiveSuffix}</span>}
            </dd>
            {fulfillmentResult.status === "missing-column" ? (
              <>
                <dt>{m.common.fulfillment}</dt>
                <dd className="small muted">{m.admin.fulfillmentMigrationOff}</dd>
              </>
            ) : fulfillmentResult.status === "error" ? (
              <>
                <dt>{m.common.fulfillment}</dt>
                <dd>
                  <span className="err">{m.common.errorSection}</span>{" "}
                  <Link href={`/admin/orders/${order.id}`} className="btn sm">
                    {m.common.retry}
                  </Link>
                </dd>
              </>
            ) : (
              <>
                <dt>{m.common.fulfillment}</dt>
                <dd>
                  {fulfillment?.fulfillment_path ? (
                    <span className="chip accent">{fulfillmentLabel(m, fulfillment.fulfillment_path)}</span>
                  ) : (
                    "—"
                  )}
                </dd>
                <dt>{m.common.storePurchase}</dt>
                <dd>
                  {fulfillment?.partner_purchase_amount != null
                    ? formatIDR(fulfillment.partner_purchase_amount)
                    : m.admin.fulfillmentReported}
                </dd>
                <dt>{m.common.invoice}</dt>
                <dd>
                  {fulfillment?.invoice_url ? (
                    invoiceUrl ? (
                      <a href={invoiceUrl} target="_blank" rel="noopener noreferrer" className="linkbtn">
                        {m.admin.viewInvoiceBtn}
                      </a>
                    ) : (
                      <span className="small muted">{m.admin.invoiceNotLoadable}</span>
                    )
                  ) : (
                    m.admin.invoiceNotUploaded
                  )}
                </dd>
              </>
            )}
            <dt>{m.common.notes}</dt>
            <dd>{order.notes || "—"}</dd>
            <dt>{m.common.createdAt}</dt>
            <dd>
              {new Date(order.created_at).toLocaleString("id-ID", {
                day: "numeric",
                month: "long",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
              {m.admin.createdAtServerTimeSuffix}
            </dd>
          </dl>

          {/* Tandai kedatangan hanya untuk jalur SHOWROOM_VISIT (SPEC slice
              ini) — DIRECT_DELIVERY tidak pernah menampilkan bagian ini. */}
          {fulfillmentResult.status === "ok" && fulfillment?.fulfillment_path === "SHOWROOM_VISIT" && (
            fulfillment.customer_arrived_at ? (
              <div className="banner ok" style={{ marginTop: 14 }}>
                <strong>{m.admin.customerArrivedLabel}</strong>{" "}
                {new Date(fulfillment.customer_arrived_at).toLocaleString("id-ID", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {m.admin.createdAtServerTimeSuffix}
              </div>
            ) : (
              <div className="btnrow-inline">
                <MarkArrivedButton
                  orderId={order.id}
                  customerName={customer?.full_name ?? m.common.customer}
                  orderNumber={order.order_number}
                />
              </div>
            )
          )}

          {order.status === "CANCELLED" && (
            <div className="banner" style={{ marginTop: 14 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{m.admin.orderCancelledTitle}</div>
              {cancelResult.status === "missing-column" ? (
                <div>{m.admin.cancelInfoMigrationOff}</div>
              ) : cancelResult.status === "error" ? (
                <div>
                  <span className="err">{m.common.errorSection}</span>{" "}
                  <Link href={`/admin/orders/${order.id}`} className="btn sm">
                    {m.common.retry}
                  </Link>
                </div>
              ) : (
                <>
                  <div>{m.admin.cancelReasonPrefix}{cancelResult.data?.cancellation_reason || "—"}</div>
                  <div>
                    {m.admin.cancelTimePrefix}
                    {cancelResult.data?.cancelled_at
                      ? new Date(cancelResult.data.cancelled_at).toLocaleString("id-ID", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Penawaran SANCI (0013) — zona kepercayaan yang SAMA dengan Catatan
          Internal di bawahnya, karena itu diletakkan berdampingan: keduanya
          data SANCI-saja yang menempel pada satu pesanan. Yang menutupnya
          adalah RLS (tabel terpisah tanpa satu pun policy untuk cabang), BUKAN
          kartu ini — kalau suatu hari kartu ini dihapus, angkanya tetap
          tertutup (LESSONS #5). Salinan i18n-nya menyebutkan hal itu secara
          eksplisit kepada admin; itu disengaja, bukan basa-basi. */}
      <div className="card">
        <h3 style={{ fontSize: 17, marginBottom: 4 }}>{m.admin.orderOfferCardTitle}</h3>
        <div className="banner warn" style={{ marginTop: 8 }}>
          {m.admin.orderOfferVisibilityWarning}
        </div>
        {offerResult.status === "missing-column" ? (
          <div className="emptybox">{m.admin.orderOfferFeatureOff}</div>
        ) : offerResult.status === "error" ? (
          <div style={{ marginTop: 10 }}>
            <span className="err">{m.common.errorSection}</span>{" "}
            <Link href={`/admin/orders/${order.id}`} className="btn sm">
              {m.common.retry}
            </Link>
          </div>
        ) : (
          <>
            <dl className="kv" style={{ marginTop: 10 }}>
              <dt>{m.common.sanciOffer}</dt>
              <dd>
                {offerResult.data == null ? (
                  <span className="small muted">{m.admin.orderOfferEmpty}</span>
                ) : (
                  <strong>{formatIDR(offerResult.data)}</strong>
                )}
              </dd>
            </dl>
            <OrderOfferForm orderId={order.id} currentAmount={offerResult.data} />
            <p className="footnote">{m.admin.orderOfferFootnote}</p>
          </>
        )}
      </div>

      {/* Catatan Internal SANCI — partner TIDAK PERNAH melihat kartu ini;
          ditegakkan oleh RLS admin-only di DB, bukan cuma disembunyikan di
          layar admin (LESSONS #5/#6). Append-only: tidak ada tombol
          edit/hapus di mana pun pada kartu ini. */}
      <div className="card">
        <h3 style={{ fontSize: 17, marginBottom: 4 }}>{m.admin.internalNoteCardTitle}</h3>
        <div className="banner warn" style={{ marginTop: 8 }}>
          {m.admin.internalNoteVisibilityWarning}
        </div>
        {notesResult.unavailable ? (
          <div className="emptybox">{m.admin.internalNoteFeatureOff}</div>
        ) : (
          <>
            {notesResult.notes.length === 0 ? (
              <div className="emptybox">{m.admin.internalNoteEmpty}</div>
            ) : (
              <ul className="audit-list">
                {notesResult.notes.map((n) => (
                  <li key={n.id}>
                    <span className="ts">
                      {new Date(n.created_at).toLocaleString("id-ID", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {m.admin.createdAtServerTimeSuffix}
                    </span>
                    <div>{n.note}</div>
                  </li>
                ))}
              </ul>
            )}
            <InternalNoteForm orderId={order.id} />
            <p className="footnote">{m.admin.internalNoteFootnote}</p>
          </>
        )}
      </div>

      <div className="card">
        <h3 style={{ fontSize: 17, marginBottom: 12 }}>{m.common.activity}</h3>
        {audit.length === 0 ? (
          <div className="emptybox">{m.admin.orderActivityEmpty}</div>
        ) : (
          <ul className="audit-list">
            {audit.map((a) => {
              const diffLines = formatAuditDiff(m, a.before, a.after);
              // ORDER_ATTRIBUTION_CORRECTED: branch_id ada di daftar SKIP milik
              // formatAuditDiff (dianggap konteks, bukan nilai yang berubah) —
              // tapi untuk aksi ini justru itulah intinya (SPEC §64), jadi
              // diterjemahkan manual jadi nama cabang, bukan UUID mentah.
              const beforeBranch = a.before?.branch_id ? String(a.before.branch_id) : null;
              const afterBranch = a.after?.branch_id ? String(a.after.branch_id) : null;
              const attributionLine =
                a.action === "ORDER_ATTRIBUTION_CORRECTED" && (beforeBranch || afterBranch)
                  ? m.admin.attributionDiffLabel
                      .replace("{before}", beforeBranch ? branchNameById.get(beforeBranch) ?? beforeBranch : "—")
                      .replace("{after}", afterBranch ? branchNameById.get(afterBranch) ?? afterBranch : "—")
                  : null;
              return (
                <li key={a.id}>
                  <span className="act">{formatAuditAction(m, a.action)}</span>{" "}
                  <span className="muted">· {formatActorRole(m, a.actor_role)}</span>
                  <span className="ts">
                    {new Date(a.created_at).toLocaleString("id-ID")}
                    {m.admin.createdAtServerTimeSuffix}
                  </span>
                  {a.reason && <div className="diff">{m.admin.reasonDiffPrefix}{a.reason}</div>}
                  {attributionLine && <div className="diff">{attributionLine}</div>}
                  {diffLines.length > 0 && (
                    <div className="diff">
                      {diffLines.map((line, i) => (
                        <div key={i}>{line}</div>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="footnote">{m.admin.auditFootnote}</p>
      </div>
    </div>
  );
}
