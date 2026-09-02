"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { STOCK_STATUS_CHIP, stockStatusLabel, type StockStatus } from "@/lib/catalog-shared";
import type { CatalogPageInput, CatalogPageOutcome } from "@/lib/catalog-query";
import { useCatalogSearch, type CatalogFetchResult } from "@/lib/use-catalog-search";
import { useCommonMessages } from "@/lib/i18n/provider";
import { formatIDR, parseIDRInput } from "@/lib/orders-shared";
import DraftBanner from "@/lib/draft-banner";
import {
  CALC_MAX_DISCOUNT_SLOTS,
  CALC_MAX_QTY,
  CALC_DRAFT_DEBOUNCE_MS,
  discountChainMultiplier,
  computeChainFinal,
  emptyCartState,
  readCalcDraft,
  writeCalcDraft,
  clearCalcDraft,
  writeCalcHandoff,
  type CalcArea,
  type CalcLine,
  type CalcCartState,
  type CalcDraft,
  type ColorOptionRow,
  type FetchColorsFn,
} from "@/lib/calculator-shared";
import { writeProposalHandoff } from "@/lib/proposal-shared";
import { takeCalcPrefill } from "@/lib/calc-prefill";
import styles from "./kalkulator.module.css";

export type KalkulatorProduct = {
  id: string;
  name: string;
  code: string | null;
  category: string | null;
  photoUrl: string | null;
  stockStatus: StockStatus;
  /**
   * Harga efektif 0021 (override partner → Harga Dasar SANCI) — PREFILL
   * harga satuan saat produk masuk keranjang. null/absen = tidak ada
   * harga di daftar (perilaku lama: mulai 0, ketik manual). Kolom harga
   * keranjang SELALU tetap bisa diketik — ini nilai awal, bukan kunci.
   */
  price?: number | null;
};

/**
 * CTA "Buat Pesanan" — teks DAN tujuannya milik route pemasang (masing-
 * masing area menyebut alur pesanannya sendiri), jadi dikirim sebagai prop,
 * bukan dibaca dari `useCommonMessages()` atau di-hardcode di sini:
 *   - route cabang: teks slice cabang + `href` /cabang/pesanan/baru
 *     (hand-off area "cabang" dibaca form pesanan baru cabang);
 *   - route admin (sejak 2026-08-24): teks slice admin + `href`
 *     /admin/orders/baru (hand-off area "admin" dibaca form pesanan admin).
 * `href` WAJIB sepasang dengan `area`: hand-off ditulis ke key localStorage
 * milik `area`, dan hanya form di `href` area itu yang membacanya
 * (lib/calculator-shared.ts). Route yang tidak mau CTA mengirim `null` —
 * tombol + scope note tidak dirender sama sekali.
 */
export type KalkulatorConvert = { cta: string; scopeNote: string; href: string };

/**
 * CTA "Buat Proposal" — dokumen cetak yang dibawa pulang pelanggan
 * (lib/proposal-shared.ts). Teks + tujuan datang sebagai prop dengan alasan
 * yang PERSIS sama dengan KalkulatorConvert di atas: komponen ini dipasang
 * di dua area dan hanya membaca slice `common`, sementara teks ini milik
 * slice area pemasang. Route yang belum punya halaman proposal mengirim
 * `null` — tombolnya tidak dirender sama sekali (per 2026-08-30 baru rute
 * cabang yang punya; sisi admin tinggal mengirim prop ini kalau kelak mau).
 */
export type KalkulatorProposal = { cta: string; href: string; saveFailed: string };

/**
 * Pesan hasil fetch katalog per area — komponen ini hanya membaca slice
 * `common`, sedangkan kalimat "katalog belum dibuka"/"modul belum aktif"/
 * "gagal memuat" milik slice area pemasang, jadi dikirim sebagai prop string
 * (pola yang sama dengan `convert`). `notOpened` hanya relevan di cabang
 * (action admin tidak pernah mengembalikan status itu).
 */
export type KalkulatorFetchMessages = {
  notOpened?: string;
  moduleInactive: string;
  loadFailed: string;
};

/**
 * Kalkulator Penawaran — dipasang di DUA route: /cabang/kalkulator (sejak
 * awal) dan /admin/kalkulator (2026-08-22). SATU komponen, bukan dua salinan
 * — lihat catatan panjang di masing-masing page.tsx untuk penyimpangan
 * sengaja (tanpa gerbang izin diskon, tanpa tulis DB sampai "Buat Pesanan").
 * Komponen ini murni state lokal + localStorage (lib/calculator-shared.ts) —
 * tidak ada Server Action di file ini sama sekali, konsisten dengan prinsip
 * "tidak ada yang tersimpan selagi dipakai". Semua teksnya dari slice
 * `common` (dibaca lewat useCommonMessages, yang jalan di bawah provider
 * Cabang MAUPUN Admin), kecuali CTA konversi (prop, lihat KalkulatorConvert).
 */
