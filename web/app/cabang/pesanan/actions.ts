"use server";

/**
 * Server Actions untuk Customer Quick Create + Partner Order (Phase 2 slice).
 *
 * Prinsip yang WAJIB dipegang di sini (lihat LESSONS.md + safe-write.ts):
 *   - phone_normalized SELALU dihitung ulang di server — tidak pernah percaya
 *     nilai dari client (SPEC §8).
 *   - partner_id / branch_id SELALU diambil dari sesi lewat partner_users,
 *     tidak pernah dari input form (look-up-don't-trust, LESSONS #6).
 *   - Setiap tulisan (insert) memakai safeWrite + client_request_id supaya
 *     jaringan lemah tidak menghasilkan baris ganda (LESSONS #3).
 *   - Customer + Order adalah dua langkah tulis terpisah. Kalau Customer
 *     berhasil tapi Order gagal, HARUS dilaporkan sebagai partial — tidak
 *     boleh disamarkan jadi sukses penuh (SPEC §70).
 *   - client_request_id dasar (dari form) dipakai ulang di percobaan retry;
 *     untuk dua entitas dalam satu submit dipakai sufiks tetap `:customer`
 *     dan `:order` supaya masing-masing entity punya idempotency key sendiri
 *     yang stabil lintas percobaan.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  LOOKUP_TIMEOUT_MS,
  PESAN,
  confirmByRequestId,
  isRequestIdConflict,
  safeWrite,
  type LookupResult,
} from "@/lib/safe-write";
import {
  isMissingTableError,
  normalizePhoneID,
  type OrderStatus,
} from "@/lib/orders-shared";

type ActionError = { field?: string; message: string };
type ActionResult<T> = { data: T } | { error: ActionError };

const MISSING_TABLE_MSG =
  "Modul Pesanan belum aktif di database (migrasi belum dijalankan). Hubungi SANCI Admin.";

/**
 * Kolom cancelled_at/cancelled_by/cancellation_reason ditambahkan migration
 * 0005 (Fase ini). Kode boleh naik duluan sebelum SQL dijalankan (LESSONS
 * #12) — kalau kolomnya belum ada, Postgres menjawab 42703 (undefined_column),
 * BUKAN 42P01 (tabel hilang). Jangan disamarkan jadi "no permission".
 */
function isMissingColumnError(err: { code?: string } | null): boolean {
  return !!err && err.code === "42703";
}

const MIGRATION_0005_MSG =
  "Fitur ini belum aktif — migrasi database belum dijalankan. Hubungi SANCI Admin.";

type Identity = { partnerId: string; branchId: string; userId: string };

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/** Look-up-don't-trust: identitas partner/branch selalu diambil dari sesi. */
async function getIdentity(supabase: SupabaseServerClient): Promise<Identity | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: pu } = await supabase
    .from("partner_users")
    .select("partner_id, branch_id")
    .maybeSingle();
  if (!pu) return null;

  return { partnerId: pu.partner_id, branchId: pu.branch_id, userId: user.id };
}

type CustomerLite = { id: string; full_name: string; phone: string };

/* ------------------------------------------------------------------ *
 * Pencarian pelanggan berdasarkan telepon (SPEC §10, §82–84)
 * ------------------------------------------------------------------ */

export type CustomerSearchOutcome =
  | { status: "invalid" }
  | { status: "found"; customer: CustomerLite }
  | { status: "not_found" }
  | { status: "missing_table" }
  | { status: "error" };

/**
 * Dipanggil dari form setelah jeda mengetik (debounce di sisi client).
 * Kegagalan pemeriksaan TIDAK PERNAH dilaporkan sebagai "tidak ditemukan" —
 * itu bisa menyebabkan pelanggan yang sama dibuat dua kali (SPEC §84).
 */
