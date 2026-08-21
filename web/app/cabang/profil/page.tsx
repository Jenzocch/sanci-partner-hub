import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMessages } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function ProfilCabangPage() {
  const m = await getMessages();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: pu, error: puError } = await supabase
    .from("partner_users")
    .select("partners:partner_id(name), partner_branches:branch_id(name, code, address, city, province, contact_phone)")
    .maybeSingle();
  // maybeSingle() error di sini biasanya berarti lebih dari satu baris cocok —
  // terjadi kalau akun SANCI Admin (RLS-nya melihat SEMUA partner_users) membuka
  // URL /cabang/* langsung tanpa lewat halaman login (LESSONS #24 sepupu).
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

  // Embed bisa null bila RLS menyembunyikan baris partner/cabang (mis. partner
  // belum punya baris kebijakan sebelum migration 0006) — jangan crash.
  const partner = pu.partners as unknown as { name: string } | null;
  const branch = pu.partner_branches as unknown as {
    name: string;
    code: string;
    address: string;
    city: string | null;
    province: string | null;
    contact_phone: string | null;
  } | null;
  if (!partner || !branch) {
    return (
      <main className="pwrap">
        <div className="card">
          <div className="err">{m.cabang.errPartnerBranchLoad}</div>
        </div>
      </main>
    );
  }

  return (
    <main className="pwrap">
      <div className="backrow">
        <Link href="/cabang" className="linkbtn">
          {m.cabang.navBackHome}
        </Link>
      </div>
      <h2 className="mtitle">{m.cabang.homeBranchProfile}</h2>
      <div className="card">
        <dl className="kv">
          <dt>{m.common.partner}</dt>
          <dd>{partner.name}</dd>
          <dt>{m.common.branch}</dt>
          <dd>{branch.name}</dd>
          <dt>{m.common.address}</dt>
          <dd>{branch.address}</dd>
          <dt>{m.common.city}</dt>
          <dd>{branch.city || "—"}</dd>
          <dt>{m.common.province}</dt>
          <dd>{branch.province || "—"}</dd>
          <dt>{m.common.whatsapp}</dt>
          <dd>{branch.contact_phone || "—"}</dd>
        </dl>
        <p className="footnote">{m.cabang.profilFootnote}</p>
      </div>
    </main>
  );
}
