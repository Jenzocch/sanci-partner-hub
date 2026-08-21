"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CODE_RE, normalizeCode } from "@/lib/validation";
import {
  pesan,
  confirmByRequestId,
  isRequestIdConflict,
  safeWrite,
} from "@/lib/safe-write";
import { getAdminMessages } from "@/lib/i18n";

type ActionError = { field?: string; message: string };
type ActionResult<T> = { data: T } | { error: ActionError };

export async function createBranch(
  partnerId: string,
  input: {
    name: string;
    code: string;
    address: string;
    city?: string;
    province?: string;
    contactName?: string;
    contactPhone?: string;
    clientRequestId: string;
  }
): Promise<ActionResult<{ id: string }>> {
  const m = await getAdminMessages();
  const PESAN = pesan(m);
  const supabase = await createClient();
  const name = input.name.trim();
  const address = input.address.trim();
  const code = normalizeCode(input.code);

  if (!name) return { error: { field: "name", message: m.admin.branchNameRequired } };
  if (!CODE_RE.test(code)) {
    return { error: { field: "code", message: m.admin.partnerCodeInvalid } };
  }
  if (!address) return { error: { field: "address", message: m.admin.branchAddressRequired } };

  const { data: existing } = await supabase
    .from("partner_branches")
    .select("id")
    .eq("client_request_id", input.clientRequestId)
    .maybeSingle();
  if (existing) {
    revalidatePath(`/admin/partners/${partnerId}`);
    return { data: { id: existing.id } };
  }

  const written = await safeWrite(
    supabase
      .from("partner_branches")
      .insert({
        partner_id: partnerId,
        name,
        code,
        address,
        city: input.city?.trim() || null,
        province: input.province?.trim() || null,
        contact_name: input.contactName?.trim() || null,
        contact_phone: input.contactPhone?.trim() || null,
        client_request_id: input.clientRequestId,
      })
      .select("id")
      .single()
  );

  const recheck = () =>
    confirmByRequestId(
      supabase
        .from("partner_branches")
        .select("id")
        .eq("client_request_id", input.clientRequestId)
        .maybeSingle()
    );

  if (!written.ok) {
    if (written.reason === "db") {
      // Bentrok nomor permintaan = percobaan sebelumnya sudah mendarat.
      if (isRequestIdConflict(written)) {
        const again = await recheck();
        if (again.status === "found") {
          revalidatePath(`/admin/partners/${partnerId}`);
          return { data: { id: again.data.id } };
        }
        return { error: { message: PESAN.belumPastiBaru } };
      }
      if (written.code === "23505") {
        return { error: { field: "code", message: m.admin.branchCodeTaken.replace("{code}", code) } };
      }
      return { error: { message: PESAN.serverSibuk } };
    }
    // Jawaban tidak sampai: pastikan dulu, jangan INSERT ulang (SPEC §61).
    const check = await recheck();
    if (check.status === "found") {
      revalidatePath(`/admin/partners/${partnerId}`);
      return { data: { id: check.data.id } };
    }
    return {
      error: {
        message: check.status === "absent" ? PESAN.belumTersimpan : PESAN.belumPastiBaru,
      },
    };
  }

  revalidatePath(`/admin/partners/${partnerId}`);
  return { data: { id: written.data.id } };
}

export async function updateBranch(
  id: string,
  input: {
    name: string;
    address: string;
    city?: string;
    province?: string;
    contactName?: string;
    contactPhone?: string;
  }
): Promise<ActionResult<true>> {
  const m = await getAdminMessages();
  const PESAN = pesan(m);
  const supabase = await createClient();
  const name = input.name.trim();
  const address = input.address.trim();
  if (!name) return { error: { field: "name", message: m.admin.branchNameRequired } };
  if (!address) return { error: { field: "address", message: m.admin.branchAddressRequired } };

  const saved = await safeWrite(
    supabase
      .from("partner_branches")
      .update({
        name,
        address,
        city: input.city?.trim() || null,
        province: input.province?.trim() || null,
        contact_name: input.contactName?.trim() || null,
        contact_phone: input.contactPhone?.trim() || null,
      })
      .eq("id", id)
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

  revalidatePath(`/admin/partners/${saved.data.partner_id}`);
  revalidatePath(`/admin/partners/${saved.data.partner_id}/branches/${id}`);
  return { data: true };
}

export async function setBranchStatus(
  id: string,
  status: "ACTIVE" | "SUSPENDED"
): Promise<ActionResult<true>> {
  const m = await getAdminMessages();
  const supabase = await createClient();
  const { data: branch, error } = await supabase
    .from("partner_branches")
    .update({ status })
    .eq("id", id)
    .select("partner_id")
    .single();

  if (error || !branch) return { error: { message: m.admin.partnerStatusChangeFailed } };

  revalidatePath(`/admin/partners/${branch.partner_id}`);
  revalidatePath(`/admin/partners/${branch.partner_id}/branches/${id}`);
  return { data: true };
}
