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
  pesan,
  confirmByRequestId,
  isRequestIdConflict,
  safeWrite,
  type LookupResult,
} from "@/lib/safe-write";
import {
  isMissingTableError,
  normalizePhoneID,
  parseIDRInput,
  type FulfillmentPath,
  type OrderStatus,
} from "@/lib/orders-shared";
import { getMessages, type Messages } from "@/lib/i18n";

type ActionError = { field?: string; message: string };
type ActionResult<T> = { data: T } | { error: ActionError };

/**
 * Kolom cancelled_at/cancelled_by/cancellation_reason ditambahkan migration
 * 0005 (Fase ini). Kode boleh naik duluan sebelum SQL dijalankan (LESSONS
 * #12) — kalau kolomnya belum ada, Postgres menjawab 42703 (undefined_column),
 * BUKAN 42P01 (tabel hilang). Jangan disamarkan jadi "no permission".
 */
function isMissingColumnError(err: { code?: string } | null): boolean {
  return !!err && err.code === "42703";
}

type Identity = { partnerId: string; branchId: string; userId: string };

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Hasil getIdentity dipecah tiga supaya pesan ke pengguna tidak menyesatkan:
 * "no-user" = memang belum login (redirect wajar); "load-error" = query
 * partner_users GAGAL (error field diperiksa, bukan diabaikan) — beda sebab,
 * beda pesan. Sebelumnya kedua kasus dipetakan ke null yang sama, sehingga
 * error DB/RLS ditampilkan sebagai "Sesi tidak valid" (P2-1 audit).
 */
type IdentityOutcome =
  | { status: "ok"; identity: Identity }
  | { status: "no-user" }
  | { status: "load-error" };

/** Look-up-don't-trust: identitas partner/branch selalu diambil dari sesi. */
async function getIdentity(supabase: SupabaseServerClient): Promise<IdentityOutcome> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "no-user" };

  const { data: pu, error } = await supabase
    .from("partner_users")
    .select("partner_id, branch_id")
    .maybeSingle();
  if (error) return { status: "load-error" };
  if (!pu) return { status: "no-user" };

  return { status: "ok", identity: { partnerId: pu.partner_id, branchId: pu.branch_id, userId: user.id } };
}

/** Pesan seragam untuk hasil getIdentity yang bukan "ok" (dipakai tiap Server Action). */
function identityErrorMessage(
  m: Messages,
  outcome: Extract<IdentityOutcome, { status: "no-user" | "load-error" }>
): string {
  return outcome.status === "load-error" ? m.cabang.errAccountLoadRetry : m.cabang.errSessionInvalid;
}

/* ------------------------------------------------------------------ *
 * Package (partner_packages, migration 0008) — look-up-don't-trust +
 * degradasi mulus kalau tabel/kolom belum ada (LESSONS #12).
 * ------------------------------------------------------------------ */

type PackageResolution =
  | { ok: true; packageName: string; packageId: string | null | undefined }
  | { ok: false; error: ActionError };

/**
 * Menentukan package_name (dan package_id bila ada) yang benar-benar dipakai
 * untuk ditulis. TIDAK PERNAH percaya package_name snapshot dari client saat
 * package_id dikirim — nama selalu diambil ulang dari DB (LESSONS #6).
 *
 * `packageId` hasil:
 *   - string  → kolom package_id ditulis dengan id ini.
 *   - null    → kolom package_id ditulis null (mode manual, TAPI dropdown
 *                package memang tersedia — jadi kolomnya aman ditulis).
 *   - undefined → kolom package_id TIDAK disertakan sama sekali (fitur
 *                package belum tersedia di sesi client ini — jangan kirim
 *                kolom yang bahkan tidak pernah "diisi").
 */
