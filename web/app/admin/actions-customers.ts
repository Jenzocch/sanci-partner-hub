"use server";

/**
 * Server Actions untuk Pelanggan (Phase 2 slice 13 — customer_code otomatis,
 * migrasi 0018) — dikelola SANCI Admin saja.
 *
 * Empat kelompok fungsi:
 *   1. createCustomerAdmin — Admin menambah pelanggan SANCI-direct langsung
 *      dari layar /admin/pelanggan (created_via_partner_id/branch_id selalu
 *      NULL — bukan cabang mana pun; sama pola dengan skrip impor 0017).
 *   2. createCustomerSource / updateCustomerSource / setCustomerSourceStatus
 *      — master "Kode Sumber Tamu" (customer_sources).
 *   3. createSalesStaff / updateSalesStaff / setSalesStaffStatus — master
 *      "Kode Sales" SANCI internal (sanci_sales_staff) — BUKAN partner_staff
 *      (lihat kepala migrasi 0018 untuk disambiguasi lengkap).
 *   4. getPelangganPageAdmin — halaman daftar pelanggan (server-side search
 *      + "Muat Lebih Banyak", kontrak lib/catalog-query.ts) untuk
 *      pelanggan-list-client.tsx; bentuknya meniru getProdukPageAdmin
 *      (catalog-actions.ts).
 *
 * Pola idempotency + safeWrite ditiru dari actions-packages.ts/
 * actions-products.ts (LESSONS #21): cek client_request_id dulu, baru
 * konflik kode bisnis. customer_sources/sanci_sales_staff BISA belum ada di
 * database (migrasi 0018 dikerjakan paralel dengan kode ini — LESSONS #12).
 * Setiap error 42P01 diterjemahkan ke pesan degradasi, bukan dibiarkan bocor
 * sebagai error DB mentah.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { pesan, confirmByRequestId, isRequestIdConflict, safeWrite } from "@/lib/safe-write";
import { normalizePhoneID } from "@/lib/orders-shared";
import { getAdminMessages } from "@/lib/i18n";
import type { SupabaseServerClient } from "@/lib/order-create-shared";
import {
  catalogIlikeOrFilter,
  catalogPageRange,
  finishCatalogPage,
  normalizeCatalogPageInput,
  type CatalogPageInput,
} from "@/lib/catalog-query";

type ActionError = { field?: string; message: string };
type ActionResult<T> = { data: T } | { error: ActionError };

// Kode sumber/sales SANCI: 1–4 huruf besar (bukan CODE_RE di lib/validation.ts
// — itu untuk kode Partner/Package, minimal 2 karakter. Roster owner sekarang
// punya kode SATU huruf: A, B, C, D, E, M, C, D, S — jadi minimal 1.
const SHORT_CODE_RE = /^[A-Z]{1,4}$/;

function normalizeShortCode(raw: string): string {
  return raw.trim().toUpperCase();
}

function isMissingTable(code: string | undefined): boolean {
  return code === "42P01";
}

// ============================================================
// 1. Tambah Pelanggan (SANCI-direct, admin only)
// ============================================================

export async function createCustomerAdmin(input: {
  fullName: string;
  phone: string;
  address?: string;
  email?: string;
  sourceId?: string | null;
  salesStaffId?: string | null;
  clientRequestId: string;
}): Promise<ActionResult<{ id: string; customerCode: string | null }>> {
  const m = await getAdminMessages();
  const PESAN = pesan(m);
  const supabase = await createClient();

  const fullName = input.fullName.trim();
  if (!fullName) return { error: { field: "full_name", message: m.admin.customerNameRequired } };

  const normalized = normalizePhoneID(input.phone);
  if (!normalized) return { error: { field: "phone", message: m.admin.customerPhoneInvalid } };

  const sourceId = input.sourceId || null;
  const salesStaffId = input.salesStaffId || null;
  // Berdua terisi atau berdua kosong — "separuh skema" bukan pilihan yang
  // valid (mirip aturan trigger fn_set_customer_code di 0018: separuh tidak
  // pernah menghasilkan kode, tapi di sini kita tolak LEBIH AWAL supaya
  // admin tahu kenapa, bukan diam-diam menyimpan tanpa kode).
  if ((sourceId && !salesStaffId) || (!sourceId && salesStaffId)) {
    return { error: { field: "source_id", message: m.admin.customerSourceSalesPairRequired } };
  }

  const email = input.email?.trim() || null;
  const address = input.address?.trim() || null;

  const { data: existing, error: existingErr } = await supabase
    .from("customers")
    .select("id, customer_code")
    .eq("client_request_id", input.clientRequestId)
    .maybeSingle();
  if (existingErr) {
    if (isMissingTable(existingErr.code)) return { error: { message: m.admin.customerCodeMigrationMsg } };
    return { error: { message: PESAN.serverSibuk } };
  }
  if (existing) {
    revalidatePath("/admin/pelanggan");
    return { data: { id: existing.id, customerCode: existing.customer_code } };
  }

  const written = await safeWrite(
    supabase
      .from("customers")
      .insert({
        full_name: fullName,
        phone: input.phone.trim(),
        phone_normalized: normalized,
        address,
        email,
        source_id: sourceId,
        sales_staff_id: salesStaffId,
        created_via_partner_id: null,
        created_via_branch_id: null,
        client_request_id: input.clientRequestId,
      })
      .select("id, customer_code")
      .single()
  );

  const recheck = () =>
    confirmByRequestId(
      supabase
        .from("customers")
        .select("id, customer_code")
        .eq("client_request_id", input.clientRequestId)
        .maybeSingle()
    );

  if (!written.ok) {
    if (written.reason === "db") {
      if (isMissingTable(written.code)) return { error: { message: m.admin.customerCodeMigrationMsg } };
      if (isRequestIdConflict(written)) {
        const again = await recheck();
        if (again.status === "found") {
          revalidatePath("/admin/pelanggan");
          return { data: { id: again.data.id, customerCode: again.data.customer_code } };
        }
        return { error: { message: PESAN.belumPastiBaru } };
      }
      return { error: { message: PESAN.serverSibuk } };
    }
    const check = await recheck();
    if (check.status === "found") {
      revalidatePath("/admin/pelanggan");
      return { data: { id: check.data.id, customerCode: check.data.customer_code } };
    }
    return {
      error: { message: check.status === "absent" ? PESAN.belumTersimpan : PESAN.belumPastiBaru },
    };
  }

  revalidatePath("/admin/pelanggan");
  return { data: { id: written.data.id, customerCode: written.data.customer_code } };
}

// ============================================================
// 2. Master "Kode Sumber Tamu" (customer_sources)
// ============================================================

export async function createCustomerSource(input: {
  code: string;
  label: string;
  clientRequestId: string;
}): Promise<ActionResult<{ id: string }>> {
  const m = await getAdminMessages();
  const PESAN = pesan(m);
  const supabase = await createClient();
  const code = normalizeShortCode(input.code);
  const label = input.label.trim();

  if (!SHORT_CODE_RE.test(code)) {
    return { error: { field: "code", message: m.admin.sourceCodeInvalid } };
  }
  if (!label) return { error: { field: "label", message: m.admin.sourceLabelRequired } };

  const { data: existing, error: existingErr } = await supabase
    .from("customer_sources")
    .select("id")
    .eq("client_request_id", input.clientRequestId)
    .maybeSingle();
  if (existingErr) {
    if (isMissingTable(existingErr.code)) return { error: { message: m.admin.customerCodeMigrationMsg } };
    return { error: { message: PESAN.serverSibuk } };
  }
  if (existing) {
    revalidatePath("/admin/pelanggan");
    return { data: { id: existing.id } };
  }

  const written = await safeWrite(
    supabase
      .from("customer_sources")
      .insert({ code, label, client_request_id: input.clientRequestId })
      .select("id")
      .single()
  );

  const recheck = () =>
    confirmByRequestId(
      supabase
        .from("customer_sources")
        .select("id")
        .eq("client_request_id", input.clientRequestId)
        .maybeSingle()
    );

  if (!written.ok) {
    if (written.reason === "db") {
      if (isMissingTable(written.code)) return { error: { message: m.admin.customerCodeMigrationMsg } };
      if (isRequestIdConflict(written)) {
        const again = await recheck();
        if (again.status === "found") {
          revalidatePath("/admin/pelanggan");
          return { data: { id: again.data.id } };
        }
        return { error: { message: PESAN.belumPastiBaru } };
      }
      if (written.code === "23505") {
        return { error: { field: "code", message: m.admin.sourceCodeTaken } };
      }
      return { error: { message: PESAN.serverSibuk } };
    }
    const check = await recheck();
    if (check.status === "found") {
      revalidatePath("/admin/pelanggan");
      return { data: { id: check.data.id } };
    }
    return { error: { message: check.status === "absent" ? PESAN.belumTersimpan : PESAN.belumPastiBaru } };
  }

  revalidatePath("/admin/pelanggan");
  return { data: { id: written.data.id } };
}

export async function updateCustomerSource(
  id: string,
  input: { code: string; label: string }
): Promise<ActionResult<true>> {
  const m = await getAdminMessages();
  const PESAN = pesan(m);
  const supabase = await createClient();
  const code = normalizeShortCode(input.code);
  const label = input.label.trim();

  if (!SHORT_CODE_RE.test(code)) {
    return { error: { field: "code", message: m.admin.sourceCodeInvalid } };
  }
  if (!label) return { error: { field: "label", message: m.admin.sourceLabelRequired } };

  const saved = await safeWrite(
    supabase.from("customer_sources").update({ code, label }).eq("id", id).select("id").single()
  );
  if (!saved.ok) {
    if (saved.reason === "db") {
      if (isMissingTable(saved.code)) return { error: { message: m.admin.customerCodeMigrationMsg } };
      if (saved.code === "23505") {
        return { error: { field: "code", message: m.admin.sourceCodeTaken } };
      }
      return { error: { message: PESAN.serverSibuk } };
    }
    return { error: { message: PESAN.belumPastiUbah } };
  }

  revalidatePath("/admin/pelanggan");
  return { data: true };
}

export async function setCustomerSourceStatus(
  id: string,
  status: "ACTIVE" | "INACTIVE"
): Promise<ActionResult<true>> {
  const m = await getAdminMessages();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_sources")
    .update({ status })
    .eq("id", id)
    .select("id")
    .single();
  if (error || !data) {
    if (isMissingTable(error?.code)) return { error: { message: m.admin.customerCodeMigrationMsg } };
    return { error: { message: m.admin.sourceStatusChangeFailed } };
  }

  revalidatePath("/admin/pelanggan");
  return { data: true };
}

// ============================================================
// 3. Master "Kode Sales" SANCI internal (sanci_sales_staff)
// ============================================================

export async function createSalesStaff(input: {
  code: string;
  name: string;
  clientRequestId: string;
}): Promise<ActionResult<{ id: string }>> {
  const m = await getAdminMessages();
  const PESAN = pesan(m);
  const supabase = await createClient();
  const code = normalizeShortCode(input.code);
  const name = input.name.trim();

  if (!SHORT_CODE_RE.test(code)) {
    return { error: { field: "code", message: m.admin.salesCodeInvalid } };
  }
  if (!name) return { error: { field: "name", message: m.admin.salesNameRequired } };

  const { data: existing, error: existingErr } = await supabase
    .from("sanci_sales_staff")
    .select("id")
    .eq("client_request_id", input.clientRequestId)
    .maybeSingle();
  if (existingErr) {
    if (isMissingTable(existingErr.code)) return { error: { message: m.admin.customerCodeMigrationMsg } };
    return { error: { message: PESAN.serverSibuk } };
  }
  if (existing) {
    revalidatePath("/admin/pelanggan");
    return { data: { id: existing.id } };
  }

  const written = await safeWrite(
    supabase
      .from("sanci_sales_staff")
      .insert({ code, name, client_request_id: input.clientRequestId })
      .select("id")
      .single()
  );

  const recheck = () =>
    confirmByRequestId(
      supabase
        .from("sanci_sales_staff")
        .select("id")
        .eq("client_request_id", input.clientRequestId)
        .maybeSingle()
    );

  if (!written.ok) {
    if (written.reason === "db") {
      if (isMissingTable(written.code)) return { error: { message: m.admin.customerCodeMigrationMsg } };
      if (isRequestIdConflict(written)) {
        const again = await recheck();
        if (again.status === "found") {
          revalidatePath("/admin/pelanggan");
          return { data: { id: again.data.id } };
        }
        return { error: { message: PESAN.belumPastiBaru } };
      }
      if (written.code === "23505") {
        return { error: { field: "code", message: m.admin.salesCodeTaken } };
      }
      return { error: { message: PESAN.serverSibuk } };
    }
    const check = await recheck();
    if (check.status === "found") {
      revalidatePath("/admin/pelanggan");
      return { data: { id: check.data.id } };
    }
    return { error: { message: check.status === "absent" ? PESAN.belumTersimpan : PESAN.belumPastiBaru } };
  }

  revalidatePath("/admin/pelanggan");
  return { data: { id: written.data.id } };
}

export async function updateSalesStaff(
  id: string,
  input: { code: string; name: string }
): Promise<ActionResult<true>> {
  const m = await getAdminMessages();
  const PESAN = pesan(m);
  const supabase = await createClient();
  const code = normalizeShortCode(input.code);
  const name = input.name.trim();

  if (!SHORT_CODE_RE.test(code)) {
    return { error: { field: "code", message: m.admin.salesCodeInvalid } };
  }
  if (!name) return { error: { field: "name", message: m.admin.salesNameRequired } };

  const saved = await safeWrite(
    supabase.from("sanci_sales_staff").update({ code, name }).eq("id", id).select("id").single()
  );
  if (!saved.ok) {
    if (saved.reason === "db") {
      if (isMissingTable(saved.code)) return { error: { message: m.admin.customerCodeMigrationMsg } };
      if (saved.code === "23505") {
        return { error: { field: "code", message: m.admin.salesCodeTaken } };
      }
      return { error: { message: PESAN.serverSibuk } };
    }
    return { error: { message: PESAN.belumPastiUbah } };
  }

  revalidatePath("/admin/pelanggan");
  return { data: true };
}

export async function setSalesStaffStatus(
  id: string,
  status: "ACTIVE" | "INACTIVE"
): Promise<ActionResult<true>> {
  const m = await getAdminMessages();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sanci_sales_staff")
    .update({ status })
    .eq("id", id)
    .select("id")
    .single();
  if (error || !data) {
    if (isMissingTable(error?.code)) return { error: { message: m.admin.customerCodeMigrationMsg } };
    return { error: { message: m.admin.salesStatusChangeFailed } };
  }

  revalidatePath("/admin/pelanggan");
  return { data: true };
}

// ============================================================
// 4. Halaman daftar pelanggan (server-side search + muat lebih banyak)
// ============================================================

/** Idiom verifikasi admin yang sama dengan catalog-actions.ts /
 *  actions-create-order.ts — untuk action baca-saja ini semua kegagalan
 *  cukup dipetakan ke "error" (LESSONS #10: error DB ≠ "bukan admin"
 *  ditangani dengan tidak menyimpulkan apa pun dari kegagalan). Penegak
 *  sesungguhnya tetap RLS (customers hanya terbaca sesi yang berhak). */
