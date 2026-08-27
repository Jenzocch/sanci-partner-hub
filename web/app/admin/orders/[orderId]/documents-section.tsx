"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { submitSafely } from "@/lib/safe-write";
import { useAdminMessages } from "@/lib/i18n/provider";
import { DOC_TYPE_CHIP, docTypeLabel, type DocType } from "@/lib/documents-shared";
import {
  createOrderDocument,
  updateOrderDocument,
  deleteOrderDocument,
  getOrderDocumentItemCoverage,
} from "../../actions-documents";

export type OrderDocumentListRow = {
  id: string;
  doc_type: DocType;
  doc_number: string;
  doc_date: string;
  notes: string | null;
  /** order_item_id → kuantitas SAAT INI di dokumen ini (untuk prefill modal Ubah). */
  items: Record<string, number>;
};

type ModalState = { mode: "create"; docType: DocType } | { mode: "edit"; doc: OrderDocumentListRow };

/**
 * Kartu "Dokumen" (order_documents/order_document_items, migrasi 0016) —
 * SO/DO/Invoice per pesanan. Admin-only di setiap lapis (DB RLS sudah
 * menutup total untuk cabang — kartu ini hanya kosmetik di lapis UI,
 * LESSONS #5). Pola modal + useSubmitGuard + submitSafely ditiru dari
 * order-items-section.tsx/order-offer-form.tsx supaya perilaku jaringan
 * lemah konsisten se-halaman.
 */
