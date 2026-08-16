import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isMissingTableError } from "@/lib/orders-shared";
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

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
          <div className="err">Data akun gagal dimuat. Muat ulang halaman untuk mencoba lagi.</div>
        </div>
      </main>
    );
  }
  if (!pu) redirect("/");

  const { data: pol } = await supabase
    .from("partner_access_policies")
    .select("visibility_scope")
    .eq("partner_id", pu.partner_id)
    .maybeSingle();
  const crossBranchVisible = pol?.visibility_scope === "PARTNER_ALL_BRANCHES";

  // RLS pada partner_orders sudah membatasi baris sesuai kebijakan visibilitas —
  // query di sini hanya membaca hasil yang sudah difilter, bukan filter tambahan.
  const { data: orders, error } = await supabase
    .from("partner_orders")
    .select(
      "id, order_number, package_name, status, created_at, branch_id, customers:customer_id(full_name, phone_normalized), partner_branches:branch_id(name), sales:partner_sales_staff_id(full_name)"
    )
    .order("created_at", { ascending: false })
    .limit(100);

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
      customerName: customer?.full_name ?? "Pelanggan tidak diketahui",
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
          ← Beranda
        </Link>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <h2 className="mtitle" style={{ marginBottom: 0 }}>
          Daftar Pesanan
        </h2>
        <Link href="/cabang/pesanan/baru" className="btn primary sm">
          + Pesanan Baru
        </Link>
      </div>
      <OrderListClient items={items} errorKind={errorKind} ownBranchId={pu.branch_id} crossBranchVisible={crossBranchVisible} />
    </main>
  );
}
