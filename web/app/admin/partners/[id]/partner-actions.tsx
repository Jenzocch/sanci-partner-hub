"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updatePartner, setPartnerStatus, deleteDraftPartner } from "../../actions";

type Partner = {
  id: string;
  name: string;
  code: string;
  status: string;
  contact_name: string | null;
  contact_phone: string | null;
};

export default function PartnerActions({
  partner,
  canActivate,
}: {
  partner: Partner;
  canActivate: boolean;
}) {
  const router = useRouter();
  const [modal, setModal] = useState<null | "edit" | "deactivate" | "delete">(null);
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [deleteInput, setDeleteInput] = useState("");
  const locked = partner.status !== "DRAFT";

  async function onEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErrs({});
    const fd = new FormData(e.currentTarget);
    const res = await updatePartner(partner.id, {
      name: String(fd.get("name") || ""),
      code: locked ? undefined : String(fd.get("code") || ""),
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

  async function onActivate() {
    setBusy(true);
    const res = await setPartnerStatus(partner.id, "ACTIVE");
    setBusy(false);
    if ("error" in res) {
      alert(res.error.message);
      return;
    }
    router.refresh();
  }

  async function onSuspend() {
    setBusy(true);
    await setPartnerStatus(partner.id, "SUSPENDED");
    setBusy(false);
    router.refresh();
  }

  async function onReactivate() {
    setBusy(true);
    await setPartnerStatus(partner.id, "ACTIVE");
    setBusy(false);
    router.refresh();
  }

  async function onDeactivateConfirm() {
    setBusy(true);
    const res = await setPartnerStatus(partner.id, "INACTIVE");
    setBusy(false);
    if ("error" in res) {
      alert(res.error.message);
      return;
    }
    setModal(null);
    router.refresh();
  }

  async function onDeleteConfirm() {
    setBusy(true);
    const res = await deleteDraftPartner(partner.id, deleteInput);
    setBusy(false);
    if (res && "error" in res) {
      setErrs({ _form: res.error.message });
      return;
    }
    // redirect() di server action sudah menavigasi keluar bila berhasil.
  }

  return (
    <>
      <div className="btnrow-inline">
        <button
          className="btn sm"
          onClick={() => {
            setErrs({});
            setModal("edit");
          }}
        >
          Ubah
        </button>
        {partner.status === "ACTIVE" && (
          <button className="btn sm" onClick={onSuspend} disabled={busy}>
            Tangguhkan
          </button>
        )}
        {partner.status === "SUSPENDED" && (
          <button className="btn sm" onClick={onReactivate} disabled={busy}>
            Aktifkan lagi
          </button>
        )}
        {(partner.status === "ACTIVE" || partner.status === "SUSPENDED") && (
          <button className="btn sm danger" onClick={() => setModal("deactivate")}>
            Akhiri kerja sama
          </button>
        )}
        {partner.status === "DRAFT" && (
          <button
            className="btn sm danger"
            onClick={() => {
              setDeleteInput("");
              setErrs({});
              setModal("delete");
            }}
          >
            Hapus draf
          </button>
        )}
      </div>

      {partner.status === "DRAFT" && (
        <div style={{ marginTop: 16 }}>
          <button className="btn primary" onClick={onActivate} disabled={!canActivate || busy}>
            Aktifkan partner
          </button>
          {!canActivate && (
            <div className="hint small muted" style={{ marginTop: 8 }}>
              Lengkapi semua syarat aktivasi untuk mengaktifkan.
            </div>
          )}
        </div>
      )}

      {modal === "edit" && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setModal(null)}>
          <div className="modal" role="dialog" aria-modal="true">
            <h2>Ubah Partner</h2>
            {errs._form && <div className="banner bad">{errs._form}</div>}
            <form onSubmit={onEdit}>
              <div className={`field${errs.name ? " invalid" : ""}`}>
                <label htmlFor="ep_name">Nama partner *</label>
                <input id="ep_name" name="name" type="text" defaultValue={partner.name} />
                {errs.name && <div className="err-text">{errs.name}</div>}
              </div>
              <div className={`field${errs.code ? " invalid" : ""}`}>
                <label htmlFor="ep_code">Kode partner *</label>
                <input
                  id="ep_code"
                  name="code"
                  type="text"
                  defaultValue={partner.code}
                  disabled={locked}
                  style={{ textTransform: "uppercase" }}
                />
                <div className="hint">
                  {locked
                    ? `Kode terkunci selama partner ${partner.status}.`
                    : "2–8 karakter, A–Z 0–9 dan tanda hubung."}
                </div>
                {errs.code && <div className="err-text">{errs.code}</div>}
              </div>
              <div className="field">
                <label htmlFor="ep_contact">Narahubung</label>
                <input
                  id="ep_contact"
                  name="contact_name"
                  type="text"
                  defaultValue={partner.contact_name || ""}
                />
              </div>
              <div className="field">
                <label htmlFor="ep_phone">WhatsApp</label>
                <input
                  id="ep_phone"
                  name="contact_phone"
                  type="tel"
                  defaultValue={partner.contact_phone || ""}
                />
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

      {modal === "deactivate" && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setModal(null)}>
          <div className="modal" role="dialog" aria-modal="true">
            <h2>Akhiri kerja sama dengan {partner.name}?</h2>
            <p style={{ marginBottom: 6 }}>
              Status menjadi <b>NONAKTIF</b>. Semua cabang, staf, dan riwayat tetap tersimpan.
            </p>
            <div className="btnrow">
              <button type="button" className="btn" onClick={() => setModal(null)}>
                Batal
              </button>
              <button type="button" className="btn danger" onClick={onDeactivateConfirm} disabled={busy}>
                Akhiri kerja sama
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === "delete" && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setModal(null)}>
          <div className="modal" role="dialog" aria-modal="true">
            <h2>Hapus {partner.name}?</h2>
            {errs._form && <div className="banner bad">{errs._form}</div>}
            <div className="field">
              <label htmlFor="del_code">
                Ketik <span className="code">{partner.code}</span> untuk menghapus permanen
              </label>
              <input
                id="del_code"
                type="text"
                style={{ textTransform: "uppercase" }}
                value={deleteInput}
                onChange={(e) => setDeleteInput(e.target.value)}
              />
            </div>
            <div className="btnrow">
              <button type="button" className="btn" onClick={() => setModal(null)}>
                Batal
              </button>
              <button type="button" className="btn danger" onClick={onDeleteConfirm} disabled={busy}>
                Hapus permanen
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
