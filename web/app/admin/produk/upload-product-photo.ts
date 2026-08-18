"use client";

import { compressImage, PRESET_PRODUK } from "@/lib/compress-image";
import { submitSafely } from "@/lib/safe-write";
import { createClient as createBrowserSupabase } from "@/lib/supabase/client";
import type { Messages } from "@/lib/i18n";
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
 * `photoUploadFailed`) — pemanggil menyerahkan `Messages` miliknya sendiri
 * (komponen client, jadi selalu lewat `useMessages()`).
 */

/**
 * Mengembalikan null kalau berhasil, atau teks peringatan kalau gagal. Tidak
 * pernah melempar error — pemanggil TIDAK BOLEH ikut gagal karenanya, data
 * produk sudah dipastikan tersimpan lebih dulu (aturan sama dengan logo
 * partner: foto adalah langkah terakhir, kegagalannya cuma peringatan).
 */
export async function unggahFotoProduk(productId: string, file: File, messages: Messages): Promise<string | null> {
  // Foto produk: sisi 1280 px supaya tajam di grid katalog + foto besar detail, bukan 512 px logo.
  const kecil = await compressImage(file, PRESET_PRODUK, messages);
  if (!kecil.ok) return `${messages.admin.photoUploadFailed} ${kecil.message}`;

  const tipe = kecil.blob.type || "image/webp";
  const path = `${productId}/foto`;

  const out = await submitSafely({
    kind: "update",
    timeoutMs: 30_000,
    messages,
    run: async () => {
      const supabase = createBrowserSupabase();
      const { error } = await supabase.storage.from("product-photos").upload(path, kecil.blob, {
        upsert: true,
        contentType: tipe,
        cacheControl: "3600",
      });
      if (error) return false;

      const { data } = supabase.storage.from("product-photos").getPublicUrl(path);
      if (!data?.publicUrl) return false;

      const res = await setProductPhoto(productId, `${data.publicUrl}?v=${Date.now()}`);
      return !("error" in res);
    },
  });

  if (out.status !== "ok" || out.result === false) return messages.admin.photoUploadFailed;
  return null;
}
