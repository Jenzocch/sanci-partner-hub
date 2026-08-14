import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const SLBL: Record<string, string> = {
  ACTIVE: "AKTIF",
  DRAFT: "DRAF",
  SUSPENDED: "DITANGGUHKAN",
  INACTIVE: "NONAKTIF",
};

export default async function AdminHome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: admin } = await supabase
    .from("platform_admins")
    .select("auth_user_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!admin) redirect("/");

  const { data: partners, error } = await supabase
    .from("partners")
    .select("id, name, code, status")
    .order("name");

  return (
    <main className="page">
      <h1>Partner</h1>
      <p className="sub">SANCI Admin · smoke test koneksi database</p>
      {error ? (
        <div className="card err" style={{ margin: 0 }}>
          Daftar partner gagal dimuat. Muat ulang halaman untuk mencoba lagi.
        </div>
      ) : !partners || partners.length === 0 ? (
        <div className="card">Belum ada partner.</div>
      ) : (
        <div className="card">
          {partners.map((p) => (
            <div className="rowline" key={p.id}>
              <span>
                <strong>{p.name}</strong>{" "}
                <span className="code">{p.code}</span>
              </span>
              <span className={`chip ${p.status}`}>
                {SLBL[p.status] ?? p.status}
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="note">
        Layar admin lengkap (P-01…P-08) menyusul — tampilannya mengikuti
        prototipe yang sudah disetujui.
      </p>
    </main>
  );
}
