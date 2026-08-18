"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  pesan,
  confirmByRequestId,
  isRequestIdConflict,
  safeWrite,
} from "@/lib/safe-write";
import { getMessages } from "@/lib/i18n";

type ActionError = { field?: string; message: string };
type ActionResult<T> = { data: T } | { error: ActionError };

const ROLES = ["Sales", "Resepsionis / CS", "Manajer", "Lainnya"] as const;

export async function createStaff(
  branchId: string,
  input: { fullName: string; phone?: string; role: string; clientRequestId: string }
): Promise<ActionResult<{ id: string }>> {
  const m = await getMessages();
  const PESAN = pesan(m);
  const supabase = await createClient();
  const fullName = input.fullName.trim();
  if (!fullName) return { error: { field: "full_name", message: m.admin.staffFullNameRequired } };
  const role = ROLES.includes(input.role as (typeof ROLES)[number]) ? input.role : "Lainnya";

  const { data: branch } = await supabase
    .from("partner_branches")
    .select("id, partner_id")
    .eq("id", branchId)
    .maybeSingle();
  if (!branch) return { error: { message: m.admin.branchNotFound } };

  const { data: existing } = await supabase
    .from("partner_staff")
    .select("id")
    .eq("client_request_id", input.clientRequestId)
    .maybeSingle();

  let staffId: string;
  if (existing) {
    // Kiriman ulang dari permintaan yang sama. Jangan buat staf kedua, tapi tetap
    // lanjut ke pemeriksaan penugasan di bawah — percobaan pertama bisa saja
    // terputus setelah staf tersimpan tetapi sebelum penugasan cabang dibuat.
    staffId = existing.id;
  } else {
    const written = await safeWrite(
      supabase
        .from("partner_staff")
        .insert({
          partner_id: branch.partner_id,
          full_name: fullName,
          phone: input.phone?.trim() || null,
          client_request_id: input.clientRequestId,
        })
        .select("id")
        .single()
    );

    if (written.ok) {
      staffId = written.data.id;
    } else {
      const recheck =
        written.reason === "unconfirmed" || isRequestIdConflict(written)
          ? await confirmByRequestId(
              supabase
                .from("partner_staff")
                .select("id")
                .eq("client_request_id", input.clientRequestId)
                .maybeSingle()
            )
          : null;

      if (recheck?.status === "found") {
        // Percobaan sebelumnya ternyata mendarat — lanjut ke penugasan, jangan buat staf kedua.
        staffId = recheck.data.id;
      } else if (recheck?.status === "absent") {
        return { error: { message: PESAN.belumTersimpan } };
      } else if (recheck) {
        return { error: { message: PESAN.belumPastiBaru } };
      } else {
        return { error: { message: PESAN.serverSibuk } };
      }
    }
  }

  // Penugasan hanya dibuat kalau staf ini belum punya penugasan aktif — melindungi
  // jalur ulang setelah jaringan putus agar riwayat tidak terisi dua baris.
  const { data: activeAssignment } = await supabase
    .from("partner_staff_assignments")
    .select("id")
    .eq("staff_id", staffId)
    .is("end_at", null)
    .maybeSingle();

  if (!activeAssignment) {
    const assigned = await safeWrite(
      supabase
        .from("partner_staff_assignments")
        .insert({ staff_id: staffId, branch_id: branchId, role })
        .select("id")
        .single()
    );
    if (!assigned.ok) {
      return {
        error: {
          message:
            assigned.reason === "unconfirmed"
              ? PESAN.belumPastiBaru
              : m.admin.staffAssignmentPartialFail,
        },
      };
    }
  }

  revalidatePath(`/admin/partners/${branch.partner_id}/branches/${branchId}`);
  revalidatePath(`/cabang/staff/${branchId}`);
  return { data: { id: staffId } };
}

