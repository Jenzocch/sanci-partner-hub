import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PartnerActions from "./partner-actions";
import AddBranchButton from "./add-branch-button";
import PermissionsForm from "./permissions-form";
import UserToggleButton from "./user-toggle-button";

export const dynamic = "force-dynamic";

const SLBL: Record<string, string> = {
  ACTIVE: "AKTIF",
  DRAFT: "DRAF",
  SUSPENDED: "DITANGGUHKAN",
  INACTIVE: "NONAKTIF",
};

type Branch = { id: string; name: string; address: string; city: string | null; status: string };
type PolicyRow = { visibility_scope: string; edit_scope: string; configured: boolean };

export default async function PartnerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = sp.tab || "overview";
  const supabase = await createClient();

  const { data: partner } = await supabase
    .from("partners")
    .select("id, name, code, status, contact_name, contact_phone, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!partner) notFound();

  const [{ data: branches }, { data: users }, { data: policy }] = await Promise.all([
    supabase
      .from("partner_branches")
      .select("id, name, address, city, status")
      .eq("partner_id", id)
      .order("name"),
    supabase.from("partner_users").select("id, name, role, status, branch_id").eq("partner_id", id),
    supabase
      .from("partner_access_policies")
      .select("visibility_scope, edit_scope, configured")
      .eq("partner_id", id)
      .maybeSingle(),
  ]);

  const activeBranches = ((branches ?? []) as Branch[]).filter((b) => b.status === "ACTIVE");
  const activeUsers = (users ?? []).filter((u) => u.status === "ACTIVE");
  const gate = [
    { ok: !!partner.name, label: "Nama partner" },
    { ok: !!partner.code, label: "Kode partner" },
    { ok: activeBranches.length > 0, label: "Minimal 1 cabang aktif" },
    { ok: activeUsers.length > 0, label: "Minimal 1 akun login aktif" },
    { ok: !!policy?.configured, label: "Hak akses sudah diatur" },
  ];
  const canActivate = gate.every((g) => g.ok);

  const tabs = [
    { key: "overview", label: "Ringkasan" },
    { key: "branches", label: "Cabang" },
    { key: "users", label: "Akun" },
    { key: "permissions", label: "Hak Akses" },
    { key: "history", label: "Riwayat" },
  ];

  let body: React.ReactNode = null;

  if (tab === "overview") {
    body = (
      <div className="cardgrid-two">
        <div className="card">
          <h3 style={{ fontSize: 17, marginBottom: 14 }}>Informasi Partner</h3>
          <dl className="kv">
            <dt>Kode</dt>
            <dd>
              <span className="code">{partner.code}</span>
            </dd>
            <dt>Status</dt>
            <dd>
              <span className={`chip ${partner.status}`}>{SLBL[partner.status]}</span>
            </dd>
            <dt>Kontak</dt>
            <dd>{partner.contact_name || "—"}</dd>
            <dt>WhatsApp</dt>
            <dd>{partner.contact_phone || "—"}</dd>
          </dl>
          <PartnerActions partner={partner} canActivate={canActivate} />
        </div>

        <div className="card">
          {partner.status === "DRAFT" ? (
            <>
              <h3 style={{ fontSize: 17, marginBottom: 12 }}>Syarat aktivasi</h3>
              <ul className="gate">
                {gate.map((g) => (
                  <li key={g.label} className={g.ok ? "yes" : "no"}>
                    {g.ok ? "✓ " : "○ "}
                    {g.label}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <h3 style={{ fontSize: 17, marginBottom: 12 }}>Cabang</h3>
              {activeBranches.length === 0 ? (
                <div className="emptybox" style={{ padding: 24 }}>
                  Belum ada cabang.
                </div>
              ) : (
                activeBranches.map((b) => (
                  <Link
                    key={b.id}
                    href={`/admin/partners/${id}/branches/${b.id}`}
                    className="rowline"
                    style={{ textDecoration: "none", color: "inherit" }}
                  >
                    <span>
                      {b.name}
                      <div className="small muted">
                        {b.address}
                        {b.city ? `, ${b.city}` : ""}
                      </div>
                    </span>
                    <span className={`chip ${b.status}`}>{SLBL[b.status]}</span>
                  </Link>
                ))
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  if (tab === "branches") {
    body = (
      <div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
          <AddBranchButton partnerId={id} />
        </div>
        {(branches ?? []).length === 0 ? (
          <div className="card emptybox">Belum ada cabang.</div>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Cabang</th>
                  <th>Alamat</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(branches ?? []).map((b: Branch) => (
                  <tr key={b.id}>
                    <td>
                      <Link href={`/admin/partners/${id}/branches/${b.id}`} className="rowname">
                        <strong>{b.name}</strong>
                      </Link>
                    </td>
                    <td>
                      {b.address}
                      {b.city ? `, ${b.city}` : ""}
                    </td>
                    <td>
                      <span className={`chip ${b.status}`}>{SLBL[b.status]}</span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Link href={`/admin/partners/${id}/branches/${b.id}`} className="linkbtn">
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

  if (tab === "users") {
    const branchNameById = new Map((branches ?? []).map((b: Branch) => [b.id, b.name]));
    body = (
      <div>
        {(users ?? []).length === 0 ? (
          <div className="card emptybox">Belum ada akun login.</div>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Nama</th>
                  <th>Cabang</th>
                  <th>Peran</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(users ?? []).map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 650 }}>{u.name}</td>
                    <td>{branchNameById.get(u.branch_id) || "—"}</td>
                    <td>{u.role}</td>
                    <td>
                      <span className={`chip ${u.status === "ACTIVE" ? "ACTIVE" : "INACTIVE"}`}>
                        {u.status === "ACTIVE" ? "AKTIF" : "NONAKTIF"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <UserToggleButton userId={u.id} active={u.status === "ACTIVE"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="small muted" style={{ marginTop: 14 }}>
          Membuat akun login baru butuh konfigurasi tambahan di server (service_role key) yang belum
          tersedia di lingkungan ini — belum bisa dilakukan lewat layar ini.
        </p>
      </div>
    );
  }

  if (tab === "permissions") {
    const pol: PolicyRow = policy || { visibility_scope: "OWN_BRANCH", edit_scope: "OWN_BRANCH", configured: false };
    body = (
      <PermissionsForm
        partnerId={id}
        partnerName={partner.name}
        visibilityScope={pol.visibility_scope}
        editScope={pol.edit_scope}
      />
    );
  }

  if (tab === "history") {
    const { data: audit } = await supabase
      .from("audit_logs")
      .select("id, action, actor_role, created_at, before, after")
      .eq("partner_id", id)
      .order("created_at", { ascending: false })
      .limit(100);

    body = (
      <div className="card">
        {!audit || audit.length === 0 ? (
          <div className="emptybox">Belum ada aktivitas tercatat.</div>
        ) : (
          <ul className="audit-list">
            {audit.map((a) => (
              <li key={a.id}>
                <span className="act">{a.action}</span>
                <span className="muted">{a.actor_role}</span>
                <span className="ts">{new Date(a.created_at).toLocaleString("id-ID")} · waktu server</span>
                {(a.before || a.after) && (
                  <div className="diff">
                    {a.before ? JSON.stringify(a.before) + " → " : ""}
                    {JSON.stringify(a.after || {})}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="small muted" style={{ marginTop: 12 }}>
          Catatan audit hanya bertambah. Tidak ada yang bisa mengubah atau menghapusnya dari aplikasi.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="crumb">
        <a href="/admin">Partner</a> / {partner.name}
      </div>
      <div className="pagehead">
        <h1>{partner.name}</h1>
        <span className={`chip ${partner.status}`} style={{ fontSize: 14, padding: "5px 14px" }}>
          {SLBL[partner.status]}
        </span>
      </div>

      <div className="tabs">
        {tabs.map((t) => (
          <a
            key={t.key}
            href={`/admin/partners/${id}?tab=${t.key}`}
            className={`tab${tab === t.key ? " on" : ""}`}
          >
            {t.label}
          </a>
        ))}
      </div>

      {body}
    </div>
  );
}
