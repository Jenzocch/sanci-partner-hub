"use server";

/**
 * Server Actions "Buat Pesanan" sisi SANCI Admin — admin membuat pesanan ATAS
 * NAMA partner/cabang mana pun (fitur 2026-08-22). Semua akun platform_admins
 * setara; tidak ada tingkatan admin.
 *
 * CERMIN SEMANTIK dari web/app/cabang/pesanan/actions.ts
 * (createCustomerAndOrder) — bukan salinan mentah. Perbedaan yang DISENGAJA:
 *
 *   1. Identitas partner/cabang TIDAK diambil dari sesi (admin tidak punya
 *      baris partner_users) — diambil dari PILIHAN admin di form, lalu
 *      divalidasi server-side: cabang harus milik partner itu dan keduanya
 *      ACTIVE. Dropdown di UI bukan batas keamanan (LESSONS #5) — dan batas
 *      paling dalam tetap DB: trg_check_order_refs (0004) menolak cabang
 *      yang bukan milik partner-nya terlepas dari apa pun di sini.
 *   2. Pemanggil diverifikasi SANCI Admin DI DEPAN, idiom yang sama persis
 *      dengan actions-users.ts (error DB ≠ "bukan admin", LESSONS #10).
 *      Penegakan sesungguhnya tetap RLS (o_admin_all/c_admin_all/oi_admin_all
 *      — semua `fn_is_admin()`), pemeriksaan ini memberi pesan yang jujur,
 *      bukan pengganti RLS.
 *   3. TIDAK ADA tangga fallback kolom-belum-ada (insertOrderWithFallbacks
 *      milik cabang): halaman admin ini lahir SESUDAH migrasi 0001–0019
 *      seluruhnya terverifikasi di production, jadi kolom yang hilang bukan
 *      keadaan transisi yang wajar melainkan tanda migrasi belum jalan —
 *      dijawab dengan pesan "modul belum aktif" yang jelas, bukan menyimpan
 *      sebagian jawaban diam-diam (LESSONS #12 versi kasus sederhana).
 *
 * Yang SAMA PERSIS dengan jalur cabang (jangan diubah sepihak — kalau salah
 * satu jalur berubah, periksa jalur satunya):
 *   - Urutan langkah: staf divalidasi SEBELUM pelanggan dibuat (keputusan
 *     0019 — validasi staf yang gagal tidak boleh meninggalkan pelanggan
 *     yatim; attributed_staff_id harus staf yang SUDAH terbukti sah).
 *   - Idempotency: client_request_id dasar + sufiks `:customer` / `:order` /
 *     `:item:{product_id}` yang identik, safeWrite + confirmByRequestId +
 *     isRequestIdConflict (LESSONS #2/#3/#21).
 *   - Pelaporan partial yang jujur: pelanggan tersimpan + order gagal TIDAK
 *     pernah disamarkan jadi sukses penuh (SPEC §70), dan sukses diklaim
 *     hanya setelah SELECT terpisah membuktikan barisnya ada (SPEC §68).
 *   - verifyActiveStaffInBranch + copyPackageItemsToOrder diimpor dari
 *     lib/order-create-shared.ts — SATU sumber kebenaran untuk dua jalur.
 *
 * Atribusi pelanggan BARU (keputusan desain fitur ini): pesanan yang dibuat
 * "atas nama" sebuah cabang adalah milik cabang itu — maka pelanggannya juga:
 * created_via_partner_id/created_via_branch_id = cabang TERPILIH (bukan null
 * seperti createCustomerAdmin di actions-customers.ts, yang memang untuk
 * pelanggan SANCI-direct), attributed_staff_id = sales terpilih. Dengan itu
 * trigger fn_set_customer_code (0019, jalur branch-created) menghasilkan kode
 * pelanggan yang SAMA seperti kalau cabangnya sendiri yang membuat, dan
 * cabang melihat pelanggan itu lewat RLS-nya (fn_can_view_branch atas
 * created_via_branch_id).
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  LOOKUP_TIMEOUT_MS,
  pesan,
  confirmByRequestId,
  isRequestIdConflict,
  safeWrite,
} from "@/lib/safe-write";
import {
  isMissingTableError,
  normalizePhoneID,
  parseIDRInput,
  type FulfillmentPath,
  type OrderStatus,
} from "@/lib/orders-shared";
import type { StockStatus } from "@/lib/catalog-shared";
import {
  copyPackageItemsToOrder,
  verifyActiveStaffInBranch,
  type SupabaseServerClient,
} from "@/lib/order-create-shared";
import { getAdminMessages, type AdminMessages } from "@/lib/i18n";

type ActionError = { field?: string; message: string };
type ActionResult<T> = { data: T } | { error: ActionError };

function isMissingColumn(code: string | undefined): boolean {
  return code === "42703";
}

/* ------------------------------------------------------------------ *
 * Verifikasi admin — idiom PERSIS actions-users.ts (createPartnerUser §1)
 * ------------------------------------------------------------------ */

