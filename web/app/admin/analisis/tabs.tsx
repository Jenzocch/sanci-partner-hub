import Link from "next/link";
import type { AdminMessages } from "@/lib/i18n";

/**
 * Deret tab /admin/analisis — dua pertanyaan yang berbeda atas data yang
 * SAMA (order_items):
 *
 *   "Produk Terlaris"   → dari SEMUA penjualan, mana yang paling laku?
 *   "Siapa yang Beli"   → dari SATU produk, siapa saja yang pernah membelinya?
 *
 * Dua RUTE, bukan satu halaman dengan cabang `if`: masing-masing memuat
 * query-nya sendiri, jadi membuka salah satunya tidak pernah membayar biaya
 * pemindaian milik yang lain. `<Link>` (bukan `<a>`) supaya perpindahannya
 * tetap navigasi klien — pola yang sama dengan deret tab /admin/pelanggan.
 */
export default function AnalisisTabs({
  active,
  m,
}: {
  active: "terlaris" | "pembeli";
  m: AdminMessages;
}) {
  const tabs = [
    { key: "terlaris" as const, href: "/admin/analisis", label: m.admin.analyticsTabTopProducts },
    { key: "pembeli" as const, href: "/admin/analisis/pembeli", label: m.admin.analyticsTabBuyers },
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
