"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { submitSafely } from "@/lib/safe-write";
import { useLocalDraft } from "@/lib/use-local-draft";
import DraftBanner from "@/lib/draft-banner";
import { useAdminMessages } from "@/lib/i18n/provider";
import { createBranch } from "../../actions-branches";
import { lookupByRequestId } from "../../actions-lookup";

export default function AddBranchButton({ partnerId }: { partnerId: string }) {
  const router = useRouter();
  const m = useAdminMessages();
  const [open, setOpen] = useState(false);
  const { submitting, begin, release, reset } = useSubmitGuard();
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [netMsg, setNetMsg] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);
  const draft = useLocalDraft("branch", `new@${partnerId}`, open);

  function openModal() {
    // Nomor permintaan dipakai ulang bila percobaan sebelumnya belum pasti berhasil.
    if (!requestId.current) requestId.current = crypto.randomUUID();
    reset();
    setErrs({});
    setNetMsg(null);
    setOpen(true);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!begin()) return;
    setErrs({});
    setNetMsg(null);
    const fd = new FormData(e.currentTarget);
    const rid = requestId.current!;
    const out = await submitSafely({
      run: () =>
        createBranch(partnerId, {
          name: String(fd.get("name") || ""),
          code: String(fd.get("code") || ""),
          address: String(fd.get("address") || ""),
          city: String(fd.get("city") || ""),
          province: String(fd.get("province") || ""),
          contactName: String(fd.get("contact_name") || ""),
          contactPhone: String(fd.get("contact_phone") || ""),
          clientRequestId: rid,
        }),
      lookup: () => lookupByRequestId("branch", rid),
      messages: m,
    });
    if (out.status === "confirmed") {
      draft.clear();
      requestId.current = null;
      setOpen(false);
      router.push(`/admin/partners/${partnerId}/branches/${out.id}`);
      router.refresh();
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
    // Draf baru dihapus di sini — sesudah server memastikan tersimpan.
    draft.clear();
    requestId.current = null;
    setOpen(false);
    router.push(`/admin/partners/${partnerId}/branches/${res.data.id}`);
    router.refresh();
  }

  if (!open) {
    return (
      <button className="btn primary" onClick={openModal}>
        {m.admin.branchAddBtn}
      </button>
    );
  }

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="modal" role="dialog" aria-modal="true">
        <h2>{m.admin.branchAddModalTitle}</h2>
        {netMsg && <div className="banner warn">{netMsg}</div>}
        {errs._form && <div className="banner bad">{errs._form}</div>}
        <DraftBanner draft={draft.draft} onRestore={draft.restore} onDiscard={draft.discard} />
        <form onSubmit={onSubmit} ref={draft.formRef} onInput={draft.onInput} onChange={draft.onInput}>
          <div className={`field${errs.name ? " invalid" : ""}`}>
            <label htmlFor="ab_name">{m.admin.branchNameFieldLabel}</label>
            <input id="ab_name" name="name" type="text" />
            {errs.name && <div className="err-text">{errs.name}</div>}
          </div>
          <div className={`field${errs.code ? " invalid" : ""}`}>
            <label htmlFor="ab_code">{m.admin.branchCodeFieldLabel}</label>
            <input id="ab_code" name="code" type="text" style={{ textTransform: "uppercase" }} />
            <div className="hint">{m.admin.branchCodeHint}</div>
            {errs.code && <div className="err-text">{errs.code}</div>}
          </div>
          <div className={`field${errs.address ? " invalid" : ""}`}>
            <label htmlFor="ab_addr">{m.admin.branchAddressFieldLabel}</label>
            <textarea id="ab_addr" name="address" />
            {errs.address && <div className="err-text">{errs.address}</div>}
          </div>
          <div className="field">
            <label htmlFor="ab_city">{m.common.city}</label>
            <input id="ab_city" name="city" type="text" />
          </div>
          <div className="field">
            <label htmlFor="ab_prov">{m.common.province}</label>
            <input id="ab_prov" name="province" type="text" />
          </div>
          <div className="field">
            <label htmlFor="ab_contact">{m.common.contactName}</label>
            <input id="ab_contact" name="contact_name" type="text" />
          </div>
          <div className="field">
            <label htmlFor="ab_phone">{m.common.whatsapp}</label>
            <input id="ab_phone" name="contact_phone" type="tel" inputMode="tel" />
          </div>
          <div className="btnrow">
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              {m.common.cancel}
            </button>
            <button type="submit" className="btn primary" disabled={submitting}>
              {submitting ? m.common.saving : m.admin.branchCreateBtn}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
