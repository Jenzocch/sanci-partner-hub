"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { submitSafely } from "@/lib/safe-write";
import { useLocalDraft } from "@/lib/use-local-draft";
import DraftBanner from "@/lib/draft-banner";
import { useCabangMessages } from "@/lib/i18n/provider";
import { suggestStaffCode } from "@/lib/staff-code-suggest";
import { createStaff } from "../../../admin/actions-staff";
import { lookupByRequestId } from "../../../admin/actions-lookup";

const ROLES = ["Sales", "Resepsionis / CS", "Manajer", "Lainnya"];

export default function AddStaffButton({
  branchId,
  branchName,
}: {
  branchId: string;
  branchName: string;
}) {
  const router = useRouter();
  const m = useCabangMessages();
  const [open, setOpen] = useState(false);
  const { submitting, begin, release, reset } = useSubmitGuard();
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [netMsg, setNetMsg] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);
  const draft = useLocalDraft("staff", `new@${branchId}`, open);

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
      messages: m,
      run: () =>
        createStaff(branchId, {
          fullName: String(fd.get("full_name") || ""),
          phone: String(fd.get("phone") || ""),
          role: String(fd.get("role") || "Sales"),
          code: String(fd.get("code") || ""),
          clientRequestId: rid,
        }),
      lookup: () => lookupByRequestId("staff", rid),
    });
    if (out.status === "confirmed") {
      // Respons hilang, tapi pengecekan ke server membuktikan datanya sudah masuk.
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
        {m.cabang.addStaffCta}
      </button>
    );
  }

  /**
   * Saran inisial (kemudahan UI MURNI) — HANYA mengisi kalau field kode
   * masih kosong (tidak pernah menimpa yang sudah diketik/diubah tangan,
   * sama prinsip dengan LESSONS #1: draf/isian tangan pengguna tidak boleh
   * ditimpa balik).
   */
  function handleFullNameBlur(e: React.FocusEvent<HTMLInputElement>) {
    const codeEl = draft.formRef.current?.elements.namedItem("code") as HTMLInputElement | null;
    if (!codeEl || codeEl.value.trim()) return;
    codeEl.value = suggestStaffCode(e.target.value);
  }

  const [branchNotePre, branchNotePost] = m.cabang.staffBranchAutoNote.split("{branch}");

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="modal" role="dialog" aria-modal="true">
        <h2>{m.cabang.addStaffModalTitle}</h2>
        <div className="banner info">
          {branchNotePre}
          <b>{branchName}</b>
          {branchNotePost}
        </div>
        {netMsg && <div className="banner warn">{netMsg}</div>}
        {errs._form && <div className="banner bad">{errs._form}</div>}
        <DraftBanner draft={draft.draft} onRestore={draft.restore} onDiscard={draft.discard} />
        <form onSubmit={onSubmit} ref={draft.formRef} onInput={draft.onInput} onChange={draft.onInput}>
          <div className={`field${errs.full_name ? " invalid" : ""}`}>
            <label htmlFor="cas_name">{m.common.fullName} *</label>
            <input id="cas_name" name="full_name" type="text" onBlur={handleFullNameBlur} />
            <div className="hint">{m.cabang.staffNameHint}</div>
            {errs.full_name && <div className="err-text">{errs.full_name}</div>}
          </div>
          <div className="field">
            <label htmlFor="cas_phone">{m.common.phone}</label>
            <input id="cas_phone" name="phone" type="tel" inputMode="tel" />
          </div>
          <div className={`field${errs.code ? " invalid" : ""}`}>
            <label htmlFor="cas_code">{m.cabang.staffCodeFieldLabel}</label>
            <input id="cas_code" name="code" type="text" style={{ textTransform: "uppercase" }} />
            <div className="hint">{m.cabang.staffCodeHint}</div>
            {errs.code && <div className="err-text">{errs.code}</div>}
          </div>
          <div className="field">
            <label htmlFor="cas_role">{m.common.role} *</label>
            <select id="cas_role" name="role" defaultValue="Sales">
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <div className="hint">{m.cabang.roleFieldHint}</div>
          </div>
          <div className="btnrow">
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              {m.common.cancel}
            </button>
            <button type="submit" className="btn primary lg block" disabled={submitting}>
              {submitting ? m.common.saving : m.cabang.addStaffModalTitle}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
