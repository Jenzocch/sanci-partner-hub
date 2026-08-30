/**
 * Keranjang KATALOG sisi cabang — dipakai DUA layar saja:
 * /cabang/produk (grid) dan /cabang/produk/[productId] (detail).
 *
 * Kenapa ada: staf toko menjelajah katalog sambil melayani pelanggan, tapi
 * untuk memesan barang yang barusan dilihat mereka harus kembali ke Beranda →
 * "+ Pesanan Baru" → mencari produk yang SAMA sekali lagi di picker modal.
 * Keranjang ini menutup jarak itu: tombol "+" di kartu / "Tambah ke Pesanan"
 * di halaman detail menaruh baris di sini, bar bawah menampilkan ringkasannya,
 * dan "Buat Pesanan" mengangkutnya ke form pesanan baru.
 *
 * Disiplinnya MENIRU lib/calculator-shared.ts (baca berkas itu dulu):
 *   - semua sentuhan localStorage dibungkus try/catch — penyimpanan penuh /
 *     diblokir tidak boleh membuat layar katalog gagal dirender;
 *   - setiap baris yang dibaca balik disaring `isValidLine` — JSON dari versi
 *     lama atau yang dirusak tangan tidak pernah masuk ke state React;
 *   - keranjang kosong = key DIHAPUS, bukan menyimpan array kosong (supaya
 *     "tidak ada keranjang" dan "keranjang kosong" tidak jadi dua keadaan
 *     yang harus dibedakan pembacanya).
 *
 * BEDA penting dari draf kalkulator: penulisan di sini adalah AKSI PENGGUNA
 * yang baru saja ditekan (bukan auto-save tertunda), jadi kegagalannya TIDAK
 * boleh didiamkan — `writeCatalogCart`/`addToCatalogCart`/`writeCatalogHandoff`
 * melaporkan gagal lewat nilai baliknya, dan pemanggilnya WAJIB menampilkan
 * kalimat gagal (LESSONS #10: kegagalan tidak boleh menyamar jadi "tidak
 * terjadi apa-apa"). Tombol "+" yang diam-diam tidak melakukan apa pun persis
 * jenis kebohongan yang dilarang itu.
 *
 * Keranjang ini TIDAK pernah menulis ke database. Satu-satunya jalan barangnya
 * sampai ke order_items tetap jalur tulis yang sudah ada: hand-off sekali pakai
 * → daftar "Isi Pesanan" di form pesanan baru → `copyCalcCartItemsToOrder`
 * setelah pesanan berhasil dibuat. Nol jalur tulis baru.
 */

import { CALC_MAX_QTY } from "@/lib/calculator-shared";

/**
 * Satu baris keranjang katalog. Sengaja SETANGKUP dengan `CalcHandoffLine`
 * (lib/calculator-shared.ts) supaya baris dari sini bisa langsung dituang ke
 * daftar Isi Pesanan lewat `mergeLinesFromHandoff` yang SUDAH ADA di
 * lib/order-item-picker.tsx — satu aturan penggabungan untuk semua sumber,
 * bukan aturan kedua yang lambat laun menyimpang.
 *
 * `unitPrice` diambil dari harga yang SEDANG TAMPIL di katalog (Harga Normal
 * toko ini, 0021). Boleh 0 — itu terjadi kalau produknya memang belum punya
 * harga (null) ATAU query harga gagal (undefined). Keduanya sengaja tidak
 * dibedakan DI SINI karena bagi keranjang keduanya sama: kita tidak tahu
 * harganya, jadi jangan mengarang angka. Yang WAJIB membedakannya adalah
 * layar katalog itu sendiri (kartu tetap menulis "Belum ada harga" vs "Harga
 * gagal dimuat", LESSONS #10), dan harga baris tetap bisa diketik di form
 * pesanan sebelum dikirim.
 *
 * `photoUrl` sengaja TIDAK disimpan: order_items tidak memakainya dan bar
 * keranjang tidak menampilkannya — menyimpannya cuma menggemukkan localStorage.
 */
export type CatalogCartLine = {
  productId: string;
  name: string;
  code: string | null;
  unitPrice: number;
  qty: number;
};

