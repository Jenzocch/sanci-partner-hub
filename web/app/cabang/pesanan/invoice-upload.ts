"use client";

/**
 * Unggah invoice/kuitansi (SPEC Fase 2 slice 4) — dipakai form Pesanan Baru
 * DAN halaman detail (ganti berkas). Satu tempat supaya logikanya tidak
 * digandakan di dua komponen.
 *
 * Pola sama persis dengan logo partner (lib/partner-logo + partner-actions.tsx):
 *   1. Data pesanan dulu tersimpan/dipastikan ada — invoice diunggah PALING
 *      AKHIR, gagalnya TIDAK PERNAH menggagalkan pesanan (SPEC §41 turunan).
 *   2. Gambar dikecilkan di browser lewat compressImage sebelum dikirim; PDF
 *      dikirim apa adanya (tidak bisa dikecilkan di browser), hanya dicek
 *      ukurannya.
 *   3. Unggah langsung dari browser ke bucket privat `order-invoices`, lalu
 *      Server Action `setOrderInvoicePath` mencatat alamatnya (server tidak
 *      pernah percaya path dari client tanpa diperiksa — lihat actions.ts).
 */

import { compressImage, MAKS_UKURAN_BYTE, PRESET_INVOICE } from "@/lib/compress-image";
import { submitSafely } from "@/lib/safe-write";
import type { CabangMessages } from "@/lib/i18n";
import { setOrderInvoicePath } from "./actions";

export const INVOICE_ACCEPT = "image/png,image/jpeg,image/webp,application/pdf";

type SiapUnggah = { blob: Blob; ext: string; contentType: string };

async function siapkanInvoice(
  m: CabangMessages,
  file: File
): Promise<{ ok: true; data: SiapUnggah } | { ok: false; message: string }> {
  const tipe = (file.type || "").toLowerCase();

  if (tipe === "application/pdf") {
    if (file.size > MAKS_UKURAN_BYTE) return { ok: false, message: m.cabang.errInvoiceTooLarge };
    return { ok: true, data: { blob: file, ext: "pdf", contentType: "application/pdf" } };
  }

  if (!["image/png", "image/jpeg", "image/webp", "image/jpg"].includes(tipe)) {
    return { ok: false, message: m.cabang.errInvoiceWrongType };
  }

  // Invoice: sisi 2000 px + mutu tinggi supaya nominal tetap terbaca (bukan
  // 512 px logo). Kalau hasilnya masih >5 MB, compressImage otomatis coba
  // ulang di 1600 px sekali sebelum menyerah — keterbacaan didahulukan.
  const kecil = await compressImage(file, PRESET_INVOICE, m);
  if (!kecil.ok) return { ok: false, message: kecil.message };
  const ext = kecil.blob.type === "image/webp" ? "webp" : kecil.blob.type === "image/png" ? "png" : "jpg";
  return { ok: true, data: { blob: kecil.blob, ext, contentType: kecil.blob.type || "image/jpeg" } };
}

/**
 * Mengunggah invoice dari BROWSER ke bucket privat `order-invoices`, lalu
 * mencatat alamatnya lewat Server Action. Mengembalikan `null` kalau
 * berhasil, atau teks peringatan kalau gagal. Tidak pernah melempar error —
 * pemanggil (form Pesanan Baru / halaman detail) tidak boleh ikut gagal
 * karenanya.
 */
export async function unggahInvoice(m: CabangMessages, orderId: string, file: File): Promise<string | null> {
  const siap = await siapkanInvoice(m, file);
  if (!siap.ok) return `${m.cabang.errInvoiceUploadFailed} ${siap.message}`;

  // Nama tetap (upsert) per order — "ganti file" cukup menimpa yang lama,
  // tidak menumpuk berkas yatim.
  const path = `${orderId}/invoice.${siap.data.ext}`;
  const out = await submitSafely({
    kind: "update",
    messages: m,
    timeoutMs: 30_000,
    run: async () => {
      // supabase-js diimpor DINAMIS di sini, bukan statis di atas berkas
      // (audit kecepatan muat 2026-08-22 #3, lanjutan pola sign-out-button.tsx):
      // impor statis menyeret ~65 kB gzip SDK ke first-load DUA halaman
      // (form Pesanan Baru + halaman detail pesanan) padahal cuma dipakai
      // kalau pengguna benar-benar melampirkan invoice. Aman: kalau `import()`
      // gagal (jaringan lemah), rejection-nya keluar dari `run()` dan
      // ditangkap oleh try/catch `submitSafely` (lib/safe-write.ts) yang
      // SUDAH ADA untuk semua kegagalan jaringan lain di sini — jatuh ke
      // cabang "unconfirmed" yang sama, pesan yang sama, TIDAK ada jalur
      // gagal-diam baru.
      const { createClient: createBrowserSupabase } = await import("@/lib/supabase/client");
      const supabase = createBrowserSupabase();
      const { error } = await supabase.storage.from("order-invoices").upload(path, siap.data.blob, {
        upsert: true,
        contentType: siap.data.contentType,
      });
      if (error) return false;

      const res = await setOrderInvoicePath({ orderId, path });
      return !("error" in res);
    },
  });

  if (out.status !== "ok" || out.result === false) return m.cabang.errInvoiceUploadFailed;
  return null;
}
