"use client";

import { useEffect } from "react";

/**
 * Jaring pengaman TERAKHIR: hanya menyala kalau layout root sendiri
 * (`app/layout.tsx`) yang gagal — di titik itu Next.js membuang seluruh
 * layout root, jadi berkas ini WAJIB menggambar `<html>`/`<body>`-nya
 * sendiri.
 *
 * SENGAJA nol ketergantungan — tidak ada `globals.css`, tidak ada berkas
 * bahasa, tidak ada komponen lain: setiap import di sini adalah satu lagi
 * hal yang bisa ikut rusak dan membuat layar terakhir ini ikut kosong. Ini
 * pelajaran yang sama dengan LESSONS #23 (mekanisme cadangan tidak boleh
 * diam-diam bergantung pada hal yang sedang ia gantikan).
 *
 * Karena itu teksnya DIPAKU ke Bahasa Indonesia: bahasa dibaca dari cookie
 * lewat layout root — persis komponen yang barusan gagal — dan Bahasa
 * Indonesia adalah bahasa bawaan sekaligus bahasa mayoritas pemakai harian.
 * Satu kalimat pendek dalam bahasa yang pasti terbaca staf toko jauh lebih
 * baik daripada layar crash bawaan Next.js yang berbahasa Inggris teknis.
 *
 * Tombolnya MEMUAT ULANG halaman, bukan `reset()`: kalau yang rusak adalah
 * layout root, merender ulang pohon yang sama hanya mengulang kegagalan yang
 * sama. Muat ulang penuh memberi kesempatan berkas yang baru.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Pola baku Next.js: catat ke console browser saja. Proyek ini TIDAK punya
  // layanan pelaporan error eksternal dan tidak boleh menambahkannya di sini.
  // `reset` sengaja tidak dipakai (lihat catatan tombol di atas), tapi tetap
  // diterima karena Next.js selalu mengirimkannya.
  void reset;
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="id">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "32px 16px",
          background: "#f6f7f9",
          color: "#16181d",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
          lineHeight: 1.55,
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 420, width: "100%" }}>
          <h1 style={{ fontSize: 22, margin: "0 0 8px", fontWeight: 700 }}>
            Terjadi kesalahan
          </h1>
          <p style={{ fontSize: 16, margin: "0 0 24px", color: "#5b6070" }}>
            Muat ulang halaman untuk mencoba lagi.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              width: "100%",
              minHeight: 48,
              padding: "13px 22px",
              fontSize: 16,
              fontWeight: 600,
              color: "#ffffff",
              background: "#16181d",
              border: "1px solid #16181d",
              borderRadius: 12,
              cursor: "pointer",
            }}
          >
            Muat Ulang
          </button>
        </div>
      </body>
    </html>
  );
}
