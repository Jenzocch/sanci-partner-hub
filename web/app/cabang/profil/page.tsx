import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProfilCabangPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: pu } = await supabase
    .from("partner_users")
    .select("partners:partner_id(name), partner_branches:branch_id(name, code, address, city, province, contact_phone)")
    .maybeSingle();
  if (!pu) redirect("/");

  const partner = pu.partners as unknown as { name: string };
  const branch = pu.partner_branches as unknown as {
    name: string;
    code: string;
    address: string;
    city: string | null;
    province: string | null;
    contact_phone: string | null;
  };

  return (
    <main className="pwrap">
      <div className="backrow">
        <a href="/cabang" className="linkbtn">
          ← Beranda
        </a>
      </div>
      <h2 className="mtitle">Profil Cabang</h2>
      <div className="card">
        <dl className="kv">
          <dt>Partner</dt>
          <dd>{partner.name}</dd>
          <dt>Cabang</dt>
          <dd>{branch.name}</dd>
          <dt>Alamat</dt>
          <dd>{branch.address}</dd>
          <dt>Kota</dt>
          <dd>{branch.city || "—"}</dd>
          <dt>Provinsi</dt>
          <dd>{branch.province || "—"}</dd>
          <dt>WhatsApp</dt>
          <dd>{branch.contact_phone || "—"}</dd>
        </dl>
        <p className="small muted" style={{ marginTop: 14 }}>
          Alamat atau kontak salah? Hubungi SANCI Admin untuk memperbarui.
        </p>
      </div>
    </main>
  );
}
