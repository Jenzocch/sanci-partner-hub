import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDateTimeWIB } from "@/lib/orders-shared";
import PartnerActions from "./partner-actions";
import AddBranchButton from "./add-branch-button";
import AddPackageButton from "./add-package-button";
import PackageActions from "./package-actions";
import PermissionsForm from "./permissions-form";
import OfferPermissionsForm from "./offer-permissions-form";
import CatalogAccessForm from "./catalog-access-form";
import UserToggleButton from "./user-toggle-button";
import AddUserButton from "./add-user-button";
import ResetPasswordButton from "./reset-password-button";
import { formatActorRole, formatAuditAction, formatAuditDiff } from "@/lib/audit-format";
import { getAdminMessages, type AdminMessages } from "@/lib/i18n";
import PartnerLogo from "@/lib/partner-logo";
// Hanya fungsi pembaca boolean — nilai kuncinya tidak pernah keluar dari modul
// itu, dan modul itu tidak boleh diimpor komponen "use client" mana pun.
import { isServiceRoleConfigured } from "@/lib/supabase/admin";

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

type Branch = {
  id: string;
  name: string;
  code: string;
  address: string;
  city: string | null;
  status: string;
};
type PolicyRow = { visibility_scope: string; edit_scope: string; configured: boolean };
type PackageRow = { id: string; name: string; code: string; description: string | null; status: string };
type QueryErr = { code?: string; message?: string } | null;

function isMissingTableErr(err: QueryErr): boolean {
  return !!err && err.code === "42P01";
}

/**
 * can_view_offer/can_edit_offer (migrasi 0014) dibaca TERPISAH dari query
 * `policy` di atas: kolomnya bisa saja belum ada (LESSONS #12, kode boleh
 * naik lebih dulu daripada 0014 dijalankan) — kalau digabung ke satu SELECT,
 * satu kolom hilang akan menggagalkan SELURUH query kebijakan akses (dipakai
 * juga oleh `canActivate`/tab overview), bukan cuma kartu izin penawaran ini.
 */
