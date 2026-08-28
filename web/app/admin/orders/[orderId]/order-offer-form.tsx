"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { submitSafely } from "@/lib/safe-write";
import { useAdminMessages } from "@/lib/i18n/provider";
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
 *
 * Diperluas migrasi 0015: rantai diskon % (slot dinamis, maks 6) + markup% +
 * potongan tunai + Harga Akhir/Sisa Bayar dihitung LIVE di layar (perkiraan —
 * dihitung ulang dengan rumus yang SAMA dengan trigger database supaya
 * pengguna melihat angka yang masuk akal SEBELUM submit) — nilai yang
 * TERSIMPAN selalu datang dari respons server setelah refresh (LESSONS #7:
 * jangan percaya angka yang dihitung sendiri sebagai bukti tersimpan).
 */
function liveDiscountMultiplier(pcts: number[]): number {
  return pcts.reduce((mult, p) => mult * (1 - p / 100), 1);
}

export default function OrderOfferForm({
  orderId,
  currentAmount,
  currentDpAmount,
  currentPaymentCondition,
  currentDiscountPcts,
  currentMarkupPct,
  currentCashDiscount,
  canDiscount,
}: {
  orderId: string;
  currentAmount: number | null;
  currentDpAmount: number | null;
  currentPaymentCondition: string | null;
  currentDiscountPcts: number[];
  currentMarkupPct: number | null;
  currentCashDiscount: number;
  /** Admin selalu true secara efektif (server tidak pernah mengecek ini untuk
   * admin — hanya dipakai untuk menyembunyikan bagian diskon di layar cabang
   * kalau komponen ini kelak dipakai ulang di sana; halaman admin selalu
   * memberi `true`). */
  canDiscount?: boolean;
}) {
  const router = useRouter();
  const m = useAdminMessages();
  const [open, setOpen] = useState(false);
  const { submitting, begin, release, reset } = useSubmitGuard();
  const [clearing, setClearing] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [netMsg, setNetMsg] = useState<string | null>(null);
  // Sisa bayar = matematika TAMPILAN saja (amount - dp_amount), TIDAK PERNAH
  // disimpan sebagai kolom — pola yang sama sudah didokumentasikan di
  // migration 0014 §2. Dihitung ulang setiap kali kedua input berubah.
  const [liveAmount, setLiveAmount] = useState<number | null>(currentAmount);
  const [liveDp, setLiveDp] = useState<number | null>(currentDpAmount);
  const [liveDiscounts, setLiveDiscounts] = useState<string[]>(
    currentDiscountPcts.length ? currentDiscountPcts.map(String) : [""]
  );
  const [liveMarkup, setLiveMarkup] = useState<string>(currentMarkupPct == null ? "" : String(currentMarkupPct));
  const [liveCash, setLiveCash] = useState<number | null>(currentCashDiscount || null);

  // Perkiraan LIVE — rumus SAMA PERSIS dengan fn_compute_order_offer_final
  // (0015): rantai % berurutan (kalikan, bukan jumlah) → markup → kurangi
  // potongan tunai. Elemen kosong/tidak valid di slot diskon diabaikan di
  // sini (bukan error) — validasi sungguhan tetap di server + database.
  const parsedDiscounts = liveDiscounts
    .map((s) => Number(s.trim().replace(",", ".")))
    .filter((n) => Number.isFinite(n) && n > 0 && n < 100);
  const parsedMarkup = liveMarkup.trim() === "" ? 0 : Number(liveMarkup.trim().replace(",", "."));
  const liveFinal =
    liveAmount != null
      ? Math.round(
          liveAmount *
            liveDiscountMultiplier(parsedDiscounts) *
            (1 + (Number.isFinite(parsedMarkup) ? parsedMarkup : 0) / 100) -
            (liveCash ?? 0)
        )
      : null;
  const remaining = liveFinal != null ? liveFinal - (liveDp ?? 0) : null;

  function openModal() {
    reset();
    setErrMsg(null);
    setNetMsg(null);
    setClearing(false);
    setLiveAmount(currentAmount);
    setLiveDp(currentDpAmount);
    setLiveDiscounts(currentDiscountPcts.length ? currentDiscountPcts.map(String) : [""]);
    setLiveMarkup(currentMarkupPct == null ? "" : String(currentMarkupPct));
    setLiveCash(currentCashDiscount || null);
    setOpen(true);
  }

  function addDiscountSlot() {
    setLiveDiscounts((slots) => (slots.length >= 6 ? slots : [...slots, ""]));
  }
  function removeDiscountSlot(idx: number) {
    setLiveDiscounts((slots) => slots.filter((_, i) => i !== idx));
  }
  function handleDiscountSlotChange(idx: number, value: string) {
    setLiveDiscounts((slots) => slots.map((s, i) => (i === idx ? value : s)));
  }
  function handleCashChange(e: React.ChangeEvent<HTMLInputElement>) {
    const n = parseIDRInput(e.target.value);
    e.target.value = n === null ? "" : formatIDR(n);
    setLiveCash(n);
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
    setLiveAmount(n);
  }

  function handleDpChange(e: React.ChangeEvent<HTMLInputElement>) {
    const n = parseIDRInput(e.target.value);
    e.target.value = n === null ? "" : formatIDR(n);
    setLiveDp(n);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!begin()) return;
    setErrMsg(null);
    setNetMsg(null);
    const fd = new FormData(e.currentTarget);
    const raw = String(fd.get("offer_amount") || "");
    const dpRaw = String(fd.get("dp_amount") || "");
    const conditionRaw = String(fd.get("payment_condition") || "");
    const markupRaw = String(fd.get("markup_pct") || "");
    const cashRaw = String(fd.get("cash_discount") || "");
    const out = await submitSafely({
      kind: "update",
      run: () => setOrderOffer(orderId, raw, dpRaw, conditionRaw, liveDiscounts, markupRaw, cashRaw),
      messages: m,
      buttonLabel: m.admin.orderOfferSaveBtn,
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
      buttonLabel: m.admin.orderOfferClearBtn,
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
              <div className="field" style={{ marginBottom: 10 }}>
                <label htmlFor="dp_amount">{m.admin.orderOfferDpFieldLabel}</label>
                <input
                  id="dp_amount"
                  name="dp_amount"
                  type="text"
                  inputMode="numeric"
                  defaultValue={currentDpAmount ? formatIDR(currentDpAmount) : ""}
                  onChange={handleDpChange}
                  placeholder="Rp 0"
                />
              </div>
              <div className="field" style={{ marginBottom: 10 }}>
                <label htmlFor="payment_condition">{m.admin.orderOfferPaymentConditionFieldLabel}</label>
                <input
                  id="payment_condition"
                  name="payment_condition"
                  type="text"
                  defaultValue={currentPaymentCondition ?? ""}
                  placeholder={m.admin.orderOfferPaymentConditionPlaceholder}
                />
              </div>

              {canDiscount !== false && (
                <div style={{ marginBottom: 10, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
                  <div className="overline">{m.admin.orderOfferDiscountSectionTitle}</div>
                  <p className="small muted" style={{ marginBottom: 10 }}>
                    {m.admin.orderOfferDiscountHint}
                  </p>
                  {liveDiscounts.map((slot, idx) => (
                    <div key={idx} className="field" style={{ marginBottom: 8, display: "flex", gap: 8, alignItems: "flex-end" }}>
                      <div style={{ flex: 1 }}>
                        <label htmlFor={`discount_${idx}`}>
                          {m.admin.orderOfferDiscountFieldLabel.replace("{n}", String(idx + 1))}
                        </label>
                        <input
                          id={`discount_${idx}`}
                          type="text"
                          inputMode="decimal"
                          value={slot}
                          onChange={(e) => handleDiscountSlotChange(idx, e.target.value)}
                          placeholder="8"
                        />
                      </div>
                      {liveDiscounts.length > 1 && (
                        <button type="button" className="btn sm" onClick={() => removeDiscountSlot(idx)}>
                          {m.admin.orderOfferDiscountRemoveBtn}
                        </button>
                      )}
                    </div>
                  ))}
                  {liveDiscounts.length < 6 && (
                    <button type="button" className="btn sm" onClick={addDiscountSlot} style={{ marginBottom: 10 }}>
                      {m.admin.orderOfferDiscountAddBtn}
                    </button>
                  )}
                  <div className="field" style={{ marginBottom: 10 }}>
                    <label htmlFor="markup_pct">{m.admin.orderOfferMarkupFieldLabel}</label>
                    <input
                      id="markup_pct"
                      name="markup_pct"
                      type="text"
                      inputMode="decimal"
                      value={liveMarkup}
                      onChange={(e) => setLiveMarkup(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <div className="field" style={{ marginBottom: 10 }}>
                    <label htmlFor="cash_discount">{m.admin.orderOfferCashFieldLabel}</label>
                    <input
                      id="cash_discount"
                      name="cash_discount"
                      type="text"
                      inputMode="numeric"
                      defaultValue={currentCashDiscount ? formatIDR(currentCashDiscount) : ""}
                      onChange={handleCashChange}
                      placeholder="Rp 0"
                    />
                  </div>
                </div>
              )}

              {liveFinal != null && (
                <>
                  <dl className="kv" style={{ marginBottom: 4 }}>
                    <dt>{m.admin.orderOfferFinalLiveLabel}</dt>
                    <dd>
                      <strong>{formatIDR(Math.max(liveFinal, 0))}</strong>
                    </dd>
                  </dl>
                  <p className="small muted" style={{ marginBottom: 10 }}>
                    {m.admin.orderOfferFinalLiveHint}
                  </p>
                </>
              )}
              {remaining != null && (
                <dl className="kv" style={{ marginBottom: 10 }}>
                  <dt>{m.admin.orderOfferRemainingLabel}</dt>
                  <dd>
                    <strong>{formatIDR(Math.max(remaining, 0))}</strong>
                  </dd>
                </dl>
              )}
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