async function resolvePackage(
  m: Messages,
  supabase: SupabaseServerClient,
  partnerId: string,
  input: { packageId?: string; packageName: string; packagesAvailable?: boolean }
): Promise<PackageResolution> {
  const PESAN = pesan(m);
  if (input.packageId) {
    const { data, error } = await supabase
      .from("partner_packages")
      .select("id, name, status")
      .eq("id", input.packageId)
      .eq("partner_id", partnerId)
      .maybeSingle();
    if (error) {
      // Tabel hilang / error lain — jangan crash, tapi juga jangan percaya
      // package_id dari client begitu saja. Turunkan jadi pesan generik.
      return { ok: false, error: { field: "package_name", message: PESAN.serverSibuk } };
    }
    if (!data || data.status !== "ACTIVE") {
      return {
        ok: false,
        error: { field: "package_name", message: m.cabang.errPackageNotFound },
      };
    }
    return { ok: true, packageName: data.name, packageId: data.id };
  }

  const packageName = input.packageName.trim();
  if (!packageName) {
    return {
      ok: false,
      error: {
        field: "package_name",
        message: input.packagesAvailable ? m.cabang.errPackageRequired : m.cabang.errPackageNameRequired,
      },
    };
  }
  return { ok: true, packageName, packageId: input.packagesAvailable ? null : undefined };
}

/**
 * Insert partner_orders dengan kolom package_id opsional. Kolom itu baru ada
 * mulai migration 0008 — kalau belum dijalankan, Postgres menjawab 42703;
 * coba ulang TANPA kolom itu supaya order tetap tersimpan pakai package_name
 * saja (kode boleh naik duluan sebelum SQL, LESSONS #12).
 */
async function insertOrderWithPackageFallback(
  supabase: SupabaseServerClient,
  base: Record<string, unknown>,
  packageId: string | null | undefined
) {
  if (packageId === undefined) {
    return safeWrite(supabase.from("partner_orders").insert(base).select("id").single());
  }
  const withPackage = { ...base, package_id: packageId };
  const first = await safeWrite(supabase.from("partner_orders").insert(withPackage).select("id").single());
  if (!first.ok && first.reason === "db" && isMissingColumnError({ code: first.code })) {
    return safeWrite(supabase.from("partner_orders").insert(base).select("id").single());
  }
  return first;
}

/** Sepupu insertOrderWithPackageFallback, untuk UPDATE (dipakai updateOrder). */
async function updateOrderWithPackageFallback(
  supabase: SupabaseServerClient,
  orderId: string,
  base: Record<string, unknown>,
  packageId: string | null | undefined
) {
  if (packageId === undefined) {
    return safeWrite(supabase.from("partner_orders").update(base).eq("id", orderId).select("id").maybeSingle());
  }
  const withPackage = { ...base, package_id: packageId };
  const first = await safeWrite(
    supabase.from("partner_orders").update(withPackage).eq("id", orderId).select("id").maybeSingle()
  );
  if (!first.ok && first.reason === "db" && isMissingColumnError({ code: first.code })) {
    return safeWrite(supabase.from("partner_orders").update(base).eq("id", orderId).select("id").maybeSingle());
  }
  return first;
}

/* ------------------------------------------------------------------ *
 * Jalur Pesanan + Total Belanja (partner_purchase_amount) — migration
 * 0009 (Fase ini). Sepupu package_id: kolom boleh belum ada di server saat
 * kode ini naik (LESSONS #12) — insert/update dicoba dulu DENGAN kolom ini,
 * dan hanya kalau Postgres menjawab 42703 baru dicoba ulang TANPA kolom ini
 * (insertOrderWithFallbacks / updateOrderWithFallbacks di bawah).
 * ------------------------------------------------------------------ */

/**
 * `required=true` dipakai saat BUAT BARU (SPEC: wajib pilih salah satu).
 * `required=false` dipakai saat UBAH — field ini bisa saja tidak dirender di
 * form (kolom belum ada di server session ini), dan FormData akan mengirim
 * string kosong; itu TIDAK boleh dianggap error validasi pengguna.
 */
