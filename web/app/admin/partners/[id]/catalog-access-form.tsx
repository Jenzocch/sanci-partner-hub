"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { submitSafely } from "@/lib/safe-write";
import { useMessages } from "@/lib/i18n/provider";
import { setCatalogAccess } from "../../actions-products";

/**
 * Toggle visibilitas Katalog Produk SANCI untuk satu partner (dikelola
 * SANCI Admin saja). Pola sama dengan PermissionsForm di file sebelah —
 * radioset dua pilihan, bukan checkbox, supaya konsisten dengan kontrol
 * hak akses lain di halaman ini.
 */
export default function CatalogAccessForm({
  partnerId,
  enabled,
}: {
  partnerId: string;
  /** false kalau belum pernah ada baris di sanci_catalog_access (bawaan: tertutup). */
  enabled: boolean;
}) {
  const router = useRouter();
  const m = useMessages();
  const { submitting, begin, release } = useSubmitGuard();
  const [err, setErr] = useState<string | null>(null);
  const [netMsg, setNetMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!begin()) return;
    setErr(null);
    setNetMsg(null);
    setSaved(false);
    const fd = new FormData(e.currentTarget);
    const out = await submitSafely({
      kind: "update",
      run: () => setCatalogAccess(partnerId, fd.get("catalog") === "OPEN"),
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
      <h3 style={{ fontSize: 17, marginBottom: 6 }}>{m.admin.catalogAccessTitle}</h3>
      <p className="small muted" style={{ marginBottom: 12 }}>
        {m.admin.catalogAccessDesc}
      </p>
      {netMsg && <div className="banner warn">{netMsg}</div>}
      {err && <div className="banner bad">{err}</div>}
      {saved && <div className="banner ok">{m.admin.savedMsg}</div>}
      <form onSubmit={onSubmit}>
        <div className="radioset">
          <label>
            <input type="radio" name="catalog" value="OPEN" defaultChecked={enabled} />
            <span>{m.admin.catalogOpenLabel}</span>
          </label>
          <label>
            <input type="radio" name="catalog" value="CLOSED" defaultChecked={!enabled} />
            <span>{m.admin.catalogClosedLabel}</span>
          </label>
        </div>
        <div style={{ marginTop: 18 }}>
          <button className="btn primary" type="submit" disabled={submitting}>
            {submitting ? m.common.saving : m.common.save}
          </button>
        </div>
      </form>
    </div>
  );
}
