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
 * Keranjang — satu lineId per baris
 * ------------------------------------------------------------------ */

/**
 * Identitas teknis SATU baris keranjang. Tidak mengandung arti bisnis:
 * produk/warna/qty boleh berubah tanpa mengganti lineId. Ini penting sejak
 * owner meminta satu produk bisa hidup sebagai 5 baris terpisah dengan Qty
 * masing-masing — `(productId,colorCode)` tidak lagi boleh dipakai sebagai
 * primary key semu.
 */
export function newCalcLineId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `line_${uuid}`;
  return `line_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

export type CalcLine = {
  lineId: string;
  productId: string;
  name: string;
  code: string | null;
  photoUrl: string | null;
  /** Harga satuan diketik MANUAL oleh staf — katalog produk tidak punya harga (0010). */
  unitPrice: number;
  /** Qty milik BARIS ini saja; tidak pernah dihitung dari productId/warna lain. */
  qty: number;
  /**
   * Kode warna (product_colors.code, migrasi 0025) — atau `null` untuk baris
   * yang belum dipilih warnanya. Warna sekarang adalah DATA baris, bukan lagi
   * identitas baris; dua baris boleh sementara sama-sama null ketika staf
   * sedang menyiapkan beberapa varian.
   */
  colorCode: string | null;
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

/* ------------------------------------------------------------------ *
 * Kontrak pemuat warna (product_colors, migrasi 0025) — dipakai kalkulator
 * DAN picker Isi Pesanan (lib/order-item-picker.tsx).
 * ------------------------------------------------------------------ */

export type ColorOptionRow = {
  id: string;
  code: string;
  name: string | null;
  photo_url: string | null;
};

export type FetchColorsResult =
  | { status: "ok"; hasColorOptions: boolean; colors: ColorOptionRow[] }
  | { status: "unavailable" }
  | { status: "error" };

export type FetchColorsFn = (productId: string) => Promise<FetchColorsResult>;

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

export type CalcArea = "cabang" | "admin";

const CALC_DRAFT_KEYS: Record<CalcArea, string> = {
  cabang: "sanci:kalkulator:cart",
  admin: "sanci:kalkulator:cart:admin",
};
export const CALC_DRAFT_DEBOUNCE_MS = 800;

export type CalcDraft = { savedAt: number; state: CalcCartState };

function isValidLine(v: unknown): v is CalcLine {
  if (!v || typeof v !== "object") return false;
  const l = v as Record<string, unknown>;
  return (
    (l.lineId === undefined || typeof l.lineId === "string") &&
    typeof l.productId === "string" &&
    typeof l.name === "string" &&
    (l.code === null || typeof l.code === "string") &&
    (l.photoUrl === null || typeof l.photoUrl === "string") &&
    typeof l.unitPrice === "number" &&
    typeof l.qty === "number" &&
    (l.colorCode === undefined || l.colorCode === null || typeof l.colorCode === "string")
  );
}

function normalizeColorCode(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/**
 * Draf/handoff lama belum punya lineId. Jangan membuang kerja staf: buat id
 * deterministik dari urutan array lama. Untuk data baru lineId dipertahankan
 * apa adanya. Set memastikan data rusak dengan id kembar tetap dinormalkan ke
 * id unik, bukan membuat React/input mengubah dua baris sekaligus.
 */
function normalizeLineIds<T extends { lineId?: string; productId: string; colorCode?: string | null }>(lines: T[]): (T & { lineId: string; colorCode: string | null })[] {
  const used = new Set<string>();
  return lines.map((line, index) => {
    const colorCode = normalizeColorCode(line.colorCode);
    const base = line.lineId?.trim() || `legacy_${line.productId}_${colorCode ?? "none"}_${index}`;
    let lineId = base;
    let suffix = 1;
    while (used.has(lineId)) {
      lineId = `${base}_${suffix}`;
      suffix += 1;
    }
    used.add(lineId);
    return { ...line, lineId, colorCode };
  });
}

export function readCalcDraft(area: CalcArea): CalcDraft | null {
  try {
    const raw = window.localStorage.getItem(CALC_DRAFT_KEYS[area]);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CalcDraft>;
    if (!parsed || typeof parsed.savedAt !== "number" || !parsed.state) return null;
    const s = parsed.state as Partial<CalcCartState>;
    if (!Array.isArray(s.lines) || !Array.isArray(s.discountSlots)) return null;
    const lines = normalizeLineIds(s.lines.filter(isValidLine));
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
    return null;
  }
}

export function writeCalcDraft(area: CalcArea, state: CalcCartState): void {
  try {
    if (cartStateIsEmpty(state)) {
      window.localStorage.removeItem(CALC_DRAFT_KEYS[area]);
      return;
    }
    window.localStorage.setItem(CALC_DRAFT_KEYS[area], JSON.stringify({ savedAt: Date.now(), state }));
  } catch {
    // Auto-save tidak boleh menghalangi kalkulator utama.
  }
}

export function clearCalcDraft(area: CalcArea): void {
  try {
    window.localStorage.removeItem(CALC_DRAFT_KEYS[area]);
  } catch {
    // sama seperti di atas
  }
}

/* ------------------------------------------------------------------ *
 * Hand-off ke form pesanan baru ("Buat Pesanan") — SEKALI PAKAI, PER AREA.
 * lineId ikut supaya lima baris produk yang sama tidak kembali dilebur di
 * form pesanan dan supaya idempotency key order_items benar-benar per baris.
 * ------------------------------------------------------------------ */

const CALC_HANDOFF_KEYS: Record<CalcArea, string> = {
  cabang: "sanci:kalkulator:handoff",
  admin: "sanci:kalkulator:handoff:admin",
};

export type CalcHandoffLine = {
  lineId: string;
  productId: string;
  name: string;
  code: string | null;
  unitPrice: number;
  qty: number;
  colorCode: string | null;
};

export type CalcHandoff = {
  savedAt: number;
  lineCount: number;
  itemQty: number;
  subtotal: number;
  discountPcts: number[];
  markupPct: number | null;
  cashDiscount: number;
  finalAmount: number;
  lines: CalcHandoffLine[];
};

export function writeCalcHandoff(area: CalcArea, h: Omit<CalcHandoff, "savedAt">): void {
  try {
    window.localStorage.setItem(CALC_HANDOFF_KEYS[area], JSON.stringify({ ...h, savedAt: Date.now() }));
  } catch {
    // Navigasi Pesanan Baru tetap harus bisa dipakai walau localStorage gagal.
  }
}

function isValidHandoffLine(v: unknown): v is CalcHandoffLine {
  if (!v || typeof v !== "object") return false;
  const l = v as Record<string, unknown>;
  return (
    (l.lineId === undefined || typeof l.lineId === "string") &&
    typeof l.productId === "string" &&
    typeof l.name === "string" &&
    (l.code === null || typeof l.code === "string") &&
    typeof l.unitPrice === "number" &&
    typeof l.qty === "number" &&
    (l.colorCode === undefined || l.colorCode === null || typeof l.colorCode === "string")
  );
}

export function readCalcHandoff(area: CalcArea): CalcHandoff | null {
  try {
    const raw = window.localStorage.getItem(CALC_HANDOFF_KEYS[area]);
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
    const lines = Array.isArray(parsed.lines) ? normalizeLineIds(parsed.lines.filter(isValidHandoffLine)) : [];
    return {
      savedAt: parsed.savedAt,
      lineCount: typeof parsed.lineCount === "number" ? parsed.lineCount : lines.length,
      itemQty: typeof parsed.itemQty === "number" ? parsed.itemQty : lines.reduce((sum, l) => sum + l.qty, 0),
      subtotal: parsed.subtotal,
      discountPcts: parsed.discountPcts.filter((n): n is number => typeof n === "number"),
      markupPct: typeof parsed.markupPct === "number" ? parsed.markupPct : null,
      cashDiscount: typeof parsed.cashDiscount === "number" ? parsed.cashDiscount : 0,
      finalAmount: typeof parsed.finalAmount === "number" ? parsed.finalAmount : parsed.subtotal,
      lines,
    };
  } catch {
    return null;
  }
}

export function clearCalcHandoff(area: CalcArea): void {
  try {
    window.localStorage.removeItem(CALC_HANDOFF_KEYS[area]);
  } catch {
    // sama seperti di atas
  }
}
