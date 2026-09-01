"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { submitSafely } from "@/lib/safe-write";
import { useCabangMessages } from "@/lib/i18n/provider";
import { formatIDR, parseIDRInput, formatDateTimeWIB, formatCalendarDate } from "@/lib/orders-shared";
import {
  customerPaymentStatus,
  customerPaymentRemaining,
  CUSTOMER_PAYMENT_STATUS_CHIP,
} from "@/lib/payment-shared";
import { getCustomerPayment, setCustomerPayment } from "../actions";

/**
 * Kartu "Pembayaran Pelanggan" (Fitur D, migrasi 0026) — sisi cabang.
 *
 * Kartu menampilkan potret render halaman (prop `payment`, sama pola dengan
 * OfferSection); modal Ubah memuat SEGAR tiap kali dibuka lewat
 * getCustomerPayment (pola order-offer-form.tsx: loadSeq guard supaya
 * respons pemuatan lama tidak menimpa ketikan pengguna yang lebih baru,
 * LESSONS #1/#7 — kolom uang tidak boleh diisi dari potret basi).
 *
 * `customer_settled_at` HANYA ditampilkan (server-stamped trigger DB,
 * LESSONS #11) — tidak ada field untuknya di form.
 */
export type PaymentCardData = {
  total: number | null;
  paid: number;
  dpPaidAt: string | null;
  settledAt: string | null;
  /** Tanggal lunas SUNGGUHAN, isi tangan (0027) — beda dari settledAt
   *  di atas yang dicap server dan tidak bisa diketik. */
  settledOn: string | null;
  expedition: string | null;
  confirmStatus: string | null;
};

type PaymentLoad =
  | { status: "loading" }
  | { status: "error"; message?: string }
  | { status: "ready"; snapshot: PaymentCardData };

