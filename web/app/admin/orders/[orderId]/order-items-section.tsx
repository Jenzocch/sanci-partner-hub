"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { submitSafely } from "@/lib/safe-write";
import { useMessages } from "@/lib/i18n/provider";
import { formatIDR, parseIDRInput } from "@/lib/orders-shared";
import { addOrderItem, updateOrderItem, deleteOrderItem } from "../../actions-orders";

export type OrderItemRow = {
  id: string;
  name_snapshot: string;
  code_snapshot: string | null;
  quantity: number;
  note: string | null;
  color_code: string | null;
  custom_size: string | null;
  unit_price: number | null;
  line_discount: number | null;
};

/**
 * Isi Pesanan (order_items, migrasi 0014) — sisi admin. Admin selalu boleh
 * mengubah/menambah/menghapus baris apa pun (oi_admin_all di DB), termasuk
 * kolom harga — RLS/guard trigger yang menegakkannya, bukan layar ini.
 */
export default function OrderItemsSection({
  orderId,
  items,
  copyWarning,
}: {
  orderId: string;
  items: OrderItemRow[];
  /** true kalau salinan otomatis dari isi Package sempat gagal sebagian (best-effort, dilaporkan bukan disembunyikan — LESSONS #10). */
  copyWarning: boolean;
}) {
  const router = useRouter();
  const m = useMessages();
  const [modal, setModal] = useState<null | "add" | OrderItemRow>(null);

  return (
    <div className="card">
      <h3 style={{ fontSize: 17, marginBottom: 4 }}>{m.admin.orderItemsCardTitle}</h3>
      {copyWarning && <div className="banner warn">{m.admin.orderItemsCopyWarningPartial}</div>}
      {items.length === 0 ? (
        <div className="emptybox">{m.admin.orderItemsEmpty}</div>
      ) : (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>{m.admin.orderItemColName}</th>
                <th>{m.admin.orderItemColCode}</th>
                <th>{m.admin.orderItemColQty}</th>
                <th>{m.admin.orderItemColColor}</th>
                <th>{m.admin.orderItemColSize}</th>
                <th>{m.common.unitPrice}</th>
                <th>{m.common.lineDiscount}</th>
                <th>{m.admin.orderItemColNote}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td style={{ fontWeight: 650 }}>{it.name_snapshot}</td>
                  <td>{it.code_snapshot ? <span className="code">{it.code_snapshot}</span> : "—"}</td>
                  <td>{it.quantity}</td>
                  <td>{it.color_code || "—"}</td>
                  <td>{it.custom_size || "—"}</td>
                  <td>{it.unit_price != null ? formatIDR(it.unit_price) : "—"}</td>
                  <td>{it.line_discount != null ? formatIDR(it.line_discount) : "—"}</td>
                  <td>{it.note || "—"}</td>
                  <td className="ta-right">
                    <button type="button" className="btn sm" onClick={() => setModal(it)}>
                      {m.admin.orderItemEditBtn}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="btnrow-inline">
        <button type="button" className="btn sm" onClick={() => setModal("add")}>
          {m.admin.orderItemAddBtn}
        </button>
      </div>

      {modal && (
        <ItemModal
          orderId={orderId}
          existing={modal === "add" ? null : modal}
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

function ItemModal({
  orderId,
  existing,
  onClose,
  onSaved,
}: {
  orderId: string;
  existing: OrderItemRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const m = useMessages();
  const { submitting, begin, release } = useSubmitGuard();
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [netMsg, setNetMsg] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  function handleAmountChange(e: React.ChangeEvent<HTMLInputElement>) {
    const n = parseIDRInput(e.target.value);
    e.target.value = n === null ? "" : formatIDR(n);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!begin()) return;
    setErrs({});
    setNetMsg(null);
    const fd = new FormData(e.currentTarget);
    const input = {
      name: String(fd.get("name") || ""),
      code: String(fd.get("code") || ""),
      quantity: String(fd.get("quantity") || ""),
      note: String(fd.get("note") || ""),
      colorCode: String(fd.get("color_code") || ""),
      customSize: String(fd.get("custom_size") || ""),
      unitPriceRaw: String(fd.get("unit_price") || ""),
      lineDiscountRaw: String(fd.get("line_discount") || ""),
    };
    if (existing) {
      const out = await submitSafely({
        kind: "update",
        messages: m,
        run: () => updateOrderItem(existing.id, input),
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
      onSaved();
      return;
    }
    const out = await submitSafely({
      kind: "update",
      messages: m,
      run: () => addOrderItem(orderId, { ...input, clientRequestId: crypto.randomUUID() }),
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
    onSaved();
  }

  async function onDelete() {
    if (!existing) return;
    if (!confirm(m.admin.orderItemDeleteConfirm.replace("{name}", existing.name_snapshot))) return;
    if (!begin()) return;
    setDeleting(true);
    setNetMsg(null);
    const out = await submitSafely({
      kind: "update",
      messages: m,
      run: () => deleteOrderItem(existing.id),
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
      setErrs({ _form: res.error.message });
      return;
    }
    onSaved();
  }

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true">
        <h2>{existing ? m.admin.orderItemModalTitleEdit : m.admin.orderItemModalTitleAdd}</h2>
        {netMsg && <div className="banner warn">{netMsg}</div>}
        {errs._form && <div className="banner bad">{errs._form}</div>}
        <form onSubmit={onSubmit}>
          <div className={`field${errs.name ? " invalid" : ""}`}>
            <label htmlFor="oi_name">{m.admin.orderItemNameFieldLabel} *</label>
            <input id="oi_name" name="name" type="text" defaultValue={existing?.name_snapshot ?? ""} />
            {errs.name && <div className="err-text">{errs.name}</div>}
          </div>
          <div className="field">
            <label htmlFor="oi_code">{m.common.code}</label>
            <input id="oi_code" name="code" type="text" defaultValue={existing?.code_snapshot ?? ""} />
          </div>
          <div className={`field${errs.quantity ? " invalid" : ""}`}>
            <label htmlFor="oi_qty">{m.admin.orderItemQtyFieldLabel}</label>
            <input id="oi_qty" name="quantity" type="number" min={1} defaultValue={existing?.quantity ?? 1} />
            {errs.quantity && <div className="err-text">{errs.quantity}</div>}
          </div>
          <div className="field">
            <label htmlFor="oi_color">{m.admin.orderItemColorFieldLabel}</label>
            <input id="oi_color" name="color_code" type="text" defaultValue={existing?.color_code ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="oi_size">{m.admin.orderItemSizeFieldLabel}</label>
            <input id="oi_size" name="custom_size" type="text" defaultValue={existing?.custom_size ?? ""} />
          </div>
          <div className={`field${errs.unit_price ? " invalid" : ""}`}>
            <label htmlFor="oi_unit_price">{m.admin.orderItemUnitPriceFieldLabel}</label>
            <input
              id="oi_unit_price"
              name="unit_price"
              type="text"
              inputMode="numeric"
              defaultValue={existing?.unit_price != null ? formatIDR(existing.unit_price) : ""}
              onChange={handleAmountChange}
            />
            {errs.unit_price && <div className="err-text">{errs.unit_price}</div>}
          </div>
          <div className={`field${errs.line_discount ? " invalid" : ""}`}>
            <label htmlFor="oi_line_discount">{m.admin.orderItemLineDiscountFieldLabel}</label>
            <input
              id="oi_line_discount"
              name="line_discount"
              type="text"
              inputMode="numeric"
              defaultValue={existing?.line_discount != null ? formatIDR(existing.line_discount) : ""}
              onChange={handleAmountChange}
            />
            {errs.line_discount && <div className="err-text">{errs.line_discount}</div>}
          </div>
          <div className="field">
            <label htmlFor="oi_note">{m.admin.orderItemNoteFieldLabel}</label>
            <textarea id="oi_note" name="note" defaultValue={existing?.note ?? ""} />
          </div>
          <div className="btnrow">
            <button type="button" className="btn" onClick={onClose} disabled={submitting}>
              {m.common.cancel}
            </button>
            {existing && (
              <button type="button" className="btn danger" onClick={onDelete} disabled={submitting}>
                {deleting ? m.common.loading : m.admin.orderItemDeleteBtn}
              </button>
            )}
            <button type="submit" className="btn primary lg block" disabled={submitting}>
              {submitting ? m.common.saving : m.common.save}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
