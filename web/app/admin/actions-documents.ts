"use server";

/**
 * Server Actions untuk Dokumen Pesanan (order_documents/order_document_items,
 * migration 0016) — SO/DO/Invoice dibangkitkan di dalam sistem, admin-only.
 *
 * Idiom rumah dipertahankan penuh: `pesan(m)`/`safeWrite`/idempotency lewat
 * `client_request_id`/turun mulus kalau 0016 belum dijalankan (42P01/42883).
 * BEDA dari kebanyakan action lain di berkas ini: dua penulisan intinya
 * (buat dokumen, ganti isi dokumen) lewat RPC (`fn_create_order_document`/
 * `fn_replace_order_document_items`) supaya header+baris SATU transaksi —
 * lihat kepala migration 0016 §7/§8 untuk alasan lengkapnya.
 *
 * PENOMORAN (prefix+suffix) DIHITUNG DI SINI, bukan di database — RPC-nya
 * "bodoh" soal nomor (0016 §7). Pola retry: hitung dokumen bertipe sama yang
 * sudah ada → +1 → panggil RPC → kalau 23505 pada doc_number (BUKAN pada
 * client_request_id, LESSONS #21/#27), hitung ulang dan coba lagi — sampai
 * MAX_NUMBERING_ATTEMPTS kali, cukup untuk menyerap rebutan bersamaan yang
 * wajar tanpa berputar selamanya kalau ada masalah lain.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { pesan, safeWrite, isRequestIdConflict } from "@/lib/safe-write";
import { getAdminMessages } from "@/lib/i18n";
import type { AdminMessages } from "@/lib/i18n/messages";
import { DOC_TYPE_PREFIX, fetchItemCoverage, type DocType } from "@/lib/documents-shared";

type ActionError = { field?: string; message: string };
type ActionResult<T> = { data: T } | { error: ActionError };

function isMissingTable(code: string | undefined): boolean {
  return code === "42P01";
}
function isMissingFunction(code: string | undefined): boolean {
  // undefined_function — RPC belum dijalankan (0016 belum di-migrate).
  return code === "42883";
}

const MAX_NUMBERING_ATTEMPTS = 6;
const RPC_TIMEOUT_MS = 15_000;
const TIMED_OUT = Symbol("timeout");

/**
 * `fn_replace_order_document_items` sengaja `returns void` (0016 §8) —
 * `safeWrite()` dari lib/safe-write.ts menolak `data === null` sebagai
 * kegagalan ("no row returned"), yang SALAH untuk RPC void yang berhasil
 * (tidak ada baris untuk dikembalikan BUKAN berarti gagal). Pola sama
 * dengan `callRpcSafely` di actions-orders.ts (dipakai fn_correct_order_
 * attribution) — SELALU periksa field `error` secara eksplisit
 * (supabase-js tidak melempar exception saat gagal), respons hilang
 * dilaporkan "unconfirmed", tidak pernah ditebak.
 */
async function callVoidRpcSafely(
  op: PromiseLike<{ error: { code?: string; message?: string; details?: string } | null }>
): Promise<
  | { ok: true }
  | { ok: false; reason: "db"; code?: string; detail: string }
  | { ok: false; reason: "unconfirmed" }
