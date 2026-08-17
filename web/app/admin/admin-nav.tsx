"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  const isPartners = pathname === "/admin" || pathname.startsWith("/admin/partners");
  const isOrders = pathname.startsWith("/admin/orders");

  return (
    <nav className="side">
      <div className="brand">
        <span className="serif word">SANCI</span>
        <span className="sub">Partner Hub</span>
      </div>
      {/* Urutan mengikuti logika pemakaian harian: pemantauan pesanan dulu,
          pengaturan partner setelahnya. */}
      <Link href="/admin/orders" className={`navlink${isOrders ? " on" : ""}`}>
        Pesanan Partner
      </Link>
      <Link href="/admin" className={`navlink${isPartners ? " on" : ""}`}>
        Partner
      </Link>
      <button className="navlink bottom" onClick={signOut}>
        Keluar
      </button>
    </nav>
  );
}
