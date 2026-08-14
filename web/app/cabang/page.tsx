import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./sign-out-button";

export const dynamic = "force-dynamic";

type Branch = { id: string; name: string; address: string; city: string | null };

export default async function CabangHome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: pu, error } = await supabase
    .from("partner_users")
    .select(
      "id, name, branch_id, partners:partner_id(id, name, code), partner_access_policies:partner_id(visibility_scope, edit_scope)"
    )
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

  const partner = pu.partners as unknown as { id: string; name: string; code: string };
  const policy = pu.partner_access_policies as unknown as
    | { visibility_scope: string; edit_scope: string }
    | { visibility_scope: string; edit_scope: string }[]
    | null;
  const pol = Array.isArray(policy) ? policy[0] : policy;

  // RLS pada partner_branches sudah otomatis membatasi baris yang kembali —
  // tidak perlu logika tambahan untuk boundary partner/branch di sini.
  const { data: visibleBranches } = await supabase
    .from("partner_branches")
    .select("id, name, address, city")
    .order("name");

  const myBranch = (visibleBranches ?? []).find((b: Branch) => b.id === pu.branch_id);
  const otherBranches = (visibleBranches ?? []).filter((b: Branch) => b.id !== pu.branch_id);
  const editAll = pol?.edit_scope === "PARTNER_ALL_BRANCHES";

  return (
    <main className="pwrap">
      <div className="idcard">
        <div className="logos">
          <span className="logo">{partner.code}</span>
          <span className="x">×</span>
          <span className="sanci serif">SANCI</span>
        </div>
        <h2>{partner.name}</h2>
        {myBranch && (
          <>
            <div className="br">Cabang {myBranch.name}</div>
            <div className="addr">
              {myBranch.address}
              {myBranch.city ? `, ${myBranch.city}` : ""}
            </div>
          </>
        )}
      </div>

      {myBranch && (
        <Link href={`/cabang/staff/${myBranch.id}`} className="biglink">
          <span>Staf</span>
          <span className="arrow">→</span>
        </Link>
      )}

      {otherBranches.length > 0 && (
        <>
          <div className="small muted" style={{ margin: "2px 0 10px 4px" }}>
            Cabang {partner.name} lainnya (SANCI mengizinkan visibilitas sesama partner):
          </div>
          {otherBranches.map((b: Branch) => (
            <Link
              key={b.id}
              href={`/cabang/staff/${b.id}`}
              className="biglink"
              style={{ padding: "13px 18px", fontSize: 15.5 }}
            >
              <span>
                {b.name} <span className="small muted">{editAll ? "lihat + edit" : "lihat saja"}</span>
              </span>
              <span className="arrow">→</span>
            </Link>
          ))}
        </>
      )}

      <Link href="/cabang/profil" className="biglink">
        <span>Profil Cabang</span>
        <span className="arrow">→</span>
      </Link>
      <Link href="/cabang/akun" className="biglink">
        <span>Akun Saya</span>
        <span className="arrow">→</span>
      </Link>

      <p className="small muted" style={{ marginTop: 18, lineHeight: 1.55 }}>
        Order, customer, gudang, dan pengiriman adalah fase berikutnya — sengaja belum ditampilkan.
      </p>

      <div style={{ marginTop: 14 }}>
        <SignOutButton />
      </div>
    </main>
  );
}
