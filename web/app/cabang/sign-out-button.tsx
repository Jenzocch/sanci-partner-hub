"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCabangMessages } from "@/lib/i18n/provider";

export default function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const m = useCabangMessages();

  async function onClick() {
    setBusy(true);
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <button className="btn danger block" onClick={onClick} disabled={busy}>
      {busy ? m.cabang.signingOut : m.cabang.homeSignOut}
    </button>
  );
}