export async function searchCustomerByPhone(rawPhone: string): Promise<CustomerSearchOutcome> {
  const normalized = normalizePhoneID(rawPhone);
  if (!normalized) return { status: "invalid" };

  const supabase = await createClient();
  // .limit(1) tanpa .single()/.maybeSingle(): hasil kosong adalah array kosong
  // (bukan null), jadi tidak disalahartikan safeWrite sebagai kegagalan tulis.
  const outcome = await safeWrite<CustomerLite[]>(
    supabase
      .from("customers")
      .select("id, full_name, phone")
      .eq("phone_normalized", normalized)
      .limit(1),
    LOOKUP_TIMEOUT_MS
  );

  if (!outcome.ok) {
    if (outcome.reason === "db" && isMissingTableError({ code: outcome.code })) {
      return { status: "missing_table" };
    }
    return { status: "error" };
  }
  if (outcome.data.length === 0) return { status: "not_found" };
  return { status: "found", customer: outcome.data[0] };
}

/* ------------------------------------------------------------------ *
 * Lookup luar (dipakai submitSafely saat respons Server Action hilang)
 * ------------------------------------------------------------------ */

async function toLookupResult(supabase: SupabaseServerClient, table: string, clientRequestId: string): Promise<LookupResult> {
  const outcome = await confirmByRequestId(
    supabase.from(table).select("id").eq("client_request_id", clientRequestId).maybeSingle()
  );
  if (outcome.status === "found") return { found: true, id: outcome.data.id };
  if (outcome.status === "absent") return { found: false };
  return { unknown: true };
}

export async function lookupCustomerRequestId(clientRequestId: string): Promise<LookupResult> {
  const supabase = await createClient();
  return toLookupResult(supabase, "customers", clientRequestId);
}

export async function lookupOrderRequestId(clientRequestIdBase: string): Promise<LookupResult> {
  const supabase = await createClient();
  return toLookupResult(supabase, "partner_orders", `${clientRequestIdBase}:order`);
}

/* ------------------------------------------------------------------ *
 * Membuat / menemukan Customer (idempotent) — dipakai dua jalur submit
 * ------------------------------------------------------------------ */

type ResolveCustomerInput =
  | { mode: "existing"; customerId: string }
  | { mode: "new"; fullName: string; phone: string; notes?: string };

type ResolveCustomerOutcome =
  | { ok: true; customer: CustomerLite }
  | { ok: false; error: ActionError };

async function resolveOrCreateCustomer(
  supabase: SupabaseServerClient,
  identity: Identity,
  input: ResolveCustomerInput,
  clientRequestId: string
): Promise<ResolveCustomerOutcome> {
  if (input.mode === "existing") {
    const { data: existing, error } = await supabase
      .from("customers")
      .select("id, full_name, phone")
      .eq("id", input.customerId)
      .maybeSingle();
    if (error) {
      if (isMissingTableError(error)) return { ok: false, error: { message: MISSING_TABLE_MSG } };
      return { ok: false, error: { message: PESAN.serverSibuk } };
    }
    if (!existing) {
      return { ok: false, error: { message: "Pelanggan tidak ditemukan lagi. Muat ulang halaman dan cari ulang." } };
    }
    return { ok: true, customer: existing };
  }

  const fullName = input.fullName.trim();
  if (!fullName) return { ok: false, error: { field: "full_name", message: "Nama lengkap wajib diisi." } };
  const normalized = normalizePhoneID(input.phone);
  if (!normalized) {
    return { ok: false, error: { field: "phone", message: "Nomor telepon tidak valid." } };
  }
  const phoneTrim = input.phone.trim();
  const notes = input.notes?.trim() || null;

  // Percobaan sebelumnya dengan client_request_id yang sama mungkin sudah mendarat.
  const { data: preExisting } = await supabase
    .from("customers")
    .select("id, full_name, phone")
    .eq("client_request_id", clientRequestId)
    .maybeSingle();
  if (preExisting) return { ok: true, customer: preExisting };

  const written = await safeWrite(
    supabase
      .from("customers")
      .insert({
        full_name: fullName,
        phone: phoneTrim,
        phone_normalized: normalized,
        notes,
        created_via_partner_id: identity.partnerId,
        created_via_branch_id: identity.branchId,
        created_by: identity.userId,
        client_request_id: clientRequestId,
      })
      .select("id, full_name, phone")
      .single()
  );

  if (written.ok) return { ok: true, customer: written.data };

  if (written.reason === "db" && isMissingTableError({ code: written.code })) {
    return { ok: false, error: { message: MISSING_TABLE_MSG } };
  }

  if (written.reason === "unconfirmed" || isRequestIdConflict(written)) {
    const recheck = await confirmByRequestId(
      supabase.from("customers").select("id, full_name, phone").eq("client_request_id", clientRequestId).maybeSingle()
    );
    if (recheck.status === "found") return { ok: true, customer: recheck.data };
    if (recheck.status === "absent") return { ok: false, error: { message: PESAN.belumTersimpan } };
    return { ok: false, error: { message: PESAN.belumPastiBaru } };
  }

  return { ok: false, error: { message: PESAN.serverSibuk } };
}

