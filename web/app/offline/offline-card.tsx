"use client";

import { useEffect, useState } from "react";
import { MESSAGES } from "@/lib/i18n/messages";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "@/lib/i18n/types";

/**
 * Satu-satunya layar yang TIDAK boleh bergantung pada server: berkasnya
 * disimpan service worker (public/sw.js) dan ditampilkan justru saat tidak ada
 * koneksi, jadi bahasanya tidak bisa dibaca dari cookie di server.
 *
 * Karena itu bahasanya dibaca dari cookie DI BROWSER. Render pertama memakai
 * bahasa bawaan (sama persis dengan HTML statis yang sudah tersimpan, jadi
 * hidrasi tidak bentrok), lalu langsung diganti ke bahasa pengguna.
 *
 * Tidak ada pemilih bahasa di sini: menggantinya memanggil Server Action, dan
 * di layar ini justru servernya yang tidak terjangkau.
 */
export default function OfflineCard() {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const found = document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${LOCALE_COOKIE}=`))
      ?.slice(LOCALE_COOKIE.length + 1);
    if (!isLocale(found)) return;
    setLocale(found);
    // <html lang> di layout ditulis saat build (selalu bahasa bawaan) — untuk
    // halaman ini pembaca layar hanya benar kalau diperbaiki di browser.
    document.documentElement.lang = found;
  }, []);

  const m = MESSAGES[locale].common;

  return (
    <div className="authcard center">
      <div className="wordmark serif">SANCI</div>
      <h1>{m.offlineTitle}</h1>
      <p className="sub">{m.offlineBody}</p>
      {/* Hard reload on purpose: this must force a real network re-check,
          not a client-side transition that a stale cache could satisfy. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a className="btn primary" href="/">
        {m.retry}
      </a>
    </div>
  );
}
