/**
 * Pembacaan bahasa di sisi SERVER. Untuk client component pakai
 * `useMessages()` dari `./provider` — bukan file ini.
 */

import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "./types";
import { id, type Messages } from "./messages/id";
import { en } from "./messages/en";
import { zh } from "./messages/zh";

const BUNDLES: Record<Locale, Messages> = { id, en, zh };

export async function getLocale(): Promise<Locale> {
  // Cookie belum ada (pengguna baru) → Bahasa Indonesia, karena mayoritas
  // pemakai harian adalah staf toko di Indonesia.
  const store = await cookies();
  const v = store.get(LOCALE_COOKIE)?.value;
  return isLocale(v) ? v : DEFAULT_LOCALE;
}

export async function getMessages(): Promise<Messages> {
  return BUNDLES[await getLocale()];
}

export type { Messages };
export { LOCALES, LOCALE_NAMES, DEFAULT_LOCALE, type Locale } from "./types";
