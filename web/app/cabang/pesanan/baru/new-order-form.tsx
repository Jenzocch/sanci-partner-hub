"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { submitSafely } from "@/lib/safe-write";
import { useLocalDraft } from "@/lib/use-local-draft";
import DraftBanner from "@/lib/draft-banner";
import {
  displayPhoneID,
  formatIDR,
  parseIDRInput,
  fulfillmentDesc,
  fulfillmentLabel,
  type FulfillmentPath,
} from "@/lib/orders-shared";
import { readCalcHandoff, clearCalcHandoff, type CalcHandoff } from "@/lib/calculator-shared";
import {
  createCustomerAndOrder,
  createCustomerOnly,
  getOrderSummary,
  lookupCustomerRequestId,
  lookupOrderRequestId,
  searchCustomerByPhone,
  setOrderOfferBranch,
  type OrderCreated,
} from "../actions";
import { INVOICE_ACCEPT, unggahInvoice } from "../invoice-upload";
import StatusBadge from "../status-badge";
import { useMessages } from "@/lib/i18n/provider";

type StaffOption = { id: string; fullName: string; role: string };
export type PackageOption = { id: string; name: string };
type FoundCustomer = {
  id: string;
  full_name: string;
  phone: string;
  address?: string | null;
  city?: string | null;
  province?: string | null;
};
type LookupState = "idle" | "checking" | "found" | "not_found" | "invalid" | "error";

const SEARCH_DEBOUNCE_MS = 600;
/** Value <option> khusus untuk "Lainnya (ketik manual)" — bukan id package sungguhan. */
const PACKAGE_MANUAL = "__manual__";
const FULFILLMENT_PATHS: FulfillmentPath[] = ["DIRECT_DELIVERY", "SHOWROOM_VISIT"];