export default function CustomerPaymentSection({
  orderId,
  payment,
  canManage,
}: {
  orderId: string;
  payment: PaymentCardData;
  canManage: boolean;
}) {
  const router = useRouter();
  const m = useCabangMessages();
  const [open, setOpen] = useState(false);
  const { submitting, begin, release, reset } = useSubmitGuard();
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [netMsg, setNetMsg] = useState<string | null>(null);
  const [load, setLoad] = useState<PaymentLoad>({ status: "loading" });
  const loadSeq = useRef(0);
  const [liveTotal, setLiveTotal] = useState<number | null>(null);
  const [livePaid, setLivePaid] = useState<number | null>(null);

  const status = customerPaymentStatus(payment.total, payment.paid);
  const remaining = customerPaymentRemaining(payment.total, payment.paid);
  const statusLabel = {
    UNKNOWN: m.common.customerPaymentStatusUnknown,
    BELUM: m.common.customerPaymentStatusBelum,
    DP: m.common.customerPaymentStatusDp,
    LUNAS: m.common.customerPaymentStatusLunas,
  }[status];

  async function loadFresh() {
    const seq = ++loadSeq.current;
    setLoad({ status: "loading" });
    try {
      const res = await getCustomerPayment(orderId);
      if (seq !== loadSeq.current) return;
      if (res.status !== "ok") {
        setLoad({ status: "error", message: res.status === "unavailable" ? m.cabang.errFeatureInactive : undefined });
        return;
      }
      setLiveTotal(res.data.total);
      setLivePaid(res.data.paid);
      setLoad({ status: "ready", snapshot: res.data });
    } catch {
      if (seq !== loadSeq.current) return;
      setLoad({ status: "error" });
    }
  }

  function openModal() {
    reset();
    setErrMsg(null);
    setNetMsg(null);
    setOpen(true);
    void loadFresh();
  }
  function closeModal() {
    reset();
    setOpen(false);
  }
  function handleTotalChange(e: React.ChangeEvent<HTMLInputElement>) {
    const n = parseIDRInput(e.target.value);
    e.target.value = n === null ? "" : formatIDR(n);
    setLiveTotal(n);
  }
  function handlePaidChange(e: React.ChangeEvent<HTMLInputElement>) {
    const n = parseIDRInput(e.target.value);
    e.target.value = n === null ? "" : formatIDR(n);
    setLivePaid(n);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!begin()) return;
    setErrMsg(null);
    setNetMsg(null);
    const fd = new FormData(e.currentTarget);
    const out = await submitSafely({
      kind: "update",
      run: () =>
        setCustomerPayment(
          orderId,
          String(fd.get("customer_total_amount") || ""),
          String(fd.get("customer_paid_amount") || ""),
          String(fd.get("customer_dp_paid_at") || ""),
          String(fd.get("expedition") || ""),
          String(fd.get("confirm_status") || ""),
          String(fd.get("customer_settled_on") || "")
        ),
      messages: m,
      buttonLabel: m.cabang.customerPaymentSaveBtn,
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

  const snapshot = load.status === "ready" ? load.snapshot : null;
  const liveRemaining =
    liveTotal != null && livePaid != null ? liveTotal - livePaid : null;

  return (
    <div className="card">
      <h3 style={{ fontSize: 17, marginBottom: 4 }}>{m.common.customerPaymentCardTitle}</h3>
      <dl className="kv" style={{ marginTop: 10 }}>
        <dt>{m.common.customerPaymentTotal}</dt>
        <dd>{payment.total == null ? "—" : formatIDR(payment.total)}</dd>
        <dt>{m.common.customerPaymentPaid}</dt>
        <dd>{formatIDR(payment.paid)}</dd>
        <dt>{m.common.customerPaymentRemaining}</dt>
        <dd>{remaining == null ? "—" : formatIDR(Math.max(remaining, 0))}</dd>
        <dt>{m.common.customerPaymentStatus}</dt>
        <dd>
          <span className={CUSTOMER_PAYMENT_STATUS_CHIP[status]}>{statusLabel}</span>
        </dd>
        {payment.dpPaidAt && (
          <>
            <dt>{m.common.customerPaymentDpDate}</dt>
            <dd>{formatCalendarDate(payment.dpPaidAt, m.common.dateLocale)}</dd>
          </>
        )}
        {payment.settledAt && (
          <>
            <dt>{m.common.customerPaymentSettledDate}</dt>
            <dd>{formatDateTimeWIB(payment.settledAt, m.common.dateLocale)}</dd>
          </>
        )}
        {/* Tanggal lunas sungguhan (0027) — ditampilkan TEPAT di bawah cap
            sistem supaya keduanya terbaca sebagai pasangan, bukan sebagai
            dua tanggal yang saling bersaing. `date` MURNI, jadi lewat
            formatCalendarDate seperti Tgl DP, BUKAN formatDateTimeWIB. */}
        {payment.settledOn && (
          <>
            <dt>{m.common.customerPaymentSettledOnDate}</dt>
            <dd>{formatCalendarDate(payment.settledOn, m.common.dateLocale)}</dd>
          </>
        )}
        {payment.expedition && (
          <>
            <dt>{m.common.expeditionLabel}</dt>
            <dd>{payment.expedition}</dd>
          </>
        )}
        {payment.confirmStatus && (
          <>
            <dt>{m.common.confirmStatusLabel}</dt>
            <dd>{payment.confirmStatus}</dd>
          </>
        )}
      </dl>

      {canManage ? (
        <div className="btnrow-inline">
          <button className="btn primary" onClick={openModal}>
            {m.cabang.customerPaymentEditBtn}
          </button>
        </div>
      ) : (
        <p className="footnote">{m.cabang.customerPaymentReadOnlyNote}</p>
      )}

      {open && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="modal" role="dialog" aria-modal="true">
            <h2>{m.cabang.customerPaymentModalTitle}</h2>
            {netMsg && <div className="banner warn">{netMsg}</div>}
            {errMsg && <div className="banner bad">{errMsg}</div>}

            {load.status === "loading" && (
              <>
                <div className="hint">{m.common.loading}</div>
                <div className="btnrow">
                  <button type="button" className="btn" onClick={closeModal}>
                    {m.common.cancel}
                  </button>
                </div>
              </>
            )}

            {load.status === "error" && (
              <>
                <div className="banner bad">{load.message ?? m.cabang.customerPaymentLoadFailed}</div>
                <div className="btnrow">
                  <button type="button" className="btn" onClick={closeModal}>
                    {m.common.close}
                  </button>
                  <button type="button" className="btn primary" onClick={loadFresh}>
                    {m.common.retry}
                  </button>
                </div>
              </>
            )}

            {load.status === "ready" && (
              <form onSubmit={onSubmit}>
                <div className={`field${errMsg ? " invalid" : ""}`} style={{ marginBottom: 10 }}>
                  <label htmlFor="customer_total_amount">{m.common.customerPaymentTotal}</label>
                  <input
                    id="customer_total_amount"
                    name="customer_total_amount"
                    type="text"
                    inputMode="numeric"
                    defaultValue={snapshot?.total == null ? "" : formatIDR(snapshot.total)}
                    onChange={handleTotalChange}
                    placeholder="Rp 0"
                  />
                </div>
                <div className="field" style={{ marginBottom: 10 }}>
                  <label htmlFor="customer_paid_amount">{m.common.customerPaymentPaid}</label>
                  <input
                    id="customer_paid_amount"
                    name="customer_paid_amount"
                    type="text"
                    inputMode="numeric"
                    defaultValue={snapshot?.paid ? formatIDR(snapshot.paid) : ""}
                    onChange={handlePaidChange}
                    placeholder="Rp 0"
                  />
                </div>
                <div className="field" style={{ marginBottom: 10 }}>
                  <label htmlFor="customer_dp_paid_at">{m.common.customerPaymentDpDate}</label>
                  <input
                    id="customer_dp_paid_at"
                    name="customer_dp_paid_at"
                    type="date"
                    defaultValue={snapshot?.dpPaidAt ?? ""}
                  />
                </div>
                <div className="field" style={{ marginBottom: 10 }}>
                  <label htmlFor="customer_settled_on">{m.common.customerPaymentSettledOnDate}</label>
                  <input
                    id="customer_settled_on"
                    name="customer_settled_on"
                    type="date"
                    defaultValue={snapshot?.settledOn ?? ""}
                  />
                  {/* Keterangan WAJIB ada: dua tanggal lunas yang berdampingan
                      tanpa penjelasan adalah undangan salah isi. */}
                  <p className="footnote">{m.common.customerPaymentSettledOnHint}</p>
                </div>
                <div className="field" style={{ marginBottom: 10 }}>
                  <label htmlFor="expedition">{m.common.expeditionLabel}</label>
                  <input id="expedition" name="expedition" type="text" maxLength={120} defaultValue={snapshot?.expedition ?? ""} />
                </div>
                <div className="field" style={{ marginBottom: 10 }}>
                  <label htmlFor="confirm_status">{m.common.confirmStatusLabel}</label>
                  <input
                    id="confirm_status"
                    name="confirm_status"
                    type="text"
                    maxLength={200}
                    defaultValue={snapshot?.confirmStatus ?? ""}
                  />
                </div>
                {liveRemaining != null && (
                  <dl className="kv" style={{ marginBottom: 10 }}>
                    <dt>{m.common.customerPaymentRemaining}</dt>
                    <dd>
                      <strong>{formatIDR(Math.max(liveRemaining, 0))}</strong>
                    </dd>
                  </dl>
                )}
                <div className="btnrow">
                  <button type="button" className="btn" onClick={closeModal}>
                    {m.common.cancel}
                  </button>
                  <button type="submit" className="btn primary" disabled={submitting}>
                    {submitting ? m.common.saving : m.cabang.customerPaymentSaveBtn}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
