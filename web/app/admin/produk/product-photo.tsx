"use client";

import { useAdminMessages } from "@/lib/i18n/provider";
import ProductImg from "@/lib/product-img";

/**
 * Thumbnail foto produk untuk grid /admin/produk. Kalau foto tidak ada ATAU
 * alamatnya sudah tidak bisa dibuka, tampilkan kotak placeholder — bukan
 * ikon "gambar rusak" bawaan browser (pola sama dengan lib/partner-logo.tsx,
 * tapi di sini placeholder tetap TERLIHAT karena kartu produk perlu bentuk
 * kotak foto yang konsisten di grid).
 *
 * Sejak 2026-08-28 `<img>` + onError-nya datang dari lib/product-img.tsx
 * (dipakai bersama sisi cabang); berkas ini tinggal kotak berukuran tetap
 * di sekelilingnya.
 */
export default function ProductPhoto({ url, name }: { url: string | null; name: string }) {
  const m = useAdminMessages();

  return (
    <div
      style={{
        width: "100%",
        aspectRatio: "4 / 3",
        flex: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--surface2)",
        borderBottom: "1px solid var(--line)",
      }}
    >
      {/* Katalog ini sudah 169 produk dan terus bertambah. Tanpa
          loading="lazy" browser mengunduh semua foto pada muat pertama —
          beberapa MB sebelum layar pertama selesai; ProductImg memakai lazy
          sebagai bawaan. */}
      <ProductImg
        src={url}
        alt={name}
        placeholder={<span className="small muted">{m.admin.productNoPhoto}</span>}
        style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
      />

    </div>
  );
}
