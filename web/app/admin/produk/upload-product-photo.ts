"use client";

import { compressImage, PRESET_PRODUK } from "@/lib/compress-image";
import { submitSafely } from "@/lib/safe-write";
import type { AdminMessages } from "@/lib/i18n";
import { setProductPhoto } from "../actions-products";

/**
 * Dipakai oleh add-product-button.tsx dan product-actions.tsx — satu tempat
 * untuk urutan "kompres di browser → unggah ke storage → catat alamatnya",
 * meniru pola unggahLogo di partners/[id]/partner-actions.tsx.
 *
 * Path TETAP per produk (`<product_id>/foto`, tanpa ekstensi di nama berkas —
 * migration 0010 §7 menyepakati bentuk ini dan mendokumentasikan alasannya:
 * "satu produk = satu path tetap yang ditimpa (upsert)", supaya ganti foto
 * tidak menumpuk berkas yatim di storage selamanya). Tipe berkas yang benar
 * tetap dikirim lewat header `contentType` saat upload — path tidak perlu
 * berekstensi supaya browser menampilkannya benar. Parameter `?v=` WAJIB
 * ditambahkan (LESSONS #22 + migration 0010 §7): path yang sama + isi
 * berkas berubah = tanpa penanda versi, admin yang ganti foto akan tetap
 * melihat foto lama dari cache/CDN dan menyimpulkan gagal simpan.
 *
 * Teks peringatannya hidup di lib/i18n/messages/admin.ts (kunci
 * `photoUploadFailed`) — pemanggil menyerahkan `AdminMessages` miliknya sendiri
 * (komponen client, jadi selalu lewat `useAdminMessages()`).
 */

/**
 * `warning` null kalau berhasil, atau teks peringatan kalau gagal; `url`
 * adalah alamat ber-`?v=` yang BENAR-BENAR tercatat ke DB (null saat gagal)
 * — pemanggil yang menampilkan foto dari state client (kartu /admin/produk)
 * memakai `url` untuk mem-patch barisnya (LESSONS #22 + #45: URL lama
 * immutable di cache, tanpa patch kartu terus menampilkan foto lama).
 * Tidak pernah melempar error — pemanggil TIDAK BOLEH ikut gagal karenanya,
 * data produk sudah dipastikan tersimpan lebih dulu (aturan sama dengan logo
 * partner: foto adalah langkah terakhir, kegagalannya cuma peringatan).
 */
export async function unggahFotoProduk(
  productId: string,
  file: File,
  messages: AdminMessages
): Promise<{ warning: string | null; url: string | null }> {
  // Foto produk: sisi 1280 px supaya tajam di grid katalog + foto besar detail, bukan 512 px logo.
  const kecil = await compressImage(file, PRESET_PRODUK, messages);
  if (!kecil.ok) return { warning: `${messages.admin.photoUploadFailed} ${kecil.message}`, url: null };

  const tipe = kecil.blob.type || "image/webp";
  const path = `${productId}/foto`;

  // Diisi HANYA setelah setProductPhoto memastikan alamatnya tercatat — nilai
  // ini bukti simpanan, bukan niat (LESSONS #7).
  let urlTersimpan: string | null = null;

  const out = await submitSafely({
    kind: "update",
    timeoutMs: 30_000,
    messages,
    run: async () => {
      // supabase-js diimpor DINAMIS di sini, bukan statis di atas berkas
      // (audit kecepatan muat 2026-08-22 #3, lanjutan pola sign-out-button.tsx):
      // dipakai add-product-button.tsx DAN product-actions.tsx (dua titik
      // masuk /admin/produk), impor statis menyeret ~65 kB gzip SDK ke
      // first-load halaman itu padahal cuma dipakai kalau admin benar-benar
      // ganti foto produk. Aman: kalau `import()` gagal (jaringan lemah),
      // rejection-nya keluar dari `run()` dan ditangkap oleh try/catch
      // `submitSafely` (lib/safe-write.ts) yang SUDAH ADA untuk semua
      // kegagalan jaringan lain di sini — jatuh ke cabang "unconfirmed" yang
      // sama, pesan yang sama, TIDAK ada jalur gagal-diam baru.
      const { createClient: createBrowserSupabase } = await import("@/lib/supabase/client");
      const supabase = createBrowserSupabase();
      const { error } = await supabase.storage.from("product-photos").upload(path, kecil.blob, {
        upsert: true,
        contentType: tipe,
        // Setahun penuh: URL foto selalu membawa ?v=<timestamp> (LESSONS #22),
        // ganti foto = ganti URL, jadi konten di URL yang sama TIDAK PERNAH
        // berubah — cache 1 jam berarti browser/CDN memvalidasi ulang 169
        // foto setiap jam tanpa alasan (audit kecepatan muat 2026-08-22 #4).
        cacheControl: "31536000",
      });
      if (error) return false;

      const { data } = supabase.storage.from("product-photos").getPublicUrl(path);
      if (!data?.publicUrl) return false;

      const url = `${data.publicUrl}?v=${Date.now()}`;
      const res = await setProductPhoto(productId, url);
      if ("error" in res) return false;
      urlTersimpan = url;
      return true;
    },
  });

  if (out.status !== "ok" || out.result === false) {
    return { warning: messages.admin.photoUploadFailed, url: null };
  }
  return { warning: null, url: urlTersimpan };
}
