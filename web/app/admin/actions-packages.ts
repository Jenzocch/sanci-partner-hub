"use server";

/**
 * Server Actions untuk Package (SPEC §21–23) — dikelola SANCI Admin saja.
 *
 * Pola ditiru dari actions-branches.ts (safeWrite + client_request_id, cek
 * konflik nomor permintaan sebelum konflik kode bisnis — LESSONS #21) supaya
 * jaringan lemah tidak menghasilkan Package ganda.
 *
 * partner_packages BISA belum ada di database (migration 0008 dijalankan
 * terpisah dari kode — LESSONS #12). Setiap error 42P01 diterjemahkan ke
 * pesan degradasi yang sama, bukan dibiarkan bocor sebagai error DB mentah.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CODE_RE, normalizeCode } from "@/lib/validation";
import {
  pesan,
  confirmByRequestId,
  isRequestIdConflict,
  safeWrite,
} from "@/lib/safe-write";
import { getMessages } from "@/lib/i18n";

type ActionError = { field?: string; message: string };
type ActionResult<T> = { data: T } | { error: ActionError };

function isMissingTable(code: string | undefined): boolean {
  return code === "42P01";
}

export async function createPackage(
  partnerId: string,
  input: { name: string; code: string; description?: string; clientRequestId: string }
): Promise<ActionResult<{ id: string }>> {
  const m = await getMessages();
  const PESAN = pesan(m);
  const supabase = await createClient();
  const name = input.name.trim();
  const code = normalizeCode(input.code);

  if (!name) return { error: { field: "name", message: m.admin.packageNameRequired } };
  if (!CODE_RE.test(code)) {
    return { error: { field: "code", message: m.admin.partnerCodeInvalid } };
  }

  const { data: existing, error: existingErr } = await supabase
    .from("partner_packages")
    .select("id")
    .eq("client_request_id", input.clientRequestId)
    .maybeSingle();
  if (existingErr) {
    if (isMissingTable(existingErr.code)) return { error: { message: m.admin.packageMigrationMsg } };
    return { error: { message: PESAN.serverSibuk } };
  }
  if (existing) {
    revalidatePath(`/admin/partners/${partnerId}`);
    return { data: { id: existing.id } };
  }

  const written = await safeWrite(
    supabase
      .from("partner_packages")
      .insert({
        partner_id: partnerId,
        name,
        code,
        description: input.description?.trim() || null,
        client_request_id: input.clientRequestId,
      })
      .select("id")
      .single()
  );

  const recheck = () =>
    confirmByRequestId(
      supabase
        .from("partner_packages")
        .select("id")
        .eq("client_request_id", input.clientRequestId)
        .maybeSingle()
    );

  if (!written.ok) {
    if (written.reason === "db") {
      if (isMissingTable(written.code)) return { error: { message: m.admin.packageMigrationMsg } };
      // Bentrok nomor permintaan = percobaan sebelumnya sudah mendarat (LESSONS #21).
      if (isRequestIdConflict(written)) {
        const again = await recheck();
        if (again.status === "found") {
          revalidatePath(`/admin/partners/${partnerId}`);
          return { data: { id: again.data.id } };
        }
        return { error: { message: PESAN.belumPastiBaru } };
      }
      if (written.code === "23505") {
        return { error: { field: "code", message: m.admin.packageCodeTaken } };
      }
      return { error: { message: PESAN.serverSibuk } };
    }
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

export async function updatePackage(
  id: string,
  input: { name: string; code: string; description?: string }
): Promise<ActionResult<true>> {
  const m = await getMessages();
  const PESAN = pesan(m);
  const supabase = await createClient();
  const name = input.name.trim();
  const code = normalizeCode(input.code);

  if (!name) return { error: { field: "name", message: m.admin.packageNameRequired } };
  if (!CODE_RE.test(code)) {
    return { error: { field: "code", message: m.admin.partnerCodeInvalid } };
  }

  const saved = await safeWrite(
    supabase
      .from("partner_packages")
      .update({ name, code, description: input.description?.trim() || null })
      .eq("id", id)
      .select("partner_id")
      .single()
  );

  if (!saved.ok) {
    if (saved.reason === "db") {
      if (isMissingTable(saved.code)) return { error: { message: m.admin.packageMigrationMsg } };
      if (saved.code === "23505") {
        return { error: { field: "code", message: m.admin.packageCodeTaken } };
      }
      return { error: { message: PESAN.serverSibuk } };
    }
    return { error: { message: PESAN.belumPastiUbah } };
  }

  revalidatePath(`/admin/partners/${saved.data.partner_id}`);
  return { data: true };
}

export async function setPackageStatus(
  id: string,
  status: "ACTIVE" | "INACTIVE"
): Promise<ActionResult<true>> {
  const m = await getMessages();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("partner_packages")
    .update({ status })
    .eq("id", id)
    .select("partner_id")
    .single();

  if (error || !data) {
    if (isMissingTable(error?.code)) return { error: { message: m.admin.packageMigrationMsg } };
    return { error: { message: m.admin.partnerStatusChangeFailed } };
  }

  revalidatePath(`/admin/partners/${data.partner_id}`);
  return { data: true };
}
