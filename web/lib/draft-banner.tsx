"use client";

import { useCommonMessages } from "./i18n/provider";
import { waktuRelatif, type Draft } from "./use-local-draft";

/**
 * Pemberitahuan draf tersimpan. Draf tidak pernah dipulihkan diam-diam —
 * pengguna yang memutuskan (SPEC §58).
 *
 * Bahasanya diambil sendiri lewat `useCommonMessages()`, jadi PROPS-nya tidak
 * berubah: setiap form yang sudah memakai komponen ini ikut tiga bahasa tanpa
 * disentuh. Dipasang di cabang & admin sekaligus — makanya pakai hook lintas
 * area (cuma butuh `common`), bukan `useCabangMessages()`/`useAdminMessages()`.
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
  const m = useCommonMessages();
  if (!draft) return null;
  return (
    <div className="banner warn">
      {m.draftFound.replace("{waktu}", waktuRelatif(m, draft.savedAt))}
      <div className="btnrow-inline" style={{ marginTop: 9 }}>
        <button type="button" className="btn sm" onClick={onRestore}>
          {m.draftContinue}
        </button>
        <button type="button" className="btn sm" onClick={onDiscard}>
          {m.draftDiscard}
        </button>
      </div>
    </div>
  );
}
