"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateStaff, deactivateStaff } from "../../../admin/actions-staff";

const ROLES = ["Sales", "Resepsionis / CS", "Manajer", "Lainnya"];

type Staff = { id: string; full_name: string; phone: string | null; role: string };

export default function StaffActions({ staff }: { staff: Staff }) {
  const router = useRouter();
  const [modal, setModal] = useState<null | "edit">(null);
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});

  async function onEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErrs({});
    const fd = new FormData(e.currentTarget);
    const res = await updateStaff(staff.id, {
      fullName: String(fd.get("full_name") || ""),
      phone: String(fd.get("phone") || ""),
      role: String(fd.get("role") || staff.role),
    });
    setBusy(false);
    if ("error" in res) {
      setErrs({ [res.error.field || "_form"]: res.error.message });
      return;
    }
    setModal(null);
    router.refresh();
  }

  async function onDeactivate() {
    if (!confirm(`Nonaktifkan ${staff.full_name}? Riwayat tetap tersimpan.`)) return;
    setBusy(true);
    const res = await deactivateStaff(staff.id);
    setBusy(false);
    if ("error" in res) {
      alert(res.error.message);
      return;
    }
    router.refresh();
  }

  return (
    <>
      <div className="ops">
        <button className="btn sm" onClick={() => { setErrs({}); setModal("edit"); }}>
          Ubah
        </button>
        <button className="btn sm danger" onClick={onDeactivate} disabled={busy}>
          Nonaktifkan
        </button>
      </div>

      {modal === "edit" && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setModal(null)}>
          <div className="modal" role="dialog" aria-modal="true">
            <h2>Ubah Staf</h2>
            {errs._form && <div className="banner bad">{errs._form}</div>}
            <form onSubmit={onEdit}>
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
                <button type="button" className="btn" onClick={() => setModal(null)}>
                  Batal
                </button>
                <button type="submit" className="btn primary" disabled={busy}>
                  {busy ? "Menyimpan…" : "Simpan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
