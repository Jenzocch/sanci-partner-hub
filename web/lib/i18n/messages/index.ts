/**
 * Menyusun tiap area (common / cabang / admin) menjadi tipe & pengambil per
 * bahasa. Menambah area baru: buat file-nya dengan pola yang sama (`id`
 * sebagai sumber kebenaran + `satisfies Shape`), lalu daftarkan di sini.
 *
 * KENAPA TIDAK ADA LAGI satu `Bundle`/`Messages` gabungan ketiga area: dulu
 * setiap `/cabang/**` page membawa SELURUH kunci admin (dan sebaliknya) lewat
 * `<I18nProvider messages={...}>` — bukan cuma tidak kepakai, itu data yang
 * betulan ikut terkirim di RSC payload ke browser staf toko (audit 2026-08-21,
 * lihat FEATURES.md). `CabangMessages`/`AdminMessages` di bawah masing-masing
 * cuma membawa `common` + area miliknya sendiri, dan `pickXxxMessages()`
 * MEMBANGUN objek yang sudah dipersempit itu langsung — tidak pernah merakit
 * bundel tiga-area dulu baru dipotong belakangan di titik panggilnya.
 *
 * Kunci masing-masing slice dikunci ke versi Bahasa Indonesia lewat
 * `satisfies Shape` di common.ts/cabang.ts/admin.ts sendiri — nilainya bebas
 * string (terjemahan memang harus beda isi), tapi kunci yang hilang tetap
 * jadi error saat build.
 */

import { common } from "./common";
import { cabang } from "./cabang";
import { admin } from "./admin";
import type { Locale } from "../types";

export type CommonMessages = Record<keyof typeof common.id, string>;
type CabangSlice = Record<keyof typeof cabang.id, string>;
type AdminSlice = Record<keyof typeof admin.id, string>;

/** Dipakai `/cabang/**` — TIDAK PERNAH membawa kunci `admin.*`. */
export type CabangMessages = { common: CommonMessages; cabang: CabangSlice };

/** Dipakai `/admin/**` — TIDAK PERNAH membawa kunci `cabang.*`. */
export type AdminMessages = { common: CommonMessages; admin: AdminSlice };

export function pickCommonMessages(locale: Locale): CommonMessages {
  return common[locale];
}

export function pickCabangMessages(locale: Locale): CabangMessages {
  return { common: common[locale], cabang: cabang[locale] };
}

export function pickAdminMessages(locale: Locale): AdminMessages {
  return { common: common[locale], admin: admin[locale] };
}
