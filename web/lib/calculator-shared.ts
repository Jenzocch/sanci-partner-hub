/**
 * Kontrak bersama Kalkulator Penawaran (/cabang/kalkulator).
 *
 * Layar ini SENGAJA punya dua penyimpangan dari pola aplikasi lain, keduanya
 * dikonfirmasi eksplisit oleh owner (lihat FEATURES.md, entri kalkulator):
 *   1. Kalkulator murni alat hitung — TIDAK menulis apa pun ke database
 *      selagi dipakai. Draf di sini cuma localStorage, mirroring pola
 *      use-local-draft.ts (auto-save tertunda, TIDAK PERNAH dipulihkan diam-
 *      diam), tapi bukan hook yang sama karena isinya array keranjang, bukan
 *      field form.
 *   2. Rantai diskon di layar ini TIDAK digerbang oleh can_discount/
 *      can_edit_offer (0014/0015) — semua cabang boleh memakainya untuk
 *      menghitung penawaran langsung ke pelanggan. Begitu staf menekan
 *      "Buat Pesanan", angkanya dikirim lewat `setOrderOfferBranch` yang
 *      SAMA dengan yang dipakai OfferSection — jadi penerapan sungguhan ke
 *      order_sanci_offers tetap lewat RLS/trigger 0014/0015 seperti biasa.
 *      Hanya KALKULATOR itu sendiri yang bebas izin, bukan jalur tulisnya.
 *
 * Matematika rantai diskon di bawah ini SENGAJA meniru persis
 * `fn_compute_order_offer_final` (migration 0015) dan client math
 * `offer-section.tsx`: kalikan berurutan (1 - persen/100), lalu ×(1+markup/100),
 * lalu −cash, SATU kali round() di paling akhir — bukan dibulatkan tiap
 * langkah. Kalau nanti perlu cocok persis dengan angka DB (misalnya sesudah
 * dikonversi jadi pesanan sungguhan), inilah rumus yang harus dipakai —
 * jangan didekati dengan cara lain.
 */

export function discountChainMultiplier(pcts: number[]): number {
  return pcts.reduce((mult, p) => mult * (1 - p / 100), 1);
}

/**
 * Angka FINAL yang sah — satu-satunya yang boleh dikirim ke setOrderOfferBranch
 * atau ditampilkan sebagai "Harga Akhir" yang mengikat. Breakdown per-langkah
 * (subtotal → setelah diskon → setelah markup) untuk DITAMPILKAN ke pengguna
 * boleh dibulatkan sendiri-sendiri (lihat kalkulator-client.tsx) — tapi angka
 * itu tidak pernah diumpankan balik ke rumus ini, supaya tidak menyimpang
 * dari aturan "satu kali round di akhir" (0015 §5).
 */
export function computeChainFinal(
  base: number,
  discountPcts: number[],
  markupPct: number,
  cashDiscount: number
): number {
  return Math.round(
    base * discountChainMultiplier(discountPcts) * (1 + markupPct / 100) - cashDiscount
  );
}

/* ------------------------------------------------------------------ *
 * Keranjang — satu baris per produk
 * ------------------------------------------------------------------ */

export type CalcLine = {
  productId: string;
  name: string;
  code: string | null;
  photoUrl: string | null;
  /** Harga satuan diketik MANUAL oleh staf — katalog produk tidak punya harga (0010). */
  unitPrice: number;
  qty: number;
};

export type CalcCartState = {
  lines: CalcLine[];
  /** String mentah per slot, sama pola dengan liveDiscounts di offer-section.tsx. */
  discountSlots: string[];
  markup: string;
  cash: string;
};

export const CALC_MAX_DISCOUNT_SLOTS = 6;
export const CALC_MAX_QTY = 999_999;

export function emptyCartState(): CalcCartState {
  return { lines: [], discountSlots: [""], markup: "", cash: "" };
}

function cartStateIsEmpty(v: CalcCartState): boolean {
  return (
    v.lines.length === 0 &&
    v.discountSlots.every((s) => s.trim() === "") &&
    v.markup.trim() === "" &&
    v.cash.trim() === ""
  );
}

/* ------------------------------------------------------------------ *
 * Draf lokal (auto-save tertunda, restore lewat persetujuan pengguna —
 * SPEC §58 / LESSONS #1, pola sama seperti use-local-draft.ts tapi untuk
 * bentuk data array, bukan elemen form).
 * ------------------------------------------------------------------ */

const CALC_DRAFT_KEY = "sanci:kalkulator:cart";
export const CALC_DRAFT_DEBOUNCE_MS = 800;

export type CalcDraft = { savedAt: number; state: CalcCartState };

