"use client";

import { useState, type CSSProperties, type ReactNode } from "react";

/**
 * SATU `<img>` produk dengan penanganan `onError` → placeholder.
 *
 * Aturan rumah ada di lib/catalog-shared.ts (catatan "CATATAN FOTO PRODUK"):
 * karena proyek ini memakai `<img>` biasa dan bukan `next/image`, SETIAP
 * pemakai wajib mengurus sendiri `loading="lazy"`, ruang yang dipesan lebih
 * dulu, dan `onError` → placeholder. Sisi admin sudah patuh
 * (app/admin/produk/product-photo.tsx), sisi cabang TIDAK di empat tempat
 * (grid daftar, foto besar detail, thumbnail galeri, lightbox) — audit
 * 2026-08-28. Alih-alih menyalin pola `useState(gagal)` empat kali,
 * polanya tinggal di sini.
 *
 * Kenapa `failedSrc` (string) dan bukan `gagal` (boolean): foto besar di
 * halaman detail MENGGANTI `src`-nya saat pengguna memilih thumbnail lain.
 * Dengan boolean, satu foto rusak akan membuat semua foto berikutnya ikut
 * tampil sebagai placeholder sampai komponen di-remount. Menyimpan URL yang
 * gagal membuat keadaan gagal itu melekat pada FOTO-nya, bukan pada slot.
 *
 * `onFail` untuk pemanggil yang harus mengubah bentuk pembungkusnya saat
 * foto rusak — mis. foto besar detail yang pembungkusnya `<button>` pembuka
 * lightbox: kotak tinggi yang bisa ditekan tapi isinya rusak lebih buruk
 * daripada tidak bisa ditekan sama sekali.
 */
export default function ProductImg({
  src,
  alt,
  placeholder,
  className,
  style,
  loading = "lazy",
  onFail,
}: {
  src: string | null | undefined;
  alt: string;
  /** Ditampilkan kalau `src` kosong ATAU alamatnya tidak bisa dibuka. */
  placeholder: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** `"eager"` hanya untuk foto yang PASTI di layar pertama (lightbox). */
  loading?: "lazy" | "eager";
  onFail?: (src: string) => void;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!src || failedSrc === src) return <>{placeholder}</>;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- photo_url adalah URL publik dari SANCI (bukan aset lokal), lihat catatan di lib/catalog-shared.ts
    <img
      src={src}
      alt={alt}
      className={className}
      style={style}
      loading={loading}
      decoding="async"
      onError={() => {
        setFailedSrc(src);
        onFail?.(src);
      }}
    />
  );
}
