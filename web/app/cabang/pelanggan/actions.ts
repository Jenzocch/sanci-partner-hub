"use server";

/**
 * Server Actions untuk Ubah Pelanggan (Phase 2 slice 3 — Customer Edit,
 * SPEC §33–35). Prinsip di sini sama dengan web/app/cabang/pesanan/actions.ts
 * (lihat komentar di sana) — dua yang paling penting untuk file ini:
 *
 *   - phone_normalized SELALU dihitung ulang di server dari nomor baru,
 *     tidak pernah percaya nilai dari client (SPEC §8).
 *   - RLS boleh menolak UPDATE dengan cara DIAM-DIAM (0 baris kembali, bukan
 *     error) kalau migrasi 0008 (policy c_partner_update) belum dijalankan
 *     atau pelanggan ini bukan milik cabang kita — itu WAJIB dibaca sebagai
 *     gagal, bukan sukses (LESSONS #7, safeWrite "no row returned").
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { PESAN, safeWrite } from "@/lib/safe-write";
import { isMissingTableError, normalizePhoneID } from "@/lib/orders-shared";

type ActionError = { field?: string; message: string };

type Identity = { partnerId: string; branchId: string; userId: string };
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Hasil dipecah tiga (bukan Identity | null) supaya error query partner_users
 * tidak disamarkan jadi "sesi tidak valid" — lihat lesson yang sama dengan
 * getIdentity di web/app/cabang/pesanan/actions.ts.
 */
type IdentityOutcome =
  | { status: "ok"; identity: Identity }
  | { status: "no-user" }
  | { status: "load-error" };

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

function identityErrorMessage(outcome: Extract<IdentityOutcome, { status: "no-user" | "load-error" }>): string {
  return outcome.status === "load-error"
    ? "Data akun gagal dimuat — coba lagi."
    : "Sesi tidak valid. Muat ulang halaman.";
}

const BELUM_DIIZINKAN_MSG =
  "Belum diizinkan — migrasi database belum dijalankan atau Anda tidak punya akses.";

export type UpdateCustomerResult = { data: { updated: true } } | { error: ActionError };

export async function updateCustomer(input: {
  customerId: string;
  fullName: string;
  phone: string;
  whatsapp?: string;
  address?: string;
  city?: string;
  province?: string;
  notes?: string;
}): Promise<UpdateCustomerResult> {
  const supabase = await createClient();
  const idOutcome = await getIdentity(supabase);
  if (idOutcome.status !== "ok") return { error: { message: identityErrorMessage(idOutcome) } };

  const fullName = input.fullName.trim();
  if (!fullName) return { error: { field: "full_name", message: "Nama lengkap wajib diisi." } };
  const normalized = normalizePhoneID(input.phone);
  if (!normalized) return { error: { field: "phone", message: "Nomor telepon tidak valid." } };

  // Perubahan telepon dicatat DB lewat trigger audit (CUSTOMER_PHONE_CHANGED,
  // SPEC §35) begitu kolomnya beda dari sebelumnya — tidak ada yang perlu
  // dikirim manual dari sini selain nilai barunya.
  const written = await safeWrite(
    supabase
      .from("customers")
      .update({
        full_name: fullName,
        phone: input.phone.trim(),
        phone_normalized: normalized,
        whatsapp: input.whatsapp?.trim() || null,
        address: input.address?.trim() || null,
        city: input.city?.trim() || null,
        province: input.province?.trim() || null,
        notes: input.notes?.trim() || null,
      })
      .eq("id", input.customerId)
      .select("id")
      .maybeSingle()
  );

  if (!written.ok) {
    if (written.reason === "unconfirmed") {
      return { error: { message: PESAN.belumPastiUbah } };
    }
    if (isMissingTableError({ code: written.code })) {
      return {
        error: { message: "Modul Pelanggan belum aktif di database (migrasi belum dijalankan). Hubungi SANCI Admin." },
      };
    }
    // "no row returned" = RLS menolak DIAM-DIAM (policy UPDATE migrasi 0008
    // belum ada, atau pelanggan ini bukan yang boleh kita ubah). Jangan pernah
    // dibaca sebagai sukses (LESSONS #7).
    if (written.detail === "no row returned") {
      return { error: { message: BELUM_DIIZINKAN_MSG } };
    }
    return { error: { message: PESAN.serverSibuk } };
  }

  revalidatePath(`/cabang/pelanggan/${input.customerId}`);
  revalidatePath("/cabang/pelanggan");
  return { data: { updated: true } };
}