type AdminOutcome =
  | { status: "ok"; userId: string }
  | { status: "not-admin" }
  | { status: "load-error" };

/**
 * Dicek dengan sesi pengguna sendiri, SEBELUM tulisan apa pun. Error database
 * ≠ "bukan admin" (LESSONS #10) — kegagalan teknis tidak boleh menyamar jadi
 * kesimpulan bisnis. RLS admin_all tetap penegak sesungguhnya di DB.
 */
async function requireAdmin(supabase: SupabaseServerClient): Promise<AdminOutcome> {
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

function adminErrorMessage(m: AdminMessages, outcome: Extract<AdminOutcome, { status: "not-admin" | "load-error" }>): string {
  return outcome.status === "load-error" ? m.admin.userPermCheckFailed : m.admin.userNotAuthorized;
}

/* ------------------------------------------------------------------ *
 * Validasi partner + cabang PILIHAN (pengganti getIdentity milik cabang)
 * ------------------------------------------------------------------ */

type PairOutcome = { ok: true } | { ok: false; error: ActionError };

/**
 * Cabang harus milik partner yang dikirim, dan KEDUANYA ACTIVE. Embed
 * `partners:partner_id(...)` memakai FK sungguhan partner_branches.partner_id
 * (LESSONS #24 — bukan relasi karangan). Nilai partnerId dari client tetap
 * dibandingkan dengan hasil DB, bukan dipercaya (LESSONS #6).
 */
async function verifyPartnerBranchPair(
  m: AdminMessages,
  supabase: SupabaseServerClient,
  partnerId: string,
  branchId: string
): Promise<PairOutcome> {
  const PESAN = pesan(m);
  if (!partnerId || !branchId) {
    return { ok: false, error: { field: "branch_id", message: m.admin.orderCreatePairInvalid } };
  }
  const { data, error } = await supabase
    .from("partner_branches")
    .select("id, partner_id, status, partners:partner_id(id, status)")
    .eq("id", branchId)
    .maybeSingle();
  if (error) {
    if (isMissingTableError(error)) return { ok: false, error: { message: m.admin.orderCreateModuleInactive } };
    return { ok: false, error: { message: PESAN.serverSibuk } };
  }
  const partner = (data?.partners ?? null) as unknown as { id: string; status: string } | null;
  if (
    !data ||
    data.partner_id !== partnerId ||
    data.status !== "ACTIVE" ||
    !partner ||
    partner.status !== "ACTIVE"
  ) {
    return { ok: false, error: { field: "branch_id", message: m.admin.orderCreatePairInvalid } };
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ *
 * Data form dinamis: cabang+package per partner, staf per cabang
 * ------------------------------------------------------------------ */

export type BranchOption = { id: string; name: string };
export type PackageOption = { id: string; name: string };
export type StaffOption = { id: string; fullName: string; role: string };

/**
 * Dipanggil client saat admin memilih partner. Kegagalan dilaporkan sebagai
 * error eksplisit dengan tombol coba lagi di UI — TIDAK pernah disamarkan
 * jadi "partner ini tidak punya cabang/package" (LESSONS #10).
 */
export async function getPartnerOrderOptions(
  partnerId: string
): Promise<ActionResult<{ branches: BranchOption[]; packages: PackageOption[] }>> {
  const m = await getAdminMessages();
  const PESAN = pesan(m);
  const supabase = await createClient();
  const admin = await requireAdmin(supabase);
  if (admin.status !== "ok") return { error: { message: adminErrorMessage(m, admin) } };

  const [{ data: branchRows, error: branchErr }, { data: packageRows, error: packageErr }] = await Promise.all([
    supabase
      .from("partner_branches")
      .select("id, name")
      .eq("partner_id", partnerId)
      .eq("status", "ACTIVE")
      .order("name"),
    supabase
      .from("partner_packages")
      .select("id, name")
      .eq("partner_id", partnerId)
      .eq("status", "ACTIVE")
      .order("name"),
  ]);

  if (branchErr) return { error: { message: PESAN.serverSibuk } };
  // partner_packages belum ada (0008 belum jalan) BUKAN kegagalan — form
  // turun ke input nama package manual, pola yang sama dengan halaman cabang.
  if (packageErr && !isMissingTableError(packageErr)) return { error: { message: PESAN.serverSibuk } };

  return {
    data: {
      branches: (branchRows ?? []).map((b) => ({ id: b.id, name: b.name })),
      packages: (packageRows ?? []).map((p) => ({ id: p.id, name: p.name })),
    },
  };
}

/**
 * Dipanggil client saat admin memilih cabang — staf ACTIVE dengan penugasan
 * terbuka di cabang itu, pola query yang sama dengan halaman
 * /cabang/pesanan/baru (page.tsx). Ini hanya untuk MENGISI dropdown; validasi
 * yang menentukan tetap verifyActiveStaffInBranch saat submit.
 */
export async function getBranchStaffOptions(
  partnerId: string,
  branchId: string
): Promise<ActionResult<{ staff: StaffOption[] }>> {
  const m = await getAdminMessages();
  const PESAN = pesan(m);
  const supabase = await createClient();
  const admin = await requireAdmin(supabase);
  if (admin.status !== "ok") return { error: { message: adminErrorMessage(m, admin) } };

  const [{ data: staffList, error: staffErr }, { data: assignments, error: asgErr }] = await Promise.all([
    supabase.from("partner_staff").select("id, full_name, status").eq("partner_id", partnerId),
    supabase
      .from("partner_staff_assignments")
      .select("staff_id, role")
      .eq("branch_id", branchId)
      .is("end_at", null),
  ]);
  if (staffErr || asgErr) return { error: { message: PESAN.serverSibuk } };

  const roleByStaff = new Map<string, string>();
  (assignments ?? []).forEach((a: { staff_id: string; role: string }) => roleByStaff.set(a.staff_id, a.role));
  const staff = (staffList ?? [])
    .filter((s) => s.status === "ACTIVE" && roleByStaff.has(s.id))
    .map((s) => ({ id: s.id, fullName: s.full_name, role: roleByStaff.get(s.id)! }));
  return { data: { staff } };
}

/* ------------------------------------------------------------------ *
 * Pencarian pelanggan berdasarkan telepon — semantik SAMA dengan
 * searchCustomerByPhone milik cabang (SPEC §82–84); RLS admin membaca semua
 * pelanggan, jadi dedupe-nya lintas partner (telepon yang sama = orang yang
 * sama, terlepas lewat cabang mana ia pernah dibuat).
 * ------------------------------------------------------------------ */

type CustomerLite = {
  id: string;
  full_name: string;
  phone: string;
  address?: string | null;
  city?: string | null;
  province?: string | null;
};

export type AdminCustomerSearchOutcome =
  | { status: "invalid" }
  | { status: "found"; customer: CustomerLite }
  | { status: "not_found" }
  | { status: "error" };

/**
 * Kegagalan pemeriksaan TIDAK PERNAH dilaporkan sebagai "tidak ditemukan" —
 * itu bisa menyebabkan pelanggan yang sama dibuat dua kali (SPEC §84).
 */
export async function searchCustomerByPhoneAdmin(rawPhone: string): Promise<AdminCustomerSearchOutcome> {
  const normalized = normalizePhoneID(rawPhone);
  if (!normalized) return { status: "invalid" };

  const supabase = await createClient();
  const admin = await requireAdmin(supabase);
  if (admin.status !== "ok") return { status: "error" };

  const outcome = await safeWrite<CustomerLite[]>(
    supabase
      .from("customers")
      .select("id, full_name, phone, address, city, province")
      .eq("phone_normalized", normalized)
      .limit(1),
    LOOKUP_TIMEOUT_MS
  );
  if (!outcome.ok) return { status: "error" };
  if (outcome.data.length === 0) return { status: "not_found" };
  return { status: "found", customer: outcome.data[0] };
}

/* ------------------------------------------------------------------ *
 * Validator kecil — cermin cabang/pesanan/actions.ts dengan teks admin.
 * Angka/enum dihitung ulang di server dari string mentah (LESSONS #6).
 * ------------------------------------------------------------------ */

const MAX_PURCHASE_AMOUNT = 9_999_999_999_999; // numeric(15,2), catatan 0009

function validateFulfillmentPathAdmin(
  m: AdminMessages,
  raw: string | undefined
): { ok: true; value: FulfillmentPath } | { ok: false; error: ActionError } {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) {
    return { ok: false, error: { field: "fulfillment_path", message: m.admin.orderCreateFulfillmentRequired } };
  }
  if (trimmed !== "DIRECT_DELIVERY" && trimmed !== "SHOWROOM_VISIT") {
    return { ok: false, error: { field: "fulfillment_path", message: m.admin.orderCreateFulfillmentInvalid } };
  }
  return { ok: true, value: trimmed as FulfillmentPath };
}

function validatePurchaseAmountAdmin(
  m: AdminMessages,
  raw: string | undefined
): { ok: true; value: number | null } | { ok: false; error: ActionError } {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { ok: true, value: null };
  const n = parseIDRInput(trimmed);
  if (n === null || n > MAX_PURCHASE_AMOUNT) {
    return { ok: false, error: { field: "partner_purchase_amount", message: m.admin.orderCreateAmountInvalid } };
  }
  return { ok: true, value: n };
}

type PackageResolution =
  | { ok: true; packageName: string; packageId: string | null }
  | { ok: false; error: ActionError };

/**
 * Cermin resolvePackage cabang: nama TIDAK PERNAH dipercaya dari snapshot
 * client saat packageId dikirim — diambil ulang dari DB dan wajib ACTIVE
 * milik partner terpilih (LESSONS #6). Beda kecil dari cabang: package_id
 * selalu ditulis (string atau null) — kolomnya (0008) sudah pasti ada,
 * lihat kepala berkas §3.
 */
async function resolvePackageAdmin(
  m: AdminMessages,
  supabase: SupabaseServerClient,
  partnerId: string,
  input: { packageId?: string; packageName: string; packagesAvailable: boolean }
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
      return { ok: false, error: { field: "package_name", message: PESAN.serverSibuk } };
    }
    if (!data || data.status !== "ACTIVE") {
      return { ok: false, error: { field: "package_name", message: m.admin.orderCreatePackageNotFound } };
    }
    return { ok: true, packageName: data.name, packageId: data.id };
  }

  const packageName = input.packageName.trim();
  if (!packageName) {
    return {
      ok: false,
      error: {
        field: "package_name",
        message: input.packagesAvailable
          ? m.admin.orderCreatePackageRequired
          : m.admin.orderCreatePackageNameRequired,
      },
    };
  }
  return { ok: true, packageName, packageId: null };
}

