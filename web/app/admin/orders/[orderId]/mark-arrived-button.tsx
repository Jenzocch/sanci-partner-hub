"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { submitSafely } from "@/lib/safe-write";
import { useAdminMessages } from "@/lib/i18n/provider";
import { markCustomerArrived } from "../../actions-orders";

/**
 * Tombol "Tandai Pelanggan Sudah Tiba" — hanya untuk pesanan SHOWROOM_VISIT
 * yang belum ditandai (halaman pemanggil yang memastikan itu, komponen ini
 * tidak menduga ulang). Pola confirm-dialog + useSubmitGuard + submitSafely
 * ditiru dari correct-attribution-button.tsx supaya perilaku jaringan lemah
 * konsisten se-halaman.
 */
export default function MarkArrivedButton({
  orderId,
  customerName,
  orderNumber,
}: {
  orderId: string;
  customerName: string;
  orderNumber: string;
}) {
  const router = useRouter();
  const m = useAdminMessages();
  const [open, setOpen] = useState(false);
  const { submitting, begin, release, reset } = useSubmitGuard();
  const [netMsg, setNetMsg] = useState<string | null>(null);

  function openModal() {
    reset();
    setNetMsg(null);
    setOpen(true);
  }

  function closeModal() {
    reset();
    setOpen(false);
  }

  async function onConfirm() {
    if (!begin()) return;
    setNetMsg(null);
    const out = await submitSafely({
      kind: "update",
      run: () => markCustomerArrived(orderId),
      messages: m,
    });
    if (out.status !== "ok") {
      release();
      setNetMsg(out.message);
      return;
    }
    const res = out.result;
    if ("error" in res) {
      release();
      setNetMsg(res.error.message);
      return;
    }
    // Tombol tetap nonaktif sampai halaman disegarkan — status kedatangan
    // tampil lewat query server yang sudah dipastikan (LESSONS #7).
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button className="btn primary" onClick={openModal}>
        {m.admin.markArrivedBtn}
      </button>

      {open && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="modal" role="dialog" aria-modal="true">
            <h2>{m.admin.markArrivedModalTitle}</h2>
            <p className="small muted" style={{ marginBottom: 14 }}>
              {m.admin.markArrivedDesc
                .replace("{orderNumber}", orderNumber)
                .replace("{customer}", customerName)}
            </p>
            {netMsg && <div className="banner warn">{netMsg}</div>}
            <div className="btnrow">
              <button type="button" className="btn" onClick={closeModal}>
                {m.common.cancel}
              </button>
              <button type="button" className="btn primary" disabled={submitting} onClick={onConfirm}>
                {submitting ? m.admin.markArrivedMarkingBtn : m.admin.markArrivedConfirmBtn}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
