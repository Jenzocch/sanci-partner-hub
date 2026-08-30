"use server";

/**
 * Server Action tunggal untuk halaman Proposal: mengambil profil produk
 * (deskripsi, ukuran, kategori, galeri foto) untuk daftar id yang dipilih
 * staf di Kalkulator.
 *
 * Gerbangnya SAMA PERSIS dengan halaman katalog cabang (produk/page.tsx dan
 * produk/[productId]/page.tsx): akun toko wajib ada, sanci_catalog_access
 * harus terbuka untuk toko itu, baru produk boleh dibaca — dan di atas
 * semua itu RLS tetap batas sungguhannya (LESSONS #5, zero-trust frontend).
 * Daftar id datang dari localStorage, artinya bisa dikarang siapa pun yang
 * membuka DevTools — justru karena itu tidak ada satu pun keputusan akses
 * yang bersandar padanya: id yang tidak boleh dilihat toko ini akan pulang
 * kosong dari RLS, bukan tersaring oleh kode di sini.
 *
 * TIDAK menulis apa pun. Proposal adalah cetakan, bukan entitas database.
 */

import { createClient } from "@/lib/supabase/server";
import { isMissingTableError } from "@/lib/orders-shared";
import type { ProposalLoadResult, ProposalProduct } from "@/lib/proposal-shared";

/** Batas jumlah id per panggilan — keranjang kalkulator praktis tidak pernah
 *  sebesar ini; angkanya ada supaya daftar karangan tidak bisa memaksa query
 *  raksasa. Diam-diam memotong daftar akan membuat produk hilang dari
 *  proposal tanpa penjelasan, jadi kelebihannya DITOLAK, bukan dipangkas. */
const MAX_PRODUCTS = 60;

/** Foto per produk yang ikut tercetak: sampul + maksimal 4 foto galeri. */
const MAX_PHOTOS = 5;

export async function loadProposalProducts(productIds: string[]): Promise<ProposalLoadResult> {
  const ids = Array.from(new Set(productIds.filter((s) => typeof s === "string" && s.length > 0)));
  if (ids.length === 0) return { ok: true, products: [] };
  if (ids.length > MAX_PRODUCTS) return { ok: false, reason: "failed" };

  const supabase = await createClient();

  const { data: pu, error: puError } = await supabase
    .from("partner_users")
    .select("partner_id")
    .maybeSingle();
  if (puError) return { ok: false, reason: "failed" };
  if (!pu) return { ok: false, reason: "no-account" };

  const { data: access, error: accessError } = await supabase
    .from("sanci_catalog_access")
    .select("enabled")
    .eq("partner_id", pu.partner_id)
    .maybeSingle();
  // Modul katalog belum dimigrasi ATAU belum dibuka untuk toko ini: keduanya
  // berarti proposal tidak punya isi yang sah untuk dicetak (LESSONS #12 —
  // tabel yang belum ada diperlakukan sebagai fitur belum aktif, bukan error).
  if (accessError) {
    return { ok: false, reason: isMissingTableError(accessError) ? "catalog-closed" : "failed" };
  }
  if (!(access as { enabled: boolean } | null)?.enabled) {
    return { ok: false, reason: "catalog-closed" };
  }

  // Produk dan galeri tidak saling bergantung — satu gelombang, bukan
  // berurutan. Galeri (0022) boleh belum ada: proposal tetap tercetak dengan
  // foto sampul saja.
  const [{ data: products, error: productsError }, { data: photos, error: photosError }] = await Promise.all([
    supabase
      .from("sanci_products")
      .select("id, name, code, category, description, size, photo_url, status")
      .in("id", ids),
    supabase.from("product_photos").select("product_id, photo_url").in("product_id", ids),
  ]);

  if (productsError) return { ok: false, reason: "failed" };
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
    // Produk yang sudah INACTIVE tidak dicetak sebagai profil: dokumen yang
    // dibawa pelanggan tidak boleh mempromosikan barang yang ditarik SANCI.
    // Barisnya TETAP ada di ringkasan halaman 1 (staf memang memilihnya) —
    // yang hilang cuma halaman profilnya.
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
        // Dedup dulu (foto sampul bisa juga terdaftar di galeri), baru
        // dipotong MAX_PHOTOS. Batasnya keputusan owner 2026-08-30: satu
        // produk dengan 20 foto membuat halamannya panjang tanpa menambah
        // apa pun untuk pelanggan yang sedang memutuskan.
        photos: Array.from(new Set(photos)).slice(0, MAX_PHOTOS),
      };
    });

  // Urutkan mengikuti urutan pilihan staf, bukan urutan pulang dari database.
  const rank = new Map(ids.map((id, i) => [id, i]));
  out.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));

  return { ok: true, products: out };
}
