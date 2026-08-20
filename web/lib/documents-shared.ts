// Kontrak bersama Dokumen Pesanan (order_documents/order_document_items,
// migration 0016) — satu-satunya sumber kebenaran untuk tipe & label dipakai
// admin actions + kedua sisi UI (kartu Dokumen di halaman detail pesanan,
// dan halaman cetak).

import type { Messages } from "./i18n/messages";
import type { createClient } from "./supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type DocType = "SO" | "DO" | "INVOICE";

export const DOC_TYPE_PREFIX: Record<DocType, string> = {
  SO: "SO-",
  DO: "DO-",
  INVOICE: "INV-",
};

/**
 * Label jenis dokumen. `SO`/`DO`/`Invoice` sendiri TIDAK diterjemahkan
 * (GLOSSARY.md — istilah dagang, dipertahankan sama di ketiga bahasa), tapi
 * tetap lewat `Messages` supaya konsisten dengan pola label lain di
 * lib/orders-shared.ts/lib/catalog-shared.ts (satu titik perubahan kalau
 * suatu hari kata pengantarnya perlu diterjemahkan).
 */
export function docTypeLabel(m: Messages, t: DocType): string {
  if (t === "SO") return m.common.docTypeSO;
  if (t === "DO") return m.common.docTypeDO;
  return m.common.docTypeInvoice;
}

/**
 * Kelas chip jenis dokumen (STYLE CONTRACT §2b — chip taxonomy, extended
 * dengan tiga anggota baru `.chip.SO/.DO/.INVOICE` yang memakai mekanisme
 * OUTLINED + titik persegi yang SAMA dengan `.chip.ACTIVE/.DRAFT/...`, bukan
 * family kelima — lihat globals.css §2b).
 */
export const DOC_TYPE_CHIP: Record<DocType, string> = {
  SO: "chip SO",
  DO: "chip DO",
  INVOICE: "chip INVOICE",
};

export interface OrderDocumentRow {
  id: string;
  doc_type: DocType;
  doc_number: string;
  doc_date: string;
  notes: string | null;
  created_at: string;
}

export interface OrderDocumentItemRow {
  id: string;
  order_item_id: string;
  quantity: number;
}

/** Baris order_items ringkas dipakai pemilih item di modal buat/ubah dokumen. */
export interface PickableOrderItem {
  id: string;
  name_snapshot: string;
  code_snapshot: string | null;
  quantity: number;
}

export interface ItemCoverage {
  /** Semua baris order_items pesanan ini (name/code/qty pesanan). */
  orderItems: PickableOrderItem[];
  /**
   * order_item_id → total kuantitas SUDAH terpakai di dokumen bertipe SAMA
   * (SO/DO/INVOICE, independen satu sama lain — 0016 §3) untuk pesanan ini,
   * TIDAK TERMASUK dokumen yang sedang diedit (kalau `excludeDocumentId`
   * diisi). Untuk SO selalu 0/kosong (guard over-shipment dilewati untuk SO
   * — snapshot penuh, tidak ada "sisa" yang bermakna, lihat 0016 §3).
   */
  covered: Record<string, number>;
}

/**
 * Satu-satunya sumber kebenaran untuk "berapa sisa boleh dikirim/ditagih"
 * dipakai KEDUANYA: kartu Dokumen (render pemilih item dengan kolom
 * "sudah tercakup" / "sisa") DAN Server Action (§lihat actions-documents.ts
 * — validasi ramah SEBELUM memanggil RPC, supaya pesan errornya bisa
 * menyebut nama item + sisa dalam bahasa yang dipilih pengguna, bukan
 * meneruskan teks RAISE EXCEPTION mentah dari database — SPEC §69/LESSONS
 * pola yang sama dengan correctOrderAttribution di actions-orders.ts).
 * Trigger DB (`fn_guard_document_item_overship`) tetap penjaga SEBENARNYA —
 * ini hanya lapis UX, angka yang sama dihitung ulang di kedua tempat dari
 * SUMBER DATA yang sama (query, bukan hard-code).
 */
export async function fetchItemCoverage(
  supabase: SupabaseServerClient,
  orderId: string,
  docType: DocType,
  excludeDocumentId?: string
): Promise<ItemCoverage | { error: true }> {
  const { data: orderItemsData, error: itemsErr } = await supabase
    .from("order_items")
    .select("id, name_snapshot, code_snapshot, quantity")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });
  if (itemsErr) return { error: true };
  const orderItems = (orderItemsData ?? []) as PickableOrderItem[];

  const covered: Record<string, number> = {};
  if (docType === "SO") {
    // Guard dilewati untuk SO (0016 §3) — tidak ada kuota untuk dihitung.
    return { orderItems, covered };
  }

  const { data: docsData, error: docsErr } = await supabase
    .from("order_documents")
    .select("id, order_document_items(order_item_id, quantity)")
    .eq("order_id", orderId)
    .eq("doc_type", docType);
  if (docsErr) return { error: true };

  for (const doc of (docsData ?? []) as { id: string; order_document_items: { order_item_id: string; quantity: number }[] | null }[]) {
    if (excludeDocumentId && doc.id === excludeDocumentId) continue;
    for (const line of doc.order_document_items ?? []) {
      covered[line.order_item_id] = (covered[line.order_item_id] ?? 0) + Number(line.quantity);
    }
  }
  return { orderItems, covered };
}
