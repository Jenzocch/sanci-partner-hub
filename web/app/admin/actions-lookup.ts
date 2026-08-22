"use server";

import { createClient } from "@/lib/supabase/server";
import { confirmByRequestId, type LookupResult } from "@/lib/safe-write";

// Daftar putih: hanya tabel yang memang punya kolom idempotency yang boleh
// ditanyakan lewat sini. Batas keamanan sebenarnya tetap RLS — ini hanya
// mencegah nama tabel sembarangan dikirim dari browser.
const TABLES = {
  partner: "partners",
  branch: "partner_branches",
  staff: "partner_staff",
  package: "partner_packages",
  packageItem: "partner_package_items",
  product: "sanci_products",
  internalNote: "order_internal_notes",
  // Dipakai form "Buat Pesanan" admin: pemanggil mengirim nomor permintaan
  // TURUNAN `${rid}:order` / `${rid}:customer` (sufiks yang sama dengan jalur
  // cabang di cabang/pesanan/actions.ts) — bukan rid mentah.
  order: "partner_orders",
  customer: "customers",
  customerSource: "customer_sources",
  salesStaff: "sanci_sales_staff",
} as const;

export type LookupEntity = keyof typeof TABLES;

/**
 * Dipakai saat respons penyimpanan hilang di jaringan lemah: menanyakan apakah
 * baris dengan nomor permintaan ini benar-benar sudah masuk (SPEC §61).
 * Jawabannya menentukan apakah pengguna boleh diberi tahu "tersimpan" atau tidak.
 */
export async function lookupByRequestId(
  entity: LookupEntity,
  clientRequestId: string
): Promise<LookupResult> {
  const table = TABLES[entity];
  if (!table) return { unknown: true };

  const supabase = await createClient();
  const res = await confirmByRequestId(
    supabase.from(table).select("id").eq("client_request_id", clientRequestId).maybeSingle()
  );
  if (res.status === "found") return { found: true, id: res.data.id };
  if (res.status === "absent") return { found: false };
  return { unknown: true };
}
