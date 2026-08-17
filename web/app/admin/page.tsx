import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AddPartnerButton from "./add-partner-button";
import PartnerLogo from "@/lib/partner-logo";

export const dynamic = "force-dynamic";

const SLBL: Record<string, string> = {
  ACTIVE: "AKTIF",
  DRAFT: "DRAF",
  SUSPENDED: "DITANGGUHKAN",
  INACTIVE: "NONAKTIF",
};

type PartnerRow = {
  id: string;
  name: string;
  code: string;
  status: string;
  logo_url: string | null;
};
type BranchRow = { id: string; partner_id: string; name: string; code: string; status: string };
type PolicyRow = { partner_id: string; visibility_scope: string; edit_scope: string };
type UserRow = { partner_id: string; status: string };

export default async function AdminPartnersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; access?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q || "").trim().toLowerCase();
  const statusFilter = sp.status || "ALL";
  const accessFilter = sp.access || "ALL";

  const supabase = await createClient();
  const [
    { data: partners, error: pErr },
    { data: branches, error: bErr },
    { data: policies, error: polErr },
    { data: users, error: uErr },
  ] = await Promise.all([
    supabase.from("partners").select("id, name, code, status, logo_url").order("name"),
    supabase.from("partner_branches").select("id, partner_id, name, code, status"),
    supabase.from("partner_access_policies").select("partner_id, visibility_scope, edit_scope"),
    supabase.from("partner_users").select("partner_id, status"),
  ]);
  // Kegagalan salah satu query pelengkap (cabang/kebijakan/akun) tidak boleh
  // muncul sebagai "0 cabang" / "Belum diatur" yang menyesatkan — itu bukan
  // kesimpulan bisnis, itu query yang gagal (LESSONS #10).
  const listErr = pErr || bErr || polErr || uErr;

  const branchesByPartner = new Map<string, BranchRow[]>();
  (branches ?? []).forEach((b: BranchRow) => {
    const arr = branchesByPartner.get(b.partner_id) ?? [];
    arr.push(b);
    branchesByPartner.set(b.partner_id, arr);
  });
  const policyByPartner = new Map<string, PolicyRow>();
  (policies ?? []).forEach((p: PolicyRow) => policyByPartner.set(p.partner_id, p));
  const userCountByPartner = new Map<string, number>();
  (users ?? []).forEach((u: UserRow) => {
    if (u.status !== "ACTIVE") return;
    userCountByPartner.set(u.partner_id, (userCountByPartner.get(u.partner_id) ?? 0) + 1);
  });

  const rows = (partners ?? [])
    .map((p: PartnerRow) => {
      const bs = branchesByPartner.get(p.id) ?? [];
      let matchBranch: BranchRow | undefined;
      if (q) {
        const hit = p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q);
        if (!hit) {
          matchBranch = bs.find(
            (b) => b.name.toLowerCase().includes(q) || b.code.toLowerCase().includes(q)
          );
          if (!matchBranch) return null;
        }
      }
      if (statusFilter !== "ALL" && p.status !== statusFilter) return null;
      const policy = policyByPartner.get(p.id);
      const isSame = policy?.visibility_scope === "PARTNER_ALL_BRANCHES";
      if (accessFilter !== "ALL" && (isSame ? "SAME" : "OWN") !== accessFilter) return null;
      return {
        partner: p,
        branchCount: bs.filter((b) => b.status === "ACTIVE").length,
        userCount: userCountByPartner.get(p.id) ?? 0,
        accessLabel: policy
          ? isSame
            ? `Sesama partner · ${policy.edit_scope === "PARTNER_ALL_BRANCHES" ? "Lihat + Edit" : "Lihat saja"}`
            : "Cabang sendiri"
          : "Belum diatur",
        matchBranch,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  return (
    <div>
      <div className="worktop">
        <h1>Partner</h1>
        <AddPartnerButton />
      </div>

      <form className="searchrow wide" action="/admin" method="GET">
        <input
          type="search"
          name="q"
          placeholder="Cari partner / cabang / kode…"
          defaultValue={sp.q || ""}
          className="search-input"
        />
        <select name="status" defaultValue={statusFilter} className="filter-select">
          <option value="ALL">Status: semua</option>
          <option value="ACTIVE">{SLBL.ACTIVE}</option>
          <option value="DRAFT">{SLBL.DRAFT}</option>
          <option value="SUSPENDED">{SLBL.SUSPENDED}</option>
          <option value="INACTIVE">{SLBL.INACTIVE}</option>
        </select>
        <select name="access" defaultValue={accessFilter} className="filter-select">
          <option value="ALL">Akses: semua</option>
          <option value="OWN">Cabang sendiri</option>
          <option value="SAME">Sesama partner</option>
        </select>
        <button className="btn" type="submit">
          Cari
        </button>
      </form>

      {listErr ? (
        <div className="card" style={{ margin: 0 }}>
          <div className="err">Daftar partner gagal dimuat. Muat ulang halaman untuk mencoba lagi.</div>
        </div>
      ) : rows.length === 0 ? (
        <div className="card emptybox">
          {(partners ?? []).length === 0
            ? "Belum ada partner."
            : `Tidak ada partner yang cocok dengan "${sp.q}".`}
        </div>
      ) : (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Merek</th>
                <th>Cabang</th>
                <th>Akun</th>
                <th>Akses</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.partner.id}>
                  <td>
                    <div className="row">
                      <PartnerLogo url={r.partner.logo_url} name={r.partner.name} size={28} />
                      <Link href={`/admin/partners/${r.partner.id}`} className="rowname">
                        <strong>{r.partner.name}</strong>{" "}
                        <span className="code">{r.partner.code}</span>
                        {r.matchBranch && (
                          <div className="small muted">Cabang cocok: {r.matchBranch.name}</div>
                        )}
                      </Link>
                    </div>
                  </td>
                  <td className="num">{r.branchCount}</td>
                  <td className="num">{r.userCount}</td>
                  <td>{r.accessLabel}</td>
                  <td>
                    <span className={`chip ${r.partner.status}`}>{SLBL[r.partner.status]}</span>
                  </td>
                  <td className="ta-right">
                    <Link href={`/admin/partners/${r.partner.id}`} className="linkbtn">
                      Buka
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
