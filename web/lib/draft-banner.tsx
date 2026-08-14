"use client";

import { waktuRelatif, type Draft } from "./use-local-draft";

/**
 * Pemberitahuan draf tersimpan. Draf tidak pernah dipulihkan diam-diam —
 * pengguna yang memutuskan (SPEC §58).
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
  if (!draft) return null;
  return (
    <div className="banner warn">
      Ada draf tersimpan dari {waktuRelatif(draft.savedAt)}. Lanjutkan mengisi atau buang?
      <div className="btnrow-inline" style={{ marginTop: 9 }}>
        <button type="button" className="btn sm" onClick={onRestore}>
          Lanjutkan
        </button>
        <button type="button" className="btn sm" onClick={onDiscard}>
          Buang
        </button>
      </div>
    </div>
  );
}
