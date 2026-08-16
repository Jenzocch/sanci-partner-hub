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
  PESAN,
  confirmByRequestId,
  isRequestIdConflict,
  safeWrite,
} from "@/lib/safe-write";

type ActionError = { field?: string; message: string };
type ActionResult<T> = { data: T } | { error: ActionError };

// Tidak diekspor: file "use server" hanya boleh mengekspor async function.
// Nilai yang sama dipakai lagi di partners/[id]/page.tsx sebagai string literal.
const PACKAGE_MIGRATION_MSG = "Fitur package belum aktif — migrasi belum dijalankan.";

function isMissingTable(code: string | undefined): boolean {
  return code === "42P01";
}

export async function createPackage(
  partnerId: string,
  input: { name: string; code: string; description?: string; clientRequestId: string }
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const name = input.name.trim();
  const code = normalizeCode(input.code);

  if (!name) return { error: { field: "name", message: "Nama package wajib diisi." } };
  if (!CODE_RE.test(code)) {
    return { error: { field: "code", message: "2–8 karakter, hanya A–Z, 0–9, dan tanda hubung." } };
  }

  const { data: existing, error: existingErr } = await supabase
    .from("partner_packages")
    .select("id")
    .eq("client_request_id", input.clientRequestId)
    .maybeSingle();
  if (existingErr) {
    if (isMissingTable(existingErr.code)) return { error: { message: PACKAGE_MIGRATION_MSG } };
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
      if (isMissingTable(written.code)) return { error: { message: PACKAGE_MIGRATION_MSG } };
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
        return { error: { field: "code", message: "Kode package sudah dipakai." } };
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
  const supabase = await createClient();
  const name = input.name.trim();
  const code = normalizeCode(input.code);

  if (!name) return { error: { field: "name", message: "Nama package wajib diisi." } };
  if (!CODE_RE.test(code)) {
    return { error: { field: "code", message: "2–8 karakter, hanya A–Z, 0–9, dan tanda hubung." } };
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
      if (isMissingTable(saved.code)) return { error: { message: PACKAGE_MIGRATION_MSG } };
      if (saved.code === "23505") {
        return { error: { field: "code", message: "Kode package sudah dipakai." } };
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
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("partner_packages")
    .update({ status })
    .eq("id", id)
    .select("partner_id")
    .single();

  if (error || !data) {
    if (isMissingTable(error?.code)) return { error: { message: PACKAGE_MIGRATION_MSG } };
    return { error: { message: "Tidak bisa mengubah status sekarang." } };
  }

  revalidatePath(`/admin/partners/${data.partner_id}`);
  return { data: true };
}
