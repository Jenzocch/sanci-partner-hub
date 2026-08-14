/**
 * Pengecilan gambar logo di browser (SPEC §41).
 *
 * Tujuannya: pemilik toko sering memotret/menyimpan logo dalam ukuran besar.
 * Mengunggah berkas 4 MB lewat jaringan lemah hampir pasti gagal, jadi gambar
 * dikecilkan dulu di perangkat sebelum dikirim.
 *
 * Aturan yang tidak boleh dilanggar:
 *   - Ini HANYA kenyamanan. Pengaman sebenarnya ada di server: bucket punya
 *     batas ukuran + daftar tipe berkas, dan RLS storage hanya mengizinkan
 *     admin menulis (migrasi 0003). Jangan pernah menganggap pemeriksaan di
 *     berkas ini sebagai pengamanan.
 *   - Kegagalan di sini TIDAK BOLEH menggagalkan penyimpanan data partner.
 *     Pemanggil wajib memperlakukan hasil `ok: false` sebagai peringatan saja.
 *   - Semua pesan Bahasa Indonesia sederhana, tanpa istilah teknis.
 */

export const MAKS_UKURAN_BYTE = 5 * 1024 * 1024; // 5 MB sebelum dikecilkan
export const MAKS_SISI_PX = 512; // sisi terpanjang setelah dikecilkan
export const MUTU_WEBP = 0.8;

/** Kalau canvas gagal, berkas asli masih boleh dipakai selama tidak lebih dari ini. */
export const BATAS_ASLI_BYTE = 1024 * 1024; // 1 MB

const TIPE_DIIZINKAN = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/jpg", // beberapa perangkat lama menuliskannya begini
];

export const PESAN_LOGO = {
  tipeSalah: "Format logo harus PNG, JPG, atau WebP.",
  terlaluBesar: "Ukuran logo maksimal 5 MB. Pilih gambar yang lebih kecil.",
  tidakTerbaca: "Gambar itu tidak bisa dibaca. Coba pilih berkas gambar lain.",
  tidakBisaDiproses:
    "Logo tidak bisa diproses di perangkat ini. Coba pakai gambar yang lebih kecil (di bawah 1 MB).",
} as const;

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
 * Memeriksa dan mengecilkan satu berkas logo.
 *
 * Berhasil → Blob siap unggah (WebP; kalau perangkat tidak mendukung WebP,
 * JPEG; kalau canvas gagal total, berkas asli selama masih kecil).
 */
export async function compressImage(file: File): Promise<HasilKompres> {
  // Pemeriksaan yang pasti bisa dilakukan tanpa canvas — dilakukan lebih dulu.
  const tipe = (file.type || "").toLowerCase();
  if (!TIPE_DIIZINKAN.includes(tipe)) return { ok: false, message: PESAN_LOGO.tipeSalah };
  if (file.size > MAKS_UKURAN_BYTE) return { ok: false, message: PESAN_LOGO.terlaluBesar };

  /** Cadangan terakhir: pakai berkas asli, tapi hanya kalau memang sudah kecil. */
  const cadangan = (): HasilKompres =>
    file.size <= BATAS_ASLI_BYTE
      ? { ok: true, blob: file }
      : { ok: false, message: PESAN_LOGO.tidakBisaDiproses };

  let sumber: Sumber | null = null;
  try {
    sumber = await muatGambar(file);
    if (!sumber) {
      // Berkas mengaku gambar tapi tidak bisa dibaca — jangan diunggah begitu saja.
      return { ok: false, message: PESAN_LOGO.tidakTerbaca };
    }

    const skala = Math.min(1, MAKS_SISI_PX / Math.max(sumber.lebar, sumber.tinggi));
    const lebar = Math.max(1, Math.round(sumber.lebar * skala));
    const tinggi = Math.max(1, Math.round(sumber.tinggi * skala));

    const canvas = document.createElement("canvas");
    canvas.width = lebar;
    canvas.height = tinggi;
    const ctx = canvas.getContext("2d");
    if (!ctx) return cadangan();
    ctx.drawImage(sumber.gambar, 0, 0, lebar, tinggi);

    // WebP dulu (paling kecil). toBlob mengembalikan null kalau tipe tidak didukung.
    let blob = await keBlob(canvas, "image/webp", MUTU_WEBP);
    if (!blob || blob.size === 0) blob = await keBlob(canvas, "image/jpeg", MUTU_WEBP);
    if (!blob || blob.size === 0) return cadangan();

    // Kalau hasil "pengecilan" malah lebih besar dari aslinya (logo mungil, PNG
    // datar), kirim yang asli saja — selama masih kecil.
    if (blob.size >= file.size && file.size <= BATAS_ASLI_BYTE) return { ok: true, blob: file };
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
