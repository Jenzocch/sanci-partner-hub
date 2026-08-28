"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAdminMessages } from "@/lib/i18n/provider";
import LocaleSwitcher from "@/lib/i18n/locale-switcher";

export default function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();
  const m = useAdminMessages();

  // Impor dinamis, alasan sama dengan sign-out-button.tsx cabang: komponen
  // ini ada di layout, jadi impor statis membebani SETIAP halaman /admin/**
  // dengan ~65 kB gzip SDK hanya untuk tombol Keluar (audit 2026-08-22 #3).
  async function signOut() {
    try {
      const { createClient } = await import("@/lib/supabase/client");
      await createClient().auth.signOut();
    } catch {
      return;
    }
    router.push("/");
    router.refresh();
  }

  const isPartners = pathname === "/admin" || pathname.startsWith("/admin/partners");
  const isOrders = pathname.startsWith("/admin/orders");
  const isAnalytics = pathname.startsWith("/admin/analisis");
  const isProducts = pathname.startsWith("/admin/produk");
  const isCalculator = pathname.startsWith("/admin/kalkulator");
  const isCustomers = pathname.startsWith("/admin/pelanggan");

  return (
    <nav className="side">
      <div className="brand">
        <span className="serif word">SANCI</span>
        <span className="sub">Partner Hub</span>
      </div>
      {/* Urutan mengikuti ALUR KERJA HARIAN (arahan owner 2026-08-24 —
          "pakai logika pengguna"): ① pantau/buat pesanan; ①.5 Analisis —
          meninjau pesanan yang SUDAH masuk (produk terlaris), jadi tepat
          setelah Pesanan, sebelum berpindah ke alat yang menghadap ke
          depan; ② Kalkulator — menghitung penawaran untuk pelanggan adalah
          langkah SEBELUM pesanan jadi, jadi bersebelahan dengan Pesanan,
          bukan terselip di belakang; ③ katalog produk (rujukan);
          ④ pelanggan; ⑤ pengaturan partner paling belakang (jarang
          disentuh setelah toko berjalan). Admin-only (SPEC delegasi
          "hanya admin yang lihat") — halaman itu sendiri sudah digerbang
          `AdminLayout`, jadi tautan ini tidak perlu cek izin tambahan. */}
      <Link href="/admin/orders" className={`navlink${isOrders ? " on" : ""}`}>
        {m.admin.navOrders}
      </Link>
      <Link href="/admin/analisis" className={`navlink${isAnalytics ? " on" : ""}`}>
        {m.admin.navAnalytics}
      </Link>
      <Link href="/admin/kalkulator" className={`navlink${isCalculator ? " on" : ""}`}>
        {m.admin.navCalculator}
      </Link>
      <Link href="/admin/produk" className={`navlink${isProducts ? " on" : ""}`}>
        {m.admin.navProducts}
      </Link>
      <Link href="/admin/pelanggan" className={`navlink${isCustomers ? " on" : ""}`}>
        {m.admin.navCustomers}
      </Link>
      <Link href="/admin" className={`navlink${isPartners ? " on" : ""}`}>
        {m.admin.navPartners}
      </Link>
      <LocaleSwitcher />
      <button className="navlink bottom" onClick={signOut}>
        {m.common.signOut}
      </button>
    </nav>
  );
}
