"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { submitSafely } from "@/lib/safe-write";
import { useLocalDraft } from "@/lib/use-local-draft";
import DraftBanner from "@/lib/draft-banner";
import { useAdminMessages } from "@/lib/i18n/provider";
import { updateBranch, setBranchStatus } from "../../../../actions-branches";

type Branch = {
  id: string;
  name: string;
  address: string;
  city: string | null;
  province: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  status: string;
};

export default function BranchActions({ branch }: { branch: Branch }) {
  const router = useRouter();
  const m = useAdminMessages();
  const [modal, setModal] = useState<null | "edit">(null);
  const { submitting, begin, release, reset } = useSubmitGuard();
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [netMsg, setNetMsg] = useState<string | null>(null);
  const draft = useLocalDraft("branch", branch.id, modal === "edit");

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
        updateBranch(branch.id, {
          name: String(fd.get("name") || ""),
          address: String(fd.get("address") || ""),
          city: String(fd.get("city") || ""),
          province: String(fd.get("province") || ""),
          contactName: String(fd.get("contact_name") || ""),
          contactPhone: String(fd.get("contact_phone") || ""),
        }),
      messages: m,
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
    // Berhasil: tombol tetap nonaktif sampai modal tertutup dan data disegarkan.
    // Draf baru dihapus di sini — sesudah server memastikan tersimpan.
    draft.clear();
    setModal(null);
    router.refresh();
  }

  async function onToggleStatus() {
    if (!begin()) return;
    await setBranchStatus(branch.id, branch.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE");
    release();
    router.refresh();
  }

  return (
    <>
      <div className="btnrow-inline">
        <button className="btn sm" onClick={openEdit}>
          {m.common.edit}
        </button>
        {branch.status === "ACTIVE" && (
          <button className="btn sm danger" onClick={onToggleStatus} disabled={submitting}>
            {m.admin.branchSuspendBtn}
          </button>
        )}
        {branch.status === "SUSPENDED" && (
          <button className="btn sm" onClick={onToggleStatus} disabled={submitting}>
            {m.admin.branchReactivateBtn}
          </button>
        )}
      </div>

      {modal === "edit" && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="modal" role="dialog" aria-modal="true">
            <h2>{m.admin.branchEditModalTitle}</h2>
            {netMsg && <div className="banner warn">{netMsg}</div>}
            {errs._form && <div className="banner bad">{errs._form}</div>}
            <DraftBanner draft={draft.draft} onRestore={draft.restore} onDiscard={draft.discard} />
            <form onSubmit={onEdit} ref={draft.formRef} onInput={draft.onInput} onChange={draft.onInput}>
              <div className={`field${errs.name ? " invalid" : ""}`}>
                <label htmlFor="eb_name">{m.admin.branchNameFieldLabel}</label>
                <input id="eb_name" name="name" type="text" defaultValue={branch.name} />
                {errs.name && <div className="err-text">{errs.name}</div>}
              </div>
              <div className={`field${errs.address ? " invalid" : ""}`}>
                <label htmlFor="eb_addr">{m.admin.branchAddressFieldLabel}</label>
                <textarea id="eb_addr" name="address" defaultValue={branch.address} />
                {errs.address && <div className="err-text">{errs.address}</div>}
              </div>
              <div className="field">
                <label htmlFor="eb_city">{m.common.city}</label>
                <input id="eb_city" name="city" type="text" defaultValue={branch.city || ""} />
              </div>
              <div className="field">
                <label htmlFor="eb_prov">{m.common.province}</label>
                <input id="eb_prov" name="province" type="text" defaultValue={branch.province || ""} />
              </div>
              <div className="field">
                <label htmlFor="eb_contact">{m.common.contactName}</label>
                <input id="eb_contact" name="contact_name" type="text" defaultValue={branch.contact_name || ""} />
              </div>
              <div className="field">
                <label htmlFor="eb_phone">{m.common.whatsapp}</label>
                <input id="eb_phone" name="contact_phone" type="tel" defaultValue={branch.contact_phone || ""} />
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
