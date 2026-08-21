"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { submitSafely } from "@/lib/safe-write";
import { useLocalDraft } from "@/lib/use-local-draft";
import DraftBanner from "@/lib/draft-banner";
import {
  formatIDR,
  parseIDRInput,
  fulfillmentDesc,
  fulfillmentLabel,
  type FulfillmentPath,
} from "@/lib/orders-shared";
import { useCabangMessages } from "@/lib/i18n/provider";
import type { CabangMessages } from "@/lib/i18n";
import { updateOrder, cancelOrder } from "../actions";

export type StaffOption = { id: string; fullName: string; role: string };
export type PackageOption = { id: string; name: string };
/** Value <option> khusus untuk "Lainnya (ketik manual)" — bukan id package sungguhan. */
const PACKAGE_MANUAL = "__manual__";
const FULFILLMENT_PATHS: FulfillmentPath[] = ["DIRECT_DELIVERY", "SHOWROOM_VISIT"];

/**
 * Kode stabil untuk pilihan alasan pembatalan — TIDAK berubah per bahasa.
 * `value` = teks yang benar-benar disimpan ke DB (cancellation_reason),
 * selalu Bahasa Indonesia terlepas dari bahasa layar staf yang membatalkan,
 * supaya data lama & baru konsisten dan admin (yang belum tentu berganti
 * bahasa) tetap membacanya sama. Hanya LABEL yang ditampilkan yang mengikuti
 * bahasa aktif (lihat cancelReasonLabel di bawah) — ini murni pemisahan
 * teks/tampilan, bukan perubahan pada apa yang tersimpan (LESSONS: tidak
 * mengubah logika/nilai yang tersimpan).
 */
const CANCEL_REASON_CODES = ["customer_cancelled", "wrong_order", "duplicate_order", "other"] as const;
type CancelReasonCode = (typeof CANCEL_REASON_CODES)[number];
const CANCEL_REASON_VALUE: Record<CancelReasonCode, string> = {
  customer_cancelled: "Pelanggan membatalkan pembelian",
  wrong_order: "Pesanan salah",
  duplicate_order: "Pesanan ganda",
  other: "Lainnya",
};
function cancelReasonLabel(m: CabangMessages, code: CancelReasonCode): string {
  switch (code) {
    case "customer_cancelled":
      return m.cabang.cancelReasonCustomerCancelled;
    case "wrong_order":
      return m.cabang.cancelReasonWrongOrder;
    case "duplicate_order":
      return m.cabang.cancelReasonDuplicateOrder;
    case "other":
      return m.cabang.cancelReasonOther;
  }
}