async function isAdminSession(supabase: SupabaseServerClient): Promise<boolean> {
  const { data: sesi, error: sesiErr } = await supabase.auth.getUser();
  if (sesiErr || !sesi?.user) return false;
  const { data: adminRow, error: adminErr } = await supabase
    .from("platform_admins")
    .select("auth_user_id")
    .eq("auth_user_id", sesi.user.id)
    .maybeSingle();
  if (adminErr || !adminRow) return false;
  return true;
}

/** Baris pelanggan layar /admin/pelanggan — persis kolom yang dirender
 *  tabelnya. address/email SENGAJA tidak ikut: halaman itu tidak
 *  menampilkannya (catatan lama page.tsx — jangan membayar kolom yang
 *  tidak dipakai untuk setiap baris). */
export type AdminCustomerRow = {
  id: string;
  full_name: string;
  phone: string;
  customer_code: string | null;
  source_id: string | null;
  sales_staff_id: string | null;
  created_via_partner_id: string | null;
  created_via_branch_id: string | null;
  created_at: string;
};

export type AdminPelangganPageOutcome =
  | { status: "ok"; customers: AdminCustomerRow[]; hasMore: boolean }
  | { status: "error" };

/**
 * Satu halaman daftar pelanggan — bentuk kontrak lib/catalog-query.ts
 * (search dieksekusi DATABASE, halaman 60, hasMore lewat baris sentinel),
 * meniru getProdukPageAdmin. Field `category`/`withCategories`/`withPrices`
 * pada input bersama TIDAK berarti di sini (pelanggan tidak punya dimensi
 * itu) dan diabaikan.
 *
 * Beda sengaja dari kontrak katalog: urutannya created_at TERBARU dulu
 * (semantik lama layar ini — pelanggan baru langsung terlihat di atas),
 * dengan tiebreak `id` supaya offset-paging deterministik (prinsip #2
 * kontrak; created_at kembar tidak boleh membuat baris melompat/menduakan
 * di perbatasan halaman).
 *
 * source_id/sales_staff_id (migrasi 0018) BISA belum ada sebagai kolom
 * (LESSONS #12) — coba SELECT lebar dulu, turun ke SELECT sempit kalau
 * 42703, sama seperti batch pertama di page.tsx.
 */