/* ------------------------------------------------------------------ *
 * Pelanggan: pakai yang ada, atau buat baru (idempotent) atas nama cabang
 * ------------------------------------------------------------------ */

type ResolveCustomerInput =
  | { mode: "existing"; customerId: string }
  | { mode: "new"; fullName: string; phone: string; attributedStaffId: string };

type ResolveCustomerOutcome =
  | { ok: true; customer: CustomerLite }
  | { ok: false; error: ActionError };

/**
 * Cermin resolveOrCreateCustomer cabang. Atribusi pelanggan BARU mengikuti
 * cabang TERPILIH (lihat kepala berkas): created_via_partner_id/branch_id =
 * pilihan admin yang sudah tervalidasi, attributed_staffId = sales yang SUDAH
 * lolos verifyActiveStaffInBranch (kontrak yang sama dengan cabang — fungsi
 * ini tidak memvalidasi ulang; fn_check_customer_staff_ref di DB tetap
 * penjaga terakhirnya). created_by TIDAK dikirim — trg_set_created_by (0004)
 * selalu menimpanya dengan auth.uid() sesi ini.
 */
async function resolveOrCreateCustomerAdmin(
  m: AdminMessages,
  supabase: SupabaseServerClient,
  partnerId: string,
  branchId: string,
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
      if (isMissingTableError(error)) return { ok: false, error: { message: m.admin.orderCreateModuleInactive } };
      return { ok: false, error: { message: PESAN.serverSibuk } };
    }
    if (!existing) return { ok: false, error: { message: m.admin.orderCreateCustomerGone } };
    return { ok: true, customer: existing };
  }

  const fullName = input.fullName.trim();
  if (!fullName) return { ok: false, error: { field: "full_name", message: m.admin.orderCreateFullNameRequired } };
  const normalized = normalizePhoneID(input.phone);
  if (!normalized) return { ok: false, error: { field: "phone", message: m.admin.orderCreatePhoneInvalid } };

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
        phone: input.phone.trim(),
        phone_normalized: normalized,
        created_via_partner_id: partnerId,
        created_via_branch_id: branchId,
        attributed_staff_id: input.attributedStaffId,
        client_request_id: clientRequestId,
      })
      .select("id, full_name, phone")
      .single()
  );
  if (written.ok) return { ok: true, customer: written.data };

  if (written.reason === "db" && isMissingTableError({ code: written.code })) {
    return { ok: false, error: { message: m.admin.orderCreateModuleInactive } };
  }
  // attributed_staff_id belum ada = 0019 belum jalan — bukan keadaan wajar
  // untuk halaman ini (lihat kepala berkas §3): pesan migrasi, bukan fallback.
  if (written.reason === "db" && isMissingColumn(written.code)) {
    return { ok: false, error: { message: m.admin.orderCreateModuleInactive } };
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
 * Ringkasan pesanan — SPEC §68: sukses diklaim lewat SELECT terpisah
 * ------------------------------------------------------------------ */

export type AdminOrderSummary = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  packageName: string;
  createdAt: string;
  customerName: string;
  customerPhone: string;
  itemsCopyWarning?: string;
};

