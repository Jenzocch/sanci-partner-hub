/**
 * Pengecilan gambar di browser sebelum diunggah (SPEC §41).
 *
 * Tujuannya: orang sering memotret/menyimpan gambar dalam ukuran besar
 * (4–8 MB dari kamera HP). Mengunggahnya lewat jaringan lemah hampir pasti
 * gagal, jadi gambar dikecilkan dulu di perangkat sebelum dikirim.
 *
 * SATU ukuran TIDAK cocok untuk semua (pelajaran audit 2026-08-17):
 *   - Logo hanya ikon kecil → 512 px sudah lebih dari cukup.
 *   - Foto INVOICE dipakai untuk MEMBACA angka nominal → kalau dikecilkan ke
 *     512 px teksnya jadi buram dan nominalnya tak terbaca. Butuh sisi ~2000 px
 *     dan mutu lebih tinggi. Ini bukan sekadar preferensi — 512 px membuat
 *     fitur invoice-nya gagal pada tujuannya.
 *   - Foto PRODUK dipakai di grid katalog DAN foto besar halaman detail →
 *     512 px kelihatan pecah di foto besar. 1280 px cukup tajam tanpa jadi
 *     berkas raksasa.
 * Karena itu compressImage menerima PRESET; pemanggil WAJIB memilih yang sesuai.
 *
 * Aturan yang tidak boleh dilanggar:
 *   - Ini HANYA kenyamanan. Pengaman sebenarnya ada di server: bucket punya
 *     batas ukuran + daftar tipe berkas, dan RLS storage mengatur siapa yang
 *     boleh menulis (migrasi 0003 logo, 0009 invoice, 0010 produk). Jangan
 *     pernah menganggap pemeriksaan di berkas ini sebagai pengamanan.
 *   - Kegagalan di sini TIDAK BOLEH menggagalkan penyimpanan data. Pemanggil
 *     wajib memperlakukan hasil `ok: false` sebagai peringatan saja.
 *   - Pesan kesalahan memakai `Messages` (bahasa yang sedang dipakai) — bukan
 *     Bahasa Indonesia tetap, supaya kegagalan kompresi juga trilingual.
 */

import type { CommonMessages } from "./i18n/messages";

/**
 * Dipakai dari `/cabang/**` (invoice-upload.ts) DAN `/admin/**`
 * (upload-product-photo.ts, partner-actions.tsx), dan cuma pernah membaca
 * `common` — jadi tipenya bentuk struktural minimal ini, cocok baik dengan
 * `CabangMessages` maupun `AdminMessages` tanpa konversi di titik panggil.
 */
type HasCommon = { common: CommonMessages };

export const MAKS_UKURAN_BYTE = 5 * 1024 * 1024; // 5 MB sebelum dikecilkan, SAMA untuk semua preset

/** Kalau canvas gagal, berkas asli masih boleh dipakai selama tidak lebih dari ini (preset logo). */
export const BATAS_ASLI_BYTE = 1024 * 1024; // 1 MB

const TIPE_DIIZINKAN = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/jpg", // beberapa perangkat lama menuliskannya begini
];

/** Konfigurasi pengecilan per jenis pemakaian. */
export type PresetKompres = {
  /** Sisi terpanjang (px) setelah dikecilkan. Gambar kecil tidak diperbesar. */
  maksSisiPx: number;
  /** Mutu WebP/JPEG (0–1). */
  mutu: number;
  /** Kunci m.common.compressLabel* dipakai untuk kata benda pesan kesalahan. */
  labelKey: "compressLabelLogo" | "compressLabelInvoice" | "compressLabelProduk";
  /**
   * Kalau canvas gagal total ATAU hasil kompresi tidak lebih kecil dari
   * aslinya, berkas asli boleh dipakai apa adanya selama tidak lebih besar
   * dari ini. SENGAJA berbeda per preset — untuk invoice, keterbacaan teks
   * menang dari ukuran berkas, jadi ambangnya = batas unggah itu sendiri
   * (5 MB), bukan dipangkas ke 1 MB seperti logo.
   */
  batasAsliByte: number;
  /**
   * Khusus invoice: kalau hasil kompresi pertama (di `maksSisiPx`) masih
   * lebih besar dari `batasUlangByte`, coba SEKALI LAGI di sisi yang lebih
   * pendek ini — bukan langsung menyerah. Kalau percobaan ulang pun gagal,
   * hasil percobaan pertama tetap dipakai (keterbacaan > gagal total).
   */
  sisiUlang?: number;
  batasUlangByte?: number;
};

