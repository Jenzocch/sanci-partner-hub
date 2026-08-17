"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { submitSafely } from "@/lib/safe-write";
import { addInternalNote } from "../../actions-orders";
import { lookupByRequestId } from "../../actions-lookup";

/**
 * Form tambah Catatan Internal SANCI — append-only, tidak ada tombol
 * edit/hapus sama sekali di UI ini (SPEC slice ini: salah tulis dikoreksi
 * dengan menambah catatan baru, bukan mengubah yang lama).
 */
export default function InternalNoteForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const { submitting, begin, release, reset } = useSubmitGuard();
  const [note, setNote] = useState("");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [netMsg, setNetMsg] = useState<string | null>(null);
  // Nomor permintaan dipakai ulang bila percobaan sebelumnya belum pasti
  // berhasil; dibuat baru sesudah tersimpan supaya catatan berikutnya
  // punya nomor sendiri (pola sama dengan AddPackageButton, hanya di sini
  // tanpa gerbang "buka modal" jadi dibuat lewat lazy initializer state).
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!begin()) return;
    setErrMsg(null);
    setNetMsg(null);
    const out = await submitSafely({
      kind: "create",
      run: () => addInternalNote(orderId, note, requestId),
      lookup: () => lookupByRequestId("internalNote", requestId),
    });
    if (out.status === "confirmed") {
      setRequestId(crypto.randomUUID());
      reset();
      setNote("");
      router.refresh();
      return;
    }
    if (out.status !== "ok") {
      release();
      setNetMsg(out.message);
      return;
    }
    const res = out.result;
    if ("error" in res) {
      release();
      setErrMsg(res.error.message);
      return;
    }
    setRequestId(crypto.randomUUID());
    reset();
    setNote("");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} style={{ marginTop: 16 }}>
      {netMsg && <div className="banner warn">{netMsg}</div>}
      {errMsg && <div className="banner bad">{errMsg}</div>}
      <div className={`field${errMsg ? " invalid" : ""}`} style={{ marginBottom: 10 }}>
        <label htmlFor="note_text">Catatan baru</label>
        <textarea
          id="note_text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Contoh: Invoice 2,5jt → penawaran diskon dekorasi diberikan ke pelanggan."
        />
      </div>
      <div className="btnrow-inline">
        <button type="submit" className="btn primary" disabled={submitting}>
          {submitting ? "Menyimpan…" : "Simpan Catatan"}
        </button>
      </div>
    </form>
  );
}
