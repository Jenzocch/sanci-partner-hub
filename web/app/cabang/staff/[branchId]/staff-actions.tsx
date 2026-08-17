"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { submitSafely } from "@/lib/safe-write";
import { useLocalDraft } from "@/lib/use-local-draft";
import DraftBanner from "@/lib/draft-banner";
import { updateStaff, deactivateStaff } from "../../../admin/actions-staff";

const ROLES = ["Sales", "Resepsionis / CS", "Manajer", "Lainnya"];

type Staff = { id: string; full_name: string; phone: string | null; role: string };

export default function StaffActions({ staff }: { staff: Staff }) {
  const router = useRouter();
  const [modal, setModal] = useState<null | "edit">(null);
  const { submitting, begin, release, reset } = useSubmitGuard();
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [netMsg, setNetMsg] = useState<string | null>(null);
  const draft = useLocalDraft("staff", staff.id, modal === "edit");

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
        updateStaff(staff.id, {
          fullName: String(fd.get("full_name") || ""),
          phone: String(fd.get("phone") || ""),
          role: String(fd.get("role") || staff.role),
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
    // Berhasil: tombol tetap nonaktif sampai modal tertutup dan data disegarkan.
    // Draf baru dihapus di sini — sesudah server memastikan tersimpan.
    draft.clear();
    setModal(null);
    router.refresh();
  }

  async function onDeactivate() {
    if (!confirm(`Nonaktifkan ${staff.full_name}? Riwayat tetap tersimpan.`)) return;
    if (!begin()) return;
    const res = await deactivateStaff(staff.id);
    release();
    if ("error" in res) {
      alert(res.error.message);
      return;
    }
    router.refresh();
  }

  return (
    <>
      <div className="ops">
        <button className="btn sm" onClick={openEdit}>
          Ubah
        </button>
        <button className="btn sm danger" onClick={onDeactivate} disabled={submitting}>
          {submitting ? "Menyimpan…" : "Nonaktifkan"}
        </button>
      </div>

      {modal === "edit" && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="modal" role="dialog" aria-modal="true">
            <h2>Ubah Staf</h2>
            {netMsg && <div className="banner warn">{netMsg}</div>}
            {errs._form && <div className="banner bad">{errs._form}</div>}
            <DraftBanner draft={draft.draft} onRestore={draft.restore} onDiscard={draft.discard} />
            <form onSubmit={onEdit} ref={draft.formRef} onInput={draft.onInput} onChange={draft.onInput}>
              <div className={`field${errs.full_name ? " invalid" : ""}`}>
                <label htmlFor="ces_name">Nama lengkap *</label>
                <input id="ces_name" name="full_name" type="text" defaultValue={staff.full_name} />
                {errs.full_name && <div className="err-text">{errs.full_name}</div>}
              </div>
              <div className="field">
                <label htmlFor="ces_phone">Telepon</label>
                <input id="ces_phone" name="phone" type="tel" defaultValue={staff.phone || ""} />
              </div>
              <div className="field">
                <label htmlFor="ces_role">Peran *</label>
                <select id="ces_role" name="role" defaultValue={staff.role}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div className="btnrow">
                <button type="button" className="btn" onClick={closeModal}>
                  Batal
                </button>
                <button type="submit" className="btn primary lg block" disabled={submitting}>
                  {submitting ? "Menyimpan…" : "Simpan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
