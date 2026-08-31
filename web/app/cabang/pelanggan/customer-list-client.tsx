"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { displayPhoneID, normalizePhoneID } from "@/lib/orders-shared";
import { useCabangMessages } from "@/lib/i18n/provider";
import { useBrowsePersist } from "@/lib/use-browse-persist";

/** Kunci sessionStorage keadaan jelajah (format sama dengan /cabang/produk). */
const BROWSE_STATE_KEY = "cabang.pelanggan.browse";

export type CustomerListItem = {
  id: string;
  fullName: string;
  phoneNormalized: string;
  /** customer_code (migrasi 0017/0018/0019) — null kalau belum digenerate. */
  customerCode: string | null;
  /** `null` = jumlahnya TIDAK DIKETAHUI (query hitungan gagal), bukan nol —
   *  "0 pesanan" yang sebenarnya kegagalan menyuruh manajer menyimpulkan
   *  pelanggan ini belum pernah membeli (LESSONS #10). */
  orderCount: number | null;
};

export default function CustomerListClient({
  items,
  errorKind,
}: {
  items: CustomerListItem[];
  errorKind: "missing_table" | "other" | null;
}) {
  const m = useCabangMessages();
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

  // Kata kunci dan posisi gulir bertahan saat pengguna membuka satu pelanggan
  // lalu kembali: tombol kembali di halaman detail adalah `<Link>` push, jadi
  // komponen ini di-mount ULANG dan `q` di atas lahir kosong. Penambal kecil
  // (lib/use-browse-persist.ts), BUKAN opsi `persist` milik use-catalog-search
  // — daftar ini menyaring array hasil render server di memori, tanpa
  // fetch/halaman; alasan lengkapnya di berkas penambalnya. Dimatikan (key
  // null) saat yang tampil kartu error, sama seperti daftar pesanan.
  useBrowsePersist({
    key: errorKind === null ? BROWSE_STATE_KEY : null,
    fields: { q },
    onRestore: (saved) => {
      if (saved.q !== undefined) setQ(saved.q);
    },
  });

  // Error state — jangan disamarkan sebagai daftar kosong (LESSONS #10).
  if (errorKind === "missing_table") {
    return (
      <div className="card">
        <div className="banner bad">{m.cabang.errCustomerModuleInactive}</div>
      </div>
    );
  }
  if (errorKind === "other") {
    return (
      <div className="card">
        <div className="err">{m.cabang.errCustomerListLoadFailed}</div>
        <Link href="/cabang/pelanggan" className="btn sm">
          {m.common.retry}
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
          placeholder={m.cabang.customerSearchPlaceholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {items.length === 0 ? (
        <div className="card emptybox">{m.cabang.noCustomersYet}</div>
      ) : filtered.length === 0 ? (
        <div className="card emptybox">{m.cabang.noCustomersMatchSearch.replace("{q}", q)}</div>
      ) : (
        <div className="cardlist">
          {/* prefetch=false — alasan sama dengan order-list-client.tsx (audit 2026-08-22 #9) */}
          {filtered.map((it) => (
            <Link key={it.id} href={`/cabang/pelanggan/${it.id}`} className="reccard" prefetch={false}>
              <div className="rc-top">
                <div className="rc-title">{it.fullName}</div>
                {it.customerCode && <span className="code">{it.customerCode}</span>}
              </div>
              <div className="rc-sub">{it.phoneNormalized ? displayPhoneID(it.phoneNormalized) : m.cabang.noPhoneNumber}</div>
              <div className="rc-meta">
                {it.orderCount === null
                  ? m.cabang.customerOrderCountUnknown
                  : m.cabang.customerOrderCount.replace("{n}", String(it.orderCount))}
              </div>
              <span className="rc-arrow" aria-hidden="true">&rsaquo;</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
