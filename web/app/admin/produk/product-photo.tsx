"use client";

import { useState } from "react";
import { useAdminMessages } from "@/lib/i18n/provider";

/**
 * Thumbnail foto produk untuk grid /admin/produk. Kalau foto tidak ada ATAU
 * alamatnya sudah tidak bisa dibuka, tampilkan kotak placeholder — bukan
 * ikon "gambar rusak" bawaan browser (pola sama dengan lib/partner-logo.tsx,
 * tapi di sini placeholder tetap TERLIHAT karena kartu produk perlu bentuk
 * kotak foto yang konsisten di grid).
 */
export default function ProductPhoto({ url, name }: { url: string | null; name: string }) {
  const m = useAdminMessages();
  const [gagal, setGagal] = useState(false);
  const showPlaceholder = !url || gagal;

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
      {showPlaceholder ? (
        <span className="small muted">{m.admin.productNoPhoto}</span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url ?? undefined}
          alt={name}
          // Katalog ini sudah 169 produk dan terus bertambah, dan halaman
          // /admin/produk memuat SEMUANYA sekaligus (tanpa paging). Tanpa
          // loading="lazy" browser mengunduh ke-169 foto pada muat pertama —
          // beberapa MB sebelum layar pertama selesai. Sisi cabang
          // (produk-list-client.tsx) sudah lazy sejak awal; ini menyamakan.
          loading="lazy"
          decoding="async"
          onError={() => setGagal(true)}
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
        />
      )}
    </div>
  );
}
