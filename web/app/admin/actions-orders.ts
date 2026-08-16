"use server";

/**
 * Server Action Admin untuk Order (SPEC §16, §64) — Correct Attribution.
 *
 * Hanya SANCI Admin yang boleh memanggil RPC ini (ditegakkan di dalam fungsi
 * database itu sendiri — zero-trust, LESSONS #5/#6: kalaupun Server Action ini
 * dipanggil langsung lewat devtools oleh akun bukan-admin, RPC-nya sendiri
 * yang menolak). Perubahan cabang + audit ORDER_ATTRIBUTION_CORRECTED (before/
 * after/reason/actor/waktu server) seluruhnya terjadi di satu transaksi di
 * dalam fungsi database — bukan dua langkah terpisah dari sini, supaya tidak
 * ada celah "cabang berubah tapi audit gagal dicatat".
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { PESAN } from "@/lib/safe-write";

type ActionError = { field?: string; message: string };
type ActionResult<T> = { data: T } | { error: ActionError };

const RPC_TIMEOUT_MS = 15_000;
const TIMED_OUT = Symbol("timeout");

const MIGRATION_MSG = "Fitur koreksi atribusi belum aktif — migrasi belum dijalankan.";

/**
 * Sengaja tidak memakai safeWrite() dari lib/safe-write.ts: safeWrite menolak
 * hasil dengan `data === null` sebagai kegagalan ("no row returned"), padahal
 * RPC ini mungkin tidak mengembalikan baris sama sekali. Perilaku yang tetap
 * dipertahankan dari safeWrite: SELALU periksa field `error` (Supabase tidak
 * melempar exception saat gagal), dan respons yang hilang di jaringan lemah
 * dilaporkan "unconfirmed" — bukan ditebak sukses atau gagal (LESSONS #2).
 */
async function callRpcSafely(
  op: PromiseLike<{ data: unknown; error: { code?: string; message?: string; details?: string } | null }>
): Promise<
  | { ok: true }
  | { ok: false; reason: "db"; code?: string; detail: string }
  | { ok: false; reason: "unconfirmed" }
> {
  let res:
    | { data: unknown; error: { code?: string; message?: string; details?: string } | null }
    | typeof TIMED_OUT;
  try {
    res = await Promise.race([
      op,
      new Promise<typeof TIMED_OUT>((resolve) => setTimeout(() => resolve(TIMED_OUT), RPC_TIMEOUT_MS)),
    ]);
  } catch {
    return { ok: false, reason: "unconfirmed" };
  }
  if (res === TIMED_OUT) return { ok: false, reason: "unconfirmed" };
  if (res.error) {
    return {
      ok: false,
      reason: "db",
      code: res.error.code,
      detail: `${res.error.message ?? ""} ${res.error.details ?? ""}`,
    };
  }
  return { ok: true };
}

export async function correctOrderAttribution(
  orderId: string,
  newBranchId: string,
  reason: string
): Promise<ActionResult<true>> {
  const supabase = await createClient();
  const trimmedReason = reason.trim();

  if (!newBranchId) return { error: { field: "branch_id", message: "Pilih cabang tujuan." } };
  if (!trimmedReason) return { error: { field: "reason", message: "Alasan koreksi wajib diisi." } };
  if (trimmedReason.length > 500) {
    return { error: { field: "reason", message: "Alasan terlalu panjang (maksimal 500 karakter)." } };
  }

  const outcome = await callRpcSafely(
    supabase.rpc("fn_correct_order_attribution", {
      p_order_id: orderId,
      p_new_branch_id: newBranchId,
      p_reason: trimmedReason,
    })
  );

  if (!outcome.ok) {
    if (outcome.reason === "unconfirmed") {
      return { error: { message: PESAN.belumPastiUbah } };
    }
    if (outcome.code === "42883") {
      // undefined_function: migrasi RPC belum dijalankan.
      return { error: { message: MIGRATION_MSG } };
    }
    // Jangan pernah meneruskan pesan RAISE EXCEPTION / error Postgres mentah ke
    // layar (SPEC §69) — termasuk penolakan bisnis seperti "cabang tujuan
    // bukan milik partner yang sama". Dropdown di UI sudah membatasi pilihan ke
    // cabang partner yang sama, jadi kasus ini seharusnya jarang; kalau tetap
    // terjadi (mis. data berubah di tab lain), pesan generik ini yang tampil.
    return { error: { message: "Tidak bisa mengoreksi atribusi sekarang. Periksa cabang tujuan lalu coba lagi." } };
  }

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  return { data: true };
}