export async function getPelangganPageAdmin(input: CatalogPageInput): Promise<AdminPelangganPageOutcome> {
  const supabase = await createClient();
  if (!(await isAdminSession(supabase))) return { status: "error" };

  const norm = normalizeCatalogPageInput(input);
  // Semantik pencarian lama dipertahankan: nama ATAU telepon ATAU kode
  // (dulu includes() huruf kecil di memori; ilike = substring tanpa peduli
  // kapital, karakter LIKE di-escape harfiah — lib/catalog-query.ts).
  const orFilter = catalogIlikeOrFilter(norm.q, ["full_name", "phone", "customer_code"]);
  const range = catalogPageRange(norm.offset);

  let wide = supabase
    .from("customers")
    .select(
      "id, full_name, phone, customer_code, source_id, sales_staff_id, created_via_partner_id, created_via_branch_id, created_at"
    );
  if (orFilter) wide = wide.or(orFilter);
  const { data: rows, error } = await wide
    .order("created_at", { ascending: false })
    .order("id")
    .range(range.from, range.to);

  if (!error) {
    const page = finishCatalogPage((rows ?? []) as AdminCustomerRow[]);
    return { status: "ok", customers: page.products, hasMore: page.hasMore };
  }
  if (error.code !== "42703") return { status: "error" };

  // 0018 belum dijalankan (kolom tak dikenal) — daftar dasar tetap jalan.
  let narrow = supabase
    .from("customers")
    .select("id, full_name, phone, customer_code, created_via_partner_id, created_via_branch_id, created_at");
  if (orFilter) narrow = narrow.or(orFilter);
  const { data: narrowRows, error: narrowErr } = await narrow
    .order("created_at", { ascending: false })
    .order("id")
    .range(range.from, range.to);
  if (narrowErr) return { status: "error" };

  const page = finishCatalogPage(
    ((narrowRows ?? []) as Omit<AdminCustomerRow, "source_id" | "sales_staff_id">[]).map((c) => ({
      ...c,
      source_id: null,
      sales_staff_id: null,
    }))
  );
  return { status: "ok", customers: page.products, hasMore: page.hasMore };
}
