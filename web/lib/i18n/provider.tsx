"use client";

/**
 * Client component tidak bisa membaca cookie di server, jadi layout
 * meneruskan bundle bahasa lewat provider ini sekali saja.
 */

import { createContext, useContext } from "react";
import type { Messages } from "./messages/id";
import type { Locale } from "./types";

type Ctx = { messages: Messages; locale: Locale };
const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({
  messages,
  locale,
  children,
}: {
  messages: Messages;
  locale: Locale;
  children: React.ReactNode;
}) {
  return <I18nContext.Provider value={{ messages, locale }}>{children}</I18nContext.Provider>;
}

export function useI18n(): Ctx {
  const v = useContext(I18nContext);
  // Melempar error, BUKAN diam-diam pakai bahasa bawaan: komponen yang lupa
  // dibungkus provider harus ketahuan saat dikembangkan, bukan muncul
  // setengah-Indonesia di layar pengguna.
  if (!v) throw new Error("useI18n dipakai di luar <I18nProvider>");
  return v;
}

export function useMessages(): Messages {
  return useI18n().messages;
}
