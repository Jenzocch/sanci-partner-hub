"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { submitSafely } from "@/lib/safe-write";
import { useLocalDraft } from "@/lib/use-local-draft";
import DraftBanner from "@/lib/draft-banner";
import { useAdminMessages } from "@/lib/i18n/provider";
import { createCustomerAdmin } from "../actions-customers";
import { lookupByRequestId } from "../actions-lookup";

type SourceOpt = { id: string; code: string; label: string };
type SalesOpt = { id: string; code: string; name: string };

export default function AddCustomerButton({
  sources,
  sales,
  codeFeatureOn,
}: {
  sources: SourceOpt[];
  sales: SalesOpt[];
  codeFeatureOn: boolean;
}) {
  const router = useRouter();
  const m = useAdminMessages();
  const [open, setOpen] = useState(false);
  const { submitting, begin, release, reset } = useSubmitGuard();
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [netMsg, setNetMsg] = useState<string | null>(null);
  const [generatedCode, setGeneratedCode] = useState<string | null | undefined>(undefined);
  const requestId = useRef<string | null>(null);
  const draft = useLocalDraft("customer-admin", null, open);

  function openModal() {
    if (!requestId.current) requestId.current = crypto.randomUUID();
    reset();
    setErrs({});
    setNetMsg(null);
    setGeneratedCode(undefined);
    setOpen(true);
  }

  function closeModal() {
    reset();
    setOpen(false);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!begin()) return;
    setErrs({});
    setNetMsg(null);
    const fd = new FormData(e.currentTarget);
    const sourceId = String(fd.get("source_id") || "");
    const salesStaffId = String(fd.get("sales_staff_id") || "");

    // Pasangan wajib berdua atau kosong berdua — divalidasi di sini SEBELUM
    // dikirim supaya pesan langsung muncul di field yang salah, bukan
    // menunggu round-trip server (server tetap memvalidasi ulang persis
    // aturan yang sama, LESSONS #6 — validasi client hanya kenyamanan).
    if ((sourceId && !salesStaffId) || (!sourceId && salesStaffId)) {
      release();
      setErrs({ source_id: m.admin.customerSourceSalesPairRequired });
      return;
    }

    const rid = requestId.current!;
    const out = await submitSafely({
      run: () =>
        createCustomerAdmin({
          fullName: String(fd.get("full_name") || ""),
          phone: String(fd.get("phone") || ""),
          address: String(fd.get("address") || ""),
          email: String(fd.get("email") || ""),
          sourceId: sourceId || null,
          salesStaffId: salesStaffId || null,
          clientRequestId: rid,
        }),
      lookup: () => lookupByRequestId("customer", rid),
      messages: m,
      buttonLabel: m.admin.customerCreateBtn,
    });

    let customerCode: string | null;
    if (out.status === "confirmed") {
      customerCode = null; // konfirmasi ulang tidak membawa customer_code — cukup tahu tersimpan
    } else if (out.status !== "ok") {
      release();
      setNetMsg(out.message);
      return;
    } else {
      const res = out.result;
      if ("error" in res) {
        release();
        setErrs({ [res.error.field || "_form"]: res.error.message });
        return;
      }
      customerCode = res.data.customerCode;
    }

    draft.clear();
    requestId.current = null;
    setGeneratedCode(customerCode);
    router.refresh();
  }

  if (!open) {
    return (
      <button className="btn primary" onClick={openModal}>
        {m.admin.customerAddBtn}
      </button>
    );
  }

  // Sesudah tersimpan: tampilkan kode yang digenerate (atau ketiadaannya)
  // dengan jelas — ini SATU-SATUNYA kesempatan admin melihatnya sebelum
  // form ditutup (task spec: "confirming the auto-generation worked").
  if (generatedCode !== undefined) {
    return (
      <div className="overlay" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
        <div className="modal" role="dialog" aria-modal="true">
          <h2>{m.admin.customerAddModalTitle}</h2>
          <div className="banner ok">{m.admin.customerSavedMsg}</div>
          <dl className="kv">
            <dt>{m.admin.customerColCode}</dt>
            <dd>
              {generatedCode ? (
                <span className="code">{generatedCode}</span>
              ) : (
                <span className="small muted">{m.admin.customerNoCodeGenerated}</span>
              )}
            </dd>
          </dl>
          <div className="btnrow">
            <button type="button" className="btn primary" onClick={() => setOpen(false)}>
              {m.common.close}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
      <div className="modal" role="dialog" aria-modal="true">
        <h2>{m.admin.customerAddModalTitle}</h2>
        {netMsg && <div className="banner warn">{netMsg}</div>}
        {errs._form && <div className="banner bad">{errs._form}</div>}
        <DraftBanner draft={draft.draft} onRestore={draft.restore} onDiscard={draft.discard} />
        <form onSubmit={onSubmit} ref={draft.formRef} onInput={draft.onInput} onChange={draft.onInput}>
          <div className={`field${errs.full_name ? " invalid" : ""}`}>
            <label htmlFor="nc_name">{m.admin.customerNameFieldLabel}</label>
            <input id="nc_name" name="full_name" type="text" autoComplete="off" />
            {errs.full_name && <div className="err-text">{errs.full_name}</div>}
          </div>
          <div className={`field${errs.phone ? " invalid" : ""}`}>
            <label htmlFor="nc_phone">{m.admin.customerPhoneFieldLabel}</label>
            <input id="nc_phone" name="phone" type="tel" autoComplete="off" />
            {errs.phone && <div className="err-text">{errs.phone}</div>}
          </div>
          <div className="field">
            <label htmlFor="nc_address">{m.common.address}</label>
            <input id="nc_address" name="address" type="text" placeholder={`${m.common.optional}...`} />
          </div>
          <div className="field">
            <label htmlFor="nc_email">{m.common.email}</label>
            <input id="nc_email" name="email" type="email" placeholder={`${m.common.optional}...`} />
          </div>

          {codeFeatureOn && (
            <>
              <div className={`field${errs.source_id ? " invalid" : ""}`}>
                <label htmlFor="nc_source">{m.admin.customerSourceFieldLabel}</label>
                <select id="nc_source" name="source_id" defaultValue="">
                  <option value="">{m.admin.customerSourceSalesEmptyOption}</option>
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} — {s.label}
                    </option>
                  ))}
                </select>
                {errs.source_id && <div className="err-text">{errs.source_id}</div>}
              </div>
              <div className="field">
                <label htmlFor="nc_sales">{m.admin.customerSalesFieldLabel}</label>
                <select id="nc_sales" name="sales_staff_id" defaultValue="">
                  <option value="">{m.admin.customerSourceSalesEmptyOption}</option>
                  {sales.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} — {s.name}
                    </option>
                  ))}
                </select>
                <div className="hint">{m.admin.customerSourceSalesHint}</div>
              </div>
            </>
          )}

          <div className="btnrow">
            <button type="button" className="btn" onClick={closeModal}>
              {m.common.cancel}
            </button>
            <button type="submit" className="btn primary" disabled={submitting}>
              {submitting ? m.common.saving : m.admin.customerCreateBtn}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
