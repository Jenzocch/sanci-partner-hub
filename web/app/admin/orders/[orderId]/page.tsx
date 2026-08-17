import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { displayPhoneID, isMissingTableError } from "@/lib/orders-shared";
import { formatActorRole, formatAuditAction, formatAuditDiff } from "@/lib/audit-format";
import CorrectAttributionButton, { type BranchOption } from "./correct-attribution-button";

export const dynamic = "force-dynamic";

const MISSING_TABLE_MSG = "Modul Pesanan belum aktif di database (migrasi belum dijalankan).";

type One<T> = T | T[] | null;
function one<T>(v: One<T>): T | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

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
): Promise<{ info: CancelInfo | null; unavailable: boolean }> {
  const { data, error } = await supabase
    .from("partner_orders")
    .select("cancelled_at, cancellation_reason")
    .eq("id", orderId)
    .maybeSingle();
  if (error) return { info: null, unavailable: error.code === "42703" };
  return { info: (data as CancelInfo | null) ?? null, unavailable: false };
}

/**
 * package_id (migration 0008, dikerjakan paralel) juga dibaca terpisah dengan
 * alasan yang sama: kode ini boleh naik sebelum SQL-nya dijalankan.
 */
async function fetchPackageId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderId: string
): Promise<{ packageId: string | null; unavailable: boolean }> {
  const { data, error } = await supabase
    .from("partner_orders")
    .select("package_id")
    .eq("id", orderId)
    .maybeSingle();
  if (error) return { packageId: null, unavailable: error.code === "42703" };
  return { packageId: (data as { package_id: string | null } | null)?.package_id ?? null, unavailable: false };
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

  const [cancelResult, packageIdResult] = await Promise.all([
    order.status === "CANCELLED"
      ? fetchCancelInfo(supabase, order.id)
      : Promise.resolve({ info: null, unavailable: false }),
    fetchPackageId(supabase, order.id),
  ]);
  const packageDetail = packageIdResult.packageId
    ? await fetchPackageDetail(supabase, packageIdResult.packageId)
    : null;

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

          {order.status === "CANCELLED" && (
            <div className="banner" style={{ marginTop: 14 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Pesanan dibatalkan</div>
              {cancelResult.unavailable ? (
                <div>Info pembatalan belum tersedia (migrasi database belum dijalankan).</div>
              ) : (
                <>
                  <div>Alasan: {cancelResult.info?.cancellation_reason || "—"}</div>
                  <div>
                    Waktu:{" "}
                    {cancelResult.info?.cancelled_at
                      ? new Date(cancelResult.info.cancelled_at).toLocaleString("id-ID", {
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
