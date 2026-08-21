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
import type { Messages } from "./i18n/messages";

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

export type FulfillmentPath = "DIRECT_DELIVERY" | "SHOWROOM_VISIT";

/**
 * Label pendek untuk chip/kolom tabel.
 *
 * Teksnya hidup di lib/i18n/messages/common.ts, bukan di sini — halaman WAJIB
 * memanggil fungsi ini dengan `Messages` miliknya (server: `await
 * getMessages()`, client: `useMessages()`). Jangan pernah menulis ulang
 * labelnya di komponen.
 */
export function fulfillmentLabel(m: Messages, p: FulfillmentPath): string {
  return p === "DIRECT_DELIVERY" ? m.common.fulfillmentDirect : m.common.fulfillmentShowroom;
}

/** Penjelasan lengkap untuk pilihan di form (bahasa pegawai toko sehari-hari). */
export function fulfillmentDesc(m: Messages, p: FulfillmentPath): string {
  return p === "DIRECT_DELIVERY"
    ? m.common.fulfillmentDirectDesc
    : m.common.fulfillmentShowroomDesc;
}

/** Format Rupiah tanpa sen: 1500000 → "Rp 1.500.000". */
export function formatIDR(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Parse input uang bebas format ("1.500.000", "Rp 1500000") → angka atau null. */
export function parseIDRInput(raw: string): number | null {
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  if (!Number.isFinite(n) || n < 0 || n > 99_999_999_999_999) return null;
  return n;
}

/** Label status pesanan — jangan pernah menampilkan kode mentah di UI. */
export function orderStatusLabel(m: Messages, s: OrderStatus): string {
  return s === "REGISTERED" ? m.common.orderStatusRegistered : m.common.orderStatusCancelled;
}

/**
 * Kelas chip untuk status pesanan (STYLE CONTRACT §2b — chip taxonomy).
 * Sengaja memakai family PIL POLOS (`.chip.ok`/`.chip.neutral`), BUKAN family
 * status entitas (`.chip.ACTIVE`/`.chip.SUSPENDED`): §2b menyebut "order
 * status via status-badge.tsx" sebagai contoh pil polos, dan sebuah pesanan
 * yang REGISTERED/CANCELLED bukan entitas yang Aktif/Ditangguhkan — di
 * /admin/orders kedua jenis chip itu bisa muncul pada baris yang SAMA
 * (status pesanan di satu kolom, status partner di kolom lain), persis
 * kerancuan yang taksonomi ini dibuat untuk menghilangkan.
 *
 * Sama seperti STOCK_STATUS_CHIP di lib/catalog-shared.ts: JANGAN tulis
 * tangan string kelasnya di halaman, import konstanta ini — supaya sisi admin
 * dan sisi cabang tidak pernah lagi menggambar hal yang sama dengan dua
 * bahasa visual yang berbeda.
 */
export const ORDER_STATUS_CHIP: Record<OrderStatus, string> = {
  REGISTERED: "chip ok",
  CANCELLED: "chip neutral",
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
