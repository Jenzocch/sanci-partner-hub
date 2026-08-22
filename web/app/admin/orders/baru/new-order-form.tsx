"use client";

/**
 * Form "Buat Pesanan" sisi admin — CERMIN SEMANTIK form cabang
 * (web/app/cabang/pesanan/baru/new-order-form.tsx): alur telepon-dulu untuk
 * dedupe pelanggan, package dropdown + fallback ketik manual, Sales/PIC dari
 * staf cabang, jalur pesanan wajib, invoice diunggah PALING AKHIR dan
 * kegagalannya tidak membatalkan pesanan.
 *
 * Tambahan khas admin: pilih Partner → pilih Cabang di paling atas. Ganti
 * partner MENGOSONGKAN cabang + package + staf (semua turunannya); ganti
 * cabang mengosongkan staf. Data turunannya dimuat lewat Server Action saat
 * pilihan berubah, dengan status error + tombol coba lagi yang eksplisit —
 * bukan dibiarkan tampak seperti "kosong" (LESSONS #10).
 *
 * TANPA draf lokal (beda sadar dari form cabang): nilai-nilai kunci form ini
 * adalah pilihan berantai (partner → cabang → staf/package) yang opsinya
 * dimuat ulang tiap kali — draf yang dipulihkan setengah (teks kembali,
 * pilihan tidak) lebih menyesatkan daripada tidak ada draf. Dicatat sebagai
 * batas v1 di FEATURES.md.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { submitSafely } from "@/lib/safe-write";
import {
  ORDER_STATUS_CHIP,
  displayPhoneID,
  formatIDR,
  parseIDRInput,
  fulfillmentDesc,
  fulfillmentLabel,
  orderStatusLabel,
  type FulfillmentPath,
} from "@/lib/orders-shared";
import { useAdminMessages } from "@/lib/i18n/provider";
import { lookupByRequestId } from "../../actions-lookup";
import {
  createOrderForBranch,
  getBranchStaffOptions,
  getOrderSummaryAdmin,
  getPartnerOrderOptions,
  searchCustomerByPhoneAdmin,
  type AdminOrderCreated,
  type BranchOption,
  type PackageOption,
  type StaffOption,
} from "../../actions-create-order";
import { INVOICE_ACCEPT, unggahInvoiceAdmin } from "./invoice-upload-admin";

type PartnerOption = { id: string; name: string };
type FoundCustomer = {
  id: string;
  full_name: string;
  phone: string;
  address?: string | null;
  city?: string | null;
  province?: string | null;
};
type LookupState = "idle" | "checking" | "found" | "not_found" | "invalid" | "error";
type FetchState = "idle" | "loading" | "error" | "ready";

const SEARCH_DEBOUNCE_MS = 600;
/** Value <option> khusus untuk "Lainnya (ketik manual)" — bukan id package sungguhan. */
const PACKAGE_MANUAL = "__manual__";
const FULFILLMENT_PATHS: FulfillmentPath[] = ["DIRECT_DELIVERY", "SHOWROOM_VISIT"];

