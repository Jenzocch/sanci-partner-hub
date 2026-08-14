"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
  const [modal, setModal] = useState<null | "edit">(null);
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});

  async function onEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErrs({});
    const fd = new FormData(e.currentTarget);
    const res = await updateBranch(branch.id, {
      name: String(fd.get("name") || ""),
      address: String(fd.get("address") || ""),
      city: String(fd.get("city") || ""),
      province: String(fd.get("province") || ""),
      contactName: String(fd.get("contact_name") || ""),
      contactPhone: String(fd.get("contact_phone") || ""),
    });
    setBusy(false);
    if ("error" in res) {
      setErrs({ [res.error.field || "_form"]: res.error.message });
      return;
    }
    setModal(null);
    router.refresh();
  }

  async function onToggleStatus() {
    setBusy(true);
    await setBranchStatus(branch.id, branch.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE");
    setBusy(false);
    router.refresh();
  }

  return (
    <>
      <div className="btnrow-inline">
        <button className="btn sm" onClick={() => { setErrs({}); setModal("edit"); }}>
          Ubah
        </button>
        {branch.status === "ACTIVE" && (
          <button className="btn sm danger" onClick={onToggleStatus} disabled={busy}>
            Tangguhkan
          </button>
        )}
        {branch.status === "SUSPENDED" && (
          <button className="btn sm" onClick={onToggleStatus} disabled={busy}>
            Aktifkan lagi
          </button>
        )}
      </div>

      {modal === "edit" && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setModal(null)}>
          <div className="modal" role="dialog" aria-modal="true">
            <h2>Ubah Cabang</h2>
            {errs._form && <div className="banner bad">{errs._form}</div>}
            <form onSubmit={onEdit}>
              <div className={`field${errs.name ? " invalid" : ""}`}>
                <label htmlFor="eb_name">Nama cabang *</label>
                <input id="eb_name" name="name" type="text" defaultValue={branch.name} />
                {errs.name && <div className="err-text">{errs.name}</div>}
              </div>
              <div className={`field${errs.address ? " invalid" : ""}`}>
                <label htmlFor="eb_addr">Alamat lengkap *</label>
                <textarea id="eb_addr" name="address" defaultValue={branch.address} />
                {errs.address && <div className="err-text">{errs.address}</div>}
              </div>
              <div className="field">
                <label htmlFor="eb_city">Kota</label>
                <input id="eb_city" name="city" type="text" defaultValue={branch.city || ""} />
              </div>
              <div className="field">
                <label htmlFor="eb_prov">Provinsi</label>
                <input id="eb_prov" name="province" type="text" defaultValue={branch.province || ""} />
              </div>
              <div className="field">
                <label htmlFor="eb_contact">Narahubung</label>
                <input id="eb_contact" name="contact_name" type="text" defaultValue={branch.contact_name || ""} />
              </div>
              <div className="field">
                <label htmlFor="eb_phone">WhatsApp</label>
                <input id="eb_phone" name="contact_phone" type="tel" defaultValue={branch.contact_phone || ""} />
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
