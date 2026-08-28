"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { submitSafely } from "@/lib/safe-write";
import { useLocalDraft } from "@/lib/use-local-draft";
import DraftBanner from "@/lib/draft-banner";
import { useAdminMessages } from "@/lib/i18n/provider";
import { createPackage } from "../../actions-packages";
import { lookupByRequestId } from "../../actions-lookup";

export default function AddPackageButton({ partnerId }: { partnerId: string }) {
  const router = useRouter();
  const m = useAdminMessages();
  const [open, setOpen] = useState(false);
  const { submitting, begin, release, reset } = useSubmitGuard();
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [netMsg, setNetMsg] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);
  const draft = useLocalDraft("package", `new@${partnerId}`, open);

  function openModal() {
    // Nomor permintaan dipakai ulang bila percobaan sebelumnya belum pasti berhasil.
    if (!requestId.current) requestId.current = crypto.randomUUID();
    reset();
    setErrs({});
    setNetMsg(null);
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
    const rid = requestId.current!;
    const out = await submitSafely({
      run: () =>
        createPackage(partnerId, {
          name: String(fd.get("name") || ""),
          code: String(fd.get("code") || ""),
          description: String(fd.get("description") || ""),
          clientRequestId: rid,
        }),
      lookup: () => lookupByRequestId("package", rid),
      messages: m,
      buttonLabel: m.admin.packageCreateBtn,
    });
    if (out.status === "confirmed") {
      draft.clear();
      requestId.current = null;
      setOpen(false);
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
    router.refresh();
  }

  if (!open) {
    return (
      <button className="btn primary" onClick={openModal}>
        {m.admin.packageAddBtn}
      </button>
    );
  }

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
      <div className="modal" role="dialog" aria-modal="true">
        <h2>{m.admin.packageAddModalTitle}</h2>
        {netMsg && <div className="banner warn">{netMsg}</div>}
        {errs._form && <div className="banner bad">{errs._form}</div>}
        <DraftBanner draft={draft.draft} onRestore={draft.restore} onDiscard={draft.discard} />
        <form onSubmit={onSubmit} ref={draft.formRef} onInput={draft.onInput} onChange={draft.onInput}>
          <div className={`field${errs.name ? " invalid" : ""}`}>
            <label htmlFor="ap_name">{m.admin.packageNameFieldLabel}</label>
            <input id="ap_name" name="name" type="text" />
            <div className="hint">{m.admin.packageNameHint}</div>
            {errs.name && <div className="err-text">{errs.name}</div>}
          </div>
          <div className={`field${errs.code ? " invalid" : ""}`}>
            <label htmlFor="ap_code">{m.admin.packageCodeFieldLabel}</label>
            <input id="ap_code" name="code" type="text" style={{ textTransform: "uppercase" }} />
            <div className="hint">{m.admin.packageCodeHint}</div>
            {errs.code && <div className="err-text">{errs.code}</div>}
          </div>
          <div className="field">
            <label htmlFor="ap_desc">{m.admin.packageDescFieldLabel}</label>
            <textarea id="ap_desc" name="description" placeholder={`${m.common.optional}...`} />
          </div>
          <div className="btnrow">
            <button type="button" className="btn" onClick={closeModal}>
              {m.common.cancel}
            </button>
            <button type="submit" className="btn primary" disabled={submitting}>
              {submitting ? m.common.saving : m.admin.packageCreateBtn}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
