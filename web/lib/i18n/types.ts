/**
 * Tiga bahasa: Indonesia (bawaan), Inggris, Mandarin Sederhana.
 *
 * KENAPA BUKAN routing per-locale (/id/... /en/...): mengubah setiap URL akan
 * memutus start_url PWA yang sudah dipasang di HP staf dan setiap bookmark
 * yang sudah ada. Locale disimpan di cookie — URL tidak berubah sama sekali.
 *
 * KENAPA objek BERTIPE, bukan JSON: kunci yang hilang di salah satu bahasa
 * menjadi ERROR SAAT BUILD, bukan tulisan mentah yang muncul di layar
 * pengguna. Ini menggantikan "leaf-count check" manual yang dipakai proyek
 * lain (LESSONS #13): TypeScript yang menjaga, bukan ingatan orang.
 *
 * Bahasa Indonesia adalah SUMBER KEBENARAN untuk daftar kunci — dua bahasa
 * lain wajib mengikuti bentuknya persis.
 */

export const LOCALES = ["id", "en", "zh"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "id";

/** Nama bahasa dalam bahasanya sendiri — untuk pemilih bahasa. */
export const LOCALE_NAMES: Record<Locale, string> = {
  id: "Bahasa Indonesia",
  en: "English",
  zh: "简体中文",
};

export const LOCALE_COOKIE = "sanci_locale";

export function isLocale(v: string | undefined): v is Locale {
  return !!v && (LOCALES as readonly string[]).includes(v);
}
