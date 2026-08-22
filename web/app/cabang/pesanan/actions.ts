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
// Dipakai BERSAMA jalur admin (web/app/admin/actions-create-order.ts) — logika
// pindah ke lib/order-create-shared.ts saat fitur "admin membuat pesanan atas
// nama cabang" dibuat, TANPA perubahan perilaku (lihat kepala berkas itu).
import { copyPackageItemsToOrder, verifyActiveStaffInBranch } from "@/lib/order-create-shared";
import { getCabangMessages, type CabangMessages } from "@/lib/i18n";

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
  m: CabangMessages,
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
  m: CabangMessages,
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
  m: CabangMessages,
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
  m: CabangMessages,
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
    // "sesuatu di grup ini dijawab pengguna" — bukan cuma fulfillment_path lagi
    // sejak shipping_address (0014) ikut dilebur ke grup yang sama (lihat
    // komentar di titik panggil createCustomerAndOrder).
    droppedFulfillment =
      res.ok && (fulfillmentCols.fulfillment_path != null || fulfillmentCols.shipping_address != null);
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

/**
 * shipping_address (migration 0014) — teks bebas nullable, tidak wajib.
 * Naik lewat kolom yang SAMA dengan fulfillmentCols (§ di atas): kalau
 * kolomnya belum ada di sesi ini (LESSONS #12, 0014 belum dijalankan),
 * fallback yang SAMA yang sudah menangani fulfillment_path/
 * partner_purchase_amount ikut menangani kolom ini — tidak ada plumbing
 * kedua yang perlu ditulis ulang.
 */
function normalizeShippingAddress(raw: string | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  return trimmed || null;
}

type CustomerLite = {
  id: string;
  full_name: string;
  phone: string;
  // address/city/province (0014): dipakai HANYA untuk prefill shipping_address
  // di form — bukan sumber kebenaran alamat kirim itu sendiri (kolom itu
  // selalu independen dan selalu bisa diubah, lihat migration 0014 §4).
  address?: string | null;
  city?: string | null;
  province?: string | null;
};

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
      // address/city/province (0014) dibaca di sini murni untuk prefill
      // shipping_address di form pesanan baru — lihat catatan di CustomerLite.
      .select("id, full_name, phone, address, city, province")
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
  | {
      mode: "new";
      fullName: string;
      phone: string;
      notes?: string;
      /**
       * customers.attributed_staff_id (migration 0019) — "staf partner mana
       * yang diatribusikan sebagai pembawa pelanggan ini", dipakai trigger
       * fn_set_customer_code untuk generate kode branch-created. WAJIB SUDAH
       * divalidasi verifyActiveStaffInBranch oleh PEMANGGIL sebelum sampai
       * di sini — fungsi ini sendiri TIDAK memvalidasi ulang (lihat kepala
       * berkas migration 0019 § "KEPUTUSAN DESAIN ATRIBUSI STAF": staf order
       * yang sudah terbukti aktif & milik cabang/partner yang sama dipakai
       * ULANG, tidak ada validasi kedua). undefined/kosong → attributed_
       * staff_id ditulis null, TIDAK error (additive, bukan wajib — sikap
       * yang sama dipakai 0018 untuk source_id/sales_staff_id).
       */
      attributedStaffId?: string;
    };

type ResolveCustomerOutcome =
  | { ok: true; customer: CustomerLite }
  | { ok: false; error: ActionError };

