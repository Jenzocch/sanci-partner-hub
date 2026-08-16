"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { submitSafely } from "@/lib/safe-write";
import { useLocalDraft } from "@/lib/use-local-draft";
import DraftBanner from "@/lib/draft-banner";
import { updateOrder, cancelOrder } from "../actions";

export type StaffOption = { id: string; fullName: string; role: string };

const CANCEL_REASONS = [
  "Pelanggan membatalkan pembelian",
  "Pesanan salah",
  "Pesanan ganda",
  "Lainnya",
] as const;

export default function OrderDetailActions({
  orderId,
  orderNumber,
  customerName,
  packageName,
  salesStaffId,
  picStaffId,
  notes,
  staffOptions,
}: {
  orderId: string;
  orderNumber: string;
  customerName: string;
  packageName: string;
  salesStaffId: string | null;
  picStaffId: string | null;
  notes: string | null;
  staffOptions: StaffOption[];
}) {
  const router = useRouter();
  const [modal, setModal] = useState<null | "edit" | "cancel">(null);

  return (
    <>
      <div className="btnrow" style={{ marginTop: 16 }}>
        <button type="button" className="btn" onClick={() => setModal("edit")}>
          Ubah Pesanan
        </button>
        <button type="button" className="btn danger" onClick={() => setModal("cancel")}>
          Batalkan Pesanan
        </button>
      </div>

      {modal === "edit" && (
        <EditOrderModal
          orderId={orderId}
          packageName={packageName}
          salesStaffId={salesStaffId}
          picStaffId={picStaffId}
          notes={notes}
          staffOptions={staffOptions}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            router.refresh();
          }}
        />
      )}

      {modal === "cancel" && (
        <CancelOrderModal
          orderId={orderId}
          orderNumber={orderNumber}
          customerName={customerName}
          onClose={() => setModal(null)}
          onCancelled={() => {
            setModal(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Modal Ubah Pesanan (SPEC §36–37)
 * ------------------------------------------------------------------ */

function EditOrderModal({
  orderId,
  packageName,
  salesStaffId,
  picStaffId,
  notes,
  staffOptions,
  onClose,
  onSaved,
}: {
  orderId: string;
  packageName: string;
  salesStaffId: string | null;
  picStaffId: string | null;
  notes: string | null;
  staffOptions: StaffOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { submitting, begin, release } = useSubmitGuard();
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [netMsg, setNetMsg] = useState<string | null>(null);
  // Kunci draf per orderId — draf pesanan lain tidak boleh tercampur (SPEC §73).
  const draft = useLocalDraft("order-edit", orderId, true);

  const salesOptions = [...staffOptions].sort((a, b) => (a.role === "Sales" ? -1 : b.role === "Sales" ? 1 : 0));
  const picOptions = [...staffOptions].sort((a, b) => {
    const rank = (r: string) => (r === "Resepsionis / CS" ? 0 : r === "Manajer" ? 1 : 2);
    return rank(a.role) - rank(b.role);
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!begin()) return;
    setErrs({});
    setNetMsg(null);
    const fd = new FormData(e.currentTarget);
    const picRaw = String(fd.get("pic_staff_id") || "");

    const out = await submitSafely({
      kind: "update",
      run: () =>
        updateOrder({
          orderId,
          packageName: String(fd.get("package_name") || ""),
          salesStaffId: String(fd.get("sales_staff_id") || ""),
          picStaffId: picRaw || undefined,
          notes: String(fd.get("notes") || ""),
        }),
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
    // Berhasil dan sudah dipastikan lewat .select() di server — baru sekarang
    // draf dihapus (LESSONS #1) dan tombol dibiarkan nonaktif sampai halaman
    // disegarkan (LESSONS #20 turunan: tidak ada kedipan yang bisa diklik ganda).
    draft.clear();
    onSaved();
  }

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true">
        <h2>Ubah Pesanan</h2>
        {netMsg && <div className="banner warn">{netMsg}</div>}
        {errs._form && <div className="banner bad">{errs._form}</div>}
        <DraftBanner draft={draft.draft} onRestore={draft.restore} onDiscard={draft.discard} />
        <form onSubmit={onSubmit} ref={draft.formRef} onInput={draft.onInput} onChange={draft.onInput}>
          <div className={`field${errs.package_name ? " invalid" : ""}`}>
            <label htmlFor="eo_package">Nama Package *</label>
            <input id="eo_package" name="package_name" type="text" defaultValue={packageName} />
            {errs.package_name && <div className="err-text">{errs.package_name}</div>}
          </div>
          <div className={`field${errs.sales_staff_id ? " invalid" : ""}`}>
            <label htmlFor="eo_sales">Sales *</label>
            <select id="eo_sales" name="sales_staff_id" defaultValue={salesStaffId || ""}>
              <option value="">— Pilih Sales —</option>
              {salesOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName} ({s.role})
                </option>
              ))}
            </select>
            {salesOptions.length === 0 && <div className="hint">Belum ada staf aktif di cabang ini.</div>}
            {errs.sales_staff_id && <div className="err-text">{errs.sales_staff_id}</div>}
          </div>
          <div className={`field${errs.pic_staff_id ? " invalid" : ""}`}>
            <label htmlFor="eo_pic">PIC</label>
            <select id="eo_pic" name="pic_staff_id" defaultValue={picStaffId || ""}>
              <option value="">— Tidak dipilih —</option>
              {picOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName} ({s.role})
                </option>
              ))}
            </select>
            {errs.pic_staff_id && <div className="err-text">{errs.pic_staff_id}</div>}
          </div>
          <div className="field">
            <label htmlFor="eo_notes">Catatan</label>
            <textarea id="eo_notes" name="notes" defaultValue={notes || ""} placeholder="Opsional..." />
          </div>
          <div className="btnrow">
            <button type="button" className="btn" onClick={onClose} disabled={submitting}>
              Batal
            </button>
            <button type="submit" className="btn primary" disabled={submitting}>
              {submitting ? "Menyimpan…" : "Simpan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Dialog Batalkan Pesanan (SPEC §41, §96)
 * ------------------------------------------------------------------ */

function CancelOrderModal({
  orderId,
  orderNumber,
  customerName,
  onClose,
  onCancelled,
}: {
  orderId: string;
  orderNumber: string;
  customerName: string;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const { submitting, begin, release } = useSubmitGuard();
  const [reasonChoice, setReasonChoice] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [netMsg, setNetMsg] = useState<string | null>(null);

  async function onConfirm() {
    if (!begin()) return;
    setErr(null);
    setNetMsg(null);

    if (!reasonChoice) {
      release();
      setErr("Pilih alasan pembatalan.");
      return;
    }
    const finalReason = reasonChoice === "Lainnya" ? customReason.trim() : reasonChoice;
    if (!finalReason) {
      release();
      setErr("Alasan pembatalan wajib diisi.");
      return;
    }

    const out = await submitSafely({
      kind: "update",
      run: () => cancelOrder({ orderId, reason: finalReason }),
    });

    if (out.status !== "ok") {
      release();
      setNetMsg(out.message);
      return;
    }
    const res = out.result;
    if ("error" in res) {
      release();
      setErr(res.error.message);
      return;
    }
    onCancelled();
  }

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true">
        <h2>Batalkan Pesanan?</h2>
        {netMsg && <div className="banner warn">{netMsg}</div>}
        {err && <div className="banner bad">{err}</div>}
        <dl className="kv" style={{ marginBottom: 14 }}>
          <dt>Order</dt>
          <dd className="code">{orderNumber}</dd>
          <dt>Pelanggan</dt>
          <dd>{customerName}</dd>
        </dl>
        <div className="field">
          <label htmlFor="co_reason">Alasan *</label>
          <select
            id="co_reason"
            value={reasonChoice}
            onChange={(e) => setReasonChoice(e.target.value)}
          >
            <option value="">— Pilih Alasan —</option>
            {CANCEL_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        {reasonChoice === "Lainnya" && (
          <div className="field">
            <label htmlFor="co_reason_other">Alasan Lainnya *</label>
            <textarea
              id="co_reason_other"
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              placeholder="Tuliskan alasan pembatalan..."
            />
          </div>
        )}
        <div className="btnrow">
          <button type="button" className="btn" onClick={onClose} disabled={submitting}>
            Kembali
          </button>
          <button type="button" className="btn danger" onClick={onConfirm} disabled={submitting}>
            {submitting ? "Membatalkan…" : "Batalkan Pesanan"}
          </button>
        </div>
      </div>
    </div>
  );
}
