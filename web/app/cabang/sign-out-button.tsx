"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCabangMessages } from "@/lib/i18n/provider";

export default function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const m = useCabangMessages();

  // supabase-js diimpor DINAMIS di dalam handler, bukan di atas berkas:
  // impor statis menyeret ~65 kB gzip SDK (termasuk Realtime yang tidak
  // pernah dipakai) ke first-load SEMUA halaman yang memuat komponen ini,
  // padahal satu-satunya kegunaannya adalah tombol keluar (audit kecepatan
  // muat 2026-08-22 #3). Kalau jaringan gagal memuat modulnya, tombol
  // dilepas lagi (setBusy false) — sama dengan kegagalan signOut biasa.
  async function onClick() {
    setBusy(true);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      await createClient().auth.signOut();
    } catch {
      setBusy(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <button className="btn danger block" onClick={onClick} disabled={busy}>
      {busy ? m.cabang.signingOut : m.cabang.homeSignOut}
    </button>
  );
}
