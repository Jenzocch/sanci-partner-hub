import Link from "next/link";
import type { AdminMessages } from "@/lib/i18n";

/**
 * Deret tab /admin/analisis — dua pertanyaan yang berbeda atas data yang
 * SAMA (order_items):
 *
 *   "Produk Terlaris"   → dari SEMUA penjualan, mana yang paling laku?
 *   "Siapa yang Beli"   → dari SATU produk, siapa saja yang pernah membelinya?
 *
 * Ditambah dua tab Laporan Penjualan (migration 0033, owner 2026-09-23) —
 * pertanyaan ketiga atas pesanan, bukan item:
 *
 *   "Laporan"           → berapa pesanan/penjualan/Invoice/bayar/sisa per periode?
 *   "Per Cabang"        → angka yang sama, satu baris per partner/cabang.
 *
 * Satu RUTE per tab, bukan satu halaman dengan cabang `if`: masing-masing memuat
 * query-nya sendiri, jadi membuka salah satunya tidak pernah membayar biaya
 * pemindaian milik yang lain. `<Link>` (bukan `<a>`) supaya perpindahannya
 * tetap navigasi klien — pola yang sama dengan deret tab /admin/pelanggan.
 */
export default function AnalisisTabs({
  active,
  m,
}: {
  active: "terlaris" | "pembeli" | "laporan" | "cabang";
  m: AdminMessages;
}) {
  const tabs = [
    { key: "terlaris" as const, href: "/admin/analisis", label: m.admin.analyticsTabTopProducts },
    { key: "pembeli" as const, href: "/admin/analisis/pembeli", label: m.admin.analyticsTabBuyers },
    { key: "laporan" as const, href: "/admin/analisis/laporan", label: m.admin.analyticsTabReport },
    { key: "cabang" as const, href: "/admin/analisis/cabang", label: m.admin.analyticsTabByBranch },
  ];
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} className={`tab${active === t.key ? " on" : ""}`}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}
