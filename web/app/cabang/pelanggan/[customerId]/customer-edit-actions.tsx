"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { submitSafely } from "@/lib/safe-write";
import { useLocalDraft } from "@/lib/use-local-draft";
import DraftBanner from "@/lib/draft-banner";
import { normalizePhoneID } from "@/lib/orders-shared";
import { useMessages } from "@/lib/i18n/provider";
import { updateCustomer } from "../actions";

type Customer = {
  id: string;
  fullName: string;
  phone: string;
  whatsapp: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  notes: string | null;
};

export default function CustomerEditActions({ customer }: { customer: Customer }) {
  const router = useRouter();
  const [modal, setModal] = useState<null | "edit">(null);
  const m = useMessages();

  return (
    <>
      <button type="button" className="btn sm" onClick={() => setModal("edit")}>
        {m.common.edit}
      </button>

      {modal === "edit" && (
        <EditCustomerModal
          customer={customer}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function EditCustomerModal({
  customer,
  onClose,
  onSaved,
}: {
  customer: Customer;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { submitting, begin, release } = useSubmitGuard();
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [netMsg, setNetMsg] = useState<string | null>(null);
  const m = useMessages();
  // Kunci draf per customerId — draf pelanggan lain tidak boleh tercampur.
  const draft = useLocalDraft("customer-edit", customer.id, true);

  const originalNormalized = normalizePhoneID(customer.phone);
  // Uncontrolled (defaultValue) sama seperti pola phone di new-order-form —
  // supaya draft.restore() (menulis langsung ke DOM) tidak ditimpa balik oleh
  // state React (LESSONS #1). State di sini hanya dipakai untuk hint telepon.
  const [phone, setPhone] = useState(customer.phone);

  const phoneChanged = normalizePhoneID(phone) !== originalNormalized;

  /** Lanjutkan pengisian dari draf lokal — nilai draf perlu disinkronkan ke state React juga. */
  function handleRestoreDraft() {
    draft.restore();
    const el = draft.formRef.current?.elements.namedItem("phone") as HTMLInputElement | null;
    if (el && el.value) setPhone(el.value);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!begin()) return;
    setErrs({});
    setNetMsg(null);
    const fd = new FormData(e.currentTarget);

    const out = await submitSafely({
      kind: "update",
      messages: m,
      run: () =>
        updateCustomer({
          customerId: customer.id,
          fullName: String(fd.get("full_name") || ""),
          phone: String(fd.get("phone") || ""),
          whatsapp: String(fd.get("whatsapp") || ""),
          address: String(fd.get("address") || ""),
          city: String(fd.get("city") || ""),
          province: String(fd.get("province") || ""),
          notes: String(fd.get("notes") || ""),
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
    // draf dihapus (LESSONS #1); tombol dibiarkan nonaktif sampai halaman
    // disegarkan (LESSONS #20 turunan).
    draft.clear();
    onSaved();
  }

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true">
        <h2>{m.cabang.editCustomerModalTitle}</h2>
        {netMsg && <div className="banner warn">{netMsg}</div>}
        {errs._form && <div className="banner bad">{errs._form}</div>}
        <DraftBanner draft={draft.draft} onRestore={handleRestoreDraft} onDiscard={draft.discard} />
        <form onSubmit={onSubmit} ref={draft.formRef} onInput={draft.onInput} onChange={draft.onInput}>
          <div className={`field${errs.full_name ? " invalid" : ""}`}>
            <label htmlFor="ce_name">{m.common.fullName} *</label>
            <input id="ce_name" name="full_name" type="text" defaultValue={customer.fullName} />
            {errs.full_name && <div className="err-text">{errs.full_name}</div>}
          </div>
          <div className={`field${errs.phone ? " invalid" : ""}`}>
            <label htmlFor="ce_phone">{m.cabang.phoneWhatsappLabel}</label>
            <input
              id="ce_phone"
              name="phone"
              type="tel"
              inputMode="tel"
              defaultValue={customer.phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            {phoneChanged && !errs.phone && (
              <div className="hint">{m.cabang.phoneUpdateHint}</div>
            )}
            {errs.phone && <div className="err-text">{errs.phone}</div>}
          </div>
          <div className="field">
            <label htmlFor="ce_whatsapp">{m.cabang.whatsappIfDifferentLabel}</label>
            <input id="ce_whatsapp" name="whatsapp" type="text" defaultValue={customer.whatsapp || ""} />
          </div>
          <div className="field">
            <label htmlFor="ce_address">{m.common.address}</label>
            <textarea id="ce_address" name="address" defaultValue={customer.address || ""} placeholder={m.cabang.optionalPlaceholder} />
          </div>
          <div className="field">
            <label htmlFor="ce_city">{m.common.city}</label>
            <input id="ce_city" name="city" type="text" defaultValue={customer.city || ""} />
          </div>
          <div className="field">
            <label htmlFor="ce_province">{m.common.province}</label>
            <input id="ce_province" name="province" type="text" defaultValue={customer.province || ""} />
          </div>
          <div className="field">
            <label htmlFor="ce_notes">{m.common.notes}</label>
            <textarea id="ce_notes" name="notes" defaultValue={customer.notes || ""} placeholder={m.cabang.optionalPlaceholder} />
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
