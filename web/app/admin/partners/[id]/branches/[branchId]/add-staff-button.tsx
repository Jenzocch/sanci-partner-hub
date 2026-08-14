"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { submitSafely } from "@/lib/safe-write";
import { useLocalDraft } from "@/lib/use-local-draft";
import DraftBanner from "@/lib/draft-banner";
import { createStaff } from "../../../../actions-staff";
import { lookupByRequestId } from "../../../../actions-lookup";

const ROLES = ["Sales", "Resepsionis / CS", "Manajer", "Lainnya"];

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
        + Tambah Staf
      </button>
    );
  }

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="modal" role="dialog" aria-modal="true">
        <h2>Tambah Staf</h2>
        <div className="banner" style={{ background: "var(--accent-soft)", color: "var(--accent-2)", fontSize: 13.5 }}>
          Cabang: <b>{partnerName} · {branchName}</b> — otomatis dari halaman ini, tidak bisa dipilih.
        </div>
        {netMsg && <div className="banner warn">{netMsg}</div>}
        {errs._form && <div className="banner bad">{errs._form}</div>}
        <DraftBanner draft={draft.draft} onRestore={draft.restore} onDiscard={draft.discard} />
        <form onSubmit={onSubmit} ref={draft.formRef} onInput={draft.onInput} onChange={draft.onInput}>
          <div className={`field${errs.full_name ? " invalid" : ""}`}>
            <label htmlFor="as_name">Nama lengkap *</label>
            <input id="as_name" name="full_name" type="text" />
            {errs.full_name && <div className="err-text">{errs.full_name}</div>}
          </div>
          <div className="field">
            <label htmlFor="as_phone">Telepon</label>
            <input id="as_phone" name="phone" type="tel" inputMode="tel" />
          </div>
          <div className="field">
            <label htmlFor="as_role">Peran *</label>
            <select id="as_role" name="role" defaultValue="Sales">
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <div className="hint">Peran bisnis di toko — terpisah dari hak akses login sistem.</div>
          </div>
          <div className="btnrow">
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Batal
            </button>
            <button type="submit" className="btn primary" disabled={submitting}>
              {submitting ? "Menyimpan…" : "Tambah Staf"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
