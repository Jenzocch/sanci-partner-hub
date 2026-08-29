"use client";

/**
 * Penambal kecil: simpan & pulihkan keadaan jelajah SEDERHANA — kata kunci,
 * filter yang dihitung sepenuhnya di memori, dan posisi gulir — lewat
 * sessionStorage, untuk daftar yang BUKAN permukaan katalog.
 *
 * ── Kenapa bukan opsi `persist` milik use-catalog-search (2026-08-29) ──
 * Masalahnya sama persis dengan yang sudah diperbaiki di /cabang/produk:
 * tombol kembali di halaman detail adalah `<Link>` push, jadi daftarnya
 * di-mount ULANG dan seluruh state client (semuanya useState) lahir kosong —
 * manajer yang membuka tiga pesanan berturut-turut mengetik pencarian yang
 * sama tiga kali, dan setiap kali mendarat di puncak daftar.
 *
 * TAPI /cabang/pesanan dan /cabang/pelanggan tidak memakai use-catalog-search
 * sama sekali: keduanya menerima SATU array hasil render server (limit 100)
 * lalu menyaringnya di memori dengan useMemo. Tidak ada `fetchPage`, tidak ada
 * offset/halaman, tidak ada "Muat Lebih Banyak", dan pesanan memfilter per
 * STATUS (bukan kategori). Memindahkan keduanya ke hook katalog berarti
 * membangun Server Action pencarian + paging server untuk dua tabel lain,
 * memaksa filter status masuk ke slot `category` milik hook, dan menulis ulang
 * kedua server page-nya — refaktor besar yang SENGAJA tidak dilakukan di sini.
 * Ini penambal kecil sampai (kalau pernah) kedua layar itu benar-benar pindah
 * ke kontrak katalog; kalau itu terjadi, hapus berkas ini dan pakai `persist`.
 *
 * ── Kenapa penambal ini secara STRUKTURAL tidak bisa mengulang bug yang baru
 * diperbaiki di versi produk (0b2369c, "scroll-restore flag leak") ──
 * Bug itu lahir dari pemulihan MULTI-HALAMAN: array hasil pemulihan berbentuk
 * persis seperti hasil "Muat Lebih Banyak" (ekornya sama dengan array lama)
 * sehingga salah dikenali sebagai penambahan halaman — memicu pengumuman
 * aria-live palsu dan scrollIntoView yang berebut frame dengan pemulihan
 * gulir; dan pemulihan yang DIBATALKAN di tengah jalan meninggalkan flag yang
 * menelan gulir-ke-atas pencarian BERIKUTNYA. Di sini tidak ada halaman, tidak
 * ada fetch, tidak ada penambahan, tidak ada pengumuman, dan tidak ada
 * gulir-ke-atas otomatis: pemulihannya SEKALI saat mount, sinkron, hanya
 * "kembalikan teks yang tersimpan lalu kembalikan posisi gulir". Tidak ada
 * keadaan transisi yang bisa bocor ke tindakan berikutnya.
 *
 * ── Sifat data ──
 * Ini KENYAMANAN, bukan draf yang pengguna ketik untuk disimpan (bandingkan
 * lib/use-local-draft.ts): semua akses storage dibungkus try/catch, dan
 * storage yang diblokir (mode penyamaran) berarti "tidak ada pemulihan",
 * bukan error. `sessionStorage`, bukan localStorage: keadaan jelajah milik
 * satu sesi tab, tidak boleh muncul lagi minggu depan.
 */

import { useCallback, useEffect, useRef } from "react";

/** Jeda penulisan saat menggulir — sama dengan use-catalog-search.ts. */
const SCROLL_WRITE_THROTTLE_MS = 300;

type Persisted = { f: Record<string, string>; scrollY: number };

/**
 * Baca + validasi. Nilai dari storage TIDAK dipercaya begitu saja (bisa
 * tinggalan versi lama / diubah tangan): apa pun yang bentuknya tidak cocok
 * dibuang dan layar kembali ke perilaku tanpa pemulihan. Kesahihan NILAI tiap
 * field (mis. "status ini memang ada di daftar filter") diputuskan pemanggil
 * di `onRestore` — berkas ini sengaja tidak tahu domainnya.
 */
function readPersisted(key: string): Persisted | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const o = parsed as Record<string, unknown>;
    const f: Record<string, string> = {};
    if (o.f && typeof o.f === "object") {
      for (const [k, v] of Object.entries(o.f as Record<string, unknown>)) {
        if (typeof v === "string") f[k] = v;
      }
    }
    const scrollY = typeof o.scrollY === "number" && Number.isFinite(o.scrollY) && o.scrollY > 0 ? o.scrollY : 0;
    return { f, scrollY };
  } catch {
    return null;
  }
}

