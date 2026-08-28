"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { submitSafely } from "@/lib/safe-write";
import { useLocalDraft } from "@/lib/use-local-draft";
import DraftBanner from "@/lib/draft-banner";
import { useAdminMessages } from "@/lib/i18n/provider";
import { updatePackage, setPackageStatus } from "../../actions-packages";

type Pkg = { id: string; name: string; code: string; description: string | null; status: string };

export default function PackageActions({ pkg }: { pkg: Pkg }) {
  const router = useRouter();
  const m = useAdminMessages();
  const [modal, setModal] = useState<null | "edit">(null);
  const { submitting, begin, release, reset } = useSubmitGuard();
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [netMsg, setNetMsg] = useState<string | null>(null);
  const draft = useLocalDraft("package", pkg.id, modal === "edit");

  function openEdit() {
    reset();
    setErrs({});
    setNetMsg(null);
    setModal("edit");
  }

  function closeModal() {
    reset();
    setModal(null);
  }

  async function onEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!begin()) return;
    setErrs({});
    setNetMsg(null);
    const fd = new FormData(e.currentTarget);
    const out = await submitSafely({
      kind: "update",
      run: () =>
        updatePackage(pkg.id, {
          name: String(fd.get("name") || ""),
          code: String(fd.get("code") || ""),
          description: String(fd.get("description") || ""),
        }),
      messages: m,
      buttonLabel: m.common.save,
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
    draft.clear();
    setModal(null);
    router.refresh();
  }

  async function onToggleStatus() {
    if (!begin()) return;
    const res = await setPackageStatus(pkg.id, pkg.status === "ACTIVE" ? "INACTIVE" : "ACTIVE");
    release();
    if ("error" in res) {
      alert(res.error.message);
      return;
    }
    router.refresh();
  }

  return (
    <>
      <div className="btnrow-inline" style={{ marginTop: 0 }}>
        <button className="btn sm" onClick={openEdit}>
          {m.common.edit}
        </button>
        <button className="btn sm" onClick={onToggleStatus} disabled={submitting}>
          {pkg.status === "ACTIVE" ? m.common.deactivate : m.common.activate}
        </button>
      </div>

      {modal === "edit" && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="modal" role="dialog" aria-modal="true">
            <h2>{m.admin.packageEditModalTitle}</h2>
            {netMsg && <div className="banner warn">{netMsg}</div>}
            {errs._form && <div className="banner bad">{errs._form}</div>}
            <DraftBanner draft={draft.draft} onRestore={draft.restore} onDiscard={draft.discard} />
            <form onSubmit={onEdit} ref={draft.formRef} onInput={draft.onInput} onChange={draft.onInput}>
              <div className={`field${errs.name ? " invalid" : ""}`}>
                <label htmlFor="ep_name">{m.admin.packageNameFieldLabel}</label>
                <input id="ep_name" name="name" type="text" defaultValue={pkg.name} />
                <div className="hint">{m.admin.packageNameHint}</div>
                {errs.name && <div className="err-text">{errs.name}</div>}
              </div>
              <div className={`field${errs.code ? " invalid" : ""}`}>
                <label htmlFor="ep_code">{m.admin.packageCodeFieldLabel}</label>
                <input
                  id="ep_code"
                  name="code"
                  type="text"
                  defaultValue={pkg.code}
                  style={{ textTransform: "uppercase" }}
                />
                {errs.code && <div className="err-text">{errs.code}</div>}
              </div>
              <div className="field">
                <label htmlFor="ep_desc">{m.admin.packageDescFieldLabel}</label>
                <textarea id="ep_desc" name="description" defaultValue={pkg.description || ""} />
              </div>
              <div className="btnrow">
                <button type="button" className="btn" onClick={closeModal}>
                  {m.common.cancel}
                </button>
                <button type="submit" className="btn primary" disabled={submitting}>
                  {submitting ? m.common.saving : m.common.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
