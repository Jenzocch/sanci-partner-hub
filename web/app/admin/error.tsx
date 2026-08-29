"use client";

import { useEffect } from "react";
import { useAdminI18n } from "@/lib/i18n/provider";
import { offline } from "@/lib/i18n/messages/offline";
import { errorBoundary } from "@/lib/i18n/messages/error-boundary";

/**
 * Batas error KHUSUS /admin/**, ada karena satu alasan konkret:
 * `app/admin/layout.tsx` menggambar shell yang bertahan (rail `AdminNav` +
 * `<main className="main">`). Batas error milik segmen ini dirender DI DALAM
 * layout itu, jadi navigasi tetap ada — halaman yang rusak tinggal satu klik
 * dari halaman admin lain. Batas root (`app/error.tsx`) akan membuang shell
 * itu dan menyisakan layar kosong.
 *
 * Karena masih di dalam `AdminI18nProvider`, bahasanya diambil dari context
 * (benar sejak render pertama, tanpa kedip) — beda dengan `app/error.tsx`
 * yang harus membaca cookie sendiri karena provider-nya ikut terbuang. Kalau
 * yang gagal justru layout admin itu sendiri, berkas ini memang tidak
 * menyala; batas root yang mengambil alih. Itu benar: saat itu shell-nya
 * juga tidak ada.
 *
 * TIDAK ada tautan "kembali ke halaman awal" di sini — rail navigasi di
 * sebelahnya sudah menyediakannya, dan itu justru inti dari batas ini.
 *
 * `/cabang/**` SENGAJA tidak punya berkas serupa: layoutnya cuma memasang
 * provider bahasa dan tidak menggambar apa pun yang bisa diselamatkan
 * (setiap halaman cabang menggambar kepalanya sendiri), jadi batas root
 * sudah memberi hasil yang sama persis.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { locale } = useAdminI18n();

  // Pola baku Next.js: catat ke console browser saja. Proyek ini TIDAK punya
  // layanan pelaporan error eksternal dan tidak boleh menambahkannya di sini.
  useEffect(() => {
    console.error(error);
  }, [error]);

  const m = errorBoundary[locale];

  return (
    <div>
      <div className="worktop">
        <h1>{m.errorTitle}</h1>
      </div>
      <div className="card" style={{ margin: 0 }}>
        <div className="err">{m.errorBody}</div>
        <div className="banner warn">{m.errorCheckSaved}</div>
        <button type="button" className="btn primary" onClick={() => reset()}>
          {offline[locale].retry}
        </button>
      </div>
    </div>
  );
}