const CATALOG_CART_KEY = "sanci:katalog:cart";

/**
 * Event internal satu tab: bar keranjang hidup di komponen yang BERBEDA dari
 * tombol "+" (bar dipasang halaman server, tombol ada di dalam daftar/detail),
 * jadi tidak ada state React bersama di antara keduanya. Menulis ke
 * localStorage TIDAK memicu `storage` di tab yang menulis — hanya di tab lain
 * — sehingga tanpa event ini bar tidak akan pernah bergerak di tab yang
 * dipakai. `subscribeCatalogCart` mendengarkan KEDUANYA.
 */
const CATALOG_CART_EVENT = "sanci:katalog:cart-change";

type StoredCart = { savedAt: number; lines: CatalogCartLine[] };

function isValidLine(v: unknown): v is CatalogCartLine {
  if (!v || typeof v !== "object") return false;
  const l = v as Record<string, unknown>;
  return (
    typeof l.productId === "string" &&
    typeof l.name === "string" &&
    (l.code === null || typeof l.code === "string") &&
    typeof l.unitPrice === "number" &&
    typeof l.qty === "number"
  );
}

function parseLines(raw: string | null): CatalogCartLine[] {
  if (!raw) return [];
  const parsed = JSON.parse(raw) as Partial<StoredCart>;
  if (!parsed || !Array.isArray(parsed.lines)) return [];
  return parsed.lines.filter(isValidLine);
}

/** Keranjang sekarang; `[]` untuk semua keadaan "tidak ada yang sah dibaca". */
export function readCatalogCart(): CatalogCartLine[] {
  try {
    return parseLines(window.localStorage.getItem(CATALOG_CART_KEY));
  } catch {
    return []; // JSON rusak / localStorage diblokir — perlakukan sebagai keranjang kosong
  }
}

/**
 * Simpan keranjang. `false` = tulisan GAGAL (penyimpanan penuh/diblokir) dan
 * pemanggil harus mengatakannya ke pengguna — lihat catatan di kepala berkas.
 * Daftar kosong menghapus key-nya.
 */
export function writeCatalogCart(lines: CatalogCartLine[]): boolean {
  try {
    if (lines.length === 0) {
      window.localStorage.removeItem(CATALOG_CART_KEY);
    } else {
      const payload: StoredCart = { savedAt: Date.now(), lines };
      window.localStorage.setItem(CATALOG_CART_KEY, JSON.stringify(payload));
    }
  } catch {
    return false;
  }
  umumkan(lines);
  return true;
}

/** `false` = key-nya gagal dihapus; pemanggil harus memberi tahu, bukan diam. */
export function clearCatalogCart(): boolean {
  return writeCatalogCart([]);
}

/**
 * Tambah SATU produk ke keranjang. Produk yang sudah ada digabung dengan
 * MENJUMLAH qty — aturan yang sama persis dengan `addProduct` di picker Isi
 * Pesanan dan `addToCart` kalkulator (batas atas CALC_MAX_QTY yang sama).
 * Harga baris yang sudah ada TIDAK ditimpa: kalau sudah pernah punya angka,
 * angka itu yang dipakai — sama seperti `mergeLinesFromHandoff`.
 *
 * Balikan: daftar baru, atau `null` kalau penyimpanan gagal (pemanggil wajib
 * menampilkan kalimat gagal, jangan pura-pura sudah tersimpan).
 */
export function addToCatalogCart(line: CatalogCartLine): CatalogCartLine[] | null {
  const prev = readCatalogCart();
  const idx = prev.findIndex((l) => l.productId === line.productId);
  let next: CatalogCartLine[];
  if (idx >= 0) {
    next = [...prev];
    next[idx] = {
      ...next[idx],
      qty: Math.min(CALC_MAX_QTY, next[idx].qty + line.qty),
      unitPrice: next[idx].unitPrice > 0 ? next[idx].unitPrice : line.unitPrice,
    };
  } else {
    next = [...prev, { ...line, qty: Math.min(CALC_MAX_QTY, line.qty) }];
  }
  return writeCatalogCart(next) ? next : null;
}