> {
  let res: { error: { code?: string; message?: string; details?: string } | null } | typeof TIMED_OUT;
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

export type DocumentItemInput = { orderItemId: string; quantity: string };

/**
 * Kuantitas nol/kosong DIBUANG (bukan error) — pola yang sama dengan slot
 * diskon kosong di setOrderOffer (0015): pemilih item di modal menampilkan
 * SEMUA baris pesanan dengan input default "sisa", dan mengosongkan/
 * menge-nolkan satu baris berarti "jangan sertakan baris ini", bukan
 * kesalahan pengguna.
 */
function parseDocumentItems(
  m: AdminMessages,
  raw: DocumentItemInput[]
): { ok: true; value: { order_item_id: string; quantity: number }[] } | { ok: false; error: ActionError } {
  const out: { order_item_id: string; quantity: number }[] = [];
  for (const it of raw) {
    const qty = Number(it.quantity);
    if (!it.orderItemId) continue;
    if (!it.quantity || it.quantity.trim() === "" || qty <= 0) continue; // zero/kosong = dikecualikan
    if (!Number.isInteger(qty)) {
      return { ok: false, error: { field: "items", message: m.admin.docItemQtyInvalid } };
    }
    out.push({ order_item_id: it.orderItemId, quantity: qty });
  }
  return { ok: true, value: out };
}

/**
 * Validasi ramah SEBELUM memanggil RPC — angka yang SAMA dihitung DB trigger
 * (fn_guard_document_item_overship) dihitung ULANG di sini dari sumber data
 * yang sama (fetchItemCoverage), supaya pesan errornya bisa menyebut nama
 * item + sisa DALAM BAHASA yang dipilih pengguna, bukan meneruskan teks
 * RAISE EXCEPTION mentah (SPEC §69). Trigger DB tetap penjaga SEBENARNYA
 * (zero-trust, LESSONS #5/#6) — kalau rebutan bersamaan membuat pemeriksaan
 * di sini basi pada saat RPC benar-benar jalan, RPC-nya tetap menolak dan
 * kode di bawah menerjemahkannya jadi pesan generik (bukan raw text).
 */
async function validateAgainstRemaining(
  m: AdminMessages,
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderId: string,
  docType: DocType,
  items: { order_item_id: string; quantity: number }[],
  excludeDocumentId?: string
): Promise<ActionError | null> {
  if (docType === "SO" || items.length === 0) return null;
  const coverage = await fetchItemCoverage(supabase, orderId, docType, excludeDocumentId);
  if ("error" in coverage) return null; // biarkan RPC yang menolak kalau memang perlu
  const byId = new Map(coverage.orderItems.map((it) => [it.id, it]));
  for (const line of items) {
    const item = byId.get(line.order_item_id);
    if (!item) continue;
    const used = coverage.covered[line.order_item_id] ?? 0;
    const remaining = item.quantity - used;
    if (line.quantity > remaining) {
      return {
        field: "items",
        message: m.admin.docItemOvership
          .replace("{name}", item.name_snapshot)
          .replace("{remaining}", String(Math.max(remaining, 0))),
      };
    }
  }
  return null;
}

/**
 * Untuk SO dengan `items` kosong: default ke SEMUA order_items pesanan pada
 * kuantitas PENUH, dihitung SERVER (LESSONS #6 — tidak dipercaya dari
 * client). Ini adalah SATU-SATUNYA tempat default itu diterapkan — RPC-nya
 * sendiri tidak tahu apa-apa soal default SO (0016 SCOPE NOTE test-harness).
 */
async function resolveSoDefaultItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderId: string
): Promise<{ order_item_id: string; quantity: number }[]> {
  const { data } = await supabase.from("order_items").select("id, quantity").eq("order_id", orderId);
  return ((data ?? []) as { id: string; quantity: number }[]).map((it) => ({
    order_item_id: it.id,
    quantity: it.quantity,
  }));
}

