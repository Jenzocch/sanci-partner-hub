"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CODE_RE, normalizeCode } from "@/lib/validation";

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
  const supabase = await createClient();
  const name = input.name.trim();
  const address = input.address.trim();
  const code = normalizeCode(input.code);

  if (!name) return { error: { field: "name", message: "Nama cabang wajib diisi." } };
  if (!CODE_RE.test(code)) {
    return { error: { field: "code", message: "2–8 karakter, hanya A–Z, 0–9, dan tanda hubung." } };
  }
  if (!address) return { error: { field: "address", message: "Alamat lengkap wajib diisi." } };

  const { data: existing } = await supabase
    .from("partner_branches")
    .select("id")
    .eq("client_request_id", input.clientRequestId)
    .maybeSingle();
  if (existing) {
    revalidatePath(`/admin/partners/${partnerId}`);
    return { data: { id: existing.id } };
  }

  const { data, error } = await supabase
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
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      return { error: { field: "code", message: `Kode cabang ${code} sudah ada di partner ini.` } };
    }
    return { error: { message: "Tidak bisa menyimpan sekarang. Coba lagi sebentar lagi." } };
  }

  revalidatePath(`/admin/partners/${partnerId}`);
  return { data: { id: data.id } };
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
  const supabase = await createClient();
  const name = input.name.trim();
  const address = input.address.trim();
  if (!name) return { error: { field: "name", message: "Nama cabang wajib diisi." } };
  if (!address) return { error: { field: "address", message: "Alamat lengkap wajib diisi." } };

  const { data: branch, error } = await supabase
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
    .single();

  if (error || !branch) return { error: { message: "Tidak bisa menyimpan sekarang." } };

  revalidatePath(`/admin/partners/${branch.partner_id}`);
  revalidatePath(`/admin/partners/${branch.partner_id}/branches/${id}`);
  return { data: true };
}

export async function setBranchStatus(
  id: string,
  status: "ACTIVE" | "SUSPENDED"
): Promise<ActionResult<true>> {
  const supabase = await createClient();
  const { data: branch, error } = await supabase
    .from("partner_branches")
    .update({ status })
    .eq("id", id)
    .select("partner_id")
    .single();

  if (error || !branch) return { error: { message: "Tidak bisa mengubah status sekarang." } };

  revalidatePath(`/admin/partners/${branch.partner_id}`);
  revalidatePath(`/admin/partners/${branch.partner_id}/branches/${id}`);
  return { data: true };
}
