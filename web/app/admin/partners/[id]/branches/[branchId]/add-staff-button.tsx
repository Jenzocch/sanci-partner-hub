"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createStaff } from "../../../../actions-staff";

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
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const requestId = useRef<string | null>(null);

  function openModal() {
    requestId.current = crypto.randomUUID();
    setErrs({});
    setOpen(true);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErrs({});
    const fd = new FormData(e.currentTarget);
    const res = await createStaff(branchId, {
      fullName: String(fd.get("full_name") || ""),
      phone: String(fd.get("phone") || ""),
      role: String(fd.get("role") || "Sales"),
      clientRequestId: requestId.current!,
    });
    setBusy(false);
    if ("error" in res) {
      setErrs({ [res.error.field || "_form"]: res.error.message });
      return;
    }
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
        {errs._form && <div className="banner bad">{errs._form}</div>}
        <form onSubmit={onSubmit}>
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
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? "Menyimpan…" : "Tambah Staf"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
