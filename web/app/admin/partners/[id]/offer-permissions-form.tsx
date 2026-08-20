"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { submitSafely } from "@/lib/safe-write";
import { useMessages } from "@/lib/i18n/provider";
import { updateOfferPermissions } from "../../actions-permissions";

/**
 * Dua flag izin (migrasi 0014): can_view_offer / can_edit_offer pada
 * `partner_access_policies`. Pola sama dengan PermissionsForm/CatalogAccessForm
 * di file sebelah — checkbox di sini (bukan radioset) karena dua flag ini
 * INDEPENDEN satu sama lain (boleh lihat tanpa boleh isi — mis. manajer toko
 * yang cuma perlu tahu; boleh isi otomatis mengandaikan boleh lihat juga di
 * layar, jadi checkbox "isi" tercentang ikut mencentang "lihat" di klien —
 * tapi database tetap memvalidasi keduanya independen lewat RLS).
 *
 * DEFAULT false (fail-closed): partner yang belum pernah disentuh admin di
 * sini TIDAK melihat/mengisi Penawaran SANCI — lihat migration 0014 §1.
 */
export default function OfferPermissionsForm({
  partnerId,
  partnerName,
  canViewOffer,
  canEditOffer,
}: {
  partnerId: string;
  partnerName: string;
  canViewOffer: boolean;
  canEditOffer: boolean;
}) {
  const router = useRouter();
  const m = useMessages();
  const { submitting, begin, release } = useSubmitGuard();
  const [err, setErr] = useState<string | null>(null);
  const [netMsg, setNetMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [viewChecked, setViewChecked] = useState(canViewOffer);
  const [editChecked, setEditChecked] = useState(canEditOffer);

  function handleEditChange(checked: boolean) {
    setEditChecked(checked);
    // Boleh mengisi tanpa boleh melihat tidak masuk akal di layar (walau
    // database tidak melarangnya) — samakan di klien supaya kombinasi aneh
    // tidak pernah tersimpan lewat form ini.
    if (checked) setViewChecked(true);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!begin()) return;
    setErr(null);
    setNetMsg(null);
    setSaved(false);
    const out = await submitSafely({
      kind: "update",
      run: () =>
        updateOfferPermissions(partnerId, {
          canViewOffer: viewChecked,
          canEditOffer: editChecked,
        }),
      messages: m,
    });
    release();
    if (out.status !== "ok") {
      setNetMsg(out.message);
      return;
    }
    const res = out.result;
    if ("error" in res) {
      setErr(res.error.message);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <h3 style={{ fontSize: 17, marginBottom: 6 }}>{m.admin.offerPermTitle}</h3>
      <p className="small muted" style={{ marginBottom: 12 }}>
        {m.admin.offerPermDesc.replace("{partner}", partnerName)}
      </p>
      {netMsg && <div className="banner warn">{netMsg}</div>}
      {err && <div className="banner bad">{err}</div>}
      {saved && <div className="banner ok">{m.admin.savedMsg}</div>}
      <form onSubmit={onSubmit}>
        <div className="radioset" style={{ marginBottom: 18 }}>
          <label>
            <input
              type="checkbox"
              checked={viewChecked}
              onChange={(e) => setViewChecked(e.target.checked)}
              disabled={editChecked}
            />
            <span>
              {m.admin.offerPermViewLabel}
              <div className="rd">{m.admin.offerPermViewDesc}</div>
            </span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={editChecked}
              onChange={(e) => handleEditChange(e.target.checked)}
            />
            <span>
              {m.admin.offerPermEditLabel}
              <div className="rd">{m.admin.offerPermEditDesc}</div>
            </span>
          </label>
        </div>
        <button className="btn primary" type="submit" disabled={submitting}>
          {submitting ? m.common.saving : m.admin.offerPermSaveBtn}
        </button>
      </form>
    </div>
  );
}
