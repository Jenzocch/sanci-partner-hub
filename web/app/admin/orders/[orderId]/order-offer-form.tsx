"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { submitSafely } from "@/lib/safe-write";
import { useMessages } from "@/lib/i18n/provider";
import { formatIDR, parseIDRInput } from "@/lib/orders-shared";
import { setOrderOffer, clearOrderOffer } from "../../actions-orders";

/**
 * Isi / ubah / hapus nilai penawaran SANCI untuk SATU pesanan (migrasi 0013).
 *
 * Pola modal + useSubmitGuard + submitSafely ditiru dari mark-arrived-button.tsx
 * dan correct-attribution-button.tsx supaya perilaku jaringan lemah konsisten
 * se-halaman. Tanpa `lookup`: tulisannya adalah UPSERT berkunci order_id, jadi
 * kiriman ulang tidak pernah menghasilkan baris kedua — Server Action yang
 * memastikan status sebenarnya saat respons hilang, bukan nomor permintaan.
 *
 * "Hapus" dibuat sebagai tombol TERSENDIRI, bukan "simpan nilai kosong":
 * tidak ada penawaran dan penawaran senilai Rp 0 adalah dua keadaan berbeda,
 * dan layar tidak boleh membuat keduanya terlihat seperti satu hal.
 */
export default function OrderOfferForm({
  orderId,
  currentAmount,
}: {
  orderId: string;
  currentAmount: number | null;
}) {
  const router = useRouter();
  const m = useMessages();
  const [open, setOpen] = useState(false);
  const { submitting, begin, release, reset } = useSubmitGuard();
  const [clearing, setClearing] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [netMsg, setNetMsg] = useState<string | null>(null);

  function openModal() {
    reset();
    setErrMsg(null);
    setNetMsg(null);
    setClearing(false);
    setOpen(true);
  }

  function closeModal() {
    reset();
    setClearing(false);
    setOpen(false);
  }

  /** Format Rupiah langsung saat mengetik — sama persis dengan formulir pesanan cabang. */
  function handleAmountChange(e: React.ChangeEvent<HTMLInputElement>) {
    const n = parseIDRInput(e.target.value);
    e.target.value = n === null ? "" : formatIDR(n);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!begin()) return;
    setErrMsg(null);
    setNetMsg(null);
    const raw = String(new FormData(e.currentTarget).get("offer_amount") || "");
    const out = await submitSafely({
      kind: "update",
      run: () => setOrderOffer(orderId, raw),
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
      setErrMsg(res.error.message);
      return;
    }
    // Tombol tetap nonaktif sampai halaman disegarkan — nilai yang tampil
    // datang dari query server yang sudah dipastikan (LESSONS #7).
    setOpen(false);
    router.refresh();
  }

  async function onClear() {
    if (!confirm(m.admin.orderOfferClearConfirm)) return;
    if (!begin()) return;
    setErrMsg(null);
    setNetMsg(null);
    setClearing(true);
    const out = await submitSafely({
      kind: "update",
      run: () => clearOrderOffer(orderId),
      messages: m,
    });
    if (out.status !== "ok") {
      release();
      setClearing(false);
      setNetMsg(out.message);
      return;
    }
    const res = out.result;
    if ("error" in res) {
      release();
      setClearing(false);
      setErrMsg(res.error.message);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <div className="btnrow-inline">
        <button className="btn primary" onClick={openModal}>
          {currentAmount == null ? m.admin.orderOfferSetBtn : m.admin.orderOfferEditBtn}
        </button>
      </div>

      {open && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="modal" role="dialog" aria-modal="true">
            <h2>{m.admin.orderOfferModalTitle}</h2>
            <p className="small muted" style={{ marginBottom: 14 }}>
              {m.admin.orderOfferModalDesc}
            </p>
            {netMsg && <div className="banner warn">{netMsg}</div>}
            {errMsg && <div className="banner bad">{errMsg}</div>}
            <form onSubmit={onSubmit}>
              <div className={`field${errMsg ? " invalid" : ""}`} style={{ marginBottom: 10 }}>
                <label htmlFor="offer_amount">{m.admin.orderOfferFieldLabel}</label>
                <input
                  id="offer_amount"
                  name="offer_amount"
                  type="text"
                  inputMode="numeric"
                  defaultValue={currentAmount == null ? "" : formatIDR(currentAmount)}
                  onChange={handleAmountChange}
                  placeholder={m.admin.orderOfferPlaceholder}
                />
              </div>
              <div className="btnrow">
                <button type="button" className="btn" onClick={closeModal}>
                  {m.common.cancel}
                </button>
                {currentAmount != null && (
                  <button type="button" className="btn" disabled={submitting} onClick={onClear}>
                    {clearing ? m.admin.orderOfferClearingBtn : m.admin.orderOfferClearBtn}
                  </button>
                )}
                <button type="submit" className="btn primary" disabled={submitting}>
                  {submitting && !clearing ? m.common.saving : m.admin.orderOfferSaveBtn}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