export default function OrderDetailActions({
  orderId,
  orderNumber,
  customerName,
  packageName,
  packageId,
  packages,
  salesStaffId,
  picStaffId,
  notes,
  staffOptions,
  fulfillmentPath,
  purchaseAmount,
  extrasAvailable,
  shippingAddress,
}: {
  orderId: string;
  orderNumber: string;
  customerName: string;
  packageName: string;
  packageId: string | null;
  packages: PackageOption[];
  salesStaffId: string | null;
  picStaffId: string | null;
  notes: string | null;
  staffOptions: StaffOption[];
  fulfillmentPath: FulfillmentPath | null;
  purchaseAmount: number | null;
  extrasAvailable: boolean;
  shippingAddress: string | null;
}) {
  const router = useRouter();
  const m = useCabangMessages();
  const [modal, setModal] = useState<null | "edit" | "cancel">(null);

  return (
    <>
      <div className="btnrow">
        <button type="button" className="btn" onClick={() => setModal("edit")}>
          {m.cabang.editOrderCta}
        </button>
        <button type="button" className="btn danger" onClick={() => setModal("cancel")}>
          {m.cabang.cancelOrderCta}
        </button>
      </div>

      {modal === "edit" && (
        <EditOrderModal
          orderId={orderId}
          packageName={packageName}
          packageId={packageId}
          packages={packages}
          salesStaffId={salesStaffId}
          picStaffId={picStaffId}
          notes={notes}
          staffOptions={staffOptions}
          fulfillmentPath={fulfillmentPath}
          purchaseAmount={purchaseAmount}
          extrasAvailable={extrasAvailable}
          shippingAddress={shippingAddress}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            router.refresh();
          }}
        />
      )}

      {modal === "cancel" && (
        <CancelOrderModal
          orderId={orderId}
          orderNumber={orderNumber}
          customerName={customerName}
          onClose={() => setModal(null)}
          onCancelled={() => {
            setModal(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Modal Ubah Pesanan (SPEC §36–37)
 * ------------------------------------------------------------------ */

function EditOrderModal({
  orderId,
  packageName,
  packageId,
  packages,
  salesStaffId,
  picStaffId,
  notes,
  staffOptions,
  fulfillmentPath,
  purchaseAmount,
  extrasAvailable,
  shippingAddress,
  onClose,
  onSaved,
}: {
  orderId: string;
  packageName: string;
  packageId: string | null;
  packages: PackageOption[];
  salesStaffId: string | null;
  picStaffId: string | null;
  notes: string | null;
  staffOptions: StaffOption[];
  fulfillmentPath: FulfillmentPath | null;
  purchaseAmount: number | null;
  extrasAvailable: boolean;
  shippingAddress: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { submitting, begin, release } = useSubmitGuard();
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [netMsg, setNetMsg] = useState<string | null>(null);
  const m = useCabangMessages();
  // Kunci draf per orderId — draf pesanan lain tidak boleh tercampur (SPEC §73).
  const draft = useLocalDraft("order-edit", orderId, true);

  const salesOptions = [...staffOptions].sort((a, b) => (a.role === "Sales" ? -1 : b.role === "Sales" ? 1 : 0));
  const picOptions = [...staffOptions].sort((a, b) => {
    const rank = (r: string) => (r === "Resepsionis / CS" ? 0 : r === "Manajer" ? 1 : 2);
    return rank(a.role) - rank(b.role);
  });

  const hasPackages = packages.length > 0;
  const packageMatchesOption = hasPackages && !!packageId && packages.some((p) => p.id === packageId);
  // Select TIDAK dikontrol React (defaultValue) — sama seperti pola new-order-form,
  // supaya draft.restore() (menulis langsung ke DOM) tidak ditimpa balik state (LESSONS #1).
  const [packageChoice, setPackageChoice] = useState<string>(
    hasPackages ? (packageMatchesOption ? (packageId as string) : PACKAGE_MANUAL) : ""
  );

  /** Format Rupiah langsung saat mengetik — sama seperti form Pesanan Baru. */
  function handleAmountChange(e: React.ChangeEvent<HTMLInputElement>) {
    const n = parseIDRInput(e.target.value);
    e.target.value = n === null ? "" : formatIDR(n);
  }

  /** Lanjutkan pengisian dari draf lokal — nilai draf perlu disinkronkan ke state React juga. */
  function handleRestoreDraft() {
    draft.restore();
    const pkgEl = draft.formRef.current?.elements.namedItem("package_id") as HTMLSelectElement | null;
    if (pkgEl && pkgEl.value) setPackageChoice(pkgEl.value);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!begin()) return;
    setErrs({});
    setNetMsg(null);
    const fd = new FormData(e.currentTarget);
    const picRaw = String(fd.get("pic_staff_id") || "");
    const selectedPackage = hasPackages && packageChoice && packageChoice !== PACKAGE_MANUAL
      ? packages.find((p) => p.id === packageChoice)
      : undefined;

    const out = await submitSafely({
      kind: "update",
      messages: m,
      run: () =>
        updateOrder({
          orderId,
          packageId: selectedPackage?.id,
          packageName: selectedPackage ? selectedPackage.name : String(fd.get("package_name") || ""),
          packagesAvailable: hasPackages,
          salesStaffId: String(fd.get("sales_staff_id") || ""),
          picStaffId: picRaw || undefined,
          notes: String(fd.get("notes") || ""),
          // `undefined` (bukan field kosong) kalau extrasAvailable false — field
          // ini memang tidak dirender, kolomnya tidak boleh disentuh sama sekali.
          fulfillmentPath: extrasAvailable ? String(fd.get("fulfillment_path") || "") : undefined,
          purchaseAmountRaw: extrasAvailable ? String(fd.get("partner_purchase_amount") || "") : undefined,
          shippingAddress: String(fd.get("shipping_address") || ""),
        }),
    });

    if (out.status !== "ok") {
      release();
      setNetMsg(out.message);
      return;
    }
    const res = out.result;
    if ("error" in res) {
      release();
      setErrs({ [res.error.field || "_form"]: res.error.message });
      return;
    }
    // Berhasil dan sudah dipastikan lewat .select() di server — baru sekarang
    // draf dihapus (LESSONS #1) dan tombol dibiarkan nonaktif sampai halaman
    // disegarkan (LESSONS #20 turunan: tidak ada kedipan yang bisa diklik ganda).
    draft.clear();
    onSaved();
  }

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true">
        <h2>{m.cabang.editOrderCta}</h2>
        {netMsg && <div className="banner warn">{netMsg}</div>}
        {errs._form && <div className="banner bad">{errs._form}</div>}
        <DraftBanner draft={draft.draft} onRestore={handleRestoreDraft} onDiscard={draft.discard} />
        <form onSubmit={onSubmit} ref={draft.formRef} onInput={draft.onInput} onChange={draft.onInput}>
          {extrasAvailable && (
            <>
              <div style={{ marginBottom: 18 }}>
                <label style={{ display: "block", fontSize: "var(--fs-sec)", fontWeight: 600, color: "var(--ink)", marginBottom: 7 }}>
                  {m.common.fulfillment}
                </label>
                <div className="radioset">
                  {FULFILLMENT_PATHS.map((p) => (
                    <label key={p}>
                      <input type="radio" name="fulfillment_path" value={p} defaultChecked={fulfillmentPath === p} />
                      <span>
                        {fulfillmentLabel(m, p)}
                        <div className="rd">{fulfillmentDesc(m, p)}</div>
                      </span>
                    </label>
                  ))}
                </div>
                {errs.fulfillment_path && <div className="err-text">{errs.fulfillment_path}</div>}
              </div>
              <div className="field">
                <label htmlFor="eo_amount">{m.cabang.purchaseAmountLabel}</label>
                <input
                  id="eo_amount"
                  name="partner_purchase_amount"
                  type="text"
                  inputMode="numeric"
                  placeholder="Rp 0"
                  defaultValue={purchaseAmount != null ? formatIDR(purchaseAmount) : ""}
                  onChange={handleAmountChange}
                />
                {errs.partner_purchase_amount && <div className="err-text">{errs.partner_purchase_amount}</div>}
                <div className="hint">{m.cabang.purchaseAmountHint}</div>
              </div>
            </>
          )}
          {hasPackages ? (
            <div className={`field${errs.package_name ? " invalid" : ""}`}>
              <label htmlFor="eo_package_id">{m.cabang.packageFieldLabel}</label>
              <select
                id="eo_package_id"
                name="package_id"
                defaultValue={packageChoice}
                onChange={(e) => setPackageChoice(e.target.value)}
              >
                <option value="">{m.cabang.selectPackagePlaceholder}</option>
                {packages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
                <option value={PACKAGE_MANUAL}>{m.cabang.packageManualOption}</option>
              </select>
              {errs.package_name && <div className="err-text">{errs.package_name}</div>}
            </div>
          ) : null}
          {(!hasPackages || packageChoice === PACKAGE_MANUAL) && (
            <div className={`field${!hasPackages && errs.package_name ? " invalid" : ""}`}>
              <label htmlFor="eo_package">{m.cabang.packageNameFieldLabel}</label>
              <input id="eo_package" name="package_name" type="text" defaultValue={packageName} />
              {!hasPackages && errs.package_name && <div className="err-text">{errs.package_name}</div>}
            </div>
          )}
          <div className={`field${errs.sales_staff_id ? " invalid" : ""}`}>
            <label htmlFor="eo_sales">{m.cabang.salesFieldLabel}</label>
            <select id="eo_sales" name="sales_staff_id" defaultValue={salesStaffId || ""}>
              <option value="">{m.cabang.selectSalesPlaceholder}</option>
              {salesOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName} ({s.role})
                </option>
              ))}
            </select>
            {salesOptions.length === 0 && <div className="hint">{m.cabang.noActiveStaffHint}</div>}
            {errs.sales_staff_id && <div className="err-text">{errs.sales_staff_id}</div>}
          </div>
          <div className={`field${errs.pic_staff_id ? " invalid" : ""}`}>
            <label htmlFor="eo_pic">{m.cabang.picLabel}</label>
            <select id="eo_pic" name="pic_staff_id" defaultValue={picStaffId || ""}>
              <option value="">{m.cabang.notSelectedOption}</option>
              {picOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName} ({s.role})
                </option>
              ))}
            </select>
            {errs.pic_staff_id && <div className="err-text">{errs.pic_staff_id}</div>}
          </div>
          <div className="field">
            <label htmlFor="eo_shipping_address">{m.cabang.shippingAddressFieldLabel}</label>
            <textarea
              id="eo_shipping_address"
              name="shipping_address"
              defaultValue={shippingAddress || ""}
              placeholder={m.cabang.optionalPlaceholder}
            />
            <div className="hint">{m.cabang.shippingAddressHint}</div>
          </div>
          <div className="field">
            <label htmlFor="eo_notes">{m.common.notes}</label>
            <textarea id="eo_notes" name="notes" defaultValue={notes || ""} placeholder={m.cabang.optionalPlaceholder} />
          </div>
          <div className="btnrow">
            <button type="button" className="btn" onClick={onClose} disabled={submitting}>
              {m.common.cancel}
            </button>
            <button type="submit" className="btn primary lg block" disabled={submitting}>
              {submitting ? m.common.saving : m.common.save}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Dialog Batalkan Pesanan (SPEC §41, §96)
 * ------------------------------------------------------------------ */

function CancelOrderModal({
  orderId,
  orderNumber,
  customerName,
  onClose,
  onCancelled,
}: {
  orderId: string;
  orderNumber: string;
  customerName: string;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const { submitting, begin, release } = useSubmitGuard();
  const m = useCabangMessages();
  const [reasonChoice, setReasonChoice] = useState<CancelReasonCode | "">("");
  const [customReason, setCustomReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [netMsg, setNetMsg] = useState<string | null>(null);

  async function onConfirm() {
    if (!begin()) return;
    setErr(null);
    setNetMsg(null);

    if (!reasonChoice) {
      release();
      setErr(m.cabang.errReasonRequired);
      return;
    }
    // `value` yang disimpan ke DB selalu teks Indonesia kanonik (lihat catatan
    // di CANCEL_REASON_VALUE) — bukan label yang sedang ditampilkan.
    const finalReason = reasonChoice === "other" ? customReason.trim() : CANCEL_REASON_VALUE[reasonChoice];
    if (!finalReason) {
      release();
      setErr(m.cabang.errCancelReasonRequired);
      return;
    }

    const out = await submitSafely({
      kind: "update",
      messages: m,
      run: () => cancelOrder({ orderId, reason: finalReason }),
    });

    if (out.status !== "ok") {
      release();
      setNetMsg(out.message);
      return;
    }
    const res = out.result;
    if ("error" in res) {
      release();
      setErr(res.error.message);
      return;
    }
    onCancelled();
  }

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true">
        <h2>{m.cabang.cancelOrderConfirmTitle}</h2>
        {netMsg && <div className="banner warn">{netMsg}</div>}
        {err && <div className="banner bad">{err}</div>}
        <dl className="kv">
          <dt>{m.common.orderNumber}</dt>
          <dd className="code">{orderNumber}</dd>
          <dt>{m.common.customer}</dt>
          <dd>{customerName}</dd>
        </dl>
        <div className="field">
          <label htmlFor="co_reason">{m.common.reason} *</label>
          <select
            id="co_reason"
            value={reasonChoice}
            onChange={(e) => setReasonChoice(e.target.value as CancelReasonCode)}
          >
            <option value="">{m.cabang.selectReasonPlaceholder}</option>
            {CANCEL_REASON_CODES.map((code) => (
              <option key={code} value={code}>
                {cancelReasonLabel(m, code)}
              </option>
            ))}
          </select>
        </div>
        {reasonChoice === "other" && (
          <div className="field">
            <label htmlFor="co_reason_other">{m.cabang.otherReasonLabel}</label>
            <textarea
              id="co_reason_other"
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              placeholder={m.cabang.otherReasonPlaceholder}
            />
          </div>
        )}
        <div className="btnrow">
          <button type="button" className="btn" onClick={onClose} disabled={submitting}>
            {m.common.back}
          </button>
          <button type="button" className="btn danger lg block" onClick={onConfirm} disabled={submitting}>
            {submitting ? m.cabang.cancellingOrder : m.cabang.cancelOrderCta}
          </button>
        </div>
      </div>
    </div>
  );
}
