"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { submitSafely } from "@/lib/safe-write";
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
      <h3 style={{ fontSize: 17, marginBottom: 6 }}>Visibilitas Cabang</h3>
      <p className="small muted" style={{ marginBottom: 12 }}>
        Hanya SANCI Admin yang dapat mengubah pengaturan ini. Berlaku untuk semua akun login{" "}
        {partnerName}.
      </p>
      {!configured && !saved && (
        <div className="banner warn">
          Belum diatur — saat ini berlaku: Hanya cabang sendiri (bawaan).
        </div>
      )}
      {netMsg && <div className="banner warn">{netMsg}</div>}
      {err && <div className="banner bad">{err}</div>}
      {saved && <div className="banner ok" style={{ background: "var(--ok-bg)", color: "var(--ok)" }}>Tersimpan.</div>}
      <form onSubmit={onSubmit}>
        <div className="radioset" style={{ marginBottom: 18 }}>
          <label>
            <input type="radio" name="visibility" value="OWN_BRANCH" defaultChecked={visibilityScope === "OWN_BRANCH"} />
            <span>
              Hanya cabang sendiri
              <div className="rd">Setiap cabang hanya melihat cabangnya sendiri.</div>
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
              Semua cabang sesama partner
              <div className="rd">Semua cabang {partnerName} bisa saling melihat. Tidak pernah partner lain.</div>
            </span>
          </label>
        </div>
        <h3 style={{ fontSize: 17, marginBottom: 6 }}>Akses ke cabang lain</h3>
        <div className="radioset">
          <label>
            <input type="radio" name="edit" value="OWN_BRANCH" defaultChecked={editScope === "OWN_BRANCH"} />
            <span>
              Lihat saja
              <div className="rd">Cabang lain hanya bisa dilihat.</div>
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
              Lihat + edit
              <div className="rd">Staf cabang lain juga bisa dikelola.</div>
            </span>
          </label>
        </div>
        <div style={{ marginTop: 18 }}>
          <button className="btn primary" type="submit" disabled={submitting}>
            {submitting ? "Menyimpan…" : "Simpan hak akses"}
          </button>
        </div>
      </form>
      <p className="small muted" style={{ marginTop: 14 }}>
        Aturan cabang terpilih (misal hanya Jakarta A ↔ Jakarta B) disiapkan untuk fase berikutnya —
        skema data sudah mendukung, layar ini belum.
      </p>
    </div>
  );
}