export default function DocumentsSection({
  orderId,
  orderCreatedDate,
  documents,
}: {
  orderId: string;
  /** Tanggal pesanan dibuat (YYYY-MM-DD) — default tanggal dokumen untuk SO. */
  orderCreatedDate: string;
  documents: OrderDocumentListRow[];
}) {
  const router = useRouter();
  const m = useAdminMessages();
  const [modal, setModal] = useState<ModalState | null>(null);

  return (
    <div className="card">
      <h3 style={{ fontSize: 17, marginBottom: 4 }}>{m.admin.docCardTitle}</h3>
      {documents.length === 0 ? (
        <div className="emptybox">{m.admin.docEmpty}</div>
      ) : (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>{m.admin.docColType}</th>
                <th>{m.admin.docColNumber}</th>
                <th>{m.admin.docColDate}</th>
                <th>{m.admin.docColLines}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {documents.map((d) => (
                <tr key={d.id}>
                  <td>
                    <span className={DOC_TYPE_CHIP[d.doc_type]}>{docTypeLabel(m, d.doc_type)}</span>
                  </td>
                  <td>
                    <span className="code">{d.doc_number}</span>
                  </td>
                  <td>
                    {new Date(`${d.doc_date}T00:00:00`).toLocaleDateString(m.common.dateLocale, {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </td>
                  <td>{m.admin.docLinesCount.replace("{n}", String(Object.keys(d.items).length))}</td>
                  <td className="ta-right">
                    <div className="btnrow-inline">
                      <a
                        href={`/admin/orders/${orderId}/documents/${d.id}/print`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn sm"
                      >
                        {m.admin.docViewBtn}
                      </a>
                      <button type="button" className="btn sm" onClick={() => setModal({ mode: "edit", doc: d })}>
                        {m.admin.docEditBtn}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="btnrow-inline">
        <button type="button" className="btn sm" onClick={() => setModal({ mode: "create", docType: "SO" })}>
          {m.admin.docCreateSoBtn}
        </button>
        <button type="button" className="btn sm" onClick={() => setModal({ mode: "create", docType: "DO" })}>
          {m.admin.docCreateDoBtn}
        </button>
        <button type="button" className="btn sm" onClick={() => setModal({ mode: "create", docType: "INVOICE" })}>
          {m.admin.docCreateInvoiceBtn}
        </button>
      </div>

      {modal && (
        <DocumentModal
          orderId={orderId}
          orderCreatedDate={orderCreatedDate}
          modal={modal}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

type CoverageItem = { id: string; name: string; code: string | null; ordered: number; covered: number };

function DocumentModal({
  orderId,
  orderCreatedDate,
  modal,
  onClose,
  onSaved,
}: {
  orderId: string;
  orderCreatedDate: string;
  modal: ModalState;
  onClose: () => void;
  onSaved: () => void;
}) {
  const m = useAdminMessages();
  const { submitting, begin, release } = useSubmitGuard();
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [netMsg, setNetMsg] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [loadState, setLoadState] = useState<"loading" | "ok" | "error">("loading");
  const [items, setItems] = useState<CoverageItem[]>([]);
  const [qtyByItem, setQtyByItem] = useState<Record<string, string>>({});

  const docType: DocType = modal.mode === "create" ? modal.docType : modal.doc.doc_type;
  const existingItems = modal.mode === "edit" ? modal.doc.items : {};
  const excludeDocumentId = modal.mode === "edit" ? modal.doc.id : undefined;

  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");
    getOrderDocumentItemCoverage(orderId, docType, excludeDocumentId).then((res) => {
      if (cancelled) return;
      if ("error" in res) {
        setLoadState("error");
        return;
      }
      setItems(res.data.items);
      const defaults: Record<string, string> = {};
      for (const it of res.data.items) {
        const current = existingItems[it.id];
        if (current != null) {
          defaults[it.id] = String(current);
        } else {
          const remaining = docType === "SO" ? it.ordered : Math.max(it.ordered - it.covered, 0);
          defaults[it.id] = remaining > 0 ? String(remaining) : "";
        }
      }
      setQtyByItem(defaults);
      setLoadState("ok");
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, docType, excludeDocumentId]);

  function defaultDocDate(): string {
    if (modal.mode === "edit") return modal.doc.doc_date;
    if (modal.docType === "SO") return orderCreatedDate;
    return new Date().toISOString().slice(0, 10);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!begin()) return;
    setErrMsg(null);
    setNetMsg(null);
    const fd = new FormData(e.currentTarget);
    const docDate = String(fd.get("doc_date") || "");
    const notes = String(fd.get("notes") || "");
    const itemsInput = items.map((it) => ({ orderItemId: it.id, quantity: qtyByItem[it.id] ?? "" }));

    if (modal.mode === "create") {
      const out = await submitSafely({
        kind: "update",
        messages: m,
        run: () =>
          createOrderDocument(orderId, modal.docType, docDate, itemsInput, notes, crypto.randomUUID()),
      });
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
      onSaved();
      return;
    }

    const out = await submitSafely({
      kind: "update",
      messages: m,
      run: () => updateOrderDocument(modal.doc.id, orderId, modal.doc.doc_type, docDate, itemsInput, notes),
    });
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
    onSaved();
  }

  async function onDelete() {
    if (modal.mode !== "edit") return;
    if (!confirm(m.admin.docDeleteConfirm.replace("{number}", modal.doc.doc_number))) return;
    if (!begin()) return;
    setDeleting(true);
    setNetMsg(null);
    const out = await submitSafely({
      kind: "update",
      messages: m,
      run: () => deleteOrderDocument(modal.doc.id),
    });
    if (out.status !== "ok") {
      release();
      setDeleting(false);
      setNetMsg(out.message);
      return;
    }
    const res = out.result;
    if ("error" in res) {
      release();
      setDeleting(false);
      setErrMsg(res.error.message);
      return;
    }
    onSaved();
  }

  const title =
    modal.mode === "create"
      ? m.admin.docModalTitleCreate.replace("{type}", docTypeLabel(m, modal.docType))
      : m.admin.docModalTitleEdit.replace("{type}", docTypeLabel(m, modal.doc.doc_type));

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true">
        <h2>{title}</h2>
        {netMsg && <div className="banner warn">{netMsg}</div>}
        {errMsg && <div className="banner bad">{errMsg}</div>}
        <form onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="doc_date">{m.admin.docDateFieldLabel} *</label>
            <input id="doc_date" name="doc_date" type="date" defaultValue={defaultDocDate()} required />
          </div>
          <div className="field">
            <label htmlFor="doc_notes">{m.admin.docNotesFieldLabel}</label>
            <textarea id="doc_notes" name="notes" defaultValue={modal.mode === "edit" ? modal.doc.notes ?? "" : ""} />
          </div>

          <h3 style={{ fontSize: 14, marginTop: 6, marginBottom: 8 }}>{m.admin.docItemsSectionTitle}</h3>
          {loadState === "loading" && <div className="skeleton" style={{ height: 80 }} />}
          {loadState === "error" && <div className="banner bad">{m.admin.docFeatureOff}</div>}
          {/* Pesanan tanpa item: tabel kosong berkepala saja membuat admin
              mengira modalnya rusak (laporan owner 2026-08-27, tangkapan
              layar "Pilih Item" hampa) — jelaskan sebabnya dan ke mana harus
              pergi. Keadaan ini BUKAN error (loadState tetap "ok"). */}
          {loadState === "ok" && items.length === 0 && (
            <div className="banner warn">{m.admin.docItemsEmptyOrder}</div>
          )}
          {loadState === "ok" && items.length > 0 && (
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>{m.admin.docItemColName}</th>
                    <th>{m.admin.docItemColOrderedQty}</th>
                    {docType !== "SO" && <th>{m.admin.docItemColCoveredQty}</th>}
                    {docType !== "SO" && <th>{m.admin.docItemColRemainingQty}</th>}
                    <th>{m.admin.docItemColInputQty}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => {
                    const remaining = docType === "SO" ? it.ordered : Math.max(it.ordered - it.covered, 0);
                    return (
                      <tr key={it.id}>
                        <td>
                          {it.name}
                          {it.code && <span className="code" style={{ marginLeft: 6 }}>{it.code}</span>}
                        </td>
                        <td>{it.ordered}</td>
                        {docType !== "SO" && <td>{it.covered}</td>}
                        {docType !== "SO" && <td>{remaining}</td>}
                        <td>
                          <input
                            type="number"
                            min={0}
                            style={{ maxWidth: 90 }}
                            value={qtyByItem[it.id] ?? ""}
                            onChange={(e) =>
                              setQtyByItem((prev) => ({ ...prev, [it.id]: e.target.value }))
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="btnrow">
            <button type="button" className="btn" onClick={onClose} disabled={submitting}>
              {m.common.cancel}
            </button>
            {modal.mode === "edit" && (
              <button type="button" className="btn danger" onClick={onDelete} disabled={submitting}>
                {deleting ? m.common.loading : m.admin.docDeleteBtn}
              </button>
            )}
            <button type="submit" className="btn primary lg block" disabled={submitting || loadState !== "ok"}>
              {submitting ? m.common.saving : m.admin.docSaveBtn}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
