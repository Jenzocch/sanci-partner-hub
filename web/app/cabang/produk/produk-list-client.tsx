"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { STOCK_STATUS_CHIP, stockStatusLabel, type StockStatus } from "@/lib/catalog-shared";
import { useCatalogSearch, type CatalogFetchResult } from "@/lib/use-catalog-search";
import { useCabangMessages } from "@/lib/i18n/provider";
import { formatIDR } from "@/lib/orders-shared";
import ProductImg from "@/lib/product-img";
import { getCatalogPageBranch } from "@/app/cabang/catalog-actions";
import styles from "./produk.module.css";

/**
 * Persis field yang DIRENDER kartu grid. `description` sengaja tidak ada:
 * kartu hanya menampilkan foto/nama/kategori/harga/status stok, jadi
 * mengangkutnya dari database ke ponsel (60 baris per halaman, teks bisa
 * ratusan karakter per baris) adalah muatan yang tidak pernah dibaca. Yang
 * MENAMPILKAN deskripsi adalah halaman detail /cabang/produk/[productId] —
 * halaman itu memuat produknya sendiri dan tidak bergantung pada tipe ini.
 */
export type ProdukItem = {
  id: string;
  name: string;
  code: string | null;
  category: string | null;
  photoUrl: string | null;
  stockStatus: StockStatus;
  /**
   * Harga Normal toko ini untuk KARTU (keputusan owner 2026-08-28) — TIGA
   * keadaan, sama seperti kartu /admin/produk (kontrak applyDisplayPrices,
   * LESSONS #10):
   *   number    → harga efektif toko ini (override sendiri → Harga Dasar);
   *   null      → DIPASTIKAN belum ada harga;
   *   undefined → query harga gagal / migrasi 0021 belum jalan.
   * Ketiganya WAJIB dibedakan di layar: manajer yang sedang menyebut harga
   * ke pelanggan tidak boleh membaca "belum ada harga" padahal yang terjadi
   * adalah query gagal.
   */
  displayPrice?: number | null;
};

/** Kunci sessionStorage keadaan jelajah (dibaca use-catalog-search). */
const BROWSE_STATE_KEY = "cabang.produk.browse";

/**
 * Daftar Produk cabang — sejak 2026-08-26 pencarian & filter kategori
 * dieksekusi DATABASE dan daftar tumbuh per 60 lewat "Muat Lebih Banyak"
 * (kontrak lib/catalog-query.ts; menggantikan pola lama "muat ≤200 lalu
 * saring di client"). Batch pertama tetap dirender server (props initial*);
 * fetch lanjutan lewat getCatalogPageBranch — gerbang katalog + RLS yang
 * sama dengan halaman ini sendiri. Outcome fetch dipetakan ke kalimat slice
 * cabang di sini (error ≠ belum dibuka ≠ kosong, LESSONS #10); kegagalan
 * pencarian membiarkan hasil sebelumnya tetap tampil (lihat hook).
 *
 * Keadaan jelajah (kata kunci, kategori, jumlah halaman, posisi gulir)
 * DISIMPAN ke sessionStorage lewat opsi `persist` hook: tombol kembali di
 * halaman detail adalah `<Link>` push yang me-mount ulang komponen ini,
 * jadi tanpa itu manajer yang membandingkan tiga produk kehilangan
 * pencariannya tiga kali (audit 2026-08-28).
 */
