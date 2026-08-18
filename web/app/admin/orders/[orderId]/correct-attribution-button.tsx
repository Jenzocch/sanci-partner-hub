"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { submitSafely } from "@/lib/safe-write";
import { useMessages } from "@/lib/i18n/provider";
import { correctOrderAttribution } from "../../actions-orders";

export type BranchOption = { id: string; name: string };

export default function CorrectAttributionButton({
  orderId,
  currentBranchName,
  otherBranches,
}: {
  orderId: string;
  currentBranchName: string;
  otherBranches: BranchOption[];
}) {
  const router = useRouter();
  const m = useMessages();
  const [open, setOpen] = useState(false);
  const { submitting, begin, release, reset } = useSubmitGuard();
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [netMsg, setNetMsg] = useState<string | null>(null);

  function openModal() {
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
    const out = await submitSafely({
      kind: "update",
      run: () =>
        correctOrderAttribution(
          orderId,
          String(fd.get("branch_id") || ""),
          String(fd.get("reason") || "")
        ),
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
    // Tombol tetap nonaktif sampai halaman disegarkan — atribusi barunya
    // tampil lewat query server yang sudah dipastikan, bukan optimistic UI.
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button className="btn sm" onClick={openModal}>
        {m.admin.correctAttributionBtn}
      </button>

      {open && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="modal" role="dialog" aria-modal="true">
            <h2>{m.admin.correctAttributionModalTitle}</h2>
            <p className="small muted" style={{ marginBottom: 14 }}>
              {m.admin.correctAttributionDesc.replace("{branch}", currentBranchName)}
            </p>
            {netMsg && <div className="banner warn">{netMsg}</div>}
            {errs._form && <div className="banner bad">{errs._form}</div>}
            {otherBranches.length === 0 ? (
              <div className="emptybox">{m.admin.correctAttributionNoOtherBranches}</div>
            ) : (
              <form onSubmit={onSubmit}>
                <div className={`field${errs.branch_id ? " invalid" : ""}`}>
                  <label htmlFor="ca_branch">{m.admin.correctAttributionBranchFieldLabel}</label>
                  <select id="ca_branch" name="branch_id" defaultValue="">
                    <option value="" disabled>
                      {m.admin.correctAttributionBranchPlaceholder}
                    </option>
                    {otherBranches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                  {errs.branch_id && <div className="err-text">{errs.branch_id}</div>}
                </div>
                <div className={`field${errs.reason ? " invalid" : ""}`}>
                  <label htmlFor="ca_reason">{m.admin.correctAttributionReasonFieldLabel}</label>
                  <textarea id="ca_reason" name="reason" placeholder={m.admin.correctAttributionReasonPlaceholder} />
                  {errs.reason && <div className="err-text">{errs.reason}</div>}
                </div>
                <div className="btnrow">
                  <button type="button" className="btn" onClick={closeModal}>
                    {m.common.cancel}
                  </button>
                  <button type="submit" className="btn primary" disabled={submitting}>
                    {submitting ? m.common.saving : m.admin.correctAttributionSaveBtn}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
