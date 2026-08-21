"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { submitSafely } from "@/lib/safe-write";
import { useLocalDraft } from "@/lib/use-local-draft";
import DraftBanner from "@/lib/draft-banner";
import { useMessages } from "@/lib/i18n/provider";
import { suggestStaffCode } from "@/lib/staff-code-suggest";
import { createStaff } from "../../../../actions-staff";
import { lookupByRequestId } from "../../../../actions-lookup";

// Nilai yang DIKIRIM ke server tetap literal ini (samakan dengan ROLES di
// actions-staff.ts) — hanya LABEL yang ditampilkan mengikuti bahasa.
const ROLES = ["Sales", "Resepsionis / CS", "Manajer", "Lainnya"] as const;

export default function AddStaffButton({
  branchId,
  partnerName,
  branchName,
}: {
  branchId: string;
  partnerName: string;
  branchName: string;
}) {
  const router = useRouter();
  const m = useMessages();
  const ROLE_LABELS: Record<(typeof ROLES)[number], string> = {
    Sales: m.admin.staffRoleSales,
    "Resepsionis / CS": m.admin.staffRoleReception,
    Manajer: m.admin.staffRoleManager,
    Lainnya: m.admin.staffRoleOther,
  };
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
      run: () =>
        createStaff(branchId, {
          fullName: String(fd.get("full_name") || ""),
          phone: String(fd.get("phone") || ""),
          role: String(fd.get("role") || "Sales"),
          code: String(fd.get("code") || ""),
          clientRequestId: rid,
        }),
      lookup: () => lookupByRequestId("staff", rid),
      messages: m,
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
        {m.admin.staffAddBtn}
      </button>
    );
  }

  /**
   * Saran inisial (kemudahan UI MURNI) — HANYA mengisi kalau field kode
   * masih kosong (LESSONS #1: isian tangan pengguna tidak boleh ditimpa).
   */
  function handleFullNameBlur(e: React.FocusEvent<HTMLInputElement>) {
    const codeEl = draft.formRef.current?.elements.namedItem("code") as HTMLInputElement | null;
    if (!codeEl || codeEl.value.trim()) return;
    codeEl.value = suggestStaffCode(e.target.value);
  }

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="modal" role="dialog" aria-modal="true">
        <h2>{m.admin.staffAddModalTitle}</h2>
        <div className="banner info">
          {m.admin.staffInfoBanner.replace("{partner}", partnerName).replace("{branch}", branchName)}
        </div>
        {netMsg && <div className="banner warn">{netMsg}</div>}
        {errs._form && <div className="banner bad">{errs._form}</div>}
        <DraftBanner draft={draft.draft} onRestore={draft.restore} onDiscard={draft.discard} />
        <form onSubmit={onSubmit} ref={draft.formRef} onInput={draft.onInput} onChange={draft.onInput}>
          <div className={`field${errs.full_name ? " invalid" : ""}`}>
            <label htmlFor="as_name">{m.admin.staffNameFieldLabel}</label>
            <input id="as_name" name="full_name" type="text" onBlur={handleFullNameBlur} />
            {errs.full_name && <div className="err-text">{errs.full_name}</div>}
          </div>
          <div className="field">
            <label htmlFor="as_phone">{m.common.phone}</label>
            <input id="as_phone" name="phone" type="tel" inputMode="tel" />
          </div>
          <div className={`field${errs.code ? " invalid" : ""}`}>
            <label htmlFor="as_code">{m.admin.staffCodeFieldLabel}</label>
            <input id="as_code" name="code" type="text" style={{ textTransform: "uppercase" }} />
            <div className="hint">{m.admin.staffCodeHint}</div>
            {errs.code && <div className="err-text">{errs.code}</div>}
          </div>
          <div className="field">
            <label htmlFor="as_role">{m.admin.staffRoleFieldLabel}</label>
            <select id="as_role" name="role" defaultValue="Sales">
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <div className="hint">{m.admin.staffRoleHint}</div>
          </div>
          <div className="btnrow">
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              {m.common.cancel}
            </button>
            <button type="submit" className="btn primary" disabled={submitting}>
              {submitting ? m.common.saving : m.admin.staffCreateBtn}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
