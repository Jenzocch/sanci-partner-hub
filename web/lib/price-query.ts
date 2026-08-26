/**
 * Helper harga efektif (migration 0021, `product_prices`) — SATU tempat
 * untuk aturan pengambilan harga: override Partner → Harga Dasar SANCI →
 * tidak ada. Dipakai Server Action katalog (cabang & admin) untuk PREFILL
 * harga di kalkulator/picker, dan halaman Harga Normal cabang.
 *
 * File ini PURE seperti lib/catalog-query.ts (menerima client lewat
 * parameter, tanpa import runtime dari "@/lib/supabase/server") supaya
 * aman diimpor Server Action mana pun.
 *
 * Dua query lalu merge di memori — SENGAJA bukan view/RPC database: RLS
 * pp_partner_read (0021) sudah membatasi baris yang bisa kembali (zero-
 * trust frontend), dan dua filter sederhana ini tidak butuh bentuk query
 * baru di sisi database.
 *
 * `null` = query GAGAL atau tabel belum ada (migrasi 0021 belum jalan —
 * LESSONS #12, kode boleh naik lebih dulu). Pemanggil prefill wajib
 * MENDEGRADASI DIAM-DIAM ke perilaku lama (harga awal 0, ketik manual) —
 * prefill hanyalah kenyamanan, bukan data yang pengguna sudah ketik, jadi
 * degradasi tanpa banner di sini TIDAK melanggar aturan "nilai yang diisi
 * pengguna tidak boleh hilang". Halaman Harga Normal TIDAK memakai jalur
 * degradasi ini — ia layar kelola harga dan membedakan sebab kegagalannya
 * sendiri (lihat app/cabang/harga/actions.ts).
 */

import type { SupabaseServerClient } from "@/lib/order-create-shared";

export type PriceSource = "partner" | "sanci";
export type EffectivePrice = { price: number; source: PriceSource };

type PriceRow = { product_id: string; price: number };

/**
 * Harga efektif untuk sekumpulan produk.
 *
 * `partnerId`:
 *   - string  → override partner itu menang atas harga dasar. Konteks
 *     cabang WAJIB mengisi partner_id hasil lookup server (partner_users,
 *     LESSONS #6) — RLS 0021 tetap penegak terakhirnya (partner lain
 *     mengembalikan 0 baris, bukan data orang).
 *   - null    → hanya harga dasar SANCI (kalkulator admin — tanpa konteks
 *     partner; keputusan rencana 0021).
 */
export async function fetchEffectivePrices(
  supabase: SupabaseServerClient,
  productIds: readonly string[],
  partnerId: string | null
): Promise<Map<string, EffectivePrice> | null> {
  const map = new Map<string, EffectivePrice>();
  if (productIds.length === 0) return map;
  const ids = [...productIds];

  const { data: baseRows, error: baseError } = await supabase
    .from("product_prices")
    .select("product_id, price")
    .is("partner_id", null)
    .in("product_id", ids);
  if (baseError) return null;
  for (const row of (baseRows ?? []) as PriceRow[]) {
    map.set(row.product_id, { price: row.price, source: "sanci" });
  }

  if (partnerId) {
    const { data: ovrRows, error: ovrError } = await supabase
      .from("product_prices")
      .select("product_id, price")
      .eq("partner_id", partnerId)
      .in("product_id", ids);
    if (ovrError) return null;
    for (const row of (ovrRows ?? []) as PriceRow[]) {
      map.set(row.product_id, { price: row.price, source: "partner" });
    }
  }

  return map;
}

/**
 * Tempelkan harga efektif ke baris produk (mutasi bentuk, bukan objek —
 * mengembalikan array baru). `prices === null` (query gagal / tabel belum
 * ada) = TANPA field price sama sekali — pemakai prefill mendegradasi ke
 * perilaku lama (LESSONS #12), lihat catatan kepala file.
 */
export function attachEffectivePrices<T extends { id: string }>(
  rows: T[],
  prices: Map<string, EffectivePrice> | null
): (T & { price?: number | null })[] {
  if (!prices) return rows;
  return rows.map((r) => {
    const eff = prices.get(r.id);
    return eff ? { ...r, price: eff.price } : r;
  });
}
