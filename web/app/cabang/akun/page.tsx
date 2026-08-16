import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AkunSayaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  // Kebijakan akses diambil terpisah — tidak ada FK partner_users →
  // partner_access_policies, embed langsung ditolak PostgREST saat runtime.
  const { data: pu } = await supabase
    .from("partner_users")
    .select("name, role, partner_id, partners:partner_id(name), partner_branches:branch_id(name)")
    .maybeSingle();
  if (!pu) redirect("/");

  const partner = pu.partners as unknown as { name: string };
  const branch = pu.partner_branches as unknown as { name: string };
  const { data: pol } = await supabase
    .from("partner_access_policies")
    .select("visibility_scope, edit_scope")
    .eq("partner_id", pu.partner_id)
    .maybeSingle();
  const visLabel =
    pol?.visibility_scope === "PARTNER_ALL_BRANCHES"
      ? `Sesama partner · ${pol.edit_scope === "PARTNER_ALL_BRANCHES" ? "Lihat + Edit" : "Lihat saja"}`
      : "Cabang sendiri";

  return (
    <main className="pwrap">
      <div className="backrow">
        <a href="/cabang" className="linkbtn">
          ← Beranda
        </a>
      </div>
      <h2 className="mtitle">Akun Saya</h2>
      <div className="card">
        <dl className="kv">
          <dt>Nama</dt>
          <dd>{pu.name}</dd>
          <dt>Identitas login</dt>
          <dd>
            {partner.name} · {branch.name}
          </dd>
          <dt>Peran</dt>
          <dd>{pu.role}</dd>
          <dt>Visibilitas</dt>
          <dd>{visLabel}</dd>
        </dl>
        <p className="small muted" style={{ marginTop: 14 }}>
          Identitas cabang Anda ditetapkan oleh SANCI — tidak ada pilihan ganti cabang. Akun dibuat
          dan dikelola oleh SANCI Admin.
        </p>
      </div>
    </main>
  );
}