function validateFulfillmentPath(
  m: Messages,
  raw: string | undefined,
  required: boolean
): { ok: true; value: FulfillmentPath | null } | { ok: false; error: ActionError } {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) {
    if (required) {
      return { ok: false, error: { field: "fulfillment_path", message: m.cabang.errFulfillmentRequired } };
    }
    return { ok: true, value: null };
  }
  if (trimmed !== "DIRECT_DELIVERY" && trimmed !== "SHOWROOM_VISIT") {
    return { ok: false, error: { field: "fulfillment_path", message: m.cabang.errFulfillmentInvalid } };
  }
  return { ok: true, value: trimmed as FulfillmentPath };
}

/**
 * Kolom DB-nya `numeric(15,2)` (migration 0009) — muat paling besar
 * Rp 9.999.999.999.999, sedangkan parseIDRInput() sendiri masih menerima
 * sampai Rp 99.999.999.999.999. Diperiksa di sini SUPAYA insert/update tidak
 * pernah sampai memicu 22003 dari Postgres — pengguna tidak boleh melihat
 * kode error mentah (catatan eksplisit di migration 0009).
 */
const MAX_PURCHASE_AMOUNT = 9_999_999_999_999;

/**
 * Angka dihitung ulang di server dari string mentah lewat parseIDRInput —
 * satu-satunya sumber kebenaran (orders-shared.ts), tidak percaya angka yang
 * sudah diformat/dihitung di client (SPEC §8 turunan, LESSONS #6).
 */
function validatePurchaseAmount(
  m: Messages,
  raw: string | undefined
): { ok: true; value: number | null } | { ok: false; error: ActionError } {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { ok: true, value: null };
  const n = parseIDRInput(trimmed);
  if (n === null || n > MAX_PURCHASE_AMOUNT) {
    return {
      ok: false,
      error: { field: "partner_purchase_amount", message: m.cabang.errPurchaseAmountInvalid },
    };
  }
  return { ok: true, value: n };
}

/**
 * Sepupu insertOrderWithPackageFallback, khusus kolom
 * fulfillment_path/partner_purchase_amount.
 *
 * `fulfillmentCols` kosong ({}) berarti kolom ini memang TIDAK dirender di
 * form (probe client bilang belum tersedia) — tidak ada percobaan kedua,
 * tidak ada apa pun yang bisa "hilang". Kalau `fulfillmentCols` TERISI
 * (field dirender, mungkin dijawab pengguna) tapi Postgres tetap menjawab
 * 42703 saat insert (probe client meleset / race dengan rollback migrasi),
 * percobaan kedua tanpa kolom itu BOLEH tetap menyimpan order — tapi caller
 * WAJIB tahu jawaban pengguna dibuang, supaya tidak dilaporkan sukses penuh
 * (LESSONS #12: "user yang sudah mengisi tidak boleh diam-diam dibuang").
 * `droppedFulfillment` hanya true kalau nilai yang dibuang itu BUKAN null —
 * null berarti pengguna memang belum menjawab (field opsional saat Ubah).
 */
async function insertOrderWithFallbacks(
  supabase: SupabaseServerClient,
  base: Record<string, unknown>,
  packageId: string | null | undefined,
  fulfillmentCols: Record<string, unknown>
) {
  const withFulfillment = { ...base, ...fulfillmentCols };
  let res = await insertOrderWithPackageFallback(supabase, withFulfillment, packageId);
  let droppedFulfillment = false;
  if (!res.ok && res.reason === "db" && isMissingColumnError({ code: res.code })) {
    // package_id tetap dicoba lewat fallback internal di percobaan kedua ini —
    // supaya kombinasi "package_id ada, fulfillment belum ada" (atau sebaliknya)
    // sama-sama tertangani, bukan cuma satu arah.
    res = await insertOrderWithPackageFallback(supabase, base, packageId);
    droppedFulfillment = res.ok && fulfillmentCols.fulfillment_path != null;
  }
  return { res, droppedFulfillment };
}

