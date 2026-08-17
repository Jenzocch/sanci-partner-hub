import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { displayPhoneID, isMissingTableError, type OrderStatus } from "@/lib/orders-shared";
import StatusBadge from "../../pesanan/status-badge";
import CustomerEditActions from "./customer-edit-actions";

export const dynamic = "force-dynamic";

type One<T> = T | T[] | null;
function one<T>(v: One<T>): T | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

type CustomerDetailRow = {
  id: string;
  full_name: string;
  phone: string;
  phone_normalized: string;
  whatsapp: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  notes: string | null;
  created_via_partner_id: string | null;
  created_via_branch_id: string | null;
};

type OrderHistoryRow = {
  id: string;
  order_number: string;
  package_name: string;
  status: OrderStatus;
  created_at: string;
  branch_id: string;
  partner_branches: One<{ name: string }>;
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return iso;
  }
}

export default async function PelangganDetailPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  // edit_scope diambil terpisah — tidak ada FK partner_users →
  // partner_access_policies, embed langsung ditolak PostgREST saat runtime
  // (LESSONS #24).
  const { data: pu, error: puError } = await supabase
    .from("partner_users")
    .select("branch_id, partner_id")
    .maybeSingle();
  if (puError) {
    return (
      <main className="pwrap">
        <div className="card">
          <div className="err">Data akun gagal dimuat. Muat ulang halaman untuk mencoba lagi.</div>
        </div>
      </main>
    );
  }
  if (!pu) redirect("/");

  const { data: puPolicy } = await supabase
    .from("partner_access_policies")
    .select("edit_scope")
    .eq("partner_id", pu.partner_id)
    .maybeSingle();

  // RLS (fn_can_view_customer) membatasi baris — pelanggan yang tidak boleh
  // dilihat cabang ini tidak akan pernah muncul di sini.
  const { data, error } = await supabase
    .from("customers")
    .select(
      "id, full_name, phone, phone_normalized, whatsapp, address, city, province, notes, " +
        "created_via_partner_id, created_via_branch_id"
    )
    .eq("id", customerId)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return (
        <main className="pwrap">
          <div className="card">
            <div className="banner bad">
              Modul Pelanggan belum aktif di database (migrasi belum dijalankan). Hubungi SANCI Admin.
            </div>
          </div>
        </main>
      );
    }
    return (
      <main className="pwrap">
        <div className="card">
          <div className="err">Gagal memuat detail pelanggan.</div>
          <Link href={`/cabang/pelanggan/${customerId}`} className="btn sm">
            Coba Lagi
          </Link>
        </div>
      </main>
    );
  }
  if (!data) notFound();

  const customer = data as unknown as CustomerDetailRow;

  // Sama seperti canEditBranch di /cabang/pesanan/[orderId]: cabang yang
  // membuat pelanggan ini selalu boleh mengubah; cabang lain hanya boleh
  // kalau kebijakan partner ini "Lihat + Edit" (SPEC §34).
  const canEdit =
    customer.created_via_branch_id === pu.branch_id ||
    (puPolicy?.edit_scope === "PARTNER_ALL_BRANCHES" && customer.created_via_partner_id === pu.partner_id);

  // Customer History (SPEC §52–53): semua Order yang boleh dilihat cabang ini
  // untuk pelanggan ini, lintas cabang & lintas waktu — bukan cuma order
  // terbaru. RLS pada partner_orders sudah membatasi baris yang kembali.
  const { data: orderRows } = await supabase
    .from("partner_orders")
    .select("id, order_number, package_name, status, created_at, branch_id, partner_branches:branch_id(name)")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(50);
  const orders = (orderRows as OrderHistoryRow[] | null) ?? [];

  return (
    <main className="pwrap">
      <div className="backrow">
        <Link href="/cabang/pelanggan" className="linkbtn">
          ← Pelanggan
        </Link>
      </div>

      <div className="card">
        <div className="spread" style={{ marginBottom: 12 }}>
          <h2 style={{ fontSize: "var(--fs-h3)" }}>{customer.full_name}</h2>
          {canEdit && (
            <CustomerEditActions
              customer={{
                id: customer.id,
                fullName: customer.full_name,
                phone: customer.phone,
                whatsapp: customer.whatsapp,
                address: customer.address,
                city: customer.city,
                province: customer.province,
                notes: customer.notes,
              }}
            />
          )}
        </div>
        <dl className="kv">
          <dt>Telepon</dt>
          <dd>{displayPhoneID(customer.phone_normalized)}</dd>
          <dt>WhatsApp</dt>
          <dd>{customer.whatsapp || "—"}</dd>
          <dt>Alamat</dt>
          <dd>{customer.address || "—"}</dd>
          <dt>Kota</dt>
          <dd>{customer.city || "—"}</dd>
          <dt>Provinsi</dt>
          <dd>{customer.province || "—"}</dd>
          <dt>Catatan</dt>
          <dd>{customer.notes || "—"}</dd>
        </dl>
        {!canEdit && <p className="footnote">Pelanggan ini dibuat oleh cabang lain — hanya bisa dilihat dari sini.</p>}
      </div>

      <div className="overline">Riwayat Pesanan</div>
      {orders.length === 0 ? (
        <div className="card emptybox">Belum ada pesanan untuk pelanggan ini.</div>
      ) : (
        <div className="cardlist">
          {orders.map((o) => {
            const branch = one(o.partner_branches);
            return (
              <Link key={o.id} href={`/cabang/pesanan/${o.id}`} className="reccard">
                <div className="rc-top">
                  <span className="code">{o.order_number}</span>
                  <StatusBadge status={o.status} />
                </div>
                <div className="rc-title">{o.package_name}</div>
                <div className="rc-sub">
                  {branch?.name ?? "—"} · {formatDate(o.created_at)}
                </div>
                <span className="rc-arrow" aria-hidden="true">&rsaquo;</span>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
