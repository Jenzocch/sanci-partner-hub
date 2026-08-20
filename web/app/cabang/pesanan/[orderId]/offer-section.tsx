"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { submitSafely } from "@/lib/safe-write";
import { useMessages } from "@/lib/i18n/provider";
import { formatIDR, parseIDRInput } from "@/lib/orders-shared";
import { setOrderOfferBranch } from "../actions";

/**
 * Penawaran SANCI dari sisi cabang (migrasi 0014 can_view_offer/can_edit_offer,
 * 0015 can_discount + rantai diskon) — mirror `order-offer-form.tsx` (admin),
 * bukan komponen yang sama, karena Server Action-nya beda modul (LESSONS
 * catatan di kepala setOrderOfferBranch). TIDAK ADA tombol Hapus di sini —
 * "SANCI memutuskan tidak jadi memberi penawaran" tetap keputusan admin
 * (oso_admin_all-saja untuk DELETE, migration 0014 §3).
 *
 * Komponen ini TIDAK memutuskan visibilitas sendiri — halaman pemanggil
 * (page.tsx) hanya me-render ini ketika `canViewOffer` sudah true (yang
 * sendiri berarti data amount ADA untuk dibaca; kalau baris tidak ada sama
 * sekali, RLS sudah mengembalikan 0 baris sebelum komponen ini sempat
 * dipasang). Prop `canViewOffer` tetap diteruskan untuk konsistensi dan
 * berjaga-jaga.
 */
function liveDiscountMultiplier(pcts: number[]): number {
  return pcts.reduce((mult, p) => mult * (1 - p / 100), 1);
}

export type OfferData = {
  amount: number | null;
  dpAmount: number | null;
  paymentCondition: string | null;
  discountPcts: number[];
  markupPct: number | null;
  cashDiscount: number;
  finalAmount: number | null;
};

