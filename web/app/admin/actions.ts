"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CODE_RE } from "@/lib/validation";

type ActionError = { field?: string; message: string };
type ActionResult<T> =
  | { data: T }
  | { error: ActionError }
  | { duplicate: { id: string; name: string } };

export async function createPartner(input: {
  name: string;
  code: string;
  contactName?: string;
  contactPhone?: string;
  clientRequestId: string;
  confirmDuplicate?: boolean;
}): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const name = input.name.trim();
  const code = input.code.trim().toUpperCase();

  if (!name) return { error: { field: "name", message: "Nama partner wajib diisi." } };
  if (!CODE_RE.test(code)) {
    return { error: { field: "code", message: "2–8 karakter, hanya A–Z, 0–9, dan tanda hubung." } };
  }

  // Idempotency (SPEC §61/§73): request yang sama (retry jaringan lemah) tidak boleh membuat baris kedua.
  const { data: existing } = await supabase
    .from("partners")
    .select("id")
    .eq("client_request_id", input.clientRequestId)
    .maybeSingle();
  if (existing) {
    revalidatePath("/admin");
    return { data: { id: existing.id } };
  }

  if (!input.confirmDuplicate) {
    const { data: dup } = await supabase
      .from("partners")
      .select("id, name")
      .ilike("name", name)
      .maybeSingle();
    if (dup) return { duplicate: { id: dup.id, name: dup.name } };
  }

  const { data, error } = await supabase
    .from("partners")
    .insert({
      name,
      code,
      contact_name: input.contactName?.trim() || null,
      contact_phone: input.contactPhone?.trim() || null,
      client_request_id: input.clientRequestId,
    })
    .select("id")
    .single();

  if (error || !data) {
    // Jangan bocorkan error DB mentah ke pengguna (SPEC §69).
    if (error?.code === "23505") {
      return { error: { field: "code", message: `Kode partner ${code} sudah dipakai.` } };
    }
    return { error: { message: "Tidak bisa menyimpan sekarang. Coba lagi sebentar lagi." } };
  }

  revalidatePath("/admin");
  return { data: { id: data.id } };
}

export async function updatePartner(
  id: string,
  input: { name: string; code?: string; contactName?: string; contactPhone?: string }
): Promise<ActionResult<true>> {
  const supabase = await createClient();
  const { data: partner } = await supabase
    .from("partners")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (!partner) return { error: { message: "Partner tidak ditemukan." } };

  const name = input.name.trim();
  if (!name) return { error: { field: "name", message: "Nama partner wajib diisi." } };

  const update: Record<string, unknown> = {
    name,
    contact_name: input.contactName?.trim() || null,
    contact_phone: input.contactPhone?.trim() || null,
  };

  const locked = partner.status !== "DRAFT";
  let code: string | undefined;
  if (!locked && input.code) {
    code = input.code.trim().toUpperCase();
    if (!CODE_RE.test(code)) {
      return { error: { field: "code", message: "2–8 karakter, hanya A–Z, 0–9, dan tanda hubung." } };
    }
    update.code = code;
  }

  const { error } = await supabase.from("partners").update(update).eq("id", id);
  if (error) {
    if (error.code === "23505") {
      return { error: { field: "code", message: `Kode partner ${code} sudah dipakai.` } };
    }
    return { error: { message: "Tidak bisa menyimpan sekarang." } };
  }

  revalidatePath("/admin");
  revalidatePath(`/admin/partners/${id}`);
  return { data: true };
}

export async function setPartnerStatus(
  id: string,
  status: "ACTIVE" | "SUSPENDED" | "INACTIVE"
): Promise<ActionResult<true>> {
  const supabase = await createClient();

  if (status === "ACTIVE") {
    // Aktivasi harus diverifikasi ulang di server — checklist di client hanya UX (SPEC §12).
    const [{ count: branchCount }, { count: userCount }, { data: policy }] = await Promise.all([
      supabase
        .from("partner_branches")
        .select("id", { count: "exact", head: true })
        .eq("partner_id", id)
        .eq("status", "ACTIVE"),
      supabase
        .from("partner_users")
        .select("id", { count: "exact", head: true })
        .eq("partner_id", id)
        .eq("status", "ACTIVE"),
      supabase.from("partner_access_policies").select("configured").eq("partner_id", id).maybeSingle(),
    ]);
    if (!branchCount || !userCount || !policy?.configured) {
      return { error: { message: "Syarat aktivasi belum lengkap." } };
    }
  }

  const { error } = await supabase.from("partners").update({ status }).eq("id", id);
  if (error) return { error: { message: "Tidak bisa mengubah status sekarang." } };

  revalidatePath("/admin");
  revalidatePath(`/admin/partners/${id}`);
  return { data: true };
}

export async function deleteDraftPartner(id: string, typedCode: string) {
  const supabase = await createClient();
  const { data: partner } = await supabase
    .from("partners")
    .select("code, status")
    .eq("id", id)
    .maybeSingle();
  if (!partner) return { error: { message: "Partner tidak ditemukan." } };
  if (partner.status !== "DRAFT") {
    return { error: { message: "Hanya partner berstatus DRAF yang bisa dihapus permanen." } };
  }
  if (typedCode.trim().toUpperCase() !== partner.code) {
    return { error: { message: `Ketik ${partner.code} persis untuk konfirmasi.` } };
  }

  const { error } = await supabase.from("partners").delete().eq("id", id);
  if (error) {
    // FK RESTRICT dari branch/staff/user lain — master data terpakai tidak boleh hilang diam-diam.
    return { error: { message: "Partner ini sudah punya data terkait — tidak bisa dihapus permanen." } };
  }

  revalidatePath("/admin");
  redirect("/admin");
}
