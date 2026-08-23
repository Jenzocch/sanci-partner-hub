import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isMissingTableError } from "@/lib/orders-shared";
import { getCabangMessages } from "@/lib/i18n";
import OrderListClient, { type OrderListItem } from "./order-list-client";

export const dynamic = "force-dynamic";


type OrderRow = {
  id: string;
  order_number: string;
  package_name: string;
  status: "REGISTERED" | "CANCELLED";
  created_at: string;
  branch_id: string;
  customers: { full_name: string; phone_normalized: string } | { full_name: string; phone_normalized: string }[] | null;
  partner_branches: { name: string } | { name: string }[] | null;
  sales: { full_name: string } | { full_name: string }[] | null;
};

function one<T>(v: T | T[] | null): T | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function PesananListPage() {
  const m = await getCabangMessages();
  const supabase = await createClient();
  // Tanpa auth.getUser(): batas keamanannya RLS, bukan cek halaman (LESSONS
  // #5) — untuk pengunjung yang belum login, pembacaan partner_users ini
  // pulang kosong, jadi `!pu` → redirect sama persis; middleware sudah
  // menyegarkan sesi tiap navigasi. Beda error vs kosong TETAP dijaga
  // (LESSONS #10): error DB → kartu error, hanya hasil kosong di-redirect.
  //
  // Kebijakan akses diambil terpisah — tidak ada FK partner_users →
  // partner_access_policies, embed langsung ditolak PostgREST saat runtime.
  const { data: pu, error: puError } = await supabase
    .from("partner_users")
    .select("branch_id, partner_id")
    .maybeSingle();
  if (puError) {
    return (
      <main className="page">
        <div className="card">
          <div className="err">{m.cabang.errAccountLoad}</div>
        </div>
      </main>
    );
  }
  if (!pu) redirect("/");

  // Kebijakan (hanya flag tampilan crossBranchVisible) dan daftar order
  // tidak saling bergantung — RLS pada partner_orders sudah membatasi baris
  // sesuai kebijakan visibilitas; query di sini hanya membaca hasil yang
  // sudah difilter, bukan filter tambahan. Dijalankan berbarengan, bukan
  // berurutan (audit kecepatan 2026-08-22, temuan #6).
  const [{ data: pol }, { data: orders, error }] = await Promise.all([
    supabase
      .from("partner_access_policies")
      .select("visibility_scope")
      .eq("partner_id", pu.partner_id)
      .maybeSingle(),
    supabase
      .from("partner_orders")
      .select(
        "id, order_number, package_name, status, created_at, branch_id, customers:customer_id(full_name, phone_normalized), partner_branches:branch_id(name), sales:partner_sales_staff_id(full_name)"
      )
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  const crossBranchVisible = pol?.visibility_scope === "PARTNER_ALL_BRANCHES";

  let errorKind: "missing_table" | "other" | null = null;
  if (error) {
    errorKind = isMissingTableError(error) ? "missing_table" : "other";
  }

  const items: OrderListItem[] = (orders as OrderRow[] | null ?? []).map((o) => {
    const customer = one(o.customers);
    const branch = one(o.partner_branches);
    const sales = one(o.sales);
    return {
      id: o.id,
      orderNumber: o.order_number,
      packageName: o.package_name,
      status: o.status,
      createdAt: o.created_at,
      customerName: customer?.full_name ?? m.cabang.orderUnknownCustomer,
      customerPhone: customer?.phone_normalized ?? "",
      salesName: sales?.full_name ?? null,
      branchId: o.branch_id,
      branchName: branch?.name ?? "—",
    };
  });

  return (
    <main className="pwrap">
      <div className="backrow">
        <Link href="/cabang" className="linkbtn">
          {m.cabang.navBackHome}
        </Link>
      </div>
      <div className="worktop">
        <h2 className="mtitle" style={{ marginBottom: 0 }}>
          {m.cabang.homeOrders}
        </h2>
        <Link href="/cabang/pesanan/baru" className="btn primary sm">
          {m.cabang.homeNewOrder}
        </Link>
      </div>
      <OrderListClient items={items} errorKind={errorKind} ownBranchId={pu.branch_id} crossBranchVisible={crossBranchVisible} />
    </main>
  );
}