export async function updateStaff(
  staffId: string,
  input: { fullName: string; phone?: string; role: string }
): Promise<ActionResult<true>> {
  const m = await getMessages();
  const PESAN = pesan(m);
  const supabase = await createClient();
  const fullName = input.fullName.trim();
  if (!fullName) return { error: { field: "full_name", message: m.admin.staffFullNameRequired } };
  const role = ROLES.includes(input.role as (typeof ROLES)[number]) ? input.role : "Lainnya";

  const saved = await safeWrite(
    supabase
      .from("partner_staff")
      .update({ full_name: fullName, phone: input.phone?.trim() || null })
      .eq("id", staffId)
      .select("partner_id")
      .single()
  );
  if (!saved.ok) {
    return {
      error: {
        message: saved.reason === "unconfirmed" ? PESAN.belumPastiUbah : PESAN.serverSibuk,
      },
    };
  }
  const staff = saved.data;

  const { data: assignment, error: aErr } = await supabase
    .from("partner_staff_assignments")
    .update({ role })
    .eq("staff_id", staffId)
    .is("end_at", null)
    .select("branch_id")
    .maybeSingle();
  if (aErr) return { error: { message: m.admin.staffAssignmentSavedFailed } };

  revalidatePath(`/admin/partners/${staff.partner_id}`);
  if (assignment) {
    revalidatePath(`/admin/partners/${staff.partner_id}/branches/${assignment.branch_id}`);
    revalidatePath(`/cabang/staff/${assignment.branch_id}`);
  }
  return { data: true };
}

export async function deactivateStaff(staffId: string): Promise<ActionResult<true>> {
  const m = await getMessages();
  const supabase = await createClient();

  const { data: assignment } = await supabase
    .from("partner_staff_assignments")
    .select("branch_id")
    .eq("staff_id", staffId)
    .is("end_at", null)
    .maybeSingle();

  const { data: staff, error } = await supabase
    .from("partner_staff")
    .update({ status: "INACTIVE" })
    .eq("id", staffId)
    .select("partner_id")
    .single();
  if (error || !staff) return { error: { message: m.admin.staffDeactivateFailed } };

  if (assignment) {
    await supabase
      .from("partner_staff_assignments")
      .update({ end_at: new Date().toISOString().slice(0, 10), status: "ENDED" })
      .eq("staff_id", staffId)
      .is("end_at", null);
    revalidatePath(`/admin/partners/${staff.partner_id}/branches/${assignment.branch_id}`);
    revalidatePath(`/cabang/staff/${assignment.branch_id}`);
  }
  revalidatePath(`/admin/partners/${staff.partner_id}`);
  return { data: true };
}

export async function transferStaff(
  staffId: string,
  toBranchId: string
): Promise<ActionResult<true>> {
  const m = await getMessages();
  const supabase = await createClient();

  const { data: current } = await supabase
    .from("partner_staff_assignments")
    .select("id, branch_id, role, partner_branches:branch_id(partner_id)")
    .eq("staff_id", staffId)
    .is("end_at", null)
    .maybeSingle();
  if (!current) return { error: { message: m.admin.staffTransferActiveNotFound } };

  const today = new Date().toISOString().slice(0, 10);
  const { data: ended, error: endErr } = await supabase
    .from("partner_staff_assignments")
    .update({ end_at: today, status: "ENDED" })
    .eq("id", current.id)
    .select("id")
    .maybeSingle();
  if (endErr) return { error: { message: m.admin.staffTransferFailed } };
  // RLS bisa menyaring update ini jadi 0 baris tanpa error (mis. beda cabang yang
  // tidak terlihat) — kalau tidak dipastikan, jangan lanjut buat penugasan baru,
  // nanti staf ini malah kepasang di dua cabang sekaligus.
  if (!ended) return { error: { message: m.admin.staffTransferFailed } };

  const { error: startErr } = await supabase.from("partner_staff_assignments").insert({
    staff_id: staffId,
    branch_id: toBranchId,
    role: current.role,
  });
  if (startErr) return { error: { message: m.admin.staffTransferFailed } };

  const partnerRef = current.partner_branches as unknown as { partner_id: string } | null;
  if (partnerRef) {
    revalidatePath(`/admin/partners/${partnerRef.partner_id}/branches/${current.branch_id}`);
    revalidatePath(`/admin/partners/${partnerRef.partner_id}/branches/${toBranchId}`);
  }
  return { data: true };
}