export default function NewAdminOrderForm({ partners }: { partners: PartnerOption[] }) {
  const m = useAdminMessages();
  const { submitting, begin, release, reset } = useSubmitGuard();
  const formRef = useRef<HTMLFormElement | null>(null);

  // ── Partner → Cabang → (packages, staf) ──
  const [partnerId, setPartnerId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [packages, setPackages] = useState<PackageOption[]>([]);
  const [optionsState, setOptionsState] = useState<FetchState>("idle");
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [staffState, setStaffState] = useState<FetchState>("idle");
  const optionsTokenRef = useRef(0);
  const staffTokenRef = useRef(0);

  // ── Pelanggan (telepon-dulu, mirror cabang) ──
  const [phone, setPhone] = useState("");
  const [lookupState, setLookupState] = useState<LookupState>("idle");
  const [foundCustomer, setFoundCustomer] = useState<FoundCustomer | null>(null);
  const [selectedExisting, setSelectedExisting] = useState(false);
  const searchTokenRef = useRef(0);

  // ── Field pesanan yang harus di-reset berantai → controlled ──
  const [packageChoice, setPackageChoice] = useState("");
  const [salesStaffId, setSalesStaffId] = useState("");
  const [picStaffId, setPicStaffId] = useState("");

  const [errs, setErrs] = useState<Record<string, string>>({});
  const [netMsg, setNetMsg] = useState<string | null>(null);
  const [partialMsg, setPartialMsg] = useState<string | null>(null);
  const [invoiceMsg, setInvoiceMsg] = useState<string | null>(null);
  const [phase, setPhase] = useState<"form" | "order_success">("form");
  const [orderResult, setOrderResult] = useState<AdminOrderCreated | null>(null);

  const requestIdRef = useRef<string | null>(null);
  if (!requestIdRef.current) requestIdRef.current = crypto.randomUUID();

  const hasPackages = packages.length > 0;
  const salesOptions = [...staffOptions].sort((a, b) => (a.role === "Sales" ? -1 : b.role === "Sales" ? 1 : 0));
  const picOptions = [...staffOptions].sort((a, b) => {
    const rank = (r: string) => (r === "Resepsionis / CS" ? 0 : r === "Manajer" ? 1 : 2);
    return rank(a.role) - rank(b.role);
  });

  /** Muat cabang + package milik partner terpilih. Token menolak respons basi. */
  const loadPartnerOptions = useCallback((pid: string) => {
    const token = ++optionsTokenRef.current;
    if (!pid) {
      setOptionsState("idle");
      setBranches([]);
      setPackages([]);
      return;
    }
    setOptionsState("loading");
    getPartnerOrderOptions(pid)
      .then((res) => {
        if (optionsTokenRef.current !== token) return;
        if ("error" in res) {
          setOptionsState("error");
          return;
        }
        setBranches(res.data.branches);
        setPackages(res.data.packages);
        setOptionsState("ready");
      })
      .catch(() => {
        if (optionsTokenRef.current === token) setOptionsState("error");
      });
  }, []);

  /** Muat staf cabang terpilih. */
  const loadStaff = useCallback((pid: string, bid: string) => {
    const token = ++staffTokenRef.current;
    if (!pid || !bid) {
      setStaffState("idle");
      setStaffOptions([]);
      return;
    }
    setStaffState("loading");
    getBranchStaffOptions(pid, bid)
      .then((res) => {
        if (staffTokenRef.current !== token) return;
        if ("error" in res) {
          setStaffState("error");
          return;
        }
        setStaffOptions(res.data.staff);
        setStaffState("ready");
      })
      .catch(() => {
        if (staffTokenRef.current === token) setStaffState("error");
      });
  }, []);

  function handlePartnerChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const pid = e.target.value;
    setPartnerId(pid);
    // Ganti partner = SEMUA turunannya ikut kosong (cabang, package, staf).
    setBranchId("");
    setPackageChoice("");
    setSalesStaffId("");
    setPicStaffId("");
    setStaffOptions([]);
    setStaffState("idle");
    loadPartnerOptions(pid);
  }

  function handleBranchChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const bid = e.target.value;
    setBranchId(bid);
    setSalesStaffId("");
    setPicStaffId("");
    loadStaff(partnerId, bid);
  }

  const runSearch = useCallback((raw: string) => {
    const token = ++searchTokenRef.current;
    if (!raw.trim()) {
      setLookupState("idle");
      setFoundCustomer(null);
      return;
    }
    setLookupState("checking");
    searchCustomerByPhoneAdmin(raw)
      .then((res) => {
        if (searchTokenRef.current !== token) return; // respons basi
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
          // Kegagalan pemeriksaan TIDAK ditampilkan sebagai "tidak ditemukan"
          // — bisa memicu pelanggan ganda (SPEC §84).
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

  useEffect(() => {
    if (selectedExisting) return;
    const timer = setTimeout(() => runSearch(phone), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [phone, selectedExisting, runSearch]);

  /** Format Rupiah langsung saat mengetik — sama seperti form cabang. */
  function handleAmountChange(e: React.ChangeEvent<HTMLInputElement>) {
    const n = parseIDRInput(e.target.value);
    e.target.value = n === null ? "" : formatIDR(n);
  }

  function setFieldValue(name: string, value: string) {
    const el = formRef.current?.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null;
    if (el) el.value = value;
  }

  /** Prefill alamat kirim dari alamat pelanggan — hanya kalau masih kosong (LESSONS #1). */
  function prefillShippingAddress(c: FoundCustomer) {
    const el = formRef.current?.elements.namedItem("shipping_address") as HTMLTextAreaElement | null;
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
    setSelectedExisting(false);
    setFoundCustomer(null);
    setLookupState("idle");
    setPhone("");
    setPackageChoice("");
    setSalesStaffId("");
    setPicStaffId("");
    setErrs({});
    setNetMsg(null);
    setPartialMsg(null);
    setInvoiceMsg(null);
    requestIdRef.current = crypto.randomUUID();
    // Partner/cabang SENGAJA dipertahankan — admin yang membuat beberapa
    // pesanan untuk cabang yang sama tidak perlu memilih ulang dari nol.
    const form = formRef.current;
    if (form) form.reset();
  }

  const customerReady = selectedExisting || lookupState === "not_found" || lookupState === "invalid";
  const orderSectionReady = !!partnerId && !!branchId && customerReady;

  async function onSubmitOrder() {
    if (!begin()) return;
    setErrs({});
    setNetMsg(null);
    setPartialMsg(null);
    setInvoiceMsg(null);
    const form = formRef.current;
    if (!form) {
      release();
      return;
    }
    const fd = new FormData(form);
    const rid = requestIdRef.current!;
    const selectedPackage =
      hasPackages && packageChoice && packageChoice !== PACKAGE_MANUAL
        ? packages.find((p) => p.id === packageChoice)
        : undefined;
    // Berkas invoice diunggah TERPISAH sesudah order berhasil dibuat — tidak
    // pernah ikut membatalkan pembuatan order kalau gagal.
    const invoiceFile = fd.get("invoice");

    const out = await submitSafely({
      messages: m,
      run: () =>
        createOrderForBranch({
          partnerId,
          branchId,
          customerId: selectedExisting && foundCustomer ? foundCustomer.id : undefined,
          fullName: selectedExisting ? undefined : String(fd.get("full_name") || ""),
          phone: selectedExisting ? undefined : phone,
          packageId: selectedPackage?.id,
          packageName: selectedPackage ? selectedPackage.name : String(fd.get("package_name") || ""),
          packagesAvailable: hasPackages,
          salesStaffId,
          picStaffId: picStaffId || undefined,
          notes: String(fd.get("notes") || ""),
          fulfillmentPath: String(fd.get("fulfillment_path") || ""),
          purchaseAmountRaw: String(fd.get("partner_purchase_amount") || ""),
          shippingAddress: String(fd.get("shipping_address") || ""),
          clientRequestId: rid,
        }),
      // Sufiks `:order` SAMA dengan yang ditulis createOrderForBranch.
      lookup: () => lookupByRequestId("order", `${rid}:order`),
    });

    async function withInvoice(orderId: string) {
      if (invoiceFile instanceof File && invoiceFile.size > 0) {
        setInvoiceMsg(await unggahInvoiceAdmin(m, orderId, invoiceFile));
      }
    }

    if (out.status === "confirmed") {
      // Respons hilang tapi lookup membuktikan pesanan masuk — ambil
      // ringkasannya lewat SELECT terpisah sebelum menyebut sukses (SPEC §68).
      const summary = await getOrderSummaryAdmin(out.id);
      requestIdRef.current = null;
      if (summary.status === "found") {
        await withInvoice(out.id);
        setOrderResult({ ...summary.order, customerId: foundCustomer?.id ?? "" });
        setPhase("order_success");
      } else {
        setNetMsg(m.admin.orderCreateUnknownAfterConfirm);
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
      setFoundCustomer({
        id: res.partial.customerId,
        full_name: res.partial.customerName,
        phone: res.partial.customerPhone,
      });
      setLookupState("found");
      return;
    }
    requestIdRef.current = null;
    await withInvoice(res.data.id);
    setOrderResult(res.data);
    setPhase("order_success");
  }

  if (phase === "order_success" && orderResult) {
    return (
      <div className="card">
        <div className="banner ok">{m.admin.orderCreateSuccessBanner}</div>
        {invoiceMsg && <div className="banner warn">{invoiceMsg}</div>}
        {orderResult.itemsCopyWarning && <div className="banner warn">{orderResult.itemsCopyWarning}</div>}
        <dl className="kv">
          <dt>{m.common.orderNumber}</dt>
          <dd className="code">{orderResult.orderNumber}</dd>
          <dt>{m.common.status}</dt>
          <dd>
            <span className={ORDER_STATUS_CHIP[orderResult.status]}>{orderStatusLabel(m, orderResult.status)}</span>
          </dd>
          <dt>{m.common.customer}</dt>
          <dd>{orderResult.customerName}</dd>
          <dt>{m.common.phone}</dt>
          <dd>{displayPhoneID(orderResult.customerPhone)}</dd>
          <dt>{m.common.package}</dt>
          <dd>{orderResult.packageName}</dd>
        </dl>
        <div className="btnrow">
          <Link href={`/admin/orders/${orderResult.id}`} className="btn primary">
            {m.admin.orderCreateOpenOrderCta}
          </Link>
          <Link href="/admin/orders" className="btn">
            {m.admin.navOrders}
          </Link>
          <button type="button" className="btn" onClick={resetFormForNext}>
            {m.admin.orderCreateAgainCta}
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

      <form ref={formRef}>
        {/* ── Partner → Cabang ── */}
        <div className={`field${errs.branch_id ? " invalid" : ""}`}>
          <label htmlFor="ao_partner">{m.common.partner} *</label>
          <select id="ao_partner" value={partnerId} onChange={handlePartnerChange}>
            <option value="">{m.admin.orderCreateSelectPartnerPlaceholder}</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {partners.length === 0 && <div className="hint">{m.admin.orderCreateNoActivePartners}</div>}
        </div>

        {partnerId && optionsState === "loading" && <div className="hint">{m.common.loading}</div>}
        {partnerId && optionsState === "error" && (
          <div className="banner bad">
            {m.admin.orderCreateOptionsLoadFailed}
            <div className="btnrow-inline">
              <button type="button" className="btn sm" onClick={() => loadPartnerOptions(partnerId)}>
                {m.common.retry}
              </button>
            </div>
          </div>
        )}
        {partnerId && optionsState === "ready" && (
          <div className={`field${errs.branch_id ? " invalid" : ""}`}>
            <label htmlFor="ao_branch">{m.common.branch} *</label>
            <select id="ao_branch" value={branchId} onChange={handleBranchChange}>
              <option value="">{m.admin.orderCreateSelectBranchPlaceholder}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            {branches.length === 0 && <div className="hint">{m.admin.orderCreateNoActiveBranches}</div>}
            {errs.branch_id && <div className="err-text">{errs.branch_id}</div>}
          </div>
        )}

        {/* ── Pelanggan (telepon-dulu, mirror cabang) ── */}
        <h3 style={{ fontSize: "var(--fs-h3)", margin: "18px 0 10px" }}>{m.common.customer}</h3>
        <div className={`field${errs.phone ? " invalid" : ""}`}>
          <label htmlFor="ao_phone">{m.admin.orderCreatePhoneLabel}</label>
          <input
            id="ao_phone"
            name="phone"
            type="tel"
            inputMode="tel"
            placeholder="0812 3456 7890"
            defaultValue=""
            onChange={(e) => setPhone(e.target.value)}
            disabled={selectedExisting}
          />
          {lookupState === "checking" && <div className="hint">{m.admin.orderCreateChecking}</div>}
          {lookupState === "error" && (
            <div className="banner bad" style={{ marginTop: 8, marginBottom: 0 }}>
              {m.admin.orderCreateCheckFailed}
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
            {m.admin.orderCreateCustomerFoundPrefix} <b>{foundCustomer.full_name}</b> · {foundCustomer.phone}
            <div className="btnrow-inline">
              <button type="button" className="btn sm primary" onClick={handleUseExisting}>
                {m.admin.orderCreateUseCustomerCta}
              </button>
            </div>
          </div>
        )}

        {selectedExisting && foundCustomer && (
          <div className="banner info">
            {m.admin.orderCreateCustomerSelectedPrefix} <b>{foundCustomer.full_name}</b> · {foundCustomer.phone}
            <div className="btnrow-inline">
              <button type="button" className="btn sm" onClick={handleChangeCustomer}>
                {m.admin.orderCreateChangeCustomerCta}
              </button>
            </div>
          </div>
        )}

        <div
          className={`field${errs.full_name ? " invalid" : ""}`}
          style={{ display: selectedExisting ? "none" : undefined }}
        >
          <label htmlFor="ao_name">{m.common.fullName} *</label>
          <input id="ao_name" name="full_name" type="text" defaultValue="" disabled={selectedExisting} />
          {errs.full_name && <div className="err-text">{errs.full_name}</div>}
          {lookupState === "not_found" && !errs.full_name && (
            <div className="hint">{m.admin.orderCreateNewCustomerHint}</div>
          )}
        </div>

        {/* ── Pesanan ── */}
        <fieldset
          disabled={!orderSectionReady}
          style={{ border: "none", padding: 0, margin: "18px 0 0", opacity: orderSectionReady ? 1 : 0.5 }}
        >
          <legend style={{ fontSize: "var(--fs-h3)", fontWeight: 650, marginBottom: 10, padding: 0 }}>
            {m.common.order}
          </legend>
          {!orderSectionReady && (
            <p className="hint" style={{ marginBottom: 12 }}>
              {m.admin.orderCreateSectionLockedHint}
            </p>
          )}

          <div style={{ marginBottom: 18 }}>
            <label
              style={{
                display: "block",
                fontSize: "var(--fs-sec)",
                fontWeight: 600,
                color: "var(--ink)",
                marginBottom: 7,
              }}
            >
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

          <div className="field">
            <label htmlFor="ao_amount">{m.admin.orderCreateAmountLabel}</label>
            <input
              id="ao_amount"
              name="partner_purchase_amount"
              type="text"
              inputMode="numeric"
              placeholder="Rp 0"
              defaultValue=""
              onChange={handleAmountChange}
            />
            {errs.partner_purchase_amount && <div className="err-text">{errs.partner_purchase_amount}</div>}
            <div className="hint">{m.admin.orderCreateAmountHint}</div>
          </div>

          {hasPackages ? (
            <div className={`field${errs.package_name ? " invalid" : ""}`}>
              <label htmlFor="ao_package_id">{m.admin.orderCreatePackageFieldLabel}</label>
              <select id="ao_package_id" value={packageChoice} onChange={(e) => setPackageChoice(e.target.value)}>
                <option value="">{m.admin.orderCreateSelectPackagePlaceholder}</option>
                {packages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
                <option value={PACKAGE_MANUAL}>{m.admin.orderCreatePackageManualOption}</option>
              </select>
              {errs.package_name && <div className="err-text">{errs.package_name}</div>}
            </div>
          ) : null}
          {(!hasPackages || packageChoice === PACKAGE_MANUAL) && (
            <div className={`field${!hasPackages && errs.package_name ? " invalid" : ""}`}>
              <label htmlFor="ao_package">{m.admin.orderCreatePackageNameFieldLabel}</label>
              <input id="ao_package" name="package_name" type="text" defaultValue="" />
              {!hasPackages && errs.package_name && <div className="err-text">{errs.package_name}</div>}
            </div>
          )}

          {staffState === "loading" && <div className="hint">{m.common.loading}</div>}
          {staffState === "error" && (
            <div className="banner bad">
              {m.admin.orderCreateStaffLoadFailed}
              <div className="btnrow-inline">
                <button type="button" className="btn sm" onClick={() => loadStaff(partnerId, branchId)}>
                  {m.common.retry}
                </button>
              </div>
            </div>
          )}
          <div className={`field${errs.sales_staff_id ? " invalid" : ""}`}>
            <label htmlFor="ao_sales">{m.admin.orderCreateSalesFieldLabel}</label>
            <select id="ao_sales" value={salesStaffId} onChange={(e) => setSalesStaffId(e.target.value)}>
              <option value="">{m.admin.orderCreateSelectSalesPlaceholder}</option>
              {salesOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName} ({s.role})
                </option>
              ))}
            </select>
            {staffState === "ready" && salesOptions.length === 0 && (
              <div className="hint">{m.admin.orderCreateNoActiveStaffHint}</div>
            )}
            {errs.sales_staff_id && <div className="err-text">{errs.sales_staff_id}</div>}
          </div>
          <div className={`field${errs.pic_staff_id ? " invalid" : ""}`}>
            <label htmlFor="ao_pic">{m.admin.orderCreatePicLabel}</label>
            <select id="ao_pic" value={picStaffId} onChange={(e) => setPicStaffId(e.target.value)}>
              <option value="">{m.admin.orderCreateNotSelectedOption}</option>
              {picOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName} ({s.role})
                </option>
              ))}
            </select>
            {errs.pic_staff_id && <div className="err-text">{errs.pic_staff_id}</div>}
          </div>

          <div className="field">
            <label htmlFor="ao_shipping_address">{m.admin.orderCreateShippingLabel}</label>
            <textarea
              id="ao_shipping_address"
              name="shipping_address"
              defaultValue=""
              placeholder={m.admin.orderCreateOptionalPlaceholder}
            />
            <div className="hint">{m.admin.orderCreateShippingHint}</div>
          </div>

          <div className="field">
            <label htmlFor="ao_notes">{m.common.notes}</label>
            <textarea id="ao_notes" name="notes" defaultValue="" placeholder={m.admin.orderCreateOptionalPlaceholder} />
          </div>

          <div className="field">
            <label htmlFor="ao_invoice">{m.admin.orderCreateInvoiceFieldLabel}</label>
            <input id="ao_invoice" name="invoice" type="file" accept={INVOICE_ACCEPT} />
            <div className="hint">{m.admin.orderCreateInvoiceFieldHint}</div>
          </div>
        </fieldset>

        <div className="btnrow">
          <button
            type="button"
            className="btn primary lg block"
            disabled={submitting || !orderSectionReady}
            onClick={onSubmitOrder}
          >
            {submitting ? m.common.saving : m.admin.orderCreateSubmitCta}
          </button>
        </div>
      </form>
    </div>
  );
}