/**
 * Kembalikan posisi gulir setelah daftar dirender. Dicoba beberapa frame:
 * tinggi halaman baru mencapai `y` setelah baris-barisnya terpasang. Berhenti
 * begitu posisinya tercapai — tidak pernah melawan gulir pengguna lebih dari
 * beberapa frame. (Cermin dari helper senama di use-catalog-search.ts, yang
 * privat di berkas itu; berkas itu sengaja tidak disentuh.)
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

export function useBrowsePersist({
  key,
  fields,
  onRestore,
}: {
  /**
   * Kunci sessionStorage; `null` MEMATIKAN seluruh hook (tiap efek keluar di
   * baris pertama). Dipakai layar yang sedang menampilkan kartu error alih-
   * alih daftar: di keadaan itu tidak ada apa pun yang layak disimpan, dan
   * menulis keadaan kosong justru akan menghapus jelajah yang tersimpan.
   */
  key: string | null;
  /** Nilai saat ini yang ikut disimpan. Nama "scrollY" TIDAK boleh dipakai. */
  fields: Record<string, string>;
  /**
   * Dipanggil SEKALI saat mount kalau ada yang tersimpan. Field yang hilang
   * datang sebagai `undefined` — pemanggil wajib memvalidasi sendiri sebelum
   * menerapkannya ke state.
   */
  onRestore: (saved: Readonly<Record<string, string | undefined>>) => void;
}): void {
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;
  // Sinyal "ada yang berubah" untuk efek penulisan di bawah; nilainya sendiri
  // dibaca lewat ref supaya `write` tetap stabil.
  const snapshot = JSON.stringify(fields);

  const scrollYRef = useRef(0);
  /** Menulis baru boleh SESUDAH pemulihan dicoba — kalau tidak, keadaan awal
   *  yang masih kosong menimpa yang tersimpan sebelum sempat dipulihkan. */
  const ready = useRef(false);
  const restoreStarted = useRef(false);

  const write = useCallback(() => {
    if (!key || !ready.current) return;
    try {
      window.sessionStorage.setItem(key, JSON.stringify({ f: fieldsRef.current, scrollY: scrollYRef.current }));
    } catch {
      // Storage diblokir/penuh (mode penyamaran): pemulihan hilang, halaman
      // tetap jalan. Ini kenyamanan, bukan data yang pengguna ketik.
    }
  }, [key]);

  // ── Pulihkan SEKALI saat mount ──
  useEffect(() => {
    if (!key || restoreStarted.current) return;
    restoreStarted.current = true;
    const saved = readPersisted(key);
    ready.current = true;
    if (!saved) return;
    onRestoreRef.current(saved.f);
    // Daftar disaring sinkron dari props yang sudah ada (useMemo, tanpa
    // fetch), jadi tinggi halaman yang benar tersedia di frame berikutnya —
    // tidak ada pemulihan bertahap yang perlu ditunggu.
    restoreScrollTo(saved.scrollY);
    // Sengaja hanya bergantung pada kunci: ini pemulihan sekali saat mount
    // (dijaga restoreStarted), bukan efek yang boleh berjalan ulang.
  }, [key]);

  // ── Simpan tiap kali field berubah ──
  const firstWriteSkipped = useRef(false);
  useEffect(() => {
    if (!key) return;
    // Lewati SATU kali: efek ini juga berjalan di commit mount, yaitu SESUDAH
    // efek pemulihan di atas menyalakan `ready` tapi SEBELUM state hasil
    // pemulihan mendarat. Tanpa lewatan ini, penulisan itu memakai nilai awal
    // yang masih kosong dan menghapus keadaan yang barusan dibaca.
    if (!firstWriteSkipped.current) {
      firstWriteSkipped.current = true;
      return;
    }
    write();
  }, [key, write, snapshot]);

  // ── Posisi gulir ──
  // Listener pasif hanya MENCATAT ke ref (murah), penulisan ke storage
  // di-throttle. Nilai yang disimpan sengaja diambil dari ref, bukan
  // window.scrollY saat unmount — saat navigasi push, browser/Next sudah
  // sempat menggulir ke atas sebelum komponen ini dilepas.
  useEffect(() => {
    if (!key) return;
    scrollYRef.current = window.scrollY;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      scrollYRef.current = window.scrollY;
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        write();
      }, SCROLL_WRITE_THROTTLE_MS);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", write);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", write);
      if (timer) clearTimeout(timer);
      // Penulisan saat lepas: navigasi client-side ke halaman detail TIDAK
      // memicu pagehide, jadi justru baris inilah yang menyimpan keadaan
      // sesaat sebelum daftar ini dilepas.
      write();
    };
  }, [key, write]);
}
