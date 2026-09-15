/**
 * Kontrak bersama PROPOSAL (buku penawaran untuk pelanggan).
 * Dokumen dibentuk dari hand-off Kalkulator dan tidak menulis ke database.
 */

export type ProposalLine = {
  /** Identitas teknis per baris; bukan productId/warna. */
  lineId: string;
  productId: string;
  name: string;
  code: string | null;
  unitPrice: number;
  qty: number;
  colorCode: string | null;
};

export type ProposalHandoff = {
  /** Identitas SATU penawaran. Dipakai sebagai bagian kunci localStorage dan
   *  dibawa di URL halaman Proposal (`?p=`), supaya dua penawaran yang
   *  disiapkan berbarengan tidak saling menimpa — lihat catatan di
   *  PROPOSAL_KEY_PREFIX. */
  proposalId: string;
  savedAt: number;
  customerName: string;
  lines: ProposalLine[];
  subtotal: number;
  discountPcts: number[];
  totalDiscountAmount: number;
  markupPct: number | null;
  cashDiscount: number;
  /** Biaya tambahan opsional (ongkir dll.); null/0 = tidak dicetak. Sudah termasuk di finalAmount. */
  extraFeeLabel: string | null;
  extraFeeAmount: number;
  finalAmount: number;
};

/**
 * SATU entri per penawaran, bukan satu entri global.
 *
 * Sampai audit 2026-09-15 seluruh browser berbagi SATU kunci
 * (`sanci:proposal:handoff`). Akibatnya nyata dan sudah bisa terjadi di meja
 * toko: menyiapkan penawaran untuk pelanggan A, lalu menyiapkan satu lagi
 * untuk pelanggan B (tab kedua, atau sekadar kembali ke Kalkulator) menimpa
 * yang pertama — dan menekan muat-ulang di tab penawaran A kemudian
 * menampilkan isi penawaran B, dengan nama pelanggan A masih tertulis di
 * layar kalau sudah diketik. Tidak ada satu pun tanda bahwa isinya berganti.
 *
 * Yang ini BUKAN celah izin database (RLS tidak disentuh sama sekali);
 * cakupannya satu browser, dan datanya memang milik orang yang sama.
 */
const PROPOSAL_KEY_PREFIX = "sanci:proposal:handoff:";

/** Entri yang lebih tua dari ini dibuang saat menulis entri baru. Handoff
 *  adalah objek TRANSIT (Kalkulator → Proposal, hitungan menit), jadi umur
 *  sehari sudah sangat longgar. Tanpa pembersihan ini, satu kunci per
 *  penawaran akan menumpuk tanpa batas di localStorage. */
