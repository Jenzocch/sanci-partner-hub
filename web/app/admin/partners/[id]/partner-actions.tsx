"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { submitSafely } from "@/lib/safe-write";
import { useLocalDraft } from "@/lib/use-local-draft";
import DraftBanner from "@/lib/draft-banner";
import { compressImage, PRESET_LOGO } from "@/lib/compress-image";
import { useAdminMessages } from "@/lib/i18n/provider";
import type { AdminMessages } from "@/lib/i18n";
import { updatePartner, setPartnerStatus, deleteDraftPartner, setPartnerLogo } from "../../actions";

function statusLabel(m: AdminMessages, s: string): string {
  const map: Record<string, string> = {
    ACTIVE: m.common.statusActive,
    DRAFT: m.common.statusDraft,
    SUSPENDED: m.common.statusSuspended,
    INACTIVE: m.common.statusInactive,
  };
  return map[s] ?? s;
}

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
  const m = useAdminMessages();
  const [modal, setModal] = useState<null | "edit" | "deactivate" | "delete">(null);
  const { submitting, begin, release, reset } = useSubmitGuard();
  const [errs, setErrs] = useState<Record<string, string>>({});
  // Satu state untuk kedua modal ketik-untuk-konfirmasi (hapus draf DAN akhiri
  // kerja sama) — selalu dikosongkan lewat openModal, tidak pernah terbawa.
  const [confirmInput, setConfirmInput] = useState("");
  const [netMsg, setNetMsg] = useState<string | null>(null);
  const [logoMsg, setLogoMsg] = useState<string | null>(null);
  const draft = useLocalDraft("partner", partner.id, modal === "edit");
  const locked = partner.status !== "DRAFT";

  function openModal(which: "edit" | "deactivate" | "delete") {
    reset();
    setErrs({});
    setNetMsg(null);
    setLogoMsg(null);
    setConfirmInput("");
    setModal(which);
  }

  function closeModal() {
    reset();
    setModal(null);
  }

  /**
   * Mengunggah logo dari BROWSER langsung ke storage, lalu mencatat alamatnya.
   * Mengembalikan null kalau berhasil, atau teks peringatan kalau gagal.
   * Tidak pernah melempar error — pemanggil tidak boleh ikut gagal karenanya.
   */
  async function unggahLogo(file: File): Promise<string | null> {
    const kecil = await compressImage(file, PRESET_LOGO, m);
    if (!kecil.ok) return `${m.admin.logoUploadFailed} ${kecil.message}`;

    const path = `${partner.id}/logo.webp`;
    const out = await submitSafely({
      kind: "update",
      timeoutMs: 30_000,
      messages: m,
      buttonLabel: m.common.save,
      run: async () => {
        // supabase-js diimpor DINAMIS di sini, bukan statis di atas berkas
        // (audit kecepatan muat 2026-08-22 #3, lanjutan pola sign-out-button.tsx):
        // impor statis menyeret ~65 kB gzip SDK ke first-load
        // /admin/partners/[id] padahal cuma dipakai kalau admin benar-benar
        // ganti logo lewat modal Edit. Aman: kalau `import()` gagal (jaringan
        // lemah), rejection-nya keluar dari `run()` dan ditangkap oleh
        // try/catch `submitSafely` (lib/safe-write.ts) yang SUDAH ADA untuk
        // semua kegagalan jaringan lain di sini — jatuh ke cabang
        // "unconfirmed" yang sama, pesan yang sama, TIDAK ada jalur
        // gagal-diam baru.
        const { createClient: createBrowserSupabase } = await import("@/lib/supabase/client");
        const supabase = createBrowserSupabase();
        // upsert: satu partner satu logo. Mengulang unggahan yang sama aman.
        const { error } = await supabase.storage.from("partner-logos").upload(path, kecil.blob, {
          upsert: true,
          contentType: kecil.blob.type || "image/webp",
          // Setahun: URL logo membawa ?v=<timestamp>, konten per-URL abadi
          // (audit kecepatan muat 2026-08-22 #4).
          cacheControl: "31536000",
        });
        if (error) return false;

        const { data } = supabase.storage.from("partner-logos").getPublicUrl(path);
        if (!data?.publicUrl) return false;

        // Alamat publik disimpan di cache. Karena path-nya selalu sama, tanpa
        // penanda versi pengguna akan terus melihat logo LAMA setelah ganti
        // logo — dan mengira unggahannya gagal.
        const res = await setPartnerLogo(partner.id, `${data.publicUrl}?v=${Date.now()}`);
        return !("error" in res);
      },
    });

    if (out.status !== "ok" || out.result === false) return m.admin.logoUploadFailed;
    return null;
  }

  async function onEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!begin()) return;
    setErrs({});
    setNetMsg(null);
    setLogoMsg(null);
    const fd = new FormData(e.currentTarget);
    const out = await submitSafely({
      kind: "update",
      run: () =>
        updatePartner(partner.id, {
          name: String(fd.get("name") || ""),
          code: locked ? undefined : String(fd.get("code") || ""),
          contactName: String(fd.get("contact_name") || ""),
          contactPhone: String(fd.get("contact_phone") || ""),
        }),
      messages: m,
      buttonLabel: m.common.save,
    });
    if (out.status !== "ok") {
      // Jawaban server tidak sampai — perubahan TIDAK boleh disebut tersimpan.
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

    // Logo diurus PALING AKHIR, sesudah data partner dipastikan tersimpan.
    // Apa pun hasilnya, penyimpanan tetap dihitung berhasil (SPEC §41).
    const berkas = fd.get("logo");
    if (berkas instanceof File && berkas.size > 0) {
      let peringatan: string | null = m.admin.logoUploadFailed;
      try {
        peringatan = await unggahLogo(berkas);
      } catch {
        // sudah ditangani sebagai peringatan di bawah
      }
      setLogoMsg(peringatan);
    }

    setModal(null);
    router.refresh();
  }

  async function onActivate() {
    if (!begin()) return;
    const res = await setPartnerStatus(partner.id, "ACTIVE");
    release();
    if ("error" in res) {
      alert(res.error.message);
      return;
    }
    router.refresh();
  }

  async function onSuspend() {
    if (!begin()) return;
    await setPartnerStatus(partner.id, "SUSPENDED");
    release();
    router.refresh();
  }

  async function onReactivate() {
    if (!begin()) return;
    // Server memverifikasi ulang syarat aktivasi — penolakan (mis. semua
    // cabangnya sudah dinonaktifkan) harus terlihat, bukan gagal diam-diam.
    const res = await setPartnerStatus(partner.id, "ACTIVE");
    release();
    if ("error" in res) {
      alert(res.error.message);
      return;
    }
    router.refresh();
  }

  async function onDeactivateConfirm() {
    if (!begin()) return;
    const res = await setPartnerStatus(partner.id, "INACTIVE");
    if ("error" in res) {
      release();
      alert(res.error.message);
      return;
    }
    setModal(null);
    router.refresh();
  }

  async function onDeleteConfirm() {
    if (!begin()) return;
    const res = await deleteDraftPartner(partner.id, confirmInput);
    if (res && "error" in res) {
      release();
      setErrs({ _form: res.error.message });
      return;
    }
    // redirect() di server action sudah menavigasi keluar bila berhasil.
  }

  return (
    <>
      {logoMsg && (
        <div className="banner warn">
          {logoMsg}{" "}
          <button type="button" className="linkbtn" onClick={() => setLogoMsg(null)}>
            {m.admin.closeBtn}
          </button>
        </div>
      )}

      <div className="btnrow-inline">
        <button className="btn sm" onClick={() => openModal("edit")}>
          {m.common.edit}
        </button>
        {partner.status === "ACTIVE" && (
          <button className="btn sm" onClick={onSuspend} disabled={submitting}>
            {m.admin.partnerSuspendBtn}
          </button>
        )}
        {/* INACTIVE ikut bisa di-Reactivate (2026-08-24): "End partnership"
            pernah terpencet keliru di ponsel dan satu-satunya jalan pulih
            adalah SQL manual — terlalu kejam untuk salah ketuk. Server action
            setPartnerStatus("ACTIVE") tetap memverifikasi ulang seluruh
            syarat aktivasi di server, jadi ini tidak melonggarkan apa pun. */}
        {(partner.status === "SUSPENDED" || partner.status === "INACTIVE") && (
          <button className="btn sm" onClick={onReactivate} disabled={submitting}>
            {m.admin.partnerReactivateBtn}
          </button>
        )}
        {(partner.status === "ACTIVE" || partner.status === "SUSPENDED") && (
          <button className="btn sm danger" onClick={() => openModal("deactivate")}>
            {m.admin.partnerEndPartnershipBtn}
          </button>
        )}
        {partner.status === "DRAFT" && (
          <button className="btn sm danger" onClick={() => openModal("delete")}>
            {m.admin.partnerDeleteDraftBtn}
          </button>
        )}
      </div>

      {partner.status === "DRAFT" && (
        <div className="stack" style={{ marginTop: 16 }}>
          <button className="btn primary" onClick={onActivate} disabled={!canActivate || submitting}>
            {m.admin.partnerActivateBtn}
          </button>
          {!canActivate && (
            <div className="hint small muted">
              {m.admin.partnerActivateHint}
            </div>
          )}
        </div>
      )}

      {modal === "edit" && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="modal" role="dialog" aria-modal="true">
            <h2>{m.admin.partnerEditModalTitle}</h2>
            {netMsg && <div className="banner warn">{netMsg}</div>}
            {errs._form && <div className="banner bad">{errs._form}</div>}
            <DraftBanner draft={draft.draft} onRestore={draft.restore} onDiscard={draft.discard} />
            <form onSubmit={onEdit} ref={draft.formRef} onInput={draft.onInput} onChange={draft.onInput}>
              <div className={`field${errs.name ? " invalid" : ""}`}>
                <label htmlFor="ep_name">{m.admin.partnerNameFieldLabel}</label>
                <input id="ep_name" name="name" type="text" defaultValue={partner.name} />
                <div className="hint">{m.admin.partnerNameHint}</div>
                {errs.name && <div className="err-text">{errs.name}</div>}
              </div>
              <div className={`field${errs.code ? " invalid" : ""}`}>
                <label htmlFor="ep_code">{m.admin.partnerCodeFieldLabel}</label>
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
                    ? m.admin.partnerCodeLockedHint.replace("{status}", statusLabel(m, partner.status))
                    : m.admin.partnerCodeHint}
                </div>
                {errs.code && <div className="err-text">{errs.code}</div>}
              </div>
              <div className="field">
                <label htmlFor="ep_contact">{m.common.contactName}</label>
                <input
                  id="ep_contact"
                  name="contact_name"
                  type="text"
                  defaultValue={partner.contact_name || ""}
                />
              </div>
              <div className="field">
                <label htmlFor="ep_phone">{m.common.whatsapp}</label>
                <input
                  id="ep_phone"
                  name="contact_phone"
                  type="tel"
                  defaultValue={partner.contact_phone || ""}
                />
              </div>
              <div className="field">
                <label htmlFor="ep_logo">{m.admin.partnerLogoFieldLabel}</label>
                <input
                  id="ep_logo"
                  name="logo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                />
                <div className="hint">{m.admin.partnerLogoHint}</div>
              </div>
              <div className="btnrow">
                <button type="button" className="btn" onClick={closeModal}>
                  {m.common.cancel}
                </button>
                <button type="submit" className="btn primary" disabled={submitting}>
                  {submitting ? m.common.saving : m.common.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modal === "deactivate" && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="modal" role="dialog" aria-modal="true">
            <h2>{m.admin.partnerDeactivateModalTitle.replace("{name}", partner.name)}</h2>
            <p style={{ marginBottom: 6 }}>{m.admin.partnerDeactivateBody}</p>
            {/* Ketik-untuk-konfirmasi — idiom yang sama dengan modal hapus draf.
                Pengaman salah pencet saja (pemulihan tetap ada lewat Aktifkan
                lagi), jadi cukup mengunci tombol di sisi client. */}
            <div className="field">
              <label htmlFor="deact_code">
                {m.admin.partnerDeactivateFieldLabel.replace("{code}", partner.code)}
              </label>
              <input
                id="deact_code"
                type="text"
                autoComplete="off"
                style={{ textTransform: "uppercase" }}
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
              />
            </div>
            <div className="btnrow">
              <button type="button" className="btn" onClick={closeModal}>
                {m.common.cancel}
              </button>
              <button
                type="button"
                className="btn danger"
                onClick={onDeactivateConfirm}
                disabled={submitting || confirmInput.trim().toUpperCase() !== partner.code}
              >
                {submitting ? m.common.saving : m.admin.partnerDeactivateConfirmBtn}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === "delete" && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="modal" role="dialog" aria-modal="true">
            <h2>{m.admin.partnerDeleteModalTitle.replace("{name}", partner.name)}</h2>
            {errs._form && <div className="banner bad">{errs._form}</div>}
            <div className="field">
              <label htmlFor="del_code">
                {m.admin.partnerDeleteFieldLabel.replace("{code}", partner.code)}
              </label>
              <input
                id="del_code"
                type="text"
                style={{ textTransform: "uppercase" }}
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
              />
            </div>
            <div className="btnrow">
              <button type="button" className="btn" onClick={closeModal}>
                {m.common.cancel}
              </button>
              <button type="button" className="btn danger" onClick={onDeleteConfirm} disabled={submitting}>
                {submitting ? m.admin.partnerDeletingBtn : m.admin.partnerDeletePermanentBtn}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
