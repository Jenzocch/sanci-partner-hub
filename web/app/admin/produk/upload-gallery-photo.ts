"use client";

import { compressImage, PRESET_PRODUK } from "@/lib/compress-image";
import { submitSafely } from "@/lib/safe-write";
import type { AdminMessages } from "@/lib/i18n";
import { addProductPhoto } from "../actions-product-photos";

/**
 * Unggah SATU foto galeri (dipanggil sekali per berkas — pemanggil yang
 * memilih banyak berkas cukup memanggil ini di dalam loop, lihat
 * product-gallery-client.tsx). Path storage per foto galeri, BEDA dari foto
 * sampul (upload-product-photo.ts, path tetap `<product_id>/foto` yang
 * ditimpa): `<product_id>/gallery/<id acak>.webp` — SATU baris DB = SATU
 * berkas storage sendiri, tidak pernah saling menimpa antar foto galeri.
 * `?v=` tetap disertakan (LESSONS #22 + migration 0022 §1) untuk konsisten
 * dengan konvensi 0010/0021, walau path acak di sini sudah unik per unggahan
 * dengan sendirinya.
 *
 * Kembalikan `null` kalau berhasil, teks peringatan kalau gagal. Tidak
 * pernah melempar error — kegagalan SATU foto tidak boleh menghentikan sisa
 * foto lain yang sedang diunggah dalam satu batch (lihat pemanggil).
 */
export async function unggahFotoGaleri(productId: string, file: File, messages: AdminMessages): Promise<string | null> {
  const kecil = await compressImage(file, PRESET_PRODUK, messages);
  if (!kecil.ok) return `${messages.admin.photoUploadFailed} ${kecil.message}`;

  const tipe = kecil.blob.type || "image/webp";
  const id = crypto.randomUUID();
  const path = `${productId}/gallery/${id}.webp`;

  const out = await submitSafely({
    kind: "update",
    timeoutMs: 30_000,
    messages,
    run: async () => {
      // supabase-js diimpor DINAMIS (pola sign-out-button.tsx / upload-product-photo.ts
      // — audit kecepatan muat 2026-08-22 #3): dipakai HANYA saat admin benar-benar
      // menambah foto galeri, tidak menyeret ~65 kB gzip SDK ke first-load /admin/produk.
      const { createClient: createBrowserSupabase } = await import("@/lib/supabase/client");
      const supabase = createBrowserSupabase();
      const { error } = await supabase.storage.from("product-photos").upload(path, kecil.blob, {
        upsert: false, // path acak per unggahan — tidak PERNAH menimpa foto lain
        contentType: tipe,
        cacheControl: "31536000", // sama alasan dengan upload-product-photo.ts
      });
      if (error) return false;

      const { data } = supabase.storage.from("product-photos").getPublicUrl(path);
      if (!data?.publicUrl) return false;

      const res = await addProductPhoto(productId, `${data.publicUrl}?v=${Date.now()}`);
      return !("error" in res);
    },
  });

  if (out.status !== "ok" || out.result === false) return messages.admin.photoUploadFailed;
  return null;
}

/**
 * Path storage galeri dari URL publik yang tersimpan di DB (kebalikan dari
 * konstruksi di atas) — dipakai product-gallery-client.tsx untuk best-effort
 * menghapus berkas storage SESUDAH baris DB-nya terhapus (DB otoritatif,
 * lihat catatan di actions-product-photos.ts::deleteProductPhoto). `null`
 * kalau URL-nya tidak berbentuk seperti yang diharapkan — pemanggil
 * melewati langkah hapus storage-nya (baris DB tetap terhapus; berkas
 * storage yatim DAPAT DITERIMA, bukan kondisi gagal).
 */
export function pathFotoGaleriDariUrl(photoUrl: string): string | null {
  const marker = "/storage/v1/object/public/product-photos/";
  const idx = photoUrl.indexOf(marker);
  if (idx === -1) return null;
  const rest = photoUrl.slice(idx + marker.length);
  const withoutQuery = rest.split("?")[0];
  return withoutQuery && withoutQuery.includes("/gallery/") ? withoutQuery : null;
}
