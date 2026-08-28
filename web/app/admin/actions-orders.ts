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
import { parseIDRInput } from "@/lib/orders-shared";
import { getAdminMessages } from "@/lib/i18n";
// Tautan pesanan untuk pelanggan (migrasi 0023). `whatsapp-send` HANYA boleh
// diimpor dari berkas server seperti ini — ia memegang FONNTE_TOKEN.
import { customerLinkMessage, customerLinkUrl } from "@/lib/customer-link";
import { requestOrigin } from "@/lib/request-origin";
import { sendWhatsappViaFonnte } from "@/lib/whatsapp-send";

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
  const m = await getAdminMessages();
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
  const m = await getAdminMessages();
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
  const m = await getAdminMessages();
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

/**
 * Nilai penawaran SANCI per pesanan (`order_sanci_offers`, migration 0013) —
 * HANYA SANCI Admin, baca maupun tulis. Pengguna cabang mendapat NOL baris dari
 * tabel ini lewat RLS; layar yang menyembunyikannya hanya kosmetik dan bukan
 * itu yang melindunginya (LESSONS #5).
 *
 * Bentuknya upsert dengan kunci alami `order_id` — satu pesanan, satu nilai
 * yang berlaku. Karena itu tabelnya SENGAJA tidak punya client_request_id:
 * mengirim nilai yang sama dua kali di jaringan lemah menghasilkan baris yang
 * sama persis, jadi idempotensinya datang dari bentuk tabelnya sendiri, bukan
 * dari nomor permintaan (alasan lengkapnya di §1 berkas 0013).
 */

/**
 * Kolom DB-nya `numeric(15,2)` (0013, disamakan dengan partner_purchase_amount
 * milik 0009) → paling besar Rp 9.999.999.999.999, sedangkan parseIDRInput()
 * masih menerima sampai Rp 99.999.999.999.999. Diperiksa di sini supaya upsert
 * tidak pernah sampai memicu 22003 dari Postgres — pengguna tidak boleh melihat
 * kode error mentah (catatan eksplisit yang sama di 0009 dan 0013).
 */
const MAX_OFFER_AMOUNT = 9_999_999_999_999;

/**
 * Diperluas migrasi 0014: `dp_amount` (uang muka) dan `payment_condition`
 * (teks bebas) ikut disimpan lewat upsert yang SAMA — keduanya baris yang
 * sama dengan `amount`, jadi tidak ada alasan memisahkannya jadi dua
 * panggilan (yang justru membuka celah "amount tersimpan, DP gagal" tanpa
 * kebutuhan nyata). `dpRaw` opsional: string kosong → 0 (bawaan DB).
 *
 * dp_amount > final_amount ditolak DATABASE (check constraint 0015, MENGGANTI
 * dp_amount > amount milik 0014 — final_amount adalah nilai yang SUNGGUH
 * harus dibayar) — diperiksa ULANG di sini supaya pesannya bisa diterjemahkan
 * (LESSONS #10, jangan biarkan kode mentah 23514 bocor ke layar). Karena
 * final_amount sendiri dihitung SERVER (trigger 0015), pemeriksaan dp<=final
 * di SINI hanya pemeriksaan dp<=amount sebagai perkiraan cepat sebelum
 * mengirim — database tetap satu-satunya sumber kebenaran final.
 *
 * Diperluas migrasi 0015: `discount_pcts` (rantai % berurutan, maks 6),
 * `markup_pct` (opsional), `cash_discount` (default 0). Validasi bentuk/
 * rentang di sini adalah PESAN RAMAH duluan (LESSONS #10) — trigger 0015 di
 * database tetap penjaga sesungguhnya kalau validasi ini entah bagaimana
 * dilewati (client lama, panggilan langsung).
 */
const MAX_DISCOUNT_SLOTS = 6;

