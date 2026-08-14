import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CabangHome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: pu, error } = await supabase
    .from("partner_users")
    .select(
      "name, role, partners:partner_id(name, code), partner_branches:branch_id(name, address, city)"
    )
    .maybeSingle();

  if (error) {
    return (
      <main className="page">
        <div className="card err" style={{ margin: 0 }}>
          Data akun gagal dimuat. Muat ulang halaman untuk mencoba lagi.
        </div>
      </main>
    );
  }
  if (!pu) redirect("/");

  const partner = pu.partners as unknown as { name: string; code: string };
  const branch = pu.partner_branches as unknown as {
    name: string;
    address: string;
    city: string | null;
  };

  return (
    <main className="page" style={{ maxWidth: 520 }}>
      <div className="card">
        <div className="code" style={{ marginBottom: 10 }}>
          {partner.code}
        </div>
        <h1>{partner.name}</h1>
        <p style={{ fontWeight: 650, color: "var(--accent-2)" }}>
          Cabang {branch.name}
        </p>
        <p className="sub" style={{ marginTop: 6 }}>
          {branch.address}
          {branch.city ? `, ${branch.city}` : ""}
        </p>
        <p>Halo, {pu.name}.</p>
      </div>
      <p className="note">
        Layar cabang lengkap (Staf, Profil Cabang, Akun Saya) menyusul —
        mengikuti prototipe yang sudah disetujui.
      </p>
    </main>
  );
}
