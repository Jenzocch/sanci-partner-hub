"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  orderStatusLabel,
  displayPhoneID,
  formatDateShortWIB,
  type OrderStatus,
} from "@/lib/orders-shared";
import {
  CUSTOMER_PAYMENT_STATUS_CHIP,
  customerPaymentStatusLabel,
  type CustomerPaymentStatus,
  type ShippingState,
} from "@/lib/payment-shared";
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

/**
 * Filter kirim & bayar (2026-09-01) — nilainya PERSIS ShippingState dan
 * CustomerPaymentStatus (lib/payment-shared.ts), tidak pernah himpunan
 * sendiri: kalau daftar ini punya definisi "Lunas"/"Sudah DO" yang berbeda
 * dari /admin/orders atau dari kartu di halaman detail, dua layar akan
 * menjawab beda untuk pesanan yang sama. Labelnya pun kunci common.ts yang
 * SAMA dengan yang dipakai sisi admin.
 */
type ShippingFilter = "ALL" | ShippingState;
type PaymentFilter = "ALL" | CustomerPaymentStatus;

function shippingFilters(m: CabangMessages): { value: ShippingFilter; label: string }[] {
  return [
    { value: "ALL", label: m.common.filterShippingAll },
    { value: "BELUM_DO", label: m.common.filterShippingBelumDo },
    { value: "SUDAH_DO", label: m.common.filterShippingSudahDo },
    { value: "DITERIMA", label: m.common.filterShippingDiterima },
  ];
}

function paymentFilters(m: CabangMessages): { value: PaymentFilter; label: string }[] {
  return [
    { value: "ALL", label: m.common.filterPaymentAll },
    { value: "LUNAS", label: customerPaymentStatusLabel(m, "LUNAS") },
    { value: "DP", label: customerPaymentStatusLabel(m, "DP") },
    { value: "BELUM", label: customerPaymentStatusLabel(m, "BELUM") },
    { value: "UNKNOWN", label: customerPaymentStatusLabel(m, "UNKNOWN") },
  ];
}

/** Kunci sessionStorage keadaan jelajah (format sama dengan /cabang/produk). */
const BROWSE_STATE_KEY = "cabang.pesanan.browse";

/** Nilai dari sessionStorage tidak dipercaya: hanya filter yang memang ada. */
function isStatusFilter(v: string | undefined): v is StatusFilter {
  return v === "ALL" || v === "REGISTERED" || v === "CANCELLED";
}
function isShippingFilter(v: string | undefined): v is ShippingFilter {
  return v === "ALL" || v === "BELUM_DO" || v === "SUDAH_DO" || v === "DITERIMA";
}
function isPaymentFilter(v: string | undefined): v is PaymentFilter {
  return v === "ALL" || v === "UNKNOWN" || v === "BELUM" || v === "DP" || v === "LUNAS";
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
  /** `null` = TIDAK DIKETAHUI (pembacaan gagal / migrasi belum jalan) —
   *  BUKAN "Belum DO". Lihat catatan di page.tsx. */
  shipping: ShippingState | null;
  /** `null` = TIDAK DIKETAHUI, dengan alasan yang sama. Beda dari
   *  "UNKNOWN", yang justru fakta terbaca: totalnya memang belum dicatat. */
  payment: CustomerPaymentStatus | null;
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
  shippingAvailable,
  paymentAvailable,
}: {
  items: OrderListItem[];
  errorKind: "missing_table" | "other" | null;
  ownBranchId: string;
  crossBranchVisible: boolean;
  /** Keterangan kirim terbaca untuk daftar ini. `false` = deretan filternya
   *  TIDAK ditampilkan sama sekali — bukan ditampilkan lalu menyaring semua
   *  baris habis (LESSONS #10). Pola yang sama dengan `jalurAvailable` di
   *  /admin/orders. */
  shippingAvailable: boolean;
  paymentAvailable: boolean;
}) {
  const m = useCabangMessages();
  const STATUS_FILTERS = statusFilters(m);
  const SHIPPING_FILTERS = shippingFilters(m);
  const PAYMENT_FILTERS = paymentFilters(m);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [shippingFilter, setShippingFilter] = useState<ShippingFilter>("ALL");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("ALL");

  const filtered = useMemo(() => {
    let rows = statusFilter === "ALL" ? items : items.filter((it) => it.status === statusFilter);
    // Kedua filter di bawah hanya berjalan kalau keterangannya memang
    // terbaca. Penjagaan ini BUKAN hiasan: kalau pembacaannya gagal, semua
    // `it.shipping` bernilai null dan menyaringnya akan mengosongkan daftar
    // — kegagalan yang menyamar jadi "tidak ada pesanan" (LESSONS #10).
    if (shippingAvailable && shippingFilter !== "ALL") {
      rows = rows.filter((it) => it.shipping === shippingFilter);
    }
    if (paymentAvailable && paymentFilter !== "ALL") {
      rows = rows.filter((it) => it.payment === paymentFilter);
    }
    const needle = q.trim().toLowerCase();
    const needleDigits = needle.replace(/[^0-9]/g, "");
    if (!needle) return rows;
    return rows.filter((it) => {
      if (it.orderNumber.toLowerCase().includes(needle)) return true;
      if (it.customerName.toLowerCase().includes(needle)) return true;
      if (needleDigits && it.customerPhone.includes(needleDigits)) return true;
      return false;
    });
  }, [items, q, statusFilter, shippingFilter, paymentFilter, shippingAvailable, paymentAvailable]);

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
    fields: { q, statusFilter, shippingFilter, paymentFilter },
    onRestore: (saved) => {
      if (saved.q !== undefined) setQ(saved.q);
      if (isStatusFilter(saved.statusFilter)) setStatusFilter(saved.statusFilter);
      // Dipulihkan TANPA memeriksa shippingAvailable/paymentAvailable: kalau
      // keterangannya kebetulan tidak terbaca kali ini, deretan filternya
      // tidak tampil DAN penyaringnya tidak berjalan (lihat useMemo di
      // atas), jadi nilai tersimpan itu tidak berpengaruh apa-apa — dan
      // tetap ada begitu pembacaannya pulih. Menghapusnya justru membuat
      // pilihan staf hilang karena satu kali query gagal.
      if (isShippingFilter(saved.shippingFilter)) setShippingFilter(saved.shippingFilter);
      if (isPaymentFilter(saved.paymentFilter)) setPaymentFilter(saved.paymentFilter);
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

      {/* Deret filter kirim & bayar berdiri SENDIRI, bukan digabung ke deret
          status: ketiganya sumbu yang berbeda dan berlaku bersamaan
          ("Terdaftar + Belum ada DO + Belum Bayar" adalah pertanyaan yang
          sah). Masing-masing hanya muncul kalau keterangannya terbaca. */}
      {shippingAvailable && (
        <div className="segmented">
          {SHIPPING_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              className={`seg${shippingFilter === f.value ? " on" : ""}`}
              onClick={() => setShippingFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {paymentAvailable && (
        <div className="segmented">
          {PAYMENT_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              className={`seg${paymentFilter === f.value ? " on" : ""}`}
              onClick={() => setPaymentFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

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
                {/* Status bayar berdiri di samping status pesanan, bukan
                    menggantikannya: keduanya sumbu berbeda. Hanya tampil
                    kalau memang terbaca — pil kosong akan terbaca sebagai
                    "belum bayar" (LESSONS #10). */}
                {it.payment && (
                  <span className={CUSTOMER_PAYMENT_STATUS_CHIP[it.payment]}>
                    {customerPaymentStatusLabel(m, it.payment)}
                  </span>
                )}
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