/** Sepupu updateOrderWithPackageFallback untuk UPDATE, pola sama seperti di atas. */
async function updateOrderWithFallbacks(
  supabase: SupabaseServerClient,
  orderId: string,
  base: Record<string, unknown>,
  packageId: string | null | undefined,
  fulfillmentCols: Record<string, unknown>
) {
  const withFulfillment = { ...base, ...fulfillmentCols };
  let res = await updateOrderWithPackageFallback(supabase, orderId, withFulfillment, packageId);
  if (!res.ok && res.reason === "db" && isMissingColumnError({ code: res.code })) {
    res = await updateOrderWithPackageFallback(supabase, orderId, base, packageId);
  }
  return res;
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
  m: Messages,
  supabase: SupabaseServerClient,
  identity: Identity,
  input: ResolveCustomerInput,
  clientRequestId: string
): Promise<ResolveCustomerOutcome> {
  const PESAN = pesan(m);
  if (input.mode === "existing") {
    const { data: existing, error } = await supabase
      .from("customers")
      .select("id, full_name, phone")
      .eq("id", input.customerId)
      .maybeSingle();
    if (error) {
      if (isMissingTableError(error)) return { ok: false, error: { message: m.cabang.errOrderModuleInactive } };
      return { ok: false, error: { message: PESAN.serverSibuk } };
    }
    if (!existing) {
      return { ok: false, error: { message: m.cabang.errCustomerNotFoundReload } };
    }
    return { ok: true, customer: existing };
  }

  const fullName = input.fullName.trim();
  if (!fullName) return { ok: false, error: { field: "full_name", message: m.cabang.errFullNameRequired } };
  const normalized = normalizePhoneID(input.phone);
  if (!normalized) {
    return { ok: false, error: { field: "phone", message: m.cabang.errPhoneInvalid } };
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
    return { ok: false, error: { message: m.cabang.errOrderModuleInactive } };
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
  const m = await getMessages();
  const supabase = await createClient();
  const idOutcome = await getIdentity(supabase);
  if (idOutcome.status !== "ok") return { error: { message: identityErrorMessage(m, idOutcome) } };
  const identity = idOutcome.identity;

  const resolved = await resolveOrCreateCustomer(
    m,
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

/**
 * "invalid" = baris memang tidak ada / staf tidak aktif / beda partner —
 * pesan validasi pengguna wajar. "error" = query itu sendiri GAGAL (jaringan/
 * DB) — TIDAK boleh disamarkan jadi "invalid" (LESSONS #10): dulu fungsi ini
 * membuang field `error` sepenuhnya, jadi hiccup jaringan sesaat membuat
 * pengguna melihat "Sales harus dipilih dari daftar staf aktif" walau
 * pilihannya benar — pesan yang menyuruh mengganti pilihan padahal
 * masalahnya di server, bukan di pilihan.
 */
async function verifyActiveStaffInBranch(
  supabase: SupabaseServerClient,
  staffId: string,
  branchId: string,
  partnerId: string
): Promise<"ok" | "invalid" | "error"> {
  const { data, error } = await supabase
    .from("partner_staff_assignments")
    .select("staff_id, partner_staff:staff_id(id, status, partner_id)")
    .eq("staff_id", staffId)
    .eq("branch_id", branchId)
    .is("end_at", null)
    .maybeSingle();
  if (error) return "error";
  if (!data) return "invalid";
  const staff = data.partner_staff as unknown as { id: string; status: string; partner_id: string } | null;
  return !!staff && staff.status === "ACTIVE" && staff.partner_id === partnerId ? "ok" : "invalid";
}

export async function createCustomerAndOrder(input: {
  customerId?: string;
  fullName?: string;
  phone?: string;
  packageId?: string;
  packageName: string;
  packagesAvailable?: boolean;
  salesStaffId: string;
  picStaffId?: string;
  notes?: string;
  fulfillmentPath: string;
  /**
   * Hasil probe client atas kolom fulfillment_path (LESSONS #12, sama pola
   * dengan packagesAvailable). `false` = form TIDAK merender radio Jalur
   * Pesanan sama sekali (kolom belum ada di sesi ini) — jangan wajibkan,
   * jangan sertakan kolomnya. `undefined`/`true` = dirender & wajib diisi,
   * pola lama tetap jalan untuk client lama.
   */
  fulfillmentAvailable?: boolean;
  purchaseAmountRaw?: string;
  clientRequestId: string;
}): Promise<CreateOrderResult> {
  const m = await getMessages();
  const PESAN = pesan(m);
  const supabase = await createClient();
  const idOutcome = await getIdentity(supabase);
  if (idOutcome.status !== "ok") return { error: { message: identityErrorMessage(m, idOutcome) } };
  const identity = idOutcome.identity;

  const custReqId = `${input.clientRequestId}:customer`;
  const resolveInput: ResolveCustomerInput = input.customerId
    ? { mode: "existing", customerId: input.customerId }
    : { mode: "new", fullName: input.fullName || "", phone: input.phone || "", notes: undefined };

  const resolved = await resolveOrCreateCustomer(m, supabase, identity, resolveInput, custReqId);
  if (!resolved.ok) return { error: resolved.error };
  const customer = resolved.customer;

  const pkg = await resolvePackage(m, supabase, identity.partnerId, {
    packageId: input.packageId,
    packageName: input.packageName,
    packagesAvailable: input.packagesAvailable,
  });
  if (!pkg.ok) return { error: pkg.error };

  // Jalur pesanan wajib dipilih untuk order baru — TAPI hanya kalau field-nya
  // memang dirender client (fulfillmentAvailable dari probe kolom). Kalau
  // tidak dirender, ini sama seperti fulfillmentPath di updateOrder: tidak
  // boleh dianggap "user tidak menjawab pertanyaan wajib" (LESSONS #12,
  // menyamakan create dengan pola `undefined` yang sudah dipakai update).
  const fulfillmentRendered = input.fulfillmentAvailable !== false;
  const path = validateFulfillmentPath(m, input.fulfillmentPath, fulfillmentRendered);
  if (!path.ok) return { error: path.error };
  const amount = validatePurchaseAmount(m, input.purchaseAmountRaw);
  if (!amount.ok) return { error: amount.error };

  if (!input.salesStaffId) return { error: { field: "sales_staff_id", message: m.cabang.errSalesRequired } };

  const salesCheck = await verifyActiveStaffInBranch(supabase, input.salesStaffId, identity.branchId, identity.partnerId);
  if (salesCheck === "error") return { error: { field: "sales_staff_id", message: PESAN.serverSibuk } };
  if (salesCheck === "invalid") {
    return {
      error: { field: "sales_staff_id", message: m.cabang.errSalesInvalidStaff },
    };
  }
  let picStaffId: string | null = null;
  if (input.picStaffId) {
    const picCheck = await verifyActiveStaffInBranch(supabase, input.picStaffId, identity.branchId, identity.partnerId);
    if (picCheck === "error") return { error: { field: "pic_staff_id", message: PESAN.serverSibuk } };
    if (picCheck === "invalid") {
      return { error: { field: "pic_staff_id", message: m.cabang.errPicInvalidStaff } };
    }
    picStaffId = input.picStaffId;
  }

  const orderReqId = `${input.clientRequestId}:order`;
  const partialMsg = m.cabang.partialOrderFailed;
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

  // Sama seperti updateOrder: kalau field ini tidak dirender (kolom belum
  // ada di sesi client ini), kolomnya sama sekali tidak disertakan — bukan
  // ditulis null (LESSONS #12, menyamakan create dengan pola `undefined`
  // milik update).
  const fulfillmentCols: Record<string, unknown> = fulfillmentRendered
    ? { fulfillment_path: path.value, partner_purchase_amount: amount.value }
    : {};

  let orderId: string;
  let droppedFulfillment = false;
  if (preExistingOrder) {
    orderId = preExistingOrder.id;
  } else {
    const { res: written, droppedFulfillment: dropped } = await insertOrderWithFallbacks(
      supabase,
      {
        customer_id: customer.id,
        partner_id: identity.partnerId,
        branch_id: identity.branchId,
        partner_sales_staff_id: input.salesStaffId,
        partner_pic_staff_id: picStaffId,
        package_name: pkg.packageName,
        notes: input.notes?.trim() || null,
        created_by: identity.userId,
        client_request_id: orderReqId,
      },
      pkg.packageId,
      fulfillmentCols
    );
    droppedFulfillment = dropped;

    if (written.ok) {
      orderId = written.data.id;
    } else if (written.reason === "db" && isMissingTableError({ code: written.code })) {
      return {
        partial: { ...partialResult.partial, message: m.cabang.errOrderModuleInactive },
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
            message: m.cabang.partialOrderUnknownStatus,
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
        message: m.cabang.partialOrderSummaryUnavailable,
      },
    };
  }

  if (droppedFulfillment) {
    // Field ini DIRENDER dan (kemungkinan) dijawab pengguna, tapi Postgres
    // menolak kolomnya saat insert nyata (probe meleset / migrasi rollback
    // di antara load halaman dan submit) — order tetap tersimpan lewat
    // fallback, TAPI jawabannya hilang. Tidak boleh dilaporkan sukses penuh
    // (LESSONS #12) walau order-nya sendiri valid dan sudah bisa dibuka.
    return {
      partial: {
        customerId: customer.id,
        customerName: customer.full_name,
        customerPhone: customer.phone,
        message: m.cabang.partialFulfillmentDropped,
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
  m: Messages,
  supabase: SupabaseServerClient,
  orderId: string
): Promise<{ ok: true; order: MutableOrderRef } | { ok: false; error: ActionError }> {
  const PESAN = pesan(m);
  const { data, error } = await supabase
    .from("partner_orders")
    .select("id, partner_id, branch_id, status")
    .eq("id", orderId)
    .maybeSingle();
  if (error) {
    if (isMissingTableError(error)) return { ok: false, error: { message: m.cabang.errOrderModuleInactive } };
    return { ok: false, error: { message: PESAN.serverSibuk } };
  }
  if (!data) {
    return { ok: false, error: { message: m.cabang.errOrderNotFoundNoAccess } };
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
function updateFailureMessage(
  m: Messages,
  written: { reason: "db"; code?: string; detail: string } | { reason: "unconfirmed" },
  noRowMsg: string
): string {
  const PESAN = pesan(m);
  if (written.reason === "unconfirmed") return PESAN.belumPastiUbah;
  if (isMissingColumnError({ code: written.code })) return m.cabang.errFeatureInactive;
  if (isMissingTableError({ code: written.code })) return m.cabang.errOrderModuleInactive;
  if (written.detail === "no row returned") return noRowMsg;
  return PESAN.serverSibuk;
}

export type UpdateOrderResult = { data: { updated: true } } | { error: ActionError };

export async function updateOrder(input: {
  orderId: string;
  packageId?: string;
  packageName: string;
  packagesAvailable?: boolean;
  salesStaffId: string;
  picStaffId?: string;
  notes?: string;
  fulfillmentPath?: string;
  purchaseAmountRaw?: string;
}): Promise<UpdateOrderResult> {
  const m = await getMessages();
  const PESAN = pesan(m);
  const supabase = await createClient();
  const idOutcome = await getIdentity(supabase);
  if (idOutcome.status !== "ok") return { error: { message: identityErrorMessage(m, idOutcome) } };

  const found = await fetchOrderForMutation(m, supabase, input.orderId);
  if (!found.ok) return { error: found.error };
  const order = found.order;

  if (order.status !== "REGISTERED") {
    return { error: { message: m.cabang.errOrderAlreadyCancelled } };
  }

  // Package divalidasi terhadap partner PESANAN (bisa beda dari partner sesi
  // kalau suatu hari lintas-partner — hari ini selalu sama, tapi ini yang benar).
  const pkg = await resolvePackage(m, supabase, order.partner_id, {
    packageId: input.packageId,
    packageName: input.packageName,
    packagesAvailable: input.packagesAvailable,
  });
  if (!pkg.ok) return { error: pkg.error };

  // `undefined` (kunci sama sekali tidak dikirim) berarti field ini TIDAK
  // dirender di modal Ubah (kolomnya belum tersedia di sesi ini —
  // extrasAvailable=false di halaman detail): kolom itu tidak boleh disentuh
  // sama sekali, apalagi ditimpa null. String kosong yang benar-benar
  // dikirim (field dirender tapi tidak dipilih) tetap boleh menyimpan null.
  const fulfillmentCols: Record<string, unknown> = {};
  if (input.fulfillmentPath !== undefined) {
    const path = validateFulfillmentPath(m, input.fulfillmentPath, false);
    if (!path.ok) return { error: path.error };
    fulfillmentCols.fulfillment_path = path.value;
  }
  if (input.purchaseAmountRaw !== undefined) {
    const amount = validatePurchaseAmount(m, input.purchaseAmountRaw);
    if (!amount.ok) return { error: amount.error };
    fulfillmentCols.partner_purchase_amount = amount.value;
  }

  if (!input.salesStaffId) return { error: { field: "sales_staff_id", message: m.cabang.errSalesRequired } };

  // Staf diverifikasi terhadap cabang PESANAN (bisa beda dari cabang login saat
  // PARTNER_ALL_BRANCHES mengubah pesanan cabang lain) — bukan cabang pengguna.
  const salesCheck = await verifyActiveStaffInBranch(supabase, input.salesStaffId, order.branch_id, order.partner_id);
  if (salesCheck === "error") return { error: { field: "sales_staff_id", message: PESAN.serverSibuk } };
  if (salesCheck === "invalid") {
    return { error: { field: "sales_staff_id", message: m.cabang.errSalesInvalidStaff } };
  }
  let picStaffId: string | null = null;
  if (input.picStaffId) {
    const picCheck = await verifyActiveStaffInBranch(supabase, input.picStaffId, order.branch_id, order.partner_id);
    if (picCheck === "error") return { error: { field: "pic_staff_id", message: PESAN.serverSibuk } };
    if (picCheck === "invalid") {
      return { error: { field: "pic_staff_id", message: m.cabang.errPicInvalidStaff } };
    }
    picStaffId = input.picStaffId;
  }

  // UPDATE hanya kolom yang diizinkan (SPEC §37) + .select() supaya bisa
  // dipastikan ada baris yang benar-benar berubah — bukan cuma percaya respons
  // "tidak ada error" (LESSONS #7). RLS menolak dengan 0 baris, bukan error.
  const written = await updateOrderWithFallbacks(
    supabase,
    input.orderId,
    {
      package_name: pkg.packageName,
      partner_sales_staff_id: input.salesStaffId,
      partner_pic_staff_id: picStaffId,
      notes: input.notes?.trim() || null,
    },
    pkg.packageId,
    fulfillmentCols
  );

  if (!written.ok) {
    return {
      error: {
        message: updateFailureMessage(m, written, m.cabang.errOrderUpdateNoAccess),
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
  const m = await getMessages();
  const supabase = await createClient();
  const idOutcome = await getIdentity(supabase);
  if (idOutcome.status !== "ok") return { error: { message: identityErrorMessage(m, idOutcome) } };

  const reason = input.reason.trim();
  if (!reason) return { error: { field: "reason", message: m.cabang.errCancelReasonRequired } };
  if (reason.length > 500) {
    return { error: { field: "reason", message: m.cabang.errCancelReasonTooLong } };
  }

  const found = await fetchOrderForMutation(m, supabase, input.orderId);
  if (!found.ok) return { error: found.error };
  if (found.order.status === "CANCELLED") {
    return { error: { message: m.cabang.errOrderAlreadyCancelledBefore } };
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
        message: updateFailureMessage(m, written, m.cabang.errOrderCancelNoAccess),
      },
    };
  }

  revalidatePath("/cabang/pesanan");
  revalidatePath(`/cabang/pesanan/${input.orderId}`);
  return { data: { cancelled: true } };
}

/* ------------------------------------------------------------------ *
 * Invoice (bucket privat `order-invoices`, kolom invoice_url — migration
 * 0009, Fase ini). Berkas diunggah dari BROWSER (pola sama dengan logo
 * partner, lib/partner-logo pattern), server ini hanya MENCATAT alamatnya —
 * dan zero-trust: alamat dari client diperiksa dulu, bukan langsung dipercaya
 * (LESSONS #6, sepupu setPartnerLogo).
 * ------------------------------------------------------------------ */

export type SetInvoiceResult = { data: { updated: true } } | { error: ActionError };

/**
 * Mencatat path invoice yang SUDAH diunggah client ke storage. Path WAJIB
 * berbentuk `<orderId>/<namaBerkas>` — kalau tidak, ditolak (path dari
 * bucket lain / order lain tidak pernah dipercaya begitu saja).
 */
export async function setOrderInvoicePath(input: {
  orderId: string;
  path: string;
}): Promise<SetInvoiceResult> {
  const m = await getMessages();
  const supabase = await createClient();
  const idOutcome = await getIdentity(supabase);
  if (idOutcome.status !== "ok") return { error: { message: identityErrorMessage(m, idOutcome) } };

  const prefix = `${input.orderId}/`;
  if (!input.path.startsWith(prefix) || input.path.includes("..")) {
    return { error: { message: m.cabang.errInvoicePathInvalid } };
  }

  const found = await fetchOrderForMutation(m, supabase, input.orderId);
  if (!found.ok) return { error: found.error };
  // UI menyembunyikan tombol unggah untuk order yang sudah dibatalkan, tapi
  // itu saja bukan pengaman (LESSONS #5) — diperiksa ulang di sini juga.
  if (found.order.status !== "REGISTERED") {
    return { error: { message: m.cabang.errOrderAlreadyCancelled } };
  }

  const written = await safeWrite(
    supabase
      .from("partner_orders")
      .update({ invoice_url: input.path })
      .eq("id", input.orderId)
      .select("id")
      .maybeSingle()
  );

  if (!written.ok) {
    return {
      error: {
        message: updateFailureMessage(m, written, m.cabang.errInvoiceUploadFailed),
      },
    };
  }

  revalidatePath(`/cabang/pesanan/${input.orderId}`);
  return { data: { updated: true } };
}

export type InvoiceSignedUrlResult =
  | { status: "ok"; url: string }
  | { status: "none" }
  | { status: "unavailable" }
  | { status: "error" };

/**
 * Bucket `order-invoices` PRIVAT — tidak pernah getPublicUrl. Signed URL
 * dibuat baru setiap dipanggil (berlaku 1 jam) supaya tautan yang sudah
 * lama terbuka di layar tidak diam-diam kedaluwarsa tanpa cara memuat ulang.
 */
export async function getOrderInvoiceSignedUrl(orderId: string): Promise<InvoiceSignedUrlResult> {
  const supabase = await createClient();
  const idOutcome = await getIdentity(supabase);
  if (idOutcome.status !== "ok") return { status: "error" };

  // Dibaca terpisah dari query utama (pola sama dengan fetchCancelInfo /
  // fetchOrderPackageId di halaman detail): kolom belum ada → 42703, halaman
  // tetap harus jalan, fitur invoice cukup disembunyikan diam-diam.
  const { data, error } = await supabase
    .from("partner_orders")
    .select("invoice_url")
    .eq("id", orderId)
    .maybeSingle();
  if (error) return error.code === "42703" ? { status: "unavailable" } : { status: "error" };
  const path = (data as { invoice_url: string | null } | null)?.invoice_url ?? null;
  if (!path) return { status: "none" };

  const { data: signed, error: signErr } = await supabase.storage
    .from("order-invoices")
    .createSignedUrl(path, 3600);
  if (signErr || !signed?.signedUrl) return { status: "error" };
  return { status: "ok", url: signed.signedUrl };
}
