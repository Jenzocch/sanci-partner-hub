"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toggleUserStatus } from "../../actions-users";

export default function UserToggleButton({ userId, active }: { userId: string; active: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    const res = await toggleUserStatus(userId);
    setBusy(false);
    if ("error" in res) {
      alert(res.error.message);
      return;
    }
    router.refresh();
  }

  return (
    <button className="btn sm" onClick={onClick} disabled={busy}>
      {active ? "Nonaktifkan" : "Aktifkan lagi"}
    </button>
  );
}
