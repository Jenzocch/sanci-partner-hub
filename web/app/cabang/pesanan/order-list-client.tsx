"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  orderStatusLabel,
  displayPhoneID,
  formatDateShortWIB,
  type OrderStatus,
} from "@/lib/orders-shared";
import { useCabangMessages } from "@/lib/i18n/provider";
import type { CabangMessages } from "@/lib/i18n";
import { useBrowsePersist } from "@/lib/use-browse-persist";
import StatusBadge from "./status-badge";

/** Filter status (SPEC §97) — "Semua" tetap menampilkan Dibatalkan, tidak boleh hilang dari pencarian. */
type StatusFilter = "ALL" | OrderStatus;
function statusFilters(m: CabangMessages): { value: StatusFilter; label: string }[] {
  return [
    { value: "ALL", label: m.common.filterAll },
    { value: "REGISTERED", label: orderStatusLabel(m, "REGISTERED") },
    { value: "CANCELLED", label: orderStatusLabel(m, "CANCELLED") },
  ];
}

/** Kunci sessionStorage keadaan jelajah (format sama dengan /cabang/produk). */
const BROWSE_STATE_KEY = "cabang.pesanan.browse";

/** Nilai dari sessionStorage tidak dipercaya: hanya filter yang memang ada. */
function isStatusFilter(v: string | undefined): v is StatusFilter {
  return v === "ALL" || v === "REGISTERED" || v === "CANCELLED";
}

export type OrderListItem = {
  id: string;
  orderNumber: string;
  packageName: string;
  status: OrderStatus;
  createdAt: string;
  customerName: string;
  customerPhone: string;
  salesName: string | null;
  branchId: string;
  branchName: string;
};

function formatDate(iso: string, dateLocale: string): string {
  try {
    // WIB, bukan zona perangkat: daftar ini dirender ulang di server juga
    // (hasil awal) — satu zona tetap membuat tanggalnya SELALU sama dengan
    // yang tampil di halaman detail (lihat formatDateShortWIB).
    return formatDateShortWIB(iso, dateLocale);
  } catch {
    return iso;
  }
}

export default function OrderListClient({
  items,
  errorKind,
  ownBranchId,
  crossBranchVisible,
}: {
  items: OrderListItem[];
  errorKind: "missing_table" | "other" | null;
  ownBranchId: string;
  crossBranchVisible: boolean;
}) {
  const m = useCabangMessages();
  const STATUS_FILTERS = statusFilters(m);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  const filtered = useMemo(() => {
    const byStatus = statusFilter === "ALL" ? items : items.filter((it) => it.status === statusFilter);
    const needle = q.trim().toLowerCase();
    const needleDigits = needle.replace(/[^0-9]/g, "");
    if (!needle) return byStatus;
    return byStatus.filter((it) => {
      if (it.orderNumber.toLowerCase().includes(needle)) return true;
      if (it.customerName.toLowerCase().includes(needle)) return true;
      if (needleDigits && it.customerPhone.includes(needleDigits)) return true;
      return false;
    });
  }, [items, q, statusFilter]);

  // Kata kunci, filter status, dan posisi gulir bertahan saat pengguna masuk
  // ke satu pesanan lalu kembali: tombol kembali di halaman detail adalah
  // `<Link>` push, jadi komponen ini di-mount ULANG dan state di atas lahir
  // kosong. Ini penambal kecil (lib/use-browse-persist.ts), BUKAN opsi
  // `persist` milik use-catalog-search — daftar ini menyaring array hasil
  // render server di memori, tanpa fetch/halaman, jadi hook katalog tidak
  // cocok tanpa refaktor besar; alasan lengkapnya di berkas penambalnya.
  // Dimatikan (key null) saat yang tampil kartu error: tidak ada daftar untuk
  // dijelajahi, dan menulis keadaan kosong akan menghapus yang tersimpan.
  useBrowsePersist({
    key: errorKind === null ? BROWSE_STATE_KEY : null,
    fields: { q, statusFilter },
    onRestore: (saved) => {
      if (saved.q !== undefined) setQ(saved.q);
      if (isStatusFilter(saved.statusFilter)) setStatusFilter(saved.statusFilter);
    },
  });

  // Error state — jangan disamarkan sebagai daftar kosong (LESSONS #10).
  if (errorKind === "missing_table") {
    return (
      <div className="card">
        <div className="banner bad">{m.cabang.errOrderModuleInactive}</div>
      </div>
    );
  }
  if (errorKind === "other") {
    return (
      <div className="card">
        <div className="err">{m.cabang.errOrderListLoadFailed}</div>
        <Link href="/cabang/pesanan" className="btn sm">
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
          placeholder={m.cabang.orderSearchPlaceholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="segmented">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            className={`seg${statusFilter === f.value ? " on" : ""}`}
            onClick={() => setStatusFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="card emptybox">{m.cabang.noOrdersYet}</div>
      ) : filtered.length === 0 && q ? (
        <div className="card emptybox">{m.cabang.noOrdersMatchSearch.replace("{q}", q)}</div>
      ) : filtered.length === 0 ? (
        <div className="card emptybox">{m.cabang.noOrdersWithStatus}</div>
      ) : (
        <div className="cardlist">
          {/* prefetch=false pada baris: daftar bisa 100 tautan, tujuannya
              force-dynamic — prefetch hanya membuang request (audit 2026-08-22 #9) */}
          {filtered.map((it) => (
            <Link key={it.id} href={`/cabang/pesanan/${it.id}`} className="reccard" prefetch={false}>
              <div className="rc-top">
                <span className="code">{it.orderNumber}</span>
                <StatusBadge status={it.status} messages={m} />
              </div>
              <div className="rc-title">{it.customerName}</div>
              <div className="rc-sub">
                {it.customerPhone ? displayPhoneID(it.customerPhone) : m.cabang.noPhoneNumber} · {it.packageName}
              </div>
              <div className="rc-meta">
                {m.cabang.orderListSalesLabel.replace("{name}", it.salesName || "—")} · {formatDate(it.createdAt, m.common.dateLocale)}
                {crossBranchVisible && it.branchId !== ownBranchId && m.cabang.orderListOtherBranchViewOnly}
              </div>
              <span className="rc-arrow" aria-hidden="true">&rsaquo;</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
