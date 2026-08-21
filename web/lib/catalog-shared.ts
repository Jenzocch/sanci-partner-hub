// Kontrak bersama Katalog Produk SANCI (Phase 2 slice 5) — satu-satunya
// sumber kebenaran untuk tipe & label. Keputusan owner (2026-08-17):
//   - Stok hanya STATUS (Tersedia/Terbatas/Habis) — angka nyata menunggu
//     sinkronisasi gudang di fase depan; angka basi lebih menyesatkan.
//   - Visibilitas katalog di-set per PARTNER oleh SANCI (buka/tutup).
//   - TANPA harga sama sekali — penawaran disampaikan SANCI secara manual.

import type { CommonMessages } from "./i18n/messages";

export type StockStatus = "AVAILABLE" | "LIMITED" | "OUT_OF_STOCK";

/**
 * Label status stok. Teksnya hidup di lib/i18n/messages/common.ts. Dipakai
 * dari `/cabang/**` DAN `/admin/**`, dan cuma pernah membaca `common` — jadi
 * tipenya `{ common: CommonMessages }`, cocok baik dengan `CabangMessages`
 * maupun `AdminMessages` tanpa konversi di titik panggil (server: `await
 * getCabangMessages()`/`getAdminMessages()`, client: `useCabangMessages()`/
 * `useAdminMessages()`).
 */
export function stockStatusLabel(m: { common: CommonMessages }, s: StockStatus): string {
  if (s === "AVAILABLE") return m.common.stockAvailable;
  if (s === "LIMITED") return m.common.stockLimited;
  return m.common.stockOutOfStock;
}

/**
 * Kelas chip semantik per status stok (STYLE CONTRACT §2b — chip taxonomy).
 * `.chip.stock` menambahkan titik/dot di depan supaya warna TIDAK PERNAH
 * jadi satu-satunya penanda (aksesibilitas) dan supaya chip stok tidak
 * pernah terlihat sama seperti chip status entitas (ACTIVE/INACTIVE dst)
 * yang kebetulan memakai warna yang sama — dua family class yang berbeda.
 */
export const STOCK_STATUS_CHIP: Record<StockStatus, string> = {
  AVAILABLE: "chip stock ok",
  LIMITED: "chip stock warn",
  OUT_OF_STOCK: "chip stock bad",
};

/**
 * CATATAN FOTO PRODUK — kenapa `<img>` biasa, bukan `next/image`.
 *
 * Beberapa berkas (produk-list-client.tsx, kalkulator-client.tsx,
 * admin/produk/product-photo.tsx, package-items-client.tsx) mematikan aturan
 * `@next/next/no-img-element` dan menunjuk ke catatan ini, jadi alasannya
 * ditulis SEKALI di sini alih-alih diulang di setiap tempat:
 *
 *  - `photo_url` menunjuk ke bucket publik Supabase (`product-photos`), bukan
 *    aset lokal di /public. `next/image` untuk host luar butuh
 *    `images.remotePatterns` di next.config.ts, dan setiap permintaan lalu
 *    melewati pengoptimal gambar Vercel (kuota + biaya per gambar).
 *  - Fotonya SUDAH dikompresi saat diunggah dengan ukuran seragam (PRESET_
 *    PRODUK: sisi panjang 1280px, WebP q0.82) — itu memang strategi proyek
 *    ini: kompresi sekali di hulu, lalu disajikan apa adanya lewat CDN
 *    bucket. Jadi manfaat utama `next/image` (mengecilkan berkas raksasa)
 *    sebagian besar sudah didapat di tempat lain.
 *
 * Yang TETAP jadi kewajiban setiap pemakai, karena `<img>` tidak
 * memberikannya gratis seperti `next/image`:
 *  - `loading="lazy"` di SETIAP daftar/grid (audit 2026-08-21 menemukan
 *    /admin/produk memuat 169 foto sekaligus karena atribut ini terlewat),
 *  - ruang yang sudah dipesan lebih dulu (`aspect-ratio` atau width+height
 *    tetap pada pembungkusnya) supaya tata letak tidak melompat,
 *  - penanganan `onError` → placeholder, bukan ikon rusak bawaan browser.
 *
 * Catatan terbuka: thumbnail 48px di package-items-client.tsx tetap
 * mengunduh sumber 1280px. Memperbaikinya perlu varian ukuran (entah lewat
 * `next/image` atau turunan kedua saat unggah) — keputusan produk/biaya,
 * bukan sekadar perapian, jadi sengaja tidak diputuskan sepihak.
 */

export type ProductStatus = "ACTIVE" | "INACTIVE";

export interface SanciProductRow {
  id: string;
  name: string;
  code: string | null;
  category: string | null;
  description: string | null;
  photo_url: string | null;
  stock_status: StockStatus;
  status: ProductStatus;
  created_at: string;
  updated_at: string;
}
