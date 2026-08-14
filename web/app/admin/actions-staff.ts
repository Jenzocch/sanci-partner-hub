"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type ActionError = { field?: string; message: string };
type ActionResult<T> = { data: T } | { error: ActionError };

const ROLES = ["Sales", "Resepsionis / CS", "Manajer", "Lainnya"] as const;

export async function createStaff(
  branchId: string,
  input: { fullName: string; phone?: string; role: string; clientRequestId: string }
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const fullName = input.fullName.trim();
  if (!fullName) return { error: { field: "full_name", message: "Nama lengkap wajib diisi." } };
  const role = ROLES.includes(input.role as (typeof ROLES)[number]) ? input.role : "Lainnya";

  const { data: branch } = await supabase
    .from("partner_branches")
    .select("id, partner_id")
    .eq("id", branchId)
    .maybeSingle();
  if (!branch) return { error: { message: "Cabang tidak ditemukan." } };

  const { data: existing } = await supabase
    .from("partner_staff")
    .select("id")
    .eq("client_request_id", input.clientRequestId)
    .maybeSingle();
  if (existing) {
    revalidatePath(`/admin/partners/${branch.partner_id}/branches/${branchId}`);
    revalidatePath(`/cabang/staff/${branchId}`);
    return { data: { id: existing.id } };
  }

  const { data: staff, error: staffErr } = await supabase
    .from("partner_staff")
    .insert({
      partner_id: branch.partner_id,
      full_name: fullName,
      phone: input.phone?.trim() || null,
      client_request_id: input.clientRequestId,
    })
    .select("id")
    .single();
  if (staffErr || !staff) {
    return { error: { message: "Tidak bisa menyimpan sekarang. Coba lagi sebentar lagi." } };
  }

  const { error: assignErr } = await supabase.from("partner_staff_assignments").insert({
    staff_id: staff.id,
    branch_id: branchId,
    role,
  });
  if (assignErr) {
    return { error: { message: "Staf tersimpan tetapi penugasan cabang gagal. Hubungi dukungan teknis." } };
  }

  revalidatePath(`/admin/partners/${branch.partner_id}/branches/${branchId}`);
  revalidatePath(`/cabang/staff/${branchId}`);
  return { data: { id: staff.id } };
}

export async function updateStaff(
  staffId: string,
  input: { fullName: string; phone?: string; role: string }
): Promise<ActionResult<true>> {
  const supabase = await createClient();
  const fullName = input.fullName.trim();
  if (!fullName) return { error: { field: "full_name", message: "Nama lengkap wajib diisi." } };
  const role = ROLES.includes(input.role as (typeof ROLES)[number]) ? input.role : "Lainnya";

  const { data: staff, error } = await supabase
    .from("partner_staff")
    .update({ full_name: fullName, phone: input.phone?.trim() || null })
    .eq("id", staffId)
    .select("partner_id")
    .single();
  if (error || !staff) return { error: { message: "Tidak bisa menyimpan sekarang." } };

  const { data: assignment, error: aErr } = await supabase
    .from("partner_staff_assignments")
    .update({ role })
    .eq("staff_id", staffId)
    .is("end_at", null)
    .select("branch_id")
    .maybeSingle();
  if (aErr) return { error: { message: "Tidak bisa menyimpan peran sekarang." } };

  revalidatePath(`/admin/partners/${staff.partner_id}`);
  if (assignment) {
    revalidatePath(`/admin/partners/${staff.partner_id}/branches/${assignment.branch_id}`);
    revalidatePath(`/cabang/staff/${assignment.branch_id}`);
  }
  return { data: true };
}

export async function deactivateStaff(staffId: string): Promise<ActionResult<true>> {
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
  if (error || !staff) return { error: { message: "Tidak bisa menonaktifkan sekarang." } };

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
  const supabase = await createClient();

  const { data: current } = await supabase
    .from("partner_staff_assignments")
    .select("id, branch_id, role, partner_branches:branch_id(partner_id)")
    .eq("staff_id", staffId)
    .is("end_at", null)
    .maybeSingle();
  if (!current) return { error: { message: "Penugasan aktif tidak ditemukan." } };

  const today = new Date().toISOString().slice(0, 10);
  const { error: endErr } = await supabase
    .from("partner_staff_assignments")
    .update({ end_at: today, status: "ENDED" })
    .eq("id", current.id);
  if (endErr) return { error: { message: "Tidak bisa memindahkan sekarang." } };

  const { error: startErr } = await supabase.from("partner_staff_assignments").insert({
    staff_id: staffId,
    branch_id: toBranchId,
    role: current.role,
  });
  if (startErr) return { error: { message: "Tidak bisa memindahkan sekarang." } };

  const partnerRef = current.partner_branches as unknown as { partner_id: string } | null;
  if (partnerRef) {
    revalidatePath(`/admin/partners/${partnerRef.partner_id}/branches/${current.branch_id}`);
    revalidatePath(`/admin/partners/${partnerRef.partner_id}/branches/${toBranchId}`);
  }
  return { data: true };
}