export type AdminOrderCreated = AdminOrderSummary & { customerId: string };

export type AdminCreateOrderResult =
  | { data: AdminOrderCreated }
  | { error: ActionError }
  /** Pelanggan tersimpan, pesanan gagal — TIDAK boleh diklaim sukses penuh. */
  | { partial: { customerId: string; customerName: string; customerPhone: string; message: string } };

async function fetchOrderSummaryAdmin(
  supabase: SupabaseServerClient,
  orderId: string
): Promise<AdminOrderSummary | null> {
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
    customerPhone: cust?.phone_normalized ?? "",
  };
}

/** Dipakai client saat submitSafely melaporkan "confirmed" (respons hilang tapi data terbukti masuk). */
export async function getOrderSummaryAdmin(
  orderId: string
): Promise<{ status: "found"; order: AdminOrderSummary } | { status: "unknown" }> {
  const supabase = await createClient();
  const order = await fetchOrderSummaryAdmin(supabase, orderId);
  return order ? { status: "found", order } : { status: "unknown" };
}

/* ------------------------------------------------------------------ *
 * Aksi utama: buat pesanan (+ pelanggan bila perlu) atas nama cabang
 * ------------------------------------------------------------------ */

export async function createOrderForBranch(input: {
  partnerId: string;
  branchId: string;
  customerId?: string;
  fullName?: string;
  phone?: string;
  packageId?: string;
  packageName: string;
  /** true = dropdown package DIRENDER (partner punya package ACTIVE) — menentukan pesan wajib + package_id null vs terisi. */
  packagesAvailable: boolean;
  salesStaffId: string;
  picStaffId?: string;
  notes?: string;
  fulfillmentPath: string;
  purchaseAmountRaw?: string;
  shippingAddress?: string;
  clientRequestId: string;
}): Promise<AdminCreateOrderResult> {
  const m = await getAdminMessages();
  const PESAN = pesan(m);
  const supabase = await createClient();

  // ── 1. Pemanggil harus SANCI Admin (idiom actions-users.ts) ──
  const admin = await requireAdmin(supabase);
  if (admin.status !== "ok") return { error: { message: adminErrorMessage(m, admin) } };

  // ── 2. Partner + cabang pilihan: saling memiliki, dua-duanya ACTIVE ──
  const pair = await verifyPartnerBranchPair(m, supabase, input.partnerId, input.branchId);
  if (!pair.ok) return { error: pair.error };

  // ── 3. Staf SEBELUM pelanggan (keputusan 0019 — lihat kepala berkas) ──
  if (!input.salesStaffId) return { error: { field: "sales_staff_id", message: m.admin.orderCreateSalesRequired } };
  const salesCheck = await verifyActiveStaffInBranch(supabase, input.salesStaffId, input.branchId, input.partnerId);
  if (salesCheck === "error") return { error: { field: "sales_staff_id", message: PESAN.serverSibuk } };
  if (salesCheck === "invalid") {
    return { error: { field: "sales_staff_id", message: m.admin.orderCreateSalesInvalid } };
  }
  let picStaffId: string | null = null;
  if (input.picStaffId) {
    const picCheck = await verifyActiveStaffInBranch(supabase, input.picStaffId, input.branchId, input.partnerId);
    if (picCheck === "error") return { error: { field: "pic_staff_id", message: PESAN.serverSibuk } };
    if (picCheck === "invalid") {
      return { error: { field: "pic_staff_id", message: m.admin.orderCreatePicInvalid } };
    }
    picStaffId = input.picStaffId;
  }

  // ── 4. Pelanggan: pakai yang ada / buat baru atas nama cabang terpilih ──
  const custReqId = `${input.clientRequestId}:customer`;
  const resolveInput: ResolveCustomerInput = input.customerId
    ? { mode: "existing", customerId: input.customerId }
    : {
        mode: "new",
        fullName: input.fullName || "",
        phone: input.phone || "",
        attributedStaffId: input.salesStaffId,
      };
  const resolved = await resolveOrCreateCustomerAdmin(
    m,
    supabase,
    input.partnerId,
    input.branchId,
    resolveInput,
    custReqId
  );
  if (!resolved.ok) return { error: resolved.error };
  const customer = resolved.customer;

  // ── 5. Package + validasi field lain ──
  const pkg = await resolvePackageAdmin(m, supabase, input.partnerId, {
    packageId: input.packageId,
    packageName: input.packageName,
    packagesAvailable: input.packagesAvailable,
  });
  if (!pkg.ok) return { error: pkg.error };

  const path = validateFulfillmentPathAdmin(m, input.fulfillmentPath);
  if (!path.ok) return { error: path.error };
  const amount = validatePurchaseAmountAdmin(m, input.purchaseAmountRaw);
  if (!amount.ok) return { error: amount.error };
  const shippingAddress = (input.shippingAddress ?? "").trim() || null;

  // ── 6. Pesanan (idempotent, pola cabang) ──
  const orderReqId = `${input.clientRequestId}:order`;
  const partialResult = {
    partial: {
      customerId: customer.id,
      customerName: customer.full_name,
      customerPhone: customer.phone,
      message: m.admin.orderCreatePartialFailed,
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
    // order_number/created_by dibuat trigger DB (0004) untuk SIAPA PUN aktor
    // yang login — nilai dari sini toh diabaikan, jadi tidak dikirim.
    const written = await safeWrite(
      supabase
        .from("partner_orders")
        .insert({
          customer_id: customer.id,
          partner_id: input.partnerId,
          branch_id: input.branchId,
          partner_sales_staff_id: input.salesStaffId,
          partner_pic_staff_id: picStaffId,
          package_name: pkg.packageName,
          package_id: pkg.packageId,
          notes: input.notes?.trim() || null,
          fulfillment_path: path.value,
          partner_purchase_amount: amount.value,
          shipping_address: shippingAddress,
          client_request_id: orderReqId,
        })
        .select("id")
        .single()
    );

    if (written.ok) {
      orderId = written.data.id;
    } else if (
      written.reason === "db" &&
      (isMissingTableError({ code: written.code }) || isMissingColumn(written.code))
    ) {
      // Migrasi hilang di jalur baru ini = konfigurasi salah, bukan transisi
      // wajar (kepala berkas §3). Pelanggan bisa saja SUDAH tersimpan di
      // langkah 4 — laporkan partial yang jujur, bukan error biasa.
      return { partial: { ...partialResult.partial, message: m.admin.orderCreateModuleInactive } };
    } else if (written.reason === "unconfirmed" || isRequestIdConflict(written)) {
      const recheck = await confirmByRequestId(
        supabase.from("partner_orders").select("id").eq("client_request_id", orderReqId).maybeSingle()
      );
      if (recheck.status === "found") {
        orderId = recheck.data.id;
      } else if (recheck.status === "absent") {
        return partialResult;
      } else {
        return { partial: { ...partialResult.partial, message: m.admin.orderCreatePartialUnknown } };
      }
    } else {
      return partialResult;
    }
  }

  // ── 7. Salin isi Package → order_items (best-effort, helper bersama) ──
  let itemsCopyWarning: string | undefined;
  if (pkg.packageId) {
    const copyResult = await copyPackageItemsToOrder(supabase, orderId, pkg.packageId, input.clientRequestId);
    if (!copyResult.ok) itemsCopyWarning = m.admin.orderCreateItemsCopyWarning;
  }

  // ── 8. SPEC §68: bukti lewat SELECT terpisah sebelum mengaku sukses ──
  const summary = await fetchOrderSummaryAdmin(supabase, orderId);
  revalidatePath("/admin/orders");
  if (!summary) {
    return { partial: { ...partialResult.partial, message: m.admin.orderCreateSummaryUnavailable } };
  }
  return { data: { ...summary, customerId: customer.id, itemsCopyWarning } };
}

/* ------------------------------------------------------------------ *
 * Daftar produk untuk picker "Isi Pesanan" di form pesanan baru admin
 * (lib/order-item-picker.tsx, fitur 2026-08-24). Dimuat MALAS: dipanggil
 * client saat picker pertama kali dibuka — halaman form TIDAK mengambil
 * daftar produk di muka (idiom yang sama dengan getPartnerOrderOptions di
 * atas: data dinamis form diambil lewat Server Action sesuai kebutuhan).
 *
 * Sumber produk SENGAJA identik dengan /admin/kalkulator/page.tsx: TANPA
 * gerbang sanci_catalog_access (itu gerbang "katalog dibuka untuk partner
 * mana"; admin pemilik katalognya) — semua produk ACTIVE lewat RLS admin
 * sp_admin_all (0010), order by name, limit 200. Kegagalan dilaporkan
 * eksplisit dengan tombol coba lagi di picker (LESSONS #10), tidak pernah
 * disamarkan jadi "katalog kosong".
 * ------------------------------------------------------------------ */

export type AdminPickerProductRow = {
  id: string;
  name: string;
  code: string | null;
  category: string | null;
  photo_url: string | null;
  stock_status: StockStatus;
};

export type AdminPickerProductsOutcome =
  | { status: "ok"; products: AdminPickerProductRow[]; capped: boolean }
  | { status: "module_inactive" }
  | { status: "error" };

export async function getPickerProductsAdmin(): Promise<AdminPickerProductsOutcome> {
  const supabase = await createClient();
  const admin = await requireAdmin(supabase);
  if (admin.status !== "ok") return { status: "error" };

  const { data: products, error } = await supabase
    .from("sanci_products")
    .select("id, name, code, category, photo_url, stock_status")
    .eq("status", "ACTIVE")
    .order("name")
    .limit(200);
  if (error) {
    return isMissingTableError(error) ? { status: "module_inactive" } : { status: "error" };
  }
  const rows = (products ?? []) as AdminPickerProductRow[];
  // .limit(200) bisa memotong diam-diam — client menampilkan
  // catalogListCappedMsg saat mentok (audit 2026-08-22 #11).
  return { status: "ok", products: rows, capped: rows.length === 200 };
}

/* ------------------------------------------------------------------ *
 * Catat path invoice yang diunggah admin (cermin setOrderInvoicePath cabang;
 * storage-nya sendiri sudah mengizinkan admin lewat fn_is_admin() di policy
 * order_invoices_insert/update — migrasi 0009 §6).
 * ------------------------------------------------------------------ */

export async function setOrderInvoicePathAdmin(input: {
  orderId: string;
  path: string;
}): Promise<ActionResult<{ updated: true }>> {
  const m = await getAdminMessages();
  const PESAN = pesan(m);
  const supabase = await createClient();
  const admin = await requireAdmin(supabase);
  if (admin.status !== "ok") return { error: { message: adminErrorMessage(m, admin) } };

  // Zero-trust path (LESSONS #6): wajib `<orderId>/<nama>`, tanpa "..".
  const prefix = `${input.orderId}/`;
  if (!input.path.startsWith(prefix) || input.path.includes("..")) {
    return { error: { message: m.admin.orderCreateInvoicePathInvalid } };
  }

  const { data: order, error: fetchErr } = await supabase
    .from("partner_orders")
    .select("id, status")
    .eq("id", input.orderId)
    .maybeSingle();
  if (fetchErr) return { error: { message: PESAN.serverSibuk } };
  if (!order) return { error: { message: m.admin.orderNotFound } };
  if (order.status !== "REGISTERED") {
    return { error: { message: m.admin.orderCreateInvoiceOrderCancelled } };
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
    if (written.reason === "unconfirmed") return { error: { message: PESAN.belumPastiUbah } };
    return { error: { message: m.admin.orderCreateInvoiceRecordFailed } };
  }
  if (!written.data) {
    // 0 baris = RLS menolak diam-diam — bukan sukses (LESSONS #7).
    return { error: { message: m.admin.orderCreateInvoiceRecordFailed } };
  }

  revalidatePath("/admin/orders/[orderId]", "page");
  return { data: { updated: true } };
}
