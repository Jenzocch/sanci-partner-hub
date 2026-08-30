"use client";

/**
 * Navigasi bawah cabang — HANYA mobile (<768px, diatur CSS module-nya).
 * Dirender sekali dari app/cabang/layout.tsx supaya ada di semua halaman
 * cabang, KECUALI dua halaman yang sudah punya bar bawah sendiri:
 *   - /cabang/pesanan/baru  → bar "Buat Pesanan" (lib/order-sticky-bar.tsx)
 *   - /cabang/kalkulator    → bar total kalkulator (lib/kalkulator-client.tsx)
 * Di sana nav disembunyikan total (bukan ditumpuk): dua bar bawah memakan
 * seperempat layar HP, dan salah jempol saat mengisi pesanan membuang
 * setengah formulir. Pola "sembunyikan nav saat mode fokus" juga kebiasaan
 * aplikasi belanja yang staf sudah kenal.
 *
 * Empat tujuan saja (Beranda/Pesanan/Produk/Pelanggan) — tujuan lain tetap
 * lewat menu Beranda. Produk TIDAK di-gate sanci_catalog_access di sini
 * (itu probe server; nav ini client) — halaman Produk sendiri sudah
 * menjelaskan dengan baik bila katalog belum dibuka, jadi tautannya aman.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCabangMessages } from "@/lib/i18n/provider";
import styles from "./bottom-nav.module.css";

const HIDDEN_PATHS = ["/cabang/pesanan/baru", "/cabang/kalkulator"];

function IconHome() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 10.5 12 3.5l8.5 7" />
      <path d="M5.5 9.5V20h13V9.5" />
    </svg>
  );
}
function IconOrders() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3.5h12V20l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2L6 20V3.5Z" />
      <path d="M9 8h6M9 12h6" />
    </svg>
  );
}
function IconProducts() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
      <path d="M12 12 4 7.5M12 12l8-4.5M12 12v9" />
    </svg>
  );
}
function IconCustomers() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <path d="M15.5 5.6a3.2 3.2 0 0 1 0 4.8M17.5 14.9c1.8.7 3 2.3 3 4.6" />
    </svg>
  );
}

export default function CabangBottomNav() {
  const m = useCabangMessages();
  const pathname = usePathname();

  if (HIDDEN_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return null;
  }

  const items = [
    { href: "/cabang", label: m.cabang.navHome, exact: true, icon: <IconHome /> },
    { href: "/cabang/pesanan", label: m.cabang.navOrders, exact: false, icon: <IconOrders /> },
    { href: "/cabang/produk", label: m.cabang.navProducts, exact: false, icon: <IconProducts /> },
    { href: "/cabang/pelanggan", label: m.cabang.navCustomers, exact: false, icon: <IconCustomers /> },
  ];

  return (
    <>
      {/* Ruang setinggi nav supaya konten paling bawah halaman tidak
          tertutup bar fixed — pola sama dengan bottomSpacer kalkulator. */}
      <div className={styles.spacer} aria-hidden="true" />
      <nav className={styles.nav} aria-label={m.cabang.navAria}>
        {items.map((it) => {
          const on = it.exact
            ? pathname === it.href
            : pathname === it.href || pathname.startsWith(it.href + "/");
          return (
            <Link
              key={it.href}
              href={it.href}
              className={on ? `${styles.item} ${styles.on}` : styles.item}
              aria-current={on ? "page" : undefined}
            >
              {it.icon}
              <span className={styles.lbl}>{it.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
