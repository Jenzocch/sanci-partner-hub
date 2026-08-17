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
          <div className="err">Data akun gagal dimuat. Muat ulang halaman untuk mencoba lagi.</div>
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
          <div className="err">
            Data partner/cabang Anda tidak dapat dimuat. Hubungi SANCI Admin untuk memeriksa
            pengaturan akun dan izin cabang.
          </div>
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
        <p className="footnote">
          Identitas cabang Anda ditetapkan oleh SANCI — tidak ada pilihan ganti cabang. Akun dibuat
          dan dikelola oleh SANCI Admin.
        </p>
      </div>
    </main>
  );
}