export async function createOrderDocument(
  orderId: string,
  docType: DocType,
  docDate: string,
  itemsRaw: DocumentItemInput[],
  notes: string,
  clientRequestId: string
): Promise<ActionResult<{ id: string; docNumber: string }>> {
  const m = await getAdminMessages();
  const PESAN = pesan(m);
  const supabase = await createClient();

  if (!["SO", "DO", "INVOICE"].includes(docType)) {
    return { error: { message: m.admin.docTypeInvalid } };
  }
  if (!docDate) return { error: { field: "doc_date", message: m.admin.docDateRequired } };

  const parsed = parseDocumentItems(m, itemsRaw);
  if (!parsed.ok) return { error: parsed.error };
  let items = parsed.value;
  if (docType === "SO" && items.length === 0) {
    items = await resolveSoDefaultItems(supabase, orderId);
  }

  const overshipErr = await validateAgainstRemaining(m, supabase, orderId, docType, items);
  if (overshipErr) return { error: overshipErr };

  // Idempotency: percobaan sebelumnya sudah mendarat?
  const { data: existing, error: existingErr } = await supabase
    .from("order_documents")
    .select("id, doc_number")
    .eq("client_request_id", clientRequestId)
    .maybeSingle();
  if (existingErr) {
    if (isMissingTable(existingErr.code)) return { error: { message: m.admin.docFeatureOff } };
    return { error: { message: PESAN.serverSibuk } };
  }
  if (existing) {
    revalidatePath("/admin/orders/[orderId]", "page");
    return { data: { id: existing.id, docNumber: existing.doc_number } };
  }

  const { data: order, error: orderErr } = await supabase
    .from("partner_orders")
    .select("order_number")
    .eq("id", orderId)
    .maybeSingle();
  if (orderErr) return { error: { message: PESAN.serverSibuk } };
  if (!order) return { error: { message: m.admin.orderNotFound } };

  const prefix = DOC_TYPE_PREFIX[docType];
  const trimmedNotes = notes.trim() || null;

  for (let attempt = 1; attempt <= MAX_NUMBERING_ATTEMPTS; attempt++) {
    const { count, error: countErr } = await supabase
      .from("order_documents")
      .select("id", { count: "exact", head: true })
      .eq("order_id", orderId)
      .eq("doc_type", docType);
    if (countErr) {
      if (isMissingTable(countErr.code)) return { error: { message: m.admin.docFeatureOff } };
      return { error: { message: PESAN.serverSibuk } };
    }
    const n = (count ?? 0) + 1;
    const docNumber = n === 1 ? `${prefix}${order.order_number}` : `${prefix}${order.order_number}-${n}`;

    const written = await safeWrite(
      supabase
        .rpc("fn_create_order_document", {
          p_order_id: orderId,
          p_doc_type: docType,
          p_doc_number: docNumber,
          p_doc_date: docDate,
          p_notes: trimmedNotes,
          p_items: items.map((it) => ({ order_item_id: it.order_item_id, quantity: it.quantity })),
          p_client_request_id: clientRequestId,
        })
        .select("id, doc_number")
        .single()
    );

    if (written.ok) {
      revalidatePath("/admin/orders/[orderId]", "page");
      return { data: { id: written.data.id, docNumber: written.data.doc_number } };
    }

    if (written.reason === "db") {
      if (isMissingFunction(written.code) || isMissingTable(written.code)) {
        return { error: { message: m.admin.docFeatureOff } };
      }
      if (written.code === "23505") {
        if (isRequestIdConflict(written)) {
          // Percobaan sebelumnya sudah mendarat — cari baris itu.
          const { data: again } = await supabase
            .from("order_documents")
            .select("id, doc_number")
            .eq("client_request_id", clientRequestId)
            .maybeSingle();
          if (again) {
            revalidatePath("/admin/orders/[orderId]", "page");
            return { data: { id: again.id, docNumber: again.doc_number } };
          }
          return { error: { message: PESAN.belumPastiBaru } };
        }
        if (written.detail.includes("doc_number")) {
          // Rebutan bersamaan — nomor sudah diambil orang lain. Ulang dengan
          // suffix berikutnya (LESSONS #21/#27: 23505 di sini BUKAN kesalahan
          // pengguna, bukan juga "sudah mendarat" — cukup coba nomor baru).
          continue;
        }
        return { error: { message: PESAN.serverSibuk } };
      }
      // Guard over-shipment (race jarang — sudah divalidasi di atas) atau
      // pelanggaran lain dari RPC: jangan teruskan teks RAISE EXCEPTION
      // mentah ke layar (SPEC §69) — validasi di atas seharusnya sudah
      // menangkap kasus wajar, ini fallback untuk race/edge-case.
      return { error: { field: "items", message: m.admin.docSaveFailed } };
    }
    // Respons hilang — jangan menebak, tanyakan lewat client_request_id.
    const { data: recheck } = await supabase
      .from("order_documents")
      .select("id, doc_number")
      .eq("client_request_id", clientRequestId)
      .maybeSingle();
    if (recheck) {
      revalidatePath("/admin/orders/[orderId]", "page");
      return { data: { id: recheck.id, docNumber: recheck.doc_number } };
    }
    return { error: { message: PESAN.belumPastiBaru } };
  }

  return { error: { message: m.admin.docNumberingFailed } };
}

