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

// partner_staff.code (migrasi 0019) — huruf besar/angka, 1-10 karakter, sama
// persis dengan CHECK constraint partner_staff_code_format di database.
// Kosong/undefined SAH (field opsional, "additive, not mandatory" — kode
// hanya dipakai kalau cabang mau customer_code otomatis).
const STAFF_CODE_RE = /^[A-Z0-9]{1,10}$/;

/** Trim + uppercase — supaya "as" dan "AS" dianggap kode yang sama oleh pengguna. */
function normalizeStaffCode(raw: string | undefined): string | null {
  const trimmed = (raw ?? "").trim().toUpperCase();
  return trimmed || null;
}

/**
 * partner_staff punya DUA unique constraint (client_request_id untuk
 * idempotency, partner_staff_code_partner_key untuk kode staf) — LESSONS
 * #21/#27: 23505 saja tidak cukup, harus dilihat CONSTRAINT-nya. Dipanggil
 * SETELAH isRequestIdConflict diperiksa (idempotency selalu diperiksa lebih
 * dulu, sama urutan pola actions-products.ts).
 */
function isStaffCodeConflict(outcome: { code?: string; detail?: string }): boolean {
  return outcome.code === "23505" && (outcome.detail ?? "").includes("partner_staff_code_partner_key");
}
function isStaffCodeFormatError(outcome: { code?: string }): boolean {
  return outcome.code === "23514";
}

/**
 * LESSONS #12 — kode boleh naik duluan sebelum migration 0019 dijalankan.
 * Postgres menjawab 42703 (undefined_column) kalau `code` belum ada.
 */
function isMissingColumnError(outcome: { code?: string }): boolean {
  return outcome.code === "42703";
}

export async function createStaff(
  branchId: string,
  input: { fullName: string; phone?: string; role: string; code?: string; clientRequestId: string }
): Promise<ActionResult<{ id: string }>> {
  const m = await getMessages();
  const PESAN = pesan(m);
  const supabase = await createClient();
  const fullName = input.fullName.trim();
  if (!fullName) return { error: { field: "full_name", message: m.admin.staffFullNameRequired } };
  const role = ROLES.includes(input.role as (typeof ROLES)[number]) ? input.role : "Lainnya";
  const code = normalizeStaffCode(input.code);
  if (code && !STAFF_CODE_RE.test(code)) {
    return { error: { field: "code", message: m.admin.staffCodeInvalidFormat } };
  }

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
    // LESSONS #12: kode boleh naik duluan sebelum migration 0019 — coba dulu
    // DENGAN kolom `code`, dan kalau Postgres menjawab 42703 (kolom belum
    // ada), coba ulang TANPA kolom itu sama sekali (bukan `code: null` —
    // KEHADIRAN kunci itu sendiri di payload yang bikin PostgREST menolak,
    // terlepas dari nilainya).
    const baseStaffInsert = {
      partner_id: branch.partner_id,
      full_name: fullName,
      phone: input.phone?.trim() || null,
      client_request_id: input.clientRequestId,
    };
    let written = await safeWrite(
      supabase.from("partner_staff").insert({ ...baseStaffInsert, code }).select("id").single()
    );
    if (!written.ok && written.reason === "db" && isMissingColumnError(written)) {
      written = await safeWrite(supabase.from("partner_staff").insert(baseStaffInsert).select("id").single());
    }

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
        // LESSONS #21/#27: idempotency (client_request_id) sudah diperiksa di
        // atas (recheck) — dua cabang di bawah ini menangani constraint KEDUA
        // (partner_staff_code_partner_key) dan CHECK format kode, keduanya
        // kesalahan pengguna sungguhan (bukan "mungkin sudah mendarat").
      } else if (written.reason === "db" && isStaffCodeConflict(written)) {
        return { error: { field: "code", message: m.admin.staffCodeTaken } };
      } else if (written.reason === "db" && isStaffCodeFormatError(written)) {
        return { error: { field: "code", message: m.admin.staffCodeInvalidFormat } };
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
  input: { fullName: string; phone?: string; role: string; code?: string }
): Promise<ActionResult<true>> {
  const m = await getMessages();
  const PESAN = pesan(m);
  const supabase = await createClient();
  const fullName = input.fullName.trim();
  if (!fullName) return { error: { field: "full_name", message: m.admin.staffFullNameRequired } };
  const role = ROLES.includes(input.role as (typeof ROLES)[number]) ? input.role : "Lainnya";
  const code = normalizeStaffCode(input.code);
  if (code && !STAFF_CODE_RE.test(code)) {
    return { error: { field: "code", message: m.admin.staffCodeInvalidFormat } };
  }

  const baseStaffUpdate = { full_name: fullName, phone: input.phone?.trim() || null };
  let saved = await safeWrite(
    supabase.from("partner_staff").update({ ...baseStaffUpdate, code }).eq("id", staffId).select("partner_id").single()
  );
  if (!saved.ok && saved.reason === "db" && isMissingColumnError(saved)) {
    // LESSONS #12 — sama pola dengan createStaff di atas.
    saved = await safeWrite(
      supabase.from("partner_staff").update(baseStaffUpdate).eq("id", staffId).select("partner_id").single()
    );
  }
  if (!saved.ok) {
    if (saved.reason === "db" && isStaffCodeConflict(saved)) {
      return { error: { field: "code", message: m.admin.staffCodeTaken } };
    }
    if (saved.reason === "db" && isStaffCodeFormatError(saved)) {
      return { error: { field: "code", message: m.admin.staffCodeInvalidFormat } };
    }
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
