"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { submitSafely } from "@/lib/safe-write";
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
        Tandai Pelanggan Sudah Tiba
      </button>

      {open && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="modal" role="dialog" aria-modal="true">
            <h2>Tandai Pelanggan Sudah Tiba</h2>
            <p className="small muted" style={{ marginBottom: 14 }}>
              Pesanan <strong>{orderNumber}</strong> atas nama <strong>{customerName}</strong> akan
              ditandai pelanggan sudah tiba di SANCI. Waktu dan petugas yang menandai tercatat otomatis
              di Activity dan tidak bisa diubah dari layar ini.
            </p>
            {netMsg && <div className="banner warn">{netMsg}</div>}
            <div className="btnrow">
              <button type="button" className="btn" onClick={closeModal}>
                Batal
              </button>
              <button type="button" className="btn primary" disabled={submitting} onClick={onConfirm}>
                {submitting ? "Menandai…" : "Ya, Sudah Tiba"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
