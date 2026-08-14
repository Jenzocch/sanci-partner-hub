"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { createStaff } from "../../../admin/actions-staff";

const ROLES = ["Sales", "Resepsionis / CS", "Manajer", "Lainnya"];

export default function AddStaffButton({
  branchId,
  branchName,
}: {
  branchId: string;
  branchName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { submitting, begin, release, reset } = useSubmitGuard();
  const [errs, setErrs] = useState<Record<string, string>>({});
  const requestId = useRef<string | null>(null);

  function openModal() {
    // Nomor permintaan dipakai ulang bila percobaan sebelumnya belum pasti berhasil.
    if (!requestId.current) requestId.current = crypto.randomUUID();
    reset();
    setErrs({});
    setOpen(true);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!begin()) return;
    setErrs({});
    const fd = new FormData(e.currentTarget);
    const res = await createStaff(branchId, {
      fullName: String(fd.get("full_name") || ""),
      phone: String(fd.get("phone") || ""),
      role: String(fd.get("role") || "Sales"),
      clientRequestId: requestId.current!,
    });
    if ("error" in res) {
      release();
      setErrs({ [res.error.field || "_form"]: res.error.message });
      return;
    }
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
          Cabang: <b>{branchName}</b> — otomatis dari halaman ini, tidak bisa dipilih.
        </div>
        {errs._form && <div className="banner bad">{errs._form}</div>}
        <form onSubmit={onSubmit}>
          <div className={`field${errs.full_name ? " invalid" : ""}`}>
            <label htmlFor="cas_name">Nama lengkap *</label>
            <input id="cas_name" name="full_name" type="text" />
            {errs.full_name && <div className="err-text">{errs.full_name}</div>}
          </div>
          <div className="field">
            <label htmlFor="cas_phone">Telepon</label>
            <input id="cas_phone" name="phone" type="tel" inputMode="tel" />
          </div>
          <div className="field">
            <label htmlFor="cas_role">Peran *</label>
            <select id="cas_role" name="role" defaultValue="Sales">
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
