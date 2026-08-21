import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AddPartnerButton from "./add-partner-button";
import PartnerLogo from "@/lib/partner-logo";
import { getAdminMessages } from "@/lib/i18n";
import type { AdminMessages } from "@/lib/i18n";

export const dynamic = "force-dynamic";

function statusLabel(m: AdminMessages, s: string): string {
  const map: Record<string, string> = {
    ACTIVE: m.common.statusActive,
    DRAFT: m.common.statusDraft,
    SUSPENDED: m.common.statusSuspended,
    INACTIVE: m.common.statusInactive,
  };
  return map[s] ?? s;
}

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
  const m = await getAdminMessages();
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
            ? `${m.common.scopePartnerAll} · ${
                policy.edit_scope === "PARTNER_ALL_BRANCHES" ? m.admin.accessViewEdit : m.admin.accessViewOnly
              }`
            : m.common.scopeOwnBranch
          : m.admin.partnersAccessNotSet,
        matchBranch,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  return (
    <div>
      <div className="worktop">
        <h1>{m.common.partner}</h1>
        <AddPartnerButton />
      </div>

      <form className="searchrow wide" action="/admin" method="GET">
        <input
          type="search"
          name="q"
          placeholder={m.admin.partnersSearchPlaceholder}
          defaultValue={sp.q || ""}
          className="search-input"
        />
        <select name="status" defaultValue={statusFilter} className="filter-select">
          <option value="ALL">{m.admin.filterStatusAll}</option>
          <option value="ACTIVE">{m.common.statusActive}</option>
          <option value="DRAFT">{m.common.statusDraft}</option>
          <option value="SUSPENDED">{m.common.statusSuspended}</option>
          <option value="INACTIVE">{m.common.statusInactive}</option>
        </select>
        <select name="access" defaultValue={accessFilter} className="filter-select">
          <option value="ALL">{m.admin.filterAccessAll}</option>
          <option value="OWN">{m.common.scopeOwnBranch}</option>
          <option value="SAME">{m.common.scopePartnerAll}</option>
        </select>
        <button className="btn" type="submit">
          {m.common.search}
        </button>
      </form>

      {listErr ? (
        <div className="card" style={{ margin: 0 }}>
          <div className="err">{m.common.errorLoad}</div>
        </div>
      ) : rows.length === 0 ? (
        <div className="card emptybox">
          {(partners ?? []).length === 0
            ? m.admin.partnersEmpty
            : m.admin.partnersEmptyFiltered.replace("{q}", sp.q || "")}
        </div>
      ) : (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>{m.admin.partnersColBrand}</th>
                <th>{m.common.branch}</th>
                <th>{m.common.account}</th>
                <th>{m.admin.partnersColAccess}</th>
                <th>{m.common.status}</th>
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
                          <div className="small muted">
                            {m.admin.partnersMatchedBranch.replace("{branch}", r.matchBranch.name)}
                          </div>
                        )}
                      </Link>
                    </div>
                  </td>
                  <td className="num">{r.branchCount}</td>
                  <td className="num">{r.userCount}</td>
                  <td>{r.accessLabel}</td>
                  <td>
                    <span className={`chip ${r.partner.status}`}>{statusLabel(m, r.partner.status)}</span>
                  </td>
                  <td className="ta-right">
                    <Link href={`/admin/partners/${r.partner.id}`} className="linkbtn">
                      {m.admin.openBtn}
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