export default function KalkulatorClient({
  initialProducts,
  initialHasMore,
  initialCategories,
  fetchPage,
  fetchMessages,
  area,
  convert,
  proposal = null,
  fetchColors,
}: {
  /** Batch pertama (60) hasil render server — halaman langsung terisi tanpa
   *  fetch client di paint pertama; batch berikut & pencarian lewat fetchPage. */
  initialProducts: KalkulatorProduct[];
  initialHasMore: boolean;
  /** Daftar kategori LENGKAP (independen dari halaman yang sedang tampil). */
  initialCategories: string[];
  /** Server Action katalog milik area pemasang (kontrak lib/catalog-query.ts). */
  fetchPage: (input: CatalogPageInput) => Promise<CatalogPageOutcome>;
  fetchMessages: KalkulatorFetchMessages;
  /** Menentukan key draf localStorage (terpisah per area, lihat calculator-shared.ts). */
  area: CalcArea;
  convert: KalkulatorConvert | null;
  /** Lihat KalkulatorProposal — `null`/tidak dikirim = tombolnya tidak ada. */
  proposal?: KalkulatorProposal | null;
  /** Server Action per area untuk daftar warna aktif satu produk (Fitur C,
   *  migrasi 0025) — sama kontraknya dengan lib/order-item-picker.tsx. */
  fetchColors: FetchColorsFn;
}) {
  const m = useCommonMessages();
  const router = useRouter();

  const [tab, setTab] = useState<"produk" | "keranjang">("produk");

  const [lines, setLines] = useState<CalcLine[]>([]);
  const [discountSlots, setDiscountSlots] = useState<string[]>([""]);
  const [markup, setMarkup] = useState("");
  const [cash, setCash] = useState("");

  /** Kegagalan menulis hand-off proposal ke localStorage — lihat handleMakeProposal. */
  const [proposalErr, setProposalErr] = useState<string | null>(null);
  /**
   * Baris mana yang BARU SAJA menyerap baris lain karena warnanya bertabrakan
   * (audit UI 2026-09-01). Tanpa ini penggabungan itu SEPENUHNYA senyap:
   * baris yang jarinya baru menyentuh lenyap begitu saja dan staf menyimpulkan
   * sistem memakannya, lalu menambah ulang — qty jadi salah dan harga yang
   * dibacakan ke pelanggan ikut salah (LESSONS #10: jangan pernah menggabung
   * diam-diam). `key` = identitas baris yang BERTAHAN; catatan ini otomatis
   * lenyap saat baris itu tidak ada lagi karena render-nya dikunci ke key.
   */
  const [colorMergedNote, setColorMergedNote] = useState<{ key: string; name: string } | null>(null);
  /** Ringkasan isi pesanan yang baru saja dibawa masuk dari halaman pesanan. */
  const [prefill, setPrefill] = useState<{
    n: number;
    skipped: number;
    /** Berapa baris pesanan yang LEBUR jadi satu karena produknya sama. */
    merged: number;
    customerName: string;
  } | null>(null);

  const [pendingDraft, setPendingDraft] = useState<CalcDraft | null>(null);
  const [ready, setReady] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Baca draf SEKALI saat mount. TIDAK langsung dipulihkan (SPEC §58,
  // LESSONS #1) — kalau ada draf lama, tampilkan DraftBanner dan tunggu
  // pengguna memilih. Kalau tidak ada draf, langsung "ready" untuk mulai
  // auto-save state kosong saat ini (tidak ada apa pun yang bisa hilang).
  // (`area` konstan sepanjang umur halaman — masuk deps hanya demi kejujuran
  // exhaustive-deps, tidak pernah memicu baca ulang.)
  useEffect(() => {
    // Isi pesanan yang dibawa dari halaman pesanan DITUANG LANGSUNG, tidak
    // menunggu persetujuan seperti draf: pengguna baru saja memintanya
    // beberapa detik lalu dengan menekan tombol, dan hasilnya kelihatan
    // seluruhnya di keranjang. Yang dilarang SPEC §58 adalah state lama yang
    // menyembul TANPA diminta — bukan ini. Harga sengaja 0: pesanan tidak
    // menyimpan harga jual ke pelanggan (lihat lib/calc-prefill.ts).
    const pre = takeCalcPrefill(area);
    if (pre) {
      if (pre.lines.length > 0) {
        // GABUNGKAN baris dengan produk DAN WARNA yang SAMA (audit
        // 2026-08-31, kunci gabungnya diperluas 2026-09-01 untuk ikut
        // warna).
        //
        // Satu pesanan BOLEH memuat produk yang sama lebih dari sekali:
        // order_items tidak punya unique (order_id, product_id) — 0014 —
        // dan kolom color_code/custom_size memang ada supaya "sofa krem 2"
        // dan "sofa abu 3" menjadi DUA baris. Sufiks idempotency-nya juga
        // dua ruang nama yang sengaja terpisah (`:item:` salinan Package vs
        // `:calc-item:` isi kalkulator), jadi satu pesanan bisa punya
        // keduanya untuk produk yang sama. Keduanya kini memakai kunci yang
        // unik BERDASARKAN KONSTRUKSI di ruangnya masing-masing: Package
        // memakai id baris paketnya (primary key), kalkulator memakai
        // (productId, colorCode) yang dijaga unik oleh penggabungan
        // keranjang di berkas ini.
        //
        // Sementara itu SELURUH model keranjang kalkulator memakai pasangan
        // (productId, colorCode) sebagai identitas baris: addToCart
        // menambah qty ke baris yang sudah ada, dan removeLine/setLineQty/
        // setLineUnitPrice semuanya mencocokkan pasangan itu. Menuang dua
        // baris ber-productId sama TAPI WARNA BEDA ke dalamnya sebagai SATU
        // baris akan merusak keranjang DIAM-DIAM (2+3 jadi 3+3 — subtotal
        // salah, dan salahnya ikut tercetak di proposal yang dibawa pulang
        // pelanggan) — makanya kunci gabungnya WAJIB ikut warna, bukan
        // sekadar productId (itulah persis regresi yang HAMPIR terjadi kalau
        // baris ini dibiarkan seperti sebelum 2026-09-01: warna yang baru
        // saja dibuat bisa dibedakan justru tergabung KEMBALI menjadi satu
        // di titik masuk balik ini).
        //
        // Baris dengan produk sama TAPI warna beda TETAP terpisah. Penggabungan
        // yang sungguh terjadi (produk+warna sama) DIKATAKAN di banner, tidak
        // pernah diam-diam (LESSONS #10).
        const merged: CalcLine[] = [];
        const at = new Map<string, number>();
        for (const l of pre.lines) {
          const key = `${l.productId}::${l.colorCode ?? ""}`;
          const idx = at.get(key);
          if (idx !== undefined) {
            merged[idx] = { ...merged[idx], qty: Math.min(CALC_MAX_QTY, merged[idx].qty + l.qty) };
            continue;
          }
          at.set(key, merged.length);
          merged.push({
            productId: l.productId,
            name: l.name,
            code: l.code,
            photoUrl: null,
            unitPrice: 0,
            qty: Math.min(CALC_MAX_QTY, l.qty),
            colorCode: l.colorCode,
          });
        }
        setLines(merged);
        setTab("keranjang");
        setPrefill({
          n: merged.length,
          skipped: pre.skipped,
          merged: pre.lines.length - merged.length,
          customerName: pre.customerName,
        });
        setReady(true);
        return;
      }
      setPrefill({ n: 0, skipped: pre.skipped, merged: 0, customerName: pre.customerName });
      setReady(true);
      return;
    }
    const d = readCalcDraft(area);
    if (d) {
      setPendingDraft(d);
    } else {
      setReady(true);
    }
  }, [area]);

  function handleRestoreDraft() {
    if (pendingDraft) {
      setLines(pendingDraft.state.lines);
      setDiscountSlots(pendingDraft.state.discountSlots.length ? pendingDraft.state.discountSlots : [""]);
      setMarkup(pendingDraft.state.markup);
      setCash(pendingDraft.state.cash);
    }
    setPendingDraft(null);
    setReady(true);
  }
  function handleDiscardDraft() {
    clearCalcDraft(area);
    setPendingDraft(null);
    setReady(true);
  }

  // Auto-save tertunda (800ms) — SAMA prinsip dengan use-local-draft.ts, tapi
  // dipicu oleh perubahan state React (bukan event `onInput` DOM) karena
  // keranjang bukan form. `ready` mencegah efek ini menimpa draf lama SEBELUM
  // pengguna sempat memilih Lanjutkan/Buang di atas (LESSONS #20 sepupu: timer
  // yang jalan di waktu yang salah menulis ulang state yang seharusnya sudah
  // dibuang/dipulihkan).
  useEffect(() => {
    if (!ready) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      writeCalcDraft(area, { lines, discountSlots, markup, cash });
    }, CALC_DRAFT_DEBOUNCE_MS);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [ready, area, lines, discountSlots, markup, cash]);

  // Pencarian + kategori dieksekusi SERVER (kontrak lib/catalog-query.ts) —
  // memo `filtered`/`categories` lama diganti hook bersama. Outcome area
  // dipetakan ke kalimat lewat prop fetchMessages di sini supaya komponen
  // tetap bebas slice cabang/admin.
  const fetchForHook = useCallback(
    async (input: { q: string; category: string | null; offset: number; withCategories?: boolean }): Promise<
      CatalogFetchResult<KalkulatorProduct>
    > => {
      try {
        // withPrices: batch susulan/pencarian juga membawa harga efektif
        // 0021 untuk prefill addToCart — area action masing-masing yang
        // menentukan harga siapa (cabang: partner sendiri; admin: Harga
        // Dasar SANCI — kalkulator admin tanpa konteks partner).
        const res = await fetchPage({ ...input, withPrices: true });
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
              price: p.price ?? null,
            })),
          };
        }
        if (res.status === "not_opened") {
          return { ok: false, message: fetchMessages.notOpened ?? fetchMessages.loadFailed };
        }
        if (res.status === "module_inactive") {
          return { ok: false, message: fetchMessages.moduleInactive };
        }
        return { ok: false, message: fetchMessages.loadFailed };
      } catch {
        return { ok: false, message: fetchMessages.loadFailed };
      }
    },
    [fetchPage, fetchMessages]
  );

  const katalog = useCatalogSearch<KalkulatorProduct>({
    fetchPage: fetchForHook,
    initial: { products: initialProducts, hasMore: initialHasMore },
    initialCategories,
    fallbackErrorMessage: fetchMessages.loadFailed,
  });
  const { products, hasMore, searching, loadingMore, error: catalogError } = katalog;
  const q = katalog.q;
  const kategori = katalog.category;

  const categories = useMemo(
    () => [...katalog.categories].sort((a, b) => a.localeCompare(b, m.dateLocale)),
    [katalog.categories, m.dateLocale]
  );

  // HANYA baris "belum dipilih warnanya" (colorCode null) yang dihitung —
  // itulah baris yang disasar stepper +/- di kartu produk (lihat addToCart/
  // decLineOnCard). Sama persis dengan qtyByProduct di order-item-picker.tsx
  // (audit 2026-09-01) — dua tempat, satu aturan.
  const cartQtyByProduct = useMemo(() => {
    const map = new Map<string, number>();
    lines.forEach((l) => {
      if (l.colorCode === null) map.set(l.productId, l.qty);
    });
    return map;
  }, [lines]);

  // Daftar warna per produk — dimuat MALAS per productId yang MUNCUL di
  // `lines`, di-cache untuk umur komponen ini. Pola identik dengan
  // order-item-picker.tsx (satu peta untuk banyak baris keranjang sekaligus).
  type ColorLoadState = { status: "loading" } | { status: "idle" } | { status: "error" } | { status: "ready"; colors: ColorOptionRow[] };
  const [colorLoads, setColorLoads] = useState<Map<string, ColorLoadState>>(new Map());
  const colorFetchedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const productIds = Array.from(new Set(lines.map((l) => l.productId)));
    const toFetch = productIds.filter((id) => !colorFetchedRef.current.has(id));
    if (toFetch.length === 0) return;
    toFetch.forEach((id) => colorFetchedRef.current.add(id));
    setColorLoads((prev) => {
      const next = new Map(prev);
      toFetch.forEach((id) => next.set(id, { status: "loading" }));
      return next;
    });
    toFetch.forEach((id) => {
      fetchColors(id)
        .then((res) => {
          setColorLoads((prev) => {
            const next = new Map(prev);
            if (res.status !== "ok" || !res.hasColorOptions || res.colors.length === 0) {
              next.set(id, { status: res.status === "error" ? "error" : "idle" });
            } else {
              next.set(id, { status: "ready", colors: res.colors });
            }
            return next;
          });
        })
        .catch(() => {
          setColorLoads((prev) => new Map(prev).set(id, { status: "error" }));
        });
    });
  }, [lines, fetchColors]);

  /**
   * Qty 1; duplikat digabung dengan menjumlah qty — TAPI hanya kalau
   * WARNANYA JUGA SAMA (audit 2026-09-01, sebelumnya satu produk hanya bisa
   * dipilih SATU KALI sama sekali walau order_items.color_code sudah lama
   * menyediakan tempat untuk "sofa krem 2 + sofa abu 3"). Menyasar baris
   * "belum berwarna" produk ini (bikin baru kalau belum ada) — memberi
   * warna pada baris itu lewat pemilih warna di keranjang membebaskan slot
   * "belum berwarna" untuk baris berikutnya, jadi menekan produk ini lagi
   * otomatis memulai varian warna kedua/ketiga.
   */
  function addToCart(p: KalkulatorProduct) {
    // Mulai mengisi keranjang baru = tawaran "Kembalikan" hasil pengosongan
    // sebelumnya tidak relevan lagi (memulihkannya justru MENIMPA isian baru).
    setClearedSnapshot(null);
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.productId === p.id && l.colorCode === null);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: Math.min(CALC_MAX_QTY, next[idx].qty + 1) };
        return next;
      }
      // Prefill harga efektif 0021 (daftar harga = NILAI AWAL, bukan kunci
      // — kolom harga keranjang tetap bisa diketik seperti biasa). Tanpa
      // harga di daftar → 0, persis perilaku lama.
      return [
        ...prev,
        { productId: p.id, name: p.name, code: p.code, photoUrl: p.photoUrl, unitPrice: p.price ?? 0, qty: 1, colorCode: null },
      ];
    });
  }
  function removeLine(productId: string, colorCode: string | null) {
    setLines((prev) => prev.filter((l) => !(l.productId === productId && l.colorCode === colorCode)));
  }
  /**
   * Stepper "−" di KARTU produk: qty 1 → baris DIHAPUS (kembali ke keadaan
   * belum dipilih), bukan macet di 1 seperti setLineQty (yang melayani input
   * angka di keranjang, di mana "hapus" punya tombolnya sendiri). Menyasar
   * HANYA baris "belum berwarna" — simetris dengan addToCart di atas; kalau
   * seluruh qty produk ini sudah dipindah ke baris berwarna, stepper kartu
   * tidak punya target dan tidak melakukan apa pun (baris berwarna diedit
   * lewat keranjang, bukan dari kartu produk).
   */
  function decLineOnCard(productId: string) {
    setLines((prev) =>
      prev
        .map((l) => (l.productId === productId && l.colorCode === null ? { ...l, qty: l.qty - 1 } : l))
        .filter((l) => l.qty > 0)
    );
  }
  /**
   * Pindah ke tab keranjang DARI BAWAH halaman (tombol di bar total): tanpa
   * scroll ke atas, isi keranjang yang lebih pendek membuat pengguna mendarat
   * di area kosong dan mengira keranjangnya hilang.
   */
  function goToCart() {
    setTab("keranjang");
    window.scrollTo({ top: 0 });
  }
  function setLineUnitPrice(productId: string, colorCode: string | null, raw: string) {
    const n = parseIDRInput(raw);
    setLines((prev) =>
      prev.map((l) => (l.productId === productId && l.colorCode === colorCode ? { ...l, unitPrice: n ?? 0 } : l))
    );
  }
  function setLineQty(productId: string, colorCode: string | null, qty: number) {
    const clamped = Math.max(1, Math.min(CALC_MAX_QTY, Math.round(qty) || 1));
    setLines((prev) =>
      prev.map((l) => (l.productId === productId && l.colorCode === colorCode ? { ...l, qty: clamped } : l))
    );
  }

  /**
   * Ganti warna satu baris. Kalau baris LAIN untuk produk yang sama dan
   * warna BARU itu sudah ada, GABUNGKAN (jumlahkan qty, baris ini lenyap) —
   * identitas baris (productId, colorCode) harus tetap unik. Pola identik
   * dengan order-item-picker.tsx::setLineColor.
   */
  function setLineColor(productId: string, oldColorCode: string | null, newColorCode: string | null) {
    if (oldColorCode === newColorCode) return;
    const collideIdx = lines.findIndex((l) => l.productId === productId && l.colorCode === newColorCode);
    const movingIdx = lines.findIndex((l) => l.productId === productId && l.colorCode === oldColorCode);
    if (movingIdx < 0) return;

    if (collideIdx >= 0) {
      const merged = {
        ...lines[collideIdx],
        qty: Math.min(CALC_MAX_QTY, lines[collideIdx].qty + lines[movingIdx].qty),
      };
      // Baris hasil gabungan tinggal DI TEMPAT baris yang bertahan — versi
      // sebelumnya memakai .concat() sehingga ia melompat ke DASAR keranjang.
      // Di layar ponsel itu berarti: baris yang disentuh hilang dari
      // pandangan DAN hasilnya muncul di luar layar; dua kejadian yang
      // masing-masing sudah membingungkan, digabung jadi "sistemnya makan
      // barang saya".
      setLines(lines.map((l, i) => (i === collideIdx ? merged : l)).filter((_, i) => i !== movingIdx));
      setColorMergedNote({ key: `${productId}::${newColorCode ?? ""}`, name: merged.name });
      return;
    }

    // Ganti warna biasa (tanpa tabrakan) membatalkan catatan lama: catatan
    // itu menjelaskan tindakan SEBELUMNYA, dan membiarkannya tergantung
    // membuat staf mengira penggabungan baru saja terjadi lagi.
    setColorMergedNote(null);
    setLines(
      lines.map((l) =>
        l.productId === productId && l.colorCode === oldColorCode ? { ...l, colorCode: newColorCode } : l
      )
    );
  }

  /** Tombol "+ Tambah warna lain" pada satu baris keranjang. Pola identik
   *  dengan order-item-picker.tsx::addColorVariant. */
  function addColorVariant(productId: string, fromLine: CalcLine) {
    setColorMergedNote(null);
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.productId === productId && l.colorCode === null);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: Math.min(CALC_MAX_QTY, next[idx].qty + 1) };
        return next;
      }
      return [
        ...prev,
        { productId, name: fromLine.name, code: fromLine.code, photoUrl: fromLine.photoUrl, unitPrice: fromLine.unitPrice, qty: 1, colorCode: null },
      ];
    });
  }

  function addDiscountSlot() {
    setDiscountSlots((slots) => (slots.length >= CALC_MAX_DISCOUNT_SLOTS ? slots : [...slots, ""]));
  }
  function removeDiscountSlot(idx: number) {
    setDiscountSlots((slots) => slots.filter((_, i) => i !== idx));
  }

  /**
   * "Kosongkan" TIDAK memakai window.confirm: di PWA/standalone Android
   * dialog bawaan browser bisa tidak muncul sama sekali (langsung dianggap
   * OK) — persis kejadian owner 2026-08-22: sekali ketuk, seisi keranjang
   * lenyap tanpa pertanyaan. Gantinya dua lapis di dalam UI sendiri:
   *   1. konfirmasi inline (tombol berubah jadi pertanyaan + Ya/Batal), dan
   *   2. setelah dikosongkan, banner "Kembalikan" memulihkan seisi keranjang
   *      (baris + diskon + markup + tunai) — jaring pengaman kalau "Ya" pun
   *      ternyata salah ketuk. Banner bertahan sampai dipulihkan atau
   *      keranjang mulai diisi lagi (bukan timer — pilihan yang menghilang
   *      sendiri adalah kejutan).
   */
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearedSnapshot, setClearedSnapshot] = useState<CalcCartState | null>(null);
  /** Foto yang sedang dibesarkan dari thumbnail keranjang (null = tertutup). */
  const [photoView, setPhotoView] = useState<{ name: string; url: string } | null>(null);

  function handleClearCartConfirmed() {
    setClearedSnapshot({ lines, discountSlots, markup, cash });
    const empty: CalcCartState = emptyCartState();
    setLines(empty.lines);
    setDiscountSlots(empty.discountSlots);
    setMarkup(empty.markup);
    setCash(empty.cash);
    clearCalcDraft(area);
    setConfirmClear(false);
  }
  function handleUndoClear() {
    if (!clearedSnapshot) return;
    setLines(clearedSnapshot.lines);
    setDiscountSlots(clearedSnapshot.discountSlots.length ? clearedSnapshot.discountSlots : [""]);
    setMarkup(clearedSnapshot.markup);
    setCash(clearedSnapshot.cash);
    setClearedSnapshot(null);
  }

  // ── Matematika: rantai diskon → markup → potongan tunai, SATU kali round
  // di akhir (0015 §5). Breakdown per-langkah di bawah dibulatkan sendiri
  // HANYA untuk ditampilkan — tidak pernah diumpankan balik ke finalTotal
  // (lihat komentar panjang di lib/calculator-shared.ts).
  const parsedDiscounts = discountSlots
    .map((s) => Number(s.trim().replace(",", ".")))
    .filter((n) => Number.isFinite(n) && n > 0 && n < 100);
  const markupTrimmed = markup.trim();
  const parsedMarkupRaw = markupTrimmed === "" ? 0 : Number(markupTrimmed.replace(",", "."));
  const parsedMarkup = Number.isFinite(parsedMarkupRaw) ? parsedMarkupRaw : 0;
  /**
   * Markup di LUAR 0–100 (audit 2026-08-31). Slot diskon sudah memakai
   * gerbang yang sama persis dengan database (`> 0 && < 100`, lihat filter di
   * atas), tapi markup tidak: `check (markup_pct >= 0 and markup_pct <= 100)`
   * di 0015 dan validasi kedua Server Action (setOrderOffer /
   * setOrderOfferBranch) menolaknya, sementara kalkulator dengan senang hati
   * menghitung markup 150% dan mencetaknya di proposal. Kegagalannya baru
   * muncul di ujung — sesudah pesanan tersimpan dan rantai diskonnya gagal
   * diterapkan. Dikatakan DI SINI, di tempat angkanya diketik.
   */
  const markupOutOfRange = markupTrimmed !== "" && (!Number.isFinite(parsedMarkupRaw) || parsedMarkupRaw < 0 || parsedMarkupRaw > 100);
  const parsedCash = parseIDRInput(cash) ?? 0;

  const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0);
  const itemQty = lines.reduce((sum, l) => sum + l.qty, 0);
  const mult = discountChainMultiplier(parsedDiscounts);
  const afterDiscountDisplay = Math.round(subtotal * mult);
  const afterMarkupDisplay = Math.round(subtotal * mult * (1 + parsedMarkup / 100));
  const finalTotal = computeChainFinal(subtotal, parsedDiscounts, parsedMarkup, parsedCash);
  const finalDisplay = Math.max(finalTotal, 0);

  // Rincian uang PER LANGKAH diskon — hanya untuk ditampilkan (bukan sumber
  // finalTotal, sama seperti afterDiscountDisplay/afterMarkupDisplay di atas).
  // Dihitung berurutan: setiap langkah memotong dari hasil langkah SEBELUMNYA
  // (rantai perkalian, bukan menjumlah persen), supaya "Diskon 2 (10%)" yang
  // ditampilkan benar-benar 10% dari harga SETELAH Diskon 1 — bukan 10% dari
  // harga awal (0015 §5 — itulah kenapa 8%+10% ≠ 18%).
  let discountRunning = subtotal;
  const discountSteps = parsedDiscounts.map((pct, i) => {
    const before = discountRunning;
    discountRunning = before * (1 - pct / 100);
    return { n: i + 1, pct, amount: Math.round(before - discountRunning) };
  });
  const totalDiscountAmount = subtotal - afterDiscountDisplay;

  /**
   * "Buat Proposal" — dokumen cetak untuk pelanggan. Dua beda yang disengaja
   * dari handleConvertToOrder di bawah:
   *   - draf kalkulator TIDAK dihapus. Mencetak proposal bukan tanda
   *     penawaran ini selesai: staf mencetak, lalu sering kembali mengubah
   *     angka dan mencetak lagi. Menghapus draf di sini akan membuang
   *     keranjang mereka tepat saat mereka paling mungkin kembali.
   *   - hand-off-nya tidak sekali-pakai (halaman proposal cuma membacanya),
   *     supaya Ctrl+P / muat ulang / kembali tidak menghilangkan dokumen.
   */
  function handleMakeProposal() {
    if (!proposal || lines.length === 0) return;
    const ok = writeProposalHandoff({
      // Nama pelanggan ikut kalau isi keranjang ini datang dari sebuah
      // pesanan — staf tidak perlu mengetiknya ulang di dokumen.
      customerName: prefill?.customerName ?? "",
      subtotal,
      discountPcts: parsedDiscounts,
      totalDiscountAmount,
      markupPct: markupTrimmed === "" ? null : parsedMarkup,
      cashDiscount: parsedCash,
      finalAmount: finalDisplay,
      lines: lines.map((l) => ({
        productId: l.productId,
        name: l.name,
        code: l.code,
        unitPrice: l.unitPrice,
        qty: l.qty,
        // Warna IKUT ke dokumen (2026-09-01). Sebelumnya sengaja tidak
        // dibawa, dan itu meninggalkan DUA masalah sekaligus: pelanggan
        // memegang kertas yang tidak menyebut warna yang baru saja ia pilih,
        // DAN dua baris warna dari produk yang sama tiba di dokumen sebagai
        // dua baris ber-productId identik — tabrakan kunci React di
        // lib/proposal-document.tsx.
        colorCode: l.colorCode,
      })),
    });
    // Penyimpanan penuh/diblokir: berpindah halaman sekarang berarti dokumen
    // kosong tanpa sebab yang kelihatan. Katakan apa adanya (LESSONS #10).
    if (!ok) {
      setProposalErr(proposal.saveFailed);
      return;
    }
    setProposalErr(null);
    router.push(proposal.href);
  }

  function handleConvertToOrder() {
    // Route tanpa `convert` tidak merender tombolnya sama sekali — guard ini
    // cuma jaring pengaman ekstra.
    if (!convert || lines.length === 0) return;
    writeCalcHandoff(area, {
      lineCount: lines.length,
      itemQty,
      subtotal,
      discountPcts: parsedDiscounts,
      markupPct: markupTrimmed === "" ? null : parsedMarkup,
      cashDiscount: parsedCash,
      finalAmount: finalDisplay,
      // name/code ikut untuk ringkasan banner saja — copyCalcCartItemsToOrder
      // mengambil ulang name_snapshot/code_snapshot dari sanci_products saat
      // benar-benar menulis (LESSONS #6), tidak mempercayai nilai ini.
      // colorCode IKUT (audit 2026-09-01) — tanpa ini, dua baris warna
      // berbeda yang sengaja dipisah di keranjang akan tergabung kembali
      // begitu tiba di form pesanan (mergeLinesFromHandoff mencocokkan
      // colorCode juga).
      lines: lines.map((l) => ({
        productId: l.productId,
        name: l.name,
        code: l.code,
        unitPrice: l.unitPrice,
        qty: l.qty,
        colorCode: l.colorCode,
      })),
    });
    // DRAF SENGAJA TIDAK DIHAPUS DI SINI (audit UI 2026-09-01).
    //
    // Versi sebelumnya menghapusnya tepat sebelum router.push, dengan alasan
    // "kalkulator sudah selesai dipakai". Alasan itu mengandaikan staf tidak
    // pernah kembali — padahal jalur yang paling sering terjadi justru
    // sebaliknya: sampai di form pesanan, sadar salah pilih cabang (atau
    // menekan tombol kembali ponsel karena refleks), lalu menemukan
    // KERANJANGNYA KOSONG. Angkanya sebenarnya masih hidup di hand-off, tapi
    // staf tidak bisa tahu itu; yang terlihat cuma kerja yang lenyap.
    //
    // Hand-off tetap SEKALI PAKAI seperti semula — yang berubah hanya draf
    // lokal, yang memang cuma jaring pengaman dan punya masa berlaku sendiri
    // (DraftBanner menawarkan pemulihan, tidak pernah menuang diam-diam,
    // SPEC §58/LESSONS #1). Draf dibersihkan di tempat yang benar: SETELAH
    // pesanan berhasil dibuat, oleh form pesanan itu sendiri.
    router.push(convert.href);
  }

  return (
    <>
      {/* `values: {}` aman — DraftBanner cuma membaca `savedAt` lewat
          waktuRelatif(), tidak pernah membaca `values` (lihat draft-banner.tsx).
          Bentuk keranjang bukan field form jadi tidak ada `values` sungguhan
          untuk diisi di sini. */}
      <DraftBanner
        draft={pendingDraft ? { savedAt: pendingDraft.savedAt, values: {} } : null}
        onRestore={handleRestoreDraft}
        onDiscard={handleDiscardDraft}
      />

      {/* Isi pesanan yang baru dibawa masuk. Menutupnya tidak membuang apa
          pun — barisnya sudah ada di keranjang dan tetap bisa diubah. Baris
          yang TIDAK bisa dibawa dikatakan di sini, bukan hilang diam-diam. */}
      {prefill && (
        <div className="banner info">
          {prefill.n > 0 && m.calcPrefillBanner.replace("{n}", String(prefill.n))}
          {/* Baris yang dilebur karena produknya sama — dikatakan, supaya
              jumlah yang terlihat di keranjang tidak pernah tampak "salah"
              dibandingkan kertas pesanannya. */}
          {prefill.merged > 0 && (
            <div style={{ marginTop: prefill.n > 0 ? 6 : 0 }}>
              {m.calcPrefillMerged.replace("{n}", String(prefill.merged))}
            </div>
          )}
          {prefill.skipped > 0 && (
            <div style={{ marginTop: prefill.n > 0 || prefill.merged > 0 ? 6 : 0 }}>
              {m.calcPrefillSkipped.replace("{n}", String(prefill.skipped))}
            </div>
          )}
          <div className="btnrow-inline">
            <button type="button" className="btn sm" onClick={() => setPrefill(null)}>
              {m.close}
            </button>
          </div>
        </div>
      )}

      <div className="tabs">
        <button type="button" className={`tab${tab === "produk" ? " on" : ""}`} onClick={() => setTab("produk")}>
          {m.calcTabProducts}
        </button>
        <button
          type="button"
          className={`tab${tab === "keranjang" ? " on" : ""}`}
          onClick={() => setTab("keranjang")}
        >
          {m.calcTabCart.replace("{n}", String(lines.length))}
        </button>
      </div>

      {tab === "produk" ? (
        <>
          <div className="searchrow">
            <input
              className="search-input"
              type="search"
              placeholder={m.produkSearchPlaceholder}
              value={q}
              onChange={(e) => katalog.setQuery(e.target.value)}
            />
          </div>

          {categories.length > 0 && (
            <div className={styles.filters}>
              <button
                type="button"
                className={`${styles.filterchip}${kategori === null ? ` ${styles.filterOn}` : ""}`}
                onClick={() => katalog.setCategoryFilter(null)}
              >
                {m.filterAll}
              </button>
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`${styles.filterchip}${kategori === c ? ` ${styles.filterOn}` : ""}`}
                  onClick={() => katalog.setCategoryFilter(kategori === c ? null : c)}
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          {/* Pencarian gagal (jaringan lemah) TIDAK mengosongkan daftar —
              hasil sebelumnya tetap tampil di bawah banner ini. */}
          {catalogError && <div className="banner bad">{catalogError}</div>}
          {searching && <div className="hint">{m.loading}</div>}

          {products.length === 0 ? (
            !searching && (
              <div className="card emptybox">
                {katalog.isFiltered ? m.noProductsMatchSearch : m.noProductsYet}
              </div>
            )
          ) : (
            <div className={styles.grid}>
              {products.map((p) => {
                const inCartQty = cartQtyByProduct.get(p.id) ?? 0;
                const isOut = p.stockStatus === "OUT_OF_STOCK";
                // Kartu = <div>, bukan <button>: begitu produk masuk keranjang,
                // pengendali jumlahnya adalah stepper −/+ di atas foto — tombol
                // sungguhan tidak boleh bersarang di dalam tombol (HTML invalid),
                // dan ketukan pada BADAN kartu berhenti menambah diam-diam
                // (keluhan owner 2026-08-22: "點一下會+1 沒辦法編輯").
                const clickable = inCartQty === 0;
                return (
                  <div
                    key={p.id}
                    role={clickable ? "button" : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    className={`${styles.card}${inCartQty > 0 ? ` ${styles.inCart}` : ""}`}
                    onClick={clickable ? () => addToCart(p) : undefined}
                    onKeyDown={
                      clickable
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              addToCart(p);
                            }
                          }
                        : undefined
                    }
                    aria-label={clickable ? m.calcAddToCartAria.replace("{name}", p.name) : undefined}
                  >
                    <div className={styles.photo}>
                      {inCartQty > 0 && (
                        <span className={styles.cardStepper}>
                          <button
                            type="button"
                            className={styles.stepBtn}
                            onClick={() => decLineOnCard(p.id)}
                            aria-label="−"
                          >
                            −
                          </button>
                          <span className={styles.cardStepperQty}>×{inCartQty}</span>
                          <button
                            type="button"
                            className={styles.stepBtn}
                            onClick={() => addToCart(p)}
                            aria-label="+"
                          >
                            +
                          </button>
                        </span>
                      )}
                      {p.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- photo_url adalah URL publik dari SANCI (bukan aset lokal), lihat catatan di lib/catalog-shared.ts
                        <img
                          src={p.photoUrl}
                          alt={p.name}
                          loading="lazy"
                          style={isOut ? { filter: "grayscale(70%)", opacity: 0.6 } : undefined}
                        />
                      ) : (
                        <div className={styles.placeholder}>{m.noPhotoPlaceholder}</div>
                      )}
                    </div>
                    <div className={styles.body}>
                      <div className={styles.name}>{p.name}</div>
                      <div className={styles.metaRow}>
                        {p.code && <span className="code">{p.code}</span>}
                        {/* stockStatusLabel menerima `{ common }` (dipakai juga oleh
                            halaman ber-slice penuh); di sini m SUDAH CommonMessages. */}
                        <span className={STOCK_STATUS_CHIP[p.stockStatus]}>{stockStatusLabel({ common: m }, p.stockStatus)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {hasMore && products.length > 0 && (
            <div className="btnrow" style={{ justifyContent: "center", marginTop: 14 }}>
              <button type="button" className="btn" onClick={katalog.loadMore} disabled={loadingMore || searching}>
                {loadingMore ? m.loading : m.loadMoreCta}
              </button>
            </div>
          )}
        </>
      ) : lines.length === 0 ? (
        <>
          {clearedSnapshot && (
            <div className="banner warn">
              {m.calcClearedUndoMsg}
              <div className="btnrow-inline" style={{ marginTop: 9 }}>
                <button type="button" className="btn sm" onClick={handleUndoClear}>
                  {m.calcClearedUndoCta}
                </button>
              </div>
            </div>
          )}
          <div className="card emptybox">
            <p style={{ marginBottom: 14 }}>{m.calcCartEmpty}</p>
            <button type="button" className="btn primary" onClick={() => setTab("produk")}>
              {m.calcGoToProductsCta}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="card">
            <div className="spread" style={{ marginBottom: 4 }}>
              <h3 style={{ fontSize: 17 }}>{m.calcCartCardTitle}</h3>
              {!confirmClear && (
                <button type="button" className="btn sm ghost" onClick={() => setConfirmClear(true)}>
                  {m.calcClearCartCta}
                </button>
              )}
            </div>
            {confirmClear && (
              <div className="banner warn" style={{ marginBottom: 10 }}>
                {m.calcClearCartConfirm}
                <div className="btnrow-inline" style={{ marginTop: 9 }}>
                  <button type="button" className="btn sm" onClick={handleClearCartConfirmed}>
                    {m.calcClearConfirmYes}
                  </button>
                  <button type="button" className="btn sm ghost" onClick={() => setConfirmClear(false)}>
                    {m.cancel}
                  </button>
                </div>
              </div>
            )}
            {lines.map((line) => {
              const lineKey = `${line.productId}::${line.colorCode ?? ""}`;
              const colorLoad = colorLoads.get(line.productId);
              const colorReady = colorLoad?.status === "ready" ? colorLoad.colors : null;
              const selectedColor = colorReady?.find((c) => c.code === line.colorCode);
              return (
                <div key={lineKey} className={styles.cartLine}>
                  {line.photoUrl ? (
                    // Thumbnail kecil yang BISA diketuk untuk melihat foto besar
                    // (permintaan owner 2026-08-22: keranjang cukup thumbnail
                    // kecil, ketuk baru membesar).
                    <button
                      type="button"
                      className={`${styles.lineThumb} ${styles.lineThumbBtn}`}
                      onClick={() => setPhotoView({ name: line.name, url: line.photoUrl as string })}
                      aria-label={m.calcPhotoViewAria.replace("{name}", line.name)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- photo_url adalah URL publik dari SANCI (bukan aset lokal) */}
                      <img src={line.photoUrl} alt={line.name} loading="lazy" />
                    </button>
                  ) : (
                    <div className={styles.lineThumb}>{m.noPhotoPlaceholder}</div>
                  )}
                  <div className={styles.lineBody}>
                    <div className={styles.lineName}>
                      {line.name} {line.code && <span className="code">{line.code}</span>}
                    </div>
                    {colorReady && (
                      <div className="field" style={{ margin: "6px 0" }}>
                        <label htmlFor={`color_${lineKey}`}>{m.calcColorFieldLabel}</label>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <select
                            id={`color_${lineKey}`}
                            value={line.colorCode ?? ""}
                            onChange={(e) => setLineColor(line.productId, line.colorCode, e.target.value || null)}
                            style={{ flex: 1 }}
                            aria-label={m.calcColorPickerAria.replace("{name}", line.name)}
                          >
                            <option value="">{m.calcColorPickerPlaceholder}</option>
                            {colorReady.map((c) => (
                              <option key={c.id} value={c.code}>
                                {c.name ? `${c.code} — ${c.name}` : c.code}
                              </option>
                            ))}
                          </select>
                          {selectedColor?.photo_url && (
                            // eslint-disable-next-line @next/next/no-img-element -- lihat catatan di lib/catalog-shared.ts
                            <img
                              src={selectedColor.photo_url}
                              alt=""
                              style={{ width: 28, height: 28, borderRadius: "var(--r-sm)", objectFit: "cover", border: "1px solid var(--line)", flex: "none" }}
                            />
                          )}
                        </div>
                      </div>
                    )}
                    {colorLoad?.status === "error" && (
                      <div className="hint" style={{ marginBottom: 6 }}>{m.calcColorLoadFailedNote}</div>
                    )}
                    {/* Penggabungan warna WAJIB dikatakan (LESSONS #10). Dikunci
                        ke lineKey baris yang bertahan, jadi ia otomatis lenyap
                        begitu baris itu hilang — tidak perlu timer atau
                        pembersihan manual di setiap jalur lain. */}
                    {colorMergedNote?.key === lineKey && (
                      <div className="banner info" style={{ marginBottom: 6 }}>
                        {m.calcColorMergedNote.replace("{name}", colorMergedNote.name)}
                      </div>
                    )}
                    <div className={styles.lineControls}>
                      <div className={styles.priceField}>
                        <label htmlFor={`price_${lineKey}`}>{m.calcUnitPriceLabel}</label>
                        <input
                          id={`price_${lineKey}`}
                          type="text"
                          inputMode="numeric"
                          placeholder="Rp 0"
                          value={line.unitPrice ? formatIDR(line.unitPrice) : ""}
                          onChange={(e) => setLineUnitPrice(line.productId, line.colorCode, e.target.value)}
                        />
                      </div>
                      <div className={styles.qtyField}>
                        <label htmlFor={`qty_${lineKey}`}>{m.calcQtyLabel}</label>
                        <div className={styles.stepper}>
                          <button
                            type="button"
                            className={styles.stepBtn}
                            onClick={() => setLineQty(line.productId, line.colorCode, line.qty - 1)}
                            aria-label="−"
                          >
                            −
                          </button>
                          <input
                            id={`qty_${lineKey}`}
                            className={styles.qtyInput}
                            type="number"
                            min={1}
                            max={CALC_MAX_QTY}
                            value={line.qty}
                            onChange={(e) => setLineQty(line.productId, line.colorCode, Number(e.target.value))}
                          />
                          <button
                            type="button"
                            className={styles.stepBtn}
                            onClick={() => setLineQty(line.productId, line.colorCode, line.qty + 1)}
                            aria-label="+"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                    {colorReady && (
                      <button
                        type="button"
                        className="btn sm"
                        style={{ marginTop: 8 }}
                        onClick={() => addColorVariant(line.productId, line)}
                        aria-label={m.calcAddColorVariantAria.replace("{name}", line.name)}
                      >
                        {m.calcAddColorVariantCta}
                      </button>
                    )}
                    <div className={styles.lineFooter}>
                      <span className={styles.lineSubtotal}>{formatIDR(line.unitPrice * line.qty)}</span>
                      <button
                        type="button"
                        className="btn sm"
                        onClick={() => removeLine(line.productId, line.colorCode)}
                        aria-label={m.calcRemoveLineAria.replace("{name}", line.name)}
                      >
                        {m.calcRemoveLineCta}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="card">
            <h3 style={{ fontSize: 17, marginBottom: 4 }}>{m.calcDiscountSectionTitle}</h3>
            <p className="small muted" style={{ marginBottom: 10 }}>
              {m.calcDiscountHint}
            </p>
            {/* styles.disc{idx}: satu warna per slot, dipakai lagi di baris
                breakdown yang sama indeksnya — permintaan owner 2026-08-22
                (tiap diskon harus bisa dibedakan sekilas). Modulo jaga-jaga;
                CALC_MAX_DISCOUNT_SLOTS = 6 = jumlah warna yang tersedia. */}
            {discountSlots.map((slot, idx) => (
              <div
                key={idx}
                className={`field ${styles.discSlotRow} ${styles[`disc${idx % 6}`]}`}
                style={{ marginBottom: 8, display: "flex", gap: 8, alignItems: "flex-end" }}
              >
                <div style={{ flex: 1 }}>
                  <label htmlFor={`calc_discount_${idx}`}>
                    {m.calcDiscountFieldLabel.replace("{n}", String(idx + 1))}
                  </label>
                  <input
                    id={`calc_discount_${idx}`}
                    type="text"
                    inputMode="decimal"
                    value={slot}
                    onChange={(e) => setDiscountSlots((slots) => slots.map((s, i) => (i === idx ? e.target.value : s)))}
                  />
                </div>
                {discountSlots.length > 1 && (
                  <button type="button" className="btn sm" onClick={() => removeDiscountSlot(idx)}>
                    {m.calcDiscountRemoveBtn}
                  </button>
                )}
              </div>
            ))}
            {discountSlots.length < CALC_MAX_DISCOUNT_SLOTS && (
              <button type="button" className="btn sm" onClick={addDiscountSlot} style={{ marginBottom: 10 }}>
                {m.calcDiscountAddBtn}
              </button>
            )}
            <div className="field" style={{ marginBottom: 10 }}>
              <label htmlFor="calc_markup">{m.calcMarkupFieldLabel}</label>
              <input
                id="calc_markup"
                type="text"
                inputMode="decimal"
                value={markup}
                onChange={(e) => setMarkup(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="field">
              <label htmlFor="calc_cash">{m.calcCashFieldLabel}</label>
              <input
                id="calc_cash"
                type="text"
                inputMode="numeric"
                value={cash}
                onChange={(e) => setCash(e.target.value)}
                placeholder="Rp 0"
              />
            </div>
          </div>

          <div className="card">
            {finalTotal < 0 && <div className="banner bad">{m.offerFinalNegative}</div>}
            {/* Peringatan, BUKAN penghalang — sengaja. Markup di atas 100%
                adalah angka jual yang sah untuk proposal ke pelanggan (layar
                ini memang bebas gerbang can_discount/can_edit_offer), yang
                TIDAK bisa cuma satu hal: tersimpan ke order_sanci_offers saat
                dikonversi jadi pesanan. Memblokirnya di sini akan mencabut
                kemampuan yang sah; mendiamkannya membuat kegagalan muncul di
                ujung alur. Jadi: dikatakan, lalu staf yang memutuskan. */}
            {markupOutOfRange && <div className="banner bad">{m.calcMarkupOutOfRange}</div>}
            <div className={styles.breakdown}>
              <div className={styles.breakdownRow}>
                <span>{m.calcBreakdownSubtotal}</span>
                <span>{formatIDR(subtotal)}</span>
              </div>
              {discountSteps.map((step) => (
                <div className={`${styles.breakdownRow} ${styles[`disc${(step.n - 1) % 6}`]}`} key={step.n}>
                  {/* Titik + label sewarna dengan baris INPUT diskon yang sama
                      indeksnya (lihat discSlotRow di atas) — mata langsung tahu
                      potongan ini datang dari kolom yang mana. */}
                  <span className={styles.discStepLabel}>
                    <span className={styles.discDot} aria-hidden="true" />
                    {m.calcDiscountStepAmount.replace("{n}", String(step.n)).replace("{pct}", String(step.pct))}
                  </span>
                  <span>−{formatIDR(step.amount)}</span>
                </div>
              ))}
              {discountSteps.length > 0 && (
                <div className={styles.breakdownRow}>
                  <span>{m.calcBreakdownTotalDiscount}</span>
                  <span>−{formatIDR(totalDiscountAmount)}</span>
                </div>
              )}
              <div className={styles.breakdownRow}>
                <span>{m.calcBreakdownAfterDiscount}</span>
                <span>{formatIDR(afterDiscountDisplay)}</span>
              </div>
              <div className={styles.breakdownRow}>
                <span>{m.calcBreakdownAfterMarkup}</span>
                <span>{formatIDR(afterMarkupDisplay)}</span>
              </div>
              <div className={`${styles.breakdownRow} ${styles.final}`}>
                <span>{m.finalAmount}</span>
                <span>{formatIDR(finalDisplay)}</span>
              </div>
            </div>
            {/* "Buat Proposal" = aksi SEKUNDER di sini: aksi utama keranjang
                tetap "Buat Pesanan" di bar bawah. Proposal adalah kertas yang
                dibawa pelanggan untuk memutuskan, jadi tempatnya tepat di
                bawah angka yang baru saja dibacanya. */}
            {proposal && (
              <>
                {proposalErr && (
                  <div className="banner bad" style={{ marginTop: 12 }}>
                    {proposalErr}
                  </div>
                )}
                <div className="btnrow" style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className="btn"
                    disabled={lines.length === 0}
                    onClick={handleMakeProposal}
                  >
                    {proposal.cta}
                  </button>
                </div>
              </>
            )}
            {convert && <p className="footnote" style={{ marginTop: 12 }}>{convert.scopeNote}</p>}
          </div>
        </>
      )}

      {photoView && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setPhotoView(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label={photoView.name}>
            {/* eslint-disable-next-line @next/next/no-img-element -- photo_url adalah URL publik dari SANCI (bukan aset lokal) */}
            <img
              src={photoView.url}
              alt={photoView.name}
              style={{ width: "100%", height: "auto", borderRadius: "var(--r-md)", marginBottom: 12, display: "block" }}
            />
            <div className={styles.lineName} style={{ marginBottom: 12 }}>{photoView.name}</div>
            <button type="button" className="btn" onClick={() => setPhotoView(null)}>
              {m.close}
            </button>
          </div>
        </div>
      )}

      <div className={styles.bottomSpacer} />
      {/* Di admin, bar ini digeser ke kanan selebar rel navigasi (desktop). */}
      <div className={`${styles.stickyBar}${area === "admin" ? ` ${styles.stickyBarAdmin}` : ""}`}>
        <button
          type="button"
          className={styles.stickyLeft}
          style={{ background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer" }}
          onClick={goToCart}
          aria-label={m.calcFooterAria.replace("{n}", String(itemQty)).replace("{amount}", formatIDR(finalDisplay))}
        >
          <span className={styles.stickyCount}>{m.calcFooterItemCount.replace("{n}", String(itemQty))}</span>
          <span className={styles.stickyTotal}>{formatIDR(finalDisplay)}</span>
        </button>
        {/* Kanan bar mengikuti tab (keluhan owner 2026-08-22 — teks total di
            kiri tidak tampak bisa diketuk, jadi butuh TOMBOL sungguhan):
            - tab produk    → "Keranjang (n)" pindah ke keranjang (kedua area);
            - tab keranjang → CTA konversi (kalau route mengisi `convert`).
            CTA konversi dulu tampil di kedua tab; sekarang alurnya pilih →
            keranjang → buat pesanan, pola belanja yang diminta owner. */}
        {tab === "produk" ? (
          <button
            type="button"
            className={`btn primary lg ${styles.stickyBtn}`}
            disabled={lines.length === 0}
            onClick={goToCart}
          >
            {m.calcTabCart.replace("{n}", String(lines.length))}
          </button>
        ) : (
          convert && (
            <button
              type="button"
              className={`btn primary lg ${styles.stickyBtn}`}
              disabled={lines.length === 0}
              onClick={handleConvertToOrder}
            >
              {convert.cta}
            </button>
          )
        )}
      </div>
    </>
  );
}
