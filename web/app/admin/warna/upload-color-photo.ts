"use client";

import { compressImage, PRESET_PRODUK } from "@/lib/compress-image";
import type { AdminMessages } from "@/lib/i18n";

/**
 * Unggah SATU foto warna — meniru EXACT unggahFotoGaleri di
 * app/admin/produk/upload-gallery-photo.ts: sama preset (PRESET_PRODUK),
 * sama impor dinamis supabase-js, sama bucket (`product-photos`), sama
 * `upsert:false` (path acak per unggahan, tidak pernah menimpa foto lain),
 * sama `cacheControl` dan konvensi `?v=` (LESSONS #22). SATU-SATUNYA beda:
 * path `colors/<id acak>.webp` (bukan `<product_id>/gallery/<id>.webp>` —
 * warna adalah palet GLOBAL, bukan milik satu produk).
 *
 * Mengembalikan URL publik siap disimpan (dengan `?v=`) kalau berhasil,
 * `null` kalau gagal — pemanggil (add-color-button.tsx) yang memutuskan cara
 * melaporkannya, TIDAK pernah melempar error di sini.
 */
export async function unggahFotoWarna(file: File, messages: AdminMessages): Promise<{ url: string | null; warning: string | null }> {
  const kecil = await compressImage(file, PRESET_PRODUK, messages);
  if (!kecil.ok) return { url: null, warning: `${messages.admin.photoUploadFailed} ${kecil.message}` };

  const tipe = kecil.blob.type || "image/webp";
  const id = crypto.randomUUID();
  const path = `colors/${id}.webp`;

  try {
    // supabase-js diimpor DINAMIS (pola upload-gallery-photo.ts / audit
    // kecepatan muat 2026-08-22 #3): hanya dipakai saat admin benar-benar
    // menambah warna, tidak menyeret ~65 kB gzip SDK ke first-load /admin/warna.
    const { createClient: createBrowserSupabase } = await import("@/lib/supabase/client");
    const supabase = createBrowserSupabase();
    const { error } = await supabase.storage.from("product-photos").upload(path, kecil.blob, {
      upsert: false,
      contentType: tipe,
      cacheControl: "31536000",
    });
    if (error) return { url: null, warning: messages.admin.photoUploadFailed };

    const { data } = supabase.storage.from("product-photos").getPublicUrl(path);
    if (!data?.publicUrl) return { url: null, warning: messages.admin.photoUploadFailed };

    return { url: `${data.publicUrl}?v=${Date.now()}`, warning: null };
  } catch {
    return { url: null, warning: messages.admin.photoUploadFailed };
  }
}