async function resolveOrCreateCustomer(
  m: CabangMessages,
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

  const baseCustomerInsert: Record<string, unknown> = {
    full_name: fullName,
    phone: phoneTrim,
    phone_normalized: normalized,
    notes,
    created_via_partner_id: identity.partnerId,
    created_via_branch_id: identity.branchId,
    created_by: identity.userId,
    client_request_id: clientRequestId,
  };

  // attributed_staff_id (migration 0019) — kode boleh naik duluan sebelum
  // migrasi (LESSONS #12): coba dulu DENGAN kolom ini, dan hanya kalau
  // Postgres menjawab 42703 (kolom belum ada) baru dicoba ulang TANPA kolom
  // itu — pola yang sama persis dengan insertOrderWithPackageFallback di
  // atas. Kolom ini TIDAK PERNAH bikin pembuatan pelanggan gagal total.
  const withAttribution: Record<string, unknown> = input.attributedStaffId
    ? { ...baseCustomerInsert, attributed_staff_id: input.attributedStaffId }
    : baseCustomerInsert;
  let written = await safeWrite(
    supabase.from("customers").insert(withAttribution).select("id, full_name, phone").single()
  );
  if (
    !written.ok &&
    written.reason === "db" &&
    isMissingColumnError({ code: written.code }) &&
    input.attributedStaffId
  ) {
    written = await safeWrite(
      supabase.from("customers").insert(baseCustomerInsert).select("id, full_name, phone").single()
    );
  }

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
  /**
   * customers.attributed_staff_id (migrasi 0019) — OPSIONAL, bukan wajib.
   * Jalur "Simpan Pelanggan Saja" tidak mewajibkan staf sama sekali (fallback
   * lebih ringan dari createCustomerAndOrder, sesuai keputusan desain di
   * kepala berkas migration 0019): kalau staf pengguna ISI di form (field
   * sales_staff_id yang sama dengan section Order) sebelum menekan tombol
   * ini, diteruskan ke sini dan divalidasi verifyActiveStaffInBranch persis
   * pola order. Kalau kosong (jalur paling umum untuk tombol ini), attributed_
   * staff_id ditulis null — TIDAK error, customer_code otomatis tetap null.
   */
  salesStaffId?: string;
  clientRequestId: string;
}): Promise<ActionResult<{ customerId: string; fullName: string; phone: string }>> {
  const m = await getCabangMessages();
  const PESAN = pesan(m);
  const supabase = await createClient();
  const idOutcome = await getIdentity(supabase);
  if (idOutcome.status !== "ok") return { error: { message: identityErrorMessage(m, idOutcome) } };
  const identity = idOutcome.identity;

  let attributedStaffId: string | undefined;
  if (input.salesStaffId) {
    const staffCheck = await verifyActiveStaffInBranch(supabase, input.salesStaffId, identity.branchId, identity.partnerId);
    if (staffCheck === "error") return { error: { field: "sales_staff_id", message: PESAN.serverSibuk } };
    if (staffCheck === "invalid") {
      return { error: { field: "sales_staff_id", message: m.cabang.errSalesInvalidStaff } };
    }
    attributedStaffId = input.salesStaffId;
  }

  const resolved = await resolveOrCreateCustomer(
    m,
    supabase,
    identity,
    { mode: "new", fullName: input.fullName, phone: input.phone, notes: input.notes, attributedStaffId },
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
  /**
   * 0014 — terisi kalau salinan isi Package ke order_items sempat gagal
   * SEBAGIAN. Best-effort: kegagalan ini TIDAK PERNAH membatalkan/rollback
   * pesanan itu sendiri (pola sama dengan unggah invoice — lampiran yang
   * gagal turun jadi peringatan, bukan menggagalkan pesanannya, LESSONS
   * #10/#12), tapi juga TIDAK PERNAH disembunyikan — dilaporkan di sini
   * supaya UI bisa menampilkan peringatan alih-alih sukses penuh yang palsu.
   */
  itemsCopyWarning?: string;
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

// verifyActiveStaffInBranch + copyPackageItemsToOrder dulu didefinisikan DI
// SINI — sekarang hidup di lib/order-create-shared.ts (diimpor di atas) karena
// jalur admin (web/app/admin/actions-create-order.ts) memakai logika yang sama
// persis. Seluruh komentar desainnya (idempotency batch upsert, LESSONS #3/
// #10/#21, perilaku trigger 0014) ikut pindah ke sana — baca di sana sebelum
// mengubah perilaku salah satu jalur.

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
  shippingAddress?: string;
  clientRequestId: string;
}): Promise<CreateOrderResult> {
  const m = await getCabangMessages();
  const PESAN = pesan(m);
  const supabase = await createClient();
  const idOutcome = await getIdentity(supabase);
  if (idOutcome.status !== "ok") return { error: { message: identityErrorMessage(m, idOutcome) } };
  const identity = idOutcome.identity;

  // Staf divalidasi DI SINI, SEBELUM pelanggan dibuat (dipindah dari posisi
  // aslinya setelah resolveOrCreateCustomer — migrasi 0019): customers.
  // attributed_staff_id butuh salesStaffId yang SUDAH terbukti aktif & milik
  // cabang/partner ini SEBELUM baris pelanggan ditulis, supaya trigger
  // fn_check_customer_staff_ref/fn_set_customer_code selalu menerima staf
  // yang valid, dan supaya validasi staf yang gagal tidak pernah lolos
  // MENINGGALKAN baris pelanggan baru yang yatim (lihat kepala berkas
  // migration 0019 § "KEPUTUSAN DESAIN ATRIBUSI STAF").
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

  const custReqId = `${input.clientRequestId}:customer`;
  const resolveInput: ResolveCustomerInput = input.customerId
    ? { mode: "existing", customerId: input.customerId }
    : {
        mode: "new",
        fullName: input.fullName || "",
        phone: input.phone || "",
        notes: undefined,
        // salesStaffId di atas SUDAH divalidasi verifyActiveStaffInBranch —
        // dipakai ULANG sebagai atribusi pelanggan (customers.
        // attributed_staff_id, migrasi 0019). Hanya berlaku untuk pelanggan
        // BARU — pelanggan yang sudah ada (mode "existing") TIDAK PERNAH
        // ditimpa (trigger fn_set_customer_code hanya jalan BEFORE INSERT).
        attributedStaffId: input.salesStaffId,
      };

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
  // shipping_address (0014) dilebur ke tier fallback yang SAMA dengan
  // fulfillment_path/partner_purchase_amount (bukan tier terpisah): kalau
  // salah satu kolom di grup ini belum ada di server (kode naik lebih dulu
  // dari migrasi — LESSONS #12), grup ini gagal BERSAMA dan seluruhnya
  // dicoba ulang tanpa grup — tapi tetap dilaporkan sebagai partial lewat
  // `droppedFulfillment` di bawah, TIDAK PERNAH diam-diam dibuang tanpa
  // pemberitahuan. Ini penyederhanaan sadar: memisahkan tiap kolom jadi
  // tier fallback sendiri-sendiri lebih presisi tapi jauh lebih rumit untuk
  // risiko yang sempit (0014 biasanya dijalankan bersamaan dengan kode ini).
  const fulfillmentCols: Record<string, unknown> = {
    ...(fulfillmentRendered ? { fulfillment_path: path.value, partner_purchase_amount: amount.value } : {}),
    shipping_address: normalizeShippingAddress(input.shippingAddress),
  };

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

  // Salinan isi Package → order_items (0014). Best-effort, TIDAK PERNAH
  // menggagalkan pesanan yang sudah tersimpan (lihat komentar
  // copyPackageItemsToOrder di atas) — hanya lewat pkg.packageId yang berarti
  // "Package sungguhan terpilih" (bukan mode manual/undefined).
  let itemsCopyWarning: string | undefined;
  if (pkg.packageId) {
    const copyResult = await copyPackageItemsToOrder(supabase, orderId, pkg.packageId, input.clientRequestId);
    if (!copyResult.ok) itemsCopyWarning = m.cabang.orderItemsCopyWarningPartial;
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

  return { data: { ...summary, customerId: customer.id, itemsCopyWarning } };
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
  m: CabangMessages,
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
  m: CabangMessages,
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
  shippingAddress?: string;
}): Promise<UpdateOrderResult> {
  const m = await getCabangMessages();
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
  // shipping_address (0014) selalu dirender di modal Ubah (bukan field
  // bersyarat seperti fulfillment/purchase amount), jadi biasanya selalu
  // terkirim — sentinel `undefined` tetap diperiksa untuk konsistensi pola.
  if (input.shippingAddress !== undefined) {
    fulfillmentCols.shipping_address = normalizeShippingAddress(input.shippingAddress);
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
  const m = await getCabangMessages();
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
  const m = await getCabangMessages();
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

/* ------------------------------------------------------------------ *
 * Isi Pesanan (order_items, migrasi 0014) — sisi cabang. Cabang boleh
 * mengubah note/quantity/color_code/custom_size dan menghapus baris pada
 * pesanan yang masih REGISTERED dan boleh ia edit (fn_can_edit_branch) —
 * ditegakkan RLS (oi_partner_update/oi_partner_delete), bukan diasumsikan
 * di sini. Kolom harga (unit_price/line_discount) SENGAJA TIDAK ada di form
 * cabang sama sekali — trg_order_item_price_guard akan menolaknya kalau
 * partner tidak punya can_edit_offer, jadi UI cabang tidak menawarkannya.
 * ------------------------------------------------------------------ */

const MAX_ITEM_QTY = 999_999;

export type UpdateOrderItemResult = { data: { updated: true } } | { error: ActionError };

export async function updateOrderItemFields(input: {
  itemId: string;
  quantity: string;
  note?: string;
  colorCode?: string;
  customSize?: string;
}): Promise<UpdateOrderItemResult> {
  const m = await getCabangMessages();
  const PESAN = pesan(m);
  const supabase = await createClient();

  const qty = Number(input.quantity);
  if (!Number.isInteger(qty) || qty <= 0 || qty > MAX_ITEM_QTY) {
    return { error: { field: "quantity", message: m.cabang.orderItemQtyInvalid } };
  }

  const written = await safeWrite(
    supabase
      .from("order_items")
      .update({
        quantity: qty,
        note: input.note?.trim() || null,
        color_code: input.colorCode?.trim() || null,
        custom_size: input.customSize?.trim() || null,
      })
      .eq("id", input.itemId)
      .select("id")
      .maybeSingle()
  );

  if (!written.ok) {
    if (written.reason === "db") {
      if (isMissingTableError({ code: written.code })) return { error: { message: m.cabang.orderItemsFeatureOff } };
      return { error: { message: m.cabang.orderItemSaveFailed } };
    }
    return { error: { message: PESAN.belumPastiUbah } };
  }
  if (!written.data) {
    // 0 baris: bukan error DB, tapi RLS menolak diam-diam (bukan hak cabang
    // ini / pesanan sudah CANCELLED) — LESSONS #2/#7, jangan pura-pura sukses.
    return { error: { message: m.cabang.orderItemSaveFailed } };
  }

  revalidatePath(`/cabang/pesanan/${input.itemId}`);
  return { data: { updated: true } };
}

export async function deleteOrderItemCabang(itemId: string, orderId: string): Promise<UpdateOrderItemResult> {
  const m = await getCabangMessages();
  const supabase = await createClient();
  const { data, error } = await supabase.from("order_items").delete().eq("id", itemId).select("id").maybeSingle();
  if (error) {
    if (isMissingTableError(error)) return { error: { message: m.cabang.orderItemsFeatureOff } };
    return { error: { message: m.cabang.orderItemDeleteFailed } };
  }
  if (!data) return { error: { message: m.cabang.orderItemDeleteFailed } };

  revalidatePath(`/cabang/pesanan/${orderId}`);
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

/* ------------------------------------------------------------------ *
 * Kalkulator Penawaran → order_items (order_items, migrasi 0014). Hand-off
 * SEKALI PAKAI dari /cabang/kalkulator (lib/calculator-shared.ts::CalcHandoff)
 * — dipanggil client SETELAH pesanan berhasil dibuat, di titik yang SAMA
 * dengan setOrderOfferBranch di bawah (applyCalcHandoffIfNeeded,
 * new-order-form.tsx), HANYA kalau staf menekan "Gunakan angka ini" pada
 * banner hand-off. Sepupu langsung copyPackageItemsToOrder di atas — pola
 * idempotency/error-handling SENGAJA disalin, bukan diciptakan baru.
 * ------------------------------------------------------------------ */

const MAX_CALC_ITEM_UNIT_PRICE = 9_999_999_999_999;

export type CopyCalcItemsOutcome = {
  total: number;
  created: number;
  /**
   * true kalau minimal satu baris berhasil dibuat TAPI tanpa unit_price —
   * trg_order_item_price_guard (migrasi 0014) menolak kolom harga karena
   * partner tidak (lagi) punya can_edit_offer. Baris itu tetap dibuat (nama/
   * kode/qty utuh), hanya harganya yang gugur — degradasi yang SESUAI izin,
   * bukan kegagalan (LESSONS #10: dilaporkan ke pemanggil, tidak ditelan
   * diam-diam maupun disamarkan jadi error keras).
   */
  priceGuardDegraded: boolean;
};

/**
 * Menyalin baris keranjang Kalkulator Penawaran ke order_items. Pola SAMA
 * PERSIS dengan copyPackageItemsToOrder di atas:
 *   - name_snapshot/code_snapshot DIAMBIL ULANG dari sanci_products lewat
 *     product_id (bukan dipercaya dari client/localStorage — LESSONS #6).
 *     unit_price/quantity TETAP dari input: harga di kalkulator memang angka
 *     yang diketik BEBAS oleh staf (tidak ada harga otoritatif di katalog
 *     untuk diambil ulang — 0010, lihat catatan di calculator-shared.ts), dan
 *     quantity adalah pilihan staf, bukan data otorisasi.
 *   - client_request_id per baris DETERMINISTIK
 *     (`{orderClientRequestId}:calc-item:{product_id}`) — retry (respons
 *     hilang, submitSafely mengulang) tidak pernah menggandakan baris
 *     (LESSONS #3/#21). Produk yang sama tidak pernah muncul dua kali di satu
 *     keranjang (addToCart di kalkulator-client.tsx menggabungkan qty), jadi
 *     product_id aman dipakai sebagai kunci — bukan indeks array yang bisa
 *     bergeser.
 *   - BEST-EFFORT MURNI: dipanggil SETELAH pesanan sudah tersimpan sukses;
 *     kegagalan di sini TIDAK PERNAH melempar atau membatalkan pesanan itu
 *     (pola sama dengan lampiran invoice / copyPackageItemsToOrder).
 *
 * Produk yang tidak lagi terlihat lewat sp_partner_read (ditarik dari
 * katalog / katalog partner dinonaktifkan sejak keranjang diisi) tidak bisa
 * diambil nama/kodenya — baris itu dilewati (dihitung sebagai gagal, sama
 * seperti item Package yang produknya sudah hilang di copyPackageItemsToOrder).
 *
 * trg_order_item_price_guard (migrasi 0014) menegakkan can_edit_offer untuk
 * unit_price/line_discount PERSIS seperti biasa — kalkulator sendiri bebas
 * izin (0014/0015 sengaja tidak menggerbanginya di layar kalkulator), tapi
 * jalur TULIS ini TIDAK ikut bebas (prinsip sama dengan setOrderOfferBranch:
 * kalkulatornya saja yang bebas izin, bukan jalur tulisnya). Kalau trigger
 * menolak (partner tidak/tidak lagi punya can_edit_offer), baris itu DICOBA
 * ULANG TANPA unit_price — nama/kode/qty tetap tersimpan. Ini BUKAN
 * kegagalan yang dilaporkan sebagai error; ini degradasi yang sesuai izin
 * (lihat priceGuardDegraded di atas). Baris yang tidak menyertakan harga
 * sama sekali (staf tidak mengisi/mengisi 0) tidak pernah menyentuh trigger
 * ini — unit_price tidak disertakan dalam INSERT sama sekali, bukan dikirim
 * sebagai 0.
 */
export async function copyCalcCartItemsToOrder(
  orderId: string,
  orderClientRequestId: string,
  lines: { productId: string; unitPrice: number; qty: number }[]
): Promise<CopyCalcItemsOutcome> {
  const supabase = await createClient();
  if (lines.length === 0) return { total: 0, created: 0, priceGuardDegraded: false };

  type ProductLite = { id: string; name: string; code: string | null };
  const productIds = Array.from(new Set(lines.map((l) => l.productId)));
  const { data: products, error } = await supabase
    .from("sanci_products")
    .select("id, name, code")
    .in("id", productIds);
  if (error) return { total: lines.length, created: 0, priceGuardDegraded: false };
  const byId = new Map(((products as ProductLite[] | null) ?? []).map((p) => [p.id, p]));

  let created = 0;
  let priceGuardDegraded = false;

  for (const line of lines) {
    const product = byId.get(line.productId);
    if (!product) continue;

    const reqId = `${orderClientRequestId}:calc-item:${line.productId}`;
    const { data: existing, error: existingErr } = await supabase
      .from("order_items")
      .select("id")
      .eq("client_request_id", reqId)
      .maybeSingle();
    if (existingErr) continue;
    if (existing) {
      created++;
      continue;
    }

    const qty = Math.max(1, Math.min(MAX_ITEM_QTY, Math.round(line.qty) || 1));
    const basePayload: Record<string, unknown> = {
      order_id: orderId,
      product_id: line.productId,
      name_snapshot: product.name,
      code_snapshot: product.code,
      quantity: qty,
      client_request_id: reqId,
    };
    const includesPrice =
      Number.isFinite(line.unitPrice) && line.unitPrice > 0 && line.unitPrice <= MAX_CALC_ITEM_UNIT_PRICE;
    const payload = includesPrice ? { ...basePayload, unit_price: line.unitPrice } : basePayload;

    let written = await safeWrite(supabase.from("order_items").insert(payload).select("id").single());
    if (
      !written.ok &&
      written.reason === "db" &&
      includesPrice &&
      written.detail.includes("Kolom harga per baris")
    ) {
      priceGuardDegraded = true;
      written = await safeWrite(supabase.from("order_items").insert(basePayload).select("id").single());
    }
    if (written.ok) created++;
  }

  return { total: lines.length, created, priceGuardDegraded };
}

/* ------------------------------------------------------------------ *
 * Penawaran SANCI dari sisi cabang (order_sanci_offers, migrasi 0014 +
 * 0015). Mirror dari web/app/admin/actions-orders.ts::setOrderOffer, tapi
 * lewat modul cabang sendiri karena sisi ini punya lapisan identitas/pesan
 * yang berbeda (getIdentity, m.cabang, bukan m.admin). Zero-trust tetap di
 * database (LESSONS #5/#6): RLS (oso_partner_insert/oso_partner_update,
 * 0014) mensyaratkan can_edit_offer untuk SELURUH baris, dan trigger 0015
 * (fn_guard_order_offer_discount_fields) mensyaratkan can_discount TAMBAHAN
 * untuk kolom discount_pcts/markup_pct/cash_discount — validasi di sini
 * hanya supaya pesan kesalahannya RAMAH (LESSONS #10), bukan penjaga
 * sesungguhnya.
 * ------------------------------------------------------------------ */

const MAX_OFFER_AMOUNT_BRANCH = 9_999_999_999_999;
const MAX_DISCOUNT_SLOTS_BRANCH = 6;

function parsePercentBranch(raw: string): number | null {
  const n = Number(raw.trim().replace(/[^0-9.,]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export type OfferOutcome =
  | {
      data: {
        amount: number;
        dpAmount: number;
        paymentCondition: string | null;
        discountPcts: number[];
        markupPct: number | null;
        cashDiscount: number;
        finalAmount: number;
      };
    }
  | { error: ActionError };

export async function setOrderOfferBranch(
  orderId: string,
  amountRaw: string,
  dpRaw: string,
  paymentCondition: string,
  discountPctsRaw: string[],
  markupRaw: string,
  cashRaw: string
): Promise<OfferOutcome> {
  const m = await getCabangMessages();
  const PESAN = pesan(m);
  const supabase = await createClient();
  const idOutcome = await getIdentity(supabase);
  if (idOutcome.status !== "ok") return { error: { message: identityErrorMessage(m, idOutcome) } };

  const amount = parseIDRInput(amountRaw.trim());
  if (amount === null || amount > MAX_OFFER_AMOUNT_BRANCH) {
    return { error: { field: "amount", message: m.cabang.cabangOfferInvalid } };
  }
  const dpTrimmed = dpRaw.trim();
  const dpAmount = dpTrimmed ? parseIDRInput(dpTrimmed) : 0;
  if (dpAmount === null || dpAmount > MAX_OFFER_AMOUNT_BRANCH) {
    return { error: { field: "dp_amount", message: m.cabang.cabangOfferInvalid } };
  }
  const conditionTrimmed = paymentCondition.trim() || null;

  const discountSlots = discountPctsRaw.map((s) => s.trim()).filter((s) => s !== "");
  if (discountSlots.length > MAX_DISCOUNT_SLOTS_BRANCH) {
    return { error: { field: "discount_pcts", message: m.cabang.cabangOfferDiscountMaxReached } };
  }
  const discountPcts: number[] = [];
  for (const slot of discountSlots) {
    const n = parsePercentBranch(slot);
    if (n === null || n <= 0 || n >= 100) {
      return { error: { field: "discount_pcts", message: m.cabang.cabangOfferDiscountInvalid } };
    }
    discountPcts.push(n);
  }

  const markupTrimmed = markupRaw.trim();
  let markupPct: number | null = null;
  if (markupTrimmed) {
    markupPct = parsePercentBranch(markupTrimmed);
    if (markupPct === null || markupPct < 0 || markupPct > 100) {
      return { error: { field: "markup_pct", message: m.cabang.cabangOfferMarkupInvalid } };
    }
  }

  const cashTrimmed = cashRaw.trim();
  const cashDiscount = cashTrimmed ? parseIDRInput(cashTrimmed) : 0;
  if (cashDiscount === null || cashDiscount > MAX_OFFER_AMOUNT_BRANCH) {
    return { error: { field: "cash_discount", message: m.cabang.cabangOfferCashInvalid } };
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
    if (written.reason === "unconfirmed") return { error: { message: PESAN.belumPastiUbah } };
    if (isMissingTableError({ code: written.code })) return { error: { message: m.cabang.errOrderModuleInactive } };
    if (isMissingColumnError({ code: written.code })) return { error: { message: m.cabang.errFeatureInactive } };
    // RLS UPDATE (row invisible under USING) laporkan "no row returned" lewat
    // safeWrite; RLS INSERT (WITH CHECK gagal) laporkan error 42501
    // (insufficient_privilege) — keduanya berarti sama bagi pengguna: belum
    // diizinkan menulis (LESSONS #25 memastikan bentuk ini aman diuji).
    if (written.detail === "no row returned" || written.code === "42501") {
      return { error: { message: m.cabang.cabangOfferNoPermissionEdit } };
    }
    if (written.code === "23514" && written.detail.includes("dp_le_final")) {
      return { error: { field: "dp_amount", message: m.cabang.cabangOfferDpExceedsAmount } };
    }
    if (written.code === "23514" && written.detail.includes("markup_pct_check")) {
      return { error: { field: "markup_pct", message: m.cabang.cabangOfferMarkupInvalid } };
    }
    if (written.code === "23514" && written.detail.includes("cash_discount_check")) {
      return { error: { field: "cash_discount", message: m.cabang.cabangOfferCashInvalid } };
    }
    if (
      written.detail.includes("lebih dari 0 dan kurang dari 100") ||
      written.detail.includes("daftar (array)") ||
      written.detail.includes("maksimal 6 nilai")
    ) {
      return { error: { field: "discount_pcts", message: m.cabang.cabangOfferDiscountInvalid } };
    }
    if (written.detail.includes("nilai akhir negatif")) {
      return { error: { field: "cash_discount", message: m.cabang.cabangOfferFinalNegative } };
    }
    if (written.detail.includes("Boleh mengatur diskon")) {
      return { error: { field: "discount_pcts", message: m.cabang.cabangOfferNoPermissionDiscount } };
    }
    return { error: { message: PESAN.serverSibuk } };
  }

  revalidatePath(`/cabang/pesanan/${orderId}`);
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
