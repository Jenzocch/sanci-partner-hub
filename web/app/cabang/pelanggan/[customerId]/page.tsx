import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { displayPhoneID, isMissingTableError, type OrderStatus } from "@/lib/orders-shared";
import { getMessages } from "@/lib/i18n";
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
  customer_code?: string | null;
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

function formatDate(iso: string, dateLocale: string): string {
  try {
    return new Date(iso).toLocaleDateString(dateLocale, { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return iso;
  }
}

export default async function PelangganDetailPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const m = await getMessages();
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
          <div className="err">{m.cabang.errAccountLoad}</div>
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
  // dilihat cabang ini tidak akan pernah muncul di sini. customer_code
  // (migrasi 0017/0018/0019) BISA belum ada sebagai kolom kalau kodenya
  // sudah naik lebih dulu (LESSONS #12) — coba SELECT lebar dulu, turun ke
  // SELECT sempit kalau 42703, supaya halaman detail tetap tampil.
  let data: CustomerDetailRow | null = null;
  let error: { code?: string } | null = null;
  {
    const wide = await supabase
      .from("customers")
      .select(
        "id, full_name, phone, phone_normalized, whatsapp, address, city, province, notes, " +
          "created_via_partner_id, created_via_branch_id, customer_code"
      )
      .eq("id", customerId)
      .maybeSingle();
    if (wide.error && wide.error.code === "42703") {
      const narrow = await supabase
        .from("customers")
        .select(
          "id, full_name, phone, phone_normalized, whatsapp, address, city, province, notes, " +
            "created_via_partner_id, created_via_branch_id"
        )
        .eq("id", customerId)
        .maybeSingle();
      error = narrow.error;
      data = narrow.data
        ? ({ ...(narrow.data as unknown as Record<string, unknown>), customer_code: null } as unknown as CustomerDetailRow)
        : null;
    } else {
      error = wide.error;
      data = wide.data as CustomerDetailRow | null;
    }
  }

  if (error) {
    if (isMissingTableError(error)) {
      return (
        <main className="pwrap">
          <div className="card">
            <div className="banner bad">{m.cabang.errCustomerModuleInactive}</div>
          </div>
        </main>
      );
    }
    return (
      <main className="pwrap">
        <div className="card">
          <div className="err">{m.cabang.errCustomerDetailLoadFailed}</div>
          <Link href={`/cabang/pelanggan/${customerId}`} className="btn sm">
            {m.common.retry}
          </Link>
        </div>
      </main>
    );
  }
  if (!data) notFound();

  const customer = data;

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
          {m.cabang.navBackCustomers}
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
          {customer.customer_code && (
            <>
              <dt>{m.common.code}</dt>
              <dd>
                <span className="code">{customer.customer_code}</span>
              </dd>
            </>
          )}
          <dt>{m.common.phone}</dt>
          <dd>{displayPhoneID(customer.phone_normalized)}</dd>
          <dt>{m.common.whatsapp}</dt>
          <dd>{customer.whatsapp || "—"}</dd>
          <dt>{m.common.address}</dt>
          <dd>{customer.address || "—"}</dd>
          <dt>{m.common.city}</dt>
          <dd>{customer.city || "—"}</dd>
          <dt>{m.common.province}</dt>
          <dd>{customer.province || "—"}</dd>
          <dt>{m.common.notes}</dt>
          <dd>{customer.notes || "—"}</dd>
        </dl>
        {!canEdit && <p className="footnote">{m.cabang.customerOtherBranchNote}</p>}
      </div>

      <div className="overline">{m.cabang.orderHistoryTitle}</div>
      {orders.length === 0 ? (
        <div className="card emptybox">{m.cabang.noOrdersForCustomer}</div>
      ) : (
        <div className="cardlist">
          {orders.map((o) => {
            const branch = one(o.partner_branches);
            return (
              <Link key={o.id} href={`/cabang/pesanan/${o.id}`} className="reccard">
                <div className="rc-top">
                  <span className="code">{o.order_number}</span>
                  <StatusBadge status={o.status} messages={m} />
                </div>
                <div className="rc-title">{o.package_name}</div>
                <div className="rc-sub">
                  {branch?.name ?? "—"} · {formatDate(o.created_at, m.common.dateLocale)}
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
