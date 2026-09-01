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
  /**
   * Kode warna (product_colors.code, migrasi 0025) — atau `null` untuk baris
   * "belum dipilih warnanya". IDENTITAS BARIS di seluruh berkas ini bukan lagi
   * `productId` sendirian, melainkan pasangan `(productId, colorCode)` —
   * produk yang sama dengan warna berbeda adalah DUA baris (audit 2026-09-01:
   * sebelum ini, satu produk hanya bisa dipilih satu kali sama sekali,
   * walaupun order_items.color_code sudah lama menyediakan tempat untuk
   * "sofa krem 2 + sofa abu 3"). Produk tanpa pilihan warna selalu punya
   * `colorCode: null` dan berperilaku identik dengan sebelum perubahan ini.
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
 * DAN picker Isi Pesanan (lib/order-item-picker.tsx). Tipe LOKAL yang
 * cocok secara STRUKTURAL dengan `ListActiveColorsOutcome`/`ColorRow` milik
 * masing-masing area (app/admin/actions-colors.ts,
 * app/cabang/pesanan/actions.ts::listActiveColorsCabang) — berkas ini
 * SENGAJA tidak mengimpor salah satu dari keduanya (pola yang sama dengan
 * `KalkulatorFetchMessages`/`PickerLoadResult`: komponen bersama dua area
 * tidak boleh terikat pada action milik satu area).
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

/**
 * Area pemasang kalkulator. Sejak 2026-08-22 komponen yang sama dipasang di
 * /cabang/kalkulator DAN /admin/kalkulator (lib/kalkulator-client.tsx).
 */
export type CalcArea = "cabang" | "admin";

/**
 * Key draf TERPISAH per area — keputusan sadar, bukan kebetulan:
 *  - Akun cabang dan akun admin adalah login yang berbeda, biasanya di
 *    perangkat berbeda — tapi SATU browser yang dipakai bergantian itu
 *    mungkin (mis. laptop kantor SANCI yang juga dipakai menguji akun toko).
 *    localStorage tidak ikut terhapus saat ganti login, jadi kalau key-nya
 *    sama, draf keranjang admin akan menyembul sebagai "draf tersimpan" di
 *    sesi cabang (dan sebaliknya) — kebocoran kecil tapi membingungkan, dan
 *    persis jenis kejutan yang dilarang prinsip jangan-menyulap-state.
 *  - Key cabang TIDAK berubah dari nilai lamanya, supaya draf staf toko yang
 *    sudah ada tetap terbaca setelah rilis ini (bukan hilang diam-diam).
 */
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
    typeof l.productId === "string" &&
    typeof l.name === "string" &&
    (l.code === null || typeof l.code === "string") &&
    (l.photoUrl === null || typeof l.photoUrl === "string") &&
    typeof l.unitPrice === "number" &&
    typeof l.qty === "number" &&
    // colorCode BOLEH tidak ada sama sekali — draf lama (sebelum kolom ini
    // ada) tetap harus terbaca valid, bukan dibuang seluruhnya (LESSONS #1:
    // draf pengguna tidak boleh hilang gara-gara skema berubah). Undefined
    // dinormalkan jadi null di bawah, bukan di sini.
    (l.colorCode === undefined || l.colorCode === null || typeof l.colorCode === "string")
  );
}

