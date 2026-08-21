/**
 * Pembacaan bahasa di sisi SERVER. Untuk client component pakai
 * `useCabangMessages()`/`useAdminMessages()`/`useCommonMessages()` dari
 * `./provider` — bukan file ini.
 *
 * Tiga fungsi terpisah (bukan satu `getMessages()` yang dipotong belakangan)
 * supaya setiap call site cuma MEMBANGUN slice yang benar-benar dia perlukan
 * — lihat catatan di `./messages/index.ts` soal kenapa ini penting untuk
 * ukuran payload, bukan cuma soal tipe.
 */

import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "./types";
import {
  pickCommonMessages,
  pickCabangMessages,
  pickAdminMessages,
  type CommonMessages,
  type CabangMessages,
  type AdminMessages,
} from "./messages";

export async function getLocale(): Promise<Locale> {
  // Cookie belum ada (pengguna baru) → Bahasa Indonesia, karena mayoritas
  // pemakai harian adalah staf toko di Indonesia.
  const store = await cookies();
  const v = store.get(LOCALE_COOKIE)?.value;
  return isLocale(v) ? v : DEFAULT_LOCALE;
}

/** Dipakai HANYA oleh halaman masuk (`app/page.tsx`) — cuma butuh `common`. */
export async function getCommonMessages(): Promise<CommonMessages> {
  return pickCommonMessages(await getLocale());
}

/** Dipakai `/cabang/**` (`app/cabang/layout.tsx`). */
export async function getCabangMessages(): Promise<CabangMessages> {
  return pickCabangMessages(await getLocale());
}

/** Dipakai `/admin/**` (`app/admin/layout.tsx`). */
export async function getAdminMessages(): Promise<AdminMessages> {
  return pickAdminMessages(await getLocale());
}

export type { CommonMessages, CabangMessages, AdminMessages };
export { LOCALES, LOCALE_NAMES, DEFAULT_LOCALE, type Locale } from "./types";
