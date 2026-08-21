import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCabangMessages } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function AkunSayaPage() {
  const m = await getCabangMessages();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  // Kebijakan akses diambil terpisah — tidak ada FK partner_users →
  // partner_access_policies, embed langsung ditolak PostgREST saat runtime.
  const { data: pu, error: puError } = await supabase
    .from("partner_users")
    .select("name, role, partner_id, partners:partner_id(name), partner_branches:branch_id(name)")
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
  // belum punya baris kebijakan sebelum migration 0006, atau partner_user
  // berstatus DISABLED) — jangan crash.
  const partner = pu.partners as unknown as { name: string } | null;
  const branch = pu.partner_branches as unknown as { name: string } | null;
  if (!partner || !branch) {
    return (
      <main className="pwrap">
        <div className="card">
          <div className="err">{m.cabang.errPartnerBranchLoad}</div>
        </div>
      </main>
    );
  }

  const { data: pol } = await supabase
    .from("partner_access_policies")
    .select("visibility_scope, edit_scope")
    .eq("partner_id", pu.partner_id)
    .maybeSingle();
  const visLabel =
    pol?.visibility_scope === "PARTNER_ALL_BRANCHES"
      ? `${m.common.scopePartnerAll} · ${pol.edit_scope === "PARTNER_ALL_BRANCHES" ? m.cabang.homeAccessViewEdit : m.cabang.homeAccessViewOnly}`
      : m.common.scopeOwnBranch;

  return (
    <main className="pwrap">
      <div className="backrow">
        <Link href="/cabang" className="linkbtn">
          {m.cabang.navBackHome}
        </Link>
      </div>
      <h2 className="mtitle">{m.cabang.homeMyAccount}</h2>
      <div className="card">
        <dl className="kv">
          <dt>{m.common.name}</dt>
          <dd>{pu.name}</dd>
          <dt>{m.cabang.loginIdentityDt}</dt>
          <dd>
            {partner.name} · {branch.name}
          </dd>
          <dt>{m.common.role}</dt>
          <dd>{pu.role}</dd>
          <dt>{m.common.visibilityScope}</dt>
          <dd>{visLabel}</dd>
        </dl>
        <p className="footnote">{m.cabang.akunFootnote}</p>
      </div>
    </main>
  );
}
