"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { submitSafely } from "@/lib/safe-write";
import { useAdminMessages } from "@/lib/i18n/provider";
import { updateOfferPermissions } from "../../actions-permissions";

/**
 * Tiga flag izin (migrasi 0014 + 0015): can_view_offer / can_edit_offer /
 * can_discount pada `partner_access_policies`. Pola sama dengan
 * PermissionsForm/CatalogAccessForm di file sebelah — checkbox di sini (bukan
 * radioset) karena ketiga flag ini INDEPENDEN satu sama lain di database
 * (boleh lihat tanpa boleh isi — mis. manajer toko yang cuma perlu tahu; RLS
 * memvalidasi ketiganya independen), tapi UI ini SENGAJA membuat sebagian
 * kombinasi tidak bisa dicentang lewat form ini karena tidak masuk akal:
 *   * mencentang "isi" ikut mencentang "lihat" (isi tanpa lihat tidak masuk akal).
 *   * mencentang "diskon" ikut mencentang "isi" (dan dengan itu "lihat") —
 *     can_discount TANPA can_edit_offer tidak berguna sama sekali di database
 *     (migration 0015 §6/§7: RLS tetap mensyaratkan can_edit_offer untuk
 *     SELURUH baris, can_discount hanya gerbang TAMBAHAN di atasnya).
 *   * melepas centang "isi" ikut melepas centang "diskon" (kalau tidak boleh
 *     isi baris sama sekali, izin diskon jadi tidak berguna — dibiarkan
 *     tercentang di layar akan menyesatkan admin membaca ulang layar ini).
 *
 * DEFAULT false (fail-closed): partner yang belum pernah disentuh admin di
 * sini TIDAK melihat/mengisi Penawaran SANCI/diskon — lihat migration 0014 §1
 * dan 0015 §1.
 */
export default function OfferPermissionsForm({
  partnerId,
  partnerName,
  canViewOffer,
  canEditOffer,
  canDiscount,
}: {
  partnerId: string;
  partnerName: string;
  canViewOffer: boolean;
  canEditOffer: boolean;
  canDiscount: boolean;
}) {
  const router = useRouter();
  const m = useAdminMessages();
  const { submitting, begin, release } = useSubmitGuard();
  const [err, setErr] = useState<string | null>(null);
  const [netMsg, setNetMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [viewChecked, setViewChecked] = useState(canViewOffer);
  const [editChecked, setEditChecked] = useState(canEditOffer);
  const [discountChecked, setDiscountChecked] = useState(canDiscount);

  function handleEditChange(checked: boolean) {
    setEditChecked(checked);
    // Boleh mengisi tanpa boleh melihat tidak masuk akal di layar (walau
    // database tidak melarangnya) — samakan di klien supaya kombinasi aneh
    // tidak pernah tersimpan lewat form ini.
    if (checked) setViewChecked(true);
    // Melepas "isi" membuat "diskon" tidak berguna (migration 0015 §6/§7) —
    // lepas juga supaya layar ini tidak menampilkan izin yang diam-diam mati.
    if (!checked) setDiscountChecked(false);
  }

  function handleDiscountChange(checked: boolean) {
    setDiscountChecked(checked);
    // can_discount TANPA can_edit_offer tidak berguna di database sama sekali
    // (RLS tetap menutup SELURUH baris) — cascade ke "isi" (yang sendiri
    // cascade ke "lihat") supaya form ini tidak pernah menyimpan kombinasi mati.
    if (checked) handleEditChange(true);
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
          canDiscount: discountChecked,
        }),
      messages: m,
      buttonLabel: m.admin.offerPermSaveBtn,
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
              disabled={discountChecked}
            />
            <span>
              {m.admin.offerPermEditLabel}
              <div className="rd">{m.admin.offerPermEditDesc}</div>
            </span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={discountChecked}
              onChange={(e) => handleDiscountChange(e.target.checked)}
            />
            <span>
              {m.admin.offerPermDiscountLabel}
              <div className="rd">{m.admin.offerPermDiscountDesc}</div>
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
