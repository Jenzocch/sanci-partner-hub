/**
 * Menyusun tiap area (common / cabang / admin) menjadi satu bundle per
 * bahasa. Menambah area baru: buat file-nya dengan pola yang sama
 * (`id` sebagai sumber kebenaran + `satisfies Shape`), lalu daftarkan di sini.
 *
 * `Bundle` mengunci DAFTAR KUNCI ke versi Bahasa Indonesia, tapi nilainya
 * bebas string — jadi terjemahan boleh berbeda isi (memang harus), sementara
 * kunci yang hilang tetap jadi error saat build.
 */

import { common } from "./common";
import { cabang } from "./cabang";
import { admin } from "./admin";
import type { Locale } from "../types";

export type Bundle = {
  common: Record<keyof typeof common.id, string>;
  cabang: Record<keyof typeof cabang.id, string>;
  admin: Record<keyof typeof admin.id, string>;
};

export const MESSAGES: Record<Locale, Bundle> = {
  id: { common: common.id, cabang: cabang.id, admin: admin.id },
  en: { common: common.en, cabang: cabang.en, admin: admin.en },
  zh: { common: common.zh, cabang: cabang.zh, admin: admin.zh },
};

export type Messages = Bundle;