type OfferPolicyRow = { can_view_offer: boolean; can_edit_offer: boolean; can_discount: boolean };
async function fetchOfferPolicy(
  supabase: Awaited<ReturnType<typeof createClient>>,
  partnerId: string
): Promise<{ status: "ok"; data: OfferPolicyRow } | { status: "missing-column" } | { status: "error" }> {
  const { data, error } = await supabase
    .from("partner_access_policies")
    .select("can_view_offer, can_edit_offer, can_discount")
    .eq("partner_id", partnerId)
    .maybeSingle();
  if (error) {
    if (error.code === "42703") {
      // can_discount (0015) belum ada TAPI can_view_offer/can_edit_offer
      // (0014) mungkin sudah — coba lagi dengan SELECT sempit supaya kartu
      // izin penawaran tetap tampil, hanya checkbox diskon yang disembunyikan
      // (LESSONS #12, pola sama dengan fetchOrderOffer di halaman detail pesanan).
      const narrow = await supabase
        .from("partner_access_policies")
        .select("can_view_offer, can_edit_offer")
        .eq("partner_id", partnerId)
        .maybeSingle();
      if (narrow.error) return { status: narrow.error.code === "42703" ? "missing-column" : "error" };
      const row = narrow.data as { can_view_offer: boolean; can_edit_offer: boolean } | null;
      return {
        status: "ok",
        data: { can_view_offer: row?.can_view_offer ?? false, can_edit_offer: row?.can_edit_offer ?? false, can_discount: false },
      };
    }
    return { status: "error" };
  }
  return {
    status: "ok",
    data: (data as OfferPolicyRow | null) ?? { can_view_offer: false, can_edit_offer: false, can_discount: false },
  };
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
  const m = await getAdminMessages();
  const supabase = await createClient();

  const { data: partner } = await supabase
    .from("partners")
    .select("id, name, code, status, contact_name, contact_phone, logo_url, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!partner) notFound();

  const [
    { data: branches, error: branchesErr },
    { data: users, error: usersErr },
    { data: policy, error: policyErr },
    { data: packages, error: packagesErr },
    { data: catalogAccess, error: catalogErr },
    { count: staffCount, error: staffErr },
  ] = await Promise.all([
    supabase
      .from("partner_branches")
      // `code` dipakai untuk mengusulkan ID login akun (<partner>-<cabang>@sanci.com).
      .select("id, name, code, address, city, status")
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
    supabase.from("sanci_catalog_access").select("enabled").eq("partner_id", id).maybeSingle(),
    // Baris "staf" pada checklist persiapan hanya tampil selama DRAF — partner
    // yang sudah aktif tidak perlu membayar query ini. head:true = hitung saja,
    // tanpa mengambil baris.
    partner.status === "DRAFT"
      ? supabase
          .from("partner_staff")
          .select("id", { count: "exact", head: true })
          .eq("partner_id", id)
          .eq("status", "ACTIVE")
      : Promise.resolve({ count: null as number | null, error: null as QueryErr }),
  ]);

  // Tabel partner_packages bisa saja belum ada (migrasi 0008 dijalankan
  // terpisah dari kode — LESSONS #12). Error lain (bukan 42P01) TIDAK boleh
  // disamarkan jadi "belum aktif" — itu pesan yang salah (LESSONS #10).
  const packagesMissing = isMissingTableErr(packagesErr);
  const packagesOtherError = !!packagesErr && !packagesMissing;

  // sanci_catalog_access bisa saja belum ada juga (migrasi 0010, dikerjakan
  // paralel dengan kode ini). Sama aturannya: 42P01 = degradasi, error lain
  // TIDAK boleh disamarkan.
  const catalogMissing = isMissingTableErr(catalogErr);
  const catalogOtherError = !!catalogErr && !catalogMissing;

  const activeBranches = ((branches ?? []) as Branch[]).filter((b) => b.status === "ACTIVE");
  const activeUsers = (users ?? []).filter((u) => u.status === "ACTIVE");

  // Checklist persiapan (kartu Ringkasan selama DRAF). Barisnya mencerminkan
  // PERSIS tiga gerbang yang diperiksa ulang setPartnerStatus di server
  // (actions.ts): ≥1 cabang AKTIF, ≥1 akun login AKTIF, hak akses sudah
  // diatur. Query yang gagal TIDAK boleh tampil sebagai "syarat belum
  // terpenuhi" (LESSONS #10) — bedakan "unknown" (tanda strip, tautan tab
  // tetap bisa dipakai) dari "missing" (benar-benar belum ada).
  type GateState = "ok" | "missing" | "unknown";
  const gateState = (err: QueryErr, ok: boolean): GateState =>
    err ? "unknown" : ok ? "ok" : "missing";
  const setupSteps: { state: GateState; label: string; tab: string; linkLabel: string }[] = [
    {
      state: gateState(branchesErr, activeBranches.length > 0),
      label: m.admin.gateReqBranch,
      tab: "branches",
      linkLabel: m.admin.gateGoBranches,
    },
    {
      state: gateState(usersErr, activeUsers.length > 0),
      label: m.admin.gateReqUser,
      tab: "users",
      linkLabel: m.admin.gateGoUsers,
    },
    {
      state: gateState(policyErr, !!policy?.configured),
      label: m.admin.gateReqAccess,
      tab: "permissions",
      linkLabel: m.admin.gateGoAccess,
    },
  ];
  // Tombol Aktifkan hanya terkunci oleh syarat yang PASTI belum terpenuhi.
  // "unknown" tidak mengunci: error pengambilan data bukan kesimpulan bisnis
  // (LESSONS #10), dan server tetap memverifikasi ulang ketiga gerbang saat
  // tombol ditekan (SPEC §12) — batas sesungguhnya ada di sana.
  const canActivate = setupSteps.every((s) => s.state !== "missing");
  // Baris keempat (staf) hanya ANJURAN — tidak pernah ikut mengunci tombol.
  const staffState: GateState = gateState(staffErr, (staffCount ?? 0) > 0);

  const tabs = [
    { key: "overview", label: m.admin.tabOverview },
    { key: "branches", label: m.common.branch },
    { key: "packages", label: m.common.package },
    { key: "users", label: m.common.account },
    { key: "permissions", label: m.admin.tabPermissions },
    { key: "history", label: m.admin.tabHistory },
  ];

  let body: React.ReactNode = null;

  if (tab === "overview") {
    body = (
      <div className="cardgrid-two">
        <div className="card">
          <div className="row" style={{ marginBottom: 14 }}>
            <PartnerLogo url={partner.logo_url} name={partner.name} size={56} />
            <h3 style={{ fontSize: 17 }}>{m.admin.partnerInfoTitle}</h3>
          </div>
          <dl className="kv">
            <dt>{m.common.code}</dt>
            <dd>
              <span className="code">{partner.code}</span>
            </dd>
            <dt>{m.common.status}</dt>
            <dd>
              <span className={`chip ${partner.status}`}>{statusLabel(m, partner.status)}</span>
            </dd>
            <dt>{m.common.contactName}</dt>
            <dd>{partner.contact_name || "—"}</dd>
            <dt>{m.common.whatsapp}</dt>
            <dd>{partner.contact_phone || "—"}</dd>
          </dl>
          <PartnerActions partner={partner} canActivate={canActivate} />
        </div>

        <div className="card">
          {partner.status === "DRAFT" ? (
            <>
              <h3 style={{ fontSize: 17, marginBottom: 6 }}>{m.admin.activationRequirementsTitle}</h3>
              <p className="small muted" style={{ marginBottom: 12 }}>
                {m.admin.gateIntro}
              </p>
              <ul className="gate">
                {setupSteps.map((s) => (
                  <li key={s.tab} className={s.state === "ok" ? "yes" : "no"}>
                    {s.state === "ok" ? "✓ " : s.state === "unknown" ? "— " : "○ "}
                    {s.label}
                    {s.state === "unknown" && (
                      <div className="small muted">{m.admin.gateUnknownNote}</div>
                    )}
                    {s.state !== "ok" && (
                      <div style={{ marginTop: 2 }}>
                        <Link href={`/admin/partners/${id}?tab=${s.tab}`} className="linkbtn">
                          {s.linkLabel} →
                        </Link>
                      </div>
                    )}
                  </li>
                ))}
                {/* Baris anjuran (staf): TIDAK menahan aktivasi — sengaja
                    dipisah garis + teks kecil supaya beda kelas dari tiga
                    syarat wajib di atas. */}
                <li
                  className="small muted"
                  style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}
                >
                  {staffState === "ok" ? "✓ " : staffState === "unknown" ? "— " : "○ "}
                  {m.admin.gateStaffRecommended}
                  <div className="small muted">{m.admin.gateStaffWhy}</div>
                  {staffState === "unknown" && (
                    <div className="small muted">{m.admin.gateUnknownNote}</div>
                  )}
                  {staffState !== "ok" && (
                    <div style={{ marginTop: 2 }}>
                      <Link href={`/admin/partners/${id}?tab=branches`} className="linkbtn">
                        {m.admin.gateGoBranches} →
                      </Link>
                    </div>
                  )}
                </li>
              </ul>
            </>
          ) : (
            <>
              <h3 style={{ fontSize: 17, marginBottom: 12 }}>{m.common.branch}</h3>
              {activeBranches.length === 0 ? (
                <div className="emptybox" style={{ padding: 24 }}>
                  {m.admin.branchesEmpty}
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
                    <span className={`chip ${b.status}`}>{statusLabel(m, b.status)}</span>
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
          <div className="card emptybox">{m.admin.branchesEmpty}</div>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>{m.common.branch}</th>
                  <th>{m.admin.colAddress}</th>
                  <th>{m.common.status}</th>
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
                      <span className={`chip ${b.status}`}>{statusLabel(m, b.status)}</span>
                    </td>
                    <td className="ta-right">
                      <Link href={`/admin/partners/${id}/branches/${b.id}`} className="linkbtn">
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

  if (tab === "packages") {
    if (packagesMissing) {
      body = <div className="card emptybox">{m.admin.packageMigrationMsg}</div>;
    } else if (packagesOtherError) {
      body = (
        <div className="card">
          <div className="err">{m.common.errorLoad}</div>
        </div>
      );
    } else {
      body = (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
            <AddPackageButton partnerId={id} />
          </div>
          {(packages ?? []).length === 0 ? (
            <div className="card emptybox">{m.admin.packagesEmpty}</div>
          ) : (
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>{m.common.name}</th>
                    <th>{m.common.code}</th>
                    <th>{m.common.description}</th>
                    <th>{m.common.status}</th>
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
                        <span className={`chip ${p.status}`}>{statusLabel(m, p.status)}</span>
                      </td>
                      <td className="ta-right">
                        <div className="btnrow-inline" style={{ marginTop: 0 }}>
                          <Link className="btn sm" href={`/admin/partners/${id}/packages/${p.id}`}>
                            {m.admin.packageItemsLink}
                          </Link>
                          <PackageActions pkg={p} />
                        </div>
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
    // Kunci service_role hanya ada di server (Vercel → Environment Variables).
    // Yang menyeberang ke browser hanya boolean ini — tidak pernah nilainya.
    const bisaBuatAkun = isServiceRoleConfigured();
    body = (
      <div>
        {bisaBuatAkun && activeBranches.length > 0 && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
            <AddUserButton
              partnerId={id}
              partnerCode={partner.code}
              branches={activeBranches.map((b) => ({ id: b.id, name: b.name, code: b.code }))}
            />
          </div>
        )}
        {!bisaBuatAkun && (
          // Kunci belum diisi: jelaskan keadaannya, jangan tampilkan form yang
          // pasti gagal. Kode ini boleh naik lebih dulu — begitu kuncinya diisi,
          // tombolnya muncul sendiri tanpa deploy ulang (LESSONS #12).
          <div className="card emptybox" style={{ marginBottom: 14 }}>
            {m.admin.usersServiceKeyMissing}
          </div>
        )}
        {bisaBuatAkun && activeBranches.length === 0 && (
          <div className="card emptybox" style={{ marginBottom: 14 }}>
            {m.admin.usersNoActiveBranch}
          </div>
        )}
        {(users ?? []).length === 0 ? (
          <div className="card emptybox">{m.admin.usersEmpty}</div>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>{m.common.name}</th>
                  <th>{m.common.branch}</th>
                  <th>{m.common.role}</th>
                  <th>{m.common.status}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(users ?? []).map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 650 }}>{u.name}</td>
                    <td>{branchNameById.get(u.branch_id) || "—"}</td>
                    <td>{u.role === "BRANCH_USER" ? m.common.roleBranchUser : u.role}</td>
                    <td>
                      <span className={`chip ${u.status === "ACTIVE" ? "ACTIVE" : "INACTIVE"}`}>
                        {u.status === "ACTIVE" ? m.common.statusActive : m.common.statusInactive}
                      </span>
                    </td>
                    <td className="ta-right">
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          flexWrap: "wrap",
                          justifyContent: "flex-end",
                        }}
                      >
                        {/* Tanpa kunci service_role, penggantian kata sandi pasti gagal —
                            tombolnya disembunyikan, bukan ditampilkan lalu menolak. */}
                        {bisaBuatAkun && (
                          <ResetPasswordButton
                            userId={u.id}
                            userName={u.name}
                            branchName={branchNameById.get(u.branch_id) || ""}
                          />
                        )}
                        <UserToggleButton userId={u.id} active={u.status === "ACTIVE"} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="footnote">{m.admin.usersFootnote}</p>
      </div>
    );
  }

  if (tab === "permissions") {
    // Belum ada baris di partner_access_policies BUKAN berarti "kosong tanpa
    // arti" — bawaan sistem (OWN_BRANCH) tetap berlaku di balik layar. Layar
    // ini harus bilang itu secara eksplisit, bukan diam (audit P2-2).
    const pol: PolicyRow = policy || { visibility_scope: "OWN_BRANCH", edit_scope: "OWN_BRANCH", configured: false };
    const offerPolicy = await fetchOfferPolicy(supabase, id);
    body = (
      <div>
        <PermissionsForm
          partnerId={id}
          partnerName={partner.name}
          visibilityScope={pol.visibility_scope}
          editScope={pol.edit_scope}
          configured={pol.configured}
        />
        {offerPolicy.status === "ok" ? (
          <OfferPermissionsForm
            partnerId={id}
            partnerName={partner.name}
            canViewOffer={offerPolicy.data.can_view_offer}
            canEditOffer={offerPolicy.data.can_edit_offer}
            canDiscount={offerPolicy.data.can_discount}
          />
        ) : offerPolicy.status === "missing-column" ? (
          <div className="card emptybox" style={{ maxWidth: 560 }}>
            {m.admin.orderOfferFeatureOff}
          </div>
        ) : (
          <div className="card" style={{ maxWidth: 560 }}>
            <div className="err" style={{ marginBottom: 0 }}>
              {m.common.errorLoad}
            </div>
          </div>
        )}
        {catalogMissing ? (
          <div className="card emptybox" style={{ maxWidth: 560 }}>
            {m.admin.catalogMigrationMsg}
          </div>
        ) : catalogOtherError ? (
          <div className="card" style={{ maxWidth: 560 }}>
            <div className="err" style={{ marginBottom: 0 }}>
              {m.common.errorLoad}
            </div>
          </div>
        ) : (
          <CatalogAccessForm partnerId={id} enabled={catalogAccess?.enabled ?? false} />
        )}
      </div>
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
          <div className="emptybox">{m.admin.activityEmpty}</div>
        ) : (
          <ul className="audit-list">
            {audit.map((a) => {
              const diffLines = formatAuditDiff(m, a.before, a.after);
              return (
                <li key={a.id}>
                  <span className="act">{formatAuditAction(m, a.action)}</span>{" "}
                  <span className="muted">· {formatActorRole(m, a.actor_role)}</span>
                  <span className="ts">
                    {formatDateTimeWIB(a.created_at, m.common.dateLocale)}
                    {m.admin.createdAtServerTimeSuffix}
                  </span>
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
        <p className="footnote">{m.admin.auditFootnote}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="crumb">
        <Link href="/admin">{m.common.partner}</Link> / {partner.name}
      </div>
      <div className="pagehead">
        <h1>{partner.name}</h1>
        <span className={`chip ${partner.status}`} style={{ fontSize: 14, padding: "5px 14px" }}>
          {statusLabel(m, partner.status)}
        </span>
      </div>

      {/* <Link>, bukan <a>: berpindah tab dengan <a> memuat ulang seluruh
          dokumen — termasuk menjalankan lagi pemeriksaan admin di
          app/admin/layout.tsx — padahal yang berubah cuma satu query string. */}
      <div className="tabs">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/admin/partners/${id}?tab=${t.key}`}
            className={`tab${tab === t.key ? " on" : ""}`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {body}
    </div>
  );
}
