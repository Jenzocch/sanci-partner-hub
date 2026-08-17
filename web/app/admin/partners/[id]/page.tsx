import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PartnerActions from "./partner-actions";
import AddBranchButton from "./add-branch-button";
import AddPackageButton from "./add-package-button";
import PackageActions from "./package-actions";
import PermissionsForm from "./permissions-form";
import UserToggleButton from "./user-toggle-button";
import { formatActorRole, formatAuditAction, formatAuditDiff } from "@/lib/audit-format";
import PartnerLogo from "@/lib/partner-logo";

export const dynamic = "force-dynamic";

// Sama persis dengan pesan di actions-packages.ts — file "use server" tidak
// boleh mengekspor apa pun selain async function, jadi string ini didefinisikan
// ulang di sini alih-alih diimpor.
const PACKAGE_MIGRATION_MSG = "Fitur package belum aktif — migrasi belum dijalankan.";

const SLBL: Record<string, string> = {
  ACTIVE: "AKTIF",
  DRAFT: "DRAF",
  SUSPENDED: "DITANGGUHKAN",
  INACTIVE: "NONAKTIF",
};

type Branch = { id: string; name: string; address: string; city: string | null; status: string };
type PolicyRow = { visibility_scope: string; edit_scope: string; configured: boolean };
type PackageRow = { id: string; name: string; code: string; description: string | null; status: string };
type QueryErr = { code?: string; message?: string } | null;

function isMissingTableErr(err: QueryErr): boolean {
  return !!err && err.code === "42P01";
}

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
    .select("id, name, code, status, contact_name, contact_phone, logo_url, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!partner) notFound();

  const [{ data: branches }, { data: users }, { data: policy }, { data: packages, error: packagesErr }] =
    await Promise.all([
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
      supabase
        .from("partner_packages")
        .select("id, name, code, description, status")
        .eq("partner_id", id)
        .order("name"),
    ]);

  // Tabel partner_packages bisa saja belum ada (migrasi 0008 dijalankan
  // terpisah dari kode — LESSONS #12). Error lain (bukan 42P01) TIDAK boleh
  // disamarkan jadi "belum aktif" — itu pesan yang salah (LESSONS #10).
  const packagesMissing = isMissingTableErr(packagesErr);
  const packagesOtherError = !!packagesErr && !packagesMissing;

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
    { key: "packages", label: "Package" },
    { key: "users", label: "Akun" },
    { key: "permissions", label: "Hak Akses" },
    { key: "history", label: "Riwayat" },
  ];

  let body: React.ReactNode = null;

  if (tab === "overview") {
    body = (
      <div className="cardgrid-two">
        <div className="card">
          <div className="row" style={{ marginBottom: 14 }}>
            <PartnerLogo url={partner.logo_url} name={partner.name} size={56} />
            <h3 style={{ fontSize: 17 }}>Informasi Partner</h3>
          </div>
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
                    <td className="ta-right">
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

  if (tab === "packages") {
    if (packagesMissing) {
      body = <div className="card emptybox">{PACKAGE_MIGRATION_MSG}</div>;
    } else if (packagesOtherError) {
      body = (
        <div className="card">
          <div className="err">Daftar package gagal dimuat. Muat ulang halaman untuk mencoba lagi.</div>
        </div>
      );
    } else {
      body = (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
            <AddPackageButton partnerId={id} />
          </div>
          {(packages ?? []).length === 0 ? (
            <div className="card emptybox">Belum ada package.</div>
          ) : (
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Nama</th>
                    <th>Kode</th>
                    <th>Deskripsi</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(packages as PackageRow[]).map((p) => (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 650 }}>{p.name}</td>
                      <td>
                        <span className="code">{p.code}</span>
                      </td>
                      <td>{p.description || "—"}</td>
                      <td>
                        <span className={`chip ${p.status}`}>{SLBL[p.status]}</span>
                      </td>
                      <td className="ta-right">
                        <PackageActions pkg={p} />
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
                    <td className="ta-right">
                      <UserToggleButton userId={u.id} active={u.status === "ACTIVE"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="footnote">
          Membuat akun login baru butuh konfigurasi tambahan di server (service_role key) yang belum
          tersedia di lingkungan ini — belum bisa dilakukan lewat layar ini.
        </p>
      </div>
    );
  }

  if (tab === "permissions") {
    // Belum ada baris di partner_access_policies BUKAN berarti "kosong tanpa
    // arti" — bawaan sistem (OWN_BRANCH) tetap berlaku di balik layar. Layar
    // ini harus bilang itu secara eksplisit, bukan diam (audit P2-2).
    const pol: PolicyRow = policy || { visibility_scope: "OWN_BRANCH", edit_scope: "OWN_BRANCH", configured: false };
    body = (
      <PermissionsForm
        partnerId={id}
        partnerName={partner.name}
        visibilityScope={pol.visibility_scope}
        editScope={pol.edit_scope}
        configured={pol.configured}
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
            {audit.map((a) => {
              const diffLines = formatAuditDiff(a.before, a.after);
              return (
                <li key={a.id}>
                  <span className="act">{formatAuditAction(a.action)}</span>{" "}
                  <span className="muted">· {formatActorRole(a.actor_role)}</span>
                  <span className="ts">{new Date(a.created_at).toLocaleString("id-ID")} · waktu server</span>
                  {diffLines.length > 0 && (
                    <div className="diff">
                      {diffLines.map((line, i) => (
                        <div key={i}>{line}</div>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="footnote">
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
