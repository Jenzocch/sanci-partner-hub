"use client";

/**
 * Hook client bersama untuk keenam permukaan katalog "server-side search +
 * muat lebih banyak" (kontrak: lib/catalog-query.ts). SATU implementasi untuk
 * debounce/race/append supaya enam layar tidak menyimpang satu-satu:
 *
 *   - Ketikan di-debounce (300 ms) lalu DICARI DI SERVER; ganti kategori
 *     langsung mencari tanpa menunggu debounce.
 *   - Race-safety: setiap pencarian menaikkan nomor urut; respons yang datang
 *     terlambat (setelah pencarian yang lebih baru dimulai) DIBUANG — tanpa
 *     ini, jawaban lambat untuk "sof" bisa menimpa jawaban cepat untuk
 *     "sofa" (sepupu LESSONS #1: respons yang telat tidak boleh menang).
 *   - Jaringan lemah: pencarian yang GAGAL membiarkan hasil sebelumnya tetap
 *     tampil + `error` diisi untuk banner — daftar tidak pernah dikosongkan
 *     diam-diam oleh kegagalan (LESSONS #10 keluarga "jangan menyamarkan").
 *   - "Muat lebih banyak" menambah di belakang dengan DEDUPE per id — urutan
 *     name+id server sudah deterministik, dedupe ini jaring pengaman untuk
 *     baris yang bergeser karena tulisan konkuren di antara dua halaman.
 *   - Kembali ke keadaan tanpa filter memulihkan batch pertama hasil render
 *     server (tanpa fetch ulang) — kecuali pemakai bilang tidak boleh lewat
 *     `canRestoreInitial` (mis. /admin/produk saat filter stok aktif).
 *
 * `fetchPage` TIDAK boleh reject — pemakai membungkus Server Action-nya dan
 * memetakan semua outcome ke `{ ok:false, message }` (pola PickerLoadResult
 * yang sudah ada). Hook tetap menangkap reject tak terduga dengan
 * `fallbackErrorMessage` supaya layar tidak macet dalam keadaan loading.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type CatalogFetchInput = {
  q: string;
  category: string | null;
  offset: number;
  withCategories?: boolean;
};

export type CatalogFetchResult<T> =
  | { ok: true; products: T[]; hasMore: boolean; categories?: string[] }
  | { ok: false; message: string };

export const CATALOG_SEARCH_DEBOUNCE_MS = 300;

export function useCatalogSearch<T extends { id: string }>({
  fetchPage,
  initial,
  initialCategories,
  fallbackErrorMessage,
  canRestoreInitial,
}: {
  fetchPage: (input: CatalogFetchInput) => Promise<CatalogFetchResult<T>>;
  /** Batch pertama hasil render server; `null` = pemuatan malas (panggil ensureLoaded). */
  initial: { products: T[]; hasMore: boolean } | null;
  /** Daftar kategori lengkap dari server page; kosongkan untuk mode malas
   *  (diambil lewat withCategories pada fetch pertama). */
  initialCategories?: string[];
  /** Pesan error kalau fetchPage reject di luar kontrak (seharusnya tidak). */
  fallbackErrorMessage: string;
  /** Default true. Kembalikan false kalau ada filter di luar hook (mis. stok)
   *  yang membuat batch awal tidak mewakili keadaan "tanpa filter". */
  canRestoreInitial?: () => boolean;
}) {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [products, setProducts] = useState<T[]>(initial ? initial.products : []);
  const [hasMore, setHasMore] = useState(initial ? initial.hasMore : false);
  const [categories, setCategories] = useState<string[]>(initialCategories ?? []);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** true setelah minimal satu daftar sehat pernah tampil (batch server dihitung). */
  const [loadedOnce, setLoadedOnce] = useState(initial !== null);

  const seq = useRef(0);
  const debTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialRef = useRef(initial);
  const qRef = useRef(q);
  const categoryRef = useRef(category);
  const productsRef = useRef(products);
  const categoriesKnown = useRef((initialCategories ?? []).length > 0 || initial !== null);
  const startedRef = useRef(initial !== null);
  qRef.current = q;
  categoryRef.current = category;
  productsRef.current = products;

  // Timer debounce jangan hidup lebih lama dari komponennya.
  useEffect(() => {
    return () => {
      if (debTimer.current) clearTimeout(debTimer.current);
    };
  }, []);

  const runSearch = useCallback(
    (nextQ: string, nextCategory: string | null, opts?: { forceFetch?: boolean }) => {
      const trimmed = nextQ.trim();
      const restorable = canRestoreInitial ? canRestoreInitial() : true;
      if (
        !opts?.forceFetch &&
        trimmed === "" &&
        nextCategory === null &&
        restorable &&
        initialRef.current
      ) {
        // Filter kembali kosong — batch pertama dari server masih representatif,
        // pulihkan tanpa bolak-balik jaringan. seq dinaikkan supaya respons
        // pencarian yang masih terbang tidak menimpa pemulihan ini.
        seq.current += 1;
        setProducts(initialRef.current.products);
        setHasMore(initialRef.current.hasMore);
        setSearching(false);
        setError(null);
        return;
      }
      const mySeq = ++seq.current;
      setSearching(true);
      const wantCategories = !categoriesKnown.current;
      fetchPage({ q: trimmed, category: nextCategory, offset: 0, withCategories: wantCategories })
        .then((res) => {
          if (seq.current !== mySeq) return;
          setSearching(false);
          if (res.ok) {
            setProducts(res.products);
            setHasMore(res.hasMore);
            setError(null);
            setLoadedOnce(true);
            if (res.categories) {
              setCategories(res.categories);
              categoriesKnown.current = true;
            }
            // Mode malas tanpa filter: hasil pertama ini adalah "batch awal"
            // yang boleh dipulihkan saat filter dikosongkan lagi.
            if (trimmed === "" && nextCategory === null && !initialRef.current) {
              initialRef.current = { products: res.products, hasMore: res.hasMore };
            }
          } else {
            setError(res.message); // daftar sebelumnya SENGAJA dibiarkan tampil
          }
        })
        .catch(() => {
          if (seq.current !== mySeq) return;
          setSearching(false);
          setError(fallbackErrorMessage);
        });
    },
    [fetchPage, fallbackErrorMessage, canRestoreInitial]
  );

  /** Input pencarian — dipanggil onChange, fetch berangkat setelah debounce. */
  const setQuery = useCallback(
    (value: string) => {
      setQ(value);
      if (debTimer.current) clearTimeout(debTimer.current);
      debTimer.current = setTimeout(() => {
        debTimer.current = null;
        runSearch(value, categoryRef.current);
      }, CATALOG_SEARCH_DEBOUNCE_MS);
    },
    [runSearch]
  );

  /** Chip/dropdown kategori — langsung mencari, tidak menunggu debounce. */
  const setCategoryFilter = useCallback(
    (value: string | null) => {
      setCategory(value);
      if (debTimer.current) {
        clearTimeout(debTimer.current);
        debTimer.current = null;
      }
      runSearch(qRef.current, value);
    },
    [runSearch]
  );

  /** Jalankan ulang query saat ini (retry setelah error / filter luar berubah). */
  const reload = useCallback(() => {
    startedRef.current = true;
    runSearch(qRef.current, categoryRef.current, { forceFetch: true });
  }, [runSearch]);

  /** Mode malas: pemuatan pertama saat picker/panel dibuka. Idempoten. */
  const ensureLoaded = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    runSearch(qRef.current, categoryRef.current, { forceFetch: true });
  }, [runSearch]);

  const loadMore = useCallback(() => {
    if (loadingMore || searching || !hasMore) return;
    const mySeq = seq.current; // TIDAK menaikkan — pencarian baru membatalkan append ini
    setLoadingMore(true);
    fetchPage({
      q: qRef.current.trim(),
      category: categoryRef.current,
      offset: productsRef.current.length,
    })
      .then((res) => {
        // loadingMore SELALU dipulihkan — termasuk saat hasilnya dibuang
        // karena pencarian baru menyalip (tanpa ini tombolnya macet
        // "Memuat…" selamanya; tidak ada callback lain yang meresetnya).
        setLoadingMore(false);
        if (seq.current !== mySeq) return;
        if (res.ok) {
          const seen = new Set(productsRef.current.map((p) => p.id));
          const appended = [...productsRef.current, ...res.products.filter((p) => !seen.has(p.id))];
          setProducts(appended);
          setHasMore(res.hasMore);
          setError(null);
        } else {
          // hasMore dibiarkan true — tombolnya tetap ada sebagai jalur retry.
          setError(res.message);
        }
      })
      .catch(() => {
        setLoadingMore(false);
        if (seq.current !== mySeq) return;
        setError(fallbackErrorMessage);
      });
  }, [fetchPage, fallbackErrorMessage, hasMore, loadingMore, searching]);

  const isFiltered = q.trim() !== "" || category !== null;

  return {
    q,
    setQuery,
    category,
    setCategoryFilter,
    products,
    hasMore,
    categories,
    searching,
    loadingMore,
    error,
    loadedOnce,
    isFiltered,
    loadMore,
    reload,
    ensureLoaded,
  };
}
