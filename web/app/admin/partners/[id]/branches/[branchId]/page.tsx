import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AddStaffButton from "./add-staff-button";
import StaffActions from "./staff-actions";
import BranchActions from "./branch-actions";
import { formatActorRole, formatAuditAction, formatAuditDiff } from "@/lib/audit-format";
import { getMessages, type Messages } from "@/lib/i18n";

export const dynamic = "force-dynamic";

function statusLabel(m: Messages, s: string): string {
  const map: Record<string, string> = {
    ACTIVE: m.common.statusActive,
    DRAFT: m.common.statusDraft,
    SUSPENDED: m.common.statusSuspended,
    INACTIVE: m.common.statusInactive,
  };
  return map[s] ?? s;
}

type Assignment = { staff_id: string; branch_id: string; role: string; end_at: string | null };

export default async function BranchDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; branchId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id: partnerId, branchId } = await params;
  const sp = await searchParams;
  const tab = sp.tab || "overview";
  const m = await getMessages();
  const supabase = await createClient();

  const { data: branch } = await supabase
    .from("partner_branches")
    .select("id, partner_id, name, code, address, city, province, contact_name, contact_phone, status")
    .eq("id", branchId)
    .maybeSingle();
  if (!branch || branch.partner_id !== partnerId) notFound();

  const { data: partner } = await supabase
    .from("partners")
    .select("id, name, code")
    .eq("id", partnerId)
    .maybeSingle();
  if (!partner) notFound();

  const tabs = [
    { key: "overview", label: m.admin.tabOverview },
    { key: "staff", label: m.admin.tabStaff },
    { key: "activity", label: m.admin.tabActivity },
  ];

  let body: React.ReactNode = null;

  if (tab === "overview") {
    body = (
      <div className="card" style={{ maxWidth: 640 }}>
        <dl className="kv">
          <dt>{m.common.partner}</dt>
          <dd>{partner.name}</dd>
          <dt>{m.admin.branchInfoColCode}</dt>
          <dd>
            <span className="code">
              {partner.code} / {branch.code}
            </span>
          </dd>
          <dt>{m.admin.branchInfoColAddress}</dt>
          <dd>{branch.address}</dd>
          <dt>{m.common.city}</dt>
          <dd>{branch.city || "—"}</dd>
          <dt>{m.common.province}</dt>
          <dd>{branch.province || "—"}</dd>
          <dt>{m.common.contactName}</dt>
          <dd>{branch.contact_name || "—"}</dd>
          <dt>{m.common.whatsapp}</dt>
          <dd>{branch.contact_phone || "—"}</dd>
          <dt>{m.common.status}</dt>
          <dd>
            <span className={`chip ${branch.status}`}>{statusLabel(m, branch.status)}</span>
          </dd>
        </dl>
        <BranchActions branch={branch} />
      </div>
    );
  }

  if (tab === "staff") {
    const [{ data: staffList }, { data: assignments }, { data: allBranches }] = await Promise.all([
      supabase.from("partner_staff").select("id, full_name, phone, status").eq("partner_id", partnerId),
      supabase
        .from("partner_staff_assignments")
        .select("staff_id, branch_id, role, end_at")
        .eq("branch_id", branchId)
        .is("end_at", null),
      supabase.from("partner_branches").select("id, name").eq("partner_id", partnerId).eq("status", "ACTIVE"),
    ]);

    const assignByStaff = new Map<string, Assignment>();
    (assignments ?? []).forEach((a: Assignment) => assignByStaff.set(a.staff_id, a));
    const activeStaff = (staffList ?? []).filter((s) => s.status === "ACTIVE" && assignByStaff.has(s.id));
    const otherBranches = (allBranches ?? []).filter((b) => b.id !== branchId);

    body = (
      <div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
          <AddStaffButton branchId={branchId} partnerName={partner.name} branchName={branch.name} />
        </div>
        {activeStaff.length === 0 ? (
          <div className="card emptybox">{m.admin.staffEmpty}</div>
        ) : (
          activeStaff.map((s) => {
            const a = assignByStaff.get(s.id)!;
            return (
              <div key={s.id} className="staffcard">
                <div className="row1">
                  <span className="nm">{s.full_name}</span>
                  <span className="chip ACTIVE">{m.common.statusActive}</span>
                </div>
                <div className="rl">
                  {a.role} · {s.phone || m.admin.staffNoPhone}
                </div>
                <div className="ops">
                  <StaffActions
                    staff={{ id: s.id, full_name: s.full_name, phone: s.phone, role: a.role }}
                    otherBranches={otherBranches}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    );
  }

  if (tab === "activity") {
    const { data: audit } = await supabase
      .from("audit_logs")
      .select("id, action, actor_role, created_at, before, after")
      .eq("branch_id", branchId)
      .order("created_at", { ascending: false })
      .limit(50);

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
                    {new Date(a.created_at).toLocaleString("id-ID")}
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
      </div>
    );
  }

  return (
    <div>
      <div className="crumb">
        <a href="/admin">{m.common.partner}</a> / <a href={`/admin/partners/${partnerId}`}>{partner.name}</a> /{" "}
        {branch.name}
      </div>
      <div className="pagehead">
        <span>
          <h1>{m.common.branch} {branch.name}</h1>
          <div className="muted" style={{ marginTop: 4 }}>
            {partner.name} · {branch.address}
            {branch.city ? `, ${branch.city}` : ""}
          </div>
        </span>
        <span className={`chip ${branch.status}`} style={{ fontSize: 14, padding: "5px 14px" }}>
          {statusLabel(m, branch.status)}
        </span>
      </div>

      <div className="tabs">
        {tabs.map((t) => (
          <a
            key={t.key}
            href={`/admin/partners/${partnerId}/branches/${branchId}?tab=${t.key}`}
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