/* ------------------------------------------------------------------ *
 * Simpan Pelanggan Saja (SPEC §30–31)
 * ------------------------------------------------------------------ */

export async function createCustomerOnly(input: {
  fullName: string;
  phone: string;
  notes?: string;
  clientRequestId: string;
}): Promise<ActionResult<{ customerId: string; fullName: string; phone: string }>> {
  const supabase = await createClient();
  const identity = await getIdentity(supabase);
  if (!identity) return { error: { message: "Sesi tidak valid. Muat ulang halaman." } };

  const resolved = await resolveOrCreateCustomer(
    supabase,
    identity,
    { mode: "new", fullName: input.fullName, phone: input.phone, notes: input.notes },
    input.clientRequestId
  );
  if (!resolved.ok) return { error: resolved.error };

  revalidatePath("/cabang/pesanan");
  return {
    data: { customerId: resolved.customer.id, fullName: resolved.customer.full_name, phone: resolved.customer.phone },
  };
}

/* ------------------------------------------------------------------ *
 * Membuat Order (+ Customer bila perlu) — SPEC §68–70
 * ------------------------------------------------------------------ */

export type OrderSummary = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  packageName: string;
  createdAt: string;
  customerName: string;
  customerPhone: string;
};

export type OrderCreated = OrderSummary & { customerId: string };

export type CreateOrderResult =
  | { data: OrderCreated }
  | { error: ActionError }
  /** Customer berhasil tersimpan, tapi Order gagal — TIDAK boleh diklaim sukses penuh. */
  | {
      partial: {
        customerId: string;
        customerName: string;
        customerPhone: string;
        message: string;
      };
    };

async function fetchOrderSummary(
  supabase: SupabaseServerClient,
  orderId: string
): Promise<OrderSummary | null> {
  type Row = {
    id: string;
    order_number: string;
    status: OrderStatus;
    package_name: string;
    created_at: string;
    customers:
      | { full_name: string; phone_normalized: string }
      | { full_name: string; phone_normalized: string }[]
      | null;
  };
  const res = await safeWrite<Row>(
    supabase
      .from("partner_orders")
      .select(
        "id, order_number, status, package_name, created_at, customers:customer_id(full_name, phone_normalized)"
      )
      .eq("id", orderId)
      .single()
  );
  if (!res.ok) return null;
  const row = res.data;
  const cust = Array.isArray(row.customers) ? row.customers[0] : row.customers;
  return {
    id: row.id,
    orderNumber: row.order_number,
    status: row.status,
    packageName: row.package_name,
    createdAt: row.created_at,
    customerName: cust?.full_name ?? "—",
    // phone_normalized dipakai supaya UI bisa memformatnya lewat displayPhoneID.
    customerPhone: cust?.phone_normalized ?? "",
  };
}

/** Dipakai client saat submitSafely melaporkan "confirmed" (respons hilang tapi data terbukti masuk). */
export async function getOrderSummary(
  orderId: string
): Promise<{ status: "found"; order: OrderSummary } | { status: "unknown" }> {
  const supabase = await createClient();
  const order = await fetchOrderSummary(supabase, orderId);
  return order ? { status: "found", order } : { status: "unknown" };
}

async function verifyActiveStaffInBranch(
  supabase: SupabaseServerClient,
  staffId: string,
  branchId: string,
  partnerId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("partner_staff_assignments")
    .select("staff_id, partner_staff:staff_id(id, status, partner_id)")
    .eq("staff_id", staffId)
    .eq("branch_id", branchId)
    .is("end_at", null)
    .maybeSingle();
  if (!data) return false;
  const staff = data.partner_staff as unknown as { id: string; status: string; partner_id: string } | null;
  return !!staff && staff.status === "ACTIVE" && staff.partner_id === partnerId;
}

