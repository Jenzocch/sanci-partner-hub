// Kontrak bersama Phase 2 (Customer & Partner Order) — satu-satunya sumber
// kebenaran untuk normalisasi telepon dan tipe baris. Server Action WAJIB
// memakai normalizePhoneID di sisi server; jangan menduplikasi logika ini
// di SQL atau komponen (prinsip single source of truth, LESSONS).

/**
 * Normalisasi nomor telepon Indonesia ke bentuk kanonik "62...".
 * "0812...", "812...", "+62 812...", "62 812..." → "62812...".
 * Mengembalikan null jika input tidak bisa dianggap nomor valid
 * (terlalu pendek/panjang setelah dibersihkan).
 */
export function normalizePhoneID(raw: string): string | null {
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return null;
  let d = digits;
  if (d.startsWith("62")) {
    // "620812..." = orang mengetik +62 lalu tetap menulis 0 — buang 0-nya
    if (d.startsWith("620")) d = "62" + d.slice(3);
  } else if (d.startsWith("0")) {
    d = "62" + d.slice(1);
  } else if (d.startsWith("8")) {
    d = "62" + d;
  } else {
    return null; // bukan pola nomor Indonesia yang dikenal
  }
  if (d.length < 10 || d.length > 15) return null;
  return d;
}

/** Format tampilan: "628123456789" → "0812-3456-789" (potongan 4 digit). */
export function displayPhoneID(normalized: string): string {
  if (!normalized.startsWith("62")) return normalized;
  const local = "0" + normalized.slice(2);
  return local.replace(/(\d{4})(?=\d)/g, "$1-");
}

export type OrderStatus = "REGISTERED" | "CANCELLED";

/** Label status dalam Bahasa Indonesia — jangan hardcode string status di UI. */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  REGISTERED: "Terdaftar",
  CANCELLED: "Dibatalkan",
};

export interface CustomerRow {
  id: string;
  full_name: string;
  phone: string;
  phone_normalized: string;
  whatsapp: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  notes: string | null;
  created_via_partner_id: string | null;
  created_via_branch_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PartnerOrderRow {
  id: string;
  order_number: string;
  customer_id: string;
  partner_id: string;
  branch_id: string;
  partner_sales_staff_id: string | null;
  partner_pic_staff_id: string | null;
  package_name: string;
  status: OrderStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * true jika error Supabase berarti "tabel belum ada" (migration 0004 belum
 * dijalankan di production). Halaman WAJIB menurunkan diri dengan pesan
 * jelas, bukan crash — kode boleh naik duluan sebelum SQL (LESSONS: partial
 * deployment tidak boleh memecahkan halaman).
 */
export function isMissingTableError(err: { code?: string } | null): boolean {
  return !!err && err.code === "42P01";
}
