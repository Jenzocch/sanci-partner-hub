"use server";

/**
 * Server Action Admin untuk Order (SPEC §16, §64) — Correct Attribution,
 * plus slice Phase 2 #4 (Jalur/Invoice/Kedatangan/Catatan Internal SANCI).
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
import { pesan, confirmByRequestId, isRequestIdConflict, safeWrite } from "@/lib/safe-write";
import { getMessages } from "@/lib/i18n";

type ActionError = { field?: string; message: string };
type ActionResult<T> = { data: T } | { error: ActionError };

const RPC_TIMEOUT_MS = 15_000;
const TIMED_OUT = Symbol("timeout");

/**
 * fulfillment_path/partner_purchase_amount/invoice_url/customer_arrived_at
 * (migration 0009, dikerjakan paralel) BISA belum ada di database (LESSONS
 * #12) — kalau kolomnya belum ada, Postgres menjawab 42703 (undefined_column),
 * BUKAN 42P01 (tabel hilang). Pola sama dengan cabang/pesanan/actions.ts.
 */
function isMissingColumnError(code: string | undefined): boolean {
  return code === "42703";
}

function isMissingTable(code: string | undefined): boolean {
  return code === "42P01";
}

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
  const m = await getMessages();
  const PESAN = pesan(m);
  const supabase = await createClient();
  const trimmedReason = reason.trim();

  if (!newBranchId) return { error: { field: "branch_id", message: m.admin.correctAttributionBranchRequired } };
  if (!trimmedReason) return { error: { field: "reason", message: m.admin.correctAttributionReasonRequired } };
  if (trimmedReason.length > 500) {
    return { error: { field: "reason", message: m.admin.correctAttributionReasonTooLong } };
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
      return { error: { message: m.admin.correctAttributionMigrationOff } };
    }
    // Jangan pernah meneruskan pesan RAISE EXCEPTION / error Postgres mentah ke
    // layar (SPEC §69) — termasuk penolakan bisnis seperti "cabang tujuan
    // bukan milik partner yang sama". Dropdown di UI sudah membatasi pilihan ke
    // cabang partner yang sama, jadi kasus ini seharusnya jarang; kalau tetap
    // terjadi (mis. data berubah di tab lain), pesan generik ini yang tampil.
    return { error: { message: m.admin.correctAttributionGenericFail } };
  }

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  return { data: true };
}

/**
 * Tandai "Pelanggan Sudah Tiba" — hanya untuk pesanan jalur SHOWROOM_VISIT
 * (SPEC slice ini). `customer_arrived_at` yang dikirim dari sini akan DITIMPA
 * oleh trigger database dengan waktu server + aktor sesungguhnya (LESSONS
 * #11: jangan percaya jam client) — nilai yang dikirim di sini hanya pemicu.
 * DB juga menolak tulisan ini dari akun cabang (zero-trust, LESSONS #5/#6).
 *
 * safeWrite() + `.select().single()` memastikan rowcount benar-benar 1
 * sebelum dilaporkan sukses — RLS yang menolak (0 baris) TIDAK dianggap
 * berhasil (LESSONS #7, "sukses" tanpa bukti bukan sukses).
 */
export async function markCustomerArrived(
  orderId: string
): Promise<ActionResult<{ customerArrivedAt: string }>> {
  const m = await getMessages();
  const PESAN = pesan(m);
  const supabase = await createClient();

  const { data: order, error: fetchErr } = await supabase
    .from("partner_orders")
    .select("fulfillment_path, customer_arrived_at")
    .eq("id", orderId)
    .maybeSingle();

  if (fetchErr) {
    if (isMissingColumnError(fetchErr.code)) return { error: { message: m.admin.fulfillmentMigrationOffOrder } };
    return { error: { message: PESAN.serverSibuk } };
  }
  if (!order) return { error: { message: m.admin.orderNotFound } };
  if (order.fulfillment_path !== "SHOWROOM_VISIT") {
    return { error: { message: m.admin.markArrivedWrongFulfillment } };
  }
  if (order.customer_arrived_at) {
    // Sudah ditandai (mis. tab lain) — idempotent, bukan error (LESSONS #21).
    return { data: { customerArrivedAt: order.customer_arrived_at } };
  }

  const written = await safeWrite(
    supabase
      .from("partner_orders")
      .update({ customer_arrived_at: new Date().toISOString() })
      .eq("id", orderId)
      .select("customer_arrived_at")
      .single()
  );

  if (!written.ok) {
    if (written.reason === "db") {
      if (isMissingColumnError(written.code)) return { error: { message: m.admin.fulfillmentMigrationOffOrder } };
      // Kemungkinan tab lain sudah menandai duluan di antara cek dan tulis —
      // cek ulang sebelum melapor gagal, bukan langsung disebut error.
      const { data: recheck } = await supabase
        .from("partner_orders")
        .select("customer_arrived_at")
        .eq("id", orderId)
        .maybeSingle();
      if (recheck?.customer_arrived_at) {
        return { data: { customerArrivedAt: recheck.customer_arrived_at } };
      }
      return { error: { message: m.admin.markArrivedFailed } };
    }
    return { error: { message: PESAN.belumPastiUbah } };
  }

  revalidatePath(`/admin/orders/${orderId}`);
  return { data: { customerArrivedAt: written.data.customer_arrived_at } };
}