export async function createCustomerAndOrder(input: {
  customerId?: string;
  fullName?: string;
  phone?: string;
  packageName: string;
  salesStaffId: string;
  picStaffId?: string;
  notes?: string;
  clientRequestId: string;
}): Promise<CreateOrderResult> {
  const supabase = await createClient();
  const identity = await getIdentity(supabase);
  if (!identity) return { error: { message: "Sesi tidak valid. Muat ulang halaman." } };

  const custReqId = `${input.clientRequestId}:customer`;
  const resolveInput: ResolveCustomerInput = input.customerId
    ? { mode: "existing", customerId: input.customerId }
    : { mode: "new", fullName: input.fullName || "", phone: input.phone || "", notes: undefined };

  const resolved = await resolveOrCreateCustomer(supabase, identity, resolveInput, custReqId);
  if (!resolved.ok) return { error: resolved.error };
  const customer = resolved.customer;

  const packageName = input.packageName.trim();
  if (!packageName) return { error: { field: "package_name", message: "Nama package wajib diisi." } };
  if (!input.salesStaffId) return { error: { field: "sales_staff_id", message: "Sales wajib dipilih." } };

  const salesOk = await verifyActiveStaffInBranch(supabase, input.salesStaffId, identity.branchId, identity.partnerId);
  if (!salesOk) {
    return {
      error: { field: "sales_staff_id", message: "Sales harus dipilih dari daftar staf aktif cabang ini." },
    };
  }
  let picStaffId: string | null = null;
  if (input.picStaffId) {
    const picOk = await verifyActiveStaffInBranch(supabase, input.picStaffId, identity.branchId, identity.partnerId);
    if (!picOk) {
      return { error: { field: "pic_staff_id", message: "PIC harus dipilih dari daftar staf aktif cabang ini." } };
    }
    picStaffId = input.picStaffId;
  }

  const orderReqId = `${input.clientRequestId}:order`;
  const partialMsg = "Pelanggan tersimpan. Pesanan gagal — ulangi dari daftar pelanggan.";
  const partialResult = {
    partial: {
      customerId: customer.id,
      customerName: customer.full_name,
      customerPhone: customer.phone,
      message: partialMsg,
    },
  } as const;

  const { data: preExistingOrder } = await supabase
    .from("partner_orders")
    .select("id")
    .eq("client_request_id", orderReqId)
    .maybeSingle();

  let orderId: string;
  if (preExistingOrder) {
    orderId = preExistingOrder.id;
  } else {
    const written = await safeWrite(
      supabase
        .from("partner_orders")
        .insert({
          customer_id: customer.id,
          partner_id: identity.partnerId,
          branch_id: identity.branchId,
          partner_sales_staff_id: input.salesStaffId,
          partner_pic_staff_id: picStaffId,
          package_name: packageName,
          notes: input.notes?.trim() || null,
          created_by: identity.userId,
          client_request_id: orderReqId,
        })
        .select("id")
        .single()
    );

    if (written.ok) {
      orderId = written.data.id;
    } else if (written.reason === "db" && isMissingTableError({ code: written.code })) {
      return {
        partial: { ...partialResult.partial, message: MISSING_TABLE_MSG },
      };
    } else if (written.reason === "unconfirmed" || isRequestIdConflict(written)) {
      const recheck = await confirmByRequestId(
        supabase.from("partner_orders").select("id").eq("client_request_id", orderReqId).maybeSingle()
      );
      if (recheck.status === "found") {
        orderId = recheck.data.id;
      } else if (recheck.status === "absent") {
        return partialResult;
      } else {
        return {
          partial: {
            ...partialResult.partial,
            message:
              "Pelanggan tersimpan. Status pesanan belum bisa dipastikan karena koneksi terputus — cek Daftar Pesanan sebelum mencoba lagi.",
          },
        };
      }
    } else {
      return partialResult;
    }
  }

  // SPEC §68: jangan hanya percaya respons insert — pastikan lewat SELECT terpisah.
  const summary = await fetchOrderSummary(supabase, orderId);
  revalidatePath("/cabang/pesanan");
  if (!summary) {
    return {
      partial: {
        customerId: customer.id,
        customerName: customer.full_name,
        customerPhone: customer.phone,
        message:
          "Pesanan tersimpan tetapi rinciannya belum bisa dimuat ulang. Buka Daftar Pesanan untuk memastikan.",
      },
    };
  }

  return { data: { ...summary, customerId: customer.id } };
}

