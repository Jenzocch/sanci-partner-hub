"use client";

/**
 * Unggah invoice dari sisi ADMIN — cermin web/app/cabang/pesanan/
 * invoice-upload.ts (baca komentar desain lengkap di sana; alur 3 langkahnya
 * identik: kompres di browser → unggah langsung ke bucket privat → Server
 * Action mencatat path). TIDAK memakai berkas cabang itu langsung karena dua
 * hal yang memang beda area: teksnya AdminMessages (bukan CabangMessages),
 * dan pencatatan path lewat setOrderInvoicePathAdmin (setOrderInvoicePath
 * cabang menuntut identitas partner_users yang tidak dimiliki akun admin).
 *
 * Storage RLS: policy order_invoices_insert/update (migrasi 0009 §6) memuat
 * `public.fn_is_admin()` — sesi browser admin BOLEH mengunggah ke path order
 * mana pun. Ini diverifikasi dengan membaca policy-nya sebelum fitur ini
 * dibuat; kalau kelak policy itu berubah, unggahan gagal jadi peringatan
 * (pesanan tetap tersimpan), tidak pernah menggagalkan pesanan.
 */

import { compressImage, MAKS_UKURAN_BYTE, PRESET_INVOICE } from "@/lib/compress-image";
import { submitSafely } from "@/lib/safe-write";
import type { AdminMessages } from "@/lib/i18n";
import { setOrderInvoicePathAdmin } from "../../actions-create-order";

export const INVOICE_ACCEPT = "image/png,image/jpeg,image/webp,application/pdf";

type SiapUnggah = { blob: Blob; ext: string; contentType: string };

async function siapkanInvoice(
  m: AdminMessages,
  file: File
): Promise<{ ok: true; data: SiapUnggah } | { ok: false; message: string }> {
  const tipe = (file.type || "").toLowerCase();

  if (tipe === "application/pdf") {
    if (file.size > MAKS_UKURAN_BYTE) return { ok: false, message: m.admin.orderCreateInvoiceTooLarge };
    return { ok: true, data: { blob: file, ext: "pdf", contentType: "application/pdf" } };
  }

  if (!["image/png", "image/jpeg", "image/webp", "image/jpg"].includes(tipe)) {
    return { ok: false, message: m.admin.orderCreateInvoiceWrongType };
  }

  const kecil = await compressImage(file, PRESET_INVOICE, m);
  if (!kecil.ok) return { ok: false, message: kecil.message };
  const ext = kecil.blob.type === "image/webp" ? "webp" : kecil.blob.type === "image/png" ? "png" : "jpg";
  return { ok: true, data: { blob: kecil.blob, ext, contentType: kecil.blob.type || "image/jpeg" } };
}

/**
 * Mengembalikan `null` kalau berhasil, atau teks peringatan kalau gagal.
 * Tidak pernah melempar error — pemanggil tidak boleh ikut gagal karenanya.
 */
export async function unggahInvoiceAdmin(m: AdminMessages, orderId: string, file: File): Promise<string | null> {
  const siap = await siapkanInvoice(m, file);
  if (!siap.ok) return `${m.admin.orderCreateInvoiceUploadFailed} ${siap.message}`;

  // Nama tetap (upsert) per order — sama dengan cabang: ganti file cukup
  // menimpa yang lama, tidak menumpuk berkas yatim.
  const path = `${orderId}/invoice.${siap.data.ext}`;
  const out = await submitSafely({
    kind: "update",
    messages: m,
    timeoutMs: 30_000,
    run: async () => {
      // supabase-js diimpor DINAMIS di sini, bukan statis di atas berkas
      // (audit kecepatan muat 2026-08-22 #3, lanjutan pola sign-out-button.tsx):
      // impor statis menyeret ~65 kB gzip SDK ke first-load HALAMAN INI
      // (/admin/orders/baru) padahal cuma dipakai kalau admin benar-benar
      // melampirkan invoice. Aman: kalau `import()` gagal (jaringan lemah),
      // rejection-nya keluar dari `run()` dan ditangkap oleh try/catch
      // `submitSafely` (lib/safe-write.ts) yang SUDAH ADA untuk semua
      // kegagalan jaringan lain di sini — jatuh ke cabang "unconfirmed" yang
      // sama, pesan yang sama, TIDAK ada jalur gagal-diam baru.
      const { createClient: createBrowserSupabase } = await import("@/lib/supabase/client");
      const supabase = createBrowserSupabase();
      const { error } = await supabase.storage.from("order-invoices").upload(path, siap.data.blob, {
        upsert: true,
        contentType: siap.data.contentType,
      });
      if (error) return false;

      const res = await setOrderInvoicePathAdmin({ orderId, path });
      return !("error" in res);
    },
  });

  if (out.status !== "ok" || out.result === false) return m.admin.orderCreateInvoiceUploadFailed;
  return null;
}
