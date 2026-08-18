// Kontrak bersama Katalog Produk SANCI (Phase 2 slice 5) — satu-satunya
// sumber kebenaran untuk tipe & label. Keputusan owner (2026-08-17):
//   - Stok hanya STATUS (Tersedia/Terbatas/Habis) — angka nyata menunggu
//     sinkronisasi gudang di fase depan; angka basi lebih menyesatkan.
//   - Visibilitas katalog di-set per PARTNER oleh SANCI (buka/tutup).
//   - TANPA harga sama sekali — penawaran disampaikan SANCI secara manual.

import type { Messages } from "./i18n/messages";

export type StockStatus = "AVAILABLE" | "LIMITED" | "OUT_OF_STOCK";

/**
 * Label status stok. Teksnya hidup di lib/i18n/messages/common.ts — halaman
 * memanggil fungsi ini dengan `Messages` miliknya (server: `await
 * getMessages()`, client: `useMessages()`).
 */
export function stockStatusLabel(m: Messages, s: StockStatus): string {
  if (s === "AVAILABLE") return m.common.stockAvailable;
  if (s === "LIMITED") return m.common.stockLimited;
  return m.common.stockOutOfStock;
}

/** Kelas chip semantik per status stok (STYLE CONTRACT: .chip.ok/.warn/.bad). */
export const STOCK_STATUS_CHIP: Record<StockStatus, string> = {
  AVAILABLE: "chip ok",
  LIMITED: "chip warn",
  OUT_OF_STOCK: "chip bad",
};

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
