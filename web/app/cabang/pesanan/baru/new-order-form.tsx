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
  FULFILLMENT_PATH_DESC,
  FULFILLMENT_PATH_LABEL,
  type FulfillmentPath,
} from "@/lib/orders-shared";
import {
  createCustomerAndOrder,
  createCustomerOnly,
  getOrderSummary,
  lookupCustomerRequestId,
  lookupOrderRequestId,
  searchCustomerByPhone,
  type OrderCreated,
} from "../actions";
import { INVOICE_ACCEPT, unggahInvoice } from "../invoice-upload";
import StatusBadge from "../status-badge";

type StaffOption = { id: string; fullName: string; role: string };
export type PackageOption = { id: string; name: string };
type FoundCustomer = { id: string; full_name: string; phone: string };
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

  function handleUseExisting() {
    if (!foundCustomer) return;
    setSelectedExisting(true);
    setErrs({});
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
    const out = await submitSafely({
      run: () =>
        createCustomerOnly({
          fullName: String(fd.get("full_name") || ""),
          phone,
          notes: String(fd.get("notes") || ""),
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
          clientRequestId: rid,
        }),
      lookup: () => lookupOrderRequestId(rid),
    });

    async function withInvoice(orderId: string) {
      if (invoiceFile instanceof File && invoiceFile.size > 0) {
        setInvoiceMsg(await unggahInvoice(orderId, invoiceFile));
      }
    }

    if (out.status === "confirmed") {
      const summary = await getOrderSummary(out.id);
      draft.clear();
      requestIdRef.current = null;
      if (summary.status === "found") {
        await withInvoice(out.id);
        setOrderResult({ ...summary.order, customerId: foundCustomer?.id ?? "" });
        setPhase("order_success");
      } else {
        setNetMsg("Pesanan kemungkinan sudah tersimpan, tapi rinciannya belum bisa dimuat. Buka Daftar Pesanan.");
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
    setOrderResult(res.data);
    setPhase("order_success");
  }

  if (phase === "order_success" && orderResult) {
    return (
      <div className="card">
        <div className="banner ok">Pesanan berhasil dibuat.</div>
        {invoiceMsg && <div className="banner warn">{invoiceMsg}</div>}
        <dl className="kv">
          <dt>Nomor Order</dt>
          <dd className="code">{orderResult.orderNumber}</dd>
          <dt>Status</dt>
          <dd>
            <StatusBadge status={orderResult.status} />
          </dd>
          <dt>Pelanggan</dt>
          <dd>{orderResult.customerName}</dd>
          <dt>Telepon</dt>
          <dd>{displayPhoneID(orderResult.customerPhone)}</dd>
          <dt>Package</dt>
          <dd>{orderResult.packageName}</dd>
        </dl>
        <div className="btnrow">
          <Link href="/cabang/pesanan" className="btn">
            Daftar Pesanan
          </Link>
          <button type="button" className="btn primary" onClick={resetFormForNext}>
            Buat Pesanan Lagi
          </button>
        </div>
      </div>
    );
  }

  if (phase === "customer_success" && customerResult) {
    return (
      <div className="card">
        <div className="banner ok">Pelanggan berhasil disimpan.</div>
        <dl className="kv">
          <dt>Nama</dt>
          <dd>{customerResult.full_name}</dd>
          <dt>Telepon</dt>
          <dd>{customerResult.phone}</dd>
        </dl>
        <p className="hint">Belum ada pesanan untuk pelanggan ini. Anda bisa membuat pesanan sekarang.</p>
        <div className="btnrow">
          <Link href="/cabang/pesanan" className="btn">
            Daftar Pesanan
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
            Buat Pesanan untuk Pelanggan Ini
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

      <form ref={draft.formRef} onInput={draft.onInput} onChange={draft.onInput}>
        <h3 style={{ fontSize: "var(--fs-h3)", marginBottom: 10 }}>Pelanggan</h3>
        <div className={`field${errs.phone ? " invalid" : ""}`}>
          <label htmlFor="po_phone">Nomor HP / WhatsApp *</label>
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
          {lookupState === "checking" && <div className="hint">Memeriksa pelanggan…</div>}
          {lookupState === "error" && (
            <div className="banner bad" style={{ marginTop: 8, marginBottom: 0 }}>
              Tidak dapat memeriksa pelanggan — coba lagi.
              <div className="btnrow-inline">
                <button type="button" className="btn sm" onClick={() => runSearch(phone)}>
                  Coba Lagi
                </button>
              </div>
            </div>
          )}
          {errs.phone && <div className="err-text">{errs.phone}</div>}
        </div>

        {lookupState === "found" && !selectedExisting && foundCustomer && (
          <div className="banner info">
            Pelanggan ditemukan: <b>{foundCustomer.full_name}</b> · {foundCustomer.phone}
            <div className="btnrow-inline">
              <button type="button" className="btn sm primary" onClick={handleUseExisting}>
                Gunakan Pelanggan Ini
              </button>
            </div>
          </div>
        )}

        {selectedExisting && foundCustomer && (
          <div className="banner info">
            Pelanggan dipilih: <b>{foundCustomer.full_name}</b> · {foundCustomer.phone}
            <div className="btnrow-inline">
              <button type="button" className="btn sm" onClick={handleChangeCustomer}>
                Ganti Pelanggan
              </button>
            </div>
          </div>
        )}

        <div className={`field${errs.full_name ? " invalid" : ""}`} style={{ display: selectedExisting ? "none" : undefined }}>
          <label htmlFor="po_name">Nama Lengkap *</label>
          <input id="po_name" name="full_name" type="text" defaultValue="" disabled={selectedExisting} />
          {errs.full_name && <div className="err-text">{errs.full_name}</div>}
          {lookupState === "not_found" && !errs.full_name && (
            <div className="hint">Belum ada pelanggan dengan nomor ini — isi nama untuk membuat baru.</div>
          )}
        </div>

        <fieldset disabled={!customerReady} style={{ border: "none", padding: 0, margin: "18px 0 0", opacity: customerReady ? 1 : 0.5 }}>
          <legend style={{ fontSize: "var(--fs-h3)", fontWeight: 650, marginBottom: 10, padding: 0 }}>Pesanan</legend>
          {!customerReady && (
            <p className="hint" style={{ marginBottom: 12 }}>
              Isi atau pastikan dulu data pelanggan di atas untuk mengisi bagian ini.
            </p>
          )}

          {fulfillmentAvailable && (
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: "block", fontSize: "var(--fs-sec)", fontWeight: 600, color: "var(--ink)", marginBottom: 7 }}>
                Jalur Pesanan *
              </label>
              <div className="radioset">
                {FULFILLMENT_PATHS.map((p) => (
                  <label key={p}>
                    <input type="radio" name="fulfillment_path" value={p} defaultChecked={false} />
                    <span>
                      {FULFILLMENT_PATH_LABEL[p]}
                      <div className="rd">{FULFILLMENT_PATH_DESC[p]}</div>
                    </span>
                  </label>
                ))}
              </div>
              {errs.fulfillment_path && <div className="err-text">{errs.fulfillment_path}</div>}
            </div>
          )}

          <div className="field">
            <label htmlFor="po_amount">Total belanja pelanggan di toko (opsional)</label>
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
            <div className="hint">Membantu SANCI menyiapkan penawaran yang sesuai.</div>
          </div>

          {hasPackages ? (
            <div className={`field${errs.package_name ? " invalid" : ""}`}>
              <label htmlFor="po_package_id">Package *</label>
              <select
                id="po_package_id"
                name="package_id"
                defaultValue=""
                onChange={(e) => setPackageChoice(e.target.value)}
              >
                <option value="">— Pilih Package —</option>
                {packages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
                <option value={PACKAGE_MANUAL}>Lainnya (ketik manual)</option>
              </select>
              {errs.package_name && <div className="err-text">{errs.package_name}</div>}
            </div>
          ) : null}
          {(!hasPackages || packageChoice === PACKAGE_MANUAL) && (
            <div className={`field${!hasPackages && errs.package_name ? " invalid" : ""}`}>
              <label htmlFor="po_package">Nama Package *</label>
              <input id="po_package" name="package_name" type="text" defaultValue="" />
              {!hasPackages && packagesLoadError && (
                <div className="hint">Daftar package gagal dimuat — ketik manual.</div>
              )}
              {!hasPackages && errs.package_name && <div className="err-text">{errs.package_name}</div>}
            </div>
          )}
          <div className={`field${errs.sales_staff_id ? " invalid" : ""}`}>
            <label htmlFor="po_sales">Sales *</label>
            <select id="po_sales" name="sales_staff_id" defaultValue="">
              <option value="">— Pilih Sales —</option>
              {salesOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName} ({s.role})
                </option>
              ))}
            </select>
            {salesOptions.length === 0 && <div className="hint">Belum ada staf aktif di cabang ini.</div>}
            {errs.sales_staff_id && <div className="err-text">{errs.sales_staff_id}</div>}
          </div>
          <div className={`field${errs.pic_staff_id ? " invalid" : ""}`}>
            <label htmlFor="po_pic">PIC</label>
            <select id="po_pic" name="pic_staff_id" defaultValue="">
              <option value="">— Tidak dipilih —</option>
              {picOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName} ({s.role})
                </option>
              ))}
            </select>
            {errs.pic_staff_id && <div className="err-text">{errs.pic_staff_id}</div>}
          </div>
          <div className="field">
            <label htmlFor="po_notes">Catatan</label>
            <textarea id="po_notes" name="notes" defaultValue="" placeholder="Opsional..." />
          </div>

          <div className="field">
            <label htmlFor="po_invoice">Foto/PDF Invoice (opsional)</label>
            <input id="po_invoice" name="invoice" type="file" accept={INVOICE_ACCEPT} />
            <div className="hint">
              PNG, JPG, WebP, atau PDF. Maksimal 5 MB — gambar diperkecil otomatis sebelum dikirim.
              Diunggah setelah pesanan berhasil dibuat.
            </div>
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
              {submitting ? "Menyimpan…" : "Simpan Pelanggan Saja"}
            </button>
          )}
          <button type="button" className="btn primary lg block" disabled={submitting || !customerReady} onClick={onSubmitOrder}>
            {submitting ? "Menyimpan…" : "Buat Pesanan"}
          </button>
        </div>
      </form>
    </div>
  );
}
