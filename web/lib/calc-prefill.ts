/**
 * Kontrak "bawa isi pesanan kembali ke Kalkulator".
 *
 * Untuk apa: pelanggan datang lagi dan minta proposal untuk pesanan yang
 * sudah pernah dibuat. Tanpa ini staf harus mencari ulang tiap produk di
 * katalog dan mengetik ulang jumlahnya.
 *
 * Yang dibawa HANYA daftar produk dan jumlahnya. HARGA TIDAK IKUT, dan itu
 * batas yang paling penting di berkas ini:
 *
 *   - `order_sanci_offers` adalah harga SANCI kepada TOKO. Mencetaknya di
 *     dokumen yang dibawa pulang pelanggan sama dengan memperlihatkan modal
 *     toko kepada pelanggannya sendiri.
 *   - `order_items.unit_price` adalah "nilai REFERENSI per baris" (0014),
 *     digerbangi izin yang sama dengan Penawaran SANCI karena sifatnya sama:
 *     nilai kesepakatan komersial, bukan harga jual ke pelanggan.
 *   - `partner_purchase_amount` adalah angka yang DILAPORKAN cabang — 0009
 *     menyebutnya eksplisit "bukan angka yang boleh dipercaya mentah-mentah".
 *
 * SEKALI PAKAI: dihapus saat dibaca, supaya membuka Kalkulator besok tidak
 * tiba-tiba memunculkan isi pesanan lama (SPEC §58 — jangan menyulap state).
 */

import type { CalcArea } from "@/lib/calculator-shared";

export type CalcPrefillLine = {
  /** Opsional untuk kompatibilitas hand-off lama; Kalkulator membuat id baru bila kosong. */
  lineId?: string;
  productId: string;
  name: string;
  code: string | null;
  qty: number;
  colorCode: string | null;
};

export type CalcPrefill = {
  savedAt: number;
  customerName: string;
  lines: CalcPrefillLine[];
  skipped: number;
};

const KEYS: Record<CalcArea, string> = {
  cabang: "sanci:kalkulator:prefill",
  admin: "sanci:kalkulator:prefill:admin",
};

function isValidLine(v: unknown): v is CalcPrefillLine {
  if (!v || typeof v !== "object") return false;
  const l = v as Record<string, unknown>;
  return (
    (l.lineId === undefined || typeof l.lineId === "string") &&
    typeof l.productId === "string" &&
    typeof l.name === "string" &&
    (l.code === null || typeof l.code === "string") &&
    typeof l.qty === "number" &&
    l.qty > 0 &&
    (l.colorCode === undefined || l.colorCode === null || typeof l.colorCode === "string")
  );
}

export function writeCalcPrefill(area: CalcArea, p: Omit<CalcPrefill, "savedAt">): boolean {
  try {
    window.localStorage.setItem(KEYS[area], JSON.stringify({ ...p, savedAt: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

export function takeCalcPrefill(area: CalcArea): CalcPrefill | null {
  try {
    const raw = window.localStorage.getItem(KEYS[area]);
    if (!raw) return null;
    window.localStorage.removeItem(KEYS[area]);
    const parsed = JSON.parse(raw) as Partial<CalcPrefill>;
    if (!parsed || !Array.isArray(parsed.lines)) return null;
    const lines = parsed.lines
      .filter(isValidLine)
      .map((l) => ({
        ...l,
        lineId: typeof l.lineId === "string" && l.lineId ? l.lineId : undefined,
        colorCode: typeof l.colorCode === "string" ? l.colorCode : null,
      }));
    if (lines.length === 0 && !parsed.skipped) return null;
    return {
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : 0,
      customerName: typeof parsed.customerName === "string" ? parsed.customerName : "",
      lines,
      skipped: typeof parsed.skipped === "number" ? parsed.skipped : 0,
    };
  } catch {
    return null;
  }
}
