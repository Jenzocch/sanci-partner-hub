import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NewOrderForm from "./new-order-form";

export const dynamic = "force-dynamic";

type Assignment = { staff_id: string; role: string };

/**
 * Jalur Pesanan (fulfillment_path, migration 0009) mungkin belum ada di
 * server sesi ini — kode boleh naik duluan sebelum SQL dijalankan (LESSONS
 * #12). Diprobe TERPISAH, pola sama dengan fetchOrderExtras di halaman
 * detail (`[orderId]/page.tsx`): kalau 42703, form TIDAK BOLEH merender
 * radio Jalur Pesanan sama sekali — user tidak boleh dipaksa menjawab
 * pertanyaan yang jawabannya pasti dibuang diam-diam oleh fallback insert.
 * `.limit(1)` cukup: planner memeriksa keberadaan kolom terlepas dari ada
 * tidaknya baris yang cocok, jadi tidak butuh order yang sudah ada.
 */
async function fetchFulfillmentAvailable(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<boolean> {
  const { error } = await supabase.from("partner_orders").select("fulfillment_path").limit(1);
  return !error;
}

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

  // Package (migration 0008) — kalau tabelnya belum ada (42P01), form turun
  // ke input teks bebas diam-diam; ini keadaan transisi yang wajar (LESSONS
  // #12). Error LAIN (RLS berubah, timeout) TIDAK boleh disamarkan jadi
  // "partner ini memang belum punya package" — form tetap turun ke manual
  // (tidak boleh macet), tapi pengguna diberi tahu supaya tidak salah paham
  // kenapa dropdown-nya kosong (P3, sepupu LESSONS #10).
  const { data: packageRows, error: packagesError } = await supabase
    .from("partner_packages")
    .select("id, name")
    .eq("partner_id", pu.partner_id)
    .eq("status", "ACTIVE")
    .order("name");
  const packages = (packageRows ?? []).map((p) => ({ id: p.id, name: p.name }));
  const packagesLoadError = !!packagesError && packagesError.code !== "42P01";

  const fulfillmentAvailable = await fetchFulfillmentAvailable(supabase);

  return (
    <main className="pwrap">
      <div className="backrow">
        <Link href="/cabang/pesanan" className="linkbtn">
          ← Daftar Pesanan
        </Link>
      </div>
      <h2 className="mtitle">Pelanggan &amp; Pesanan Baru</h2>
      <p className="footnote" style={{ marginTop: 0, marginBottom: 16 }}>
        {partner.name} · Cabang {branch.name}
      </p>
      <NewOrderForm
        branchId={pu.branch_id}
        staffOptions={staffOptions}
        packages={packages}
        packagesLoadError={packagesLoadError}
        fulfillmentAvailable={fulfillmentAvailable}
      />
    </main>
  );
}
