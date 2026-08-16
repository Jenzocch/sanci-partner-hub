"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { displayPhoneID, type OrderStatus } from "@/lib/orders-shared";
import StatusBadge from "./status-badge";

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

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
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
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const needleDigits = needle.replace(/[^0-9]/g, "");
    if (!needle) return items;
    return items.filter((it) => {
      if (it.orderNumber.toLowerCase().includes(needle)) return true;
      if (it.customerName.toLowerCase().includes(needle)) return true;
      if (needleDigits && it.customerPhone.includes(needleDigits)) return true;
      return false;
    });
  }, [items, q]);

  // Error state — jangan disamarkan sebagai daftar kosong (LESSONS #10).
  if (errorKind === "missing_table") {
    return (
      <div className="card">
        <div className="banner bad">
          Modul Pesanan belum aktif di database (migrasi belum dijalankan). Hubungi SANCI Admin.
        </div>
      </div>
    );
  }
  if (errorKind === "other") {
    return (
      <div className="card">
        <div className="err">Gagal memuat daftar pesanan.</div>
        <Link href="/cabang/pesanan" className="btn sm">
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
          placeholder="Cari nama, telepon, atau nomor order..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {items.length === 0 ? (
        <div className="card emptybox">Belum ada pesanan tercatat di cabang ini.</div>
      ) : filtered.length === 0 ? (
        <div className="card emptybox">Tidak ada pesanan yang cocok dengan pencarian &quot;{q}&quot;.</div>
      ) : (
        filtered.map((it) => (
          <Link key={it.id} href={`/cabang/pesanan/${it.id}`} className="staffcard" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
            <div className="row1">
              <span className="code">{it.orderNumber}</span>
              <StatusBadge status={it.status} />
            </div>
            <div className="nm" style={{ marginTop: 6 }}>
              {it.customerName}
            </div>
            <div className="rl">
              {it.customerPhone ? displayPhoneID(it.customerPhone) : "tanpa telepon"} · {it.packageName}
            </div>
            <div className="rl">
              Sales {it.salesName || "—"} · {formatDate(it.createdAt)}
              {crossBranchVisible && it.branchId !== ownBranchId && (
                <span className="small muted"> · Cabang lain — hanya lihat</span>
              )}
            </div>
          </Link>
        ))
      )}
    </>
  );
}
