"use client";

import { useEffect, useState } from "react";
// DUA micro-slice, BUKAN `common`: berkas ini ikut ke bundle client SETIAP
// rute, dan satu export objek tidak bisa di-tree-shake per properti
// (LESSONS #38) — meng-import `common` berarti seluruh app menggendong 231
// kunci × 3 bahasa untuk empat kalimat. "Coba Lagi" diambil dari `offline`
// karena di sanalah sumber kebenarannya (common.ts juga menyebarkannya);
// jangan tulis ulang terjemahannya.
import { offline } from "@/lib/i18n/messages/offline";
import { errorBoundary } from "@/lib/i18n/messages/error-boundary";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "@/lib/i18n/types";

/**
 * Batas error umum untuk SELURUH pohon di bawah layout root (~30 rute
 * dinamis). Tanpa berkas ini, satu exception di halaman mana pun memberi staf
 * toko layar crash bawaan Next.js — berbahasa Inggris teknis, tanpa jalan
 * keluar.
 *
 * KENAPA BAHASANYA DIBACA DARI COOKIE DI BROWSER, bukan lewat
 * `useCommonMessages()` seperti komponen client lain: saat batas ini menyala,
 * Next.js mengganti seluruh segmen di bawah layout root — TERMASUK
 * `app/admin/layout.tsx` / `app/cabang/layout.tsx` yang memasang provider
 * bahasa. Jadi tidak ada provider di atas berkas ini; `useCommonMessages()`
 * justru akan melempar ("dipakai di luar provider-nya") dan error kedua itu
 * naik ke `global-error.tsx` — layar cadangan malah menghapus layar cadangan
 * (LESSONS #23). Polanya disamakan dengan `app/offline/offline-card.tsx`:
 * render pertama memakai bahasa bawaan, lalu langsung diganti ke bahasa
 * pengguna. `<html lang>` tidak perlu diperbaiki di sini — layout root tetap
 * hidup dan sudah menuliskannya dari cookie.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);

  // Pola baku Next.js: catat ke console browser saja. Proyek ini TIDAK punya
  // layanan pelaporan error eksternal dan tidak boleh menambahkannya di sini.
  useEffect(() => {
    console.error(error);
  }, [error]);

  useEffect(() => {
    const found = document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${LOCALE_COOKIE}=`))
      ?.slice(LOCALE_COOKIE.length + 1);
    if (isLocale(found)) setLocale(found);
  }, []);

  const m = errorBoundary[locale];

  return (
    <main className="authwrap">
      <div className="authcard center">
        <h1>{m.errorTitle}</h1>
        <p className="sub">{m.errorBody}</p>
        <div className="banner warn">{m.errorCheckSaved}</div>
        <button type="button" className="btn primary" onClick={() => reset()}>
          {offline[locale].retry}
        </button>
        {/* Navigasi keras, bukan <Link>: router client baru saja melempar,
            jadi transisi client-side belum tentu bisa dipercaya. "/" adalah
            tujuan yang aman dari mana pun — halaman itu sendiri yang
            mengarahkan admin ke /admin dan staf toko ke /cabang. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="btn ghost" href="/" style={{ marginTop: 10 }}>
          {m.errorHome}
        </a>
      </div>
    </main>
  );
}