/* ------------------------------------------------------------------ *
 * Ubah Pesanan (SPEC §36–37) — hanya Package/Sales/PIC/Notes.
 * Atribusi (partner_id/branch_id/customer_id/order_number) TIDAK PERNAH
 * dikirim di sini: DB trigger menolaknya kalau berubah, dan kolom itu memang
 * tidak boleh diubah lewat Edit biasa (SPEC §37).
 * ------------------------------------------------------------------ */

type MutableOrderRef = { id: string; partner_id: string; branch_id: string; status: OrderStatus };

/**
 * Ambil baris minimal untuk validasi sebelum UPDATE. RLS SELECT (o_partner_read)
 * memakai fn_can_view_branch — lebih longgar dari izin edit — jadi baris bisa
 * saja "kelihatan" walau tidak boleh diubah; itu SENGAJA: keputusan izin edit
 * yang sebenarnya diserahkan ke UPDATE (fn_can_edit_branch) di bawah, bukan
 * ditebak di sini.
 */
async function fetchOrderForMutation(
  supabase: SupabaseServerClient,
  orderId: string
): Promise<{ ok: true; order: MutableOrderRef } | { ok: false; error: ActionError }> {
  const { data, error } = await supabase
    .from("partner_orders")
    .select("id, partner_id, branch_id, status")
    .eq("id", orderId)
    .maybeSingle();
  if (error) {
    if (isMissingTableError(error)) return { ok: false, error: { message: MISSING_TABLE_MSG } };
    return { ok: false, error: { message: PESAN.serverSibuk } };
  }
  if (!data) {
    return { ok: false, error: { message: "Pesanan tidak ditemukan atau Anda tidak punya akses." } };
  }
  return { ok: true, order: data as MutableOrderRef };
}

/**
 * Menerjemahkan hasil UPDATE (safeWrite) jadi pesan untuk pengguna. Dipakai
 * updateOrder & cancelOrder — urutan pemeriksaan penting (LESSONS #21 sepupu):
 * kolom hilang (42703) diperiksa DULU supaya tidak disalahartikan jadi
 * "tidak punya akses", baru "no row returned" (0 baris — RLS menolak DIAM-DIAM,
 * bukan error) yang jadi pesan akses/berubah (bukan sukses palsu, LESSONS #7).
 */
function updateFailureMessage(written: { reason: "db"; code?: string; detail: string } | { reason: "unconfirmed" }, noRowMsg: string): string {
  if (written.reason === "unconfirmed") return PESAN.belumPastiUbah;
  if (isMissingColumnError({ code: written.code })) return MIGRATION_0005_MSG;
  if (isMissingTableError({ code: written.code })) return MISSING_TABLE_MSG;
  if (written.detail === "no row returned") return noRowMsg;
  return PESAN.serverSibuk;
}

export type UpdateOrderResult = { data: { updated: true } } | { error: ActionError };

