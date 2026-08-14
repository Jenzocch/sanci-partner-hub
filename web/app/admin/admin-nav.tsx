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

  return (
    <nav className="side">
      <div className="brand">
        <span className="serif word">SANCI</span>
        <span className="sub">Partner Hub</span>
      </div>
      <Link href="/admin" className={`navlink${isPartners ? " on" : ""}`}>
        Partner
      </Link>
      <button className="navlink" onClick={signOut} style={{ marginTop: "auto" }}>
        Keluar
      </button>
    </nav>
  );
}
