"use client";

import { useEffect, useRef } from "react";
import NewAdminOrderForm from "./new-order-form";

type PartnerOption = { id: string; name: string };

/**
 * Admin 建單表單的窄範圍 UX 補丁：server field error 可能出現在送出鈕
 * 上方很遠的位置。只在按下 primary action 後短暫等待 `.err-text` 出現，
 * 找到後捲到所屬欄位並 focus；不改表單 state、Server Action 或寫入流程。
 *
 * 不用 MutationObserver：上一版共用 observer helper 曾造成 Vercel build
 * regression（2026-09-08），這裡刻意採用有限時間 polling，找到即停止。
 */
export default function NewAdminOrderFormWithErrorScroll({ partners }: { partners: PartnerOption[] }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
    };
  }, []);

  function reveal(error: HTMLElement) {
    const field = error.closest(".field");
    const control = field?.querySelector("input, select, textarea");
    const target = control instanceof HTMLElement ? control : error;
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    if (
      control instanceof HTMLInputElement ||
      control instanceof HTMLSelectElement ||
      control instanceof HTMLTextAreaElement
    ) {
      control.focus({ preventScroll: true });
    }
  }

  function startWatchingForFieldError() {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    let attempts = 0;
    timerRef.current = window.setInterval(() => {
      attempts += 1;
      const error = rootRef.current?.querySelector(".err-text");
      if (error instanceof HTMLElement) {
        reveal(error);
        if (timerRef.current !== null) window.clearInterval(timerRef.current);
        timerRef.current = null;
        return;
      }
      // Server Action 正常應遠低於 15 秒；超過就交給既有 network/error UI。
      if (attempts >= 150) {
        if (timerRef.current !== null) window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }, 100);
  }

  function handleClickCapture(event: React.MouseEvent<HTMLDivElement>) {
    const source = event.target;
    if (!(source instanceof HTMLElement)) return;
    const button = source.closest("button.btn.primary");
    if (!button) return;
    // 等原本 onClick 先清掉舊 errs，再開始等待這次 server response。
    window.setTimeout(startWatchingForFieldError, 0);
  }

  return (
    <div ref={rootRef} onClickCapture={handleClickCapture}>
      <NewAdminOrderForm partners={partners} />
    </div>
  );
}
