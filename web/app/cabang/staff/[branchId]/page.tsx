import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMessages } from "@/lib/i18n";
import AddStaffButton from "./add-staff-button";
import StaffActions from "./staff-actions";

export const dynamic = "force-dynamic";

type Assignment = { staff_id: string; branch_id: string; role: string; end_at: string | null };

export default async function CabangStaffPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const m = await getMessages();
  const { branchId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  // edit_scope diambil terpisah — tidak ada FK partner_users →
  // partner_access_policies, embed langsung ditolak PostgREST saat runtime.
  const { data: pu, error: puError } = await supabase
    .from("partner_users")
    .select("branch_id, partner_id, partners:partner_id(name)")
    .maybeSingle();
  // maybeSingle() error di sini biasanya berarti lebih dari satu baris cocok —
  // terjadi kalau akun SANCI Admin (RLS-nya melihat SEMUA partner_users) membuka
  // URL /cabang/* langsung tanpa lewat halaman login (LESSONS #24 sepupu).
  if (puError) {
    return (
      <main className="pwrap">
        <div className="card">
          <div className="err">{m.cabang.errAccountLoad}</div>
        </div>
      </main>
    );
  }
  if (!pu) redirect("/");

  // RLS pada partner_branches membatasi baris: kalau branch ini tidak boleh dilihat, hasilnya kosong.
  const { data: branch } = await supabase
    .from("partner_branches")
    .select("id, name, partner_id")
    .eq("id", branchId)
    .maybeSingle();
  if (!branch) notFound();

  // Embed bisa null bila RLS menyembunyikan baris partner (mis. partner_user
  // berstatus DISABLED membuat fn_pu_partner() null) — jangan crash.
  const partner = pu.partners as unknown as { name: string } | null;
  if (!partner) {
    return (
      <main className="pwrap">
        <div className="card">
          <div className="err">{m.cabang.errPartnerLoad}</div>
        </div>
      </main>
    );
  }

  const { data: pol } = await supabase
    .from("partner_access_policies")
    .select("edit_scope")
    .eq("partner_id", pu.partner_id)
    .maybeSingle();
  const isOwnBranch = branchId === pu.branch_id;
  const canEdit = isOwnBranch || pol?.edit_scope === "PARTNER_ALL_BRANCHES";

  const [{ data: staffList }, { data: assignments }] = await Promise.all([
    supabase.from("partner_staff").select("id, full_name, phone, status").eq("partner_id", pu.partner_id),
    supabase
      .from("partner_staff_assignments")
      .select("staff_id, branch_id, role, end_at")
      .eq("branch_id", branchId)
      .is("end_at", null),
  ]);

  const assignByStaff = new Map<string, Assignment>();
  (assignments ?? []).forEach((a: Assignment) => assignByStaff.set(a.staff_id, a));
  const activeStaff = (staffList ?? []).filter((s) => s.status === "ACTIVE" && assignByStaff.has(s.id));

  return (
    <main className="pwrap">
      <div className="backrow">
        <a href="/cabang" className="linkbtn">
          {m.cabang.navBackHome}
        </a>
      </div>
      <h2 className="mtitle">{m.cabang.staffPageTitle.replace("{name}", branch.name)}</h2>
      {!isOwnBranch && (
        <div className="banner info">
          {m.cabang.staffOtherBranchNote.replace("{name}", partner.name)} {canEdit ? m.cabang.staffCanEditNote : m.cabang.staffViewOnlyNote}
        </div>
      )}

      {canEdit && (
        <div className="row" style={{ justifyContent: "flex-end", marginBottom: 14 }}>
          <AddStaffButton branchId={branchId} branchName={branch.name} />
        </div>
      )}

      {activeStaff.length === 0 ? (
        <div className="card emptybox">{m.cabang.noStaffRegistered}</div>
      ) : (
        activeStaff.map((s) => {
          const a = assignByStaff.get(s.id)!;
          return (
            <div key={s.id} className="staffcard">
              <div className="row1">
                <span className="nm">{s.full_name}</span>
                <span className="chip ACTIVE">{m.common.statusActive.toUpperCase()}</span>
              </div>
              <div className="rl">
                {a.role} · {s.phone || m.cabang.noPhoneNumber}
              </div>
              {canEdit ? (
                <div className="ops">
                  <StaffActions
                    staff={{ id: s.id, full_name: s.full_name, phone: s.phone, role: a.role }}
                  />
                </div>
              ) : (
                <div className="ops">
                  <button className="btn sm" disabled>
                    {m.cabang.homeAccessViewOnly}
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}
    </main>
  );
}
