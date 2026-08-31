/**
 * Formula status pembayaran pelanggan (partner_orders.customer_total_amount /
 * customer_paid_amount, migrasi 0026) — SATU-SATUNYA sumber kebenaran untuk
 * menurunkan status dari dua angka mentah. Dipakai kartu "Pembayaran
 * Pelanggan" di /cabang/pesanan/[orderId] DAN /admin/orders/[orderId] —
 * kedua sisi WAJIB memanggil fungsi ini, tidak menghitung ulang sendiri
 * (satu rumus, satu tempat — sama semangatnya dengan computeChainFinal di
 * lib/calculator-shared.ts).
 *
 * CATATAN UNTUK Code.gs (Google Apps Script kantor SANCI): kalau suatu saat
 * skrip itu perlu menurunkan status yang sama dari customer_total_amount/
 * customer_paid_amount, rumusnya WAJIB DICERMINKAN PERSIS seperti di bawah
 * — jangan menulis ulang logikanya secara independen di sana, supaya kedua
 * sisi tidak pernah menampilkan status yang berbeda untuk pesanan yang sama.
 */

export type CustomerPaymentStatus = "UNKNOWN" | "BELUM" | "DP" | "LUNAS";

/**
 * Rumus (urutan pemeriksaan penting):
 *   1. `total == null`      → UNKNOWN — belum dicatat sama sekali, bukan "belum bayar".
 *   2. `paid >= total`      → LUNAS — TERMASUK kasus total = 0 (paid 0 >= total 0):
 *      pesanan bernilai Rp 0 (mis. seluruhnya diskon) dianggap lunas begitu
 *      dicatat, bukan menunggu pembayaran yang memang tidak akan pernah ada.
 *   3. `paid > 0`           → DP — sudah ada pembayaran tapi belum menutupi total.
 *   4. selain itu (`paid === 0` dan `total > 0`) → BELUM.
 */
export function customerPaymentStatus(total: number | null, paid: number): CustomerPaymentStatus {
  if (total == null) return "UNKNOWN";
  if (paid >= total) return "LUNAS";
  if (paid > 0) return "DP";
  return "BELUM";
}

/** Sisa tagihan. `null` kalau total belum dicatat (tidak ada "sisa" yang
 *  berarti). NEGATIF saat kelebihan bayar — DISENGAJA dan diikuti persis
 *  oleh Code.gs (remainingCustomerForSheet_): untuk staf, minus adalah
 *  sinyal "kembalikan selisihnya", bukan angka yang harus disembunyikan.
 *  Beda dari fn_customer_order_view (0023) yang meng-clamp ke 0 karena
 *  pembacanya PELANGGAN. */
export function customerPaymentRemaining(total: number | null, paid: number): number | null {
  return total == null ? null : total - paid;
}

/**
 * Kelas chip semantik (STYLE CONTRACT §2b — family PIL POLOS, bukan
 * ACTIVE/INACTIVE: status pembayaran adalah nilai bisnis turunan, bukan
 * status keberadaan entitas — sama alasannya dengan ORDER_STATUS_CHIP di
 * lib/orders-shared.ts).
 */
export const CUSTOMER_PAYMENT_STATUS_CHIP: Record<CustomerPaymentStatus, string> = {
  UNKNOWN: "chip neutral",
  BELUM: "chip bad",
  DP: "chip accent",
  LUNAS: "chip ok",
};
