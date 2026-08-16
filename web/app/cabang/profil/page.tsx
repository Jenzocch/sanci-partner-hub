import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProfilCabangPage() {
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
          <div className="err">Data akun gagal dimuat. Muat ulang halaman untuk mencoba lagi.</div>
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
          <div className="err">
            Data partner/cabang Anda tidak dapat dimuat. Hubungi SANCI Admin untuk memeriksa
            pengaturan akun dan izin cabang.
          </div>
        </div>
      </main>
    );
  }

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
