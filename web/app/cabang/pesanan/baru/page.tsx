import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NewOrderForm from "./new-order-form";

export const dynamic = "force-dynamic";

type Assignment = { staff_id: string; role: string };

export default async function PesananBaruPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: pu, error } = await supabase
    .from("partner_users")
    .select("partner_id, branch_id, partners:partner_id(name), partner_branches:branch_id(name)")
    .maybeSingle();

  if (error) {
    return (
      <main className="page">
        <div className="card">
          <div className="err">Data akun gagal dimuat. Muat ulang halaman untuk mencoba lagi.</div>
        </div>
      </main>
    );
  }
  if (!pu) redirect("/");

  // Embed bisa null bila RLS menyembunyikan baris partner/cabang (mis. partner
  // belum punya baris kebijakan sebelum migration 0006) — jangan crash.
  const partner = pu.partners as unknown as { name: string } | null;
  const branch = pu.partner_branches as unknown as { name: string } | null;
  if (!partner || !branch) {
    return (
      <main className="pwrap">
        <div className="card">
          <div className="err">
            Data partner/cabang Anda tidak dapat dimuat. Hubungi SANCI Admin untuk memeriksa
            pengaturan akun dan izin cabang.
          </div>
        </div>
      </main>
    );
  }

  // Staf aktif cabang ini — pola sama seperti /cabang/staff/[branchId].
  const [{ data: staffList }, { data: assignments }] = await Promise.all([
    supabase.from("partner_staff").select("id, full_name, status").eq("partner_id", pu.partner_id),
    supabase
      .from("partner_staff_assignments")
      .select("staff_id, role")
      .eq("branch_id", pu.branch_id)
      .is("end_at", null),
  ]);

  const roleByStaff = new Map<string, string>();
  (assignments ?? []).forEach((a: Assignment) => roleByStaff.set(a.staff_id, a.role));
  const staffOptions = (staffList ?? [])
    .filter((s) => s.status === "ACTIVE" && roleByStaff.has(s.id))
    .map((s) => ({ id: s.id, fullName: s.full_name, role: roleByStaff.get(s.id)! }));

  return (
    <main className="pwrap">
      <div className="backrow">
        <Link href="/cabang/pesanan" className="linkbtn">
          ← Daftar Pesanan
        </Link>
      </div>
      <h2 className="mtitle">Pelanggan &amp; Pesanan Baru</h2>
      <p className="small muted" style={{ marginTop: -8, marginBottom: 16 }}>
        {partner.name} · Cabang {branch.name}
      </p>
      <NewOrderForm branchId={pu.branch_id} staffOptions={staffOptions} />
    </main>
  );
}
