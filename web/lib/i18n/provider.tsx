"use client";

/**
 * Client component tidak bisa membaca cookie di server, jadi layout
 * meneruskan bundle bahasa lewat provider ini sekali saja.
 *
 * TIGA provider terpisah (Cabang / Admin / Common), bukan satu yang membawa
 * ketiga area sekaligus — supaya kompiler, bukan cuma grep, yang mencegah
 * halaman cabang membaca `m.admin.*` dan sebaliknya (audit 2026-08-21, lihat
 * FEATURES.md dan `./messages/index.ts`). `createScope()` di bawah cuma
 * boilerplate context yang dipakai ulang tiga kali — bukan generalisasi baru.
 */

import { createContext, useContext, type ReactNode } from "react";
import type { CommonMessages, CabangMessages, AdminMessages } from "./messages";
import type { Locale } from "./types";

type Scoped<M> = { messages: M; locale: Locale };

function createScope<M>(hookName: string) {
  const Context = createContext<Scoped<M> | null>(null);

  function useRequired(): Scoped<M> {
    const v = useContext(Context);
    // Melempar error, BUKAN diam-diam pakai bahasa bawaan: komponen yang lupa
    // dibungkus provider harus ketahuan saat dikembangkan, bukan muncul
    // setengah-Indonesia di layar pengguna.
    if (!v) throw new Error(`${hookName} dipakai di luar provider-nya`);
    return v;
  }

  /** Tidak melempar — dipakai `useCommonI18n()` untuk mencoba scope lain dulu. */
  function useOptional(): Scoped<M> | null {
    return useContext(Context);
  }

  return { Context, useRequired, useOptional };
}

const cabangScope = createScope<CabangMessages>("useCabangMessages()");
const adminScope = createScope<AdminMessages>("useAdminMessages()");
const commonScope = createScope<CommonMessages>("useCommonMessages()");

/* ------------------------------------------------------------------ *
 * /cabang/** — dipasang sekali di app/cabang/layout.tsx
 * ------------------------------------------------------------------ */

export function CabangI18nProvider({
  messages,
  locale,
  children,
}: {
  messages: CabangMessages;
  locale: Locale;
  children: ReactNode;
}) {
  return (
    <cabangScope.Context.Provider value={{ messages, locale }}>{children}</cabangScope.Context.Provider>
  );
}

export function useCabangI18n(): Scoped<CabangMessages> {
  return cabangScope.useRequired();
}

export function useCabangMessages(): CabangMessages {
  return cabangScope.useRequired().messages;
}

/* ------------------------------------------------------------------ *
 * /admin/** — dipasang sekali di app/admin/layout.tsx
 * ------------------------------------------------------------------ */

export function AdminI18nProvider({
  messages,
  locale,
  children,
}: {
  messages: AdminMessages;
  locale: Locale;
  children: ReactNode;
}) {
  return (
    <adminScope.Context.Provider value={{ messages, locale }}>{children}</adminScope.Context.Provider>
  );
}

export function useAdminI18n(): Scoped<AdminMessages> {
  return adminScope.useRequired();
}

export function useAdminMessages(): AdminMessages {
  return adminScope.useRequired().messages;
}

/* ------------------------------------------------------------------ *
 * Halaman masuk (app/page.tsx) — SATU-SATUNYA tempat yang butuh common
 * saja tanpa area cabang/admin di atasnya.
 * ------------------------------------------------------------------ */

export function CommonI18nProvider({
  messages,
  locale,
  children,
}: {
  messages: CommonMessages;
  locale: Locale;
  children: ReactNode;
}) {
  return (
    <commonScope.Context.Provider value={{ messages, locale }}>{children}</commonScope.Context.Provider>
  );
}

/**
 * Dipakai komponen LINTAS AREA yang dipasang di cabang & admin sekaligus
 * (DraftBanner, LocaleSwitcher) dan cuma perlu teks umum — jadi tidak boleh
 * terikat ke satu provider tertentu. Mencoba ketiga scope satu-satu; tepat
 * satu di antaranya akan selalu terpasang, karena setiap halaman di app ini
 * cuma memasang satu dari ketiganya (lihat tiga titik pasang di atas).
 */
export function useCommonI18n(): Scoped<CommonMessages> {
  const cabang = cabangScope.useOptional();
  if (cabang) return { messages: cabang.messages.common, locale: cabang.locale };
  const admin = adminScope.useOptional();
  if (admin) return { messages: admin.messages.common, locale: admin.locale };
  const common = commonScope.useOptional();
  if (common) return common;
  throw new Error("useCommonMessages() dipakai di luar CabangI18nProvider/AdminI18nProvider/CommonI18nProvider");
}

export function useCommonMessages(): CommonMessages {
  return useCommonI18n().messages;
}
