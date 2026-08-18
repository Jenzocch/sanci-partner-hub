"use client";

import { useMessages } from "./i18n/provider";
import { waktuRelatif, type Draft } from "./use-local-draft";

/**
 * Pemberitahuan draf tersimpan. Draf tidak pernah dipulihkan diam-diam —
 * pengguna yang memutuskan (SPEC §58).
 *
 * Bahasanya diambil sendiri lewat `useMessages()`, jadi PROPS-nya tidak
 * berubah: setiap form yang sudah memakai komponen ini ikut tiga bahasa tanpa
 * disentuh. Syaratnya cuma satu — ada <I18nProvider> di atasnya (layout
 * /admin dan /cabang sudah memasangnya).
 */
export default function DraftBanner({
  draft,
  onRestore,
  onDiscard,
}: {
  draft: Draft | null;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  const m = useMessages();
  if (!draft) return null;
  return (
    <div className="banner warn">
      {m.common.draftFound.replace("{waktu}", waktuRelatif(m, draft.savedAt))}
      <div className="btnrow-inline" style={{ marginTop: 9 }}>
        <button type="button" className="btn sm" onClick={onRestore}>
          {m.common.draftContinue}
        </button>
        <button type="button" className="btn sm" onClick={onDiscard}>
          {m.common.draftDiscard}
        </button>
      </div>
    </div>
  );
}
