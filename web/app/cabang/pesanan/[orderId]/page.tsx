import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { displayPhoneID, isMissingTableError } from "@/lib/orders-shared";
import StatusBadge from "../status-badge";

export const dynamic = "force-dynamic";

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
  customers: One<{ full_name: string; phone_normalized: string; whatsapp: string | null }>;
  partner_branches: One<{ name: string }>;
  partners: One<{ name: string; code: string }>;
  sales: One<{ full_name: string; status: string }>;
  pic: One<{ full_name: string; status: string }>;
};

export default async function PesananDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: pu } = await supabase.from("partner_users").select("branch_id").maybeSingle();
  if (!pu) redirect("/");

  // RLS pada partner_orders membatasi baris: order di cabang yang tidak boleh
  // dilihat pengguna ini tidak akan pernah muncul di sini.
  const { data, error } = await supabase
    .from("partner_orders")
    .select(
      "id, order_number, package_name, status, notes, created_at, branch_id, " +
        "customers:customer_id(full_name, phone_normalized, whatsapp), " +
        "partner_branches:branch_id(name), partners:partner_id(name, code), " +
        "sales:partner_sales_staff_id(full_name, status), pic:partner_pic_staff_id(full_name, status)"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return (
        <main className="pwrap">
          <div className="card">
            <div className="banner bad">
              Modul Pesanan belum aktif di database (migrasi belum dijalankan). Hubungi SANCI Admin.
            </div>
          </div>
        </main>
      );
    }
    return (
      <main className="pwrap">
        <div className="card">
          <div className="err">Gagal memuat detail pesanan.</div>
          <Link href={`/cabang/pesanan/${orderId}`} className="btn sm">
            Coba Lagi
          </Link>
        </div>
      </main>
    );
  }
  if (!data) notFound();

  const order = data as unknown as OrderDetailRow;
  const customer = one(order.customers);
  const branch = one(order.partner_branches);
  const partner = one(order.partners);
  const sales = one(order.sales);
  const pic = one(order.pic);
  const isOtherBranch = order.branch_id !== pu.branch_id;

  return (
    <main className="pwrap">
      <div className="backrow">
        <Link href="/cabang/pesanan" className="linkbtn">
          ← Daftar Pesanan
        </Link>
      </div>

      <div className="idcard">
        <div className="small muted" style={{ fontWeight: 700, letterSpacing: ".04em", marginBottom: 6 }}>
          PARTNER ORDER
        </div>
        <h2>{partner?.name ?? "—"}</h2>
        <div className="br">Cabang {branch?.name ?? "—"}</div>
        {isOtherBranch && (
          <div className="banner" style={{ background: "var(--accent-soft)", color: "var(--accent-2)", marginTop: 10, marginBottom: 0 }}>
            Cabang lain — hanya lihat.
          </div>
        )}
      </div>

      <div className="card">
        <div className="row1" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span className="code" style={{ fontSize: 15 }}>
            {order.order_number}
          </span>
          <StatusBadge status={order.status} />
        </div>
        <dl className="kv">
          <dt>Pelanggan</dt>
          <dd>{customer?.full_name ?? "Pelanggan tidak diketahui"}</dd>
          <dt>WhatsApp</dt>
          <dd>{customer?.phone_normalized ? displayPhoneID(customer.phone_normalized) : "—"}</dd>
          <dt>Package</dt>
          <dd>{order.package_name}</dd>
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
            })}
          </dd>
        </dl>
        <p className="small muted" style={{ marginTop: 14 }}>
          Pesanan ini hanya bisa dilihat dari sisi cabang. Perubahan status atau pembatalan dilakukan oleh SANCI.
        </p>
      </div>
    </main>
  );
}
