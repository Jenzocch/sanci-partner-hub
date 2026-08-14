"use client";

import { useState } from "react";

/**
 * Menampilkan logo partner (SPEC §41, §49 — logo selalu dinamis dari
 * partner.logo_url, tidak pernah ditulis mati di kode).
 *
 * Kalau logo tidak ada ATAU alamatnya sudah tidak bisa dibuka, komponen ini
 * tidak menampilkan apa pun. Ikon "gambar rusak" bawaan browser hanya membuat
 * pengguna non-teknis bingung dan mengira datanya hilang.
 */
export default function PartnerLogo({
  url,
  name,
  size = 56,
}: {
  url: string | null | undefined;
  name: string;
  size?: number;
}) {
  const [gagal, setGagal] = useState(false);
  if (!url || gagal) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={`Logo ${name}`}
      width={size}
      height={size}
      onError={() => setGagal(true)}
      style={{
        width: size,
        height: size,
        maxWidth: "100%",
        objectFit: "contain",
        borderRadius: Math.round(size / 5),
        border: "1px solid var(--line)",
        background: "#fff",
        flex: "none",
      }}
    />
  );
}