function umumkan(lines: CatalogCartLine[]): void {
  try {
    window.dispatchEvent(new CustomEvent<CatalogCartLine[]>(CATALOG_CART_EVENT, { detail: lines }));
  } catch {
    // Lingkungan tanpa CustomEvent — bar keranjang cuma tidak ikut bergerak
    // sampai halaman berikutnya; datanya sendiri sudah tersimpan.
  }
}

/**
 * Dengarkan perubahan keranjang. Mengembalikan fungsi pembatalan (dipakai
 * langsung sebagai cleanup useEffect). Dua sumber:
 *   - event internal (tab ini sendiri — lihat CATALOG_CART_EVENT);
 *   - event `storage` (tab LAIN mengubah keranjang; tanpa ini bar di tab lama
 *     tetap menampilkan barang yang sudah dikosongkan di tab baru).
 */
export function subscribeCatalogCart(onChange: (lines: CatalogCartLine[]) => void): () => void {
  const internal = (e: Event) => {
    const detail = (e as CustomEvent<CatalogCartLine[]>).detail;
    onChange(Array.isArray(detail) ? detail : readCatalogCart());
  };
  const external = (e: StorageEvent) => {
    if (e.key !== null && e.key !== CATALOG_CART_KEY) return;
    onChange(readCatalogCart());
  };
  window.addEventListener(CATALOG_CART_EVENT, internal);
  window.addEventListener("storage", external);
  return () => {
    window.removeEventListener(CATALOG_CART_EVENT, internal);
    window.removeEventListener("storage", external);
  };
}

/* ------------------------------------------------------------------ *
 * Hand-off ke form pesanan baru — SEKALI PAKAI.
 *
 * Semantik PERSIS sama dengan CALC_HANDOFF_KEYS di lib/calculator-shared.ts:
 * ditulis SEKALI saat staf menekan "Buat Pesanan" di bar keranjang, lalu
 * dibaca-dan-langsung-dihapus oleh /cabang/pesanan/baru. Bukan draf, bukan
 * state yang dipulihkan diam-diam: isinya mendarat di daftar "Isi Pesanan"
 * yang terlihat penuh dan bisa diubah semuanya sebelum dikirim (lihat
 * catatan panjang di new-order-form.tsx).
 *
 * Key BERBEDA dari hand-off kalkulator (`sanci:kalkulator:handoff`) supaya
 * dua alur ini tidak pernah saling menimpa: staf boleh menghitung penawaran
 * di kalkulator DAN membawa produk dari katalog, dan form pesanan baru
 * memakai keduanya lewat jalur masing-masing tanpa yang satu menelan yang
 * lain. Tidak ada varian :admin — keranjang katalog cuma ada di sisi cabang
 * (/admin punya alurnya sendiri lewat picker di form admin).
 * ------------------------------------------------------------------ */

const CATALOG_HANDOFF_KEY = "sanci:katalog:handoff";

export type CatalogHandoff = { savedAt: number; lines: CatalogCartLine[] };

/** `false` = gagal disimpan; pemanggil TIDAK boleh melanjutkan seolah berhasil. */
export function writeCatalogHandoff(lines: CatalogCartLine[]): boolean {
  try {
    const payload: CatalogHandoff = { savedAt: Date.now(), lines };
    window.localStorage.setItem(CATALOG_HANDOFF_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function readCatalogHandoff(): CatalogHandoff | null {
  try {
    const raw = window.localStorage.getItem(CATALOG_HANDOFF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CatalogHandoff>;
    if (!parsed || typeof parsed.savedAt !== "number" || !Array.isArray(parsed.lines)) return null;
    const lines = parsed.lines.filter(isValidLine);
    if (lines.length === 0) return null;
    return { savedAt: parsed.savedAt, lines };
  } catch {
    return null;
  }
}

export function clearCatalogHandoff(): void {
  try {
    window.localStorage.removeItem(CATALOG_HANDOFF_KEY);
  } catch {
    // sama seperti di atas — kegagalan menghapus tidak boleh menghentikan form
  }
}
