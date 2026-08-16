"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { submitSafely } from "@/lib/safe-write";
import { correctOrderAttribution } from "../../actions-orders";

export type BranchOption = { id: string; name: string };

export default function CorrectAttributionButton({
  orderId,
  currentBranchName,
  otherBranches,
}: {
  orderId: string;
  currentBranchName: string;
  otherBranches: BranchOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { submitting, begin, release, reset } = useSubmitGuard();
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [netMsg, setNetMsg] = useState<string | null>(null);

  function openModal() {
    reset();
    setErrs({});
    setNetMsg(null);
    setOpen(true);
  }

  function closeModal() {
    reset();
    setOpen(false);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!begin()) return;
    setErrs({});
    setNetMsg(null);
    const fd = new FormData(e.currentTarget);
    const out = await submitSafely({
      kind: "update",
      run: () =>
        correctOrderAttribution(
          orderId,
          String(fd.get("branch_id") || ""),
          String(fd.get("reason") || "")
        ),
    });
    if (out.status !== "ok") {
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
    // Tombol tetap nonaktif sampai halaman disegarkan — atribusi barunya
    // tampil lewat query server yang sudah dipastikan, bukan optimistic UI.
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button className="btn sm" onClick={openModal}>
        Koreksi Cabang
      </button>

      {open && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="modal" role="dialog" aria-modal="true">
            <h2>Koreksi Cabang Pesanan</h2>
            <p className="small muted" style={{ marginBottom: 14 }}>
              Cabang saat ini: <strong>{currentBranchName}</strong>. Hanya cabang lain milik partner yang
              sama yang bisa dipilih — partner tidak bisa diubah lewat layar ini. Setiap koreksi tercatat
              di Activity beserta alasannya.
            </p>
            {netMsg && <div className="banner warn">{netMsg}</div>}
            {errs._form && <div className="banner bad">{errs._form}</div>}
            {otherBranches.length === 0 ? (
              <div className="emptybox">Tidak ada cabang lain yang aktif di partner ini.</div>
            ) : (
              <form onSubmit={onSubmit}>
                <div className={`field${errs.branch_id ? " invalid" : ""}`}>
                  <label htmlFor="ca_branch">Cabang tujuan *</label>
                  <select id="ca_branch" name="branch_id" defaultValue="">
                    <option value="" disabled>
                      — Pilih cabang —
                    </option>
                    {otherBranches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                  {errs.branch_id && <div className="err-text">{errs.branch_id}</div>}
                </div>
                <div className={`field${errs.reason ? " invalid" : ""}`}>
                  <label htmlFor="ca_reason">Alasan koreksi *</label>
                  <textarea id="ca_reason" name="reason" placeholder="Contoh: salah pilih cabang saat input pesanan..." />
                  {errs.reason && <div className="err-text">{errs.reason}</div>}
                </div>
                <div className="btnrow">
                  <button type="button" className="btn" onClick={closeModal}>
                    Batal
                  </button>
                  <button type="submit" className="btn primary" disabled={submitting}>
                    {submitting ? "Menyimpan…" : "Simpan Koreksi"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
