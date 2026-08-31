"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { submitSafely } from "@/lib/safe-write";
import { useLocalDraft } from "@/lib/use-local-draft";
import DraftBanner from "@/lib/draft-banner";
import { useAdminMessages } from "@/lib/i18n/provider";
import { addColor } from "../actions-colors";
import { unggahFotoWarna } from "./upload-color-photo";

/**
 * Modal "Tambah Warna" — meniru struktur add-product-button.tsx, tapi TANPA
 * client_request_id/lookup (product_colors tidak punya kolom idempotency,
 * lihat catatan kepala actions-colors.ts): foto diunggah DULU (kalau ada),
 * baru baris DB ditulis — kegagalan foto membatalkan penambahan warna di
 * sini (beda dari produk: warna TANPA foto sekalipun boleh, tapi kalau
 * admin MEMILIH berkas dan unggahannya gagal, ia diberi tahu sebelum baris
 * warna tanpa foto keburu tersimpan).
 */
export default function AddColorButton() {
  const router = useRouter();
  const m = useAdminMessages();
  const [open, setOpen] = useState(false);
  const { submitting, begin, release, reset } = useSubmitGuard();
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [netMsg, setNetMsg] = useState<string | null>(null);
  const draft = useLocalDraft("color", null, open);

  function openModal() {
    reset();
    setErrs({});
    setNetMsg(null);
    setOpen(true);
  }
  function closeModal() {
    reset();
    setOpen(false);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!begin()) return;
    setErrs({});
    setNetMsg(null);
    const fd = new FormData(e.currentTarget);
    const code = String(fd.get("code") || "");
    const name = String(fd.get("name") || "");

    // Foto WAJIB (skema 0025: product_colors.photo_url NOT NULL) — beda
    // dari foto sampul produk yang opsional. Diperiksa di client SEBELUM
    // memanggil server supaya admin tidak menunggu round-trip untuk
    // kesalahan yang sudah pasti ketahuan di sini; server (addColor) tetap
    // menolak lagi kalau berkas ini entah bagaimana terlewat (LESSONS #6).
    const berkas = fd.get("photo");
    if (!(berkas instanceof File) || berkas.size === 0) {
      release();
      setErrs({ photo: m.admin.colorPhotoRequired });
      return;
    }
    const foto = await unggahFotoWarna(berkas, m);
    if (!foto.url) {
      release();
      setErrs({ photo: foto.warning ?? m.admin.photoUploadFailed });
      return;
    }
    const photoUrl = foto.url;

    const out = await submitSafely({
      kind: "create",
      run: () => addColor(code, name, photoUrl),
      messages: m,
      buttonLabel: m.admin.colorAddBtn,
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

    draft.clear();
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button className="btn primary" onClick={openModal}>
        {m.admin.colorAddBtn}
      </button>
    );
  }

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
      <div className="modal" role="dialog" aria-modal="true">
        <h2>{m.admin.colorAddModalTitle}</h2>
        {netMsg && <div className="banner warn">{netMsg}</div>}
        {errs._form && <div className="banner bad">{errs._form}</div>}
        <DraftBanner draft={draft.draft} onRestore={draft.restore} onDiscard={draft.discard} />
        <form onSubmit={onSubmit} ref={draft.formRef} onInput={draft.onInput} onChange={draft.onInput}>
          <div className={`field${errs.photo ? " invalid" : ""}`}>
            <label htmlFor="nc_photo">{m.admin.colorPhotoFieldLabel}</label>
            <input id="nc_photo" name="photo" type="file" accept="image/png,image/jpeg,image/webp" required />
            {errs.photo && <div className="err-text">{errs.photo}</div>}
          </div>
          <div className={`field${errs.code ? " invalid" : ""}`}>
            <label htmlFor="nc_code">{m.admin.colorCodeFieldLabel}</label>
            <input id="nc_code" name="code" type="text" autoComplete="off" placeholder="C01" />
            {errs.code && <div className="err-text">{errs.code}</div>}
          </div>
          <div className="field">
            <label htmlFor="nc_name">{m.admin.colorNameFieldLabel}</label>
            <input id="nc_name" name="name" type="text" autoComplete="off" placeholder={`${m.common.optional}...`} />
          </div>
          <div className="btnrow">
            <button type="button" className="btn" onClick={closeModal}>
              {m.common.cancel}
            </button>
            <button type="submit" className="btn primary" disabled={submitting}>
              {submitting ? m.common.saving : m.admin.colorAddBtn}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
