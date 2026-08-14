"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { updateStaff, deactivateStaff, transferStaff } from "../../../../actions-staff";

const ROLES = ["Sales", "Resepsionis / CS", "Manajer", "Lainnya"];

type Staff = { id: string; full_name: string; phone: string | null; role: string };
type OtherBranch = { id: string; name: string };

export default function StaffActions({
  staff,
  otherBranches,
}: {
  staff: Staff;
  otherBranches: OtherBranch[];
}) {
  const router = useRouter();
  const [modal, setModal] = useState<null | "edit" | "transfer">(null);
  const { submitting, begin, release, reset } = useSubmitGuard();
  const [errs, setErrs] = useState<Record<string, string>>({});

  function openModal(which: "edit" | "transfer") {
    reset();
    setErrs({});
    setModal(which);
  }

  function closeModal() {
    reset();
    setModal(null);
  }

  async function onEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!begin()) return;
    setErrs({});
    const fd = new FormData(e.currentTarget);
    const res = await updateStaff(staff.id, {
      fullName: String(fd.get("full_name") || ""),
      phone: String(fd.get("phone") || ""),
      role: String(fd.get("role") || staff.role),
    });
    if ("error" in res) {
      release();
      setErrs({ [res.error.field || "_form"]: res.error.message });
      return;
    }
    // Berhasil: tombol tetap nonaktif sampai modal tertutup dan data disegarkan.
    setModal(null);
    router.refresh();
  }

  async function onDeactivate() {
    if (!confirm(`Nonaktifkan ${staff.full_name}? Riwayat tetap tersimpan.`)) return;
    if (!begin()) return;
    await deactivateStaff(staff.id);
    release();
    router.refresh();
  }

  async function onTransfer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!begin()) return;
    setErrs({});
    const fd = new FormData(e.currentTarget);
    const res = await transferStaff(staff.id, String(fd.get("branch_id") || ""));
    if ("error" in res) {
      release();
      setErrs({ _form: res.error.message });
      return;
    }
    setModal(null);
    router.refresh();
  }

  return (
    <>
      <div className="ops">
        <button className="btn sm" onClick={() => openModal("edit")}>
          Ubah
        </button>
        {otherBranches.length > 0 && (
          <button className="btn sm" onClick={() => openModal("transfer")}>
            Pindahkan
          </button>
        )}
        <button className="btn sm danger" onClick={onDeactivate} disabled={submitting}>
          {submitting ? "Menyimpan…" : "Nonaktifkan"}
        </button>
      </div>

      {modal === "edit" && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="modal" role="dialog" aria-modal="true">
            <h2>Ubah Staf</h2>
            {errs._form && <div className="banner bad">{errs._form}</div>}
            <form onSubmit={onEdit}>
              <div className={`field${errs.full_name ? " invalid" : ""}`}>
                <label htmlFor="es_name">Nama lengkap *</label>
                <input id="es_name" name="full_name" type="text" defaultValue={staff.full_name} />
                {errs.full_name && <div className="err-text">{errs.full_name}</div>}
              </div>
              <div className="field">
                <label htmlFor="es_phone">Telepon</label>
                <input id="es_phone" name="phone" type="tel" defaultValue={staff.phone || ""} />
              </div>
              <div className="field">
                <label htmlFor="es_role">Peran *</label>
                <select id="es_role" name="role" defaultValue={staff.role}>
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
                <button type="submit" className="btn primary" disabled={submitting}>
                  {submitting ? "Menyimpan…" : "Simpan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modal === "transfer" && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="modal" role="dialog" aria-modal="true">
            <h2>Pindahkan {staff.full_name}</h2>
            <p className="small muted" style={{ marginBottom: 14 }}>
              Pemindahan mengakhiri penugasan lama dan memulai yang baru — riwayat tidak pernah ditulis
              ulang.
            </p>
            {errs._form && <div className="banner bad">{errs._form}</div>}
            <form onSubmit={onTransfer}>
              <div className="field">
                <label htmlFor="tr_branch">Cabang tujuan *</label>
                <select id="tr_branch" name="branch_id">
                  {otherBranches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="btnrow">
                <button type="button" className="btn" onClick={closeModal}>
                  Batal
                </button>
                <button type="submit" className="btn primary" disabled={submitting}>
                  {submitting ? "Memindahkan…" : "Pindahkan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
