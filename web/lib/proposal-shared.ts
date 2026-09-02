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
  savedAt: number;
  customerName: string;
  lines: ProposalLine[];
  subtotal: number;
  discountPcts: number[];
  totalDiscountAmount: number;
  markupPct: number | null;
  cashDiscount: number;
  finalAmount: number;
};

const PROPOSAL_HANDOFF_KEY = "sanci:proposal:handoff";

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

export function writeProposalHandoff(h: Omit<ProposalHandoff, "savedAt">): boolean {
  try {
    window.localStorage.setItem(PROPOSAL_HANDOFF_KEY, JSON.stringify({ ...h, savedAt: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

export function readProposalHandoff(): ProposalHandoff | null {
  try {
    const raw = window.localStorage.getItem(PROPOSAL_HANDOFF_KEY);
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