export default function ProdukListClient({
  initialItems,
  initialHasMore,
  categories,
}: {
  initialItems: ProdukItem[];
  initialHasMore: boolean;
  /** Daftar kategori LENGKAP dari server page (independen dari halaman tampil). */
  categories: string[];
}) {
  const m = useCabangMessages();

  const fetchForHook = useCallback(
    async (input: { q: string; category: string | null; offset: number; withCategories?: boolean }): Promise<
      CatalogFetchResult<ProdukItem>
    > => {
      try {
        // withDisplayPrices (0021 + keputusan owner 2026-08-28): batch
        // susulan/pencarian membawa harga kartu juga, supaya kartu hasil
        // pencarian tidak pernah kehilangan harga yang tampil di batch
        // pertama. BUKAN `withPrices` — itu kontrak prefill kalkulator/
        // picker yang boleh diam-diam hilang, lihat lib/catalog-query.ts.
        const res = await getCatalogPageBranch({ ...input, withDisplayPrices: true });
        if (res.status === "ok") {
          return {
            ok: true,
            hasMore: res.hasMore,
            categories: res.categories,
            products: res.products.map((p) => ({
              id: p.id,
              name: p.name,
              code: p.code,
              category: p.category,
              photoUrl: p.photo_url,
              stockStatus: p.stock_status,
              // "in" (bukan `?? null`): TANPA field = query harga gagal,
              // dan itu keadaan yang berbeda dari null "belum ada harga".
              displayPrice: "display_price" in p ? p.display_price : undefined,
            })),
          };
        }
        if (res.status === "not_opened") return { ok: false, message: m.cabang.catalogNotOpenedMsg };
        if (res.status === "module_inactive") return { ok: false, message: m.cabang.errCatalogModuleInactive };
        return { ok: false, message: m.cabang.errProductListLoadFailed };
      } catch {
        return { ok: false, message: m.cabang.errProductListLoadFailed };
      }
    },
    [m]
  );

  const katalog = useCatalogSearch<ProdukItem>({
    fetchPage: fetchForHook,
    initial: { products: initialItems, hasMore: initialHasMore },
    initialCategories: categories,
    fallbackErrorMessage: m.cabang.errProductListLoadFailed,
    persist: { key: BROWSE_STATE_KEY },
  });
  const { products, hasMore, searching, loadingMore, restoring, error } = katalog;

  const sortedCategories = useMemo(
    () => [...katalog.categories].sort((a, b) => a.localeCompare(b, m.common.dateLocale)),
    [katalog.categories, m.common.dateLocale]
  );

  // ── Umpan balik saat daftar berubah ──
  // Dua kejadian yang berbeda dan tidak boleh tertukar:
  //   GANTI (pencarian/kategori) → gulir kembali ke atas; tanpa ini hasil
  //     baru "dimulai" di tengah layar dan tampak seperti tidak berubah.
  //   TAMBAH ("Muat Lebih Banyak") → JANGAN gulir ke atas (itu membuang
  //     tempat pengguna berada); sebagai gantinya umumkan lewat aria-live
  //     dan bawa kartu baru PERTAMA ke dalam pandangan.
  // Keduanya dikenali dari isi daftar itu sendiri (baris terakhir yang lama
  // masih di posisi yang sama = penambahan), bukan dari menebak sebabnya.
  const prevProductsRef = useRef<ProdukItem[]>(products);
  const firstNewCardRef = useRef<HTMLAnchorElement | null>(null);
  const [firstNewIndex, setFirstNewIndex] = useState<number | null>(null);
  const [announce, setAnnounce] = useState("");
  /**
   * Ref TERPISAH untuk melacak transisi `restoring` (bukan cuma nilainya
   * sekarang) — perbaikan LESSONS-worthy 2026-08-28: versi sebelumnya
   * menyimpan "sedang/pernah restoring" di sebuah flag yang HANYA dikonsumsi
   * di dalam cabang append-heuristic di bawah. Itu bocor dua arah:
   *   1. Array hasil pemulihan (mulai dari batch awal, ditambah halaman-
   *      halaman berikutnya — lihat use-catalog-search.ts) berbentuk PERSIS
   *      seperti hasil "Muat Lebih Banyak" (ekor array sama dengan array
   *      lama), jadi heuristik appended di bawah SALAH mengenalinya sebagai
   *      pertambahan halaman — memicu pengumuman aria-live palsu dan
   *      scrollIntoView yang berebut frame dengan restoreScrollTo milik hook.
   *   2. Kalau pemulihan DIBATALKAN di tengah jalan (pengguna mengetik
   *      pencarian baru sebelum semua halaman termuat), `products` tidak
   *      pernah berubah pada render itu — efek pulang lebih dulu tanpa
   *      sempat mengonsumsi flag-nya. Flag itu lalu bocor ke perubahan
   *      `products` BERIKUTNYA, yaitu hasil pencarian BARU yang sungguhan,
   *      dan gulir-ke-atas untuk pencarian itu ikut terlewat — pas seperti
   *      yang diperingatkan komentar di bawah.
   * Solusinya: deteksi transisi restoring true→false LANGSUNG di render itu
   * juga (lewat ref sebelumnya), sebelum heuristik appended sempat jalan,
   * dan konsumsi begitu transisi terjadi — bukan menunggu products berubah.
   */
  const prevRestoringRef = useRef(restoring);

  useEffect(() => {
    const prev = prevProductsRef.current;
    const berubah = prev !== products;
    prevProductsRef.current = products;

    const sedangPulih = prevRestoringRef.current;
    prevRestoringRef.current = restoring;

    // Masih memuat halaman demi halaman — belum ada yang perlu ditanggapi
    // (loop di hook belum memanggil setProducts sampai halaman terakhir).
    if (restoring) {
      if (berubah) {
        setFirstNewIndex(null);
        setAnnounce("");
      }
      return;
    }

    // BARU SAJA selesai memulihkan — baik berhasil (products berubah,
    // restoreScrollTo hook sudah menempatkan posisi gulir yang benar) MAUPUN
    // dibatalkan pencarian baru (products TIDAK berubah). Kedua kasus
    // ditangani DI SINI, di render transisi ini juga — bukan ditunda —
    // supaya flagnya tidak sempat bocor ke render berikutnya.
    if (sedangPulih) {
      if (berubah) {
        setFirstNewIndex(null);
        setAnnounce("");
      }
      return;
    }

    if (!berubah) return;
    const appended =
      prev.length > 0 && products.length > prev.length && products[prev.length - 1]?.id === prev[prev.length - 1]?.id;
    if (appended) {
      setFirstNewIndex(prev.length);
      setAnnounce(m.cabang.produkLoadedMoreAnnounce.replace("{n}", String(products.length - prev.length)));
      return;
    }
    setFirstNewIndex(null);
    setAnnounce("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [products, restoring, m]);

  useEffect(() => {
    if (firstNewIndex === null) return;
    firstNewCardRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [firstNewIndex]);

  return (
    <>
      <div className="searchrow">
        <input
          className="search-input"
          type="search"
          placeholder={m.common.produkSearchPlaceholder}
          value={katalog.q}
          onChange={(e) => katalog.setQuery(e.target.value)}
          // Kode produk (ML03-R200, WMRC611-180) berkelahi dengan koreksi
          // otomatis papan ketik ponsel: huruf pertama dibesarkan dan kata
          // "diperbaiki" jadi kata Indonesia terdekat.
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
        />
      </div>

      {sortedCategories.length > 0 && (
        <div className={styles.filters}>
          <button
            type="button"
            className={`${styles.filterchip}${katalog.category === null ? ` ${styles.filterOn}` : ""}`}
            onClick={() => katalog.setCategoryFilter(null)}
          >
            {m.common.filterAll}
          </button>
          {sortedCategories.map((c) => (
            <button
              key={c}
              type="button"
              className={`${styles.filterchip}${katalog.category === c ? ` ${styles.filterOn}` : ""}`}
              onClick={() => katalog.setCategoryFilter(katalog.category === c ? null : c)}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {/* Pencarian gagal ≠ daftar kosong: hasil sebelumnya tetap tampil di
          bawah banner ini (jaringan lemah tidak boleh mengosongkan layar). */}
      {error && <div className="banner bad">{error}</div>}
      {searching && <div className="hint">{m.common.loading}</div>}

      {/* Pengumuman untuk pembaca layar; pengguna awas melihat tombolnya
          berubah + kartu baru pertama masuk pandangan. */}
      <div aria-live="polite" className="sr-only">
        {announce}
      </div>

      {products.length === 0 ? (
        !searching && (
          <div className="card emptybox">
            {katalog.isFiltered ? m.common.noProductsMatchSearch : m.common.noProductsYet}
          </div>
        )
      ) : (
        <div
          className={styles.grid}
          // Selama pencarian berjalan, daftar LAMA sengaja tetap tampil
          // (kegagalan tidak boleh mengosongkan layar) — tapi tanpa penanda,
          // hasil basi itu terlihat seperti jawaban atas ketikan terbaru.
          // Diredupkan + tidak bisa ditekan = "ini belum jawabannya".
          style={searching ? { opacity: 0.45, pointerEvents: "none" } : undefined}
          aria-busy={searching || undefined}
        >
          {products.map((it, i) => {
            const isOut = it.stockStatus === "OUT_OF_STOCK";
            return (
              <Link
                key={it.id}
                ref={i === firstNewIndex ? firstNewCardRef : undefined}
                href={`/cabang/produk/${it.id}`}
                className={`${styles.card}${isOut ? ` ${styles.outofstock}` : ""}`}
                aria-label={m.cabang.produkViewDetailAria.replace("{name}", it.name)}
              >
                <div className={styles.photo}>
                  <ProductImg
                    src={it.photoUrl}
                    alt={it.name}
                    placeholder={<div className={styles.placeholder}>{m.common.noPhotoPlaceholder}</div>}
                  />
                </div>
                <div className={styles.body}>
                  <div className={styles.name}>{it.name}</div>
                  {it.category && <div className={styles.cat}>{it.category}</div>}
                  {/* Harga Normal toko ini (keputusan owner 2026-08-28).
                      TIGA keadaan dibedakan — angka / "belum ada harga" /
                      "gagal dimuat" (LESSONS #10). */}
                  <div>
                    {typeof it.displayPrice === "number" ? (
                      <span className={styles.price}>{formatIDR(it.displayPrice)}</span>
                    ) : it.displayPrice === null ? (
                      <span className="small muted">{m.cabang.produkCardPriceNone}</span>
                    ) : (
                      <span className="small muted">{m.cabang.produkCardPriceLoadFailed}</span>
                    )}
                  </div>
                  <span className={STOCK_STATUS_CHIP[it.stockStatus]}>{stockStatusLabel(m, it.stockStatus)}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {hasMore && products.length > 0 && (
        <div className="btnrow" style={{ justifyContent: "center", marginTop: 14 }}>
          <button
            type="button"
            className="btn"
            onClick={katalog.loadMore}
            disabled={loadingMore || searching}
          >
            {loadingMore ? m.common.loading : m.common.loadMoreCta}
          </button>
        </div>
      )}
    </>
  );
}
