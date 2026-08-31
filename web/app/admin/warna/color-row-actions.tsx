"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitSafely } from "@/lib/safe-write";
import { useAdminMessages } from "@/lib/i18n/provider";
import { setColorStatus, moveColor, type ColorRow } from "../actions-colors";

/**
 * Toggle status + tombol geser urutan untuk SATU baris /admin/warna.
 * Halaman induk (page.tsx) TETAP server-rendered murni (LESSONS #45: lebih
 * sederhana dijaga daripada mengadopsi pola client-state use-catalog-search
 * untuk daftar sekecil ini) — komponen kecil ini yang membawa interaktivitas
 * per baris, dan `router.refresh()` di sini SELALU efektif karena page.tsx
 * bukan client-state yang menelan props sekali.
 */
export default function ColorRowActions({
  color,
  isFirst,
  isLast,
}: {
  color: ColorRow;
  isFirst: boolean;
  isLast: boolean;
}) {
  const router = useRouter();
  const m = useAdminMessages();
  const [busy, setBusy] = useState<"status" | "up" | "down" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function onToggleStatus() {
    if (busy) return;
    const next = color.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    setBusy("status");
    setMsg(null);
    const out = await submitSafely({
      kind: "update",
      run: () => setColorStatus(color.id, next),
      messages: m,
      buttonLabel: color.status === "ACTIVE" ? m.common.deactivate : m.common.activate,
    });
    setBusy(null);
    if (out.status !== "ok") {
      setMsg(out.message);
      return;
    }
    if ("error" in out.result) {
      setMsg(out.result.error.message);
      return;
    }
    router.refresh();
  }

  async function onMove(direction: "up" | "down") {
    if (busy) return;
    setBusy(direction);
    setMsg(null);
    const out = await submitSafely({
      kind: "update",
      run: () => moveColor(color.id, direction),
      messages: m,
      buttonLabel: direction === "up" ? m.admin.colorMoveUpAria : m.admin.colorMoveDownAria,
    });
    setBusy(null);
    if (out.status !== "ok") {
      setMsg(out.message);
      return;
    }
    if ("error" in out.result) {
      setMsg(out.result.error.message);
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <div className="btnrow-inline">
        {!isFirst && (
          <button type="button" className="btn sm" disabled={busy !== null} onClick={() => onMove("up")} aria-label={m.admin.colorMoveUpAria}>
            ↑
          </button>
        )}
        {!isLast && (
          <button type="button" className="btn sm" disabled={busy !== null} onClick={() => onMove("down")} aria-label={m.admin.colorMoveDownAria}>
            ↓
          </button>
        )}
        <button type="button" className="btn sm" disabled={busy !== null} onClick={onToggleStatus}>
          {busy === "status" ? m.common.loading : color.status === "ACTIVE" ? m.common.deactivate : m.common.activate}
        </button>
      </div>
      {msg && <div className="err-text">{msg}</div>}
    </div>
  );
}
