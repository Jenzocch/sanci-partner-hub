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

import { compressImage, MAKS_UKURAN_BYTE } from "@/lib/compress-image";
import { submitSafely } from "@/lib/safe-write";
import { createClient as createBrowserSupabase } from "@/lib/supabase/client";
import { setOrderInvoicePath } from "./actions";

export const INVOICE_ACCEPT = "image/png,image/jpeg,image/webp,application/pdf";

export const INVOICE_GAGAL = "Invoice gagal diunggah — data pesanan tetap tersimpan.";

const PESAN_INVOICE = {
  tipeSalah: "Format invoice harus PNG, JPG, WebP, atau PDF.",
  terlaluBesar: "Ukuran invoice maksimal 5 MB. Pilih berkas yang lebih kecil.",
};

type SiapUnggah = { blob: Blob; ext: string; contentType: string };

async function siapkanInvoice(file: File): Promise<{ ok: true; data: SiapUnggah } | { ok: false; message: string }> {
  const tipe = (file.type || "").toLowerCase();

  if (tipe === "application/pdf") {
    if (file.size > MAKS_UKURAN_BYTE) return { ok: false, message: PESAN_INVOICE.terlaluBesar };
    return { ok: true, data: { blob: file, ext: "pdf", contentType: "application/pdf" } };
  }

  if (!["image/png", "image/jpeg", "image/webp", "image/jpg"].includes(tipe)) {
    return { ok: false, message: PESAN_INVOICE.tipeSalah };
  }

  const kecil = await compressImage(file);
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
export async function unggahInvoice(orderId: string, file: File): Promise<string | null> {
  const siap = await siapkanInvoice(file);
  if (!siap.ok) return `${INVOICE_GAGAL} ${siap.message}`;

  // Nama tetap (upsert) per order — "ganti file" cukup menimpa yang lama,
  // tidak menumpuk berkas yatim.
  const path = `${orderId}/invoice.${siap.data.ext}`;
  const out = await submitSafely({
    kind: "update",
    timeoutMs: 30_000,
    run: async () => {
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

  if (out.status !== "ok" || out.result === false) return INVOICE_GAGAL;
  return null;
}