export async function updateOrder(input: {
  orderId: string;
  packageName: string;
  salesStaffId: string;
  picStaffId?: string;
  notes?: string;
}): Promise<UpdateOrderResult> {
  const supabase = await createClient();
  const identity = await getIdentity(supabase);
  if (!identity) return { error: { message: "Sesi tidak valid. Muat ulang halaman." } };

  const found = await fetchOrderForMutation(supabase, input.orderId);
  if (!found.ok) return { error: found.error };
  const order = found.order;

  if (order.status !== "REGISTERED") {
    return { error: { message: "Pesanan ini sudah dibatalkan dan tidak bisa diubah lagi." } };
  }

  const packageName = input.packageName.trim();
  if (!packageName) return { error: { field: "package_name", message: "Nama package wajib diisi." } };
  if (!input.salesStaffId) return { error: { field: "sales_staff_id", message: "Sales wajib dipilih." } };

  // Staf diverifikasi terhadap cabang PESANAN (bisa beda dari cabang login saat
  // PARTNER_ALL_BRANCHES mengubah pesanan cabang lain) — bukan cabang pengguna.
  const salesOk = await verifyActiveStaffInBranch(supabase, input.salesStaffId, order.branch_id, order.partner_id);
  if (!salesOk) {
    return { error: { field: "sales_staff_id", message: "Sales harus dipilih dari daftar staf aktif cabang ini." } };
  }
  let picStaffId: string | null = null;
  if (input.picStaffId) {
    const picOk = await verifyActiveStaffInBranch(supabase, input.picStaffId, order.branch_id, order.partner_id);
    if (!picOk) {
      return { error: { field: "pic_staff_id", message: "PIC harus dipilih dari daftar staf aktif cabang ini." } };
    }
    picStaffId = input.picStaffId;
  }

  // UPDATE hanya empat kolom yang diizinkan (SPEC §37) + .select() supaya bisa
  // dipastikan ada baris yang benar-benar berubah — bukan cuma percaya respons
  // "tidak ada error" (LESSONS #7). RLS menolak dengan 0 baris, bukan error.
  const written = await safeWrite(
    supabase
      .from("partner_orders")
      .update({
        package_name: packageName,
        partner_sales_staff_id: input.salesStaffId,
        partner_pic_staff_id: picStaffId,
        notes: input.notes?.trim() || null,
      })
      .eq("id", input.orderId)
      .select("id")
      .maybeSingle()
  );

  if (!written.ok) {
    return {
      error: {
        message: updateFailureMessage(
          written,
          "Pesanan tidak bisa diubah — Anda mungkin tidak punya akses ke cabang ini, atau pesanan sudah berubah/dibatalkan. Muat ulang halaman."
        ),
      },
    };
  }

  revalidatePath("/cabang/pesanan");
  revalidatePath(`/cabang/pesanan/${input.orderId}`);
  return { data: { updated: true } };
}

/* ------------------------------------------------------------------ *
 * Batalkan Pesanan (SPEC §41–42, §96) — status + alasan saja.
 * cancelled_at/cancelled_by SENGAJA tidak dikirim: diisi DB (trigger
 * migration 0005), bukan client (LESSONS #6, #11).
 * ------------------------------------------------------------------ */

export type CancelOrderResult = { data: { cancelled: true } } | { error: ActionError };

export async function cancelOrder(input: {
  orderId: string;
  reason: string;
}): Promise<CancelOrderResult> {
  const supabase = await createClient();
  const identity = await getIdentity(supabase);
  if (!identity) return { error: { message: "Sesi tidak valid. Muat ulang halaman." } };

  const reason = input.reason.trim();
  if (!reason) return { error: { field: "reason", message: "Alasan pembatalan wajib diisi." } };
  if (reason.length > 500) {
    return { error: { field: "reason", message: "Alasan pembatalan terlalu panjang (maksimal 500 karakter)." } };
  }

  const found = await fetchOrderForMutation(supabase, input.orderId);
  if (!found.ok) return { error: found.error };
  if (found.order.status === "CANCELLED") {
    return { error: { message: "Pesanan ini sudah dibatalkan sebelumnya." } };
  }

  const written = await safeWrite(
    supabase
      .from("partner_orders")
      .update({ status: "CANCELLED", cancellation_reason: reason })
      .eq("id", input.orderId)
      .select("id")
      .maybeSingle()
  );

  if (!written.ok) {
    return {
      error: {
        message: updateFailureMessage(
          written,
          "Pesanan tidak bisa dibatalkan — Anda mungkin tidak punya akses ke cabang ini, atau pesanan sudah berubah. Muat ulang halaman."
        ),
      },
    };
  }

  revalidatePath("/cabang/pesanan");
  revalidatePath(`/cabang/pesanan/${input.orderId}`);
  return { data: { cancelled: true } };
}
