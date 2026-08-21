"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLocale } from "./actions";
import { LOCALES, LOCALE_NAMES } from "./types";
import { useCommonI18n } from "./provider";

/**
 * Pemilih bahasa. Nama tiap bahasa ditulis DALAM bahasanya sendiri
 * ("English", "简体中文") — orang yang tidak bisa membaca bahasa yang sedang
 * aktif tetap bisa menemukan bahasanya sendiri.
 *
 * Dipasang di cabang, admin, DAN halaman masuk — makanya pakai
 * `useCommonI18n()` (cuma butuh `common`), bukan hook area tertentu.
 */
export default function LocaleSwitcher() {
  const { locale, messages } = useCommonI18n();
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <label className="langswitch">
      <span className="sr-only">{messages.language}</span>
      <select
        aria-label={messages.language}
        value={locale}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          start(async () => {
            await setLocale(next);
            // Halaman dirender di server, jadi harus diminta ulang supaya
            // teksnya ikut berganti.
            router.refresh();
          });
        }}
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
