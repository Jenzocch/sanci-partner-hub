import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isMissingTableError } from "@/lib/orders-shared";
import { getMessages } from "@/lib/i18n";
import CustomerListClient, { type CustomerListItem } from "./customer-list-client";

export const dynamic = "force-dynamic";

export default async function PelangganListPage() {
  const m = await getMessages();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

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

  // RLS (fn_can_view_customer) sudah membatasi baris ke pelanggan yang boleh
  // dilihat cabang ini — tidak perlu filter tambahan di sini (SPEC §32).
  const { data: customers, error } = await supabase
    .from("customers")
    .select("id, full_name, phone_normalized")
    .order("full_name")
    .limit(100);

  let errorKind: "missing_table" | "other" | null = null;
  if (error) {
    errorKind = isMissingTableError(error) ? "missing_table" : "other";
  }

  const ids = (customers ?? []).map((c) => c.id);
  const orderCounts = new Map<string, number>();
  if (ids.length > 0) {
    // Hitung jumlah pesanan per pelanggan lewat query terpisah — RLS pada
    // partner_orders otomatis membatasi ke order yang boleh dilihat cabang
    // ini juga, jadi angkanya konsisten dengan yang muncul di detail (§77).
    const { data: orderRows } = await supabase.from("partner_orders").select("customer_id").in("customer_id", ids);
    (orderRows ?? []).forEach((o: { customer_id: string }) => {
      orderCounts.set(o.customer_id, (orderCounts.get(o.customer_id) ?? 0) + 1);
    });
  }

  const items: CustomerListItem[] = (customers ?? []).map((c) => ({
    id: c.id,
    fullName: c.full_name,
    phoneNormalized: c.phone_normalized,
    orderCount: orderCounts.get(c.id) ?? 0,
  }));

  return (
    <main className="pwrap">
      <div className="backrow">
        <Link href="/cabang" className="linkbtn">
          {m.cabang.navBackHome}
        </Link>
      </div>
      <div className="worktop">
        <h2 className="mtitle" style={{ marginBottom: 0 }}>
          {m.common.customer}
        </h2>
        <Link href="/cabang/pesanan/baru" className="btn primary sm">
          {m.cabang.newCustomerCta}
        </Link>
      </div>
      <CustomerListClient items={items} errorKind={errorKind} />
    </main>
  );
}