/** Normalisasi `colorCode` yang mungkin `undefined` (draf sebelum kolom ini ada) menjadi `null`. */
function normalizeColorCode(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

export function readCalcDraft(area: CalcArea): CalcDraft | null {
  try {
    const raw = window.localStorage.getItem(CALC_DRAFT_KEYS[area]);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CalcDraft>;
    if (!parsed || typeof parsed.savedAt !== "number" || !parsed.state) return null;
    const s = parsed.state as Partial<CalcCartState>;
    if (!Array.isArray(s.lines) || !Array.isArray(s.discountSlots)) return null;
    const lines = s.lines.filter(isValidLine).map((l) => ({ ...l, colorCode: normalizeColorCode(l.colorCode) }));
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

export function writeCalcDraft(area: CalcArea, state: CalcCartState): void {
  try {
    if (cartStateIsEmpty(state)) {
      window.localStorage.removeItem(CALC_DRAFT_KEYS[area]);
      return;
    }
    window.localStorage.setItem(CALC_DRAFT_KEYS[area], JSON.stringify({ savedAt: Date.now(), state }));
  } catch {
    // Penyimpanan penuh atau ditolak — diamkan, kalkulator tetap harus bisa dipakai.
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
 *
 * Ini BUKAN draf: ditulis sekali saat staf menekan "Buat Pesanan", dibaca
 * lalu dihapus oleh form pesanan baru area yang sama (langsung atau setelah
 * staf memilih "Abaikan"). Isinya ANGKA (subtotal + rantai diskon) DAN —
 * sejak revisi penutup gap ini — daftar baris keranjang (`lines`), supaya
 * "Buat Pesanan" benar-benar menutup gap yang tadinya sengaja ditinggalkan
 * (lihat FEATURES.md, slice yang merevisi P2-63/P2-64): dulu daftar produk/
 * harga per baris TIDAK ikut karena pembuatan pesanan sepenuhnya
 * Package-based (0008) dan tidak ada jalur tulis yang menerima daftar item
 * bebas. Jalur tulis itu SEKARANG ada (`copyCalcCartItemsToOrder`,
 * cabang/pesanan/actions.ts) — dipanggil form pesanan baru SETELAH pesanan
 * berhasil dibuat, tepat di titik yang sama dengan penerapan rantai diskon
 * (applyCalcHandoffIfNeeded), dan tetap lewat RLS/trigger order_items 0014
 * seperti biasa (trg_order_item_price_guard tetap mensyaratkan
 * can_edit_offer untuk unit_price di sisi cabang; untuk admin, guard dan
 * RLS-nya sama-sama melepas lewat fn_is_admin — 0014).
 *
 * Key TERPISAH per area, alasan yang SAMA dengan CALC_DRAFT_KEYS di atas:
 * sejak /admin/kalkulator ikut punya "Buat Pesanan" (2026-08-24), hand-off
 * admin dibaca /admin/orders/baru dan hand-off cabang dibaca
 * /cabang/pesanan/baru — satu browser yang dipakai bergantian tidak boleh
 * membuat hand-off admin menyembul di form cabang (atau sebaliknya). Key
 * cabang TIDAK berubah dari nilai lamanya supaya hand-off staf toko yang
 * sedang berjalan saat rilis ini tetap terbaca (bukan hilang diam-diam).
 * ------------------------------------------------------------------ */

const CALC_HANDOFF_KEYS: Record<CalcArea, string> = {
  cabang: "sanci:kalkulator:handoff",
  admin: "sanci:kalkulator:handoff:admin",
};

/**
 * Satu baris keranjang, versi RINGKAS untuk hand-off (bukan CalcLine penuh —
 * photoUrl tidak relevan untuk order_items, jadi tidak ikut disimpan).
 * name/code IKUT dikirim murni untuk ringkasan di banner sebelum dipakai;
 * copyCalcCartItemsToOrder TETAP mengambil ulang name_snapshot/code_snapshot
 * dari sanci_products lewat productId saat benar-benar menulis (LESSONS #6,
 * tidak pernah mempercayai snapshot dari client/localStorage untuk isi baris
 * riwayat) — unitPrice/qty tidak punya sumber otoritatif lain (harga diketik
 * bebas oleh staf, katalog produk tidak punya harga, 0010) jadi keduanya
 * TETAP dari hand-off ini.
 */
export type CalcHandoffLine = {
  productId: string;
  name: string;
  code: string | null;
  unitPrice: number;
  qty: number;
  /** Lihat catatan `CalcLine.colorCode` — identitas baris pasangan (productId, colorCode). */
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
    // Diamkan — kegagalan handoff tidak boleh menghalangi navigasi ke Pesanan Baru,
    // itu sendiri masih berfungsi penuh tanpa handoff (staf tinggal isi manual).
  }
}

function isValidHandoffLine(v: unknown): v is CalcHandoffLine {
  if (!v || typeof v !== "object") return false;
  const l = v as Record<string, unknown>;
  return (
    typeof l.productId === "string" &&
    typeof l.name === "string" &&
    (l.code === null || typeof l.code === "string") &&
    typeof l.unitPrice === "number" &&
    typeof l.qty === "number" &&
    // Lihat catatan sepadan di isValidLine — undefined = hand-off lama, valid.
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
    return {
      savedAt: parsed.savedAt,
      lineCount: typeof parsed.lineCount === "number" ? parsed.lineCount : 0,
      itemQty: typeof parsed.itemQty === "number" ? parsed.itemQty : 0,
      subtotal: parsed.subtotal,
      discountPcts: parsed.discountPcts.filter((n): n is number => typeof n === "number"),
      markupPct: typeof parsed.markupPct === "number" ? parsed.markupPct : null,
      cashDiscount: typeof parsed.cashDiscount === "number" ? parsed.cashDiscount : 0,
      finalAmount: typeof parsed.finalAmount === "number" ? parsed.finalAmount : parsed.subtotal,
      lines: Array.isArray(parsed.lines)
        ? parsed.lines.filter(isValidHandoffLine).map((l) => ({ ...l, colorCode: normalizeColorCode(l.colorCode) }))
        : [],
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
