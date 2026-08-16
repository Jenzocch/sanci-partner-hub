import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AddStaffButton from "./add-staff-button";
import StaffActions from "./staff-actions";

export const dynamic = "force-dynamic";

type Assignment = { staff_id: string; branch_id: string; role: string; end_at: string | null };

export default async function CabangStaffPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  // edit_scope diambil terpisah — tidak ada FK partner_users →
  // partner_access_policies, embed langsung ditolak PostgREST saat runtime.
  const { data: pu } = await supabase
    .from("partner_users")
    .select("branch_id, partner_id, partners:partner_id(name)")
    .maybeSingle();
  if (!pu) redirect("/");

  // RLS pada partner_branches membatasi baris: kalau branch ini tidak boleh dilihat, hasilnya kosong.
  const { data: branch } = await supabase
    .from("partner_branches")
    .select("id, name, partner_id")
    .eq("id", branchId)
    .maybeSingle();
  if (!branch) notFound();

  const partner = pu.partners as unknown as { name: string };
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
          ← Beranda
        </a>
      </div>
      <h2 className="mtitle">Staf — {branch.name}</h2>
      {!isOwnBranch && (
        <div className="banner" style={{ background: "var(--accent-soft)", color: "var(--accent-2)", fontSize: 13.5 }}>
          Cabang {partner.name} lainnya. {canEdit ? "Anda bisa mengubahnya (kebijakan Lihat + Edit)." : "Lihat saja."}
        </div>
      )}

      {canEdit && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
          <AddStaffButton branchId={branchId} branchName={branch.name} />
        </div>
      )}

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
              {canEdit ? (
                <div className="ops">
                  <StaffActions
                    staff={{ id: s.id, full_name: s.full_name, phone: s.phone, role: a.role }}
                  />
                </div>
              ) : (
                <div className="ops">
                  <button className="btn sm" disabled>
                    Lihat saja
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
