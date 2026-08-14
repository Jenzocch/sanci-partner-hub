import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AddStaffButton from "./add-staff-button";
import StaffActions from "./staff-actions";
import BranchActions from "./branch-actions";

export const dynamic = "force-dynamic";

const SLBL: Record<string, string> = {
  ACTIVE: "AKTIF",
  DRAFT: "DRAF",
  SUSPENDED: "DITANGGUHKAN",
  INACTIVE: "NONAKTIF",
};

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
    { key: "overview", label: "Ringkasan" },
    { key: "staff", label: "Staf" },
    { key: "activity", label: "Aktivitas" },
  ];

  let body: React.ReactNode = null;

  if (tab === "overview") {
    body = (
      <div className="card" style={{ maxWidth: 640 }}>
        <dl className="kv">
          <dt>Partner</dt>
          <dd>{partner.name}</dd>
          <dt>Kode cabang</dt>
          <dd>
            <span className="code">
              {partner.code} / {branch.code}
            </span>
          </dd>
          <dt>Alamat lengkap</dt>
          <dd>{branch.address}</dd>
          <dt>Kota</dt>
          <dd>{branch.city || "—"}</dd>
          <dt>Provinsi</dt>
          <dd>{branch.province || "—"}</dd>
          <dt>Kontak</dt>
          <dd>{branch.contact_name || "—"}</dd>
          <dt>WhatsApp</dt>
          <dd>{branch.contact_phone || "—"}</dd>
          <dt>Status</dt>
          <dd>
            <span className={`chip ${branch.status}`}>{SLBL[branch.status]}</span>
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
          <div className="card emptybox">Belum ada staf terdaftar di cabang ini.</div>
        ) : (
          activeStaff.map((s) => {
            const a = assignByStaff.get(s.id)!;
            return (
              <div key={s.id} className="staffcard">
                <div className="row1">
                  <span className="nm">{s.full_name}</span>
                  <span className="chip ACTIVE">AKTIF</span>
                </div>
                <div className="rl">
                  {a.role} · {s.phone || "tanpa telepon"}
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
      </div>
    );
  }

  return (
    <div>
      <div className="crumb">
        <a href="/admin">Partner</a> / <a href={`/admin/partners/${partnerId}`}>{partner.name}</a> /{" "}
        {branch.name}
      </div>
      <div className="pagehead">
        <span>
          <h1>Cabang {branch.name}</h1>
          <div className="muted" style={{ marginTop: 4 }}>
            {partner.name} · {branch.address}
            {branch.city ? `, ${branch.city}` : ""}
          </div>
        </span>
        <span className={`chip ${branch.status}`} style={{ fontSize: 14, padding: "5px 14px" }}>
          {SLBL[branch.status]}
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
