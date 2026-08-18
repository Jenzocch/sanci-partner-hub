"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { submitSafely } from "@/lib/safe-write";
import { useMessages } from "@/lib/i18n/provider";
import { updatePolicy } from "../../actions-permissions";

export default function PermissionsForm({
  partnerId,
  partnerName,
  visibilityScope,
  editScope,
  configured,
}: {
  partnerId: string;
  partnerName: string;
  visibilityScope: string;
  editScope: string;
  /** false = belum pernah disimpan sama sekali (tidak ada baris di partner_access_policies). */
  configured: boolean;
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
      run: () =>
        updatePolicy(partnerId, {
          visibilityScope: String(fd.get("visibility") || "OWN_BRANCH"),
          editScope: String(fd.get("edit") || "OWN_BRANCH"),
        }),
      messages: m,
    });
    release();
    if (out.status !== "ok") {
      // Tidak ada konfirmasi server → jangan tampilkan "Tersimpan".
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
      <h3 style={{ fontSize: 17, marginBottom: 6 }}>{m.admin.permVisibilityTitle}</h3>
      <p className="small muted" style={{ marginBottom: 12 }}>
        {m.admin.permVisibilityDesc.replace("{partner}", partnerName)}
      </p>
      {!configured && !saved && (
        <div className="banner warn">{m.admin.permNotConfiguredWarning}</div>
      )}
      {netMsg && <div className="banner warn">{netMsg}</div>}
      {err && <div className="banner bad">{err}</div>}
      {saved && <div className="banner ok">{m.admin.savedMsg}</div>}
      <form onSubmit={onSubmit}>
        <div className="radioset" style={{ marginBottom: 18 }}>
          <label>
            <input type="radio" name="visibility" value="OWN_BRANCH" defaultChecked={visibilityScope === "OWN_BRANCH"} />
            <span>
              {m.common.scopeOwnBranch}
              <div className="rd">{m.admin.permOwnBranchDesc}</div>
            </span>
          </label>
          <label>
            <input
              type="radio"
              name="visibility"
              value="PARTNER_ALL_BRANCHES"
              defaultChecked={visibilityScope === "PARTNER_ALL_BRANCHES"}
            />
            <span>
              {m.admin.permAllBranchesLabel}
              <div className="rd">{m.admin.permAllBranchesDesc.replace("{partner}", partnerName)}</div>
            </span>
          </label>
        </div>
        <h3 style={{ fontSize: 17, marginBottom: 6 }}>{m.admin.permEditTitle}</h3>
        <div className="radioset">
          <label>
            <input type="radio" name="edit" value="OWN_BRANCH" defaultChecked={editScope === "OWN_BRANCH"} />
            <span>
              {m.admin.accessViewOnly}
              <div className="rd">{m.admin.permViewOnlyDesc}</div>
            </span>
          </label>
          <label>
            <input
              type="radio"
              name="edit"
              value="PARTNER_ALL_BRANCHES"
              defaultChecked={editScope === "PARTNER_ALL_BRANCHES"}
            />
            <span>
              {m.admin.accessViewEdit}
              <div className="rd">{m.admin.permViewEditDesc}</div>
            </span>
          </label>
        </div>
        <div style={{ marginTop: 18 }}>
          <button className="btn primary" type="submit" disabled={submitting}>
            {submitting ? m.common.saving : m.admin.permSaveBtn}
          </button>
        </div>
      </form>
      <p className="footnote">{m.admin.permFootnote}</p>
    </div>
  );
}
