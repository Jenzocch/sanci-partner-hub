"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { displayPhoneID, normalizePhoneID } from "@/lib/orders-shared";

export type CustomerListItem = {
  id: string;
  fullName: string;
  phoneNormalized: string;
  orderCount: number;
};

export default function CustomerListClient({
  items,
  errorKind,
}: {
  items: CustomerListItem[];
  errorKind: "missing_table" | "other" | null;
}) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    // Telepon dibandingkan lewat bentuk kanonik phone_normalized — supaya
    // "0812", "812", "+62812" semua cocok dengan nomor yang sama (SPEC §8).
    const normalizedNeedle = normalizePhoneID(needle);
    return items.filter((it) => {
      if (it.fullName.toLowerCase().includes(needle)) return true;
      if (normalizedNeedle && it.phoneNormalized.includes(normalizedNeedle)) return true;
      return false;
    });
  }, [items, q]);

  // Error state — jangan disamarkan sebagai daftar kosong (LESSONS #10).
  if (errorKind === "missing_table") {
    return (
      <div className="card">
        <div className="banner bad">
          Modul Pelanggan belum aktif di database (migrasi belum dijalankan). Hubungi SANCI Admin.
        </div>
      </div>
    );
  }
  if (errorKind === "other") {
    return (
      <div className="card">
        <div className="err">Gagal memuat daftar pelanggan.</div>
        <Link href="/cabang/pelanggan" className="btn sm">
          Coba Lagi
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="searchrow">
        <input
          className="search-input"
          type="search"
          placeholder="Cari nama atau telepon..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {items.length === 0 ? (
        <div className="card emptybox">Belum ada pelanggan tercatat.</div>
      ) : filtered.length === 0 ? (
        <div className="card emptybox">Tidak ada pelanggan yang cocok dengan pencarian &quot;{q}&quot;.</div>
      ) : (
        filtered.map((it) => (
          <Link
            key={it.id}
            href={`/cabang/pelanggan/${it.id}`}
            className="staffcard"
            style={{ display: "block", textDecoration: "none", color: "inherit" }}
          >
            <div className="row1">
              <span className="nm">{it.fullName}</span>
            </div>
            <div className="rl">{it.phoneNormalized ? displayPhoneID(it.phoneNormalized) : "tanpa telepon"}</div>
            <div className="rl">{it.orderCount} Pesanan</div>
          </Link>
        ))
      )}
    </>
  );
}