const PROPOSAL_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Pola sama dengan newCalcLineId() di lib/calculator-shared.ts. */
export function newProposalId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `prop_${uuid}`;
  return `prop_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

/** Buang entri penawaran yang sudah kedaluwarsa (dan entri rusak). */
function pruneProposalHandoffs(now: number): void {
  try {
    const mati: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith(PROPOSAL_KEY_PREFIX)) continue;
      try {
        const raw = window.localStorage.getItem(key);
        const savedAt = raw ? (JSON.parse(raw) as { savedAt?: unknown }).savedAt : null;
        if (typeof savedAt !== "number" || now - savedAt > PROPOSAL_MAX_AGE_MS) mati.push(key);
      } catch {
        mati.push(key);
      }
    }
    for (const key of mati) window.localStorage.removeItem(key);
  } catch {
    // localStorage bisa dilarang total (private mode) — pembersihan ini
    // kenyamanan, bukan syarat benar.
  }
}

function isValidLine(v: unknown): v is ProposalLine {
  if (!v || typeof v !== "object") return false;
  const l = v as Record<string, unknown>;
  return (
    (l.lineId === undefined || typeof l.lineId === "string") &&
    typeof l.productId === "string" &&
    typeof l.name === "string" &&
    (l.code === null || typeof l.code === "string") &&
    typeof l.unitPrice === "number" &&
    typeof l.qty === "number" &&
    (l.colorCode === null || l.colorCode === undefined || typeof l.colorCode === "string")
  );
}

/**
 * Simpan satu penawaran dan kembalikan `proposalId`-nya — pemanggil WAJIB
 * membawa id itu ke halaman Proposal (`?p=<id>`), karena tanpa id tidak ada
 * cara menunjuk penawaran YANG MANA yang harus dibuka.
 */
export function writeProposalHandoff(
  h: Omit<ProposalHandoff, "savedAt" | "proposalId">
): { ok: true; proposalId: string } | { ok: false } {
  const now = Date.now();
  const proposalId = newProposalId();
  try {
    pruneProposalHandoffs(now);
    window.localStorage.setItem(
      `${PROPOSAL_KEY_PREFIX}${proposalId}`,
      JSON.stringify({ ...h, proposalId, savedAt: now })
    );
    return { ok: true, proposalId };
  } catch {
    return { ok: false };
  }
}

/**
 * Baca SATU penawaran berdasarkan id-nya. Tanpa id (`?p=` hilang, mis. tautan
 * lama atau bookmark dari sebelum audit 2026-09-15) hasilnya `null` — halaman
 * Proposal lalu menampilkan keadaan "belum ada penawaran" dengan tombol
 * kembali ke Kalkulator, BUKAN penawaran orang lain yang kebetulan tersimpan
 * terakhir.
 */
export function readProposalHandoff(proposalId: string | null): ProposalHandoff | null {
  if (!proposalId) return null;
  try {
    const raw = window.localStorage.getItem(`${PROPOSAL_KEY_PREFIX}${proposalId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ProposalHandoff>;
    if (!parsed || typeof parsed.savedAt !== "number" || !Array.isArray(parsed.lines)) return null;
    const used = new Set<string>();
    const lines = parsed.lines.filter(isValidLine).map((l, index) => {
      const colorCode = l.colorCode ?? null;
      const base = typeof l.lineId === "string" && l.lineId.trim()
        ? l.lineId
        : `legacy_${l.productId}_${colorCode ?? "none"}_${index}`;
      let lineId = base;
      let suffix = 1;
      while (used.has(lineId)) {
        lineId = `${base}_${suffix}`;
        suffix += 1;
      }
      used.add(lineId);
      return { ...l, lineId, colorCode };
    });
    if (lines.length === 0) return null;
    return {
      proposalId,
      savedAt: parsed.savedAt,
      customerName: typeof parsed.customerName === "string" ? parsed.customerName : "",
      lines,
      subtotal: typeof parsed.subtotal === "number" ? parsed.subtotal : 0,
      discountPcts: Array.isArray(parsed.discountPcts)
        ? parsed.discountPcts.filter((n): n is number => typeof n === "number")
        : [],
      totalDiscountAmount: typeof parsed.totalDiscountAmount === "number" ? parsed.totalDiscountAmount : 0,
      markupPct: typeof parsed.markupPct === "number" ? parsed.markupPct : null,
      cashDiscount: typeof parsed.cashDiscount === "number" ? parsed.cashDiscount : 0,
      extraFeeLabel: typeof parsed.extraFeeLabel === "string" && parsed.extraFeeLabel.trim() ? parsed.extraFeeLabel : null,
      extraFeeAmount: typeof parsed.extraFeeAmount === "number" && parsed.extraFeeAmount > 0 ? parsed.extraFeeAmount : 0,
      finalAmount: typeof parsed.finalAmount === "number" ? parsed.finalAmount : 0,
    };
  } catch {
    return null;
  }
}

export type ProposalProduct = {
  id: string;
  name: string;
  code: string | null;
  category: string | null;
  description: string | null;
  size: string | null;
  photos: string[];
};

export type ProposalLoadResult =
  | { ok: true; products: ProposalProduct[] }
  | { ok: false; reason: "no-account" | "catalog-closed" | "failed" };
