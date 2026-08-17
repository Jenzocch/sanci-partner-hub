// Kontrak bersama Katalog Produk SANCI (Phase 2 slice 5) — satu-satunya
// sumber kebenaran untuk tipe & label. Keputusan owner (2026-08-17):
//   - Stok hanya STATUS (Tersedia/Terbatas/Habis) — angka nyata menunggu
//     sinkronisasi gudang di fase depan; angka basi lebih menyesatkan.
//   - Visibilitas katalog di-set per PARTNER oleh SANCI (buka/tutup).
//   - TANPA harga sama sekali — penawaran disampaikan SANCI secara manual.

export type StockStatus = "AVAILABLE" | "LIMITED" | "OUT_OF_STOCK";

export const STOCK_STATUS_LABEL: Record<StockStatus, string> = {
  AVAILABLE: "Tersedia",
  LIMITED: "Terbatas",
  OUT_OF_STOCK: "Habis",
};

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