export const PRESET_LOGO: PresetKompres = {
  maksSisiPx: 512,
  mutu: 0.8,
  labelKey: "compressLabelLogo",
  batasAsliByte: BATAS_ASLI_BYTE, // 1 MB — logo kecil, tidak perlu toleransi besar
};
export const PRESET_INVOICE: PresetKompres = {
  maksSisiPx: 2000,
  mutu: 0.85,
  labelKey: "compressLabelInvoice",
  batasAsliByte: MAKS_UKURAN_BYTE, // 5 MB — keterbacaan teks > ukuran berkas
  sisiUlang: 1600,
  batasUlangByte: MAKS_UKURAN_BYTE, // masih >5 MB di 2000px → coba 1600px sekali
};
export const PRESET_PRODUK: PresetKompres = {
  maksSisiPx: 1280,
  mutu: 0.82,
  labelKey: "compressLabelProduk",
  batasAsliByte: 2 * 1024 * 1024, // 2 MB — sedikit lebih lega dari logo, foto lebih besar
};

// Kompatibilitas mundur: nilai lama tetap diekspor sebagai preset logo.
export const MAKS_SISI_PX = PRESET_LOGO.maksSisiPx;
export const MUTU_WEBP = PRESET_LOGO.mutu;

function formatMB(byte: number): string {
  return (Math.round((byte / (1024 * 1024)) * 10) / 10).toString();
}

/** Pesan kesalahan disusun dari label + ambang preset, dalam bahasa `m`. */
function pesanKompres(m: HasCommon, labelKey: PresetKompres["labelKey"], batasAsliByte: number) {
  const label = m.common[labelKey];
  return {
    tipeSalah: m.common.compressWrongType.replace("{label}", label),
    terlaluBesar: m.common.compressTooLarge
      .replace("{label}", label)
      .replace("{maxMB}", formatMB(MAKS_UKURAN_BYTE)),
    tidakTerbaca: m.common.compressUnreadable,
    tidakBisaDiproses: m.common.compressCannotProcess
      .replace("{label}", label)
      .replace("{limitMB}", formatMB(batasAsliByte)),
  };
}

export type HasilKompres =
  | { ok: true; blob: Blob }
  | { ok: false; message: string };

type Sumber = { gambar: CanvasImageSource; lebar: number; tinggi: number; tutup: () => void };

async function muatGambar(file: File): Promise<Sumber | null> {
  // Jalur cepat: createImageBitmap (tidak perlu menyentuh DOM).
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      if (bitmap.width > 0 && bitmap.height > 0) {
        return {
          gambar: bitmap,
          lebar: bitmap.width,
          tinggi: bitmap.height,
          tutup: () => bitmap.close?.(),
        };
      }
      bitmap.close?.();
    } catch {
      // lanjut ke cara cadangan di bawah
    }
  }

  if (typeof document === "undefined" || typeof URL === "undefined") return null;

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => resolve(null);
      el.src = url;
    });
    if (!img || !img.naturalWidth || !img.naturalHeight) {
      URL.revokeObjectURL(url);
      return null;
    }
    return {
      gambar: img,
      lebar: img.naturalWidth,
      tinggi: img.naturalHeight,
      tutup: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

function keBlob(canvas: HTMLCanvasElement, tipe: string, mutu: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), tipe, mutu);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Menggambar `sumber` ke canvas pada sisi terpanjang `sisiMaks` (gambar
 * kecil tidak diperbesar) dan mengembalikan blob terkompresi (WebP; kalau
 * perangkat tidak mendukung WebP, JPEG). `null` kalau canvas gagal total
 * atau kedua tipe blob gagal dihasilkan.
 */