export default function OfferSection({
  orderId,
  canEditOffer,
  canDiscount,
  offer,
}: {
  orderId: string;
  canEditOffer: boolean;
  canDiscount: boolean;
  offer: OfferData;
}) {
  const router = useRouter();
  const m = useMessages();
  const [open, setOpen] = useState(false);
  const { submitting, begin, release, reset } = useSubmitGuard();
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [netMsg, setNetMsg] = useState<string | null>(null);
  const [liveAmount, setLiveAmount] = useState<number | null>(offer.amount);
  const [liveDp, setLiveDp] = useState<number | null>(offer.dpAmount);
  const [liveDiscounts, setLiveDiscounts] = useState<string[]>(
    offer.discountPcts.length ? offer.discountPcts.map(String) : [""]
  );
  const [liveMarkup, setLiveMarkup] = useState<string>(offer.markupPct == null ? "" : String(offer.markupPct));
  const [liveCash, setLiveCash] = useState<number | null>(offer.cashDiscount || null);

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
    setLiveAmount(offer.amount);
    setLiveDp(offer.dpAmount);
    setLiveDiscounts(offer.discountPcts.length ? offer.discountPcts.map(String) : [""]);
    setLiveMarkup(offer.markupPct == null ? "" : String(offer.markupPct));
    setLiveCash(offer.cashDiscount || null);
    setOpen(true);
  }
  function closeModal() {
    reset();
    setOpen(false);
  }
  function addDiscountSlot() {
    setLiveDiscounts((slots) => (slots.length >= 6 ? slots : [...slots, ""]));
  }
  function removeDiscountSlot(idx: number) {
    setLiveDiscounts((slots) => slots.filter((_, i) => i !== idx));
  }
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
  function handleCashChange(e: React.ChangeEvent<HTMLInputElement>) {
    const n = parseIDRInput(e.target.value);
    e.target.value = n === null ? "" : formatIDR(n);
    setLiveCash(n);
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
      run: () => setOrderOfferBranch(orderId, raw, dpRaw, conditionRaw, liveDiscounts, markupRaw, cashRaw),
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
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="card">
      <h3 style={{ fontSize: 17, marginBottom: 4 }}>{m.cabang.cabangOfferCardTitle}</h3>
      <dl className="kv" style={{ marginTop: 10 }}>
        <dt>{m.common.sanciOffer}</dt>
        <dd>
          {offer.amount == null ? (
            <span className="small muted">{m.cabang.cabangOfferEmpty}</span>
          ) : (
            <strong>{formatIDR(offer.amount)}</strong>
          )}
        </dd>
        {offer.dpAmount != null && offer.dpAmount > 0 && (
          <>
            <dt>{m.common.dpAmount}</dt>
            <dd>{formatIDR(offer.dpAmount)}</dd>
          </>
        )}
        {offer.paymentCondition && (
          <>
            <dt>{m.common.paymentCondition}</dt>
            <dd>{offer.paymentCondition}</dd>
          </>
        )}
        {offer.discountPcts.length > 0 && (
          <>
            <dt>{m.common.discountPcts}</dt>
            <dd>{offer.discountPcts.map((p) => `${p}%`).join(" + ")}</dd>
          </>
        )}
        {offer.markupPct != null && (
          <>
            <dt>{m.common.markupPct}</dt>
            <dd>{offer.markupPct}%</dd>
          </>
        )}
        {offer.cashDiscount > 0 && (
          <>
            <dt>{m.common.cashDiscount}</dt>
            <dd>{formatIDR(offer.cashDiscount)}</dd>
          </>
        )}
        {offer.finalAmount != null && offer.amount != null && (
          <>
            <dt>{m.common.finalAmount}</dt>
            <dd>
              <strong>{formatIDR(offer.finalAmount)}</strong>
            </dd>
            {offer.dpAmount != null && offer.dpAmount > 0 && (
              <>
                <dt>{m.common.remainingBalance}</dt>
                <dd>{formatIDR(Math.max(offer.finalAmount - offer.dpAmount, 0))}</dd>
              </>
            )}
          </>
        )}
      </dl>

      {canEditOffer ? (
        <div className="btnrow-inline">
          <button className="btn primary" onClick={openModal}>
            {offer.amount == null ? m.cabang.cabangOfferSetBtn : m.cabang.cabangOfferEditBtn}
          </button>
        </div>
      ) : (
        <p className="footnote">{m.cabang.cabangOfferReadOnlyNote}</p>
      )}

      {open && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="modal" role="dialog" aria-modal="true">
            <h2>{m.cabang.cabangOfferModalTitle}</h2>
            <p className="small muted" style={{ marginBottom: 14 }}>
              {m.cabang.cabangOfferModalDesc}
            </p>
            {netMsg && <div className="banner warn">{netMsg}</div>}
            {errMsg && <div className="banner bad">{errMsg}</div>}
            <form onSubmit={onSubmit}>
              <div className={`field${errMsg ? " invalid" : ""}`} style={{ marginBottom: 10 }}>
                <label htmlFor="offer_amount">{m.cabang.cabangOfferFieldLabel}</label>
                <input
                  id="offer_amount"
                  name="offer_amount"
                  type="text"
                  inputMode="numeric"
                  defaultValue={offer.amount == null ? "" : formatIDR(offer.amount)}
                  onChange={handleAmountChange}
                />
              </div>
              <div className="field" style={{ marginBottom: 10 }}>
                <label htmlFor="dp_amount">{m.common.dpAmount}</label>
                <input
                  id="dp_amount"
                  name="dp_amount"
                  type="text"
                  inputMode="numeric"
                  defaultValue={offer.dpAmount ? formatIDR(offer.dpAmount) : ""}
                  onChange={handleDpChange}
                  placeholder="Rp 0"
                />
              </div>
              <div className="field" style={{ marginBottom: 10 }}>
                <label htmlFor="payment_condition">{m.common.paymentCondition}</label>
                <input
                  id="payment_condition"
                  name="payment_condition"
                  type="text"
                  defaultValue={offer.paymentCondition ?? ""}
                />
              </div>

              {canDiscount && (
                <div style={{ marginBottom: 10, paddingTop: 6, borderTop: "1px solid var(--border, #e5e5e5)" }}>
                  <h3 style={{ fontSize: 14, marginBottom: 4 }}>{m.cabang.cabangOfferDiscountSectionTitle}</h3>
                  <p className="small muted" style={{ marginBottom: 10 }}>
                    {m.cabang.cabangOfferDiscountHint}
                  </p>
                  {liveDiscounts.map((slot, idx) => (
                    <div key={idx} className="field" style={{ marginBottom: 8, display: "flex", gap: 8, alignItems: "flex-end" }}>
                      <div style={{ flex: 1 }}>
                        <label htmlFor={`discount_${idx}`}>
                          {m.cabang.cabangOfferDiscountFieldLabel.replace("{n}", String(idx + 1))}
                        </label>
                        <input
                          id={`discount_${idx}`}
                          type="text"
                          inputMode="decimal"
                          value={slot}
                          onChange={(e) =>
                            setLiveDiscounts((slots) => slots.map((s, i) => (i === idx ? e.target.value : s)))
                          }
                          placeholder="8"
                        />
                      </div>
                      {liveDiscounts.length > 1 && (
                        <button type="button" className="btn sm" onClick={() => removeDiscountSlot(idx)}>
                          {m.cabang.cabangOfferDiscountRemoveBtn}
                        </button>
                      )}
                    </div>
                  ))}
                  {liveDiscounts.length < 6 && (
                    <button type="button" className="btn sm" onClick={addDiscountSlot} style={{ marginBottom: 10 }}>
                      {m.cabang.cabangOfferDiscountAddBtn}
                    </button>
                  )}
                  <div className="field" style={{ marginBottom: 10 }}>
                    <label htmlFor="markup_pct">{m.cabang.cabangOfferMarkupFieldLabel}</label>
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
                    <label htmlFor="cash_discount">{m.cabang.cabangOfferCashFieldLabel}</label>
                    <input
                      id="cash_discount"
                      name="cash_discount"
                      type="text"
                      inputMode="numeric"
                      defaultValue={offer.cashDiscount ? formatIDR(offer.cashDiscount) : ""}
                      onChange={handleCashChange}
                      placeholder="Rp 0"
                    />
                  </div>
                </div>
              )}

              {liveFinal != null && (
                <dl className="kv" style={{ marginBottom: 10 }}>
                  <dt>{m.common.finalAmount}</dt>
                  <dd>
                    <strong>{formatIDR(Math.max(liveFinal, 0))}</strong>
                  </dd>
                </dl>
              )}
              {remaining != null && (
                <dl className="kv" style={{ marginBottom: 10 }}>
                  <dt>{m.common.remainingBalance}</dt>
                  <dd>
                    <strong>{formatIDR(Math.max(remaining, 0))}</strong>
                  </dd>
                </dl>
              )}

              <div className="btnrow">
                <button type="button" className="btn" onClick={closeModal}>
                  {m.common.cancel}
                </button>
                <button type="submit" className="btn primary" disabled={submitting}>
                  {submitting ? m.common.saving : m.cabang.cabangOfferSaveBtn}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
