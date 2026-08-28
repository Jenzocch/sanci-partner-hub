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
 *   - OPSIONAL `persist` (2026-08-28): simpan/pulihkan keadaan jelajah lewat
 *     sessionStorage. MATI kecuali pemakai mengisinya — saat ini hanya
 *     /cabang/produk, karena hanya di sana ada tombol kembali yang me-mount
 *     ulang daftarnya. Lihat catatan panjang di opsi `persist` di bawah.
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

/**
 * Berapa halaman maksimum yang dipulihkan `persist` (lihat di bawah). Batas
 * ini ada supaya pemulihan tidak pernah berubah jadi puluhan round-trip
 * server saat seseorang menekan "Muat Lebih Banyak" berkali-kali; lebih dari
 * ini, daftar dipulihkan sebagian dan tombolnya tetap ada.
 */
const PERSIST_MAX_RESTORE_PAGES = 8;

type PersistedCatalogState = { q: string; category: string | null; count: number; scrollY: number };

function readPersisted(key: string): PersistedCatalogState | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const o = parsed as Record<string, unknown>;
    // Nilai dari storage TIDAK dipercaya begitu saja (bisa tinggalan versi
    // lama / diubah tangan): apa pun yang bentuknya tidak cocok dibuang dan
    // layar kembali ke perilaku tanpa pemulihan.
    return {
      q: typeof o.q === "string" ? o.q : "",
      category: typeof o.category === "string" ? o.category : null,
      count: typeof o.count === "number" && Number.isFinite(o.count) && o.count > 0 ? Math.floor(o.count) : 0,
      scrollY: typeof o.scrollY === "number" && Number.isFinite(o.scrollY) && o.scrollY > 0 ? o.scrollY : 0,
    };
  } catch {
    return null;
  }
}

/**
 * Kembalikan posisi gulir setelah daftar dirender. Dicoba beberapa frame:
 * tinggi halaman baru mencapai `y` setelah kartu-kartunya terpasang (foto
 * memakai aspect-ratio, jadi tingginya sudah dipesan tanpa menunggu unduhan).
 * Berhenti begitu posisinya tercapai — tidak pernah melawan gulir pengguna
 * lebih dari beberapa frame.
 */
function restoreScrollTo(y: number) {
  if (y <= 0 || typeof window === "undefined") return;
  let tries = 0;
  const tick = () => {
    window.scrollTo(0, y);
    if (Math.abs(window.scrollY - y) > 2 && tries++ < 10) window.requestAnimationFrame(tick);
  };
  window.requestAnimationFrame(tick);
}

