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
import { PESAN, safeWrite } from "@/lib/safe-write";

type ActionError = { field?: string; message: string };
type ActionResult<T> = { data: T } | { error: ActionError };

const RPC_TIMEOUT_MS = 15_000;
const TIMED_OUT = Symbol("timeout");

const MIGRATION_MSG = "Fitur koreksi atribusi belum aktif — migrasi belum dijalankan.";

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

const FULFILLMENT_MIGRATION_MSG =
  "Fitur jalur pesanan belum aktif — migrasi database belum dijalankan.";
const NOTES_MIGRATION_MSG =
  "Fitur catatan internal belum aktif — migrasi database belum dijalankan.";

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
  const supabase = await createClient();

  const { data: order, error: fetchErr } = await supabase
    .from("partner_orders")
    .select("fulfillment_path, customer_arrived_at")
    .eq("id", orderId)
    .maybeSingle();

  if (fetchErr) {
    if (isMissingColumnError(fetchErr.code)) return { error: { message: FULFILLMENT_MIGRATION_MSG } };
    return { error: { message: PESAN.serverSibuk } };
  }
  if (!order) return { error: { message: "Pesanan tidak ditemukan." } };
  if (order.fulfillment_path !== "SHOWROOM_VISIT") {
    return { error: { message: "Hanya pesanan jalur Kunjungan Showroom yang bisa ditandai tiba." } };
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
      if (isMissingColumnError(written.code)) return { error: { message: FULFILLMENT_MIGRATION_MSG } };
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
      return { error: { message: "Tidak bisa menandai kedatangan sekarang. Coba lagi." } };
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
 * Catatan: tabel ini TIDAK punya kolom idempotency (client_request_id) di
 * kontrak DB slice ini, jadi retry-setelah-jaringan-putus tidak bisa
 * dipastikan aman dari duplikasi lewat mekanisme lookup seperti createPackage
 * — pesan "belum pasti" di bawah sengaja mengarahkan pengguna memeriksa
 * daftar catatan yang langsung tampil sebelum menekan Simpan lagi.
 */
export async function addInternalNote(
  orderId: string,
  note: string
): Promise<ActionResult<{ id: string; createdAt: string }>> {
  const supabase = await createClient();
  const trimmed = note.trim();

  if (!trimmed) return { error: { field: "note", message: "Catatan tidak boleh kosong." } };
  if (trimmed.length > 2000) {
    return { error: { field: "note", message: "Catatan terlalu panjang (maksimal 2000 karakter)." } };
  }

  const written = await safeWrite(
    supabase
      .from("order_internal_notes")
      .insert({ order_id: orderId, note: trimmed })
      .select("id, created_at")
      .single()
  );

  if (!written.ok) {
    if (written.reason === "db") {
      if (isMissingTable(written.code)) return { error: { message: NOTES_MIGRATION_MSG } };
      return { error: { message: PESAN.serverSibuk } };
    }
    return { error: { message: PESAN.belumPastiBaru } };
  }

  revalidatePath(`/admin/orders/${orderId}`);
  return { data: { id: String(written.data.id), createdAt: written.data.created_at } };
}

const INVOICE_BUCKET = "order-invoices";
const INVOICE_URL_TTL_SECONDS = 300;

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