export default function NewOrderForm({
  branchId,
  staffOptions,
  packages,
  packagesLoadError,
  fulfillmentAvailable,
}: {
  branchId: string;
  staffOptions: StaffOption[];
  packages: PackageOption[];
  /** true kalau query package GAGAL karena sebab selain tabel belum ada (P3). */
  packagesLoadError: boolean;
  /** Probe server: kolom fulfillment_path (migration 0009) ada di sesi ini? (LESSONS #12) */
  fulfillmentAvailable: boolean;
}) {
  const m = useMessages();
  const { submitting, begin, release, reset } = useSubmitGuard();
  const draft = useLocalDraft("pesanan-baru", `new@${branchId}`, true);

  const [phone, setPhone] = useState("");
  const [lookupState, setLookupState] = useState<LookupState>("idle");
  const [foundCustomer, setFoundCustomer] = useState<FoundCustomer | null>(null);
  const [selectedExisting, setSelectedExisting] = useState(false);

  const [errs, setErrs] = useState<Record<string, string>>({});
  const [netMsg, setNetMsg] = useState<string | null>(null);
  const [partialMsg, setPartialMsg] = useState<string | null>(null);

  const [phase, setPhase] = useState<"form" | "order_success" | "customer_success">("form");
  const [orderResult, setOrderResult] = useState<OrderCreated | null>(null);
  const [customerResult, setCustomerResult] = useState<FoundCustomer | null>(null);
  const [invoiceMsg, setInvoiceMsg] = useState<string | null>(null);

  // Hand-off dari Kalkulator Penawaran (/cabang/kalkulator, sekali pakai lewat
  // localStorage — lihat lib/calculator-shared.ts). TIDAK PERNAH diterapkan
  // diam-diam (sama prinsip dengan draf: pengguna yang memutuskan, SPEC §58) —
  // staf harus menekan "Gunakan angka ini" dulu. `calcApply` hanya menandai
  // NIAT; penerapan rantai diskon sungguhan ke order_sanci_offers baru terjadi
  // SETELAH pesanan berhasil dibuat (lihat applyCalcHandoff di bawah), dan
  // tetap lewat setOrderOfferBranch yang sama dengan OfferSection — jalur itu
  // tetap menegakkan RLS/trigger can_edit_offer/can_discount 0014/0015 seperti
  // biasa; kalkulatornya saja yang bebas izin, bukan jalur tulis ini.
  const [calcHandoff, setCalcHandoff] = useState<CalcHandoff | null>(null);
  const [calcApply, setCalcApply] = useState(false);
  const [calcOutcomeMsg, setCalcOutcomeMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setCalcHandoff(readCalcHandoff());
  }, []);

  const hasPackages = packages.length > 0;
  // Select TIDAK dikontrol React (defaultValue, bukan value) — sama seperti pola
  // `phone` di bawah — supaya draft.restore() (yang menulis langsung ke DOM) tidak
  // ditimpa balik oleh state React di render berikutnya (LESSONS #1).
  const [packageChoice, setPackageChoice] = useState<string>("");

  const requestIdRef = useRef<string | null>(null);
  if (!requestIdRef.current) requestIdRef.current = crypto.randomUUID();
  const searchTokenRef = useRef(0);

  const salesOptions = [...staffOptions].sort((a, b) => (a.role === "Sales" ? -1 : b.role === "Sales" ? 1 : 0));
  const picOptions = [...staffOptions].sort((a, b) => {
    const rank = (r: string) => (r === "Resepsionis / CS" ? 0 : r === "Manajer" ? 1 : 2);
    return rank(a.role) - rank(b.role);
  });

  const runSearch = useCallback((raw: string) => {
    const token = ++searchTokenRef.current;
    if (!raw.trim()) {
      setLookupState("idle");
      setFoundCustomer(null);
      return;
    }
    setLookupState("checking");
    searchCustomerByPhone(raw)
      .then((res) => {
        if (searchTokenRef.current !== token) return; // respons basi, jeda berikutnya sudah jalan
        if (res.status === "found") {
          setFoundCustomer(res.customer);
          setLookupState("found");
        } else if (res.status === "not_found") {
          setFoundCustomer(null);
          setLookupState("not_found");
        } else if (res.status === "invalid") {
          setFoundCustomer(null);
          setLookupState("invalid");
        } else {
          // "missing_table" maupun "error" sama-sama TIDAK BOLEH ditampilkan sebagai
          // "tidak ditemukan" — itu bisa memicu pelanggan dibuat dua kali (SPEC §84).
          setFoundCustomer(null);
          setLookupState("error");
        }
      })
      .catch(() => {
        if (searchTokenRef.current === token) {
          setFoundCustomer(null);
          setLookupState("error");
        }
      });
  }, []);

  // Debounce pencarian telepon: menunggu jeda mengetik ~600ms (SPEC §82), bukan per-tombol.
  useEffect(() => {
    if (selectedExisting) return;
    const timer = setTimeout(() => runSearch(phone), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [phone, selectedExisting, runSearch]);

  function handlePhoneChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPhone(e.target.value);
  }

  /** Format Rupiah langsung saat mengetik — tidak dikontrol React (sama seperti field lain di form ini). */
  function handleAmountChange(e: React.ChangeEvent<HTMLInputElement>) {
    const n = parseIDRInput(e.target.value);
    e.target.value = n === null ? "" : formatIDR(n);
  }

  function setFieldValue(name: string, value: string) {
    const el = draft.formRef.current?.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null;
    if (el) el.value = value;
  }

  /** Staf menekan "Gunakan angka ini" pada banner hand-off Kalkulator. */
  function handleUseCalcHandoff() {
    if (!calcHandoff) return;
    setFieldValue("partner_purchase_amount", formatIDR(calcHandoff.subtotal));
    setCalcApply(true);
  }
  /** Staf menekan "Abaikan" — buang hand-off sepenuhnya, tidak ada yang dipakai. */
  function handleDismissCalcHandoff() {
    clearCalcHandoff();
    setCalcHandoff(null);
    setCalcApply(false);
  }

  /**
   * Dipanggil SETELAH pesanan berhasil dibuat (kedua jalur sukses di
   * onSubmitOrder). Best-effort murni — sama pola dengan copyPackageItemsToOrder
   * di actions.ts: kegagalan di sini TIDAK PERNAH membatalkan pesanan yang
   * sudah tersimpan, hanya dilaporkan lewat calcOutcomeMsg supaya staf tahu
   * (LESSONS #10, jangan diam-diam menelan kegagalan sebagian). Hand-off
   * selalu dihapus sesudahnya (sekali pakai) terlepas dari hasilnya.
   */
  async function applyCalcHandoffIfNeeded(orderId: string) {
    if (!calcApply || !calcHandoff) return;
    const out = await submitSafely({
      kind: "update",
      messages: m,
      run: () =>
        setOrderOfferBranch(
          orderId,
          String(calcHandoff.subtotal),
          "",
          "",
          calcHandoff.discountPcts.map(String),
          calcHandoff.markupPct == null ? "" : String(calcHandoff.markupPct),
          String(calcHandoff.cashDiscount)
        ),
    });
    const applied = out.status === "ok" && !("error" in out.result);
    setCalcOutcomeMsg({
      ok: applied,
      text: applied ? m.cabang.calcHandoffAppliedOk : m.cabang.calcHandoffAppliedFailed,
    });
    clearCalcHandoff();
    setCalcHandoff(null);
    setCalcApply(false);
  }

  /**
   * Prefill shipping_address dari alamat pelanggan (0014) — HANYA kalau
   * field itu masih kosong (LESSONS #1: draf/isian yang sudah diketik
   * pengguna tidak boleh ditimpa balik). Kolomnya tetap independen dan
   * selalu bisa diubah manual sesudah ini — ini murni kemudahan awal.
   */
  function prefillShippingAddress(c: FoundCustomer) {
    const el = draft.formRef.current?.elements.namedItem("shipping_address") as HTMLTextAreaElement | null;
    if (!el || el.value.trim()) return;
    const joined = [c.address, c.city, c.province].filter((v) => v && v.trim()).join(", ");
    if (joined) el.value = joined;
  }

  function handleUseExisting() {
    if (!foundCustomer) return;
    setSelectedExisting(true);
    setErrs({});
    prefillShippingAddress(foundCustomer);
  }

  function handleChangeCustomer() {
    setSelectedExisting(false);
    setFoundCustomer(null);
    setLookupState("idle");
    setPhone("");
    setFieldValue("phone", "");
    setFieldValue("full_name", "");
  }

  function resetFormForNext() {
    reset();
    setPhase("form");
    setOrderResult(null);
    setCustomerResult(null);
    setSelectedExisting(false);
    setFoundCustomer(null);
    setLookupState("idle");
    setPhone("");
    setPackageChoice("");
    setErrs({});
    setNetMsg(null);
    setPartialMsg(null);
    setInvoiceMsg(null);
    setCalcOutcomeMsg(null);
    // Hand-off (kalau ada) sudah dikonsumsi (dipakai atau diabaikan) sebelum
    // sampai di sini — pesanan berikutnya di sesi form yang sama TIDAK boleh
    // diam-diam memakai angka kalkulator yang sudah dipakai untuk pesanan lain.
    setCalcHandoff(readCalcHandoff());
    setCalcApply(false);
    requestIdRef.current = crypto.randomUUID();
    const form = draft.formRef.current;
    if (form) form.reset();
  }

  /** Lanjutkan pengisian dari draf lokal — nilai draf perlu disinkronkan ke state React juga. */
  function handleRestoreDraft() {
    draft.restore();
    const el = draft.formRef.current?.elements.namedItem("phone") as HTMLInputElement | null;
    if (el && el.value) setPhone(el.value);
    const pkgEl = draft.formRef.current?.elements.namedItem("package_id") as HTMLSelectElement | null;
    if (pkgEl && pkgEl.value) setPackageChoice(pkgEl.value);
  }

  const customerReady = selectedExisting || lookupState === "not_found" || lookupState === "invalid";

  async function onSubmitCustomerOnly() {
    if (!begin()) return;
    setErrs({});
    setNetMsg(null);
    setPartialMsg(null);
    const form = draft.formRef.current;
    if (!form) {
      release();
      return;
    }
    const fd = new FormData(form);
    const rid = requestIdRef.current!;
    // sales_staff_id ada di form YANG SAMA (section Order) — kalau staf
    // sudah dipilih sebelum tombol ini ditekan, ikut disertakan sebagai
    // atribusi pelanggan (customers.attributed_staff_id, migrasi 0019).
    // Kosong sama sekali (jalur paling umum untuk tombol ini) tetap sah,
    // TIDAK diwajibkan.
    const salesStaffIdRaw = String(fd.get("sales_staff_id") || "");
    const out = await submitSafely({
      messages: m,
      run: () =>
        createCustomerOnly({
          fullName: String(fd.get("full_name") || ""),
          phone,
          notes: String(fd.get("notes") || ""),
          salesStaffId: salesStaffIdRaw || undefined,
          clientRequestId: rid,
        }),
      lookup: () => lookupCustomerRequestId(rid),
    });

    if (out.status === "confirmed") {
      draft.clear();
      requestIdRef.current = null;
      setCustomerResult({ id: out.id, full_name: String(fd.get("full_name") || ""), phone });
      setPhase("customer_success");
      return;
    }
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
    draft.clear();
    requestIdRef.current = null;
    setCustomerResult({ id: res.data.customerId, full_name: res.data.fullName, phone: res.data.phone });
    setPhase("customer_success");
  }

  async function onSubmitOrder() {
    if (!begin()) return;
    setErrs({});
    setNetMsg(null);
    setPartialMsg(null);
    setInvoiceMsg(null);
    const form = draft.formRef.current;
    if (!form) {
      release();
      return;
    }
    const fd = new FormData(form);
    const rid = requestIdRef.current!;
    const picRaw = String(fd.get("pic_staff_id") || "");
    // Package terpilih dari dropdown (id ASLI, bukan PACKAGE_MANUAL) → kirim
    // packageId + nama sebagai snapshot; server tetap menimpanya dari DB
    // (LESSONS #6, tidak percaya snapshot client).
    const selectedPackage = hasPackages && packageChoice && packageChoice !== PACKAGE_MANUAL
      ? packages.find((p) => p.id === packageChoice)
      : undefined;
    // Berkas invoice diunggah TERPISAH sesudah order berhasil dibuat — tidak
    // pernah ikut membatalkan pembuatan order kalau gagal (lihat invoice-upload.ts).
    const invoiceFile = fd.get("invoice");

    const out = await submitSafely({
      messages: m,
      run: () =>
        createCustomerAndOrder({
          customerId: selectedExisting && foundCustomer ? foundCustomer.id : undefined,
          fullName: selectedExisting ? undefined : String(fd.get("full_name") || ""),
          phone: selectedExisting ? undefined : phone,
          packageId: selectedPackage?.id,
          packageName: selectedPackage ? selectedPackage.name : String(fd.get("package_name") || ""),
          packagesAvailable: hasPackages,
          salesStaffId: String(fd.get("sales_staff_id") || ""),
          picStaffId: picRaw || undefined,
          notes: String(fd.get("notes") || ""),
          fulfillmentPath: String(fd.get("fulfillment_path") || ""),
          fulfillmentAvailable,
          purchaseAmountRaw: String(fd.get("partner_purchase_amount") || ""),
          shippingAddress: String(fd.get("shipping_address") || ""),
          clientRequestId: rid,
        }),
      lookup: () => lookupOrderRequestId(rid),
    });

    async function withInvoice(orderId: string) {
      if (invoiceFile instanceof File && invoiceFile.size > 0) {
        setInvoiceMsg(await unggahInvoice(m, orderId, invoiceFile));
      }
    }

    if (out.status === "confirmed") {
      const summary = await getOrderSummary(out.id);
      draft.clear();
      requestIdRef.current = null;
      if (summary.status === "found") {
        await withInvoice(out.id);
        await applyCalcHandoffIfNeeded(out.id);
        setOrderResult({ ...summary.order, customerId: foundCustomer?.id ?? "" });
        setPhase("order_success");
      } else {
        setNetMsg(m.cabang.errOrderUnknownAfterConfirm);
        release();
      }
      return;
    }
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
    if ("partial" in res) {
      // Pelanggan tersimpan, order gagal — jangan pura-pura sukses (SPEC §70).
      release();
      setPartialMsg(res.partial.message);
      setSelectedExisting(true);
      setFoundCustomer({ id: res.partial.customerId, full_name: res.partial.customerName, phone: res.partial.customerPhone });
      setLookupState("found");
      return;
    }
    // res.data
    draft.clear();
    requestIdRef.current = null;
    await withInvoice(res.data.id);
    await applyCalcHandoffIfNeeded(res.data.id);
    setOrderResult(res.data);
    setPhase("order_success");
  }

  if (phase === "order_success" && orderResult) {
    return (
      <div className="card">
        <div className="banner ok">{m.cabang.orderCreatedBanner}</div>
        {invoiceMsg && <div className="banner warn">{invoiceMsg}</div>}
        {orderResult.itemsCopyWarning && <div className="banner warn">{orderResult.itemsCopyWarning}</div>}
        {calcOutcomeMsg && (
          <div className={`banner ${calcOutcomeMsg.ok ? "ok" : "warn"}`}>{calcOutcomeMsg.text}</div>
        )}
        <dl className="kv">
          <dt>{m.common.orderNumber}</dt>
          <dd className="code">{orderResult.orderNumber}</dd>
          <dt>{m.common.status}</dt>
          <dd>
            <StatusBadge status={orderResult.status} messages={m} />
          </dd>
          <dt>{m.common.customer}</dt>
          <dd>{orderResult.customerName}</dd>
          <dt>{m.common.phone}</dt>
          <dd>{displayPhoneID(orderResult.customerPhone)}</dd>
          <dt>{m.common.package}</dt>
          <dd>{orderResult.packageName}</dd>
        </dl>
        <div className="btnrow">
          <Link href="/cabang/pesanan" className="btn">
            {m.cabang.homeOrders}
          </Link>
          <button type="button" className="btn primary" onClick={resetFormForNext}>
            {m.cabang.newOrderAgainCta}
          </button>
        </div>
      </div>
    );
  }

  if (phase === "customer_success" && customerResult) {
    return (
      <div className="card">
        <div className="banner ok">{m.cabang.customerSavedBanner}</div>
        <dl className="kv">
          <dt>{m.common.name}</dt>
          <dd>{customerResult.full_name}</dd>
          <dt>{m.common.phone}</dt>
          <dd>{customerResult.phone}</dd>
        </dl>
        <p className="hint">{m.cabang.newCustomerNoOrdersHint}</p>
        <div className="btnrow">
          <Link href="/cabang/pesanan" className="btn">
            {m.cabang.homeOrders}
          </Link>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              setPhase("form");
              setSelectedExisting(true);
              setFoundCustomer(customerResult);
              setLookupState("found");
              setPhone(customerResult.phone);
              requestIdRef.current = crypto.randomUUID();
            }}
          >
            {m.cabang.newOrderForCustomerCta}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      {netMsg && <div className="banner warn">{netMsg}</div>}
      {partialMsg && <div className="banner bad">{partialMsg}</div>}
      {errs._form && <div className="banner bad">{errs._form}</div>}
      <DraftBanner draft={draft.draft} onRestore={handleRestoreDraft} onDiscard={draft.discard} />

      {calcHandoff && !calcApply && (
        <div className="banner info">
          {m.cabang.calcHandoffBanner
            .replace("{n}", String(calcHandoff.itemQty))
            .replace("{subtotal}", formatIDR(calcHandoff.subtotal))
            .replace("{final}", formatIDR(calcHandoff.finalAmount))}
          <p className="small muted" style={{ marginTop: 6, marginBottom: 0 }}>
            {m.cabang.calcHandoffScopeHint}
          </p>
          <div className="btnrow-inline">
            <button type="button" className="btn sm primary" onClick={handleUseCalcHandoff}>
              {m.cabang.calcHandoffApplyCta}
            </button>
            <button type="button" className="btn sm" onClick={handleDismissCalcHandoff}>
              {m.cabang.calcHandoffDismissCta}
            </button>
          </div>
        </div>
      )}

      <form ref={draft.formRef} onInput={draft.onInput} onChange={draft.onInput}>
        <h3 style={{ fontSize: "var(--fs-h3)", marginBottom: 10 }}>{m.common.customer}</h3>
        <div className={`field${errs.phone ? " invalid" : ""}`}>
          <label htmlFor="po_phone">{m.cabang.phoneWhatsappLabel}</label>
          <input
            id="po_phone"
            name="phone"
            type="tel"
            inputMode="tel"
            placeholder="0812 3456 7890"
            defaultValue=""
            onChange={handlePhoneChange}
            disabled={selectedExisting}
          />
          {lookupState === "checking" && <div className="hint">{m.cabang.checkingCustomer}</div>}
          {lookupState === "error" && (
            <div className="banner bad" style={{ marginTop: 8, marginBottom: 0 }}>
              {m.cabang.errCustomerCheckFailed}
              <div className="btnrow-inline">
                <button type="button" className="btn sm" onClick={() => runSearch(phone)}>
                  {m.common.retry}
                </button>
              </div>
            </div>
          )}
          {errs.phone && <div className="err-text">{errs.phone}</div>}
        </div>

        {lookupState === "found" && !selectedExisting && foundCustomer && (
          <div className="banner info">
            {m.cabang.customerFoundPrefix} <b>{foundCustomer.full_name}</b> · {foundCustomer.phone}
            <div className="btnrow-inline">
              <button type="button" className="btn sm primary" onClick={handleUseExisting}>
                {m.cabang.useThisCustomerCta}
              </button>
            </div>
          </div>
        )}

        {selectedExisting && foundCustomer && (
          <div className="banner info">
            {m.cabang.customerSelectedPrefix} <b>{foundCustomer.full_name}</b> · {foundCustomer.phone}
            <div className="btnrow-inline">
              <button type="button" className="btn sm" onClick={handleChangeCustomer}>
                {m.cabang.changeCustomerCta}
              </button>
            </div>
          </div>
        )}

        <div className={`field${errs.full_name ? " invalid" : ""}`} style={{ display: selectedExisting ? "none" : undefined }}>
          <label htmlFor="po_name">{m.common.fullName} *</label>
          <input id="po_name" name="full_name" type="text" defaultValue="" disabled={selectedExisting} />
          {errs.full_name && <div className="err-text">{errs.full_name}</div>}
          {lookupState === "not_found" && !errs.full_name && (
            <div className="hint">{m.cabang.newCustomerHint}</div>
          )}
        </div>

        <fieldset disabled={!customerReady} style={{ border: "none", padding: 0, margin: "18px 0 0", opacity: customerReady ? 1 : 0.5 }}>
          <legend style={{ fontSize: "var(--fs-h3)", fontWeight: 650, marginBottom: 10, padding: 0 }}>{m.common.order}</legend>
          {!customerReady && (
            <p className="hint" style={{ marginBottom: 12 }}>
              {m.cabang.orderSectionLockedHint}
            </p>
          )}

          {fulfillmentAvailable && (
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: "block", fontSize: "var(--fs-sec)", fontWeight: 600, color: "var(--ink)", marginBottom: 7 }}>
                {m.common.fulfillment} *
              </label>
              <div className="radioset">
                {FULFILLMENT_PATHS.map((p) => (
                  <label key={p}>
                    <input type="radio" name="fulfillment_path" value={p} defaultChecked={false} />
                    <span>
                      {fulfillmentLabel(m, p)}
                      <div className="rd">{fulfillmentDesc(m, p)}</div>
                    </span>
                  </label>
                ))}
              </div>
              {errs.fulfillment_path && <div className="err-text">{errs.fulfillment_path}</div>}
            </div>
          )}

          <div className="field">
            <label htmlFor="po_amount">{m.cabang.purchaseAmountLabel}</label>
            <input
              id="po_amount"
              name="partner_purchase_amount"
              type="text"
              inputMode="numeric"
              placeholder="Rp 0"
              defaultValue=""
              onChange={handleAmountChange}
            />
            {errs.partner_purchase_amount && <div className="err-text">{errs.partner_purchase_amount}</div>}
            <div className="hint">{m.cabang.purchaseAmountHint}</div>
          </div>

          {hasPackages ? (
            <div className={`field${errs.package_name ? " invalid" : ""}`}>
              <label htmlFor="po_package_id">{m.cabang.packageFieldLabel}</label>
              <select
                id="po_package_id"
                name="package_id"
                defaultValue=""
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
              <label htmlFor="po_package">{m.cabang.packageNameFieldLabel}</label>
              <input id="po_package" name="package_name" type="text" defaultValue="" />
              {!hasPackages && packagesLoadError && (
                <div className="hint">{m.cabang.packageLoadErrorHint}</div>
              )}
              {!hasPackages && errs.package_name && <div className="err-text">{errs.package_name}</div>}
            </div>
          )}
          <div className={`field${errs.sales_staff_id ? " invalid" : ""}`}>
            <label htmlFor="po_sales">{m.cabang.salesFieldLabel}</label>
            <select id="po_sales" name="sales_staff_id" defaultValue="">
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
            <label htmlFor="po_pic">{m.cabang.picLabel}</label>
            <select id="po_pic" name="pic_staff_id" defaultValue="">
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
            <label htmlFor="po_shipping_address">{m.cabang.shippingAddressFieldLabel}</label>
            <textarea
              id="po_shipping_address"
              name="shipping_address"
              defaultValue=""
              placeholder={m.cabang.optionalPlaceholder}
            />
            <div className="hint">{m.cabang.shippingAddressHint}</div>
          </div>

          <div className="field">
            <label htmlFor="po_notes">{m.common.notes}</label>
            <textarea id="po_notes" name="notes" defaultValue="" placeholder={m.cabang.optionalPlaceholder} />
          </div>

          <div className="field">
            <label htmlFor="po_invoice">{m.cabang.invoiceFieldLabel}</label>
            <input id="po_invoice" name="invoice" type="file" accept={INVOICE_ACCEPT} />
            <div className="hint">{m.cabang.invoiceFieldHint}</div>
          </div>
        </fieldset>

        <div className="btnrow">
          {!selectedExisting && (
            <button
              type="button"
              className="btn"
              disabled={submitting || !customerReady}
              onClick={onSubmitCustomerOnly}
            >
              {submitting ? m.common.saving : m.cabang.saveCustomerOnlyCta}
            </button>
          )}
          <button type="button" className="btn primary lg block" disabled={submitting || !customerReady} onClick={onSubmitOrder}>
            {submitting ? m.common.saving : m.cabang.createOrderCta}
          </button>
        </div>
      </form>
    </div>
  );
}