function parsePercent(raw: string): number | null {
  const n = Number(raw.trim().replace(/[^0-9.,]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export async function setOrderOffer(
  orderId: string,
  amountRaw: string,
  dpRaw?: string,
  paymentCondition?: string,
  discountPctsRaw?: string[],
  markupRaw?: string,
  cashRaw?: string
): Promise<
  ActionResult<{
    amount: number;
    dpAmount: number;
    paymentCondition: string | null;
    discountPcts: number[];
    markupPct: number | null;
    cashDiscount: number;
    finalAmount: number;
  }>
> {
  const m = await getAdminMessages();
  const PESAN = pesan(m);
  const supabase = await createClient();

  // Angka dihitung ULANG di server dari teks mentah lewat parseIDRInput —
  // satu-satunya sumber kebenaran (lib/orders-shared.ts). Nilai yang sudah
  // diformat/dihitung di browser tidak dipercaya (LESSONS #6).
  const amount = parseIDRInput(amountRaw.trim());
  if (amount === null || amount > MAX_OFFER_AMOUNT) {
    return { error: { field: "amount", message: m.admin.orderOfferInvalid } };
  }

  const dpTrimmed = (dpRaw ?? "").trim();
  const dpAmount = dpTrimmed ? parseIDRInput(dpTrimmed) : 0;
  if (dpAmount === null || dpAmount > MAX_OFFER_AMOUNT) {
    return { error: { field: "dp_amount", message: m.admin.orderOfferInvalid } };
  }
  const conditionTrimmed = paymentCondition?.trim() || null;

  // discount_pcts: slot kosong DIBUANG (bukan error) — UI mengizinkan slot
  // "+ tambah diskon" yang belum diisi tanpa memaksa pengguna menghapusnya
  // manual sebelum menyimpan.
  const discountSlots = (discountPctsRaw ?? []).map((s) => s.trim()).filter((s) => s !== "");
  if (discountSlots.length > MAX_DISCOUNT_SLOTS) {
    return { error: { field: "discount_pcts", message: m.admin.orderOfferDiscountMaxReached } };
  }
  const discountPcts: number[] = [];
  for (const slot of discountSlots) {
    const n = parsePercent(slot);
    if (n === null || n <= 0 || n >= 100) {
      return { error: { field: "discount_pcts", message: m.admin.orderOfferDiscountInvalid } };
    }
    discountPcts.push(n);
  }

  const markupTrimmed = (markupRaw ?? "").trim();
  let markupPct: number | null = null;
  if (markupTrimmed) {
    markupPct = parsePercent(markupTrimmed);
    if (markupPct === null || markupPct < 0 || markupPct > 100) {
      return { error: { field: "markup_pct", message: m.admin.orderOfferMarkupInvalid } };
    }
  }

  const cashTrimmed = (cashRaw ?? "").trim();
  const cashDiscount = cashTrimmed ? parseIDRInput(cashTrimmed) : 0;
  if (cashDiscount === null || cashDiscount > MAX_OFFER_AMOUNT) {
    return { error: { field: "cash_discount", message: m.admin.orderOfferCashInvalid } };
  }

  const written = await safeWrite(
    supabase
      .from("order_sanci_offers")
      .upsert(
        {
          order_id: orderId,
          amount,
          dp_amount: dpAmount,
          payment_condition: conditionTrimmed,
          discount_pcts: discountPcts,
          markup_pct: markupPct,
          cash_discount: cashDiscount,
        },
        { onConflict: "order_id" }
      )
      .select("amount, dp_amount, payment_condition, discount_pcts, markup_pct, cash_discount, final_amount")
      .single()
  );

  if (!written.ok) {
    if (written.reason === "db") {
      if (isMissingTable(written.code)) return { error: { message: m.admin.orderOfferFeatureOffAction } };
      if (isMissingColumnError(written.code)) return { error: { message: m.admin.orderOfferFeatureOffAction } };
      // dp <= final_amount (0015, menggantikan dp <= amount milik 0014 —
      // constraint LAMA sudah tidak ada di database setelah 0015 dijalankan,
      // tapi nama field errornya tetap sama karena maknanya bagi pengguna
      // sama: "uang muka melebihi apa yang harus dibayar").
      if (written.code === "23514" && written.detail.includes("dp_le_final")) {
        return { error: { field: "dp_amount", message: m.admin.orderOfferDpExceedsAmount } };
      }
      if (written.code === "23514" && written.detail.includes("dp_le_amount")) {
        return { error: { field: "dp_amount", message: m.admin.orderOfferDpExceedsAmount } };
      }
      if (written.code === "23514" && written.detail.includes("markup_pct_check")) {
        return { error: { field: "markup_pct", message: m.admin.orderOfferMarkupInvalid } };
      }
      if (written.code === "23514" && written.detail.includes("cash_discount_check")) {
        return { error: { field: "cash_discount", message: m.admin.orderOfferCashInvalid } };
      }
      // Pesan trigger 0015 (validasi bentuk/rentang discount_pcts dan
      // kombinasi yang menghasilkan nilai negatif) dikenali lewat potongan
      // teks yang persis sama dengan yang ditulis di migration itu sendiri —
      // kalau teksnya berubah di sana, baris ini WAJIB ikut diperbarui.
      if (written.detail.includes("lebih dari 0 dan kurang dari 100") || written.detail.includes("daftar (array)") || written.detail.includes("maksimal 6 nilai")) {
        return { error: { field: "discount_pcts", message: m.admin.orderOfferDiscountInvalid } };
      }
      if (written.detail.includes("nilai akhir negatif")) {
        return { error: { field: "cash_discount", message: m.common.offerFinalNegative } };
      }
      if (written.detail.includes("Boleh mengatur diskon")) {
        return { error: { field: "discount_pcts", message: m.admin.orderOfferNoPermissionDiscount } };
      }
      return { error: { message: PESAN.serverSibuk } };
    }
    // Respons hilang. Upsert berkunci order_id aman diulang, tapi JANGAN
    // menyebutnya berhasil tanpa bukti (LESSONS #2/#7) — tanyakan status
    // sebenarnya ke server, dan hanya lapor sukses kalau nilainya memang sudah
    // yang dimaksud.
    const { data: recheck, error: recheckErr } = await supabase
      .from("order_sanci_offers")
      .select("amount, dp_amount, payment_condition, discount_pcts, markup_pct, cash_discount, final_amount")
      .eq("order_id", orderId)
      .maybeSingle();
    if (
      !recheckErr &&
      recheck &&
      Number(recheck.amount) === amount &&
      Number(recheck.dp_amount) === dpAmount
    ) {
      revalidatePath("/admin/orders/[orderId]", "page");
      return {
        data: {
          amount,
          dpAmount,
          paymentCondition: conditionTrimmed,
          discountPcts: ((recheck.discount_pcts as number[] | null) ?? []).map(Number),
          markupPct: recheck.markup_pct == null ? null : Number(recheck.markup_pct),
          cashDiscount: Number(recheck.cash_discount ?? 0),
          finalAmount: Number(recheck.final_amount ?? amount),
        },
      };
    }
    return { error: { message: PESAN.belumPastiUbah } };
  }

  // Rute dinamis WAJIB memakai bentuk TEMPLATE ("[orderId]") + tipe "page",
  // bukan alamat dengan id sungguhan disisipkan: Next.js mencocokkan string ini
  // dengan pola rute, sehingga `/admin/orders/<uuid>` tidak cocok dengan apa pun
  // dan cache-nya tidak pernah disegarkan (pola yang sudah dipakai
  // actions-package-items.ts sejak 0012).
  revalidatePath("/admin/orders/[orderId]", "page");
  return {
    data: {
      amount: Number(written.data.amount),
      dpAmount: Number(written.data.dp_amount),
      paymentCondition: written.data.payment_condition,
      discountPcts: ((written.data.discount_pcts as number[] | null) ?? []).map(Number),
      markupPct: written.data.markup_pct == null ? null : Number(written.data.markup_pct),
      cashDiscount: Number(written.data.cash_discount ?? 0),
      finalAmount: Number(written.data.final_amount ?? Number(written.data.amount)),
    },
  };
}

/**
 * "SANCI memutuskan TIDAK memberi penawaran" harus bisa dinyatakan, dan
 * bentuknya adalah MENGHAPUS barisnya — bukan menyimpan 0. Nol adalah tawaran
 * senilai nol rupiah; tidak adanya baris berarti tidak ada tawaran. Dua keadaan
 * berbeda harus punya bentuk berbeda (prinsip yang sama dengan `quantity > 0`
 * di 0012, dan ditegakkan di 0013 lewat `amount not null`).
 *
 * Sengaja TANPA `.single()`: menghapus baris yang memang sudah tidak ada bukan
 * kegagalan, melainkan keadaan yang diinginkan sudah tercapai (mis. tab lain
 * sudah menghapusnya duluan). `.single()` akan menerjemahkannya menjadi error
 * dan menyuruh pengguna mencoba lagi selamanya — persis pola LESSONS #21.
 */
export async function clearOrderOffer(orderId: string): Promise<ActionResult<true>> {
  const m = await getAdminMessages();
  const PESAN = pesan(m);
  const supabase = await createClient();

  const removed = await safeWrite(
    supabase.from("order_sanci_offers").delete().eq("order_id", orderId).select("order_id")
  );

  if (!removed.ok) {
    if (removed.reason === "db") {
      if (isMissingTable(removed.code)) return { error: { message: m.admin.orderOfferFeatureOffAction } };
      return { error: { message: PESAN.serverSibuk } };
    }
    // Respons hilang: tanyakan keadaan sebenarnya, jangan menghapus lagi
    // buta-buta dan jangan menebak (LESSONS #2).
    const { data: recheck, error: recheckErr } = await supabase
      .from("order_sanci_offers")
      .select("order_id")
      .eq("order_id", orderId)
      .maybeSingle();
    if (!recheckErr && !recheck) {
      revalidatePath("/admin/orders/[orderId]", "page");
      return { data: true };
    }
    return { error: { message: PESAN.belumPastiUbah } };
  }

  revalidatePath("/admin/orders/[orderId]", "page");
  return { data: true };
}

/* ------------------------------------------------------------------ *
 * Isi Pesanan (order_items, migrasi 0014) — sisi admin.
 *
 * Admin lolos lewat oi_admin_all (fn_is_admin()) untuk SEMUA kolom termasuk
 * unit_price/line_discount — trg_order_item_price_guard melepas admin di
 * baris pertamanya, jadi tidak ada gerbang tambahan yang perlu ditulis di
 * sini (zero-trust tetap ditegakkan DB, bukan diasumsikan dari sisi ini).
 * ------------------------------------------------------------------ */

const MAX_ITEM_PRICE = 9_999_999_999_999;

type OrderItemInput = {
  name: string;
  code?: string;
  quantity: string;
  note?: string;
  colorCode?: string;
  customSize?: string;
  unitPriceRaw?: string;
  lineDiscountRaw?: string;
};

function parseItemFields(
  m: Awaited<ReturnType<typeof getAdminMessages>>,
  input: OrderItemInput
):
  | {
      ok: true;
      value: {
        name: string;
        code: string | null;
        quantity: number;
        note: string | null;
        colorCode: string | null;
        customSize: string | null;
        unitPrice: number | null;
        lineDiscount: number | null;
      };
    }
  | { ok: false; error: ActionError } {
  const name = input.name.trim();
  if (!name) return { ok: false, error: { field: "name", message: m.admin.orderItemNameRequired } };
  const qty = Number(input.quantity);
  if (!Number.isInteger(qty) || qty <= 0) {
    return { ok: false, error: { field: "quantity", message: m.admin.orderItemQtyInvalid } };
  }
  let unitPrice: number | null = null;
  if (input.unitPriceRaw?.trim()) {
    unitPrice = parseIDRInput(input.unitPriceRaw.trim());
    if (unitPrice === null || unitPrice > MAX_ITEM_PRICE) {
      return { ok: false, error: { field: "unit_price", message: m.admin.orderItemPriceInvalid } };
    }
  }
  let lineDiscount: number | null = null;
  if (input.lineDiscountRaw?.trim()) {
    lineDiscount = parseIDRInput(input.lineDiscountRaw.trim());
    if (lineDiscount === null || lineDiscount > MAX_ITEM_PRICE) {
      return { ok: false, error: { field: "line_discount", message: m.admin.orderItemPriceInvalid } };
    }
  }
  return {
    ok: true,
    value: {
      name,
      code: input.code?.trim() || null,
      quantity: qty,
      note: input.note?.trim() || null,
      colorCode: input.colorCode?.trim() || null,
      customSize: input.customSize?.trim() || null,
      unitPrice,
      lineDiscount,
    },
  };
}

export async function addOrderItem(
  orderId: string,
  input: OrderItemInput & { clientRequestId: string }
): Promise<ActionResult<{ id: string }>> {
  const m = await getAdminMessages();
  const PESAN = pesan(m);
  const supabase = await createClient();
  const parsed = parseItemFields(m, input);
  if (!parsed.ok) return { error: parsed.error };

  const { data: existing } = await supabase
    .from("order_items")
    .select("id")
    .eq("client_request_id", input.clientRequestId)
    .maybeSingle();
  if (existing) {
    revalidatePath("/admin/orders/[orderId]", "page");
    return { data: { id: existing.id } };
  }

  const written = await safeWrite(
    supabase
      .from("order_items")
      .insert({
        order_id: orderId,
        name_snapshot: parsed.value.name,
        code_snapshot: parsed.value.code,
        quantity: parsed.value.quantity,
        note: parsed.value.note,
        color_code: parsed.value.colorCode,
        custom_size: parsed.value.customSize,
        unit_price: parsed.value.unitPrice,
        line_discount: parsed.value.lineDiscount,
        client_request_id: input.clientRequestId,
      })
      .select("id")
      .single()
  );
  if (!written.ok) {
    if (written.reason === "db") {
      if (isMissingTable(written.code)) return { error: { message: m.admin.orderItemsFeatureOff } };
      return { error: { message: PESAN.serverSibuk } };
    }
    const { data: recheck } = await supabase
      .from("order_items")
      .select("id")
      .eq("client_request_id", input.clientRequestId)
      .maybeSingle();
    if (recheck) {
      revalidatePath("/admin/orders/[orderId]", "page");
      return { data: { id: recheck.id } };
    }
    return { error: { message: PESAN.belumPastiBaru } };
  }

  revalidatePath("/admin/orders/[orderId]", "page");
  return { data: { id: written.data.id } };
}

export async function updateOrderItem(
  itemId: string,
  input: OrderItemInput
): Promise<ActionResult<true>> {
  const m = await getAdminMessages();
  const PESAN = pesan(m);
  const supabase = await createClient();
  const parsed = parseItemFields(m, input);
  if (!parsed.ok) return { error: parsed.error };

  const written = await safeWrite(
    supabase
      .from("order_items")
      .update({
        name_snapshot: parsed.value.name,
        code_snapshot: parsed.value.code,
        quantity: parsed.value.quantity,
        note: parsed.value.note,
        color_code: parsed.value.colorCode,
        custom_size: parsed.value.customSize,
        unit_price: parsed.value.unitPrice,
        line_discount: parsed.value.lineDiscount,
      })
      .eq("id", itemId)
      .select("id")
      .single()
  );
  if (!written.ok) {
    if (written.reason === "db") {
      if (isMissingTable(written.code)) return { error: { message: m.admin.orderItemsFeatureOff } };
      return { error: { message: m.admin.orderItemSaveFailed } };
    }
    return { error: { message: PESAN.belumPastiUbah } };
  }

  revalidatePath("/admin/orders/[orderId]", "page");
  return { data: true };
}

export async function deleteOrderItem(itemId: string): Promise<ActionResult<true>> {
  const m = await getAdminMessages();
  const supabase = await createClient();
  const { data, error } = await supabase.from("order_items").delete().eq("id", itemId).select("id").maybeSingle();
  if (error) {
    if (isMissingTable(error.code)) return { error: { message: m.admin.orderItemsFeatureOff } };
    return { error: { message: m.admin.orderItemDeleteFailed } };
  }
  if (!data) return { error: { message: m.admin.orderItemDeleteFailed } };

  revalidatePath("/admin/orders/[orderId]", "page");
  return { data: true };
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

/* ------------------------------------------------------------------ *
 * Tautan pesanan untuk pelanggan (migrasi 0023) — sisi admin
 * ------------------------------------------------------------------ */

type AdminGateOutcome =
  | { status: "ok"; userId: string }
  | { status: "not-admin" }
  | { status: "load-error" };

/**
 * Idiom PERSIS `requireAdmin` di app/admin/actions-create-order.ts: dicek
 * dengan sesi pengguna sendiri SEBELUM apa pun, dan error database TIDAK
 * disamarkan jadi "bukan admin" (LESSONS #10). RLS tetap penegak sesungguhnya.
 */
async function requireAdminHere(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<AdminGateOutcome> {
  const { data: sesi, error: sesiErr } = await supabase.auth.getUser();
  if (sesiErr || !sesi?.user) return { status: "not-admin" };

  const { data: adminRow, error: adminErr } = await supabase
    .from("platform_admins")
    .select("auth_user_id")
    .eq("auth_user_id", sesi.user.id)
    .maybeSingle();
  if (adminErr) return { status: "load-error" };
  if (!adminRow) return { status: "not-admin" };
  return { status: "ok", userId: sesi.user.id };
}

/**
 * Menandai "pesanan sudah diterima pelanggan" dari sisi admin.
 *
 * Waktunya TIDAK datang dari sini meskipun terlihat begitu: trigger
 * `trg_order_customer_link` (0023 §3) menimpanya dengan `now()` server dan
 * `auth.uid()` — pola persis `markCustomerArrived` di atas (LESSONS #11/#6).
 */
export async function markOrderDeliveredAdmin(
  orderId: string
): Promise<ActionResult<{ deliveredAt: string }>> {
  const m = await getAdminMessages();
  const PESAN = pesan(m);
  const supabase = await createClient();

  const gate = await requireAdminHere(supabase);
  if (gate.status !== "ok") {
    return {
      error: {
        message: gate.status === "load-error" ? m.admin.userPermCheckFailed : m.admin.userNotAuthorized,
      },
    };
  }

  const { data: order, error: fetchErr } = await supabase
    .from("partner_orders")
    .select("delivered_at")
    .eq("id", orderId)
    .maybeSingle();

  if (fetchErr) {
    // Kunci markDelivered*, bukan custLink*: tombol yang ditekan adalah
    // "Tandai sudah diterima pelanggan" dan kartu ini dipakai bersama sisi
    // cabang (lib/customer-link-card.tsx) — sama seperti markOrderDelivered
    // di app/cabang/pesanan/actions.ts (audit teks 2026-08-28).
    if (isMissingColumnError(fetchErr.code)) return { error: { message: m.common.markDeliveredUnavailableMsg } };
    return { error: { message: PESAN.serverSibuk } };
  }
  if (!order) return { error: { message: m.admin.orderNotFound } };
  if (order.delivered_at) {
    // Sudah ditandai (tab lain / staf cabang) — idempotent, bukan error.
    return { data: { deliveredAt: order.delivered_at } };
  }

  const written = await safeWrite(
    supabase
      .from("partner_orders")
      .update({ delivered_at: new Date().toISOString() })
      .eq("id", orderId)
      .select("delivered_at")
      .single()
  );

  if (!written.ok) {
    if (written.reason === "db") {
      if (isMissingColumnError(written.code)) return { error: { message: m.common.markDeliveredUnavailableMsg } };
      const { data: recheck } = await supabase
        .from("partner_orders")
        .select("delivered_at")
        .eq("id", orderId)
        .maybeSingle();
      if (recheck?.delivered_at) return { data: { deliveredAt: recheck.delivered_at } };
      return { error: { message: m.common.markDeliveredFailedMsg } };
    }
    return { error: { message: PESAN.belumPastiUbah } };
  }

  revalidatePath(`/admin/orders/${orderId}`);
  return { data: { deliveredAt: written.data.delivered_at as string } };
}

/**
 * Mengirim tautan pelanggan lewat NOMOR PERUSAHAAN (Fonnte) — sisi admin.
 *
 * Alamat dasar tautannya dibaca dari header permintaan lewat
 * `requestOrigin()`, SENGAJA bukan parameter: kalau pemanggil boleh
 * menyodorkan domain sendiri, tautan phishing bisa dikirim ATAS NAMA TOKO ke
 * nomor pelanggannya.
 */
export async function sendCustomerLinkViaCompanyAdmin(
  orderId: string
): Promise<ActionResult<{ detail: string | null }>> {
  const m = await getAdminMessages();
  const PESAN = pesan(m);
  const supabase = await createClient();

  const gate = await requireAdminHere(supabase);
  if (gate.status !== "ok") {
    return {
      error: {
        message: gate.status === "load-error" ? m.admin.userPermCheckFailed : m.admin.userNotAuthorized,
      },
    };
  }

  const origin = await requestOrigin();

  const { data: order, error } = await supabase
    .from("partner_orders")
    .select("order_number, customer_view_token, customers:customer_id(full_name, phone_normalized)")
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    if (isMissingColumnError(error.code)) return { error: { message: m.common.custLinkUnavailableMsg } };
    return { error: { message: PESAN.serverSibuk } };
  }
  if (!order) return { error: { message: m.admin.orderNotFound } };

  const row = order as unknown as {
    order_number: string;
    customer_view_token: string;
    customers:
      | { full_name: string; phone_normalized: string }
      | { full_name: string; phone_normalized: string }[]
      | null;
  };
  const customer = Array.isArray(row.customers) ? row.customers[0] ?? null : row.customers;

  const result = await sendWhatsappViaFonnte({
    rawPhone: customer?.phone_normalized ?? null,
    message: customerLinkMessage({
      firstName: customer?.full_name?.trim().split(/\s+/)[0] ?? null,
      orderNumber: row.order_number,
      url: customerLinkUrl(origin, row.customer_view_token),
    }),
    actorUserId: gate.userId,
  });

  if (!result.ok) return { error: { message: result.error } };
  return { data: { detail: result.detail } };
}
