"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAdminMessages } from "@/lib/i18n/provider";
import LocaleSwitcher from "@/lib/i18n/locale-switcher";

export default function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();
  const m = useAdminMessages();

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  const isPartners = pathname === "/admin" || pathname.startsWith("/admin/partners");
  const isOrders = pathname.startsWith("/admin/orders");
  const isProducts = pathname.startsWith("/admin/produk");
  const isCustomers = pathname.startsWith("/admin/pelanggan");

  return (
    <nav className="side">
      <div className="brand">
        <span className="serif word">SANCI</span>
        <span className="sub">Partner Hub</span>
      </div>
      {/* Urutan mengikuti logika pemakaian harian: pemantauan pesanan dulu,
          katalog produk, pelanggan (input harian tim sales SANCI-direct),
          pengaturan partner setelahnya. */}
      <Link href="/admin/orders" className={`navlink${isOrders ? " on" : ""}`}>
        {m.admin.navOrders}
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