function isValidLine(v: unknown): v is CalcLine {
  if (!v || typeof v !== "object") return false;
  const l = v as Record<string, unknown>;
  return (
    typeof l.productId === "string" &&
    typeof l.name === "string" &&
    (l.code === null || typeof l.code === "string") &&
    (l.photoUrl === null || typeof l.photoUrl === "string") &&
    typeof l.unitPrice === "number" &&
    typeof l.qty === "number"
  );
}

export function readCalcDraft(): CalcDraft | null {
  try {
    const raw = window.localStorage.getItem(CALC_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CalcDraft>;
    if (!parsed || typeof parsed.savedAt !== "number" || !parsed.state) return null;
    const s = parsed.state as Partial<CalcCartState>;
    if (!Array.isArray(s.lines) || !Array.isArray(s.discountSlots)) return null;
    const lines = s.lines.filter(isValidLine);
    const discountSlots = s.discountSlots.filter((x): x is string => typeof x === "string");
    const state: CalcCartState = {
      lines,
      discountSlots: discountSlots.length ? discountSlots : [""],
      markup: typeof s.markup === "string" ? s.markup : "",
      cash: typeof s.cash === "string" ? s.cash : "",
    };
    if (cartStateIsEmpty(state)) return null;
    return { savedAt: parsed.savedAt, state };
  } catch {
    return null; // JSON rusak / localStorage diblokir — perlakukan sebagai tidak ada draf
  }
}

export function writeCalcDraft(state: CalcCartState): void {
  try {
    if (cartStateIsEmpty(state)) {
      window.localStorage.removeItem(CALC_DRAFT_KEY);
      return;
    }
    window.localStorage.setItem(CALC_DRAFT_KEY, JSON.stringify({ savedAt: Date.now(), state }));
  } catch {
    // Penyimpanan penuh atau ditolak — diamkan, kalkulator tetap harus bisa dipakai.
  }
}

export function clearCalcDraft(): void {
  try {
    window.localStorage.removeItem(CALC_DRAFT_KEY);
  } catch {
    // sama seperti di atas
  }
}

/* ------------------------------------------------------------------ *
 * Hand-off ke /cabang/pesanan/baru ("Buat Pesanan") — SEKALI PAKAI.
 *
 * Ini BUKAN draf: ditulis sekali saat staf menekan "Buat Pesanan", dibaca
 * lalu dihapus oleh new-order-form.tsx (langsung atau setelah staf memilih
 * "Abaikan"). Isinya cuma ANGKA (subtotal + rantai diskon) — daftar produk/
 * harga per baris SENGAJA tidak ikut, karena tidak ada tempat menuliskannya:
 * pembuatan pesanan hari ini masih berbasis Package (0008), bukan input
 * order_items manual, dan kolom harga per baris (unit_price/line_discount,
 * 0014) sama sekali tidak ada di form cabang (murni sisi admin) — lihat
 * catatan di new-order-form.tsx titik pemakaian handoff ini.
 * ------------------------------------------------------------------ */

const CALC_HANDOFF_KEY = "sanci:kalkulator:handoff";

export type CalcHandoff = {
  savedAt: number;
  lineCount: number;
  itemQty: number;
  subtotal: number;
  discountPcts: number[];
  markupPct: number | null;
  cashDiscount: number;
  finalAmount: number;
};

export function writeCalcHandoff(h: Omit<CalcHandoff, "savedAt">): void {
  try {
    window.localStorage.setItem(CALC_HANDOFF_KEY, JSON.stringify({ ...h, savedAt: Date.now() }));
  } catch {
    // Diamkan — kegagalan handoff tidak boleh menghalangi navigasi ke Pesanan Baru,
    // itu sendiri masih berfungsi penuh tanpa handoff (staf tinggal isi manual).
  }
}

export function readCalcHandoff(): CalcHandoff | null {
  try {
    const raw = window.localStorage.getItem(CALC_HANDOFF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CalcHandoff>;
    if (
      !parsed ||
      typeof parsed.savedAt !== "number" ||
      typeof parsed.subtotal !== "number" ||
      !Array.isArray(parsed.discountPcts)
    ) {
      return null;
    }
    return {
      savedAt: parsed.savedAt,
      lineCount: typeof parsed.lineCount === "number" ? parsed.lineCount : 0,
      itemQty: typeof parsed.itemQty === "number" ? parsed.itemQty : 0,
      subtotal: parsed.subtotal,
      discountPcts: parsed.discountPcts.filter((n): n is number => typeof n === "number"),
      markupPct: typeof parsed.markupPct === "number" ? parsed.markupPct : null,
      cashDiscount: typeof parsed.cashDiscount === "number" ? parsed.cashDiscount : 0,
      finalAmount: typeof parsed.finalAmount === "number" ? parsed.finalAmount : parsed.subtotal,
    };
  } catch {
    return null;
  }
}

export function clearCalcHandoff(): void {
  try {
    window.localStorage.removeItem(CALC_HANDOFF_KEY);
  } catch {
    // sama seperti di atas
  }
}
