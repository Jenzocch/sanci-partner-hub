"use server";

/**
 * Penawaran TERSIMPAN (migration 0029) — simpan, buka lagi, daftar.
 *
 * Beda tegas dari actions.ts di folder ini: berkas itu hanya MEMBACA profil
 * produk dan tidak menulis apa pun ("Proposal adalah cetakan, bukan entitas
 * database"). Sejak owner memutuskan penawaran perlu nomor, versi, dan
 * riwayat (2026-09-15), penawaran JUGA menjadi entitas database — tapi
 * hanya kalau staf menekan Simpan. Menekan Cetak saja tetap tidak menulis
 * apa-apa.
 *
 * ATRIBUSI ADALAH IDENTITAS, BUKAN KIRIMAN CLIENT: partner_id/branch_id
 * diambil dari baris `partner_users` milik sesi ini lewat RLS (LESSONS #5),
 * TIDAK pernah dari parameter. Nomor, versi, dan masa berlaku dipaksa
 * trigger di database (0029 §3), jadi client juga tidak bisa mengarangnya.
 * Yang dikirim client hanyalah ISI penawaran — dan isi itu memang miliknya:
 * ia baru saja mencetaknya untuk pelanggannya sendiri.
 */

import { createClient } from "@/lib/supabase/server";
import { getCabangMessages } from "@/lib/i18n";
import { pesan, catatGagal, safeWrite } from "@/lib/safe-write";
import { isMissingTableError } from "@/lib/orders-shared";
import type { ProposalLine, ProposalProduct } from "@/lib/proposal-shared";

type ActionResult<T> = { data: T } | { error: { message: string } };

export type SavedProposalMeta = {
  id: string;
  number: string;
  version: number;
  customerName: string | null;
  finalAmount: number;
  validUntil: string | null;
  createdAt: string;
};

export type SavedProposalFull = SavedProposalMeta & {
  subtotal: number;
  discountPcts: number[];
  totalDiscountAmount: number;
  markupPct: number | null;
  cashDiscount: number;
  extraFeeLabel: string | null;
  extraFeeAmount: number;
  lines: ProposalLine[];
  products: ProposalProduct[] | null;
};

export type SaveProposalInput = {
  /** null = penawaran BARU. Terisi = revisi keluarga nomor itu; versinya
   *  dihitung database, bukan di sini. */
  proposalNumber: string | null;
  customerName: string;
  subtotal: number;
  discountPcts: number[];
  totalDiscountAmount: number;
  markupPct: number | null;
  cashDiscount: number;
  extraFeeLabel: string | null;
  extraFeeAmount: number;
  finalAmount: number;
  lines: ProposalLine[];
  products: ProposalProduct[] | null;
};

const COLS =
  "id, proposal_number, version, customer_name, subtotal, discount_pcts, total_discount_amount, markup_pct, cash_discount, extra_fee_label, extra_fee_amount, final_amount, lines, products, valid_until, created_at";

/** Satu percobaan ulang saat dua staf merevisi nomor yang sama bersamaan:
 *  yang kalah balapan mendapat 23505 pada unique(proposal_number, version)
 *  dan versi berikutnya sudah bergeser — pola sama dengan penomoran dokumen
 *  0016. Bukan error pengguna, jadi tidak ditampilkan sebagai error. */
const MAX_REVISION_ATTEMPTS = 3;

function toMeta(row: Record<string, unknown>): SavedProposalMeta {
  return {
    id: String(row.id),
    number: String(row.proposal_number ?? ""),
    version: Number(row.version ?? 1),
    customerName: (row.customer_name as string | null) ?? null,
    finalAmount: Number(row.final_amount ?? 0),
    validUntil: (row.valid_until as string | null) ?? null,
    createdAt: String(row.created_at ?? ""),
  };
}