export function useCatalogSearch<T extends { id: string }>({
  fetchPage,
  initial,
  initialCategories,
  fallbackErrorMessage,
  canRestoreInitial,
  persist,
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
  /**
   * OPT-IN, MATI TOTAL kalau tidak diisi (lima permukaan lain tidak berubah
   * sedikit pun — tiap efek di bawah keluar lebih dulu saat `persist`
   * undefined). Diisi = simpan keadaan jelajah (kata kunci, kategori, berapa
   * halaman sudah dimuat, posisi gulir) ke sessionStorage dengan kunci ini
   * dan pulihkan saat komponen dipasang lagi.
   *
   * Kenapa perlu (audit 2026-08-28): tombol kembali di /cabang/produk/[id]
   * adalah `<Link>` push ke /cabang/produk, jadi daftarnya di-mount ULANG
   * dan seluruh state hook ini (yang semuanya useState) lahir kosong.
   * Manajer yang membandingkan tiga produk untuk satu pelanggan kehilangan
   * pencariannya tiga kali.
   *
   * `sessionStorage`, bukan localStorage: keadaan jelajah adalah milik satu
   * sesi tab, tidak boleh muncul lagi minggu depan. Storage yang diblokir
   * (mode privat) tidak boleh mematahkan halaman — semua akses dibungkus
   * try/catch dan kegagalannya berarti "tidak ada pemulihan", bukan error.
   */
  persist?: { key: string };
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
  const searchingRef = useRef(searching);
  const categoriesKnown = useRef((initialCategories ?? []).length > 0 || initial !== null);
  const startedRef = useRef(initial !== null);
  qRef.current = q;
  categoryRef.current = category;
  productsRef.current = products;
  searchingRef.current = searching;

  // Timer debounce jangan hidup lebih lama dari komponennya.
  useEffect(() => {
    return () => {
      if (debTimer.current) clearTimeout(debTimer.current);
    };
  }, []);

  // ── Adopsi batch awal SEGAR dari router.refresh() ──
  // useState di atas hanya membaca `initial` SEKALI saat mount. Akibatnya
  // (ditemukan review 2026-08-28, LESSONS #45): setiap router.refresh()
  // sesudah simpan — buat produk, ubah produk, ganti stok, nonaktifkan —
  // mengirim props baru yang DIABAIKAN: kartu tetap menampilkan data
  // pra-simpan, produk baru tidak pernah muncul, dan prefill modal Ubah
  // datang dari baris basi (dengan tulisan tanpa syarat seperti `size`,
  // itu = data terhapus diam-diam saat simpan kedua). Efek ini mengenali
  // batch segar lewat IDENTITAS array-nya (server component hanya mengirim
  // array baru saat ia benar-benar dirender ulang; render ulang client
  // memakai objek props yang sama) lalu:
  //   1. SELALU memperbarui initialRef — pemulihan "filter dikosongkan"
  //      tidak boleh menghidupkan kembali baris basi;
  //   2. mengadopsinya ke state HANYA saat tampilan masih mewakili batch
  //      awal (tanpa q/kategori/filter luar, belum tumbuh lewat "Muat Lebih
  //      Banyak" — daftar yang sudah digulung dalam tidak boleh runtuh
  //      kembali gara-gara satu simpanan; baris yang diedit di keadaan itu
  //      tetap benar lewat patchProduct di bawah).
  const lastInitialProducts = useRef<T[] | null>(initial ? initial.products : null);
  useEffect(() => {
    if (!initial || initial.products === lastInitialProducts.current) return;
    lastInitialProducts.current = initial.products;
    initialRef.current = initial;
    const restorable = canRestoreInitial ? canRestoreInitial() : true;
    if (
      qRef.current.trim() === "" &&
      categoryRef.current === null &&
      restorable &&
      productsRef.current.length <= initial.products.length
    ) {
      // seq dinaikkan supaya respons fetch yang masih terbang tidak menimpa
      // data segar (pola persis jalur pemulihan di runSearch).
      seq.current += 1;
      setProducts(initial.products);
      setHasMore(initial.hasMore);
      // Respons yang barusan dibatalkan TIDAK sempat menjalankan
      // setSearching(false) — guard seq di runSearch berada SEBELUM baris
      // itu — jadi tanpa reset di sini spinner "Mencari…" macet selamanya.
      setSearching(false);
      setError(null);
      setLoadedOnce(true);
    }
  }, [initial, canRestoreInitial]);

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

  // ── Simpan & pulihkan keadaan jelajah (OPT-IN lewat `persist`) ──
  // Semua efek di blok ini berhenti di baris pertama kalau `persist` tidak
  // diisi, jadi lima permukaan katalog lainnya tidak berubah perilakunya.
  const persistKey = persist?.key ?? null;
  /** true selama pemulihan multi-halaman berjalan (pemakai boleh menunda
   *  gulir-ke-atas/animasinya sendiri sampai daftar utuh). */
  const [restoring, setRestoring] = useState(false);
  const scrollYRef = useRef(0);
  const snapshotRef = useRef<{ q: string; category: string | null; count: number }>({
    q,
    category,
    count: products.length,
  });
  snapshotRef.current = { q, category, count: products.length };
  /** Menulis ke storage baru boleh SESUDAH pemulihan selesai — kalau tidak,
   *  keadaan transisi (daftar masih 1 halaman) menimpa yang tersimpan. */
  const persistReady = useRef(false);
  const restoreStarted = useRef(false);

  const writePersist = useCallback(() => {
    if (!persistKey || !persistReady.current) return;
    try {
      window.sessionStorage.setItem(
        persistKey,
        JSON.stringify({ ...snapshotRef.current, scrollY: scrollYRef.current })
      );
    } catch {
      // Storage diblokir/penuh (mode privat): pemulihan hilang, halaman
      // tetap jalan. Ini kenyamanan, bukan data yang pengguna ketik.
    }
  }, [persistKey]);

  useEffect(() => {
    if (!persistKey || restoreStarted.current) return;
    restoreStarted.current = true;
    const saved = readPersisted(persistKey);
    const initialProducts = initialRef.current?.products ?? [];
    if (!saved) {
      persistReady.current = true;
      return;
    }
    const hasFilter = saved.q.trim() !== "" || saved.category !== null;
    if (!hasFilter && saved.count <= initialProducts.length) {
      // Batch server sudah persis mewakili keadaan tersimpan — tidak ada
      // yang perlu diambil ulang, cukup kembalikan posisi gulirnya.
      persistReady.current = true;
      restoreScrollTo(saved.scrollY);
      return;
    }
    setQ(saved.q);
    setCategory(saved.category);
    const mySeq = ++seq.current;
    setSearching(true);
    setRestoring(true);
    const finish = () => {
      persistReady.current = true;
      setRestoring(false);
    };
    void (async () => {
      // Halaman-halaman diminta BERURUTAN dengan offset = jumlah baris yang
      // sudah terkumpul — sama persis dengan cara loadMore menghitungnya,
      // jadi hook ini tidak perlu tahu ukuran halaman server.
      const acc: T[] = hasFilter ? [] : [...initialProducts];
      const seen = new Set(acc.map((p) => p.id));
      let more = initialRef.current?.hasMore ?? false;
      for (let i = 0; i < PERSIST_MAX_RESTORE_PAGES; i++) {
        let res: CatalogFetchResult<T>;
        try {
          res = await fetchPage({
            q: saved.q.trim(),
            category: saved.category,
            offset: acc.length,
            withCategories: i === 0 && !categoriesKnown.current,
          });
        } catch {
          res = { ok: false, message: fallbackErrorMessage };
        }
        // Pengguna sudah mengetik/menekan chip duluan: pencarian yang lebih
        // baru menang, pemulihan ini dibuang diam-diam (pola seq runSearch).
        if (seq.current !== mySeq) return finish();
        if (!res.ok) {
          // Daftar yang sudah tampil SENGAJA dibiarkan (LESSONS #10) —
          // banner error + tombol "Muat Lebih Banyak" tetap jadi jalan
          // keluarnya; pemulihan tidak boleh mengosongkan layar.
          setSearching(false);
          setError(res.message);
          return finish();
        }
        if (res.categories) {
          setCategories(res.categories);
          categoriesKnown.current = true;
        }
        for (const p of res.products) {
          if (!seen.has(p.id)) {
            seen.add(p.id);
            acc.push(p);
          }
        }
        more = res.hasMore;
        if (!more || acc.length >= saved.count) break;
      }
      if (seq.current !== mySeq) return finish();
      setProducts(acc);
      setHasMore(more);
      setSearching(false);
      setError(null);
      setLoadedOnce(true);
      finish();
      restoreScrollTo(saved.scrollY);
    })();
    // Sengaja hanya bergantung pada kunci: ini pemulihan SEKALI saat mount
    // (dijaga restoreStarted), bukan efek yang boleh berjalan ulang.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistKey]);

  // Simpan tiap kali keadaan yang dipulihkan berubah.
  useEffect(() => {
    if (!persistKey) return;
    writePersist();
  }, [persistKey, writePersist, q, category, products.length]);

  // Posisi gulir: listener pasif hanya MENCATAT ke ref (murah), penulisan ke
  // storage di-throttle. Nilai yang disimpan sengaja diambil dari ref, bukan
  // window.scrollY saat unmount — saat navigasi push, browser/Next sudah
  // sempat menggulir ke atas sebelum komponen ini dilepas.
  useEffect(() => {
    if (!persistKey) return;
    scrollYRef.current = window.scrollY;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      scrollYRef.current = window.scrollY;
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        writePersist();
      }, 300);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", writePersist);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", writePersist);
      if (timer) clearTimeout(timer);
      writePersist();
    };
  }, [persistKey, writePersist]);

  /**
   * Perbaiki SATU baris di tempat setelah server MEMASTIKAN tulisan sukses
   * (safeWrite ok — LESSONS #7: hanya patch dengan nilai yang terbukti
   * tersimpan). Menutup celah yang tidak dijangkau adopsi di atas: saat
   * pencarian/filter/gulungan aktif, baris di state datang dari fetch lama —
   * tanpa patch ini, membuka Ubah lagi mem-prefill nilai pra-simpan dan
   * Simpan berikutnya menulis balik data lama (LESSONS #45). initialRef ikut
   * dipatch supaya "kosongkan filter" tidak memulihkan baris pra-simpan.
   *
   * Race yang SENGAJA ditangani di sini (temuan verifikasi 2026-08-28):
   * respons pencarian yang MASIH TERBANG saat patch terjadi dibaca server
   * SEBELUM tulisan ini commit — kalau dibiarkan mendarat, setProducts-nya
   * mengganti seluruh daftar dan mengembalikan baris ini ke nilai pra-simpan
   * (dan celah hapus-diam-diam hidup lagi). Maka: bila ada pencarian yang
   * sedang berjalan, jalankan ULANG query yang sama (forceFetch menaikkan
   * seq → respons basi dibuang, respons baru dibaca sesudah commit).
   * "Muat Lebih Banyak" TIDAK butuh perlakuan ini: append-nya dedupe per id
   * dan baris yang SUDAH ada di state (yang barusan dipatch) selalu menang.
   */
  const patchProduct = useCallback(
    (id: string, patch: Partial<T>) => {
      setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
      const init = initialRef.current;
      if (init) {
        initialRef.current = {
          ...init,
          products: init.products.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        };
      }
      if (searchingRef.current) {
        runSearch(qRef.current, categoryRef.current, { forceFetch: true });
      }
    },
    [runSearch]
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
    /** true selama pemulihan `persist` berjalan; selalu false tanpa `persist`. */
    restoring,
    error,
    loadedOnce,
    isFiltered,
    loadMore,
    reload,
    ensureLoaded,
    patchProduct,
  };
}