export async function updateOrderDocument(
  documentId: string,
  orderId: string,
  docType: DocType,
  docDate: string,
  itemsRaw: DocumentItemInput[],
  notes: string
): Promise<ActionResult<true>> {
  const m = await getAdminMessages();
  const PESAN = pesan(m);
  const supabase = await createClient();

  if (!docDate) return { error: { field: "doc_date", message: m.admin.docDateRequired } };
  const parsed = parseDocumentItems(m, itemsRaw);
  if (!parsed.ok) return { error: parsed.error };

  const overshipErr = await validateAgainstRemaining(m, supabase, orderId, docType, parsed.value, documentId);
  if (overshipErr) return { error: overshipErr };

  const written = await callVoidRpcSafely(
    supabase.rpc("fn_replace_order_document_items", {
      p_document_id: documentId,
      p_doc_date: docDate,
      p_notes: notes.trim() || null,
      p_items: parsed.value.map((it) => ({ order_item_id: it.order_item_id, quantity: it.quantity })),
    })
  );

  if (!written.ok) {
    if (written.reason === "db") {
      if (isMissingFunction(written.code) || isMissingTable(written.code)) {
        return { error: { message: m.admin.docFeatureOff } };
      }
      return { error: { field: "items", message: m.admin.docSaveFailed } };
    }
    return { error: { message: PESAN.belumPastiUbah } };
  }

  revalidatePath("/admin/orders/[orderId]", "page");
  return { data: true };
}

export async function deleteOrderDocument(documentId: string): Promise<ActionResult<true>> {
  const m = await getAdminMessages();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("order_documents")
    .delete()
    .eq("id", documentId)
    .select("id")
    .maybeSingle();
  if (error) {
    if (isMissingTable(error.code)) return { error: { message: m.admin.docFeatureOff } };
    return { error: { message: m.admin.docDeleteFailed } };
  }
  if (!data) return { error: { message: m.admin.docDeleteFailed } };

  revalidatePath("/admin/orders/[orderId]", "page");
  return { data: true };
}

/**
 * Dipanggil dari client component saat modal buat/ubah dokumen dibuka —
 * "sudah tercakup"/"sisa" per item HARUS dihitung ulang setiap kali modal
 * dibuka (bisa berubah sejak halaman terakhir dirender: admin lain membuat
 * dokumen di tab lain), bukan angka statis dari render halaman awal.
 */
export async function getOrderDocumentItemCoverage(
  orderId: string,
  docType: DocType,
  excludeDocumentId?: string
): Promise<
  ActionResult<{ items: { id: string; name: string; code: string | null; ordered: number; covered: number }[] }>
> {
  const m = await getAdminMessages();
  const supabase = await createClient();
  const coverage = await fetchItemCoverage(supabase, orderId, docType, excludeDocumentId);
  if ("error" in coverage) return { error: { message: m.admin.docFeatureOff } };
  return {
    data: {
      items: coverage.orderItems.map((it) => ({
        id: it.id,
        name: it.name_snapshot,
        code: it.code_snapshot,
        ordered: it.quantity,
        covered: coverage.covered[it.id] ?? 0,
      })),
    },
  };
}
