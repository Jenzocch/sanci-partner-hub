"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { submitSafely } from "@/lib/safe-write";
import { useLocalDraft } from "@/lib/use-local-draft";
import DraftBanner from "@/lib/draft-banner";
import { useMessages } from "@/lib/i18n/provider";
import { createPartner } from "./actions";
import { lookupByRequestId } from "./actions-lookup";

export default function AddPartnerButton() {
  const router = useRouter();
  const m = useMessages();
  const [open, setOpen] = useState(false);
  const { submitting, begin, release, reset } = useSubmitGuard();
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [dup, setDup] = useState<{ id: string; name: string } | null>(null);
  const [netMsg, setNetMsg] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);
  const draft = useLocalDraft("partner", null, open);

  function openModal() {
    // Nomor permintaan hanya dibuat baru kalau belum ada. Kalau percobaan
    // sebelumnya belum pasti berhasil (jaringan putus), nomor lama dipakai lagi
    // supaya server mengenalinya dan tidak membuat baris kedua.
    if (!requestId.current) requestId.current = crypto.randomUUID();
    reset();
    setErrs({});
    setDup(null);
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
        createPartner({
          name: String(fd.get("name") || ""),
          code: String(fd.get("code") || ""),
          contactName: String(fd.get("contact_name") || ""),
          contactPhone: String(fd.get("contact_phone") || ""),
          clientRequestId: rid,
          confirmDuplicate: !!dup,
        }),
      lookup: () => lookupByRequestId("partner", rid),
      messages: m,
    });
    if (out.status === "confirmed") {
      // Respons hilang, tapi pengecekan ke server membuktikan datanya sudah masuk.
      draft.clear();
      requestId.current = null;
      setOpen(false);
      router.push(`/admin/partners/${out.id}`);
      router.refresh();
      return;
    }
    if (out.status !== "ok") {
      // Belum tentu/atau belum tersimpan — jangan sekali pun disebut berhasil.
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
    if ("duplicate" in res) {
      release();
      setDup(res.duplicate);
      return;
    }
    // Berhasil: tombol sengaja dibiarkan nonaktif sampai navigasi selesai.
    // Draf baru dihapus di sini — sesudah server memastikan tersimpan.
    draft.clear();
    requestId.current = null;
    setOpen(false);
    router.push(`/admin/partners/${res.data.id}`);
    router.refresh();
  }

  if (!open) {
    return (
      <button className="btn primary" onClick={openModal}>
        {m.admin.partnerAddBtn}
      </button>
    );
  }

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="modal" role="dialog" aria-modal="true">
        <h2>{m.admin.partnerAddModalTitle}</h2>
        {dup && (
          <div className="banner warn">
            {m.admin.partnerDupWarning.replace("{name}", dup.name)}
          </div>
        )}
        {netMsg && <div className="banner warn">{netMsg}</div>}
        {errs._form && <div className="banner bad">{errs._form}</div>}
        <DraftBanner draft={draft.draft} onRestore={draft.restore} onDiscard={draft.discard} />
        <form onSubmit={onSubmit} ref={draft.formRef} onInput={draft.onInput} onChange={draft.onInput}>
          <div className={`field${errs.name ? " invalid" : ""}`}>
            <label htmlFor="ap_name">{m.admin.partnerNameFieldLabel}</label>
            <input id="ap_name" name="name" type="text" autoComplete="off" />
            {errs.name && <div className="err-text">{errs.name}</div>}
          </div>
          <div className={`field${errs.code ? " invalid" : ""}`}>
            <label htmlFor="ap_code">{m.admin.partnerCodeFieldLabel}</label>
            <input
              id="ap_code"
              name="code"
              type="text"
              style={{ textTransform: "uppercase" }}
              autoComplete="off"
            />
            <div className="hint">{m.admin.partnerCodeHint}</div>
            {errs.code && <div className="err-text">{errs.code}</div>}
          </div>
          <div className="field">
            <label htmlFor="ap_contact">{m.common.contactName}</label>
            <input id="ap_contact" name="contact_name" type="text" />
          </div>
          <div className="field">
            <label htmlFor="ap_phone">{m.common.whatsapp}</label>
            <input id="ap_phone" name="contact_phone" type="tel" inputMode="tel" />
          </div>
          <div className="btnrow">
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              {m.common.cancel}
            </button>
            <button type="submit" className="btn primary" disabled={submitting}>
              {submitting ? m.admin.partnerCreatingBtn : dup ? m.admin.partnerCreateBtnDup : m.admin.partnerCreateBtn}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