/**
 * Catatan Internal SANCI (order_internal_notes, migration 0009) — HANYA
 * SANCI Admin, append-only (tidak ada edit/hapus dari UI ini sama sekali;
 * salah tulis dikoreksi dengan menambah catatan baru). Visibilitas partner
 * ditolak di RLS, bukan cuma disembunyikan di UI (LESSONS #5).
 *
 * order_internal_notes SUDAH punya kolom `client_request_id` + unique index
 * (ditambahkan saat integrasi 0009 — sudah diverifikasi di production, lihat
 * NOTES_IDEMPOTENCY_KEY). Pola idempotency di bawah ditiru dari createPackage
 * di actions-packages.ts (LESSONS #21): cek nomor permintaan dulu → insert →
 * kalau bentrok/tak pasti, tanya ulang lewat nomor permintaan yang sama,
 * supaya jaringan lemah tidak membuat catatan ganda.
 */
export async function addInternalNote(
  orderId: string,
  note: string,
  clientRequestId: string
): Promise<ActionResult<{ id: string; createdAt: string }>> {
  const m = await getMessages();
  const PESAN = pesan(m);
  const supabase = await createClient();
  const trimmed = note.trim();

  if (!trimmed) return { error: { field: "note", message: m.admin.internalNoteEmptyErr } };
  if (trimmed.length > 2000) {
    return { error: { field: "note", message: m.admin.internalNoteTooLong } };
  }

  const { data: existing, error: existingErr } = await supabase
    .from("order_internal_notes")
    .select("id, created_at")
    .eq("client_request_id", clientRequestId)
    .maybeSingle();
  if (existingErr) {
    if (isMissingTable(existingErr.code)) return { error: { message: m.admin.internalNoteFeatureOffAction } };
    return { error: { message: PESAN.serverSibuk } };
  }
  if (existing) {
    revalidatePath(`/admin/orders/${orderId}`);
    return { data: { id: String(existing.id), createdAt: existing.created_at } };
  }

  const written = await safeWrite(
    supabase
      .from("order_internal_notes")
      .insert({ order_id: orderId, note: trimmed, client_request_id: clientRequestId })
      .select("id, created_at")
      .single()
  );

  const recheck = () =>
    confirmByRequestId(
      supabase
        .from("order_internal_notes")
        .select("id, created_at")
        .eq("client_request_id", clientRequestId)
        .maybeSingle()
    );

  if (!written.ok) {
    if (written.reason === "db") {
      if (isMissingTable(written.code)) return { error: { message: m.admin.internalNoteFeatureOffAction } };
      // Bentrok nomor permintaan = percobaan sebelumnya sudah mendarat (LESSONS #21).
      if (isRequestIdConflict(written)) {
        const again = await recheck();
        if (again.status === "found") {
          revalidatePath(`/admin/orders/${orderId}`);
          return { data: { id: String(again.data.id), createdAt: again.data.created_at } };
        }
        return { error: { message: PESAN.belumPastiBaru } };
      }
      return { error: { message: PESAN.serverSibuk } };
    }
    // Jawaban tidak sampai: tanyakan status sebenarnya, jangan INSERT lagi.
    const check = await recheck();
    if (check.status === "found") {
      revalidatePath(`/admin/orders/${orderId}`);
      return { data: { id: String(check.data.id), createdAt: check.data.created_at } };
    }
    return {
      error: { message: check.status === "absent" ? PESAN.belumTersimpan : PESAN.belumPastiBaru },
    };
  }

  revalidatePath(`/admin/orders/${orderId}`);
  return { data: { id: String(written.data.id), createdAt: written.data.created_at } };
}

const INVOICE_BUCKET = "order-invoices";
// Samakan dengan cabang/pesanan/actions.ts (getOrderInvoiceSignedUrl): 1 jam,
// bukan 5 menit. Link ini dibuat sekali saat server render halaman detail —
// TTL pendek berarti admin yang buka halaman lalu baru klik "Lihat Invoice"
// beberapa menit kemudian dapat 403 tanpa jalan untuk memuat ulang tautannya
// selain reload seluruh halaman.
const INVOICE_URL_TTL_SECONDS = 3600;

/**
 * Bucket invoice bersifat PRIVATE (bukan seperti partner-logos yang publik) —
 * tampilan wajib lewat signed URL berumur pendek, tidak pernah URL publik
 * tetap. Kalau bucket/kolom belum ada (migrasi belum jalan) atau file hilang,
 * degradasi diam-diam ke `{ error: true }` — halaman tetap tampil, tinggal
 * bagian invoice yang bilang "belum bisa dimuat" (LESSONS #12).
 */
export async function getInvoiceSignedUrl(path: string): Promise<{ url: string } | { error: true }> {
  const supabase = await createClient();
  try {
    const { data, error } = await supabase.storage
      .from(INVOICE_BUCKET)
      .createSignedUrl(path, INVOICE_URL_TTL_SECONDS);
    if (error || !data?.signedUrl) return { error: true };
    return { url: data.signedUrl };
  } catch {
    return { error: true };
  }
}