async function kompresKe(sumber: Sumber, sisiMaks: number, mutu: number): Promise<Blob | null> {
  const skala = Math.min(1, sisiMaks / Math.max(sumber.lebar, sumber.tinggi));
  const lebar = Math.max(1, Math.round(sumber.lebar * skala));
  const tinggi = Math.max(1, Math.round(sumber.tinggi * skala));

  const canvas = document.createElement("canvas");
  canvas.width = lebar;
  canvas.height = tinggi;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(sumber.gambar, 0, 0, lebar, tinggi);

  // WebP dulu (paling kecil). toBlob mengembalikan null kalau tipe tidak didukung.
  let blob = await keBlob(canvas, "image/webp", mutu);
  if (!blob || blob.size === 0) blob = await keBlob(canvas, "image/jpeg", mutu);
  return blob && blob.size > 0 ? blob : null;
}

/**
 * Memeriksa dan mengecilkan satu berkas gambar sesuai `preset`.
 *
 * Berhasil → Blob siap unggah (WebP; kalau perangkat tidak mendukung WebP,
 * JPEG; kalau canvas gagal total, berkas asli selama masih di bawah batas
 * preset tersebut).
 */
export async function compressImage(
  file: File,
  preset: PresetKompres,
  m: HasCommon
): Promise<HasilKompres> {
  const pesan = pesanKompres(m, preset.labelKey, preset.batasAsliByte);
  // Pemeriksaan yang pasti bisa dilakukan tanpa canvas — dilakukan lebih dulu.
  const tipe = (file.type || "").toLowerCase();
  if (!TIPE_DIIZINKAN.includes(tipe)) return { ok: false, message: pesan.tipeSalah };
  if (file.size > MAKS_UKURAN_BYTE) return { ok: false, message: pesan.terlaluBesar };

  /** Cadangan terakhir: pakai berkas asli, tapi hanya kalau memang sudah kecil. */
  const cadangan = (): HasilKompres =>
    file.size <= preset.batasAsliByte
      ? { ok: true, blob: file }
      : { ok: false, message: pesan.tidakBisaDiproses };

  let sumber: Sumber | null = null;
  try {
    sumber = await muatGambar(file);
    if (!sumber) {
      // Berkas mengaku gambar tapi tidak bisa dibaca — jangan diunggah begitu saja.
      return { ok: false, message: pesan.tidakTerbaca };
    }

    let blob = await kompresKe(sumber, preset.maksSisiPx, preset.mutu);
    if (!blob) return cadangan();

    // Preset invoice: teks harus tetap terbaca, tapi berkas jangan sampai
    // raksasa untuk jaringan lemah. Kalau versi pertama masih lebih besar
    // dari ambang, coba SEKALI LAGI di sisi yang lebih pendek — bukan
    // langsung gagal. Kalau percobaan ulang pun gagal (mis. canvas error di
    // tengah jalan), tetap pakai hasil percobaan pertama: keterbacaan lebih
    // penting daripada menggagalkan unggahan.
    if (preset.sisiUlang && preset.batasUlangByte && blob.size > preset.batasUlangByte) {
      const ulang = await kompresKe(sumber, preset.sisiUlang, preset.mutu);
      if (ulang) blob = ulang;
    }

    // Kalau hasil "pengecilan" malah lebih besar dari aslinya (gambar mungil,
    // PNG datar), kirim yang asli saja — selama masih di bawah batas preset ini.
    if (blob.size >= file.size && file.size <= preset.batasAsliByte) return { ok: true, blob: file };
    return { ok: true, blob };
  } catch {
    // Canvas bisa gagal total (mis. gambar dari sumber lain / memori habis).
    return cadangan();
  } finally {
    try {
      sumber?.tutup();
    } catch {
      // tidak penting — hanya membersihkan memori
    }
  }
}
