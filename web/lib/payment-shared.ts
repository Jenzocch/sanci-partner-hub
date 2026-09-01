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

/**
 * Label satu status pembayaran. Dulu peta ini ditulis DUA kali (kartu
 * pembayaran sisi admin dan sisi cabang); sejak filter "Bayar" masuk ke
 * kedua daftar pesanan (2026-09-01) penulisnya jadi empat, jadi petanya
 * pindah ke sini — sama polanya dengan orderStatusLabel di
 * lib/orders-shared.ts (ATURAN FILE PESAN #5: teks tetap di common.ts,
 * fungsi ini hanya memilih kunci mana yang dipakai).
 */
export function customerPaymentStatusLabel(
  m: { common: { customerPaymentStatusUnknown: string; customerPaymentStatusBelum: string; customerPaymentStatusDp: string; customerPaymentStatusLunas: string } },
  s: CustomerPaymentStatus
): string {
  switch (s) {
    case "UNKNOWN":
      return m.common.customerPaymentStatusUnknown;
    case "BELUM":
      return m.common.customerPaymentStatusBelum;
    case "DP":
      return m.common.customerPaymentStatusDp;
    case "LUNAS":
      return m.common.customerPaymentStatusLunas;
  }
}

/**
 * Status kirim turunan untuk DAFTAR pesanan (/admin/orders dan
 * /cabang/pesanan) — tiga nilai, bukan lima seperti kolom "Status Kirim" di
 * lembar Google Sheets: membedakan "DO sebagian" dari "DO penuh" menuntut
 * kuantitas order_items DAN order_document_items untuk SETIAP baris yang
 * tampil, beban yang tidak sepadan untuk sebuah daftar. Pertanyaan harian
 * ("mana yang belum dikirim") sudah terjawab tiga nilai ini; rinciannya ada
 * di lembar Sheets.
 */
export type ShippingState = "BELUM_DO" | "SUDAH_DO" | "DITERIMA";

/**
 * URUTAN PEMERIKSAAN PENTING dan dipakai IDENTIK oleh kedua daftar:
 *   1. sudah ditandai diterima pelanggan (partner_orders.delivered_at, 0023)
 *      → DITERIMA — menang atas keberadaan DO, karena barang yang sudah
 *      sampai tidak lagi menarik dijawab "sudah ada DO".
 *   2. punya minimal satu dokumen DO (order_documents, 0016) → SUDAH_DO.
 *   3. selain itu → BELUM_DO.
 *
 * `hasDo`/`delivered` adalah HIMPUNAN id yang benar-benar terbaca. Kalau
 * pembacaannya gagal, pemanggil WAJIB mematikan filternya dan berkata
 * begitu — JANGAN memanggil fungsi ini dengan himpunan kosong lalu
 * menyimpulkan "semua BELUM_DO" (LESSONS #10).
 */
export function shippingState(orderId: string, hasDo: Set<string>, delivered: Set<string>): ShippingState {
  if (delivered.has(orderId)) return "DITERIMA";
  if (hasDo.has(orderId)) return "SUDAH_DO";
  return "BELUM_DO";
}