export async function saveProposal(input: SaveProposalInput): Promise<ActionResult<SavedProposalMeta>> {
  const m = await getCabangMessages();
  const PESAN = pesan(m);
  const supabase = await createClient();

  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    return { error: { message: m.cabang.proposalSaveEmpty } };
  }

  // Identitas toko dari sesi, lewat RLS — bukan dari parameter.
  const { data: pu, error: puError } = await supabase
    .from("partner_users")
    .select("partner_id, branch_id")
    .maybeSingle();
  if (puError) {
    return { error: { message: PESAN.serverSibukKode(catatGagal("saveProposal/partnerUser", { hasil: puError })) } };
  }
  if (!pu?.partner_id || !pu?.branch_id) {
    return { error: { message: m.cabang.errAccountLoad } };
  }

  const baris = {
    partner_id: pu.partner_id,
    branch_id: pu.branch_id,
    proposal_number: input.proposalNumber,
    customer_name: input.customerName.trim() || null,
    subtotal: Math.max(0, Math.round(input.subtotal)),
    discount_pcts: input.discountPcts,
    total_discount_amount: Math.max(0, Math.round(input.totalDiscountAmount)),
    markup_pct: input.markupPct,
    cash_discount: Math.max(0, Math.round(input.cashDiscount)),
    extra_fee_label: input.extraFeeLabel,
    extra_fee_amount: Math.max(0, Math.round(input.extraFeeAmount)),
    final_amount: Math.max(0, Math.round(input.finalAmount)),
    lines: input.lines,
    products: input.products,
  };

  for (let attempt = 1; attempt <= MAX_REVISION_ATTEMPTS; attempt++) {
    const written = await safeWrite(
      supabase.from("partner_proposals").insert(baris).select(COLS).single()
    );
    if (written.ok) return { data: toMeta(written.data as Record<string, unknown>) };

    if (written.reason === "db") {
      if (isMissingTableError({ code: written.code })) {
        return { error: { message: m.cabang.proposalSaveFeatureOff } };
      }
      // Balapan revisi: versi bergeser di antara hitung dan tulis. Coba lagi
      // — triggernya akan menghitung versi berikutnya dari keadaan terbaru.
      if (written.code === "23505" && input.proposalNumber && attempt < MAX_REVISION_ATTEMPTS) {
        continue;
      }
      return {
        error: {
          message: PESAN.serverSibukKode(
            catatGagal("saveProposal/insert", { hasil: { code: written.code, detail: written.detail }, attempt })
          ),
        },
      };
    }
    return { error: { message: PESAN.belumPastiBaru } };
  }

  return {
    error: { message: PESAN.serverSibukKode(catatGagal("saveProposal/revisionRace", { number: input.proposalNumber })) },
  };
}

/** Buka satu penawaran tersimpan untuk dicetak ulang. RLS yang menentukan
 *  boleh atau tidak: id dari URL bisa dikarang, dan penawaran cabang lain
 *  akan pulang KOSONG, bukan tersaring oleh kode di sini. */
export async function loadSavedProposal(id: string): Promise<ActionResult<SavedProposalFull>> {
  const m = await getCabangMessages();
  const PESAN = pesan(m);
  const supabase = await createClient();

  const { data, error } = await supabase.from("partner_proposals").select(COLS).eq("id", id).maybeSingle();
  if (error) {
    if (isMissingTableError(error)) return { error: { message: m.cabang.proposalSaveFeatureOff } };
    return { error: { message: PESAN.serverSibukKode(catatGagal("loadSavedProposal", { hasil: error })) } };
  }
  if (!data) return { error: { message: m.cabang.proposalSavedNotFound } };

  const row = data as Record<string, unknown>;
  return {
    data: {
      ...toMeta(row),
      subtotal: Number(row.subtotal ?? 0),
      discountPcts: Array.isArray(row.discount_pcts) ? (row.discount_pcts as number[]) : [],
      totalDiscountAmount: Number(row.total_discount_amount ?? 0),
      markupPct: row.markup_pct === null || row.markup_pct === undefined ? null : Number(row.markup_pct),
      cashDiscount: Number(row.cash_discount ?? 0),
      extraFeeLabel: (row.extra_fee_label as string | null) ?? null,
      extraFeeAmount: Number(row.extra_fee_amount ?? 0),
      lines: (row.lines ?? []) as ProposalLine[],
      products: (row.products as ProposalProduct[] | null) ?? null,
    },
  };
}

/** Daftar penawaran tersimpan yang boleh dilihat sesi ini (RLS). Terbaru
 *  dulu — index idx_partner_proposals_branch_time (0029) melayani urutan
 *  ini persis. */
export async function listSavedProposals(limit = 50): Promise<ActionResult<SavedProposalMeta[]>> {
  const m = await getCabangMessages();
  const PESAN = pesan(m);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("partner_proposals")
    .select(COLS)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));
  if (error) {
    if (isMissingTableError(error)) return { error: { message: m.cabang.proposalSaveFeatureOff } };
    return { error: { message: PESAN.serverSibukKode(catatGagal("listSavedProposals", { hasil: error })) } };
  }
  return { data: (data ?? []).map((r) => toMeta(r as Record<string, unknown>)) };
}
