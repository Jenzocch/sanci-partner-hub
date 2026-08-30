"use server";

/**
 * Pemuat profil produk untuk Proposal sisi ADMIN.
 *
 * Kembarannya di app/cabang/proposal/actions.ts, dengan SATU beda yang
 * memang harus beda: gerbangnya. Sisi cabang wajib lewat
 * sanci_catalog_access (katalog dibuka per toko); sisi admin tidak punya
 * konsep itu — batasnya RLS admin (fn_is_admin, 0014) seperti seluruh
 * /admin/** lainnya, jadi id yang tidak boleh dibaca pulang kosong dari
 * database, bukan tersaring oleh kode di sini (LESSONS #5).
 *
 * Sengaja TIDAK digabung jadi satu action ber-parameter `area`: satu fungsi
 * yang memilih gerbang berdasarkan argumen dari client adalah persis bentuk
 * yang membuat gerbang bisa dilewati dengan mengarang argumen.
 *
 * TIDAK menulis apa pun. Proposal adalah cetakan, bukan entitas database.
 */

import { createClient } from "@/lib/supabase/server";
import { isMissingTableError } from "@/lib/orders-shared";
import type { ProposalLoadResult, ProposalProduct } from "@/lib/proposal-shared";

const MAX_PRODUCTS = 60;
/** Foto per produk yang ikut tercetak: sampul + maksimal 4 foto galeri. */
const MAX_PHOTOS = 5;

export async function loadProposalProductsAdmin(productIds: string[]): Promise<ProposalLoadResult> {
  const ids = Array.from(new Set(productIds.filter((s) => typeof s === "string" && s.length > 0)));
  if (ids.length === 0) return { ok: true, products: [] };
  if (ids.length > MAX_PRODUCTS) return { ok: false, reason: "failed" };

  const supabase = await createClient();

  const [{ data: products, error: productsError }, { data: photos, error: photosError }] = await Promise.all([
    supabase
      .from("sanci_products")
      .select("id, name, code, category, description, size, photo_url, status")
      .in("id", ids),
    // Urutan galeri KANONIK: sort_order, created_at, id — persis bentuk yang
    // ditetapkan migration 0022 (dan bentuk index idx_product_photos_order),
    // sama dengan yang dipakai admin, /cabang/produk, dan halaman publik.
    // Tanpa ORDER BY, PostgREST bebas mengembalikan baris dalam urutan apa
    // pun: foto pembuka bisa berganti antar-render, dan proposal yang dicetak
    // dua kali bisa tidak sama. Proposal TIDAK PERNAH mengurutkan ulang foto.
    supabase
      .from("product_photos")
      .select("product_id, photo_url")
      .in("product_id", ids)
      .order("sort_order")
      .order("created_at")
      .order("id"),
  ]);

  if (productsError) return { ok: false, reason: "failed" };
  // Galeri (0022) boleh belum dimigrasi — proposal tetap tercetak dengan foto
  // sampul saja (LESSONS #12).
  if (photosError && !isMissingTableError(photosError)) return { ok: false, reason: "failed" };

  const gallery = new Map<string, string[]>();
  for (const row of (photos ?? []) as { product_id: string; photo_url: string | null }[]) {
    if (!row.photo_url) continue;
    const arr = gallery.get(row.product_id) ?? [];
    arr.push(row.photo_url);
    gallery.set(row.product_id, arr);
  }

  type Row = {
    id: string;
    name: string;
    code: string | null;
    category: string | null;
    description: string | null;
    size: string | null;
    photo_url: string | null;
    status: string | null;
  };

  const out: ProposalProduct[] = ((products ?? []) as Row[])
    // Produk INACTIVE tidak dapat halaman profil: dokumen yang dibawa
    // pelanggan tidak mempromosikan barang yang sudah ditarik. Barisnya TETAP
    // ada di ringkasan (staf memang memilihnya) — yang hilang cuma profilnya.
    .filter((p) => p.status !== "INACTIVE")
    .map((p) => {
      const photos = [p.photo_url, ...(gallery.get(p.id) ?? [])].filter(
        (u): u is string => typeof u === "string" && u.length > 0
      );
      return {
        id: p.id,
        name: p.name,
        code: p.code,
        category: p.category,
        description: p.description,
        size: p.size,
        photos: Array.from(new Set(photos)).slice(0, MAX_PHOTOS),
      };
    });

  const rank = new Map(ids.map((id, i) => [id, i]));
  out.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));

  return { ok: true, products: out };
}
