import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  FULFILLMENT_PATH_LABEL,
  displayPhoneID,
  formatIDR,
  isMissingTableError,
  type FulfillmentPath,
} from "@/lib/orders-shared";
import { formatActorRole, formatAuditAction, formatAuditDiff } from "@/lib/audit-format";
import CorrectAttributionButton, { type BranchOption } from "./correct-attribution-button";
import MarkArrivedButton from "./mark-arrived-button";
import InternalNoteForm from "./internal-note-form";
import { getInvoiceSignedUrl } from "../../actions-orders";

export const dynamic = "force-dynamic";

const MISSING_TABLE_MSG = "Modul Pesanan belum aktif di database (migrasi belum dijalankan).";

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
            <h1>Pesanan</h1>
          </div>
          <div className="card emptybox">{MISSING_TABLE_MSG}</div>
        </div>
      );
    }
    return (
      <div>
        <div className="pagehead">
          <h1>Pesanan</h1>
        </div>
        <div className="card">
          <div className="err">Gagal memuat detail pesanan.</div>
          <Link href={`/admin/orders/${orderId}`} className="btn sm">
            Coba Lagi
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

  const [cancelResult, packageIdResult, fulfillmentResult, notesResult] = await Promise.all([
    order.status === "CANCELLED"
      ? fetchCancelInfo(supabase, order.id)
      : Promise.resolve<ColumnFetch<CancelInfo | null>>({ status: "ok", data: null }),
    fetchPackageId(supabase, order.id),
    fetchFulfillmentInfo(supabase, order.id),
    fetchInternalNotes(supabase, order.id),
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
        <Link href="/admin/orders">Pesanan Partner</Link> / {order.order_number}
      </div>
      <div className="pagehead">
        <h1>{order.order_number}</h1>
        <span className={`chip ${order.status === "REGISTERED" ? "ACTIVE" : "SUSPENDED"}`} style={{ fontSize: 14, padding: "5px 14px" }}>
          {order.status === "REGISTERED" ? "TERDAFTAR" : "DIBATALKAN"}
        </span>
      </div>

      {/* Attribution — harus sangat menonjol, bukan tersembunyi di bawah (SPEC §50). */}
      <div className="card accent">
        <div className="overline">PARTNER ORDER</div>
        <h2 style={{ fontSize: 21 }}>{partner?.name ?? "Partner tidak ditemukan"}</h2>
        <div style={{ fontSize: 16, fontWeight: 650, color: "var(--accent-2)", marginTop: 2 }}>
          Cabang {branch?.name ?? "tidak ditemukan"}
        </div>
        <div className="btnrow-inline">
          <CorrectAttributionButton
            orderId={order.id}
            currentBranchName={branch?.name ?? "tidak ditemukan"}
            otherBranches={otherBranches}
          />
        </div>
      </div>

      <div className="cardgrid-two">
        <div className="card">
          <h3 style={{ fontSize: 17, marginBottom: 12 }}>Customer</h3>
          <dl className="kv">
            <dt>Nama</dt>
            <dd>{customer?.full_name ?? "Pelanggan tidak diketahui"}</dd>
            <dt>Telepon</dt>
            <dd>{customer?.phone_normalized ? displayPhoneID(customer.phone_normalized) : "—"}</dd>
            <dt>WhatsApp</dt>
            <dd>{customer?.whatsapp || "—"}</dd>
          </dl>
        </div>

        <div className="card">
          <h3 style={{ fontSize: 17, marginBottom: 12 }}>Pesanan</h3>
          <dl className="kv">
            <dt>Package</dt>
            <dd>
              {order.package_name}
              {packageDetail && packageDetail.status === "INACTIVE" && (
                <span className="small muted"> (kode {packageDetail.code}, nonaktif)</span>
              )}
              {packageDetail && packageDetail.status === "ACTIVE" && (
                <span className="small muted"> (kode {packageDetail.code})</span>
              )}
            </dd>
            <dt>Sales</dt>
            <dd>
              {sales?.full_name ?? "—"}
              {sales && sales.status !== "ACTIVE" && <span className="small muted"> (nonaktif)</span>}
            </dd>
            <dt>PIC</dt>
            <dd>
              {pic?.full_name ?? "—"}
              {pic && pic.status !== "ACTIVE" && <span className="small muted"> (nonaktif)</span>}
            </dd>
            {fulfillmentResult.status === "missing-column" ? (
              <>
                <dt>Jalur</dt>
                <dd className="small muted">Migrasi belum dijalankan</dd>
              </>
            ) : fulfillmentResult.status === "error" ? (
              <>
                <dt>Jalur</dt>
                <dd>
                  <span className="err">Bagian ini gagal dimuat — muat ulang halaman.</span>{" "}
                  <Link href={`/admin/orders/${order.id}`} className="btn sm">
                    Coba Lagi
                  </Link>
                </dd>
              </>
            ) : (
              <>
                <dt>Jalur</dt>
                <dd>
                  {fulfillment?.fulfillment_path ? (
                    <span className="chip accent">{FULFILLMENT_PATH_LABEL[fulfillment.fulfillment_path]}</span>
                  ) : (
                    "—"
                  )}
                </dd>
                <dt>Total Belanja di Toko</dt>
                <dd>
                  {fulfillment?.partner_purchase_amount != null
                    ? formatIDR(fulfillment.partner_purchase_amount)
                    : "Belum dilaporkan"}
                </dd>
                <dt>Invoice</dt>
                <dd>
                  {fulfillment?.invoice_url ? (
                    invoiceUrl ? (
                      <a href={invoiceUrl} target="_blank" rel="noopener noreferrer" className="linkbtn">
                        Lihat Invoice
                      </a>
                    ) : (
                      <span className="small muted">Invoice belum bisa dimuat.</span>
                    )
                  ) : (
                    "Belum diunggah"
                  )}
                </dd>
              </>
            )}
            <dt>Catatan</dt>
            <dd>{order.notes || "—"}</dd>
            <dt>Dibuat</dt>
            <dd>
              {new Date(order.created_at).toLocaleString("id-ID", {
                day: "numeric",
                month: "long",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              · waktu server
            </dd>
          </dl>

          {/* Tandai kedatangan hanya untuk jalur SHOWROOM_VISIT (SPEC slice
              ini) — DIRECT_DELIVERY tidak pernah menampilkan bagian ini. */}
          {fulfillmentResult.status === "ok" && fulfillment?.fulfillment_path === "SHOWROOM_VISIT" && (
            fulfillment.customer_arrived_at ? (
              <div className="banner ok" style={{ marginTop: 14 }}>
                <strong>Pelanggan tiba</strong>{" "}
                {new Date(fulfillment.customer_arrived_at).toLocaleString("id-ID", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                · waktu server
              </div>
            ) : (
              <div className="btnrow-inline">
                <MarkArrivedButton
                  orderId={order.id}
                  customerName={customer?.full_name ?? "Pelanggan"}
                  orderNumber={order.order_number}
                />
              </div>
            )
          )}

          {order.status === "CANCELLED" && (
            <div className="banner" style={{ marginTop: 14 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Pesanan dibatalkan</div>
              {cancelResult.status === "missing-column" ? (
                <div>Info pembatalan belum tersedia (migrasi database belum dijalankan).</div>
              ) : cancelResult.status === "error" ? (
                <div>
                  <span className="err">Bagian ini gagal dimuat — muat ulang halaman.</span>{" "}
                  <Link href={`/admin/orders/${order.id}`} className="btn sm">
                    Coba Lagi
                  </Link>
                </div>
              ) : (
                <>
                  <div>Alasan: {cancelResult.data?.cancellation_reason || "—"}</div>
                  <div>
                    Waktu:{" "}
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

      {/* Catatan Internal SANCI — partner TIDAK PERNAH melihat kartu ini;
          ditegakkan oleh RLS admin-only di DB, bukan cuma disembunyikan di
          layar admin (LESSONS #5/#6). Append-only: tidak ada tombol
          edit/hapus di mana pun pada kartu ini. */}
      <div className="card">
        <h3 style={{ fontSize: 17, marginBottom: 4 }}>Catatan Internal SANCI</h3>
        <div className="banner warn" style={{ marginTop: 8 }}>
          Hanya terlihat oleh SANCI — partner tidak bisa melihat bagian ini.
        </div>
        {notesResult.unavailable ? (
          <div className="emptybox">Fitur catatan internal belum aktif — migrasi database belum dijalankan.</div>
        ) : (
          <>
            {notesResult.notes.length === 0 ? (
              <div className="emptybox">Belum ada catatan internal untuk pesanan ini.</div>
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
                      })}{" "}
                      · waktu server
                    </span>
                    <div>{n.note}</div>
                  </li>
                ))}
              </ul>
            )}
            <InternalNoteForm orderId={order.id} />
            <p className="footnote">
              Catatan internal hanya bertambah. Salah tulis dikoreksi dengan menambah catatan baru, bukan
              mengubah yang lama.
            </p>
          </>
        )}
      </div>

      <div className="card">
        <h3 style={{ fontSize: 17, marginBottom: 12 }}>Activity</h3>
        {audit.length === 0 ? (
          <div className="emptybox">Belum ada aktivitas tercatat untuk pesanan ini.</div>
        ) : (
          <ul className="audit-list">
            {audit.map((a) => {
              const diffLines = formatAuditDiff(a.before, a.after);
              // ORDER_ATTRIBUTION_CORRECTED: branch_id ada di daftar SKIP milik
              // formatAuditDiff (dianggap konteks, bukan nilai yang berubah) —
              // tapi untuk aksi ini justru itulah intinya (SPEC §64), jadi
              // diterjemahkan manual jadi nama cabang, bukan UUID mentah.
              const beforeBranch = a.before?.branch_id ? String(a.before.branch_id) : null;
              const afterBranch = a.after?.branch_id ? String(a.after.branch_id) : null;
              const attributionLine =
                a.action === "ORDER_ATTRIBUTION_CORRECTED" && (beforeBranch || afterBranch)
                  ? `Cabang: ${beforeBranch ? branchNameById.get(beforeBranch) ?? beforeBranch : "—"} → ${
                      afterBranch ? branchNameById.get(afterBranch) ?? afterBranch : "—"
                    }`
                  : null;
              return (
                <li key={a.id}>
                  <span className="act">{formatAuditAction(a.action)}</span>{" "}
                  <span className="muted">· {formatActorRole(a.actor_role)}</span>
                  <span className="ts">{new Date(a.created_at).toLocaleString("id-ID")} · waktu server</span>
                  {a.reason && <div className="diff">Alasan: {a.reason}</div>}
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
        <p className="footnote">
          Catatan audit hanya bertambah. Tidak ada yang bisa mengubah atau menghapusnya dari aplikasi.
        </p>
      </div>
    </div>
  );
}
