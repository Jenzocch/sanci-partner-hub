/* ==========================================================================
 * ⚠️  KUNCI service_role — FILE PALING BERBAHAYA DI REPO INI  ⚠️
 * ==========================================================================
 *
 * Klien yang dibuat di sini memakai `SUPABASE_SERVICE_ROLE_KEY`. Kunci itu
 * MELEWATI SELURUH RLS: dengan kunci ini setiap baris milik setiap partner
 * bisa dibaca, diubah, dan dihapus tanpa satu pun pemeriksaan izin. Bocornya
 * kunci ini = seluruh pemisahan antar-partner (SPEC §32–34) hilang.
 *
 * ATURAN YANG TIDAK BOLEH DILANGGAR:
 *
 *  1. File ini HANYA boleh diimpor dari kode yang berjalan di server
 *     (Server Action / Server Component). JANGAN PERNAH diimpor dari file
 *     ber-"use client". `assertServerOnly()` di bawah adalah jaring pengaman
 *     terakhir, bukan izin untuk lengah.
 *  2. Klien service_role dibuat DI DALAM Server Action, SESUDAH pemanggilnya
 *     terbukti SANCI Admin (cek ke `platform_admins` memakai sesi pengguna
 *     sendiri). Bukan variabel modul, bukan singleton — begitu klien ini ada,
 *     tidak ada lagi RLS yang menjaga (LESSONS #5).
 *  3. Klien ini HANYA dipakai untuk operasi Auth Admin yang memang tidak
 *     mungkin lewat anon key: `auth.admin.createUser` dan pembatalannya
 *     (`auth.admin.deleteUser`). Penulisan tabel `public.*` TETAP memakai
 *     klien sesi biasa supaya RLS tetap berlaku (pertahanan berlapis).
 *  4. Nilai kuncinya tidak pernah di-log, tidak pernah dikembalikan ke
 *     pemanggil, dan tidak pernah masuk pesan error.
 *  5. Nama variabelnya sengaja TANPA awalan `NEXT_PUBLIC_`. Next.js hanya
 *     menyisipkan variabel ber-awalan itu ke bundel browser, jadi kunci ini
 *     secara struktural tidak bisa ikut terkirim ke perangkat pengguna.
 *
 * Kunci diisi di Vercel → Project → Settings → Environment Variables.
 * Selama belum diisi, `createAdminClient()` mengembalikan null dan fitur
 * pembuatan akun menjelaskan keadaannya alih-alih rusak (LESSONS #12).
 * ========================================================================== */

import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

/**
 * Selalu dibaca sebagai `process.env.SUPABASE_SERVICE_ROLE_KEY` secara harfiah
 * (bukan `process.env[variabel]`) supaya penggantian nilai saat build tetap
 * bekerja di semua runtime Next.js.
 */
function serviceRoleKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY;
}

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    // Sengaja gagal keras, bukan diam-diam. Kalau baris ini pernah jalan,
    // ada file "use client" yang mengimpor modul ini — itu bug arsitektur
    // yang harus diperbaiki, bukan ditoleransi.
    throw new Error("Modul admin Supabase hanya boleh dipakai di server.");
  }
}

/**
 * Apakah kunci service_role sudah tersedia di server?
 *
 * Dipakai Server Component untuk memilih tampilan (form vs penjelasan).
 * Hanya mengembalikan boolean — nilai kuncinya tidak pernah keluar dari sini.
 */
export function isServiceRoleConfigured(): boolean {
  assertServerOnly();
  return !!serviceRoleKey() && !!process.env.NEXT_PUBLIC_SUPABASE_URL;
}

/**
 * Membuat klien service_role sekali pakai untuk SATU Server Action.
 *
 * Mengembalikan `null` kalau kunci belum diatur — pemanggil WAJIB menangani
 * null itu dengan pesan yang bisa ditindaklanjuti, bukan dengan `!` .
 *
 * Panggil ini SESUDAH memverifikasi pemanggilnya SANCI Admin. Urutannya tidak
 * boleh dibalik: begitu klien ini hidup, tidak ada RLS yang menahan apa pun.
 */
export function createAdminClient(): SupabaseClient | null {
  assertServerOnly();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = serviceRoleKey();
  if (!url || !key) return null;

  return createSupabaseClient(url, key, {
    auth: {
      // Klien ini tidak boleh punya sesi sama sekali: tidak menyimpan,
      // tidak menyegarkan, tidak membaca URL. Ia hanya alat sekali pakai.
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
