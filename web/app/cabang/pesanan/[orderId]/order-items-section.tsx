"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { submitSafely } from "@/lib/safe-write";
import { useCabangMessages } from "@/lib/i18n/provider";
import { updateOrderItemFields, deleteOrderItemCabang, listActiveColorsCabang, type ColorRow } from "../actions";

export type OrderItemRow = {
  id: string;
  /** Boleh null: baris ketikan bebas tidak terhubung ke produk katalog. */
  product_id: string | null;
  name_snapshot: string;
  code_snapshot: string | null;
  quantity: number;
  note: string | null;
  color_code: string | null;
  custom_size: string | null;
};

/**
 * Isi Pesanan (order_items, migrasi 0014) — sisi cabang. Nama/kode produk
 * adalah SNAPSHOT beku (tidak bisa diubah dari sini — trg_order_item_
 * immutable_cols di DB menegakkannya); yang bisa diubah cabang hanya
 * catatan/warna/ukuran/jumlah. TIDAK ada kolom harga di sini sama sekali —
 * itu murni sisi admin (order-items-section.tsx admin).
 */
export default function OrderItemsSection({
  orderId,
  items,
  canManage,
  copyWarning,
}: {
  orderId: string;
  items: OrderItemRow[];
  /** false kalau pesanan sudah CANCELLED atau cabang lain tanpa PARTNER_ALL_BRANCHES edit. */
  canManage: boolean;
  copyWarning: boolean;
}) {
  const router = useRouter();
  const m = useCabangMessages();
  const [editing, setEditing] = useState<OrderItemRow | null>(null);

  return (
    <div className="card">
      <h3 style={{ fontSize: 17, marginBottom: 4 }}>{m.cabang.orderItemsCardTitle}</h3>
      {copyWarning && <div className="banner warn">{m.cabang.orderItemsCopyWarningPartial}</div>}
      {items.length === 0 ? (
        <div className="emptybox">{m.cabang.orderItemsEmpty}</div>
      ) : (
        <ul className="audit-list">
          {items.map((it) => (
            <li key={it.id}>
              <div className="spread">
                <span>
                  <strong>{it.name_snapshot}</strong>
                  {it.code_snapshot && (
                    <>
                      {" "}
                      <span className="code">{it.code_snapshot}</span>
                    </>
                  )}{" "}
                  <span className="chip qty" aria-label={`${m.cabang.orderItemColQty} ${it.quantity}`}>
                    ×{it.quantity}
                  </span>
                </span>
                {canManage && (
                  <button type="button" className="btn sm" onClick={() => setEditing(it)}>
                    {m.cabang.orderItemEditCta}
                  </button>
                )}
              </div>
              {(it.color_code || it.custom_size) && (
                <div className="small muted">
                  {it.color_code && `${m.cabang.orderItemColColor}: ${it.color_code}`}
                  {it.color_code && it.custom_size ? " · " : ""}
                  {it.custom_size && `${m.cabang.orderItemColSize}: ${it.custom_size}`}
                </div>
              )}
              {it.note && <div>{it.note}</div>}
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <EditItemModal
          orderId={orderId}
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function EditItemModal({
  orderId,
  item,
  onClose,
  onSaved,
}: {
  orderId: string;
  item: OrderItemRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const m = useCabangMessages();
  const { submitting, begin, release } = useSubmitGuard();
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [netMsg, setNetMsg] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Fitur C — pemilih warna. Pola sama dengan order-items-section.tsx admin
  // (lihat catatan lengkap di sana): `colorText` tetap satu-satunya sumber
  // untuk name="color_code" (server action tidak berubah); silent fallback
  // ke "idle" untuk migrasi belum jalan / produk tanpa pilihan warna, catatan
  // kecil hanya untuk kegagalan SUNGGUHAN (LESSONS #10/#12). Modal ini hanya
  // pernah mengedit baris yang SUDAH ADA, jadi product_id tersedia langsung
  // dari prop `item` — tidak perlu menunggu pemuatan baris seperti sisi admin.
  const [colorText, setColorText] = useState(item.color_code ?? "");
  const [colorLoad, setColorLoad] = useState<
    { status: "idle" } | { status: "error" } | { status: "ready"; colors: ColorRow[] }
  >({ status: "idle" });

  useEffect(() => {
    if (!item.product_id) {
      setColorLoad({ status: "idle" });
      return;
    }
    let alive = true;
    listActiveColorsCabang(item.product_id)
      .then((res) => {
        if (!alive) return;
        if (res.status !== "ok" || !res.hasColorOptions || res.colors.length === 0) {
          setColorLoad({ status: res.status === "error" ? "error" : "idle" });
          return;
        }
        setColorLoad({ status: "ready", colors: res.colors });
      })
      .catch(() => {
        if (alive) setColorLoad({ status: "error" });
      });
    return () => {
      alive = false;
    };
  }, [item.product_id]);

  const selectedColor =
    colorLoad.status === "ready" ? colorLoad.colors.find((c) => c.code === colorText) : undefined;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!begin()) return;
    setErrs({});
    setNetMsg(null);
    const fd = new FormData(e.currentTarget);
    const out = await submitSafely({
      kind: "update",
      messages: m,
      buttonLabel: m.common.save,
      run: () =>
        updateOrderItemFields({
          itemId: item.id,
          quantity: String(fd.get("quantity") || ""),
          note: String(fd.get("note") || ""),
          colorCode: String(fd.get("color_code") || ""),
          customSize: String(fd.get("custom_size") || ""),
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
    onSaved();
  }

  async function onDelete() {
    if (!confirm(m.cabang.orderItemDeleteConfirm.replace("{name}", item.name_snapshot))) return;
    if (!begin()) return;
    setDeleting(true);
    setNetMsg(null);
    const out = await submitSafely({
      kind: "update",
      messages: m,
      buttonLabel: m.cabang.orderItemDeleteCta,
      run: () => deleteOrderItemCabang(item.id, orderId),
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
        <h2>{item.name_snapshot}</h2>
        {netMsg && <div className="banner warn">{netMsg}</div>}
        {errs._form && <div className="banner bad">{errs._form}</div>}
        <form onSubmit={onSubmit}>
          <div className={`field${errs.quantity ? " invalid" : ""}`}>
            <label htmlFor="ei_qty">{m.cabang.orderItemQtyFieldLabel}</label>
            <input id="ei_qty" name="quantity" type="number" min={1} defaultValue={item.quantity} />
            {errs.quantity && <div className="err-text">{errs.quantity}</div>}
          </div>
          <div className="field">
            <label htmlFor="ei_color">{m.cabang.orderItemColorFieldLabel}</label>
            {colorLoad.status === "ready" && (
              <div className="row" style={{ gap: 8, alignItems: "center", marginBottom: 6 }}>
                <select
                  value={colorLoad.colors.some((c) => c.code === colorText) ? colorText : ""}
                  onChange={(e) => setColorText(e.target.value)}
                  style={{ flex: 1 }}
                  aria-label={m.cabang.orderItemColorPickerAria}
                >
                  <option value="">{m.cabang.orderItemColorPickerPlaceholder}</option>
                  {colorLoad.colors.map((c) => (
                    <option key={c.id} value={c.code}>
                      {c.name ? `${c.code} — ${c.name}` : c.code}
                    </option>
                  ))}
                </select>
                {selectedColor?.photo_url && (
                  // eslint-disable-next-line @next/next/no-img-element -- lihat catatan di lib/catalog-shared.ts
                  <img
                    src={selectedColor.photo_url}
                    alt=""
                    style={{ width: 28, height: 28, borderRadius: "var(--r-sm)", objectFit: "cover", border: "1px solid var(--line)", flex: "none" }}
                  />
                )}
              </div>
            )}
            <input id="ei_color" name="color_code" type="text" value={colorText} onChange={(e) => setColorText(e.target.value)} />
            {colorLoad.status === "error" && <div className="hint">{m.cabang.orderItemColorLoadFailedNote}</div>}
          </div>
          <div className="field">
            <label htmlFor="ei_size">{m.cabang.orderItemSizeFieldLabel}</label>
            <input id="ei_size" name="custom_size" type="text" defaultValue={item.custom_size ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="ei_note">{m.cabang.orderItemNoteFieldLabel}</label>
            <textarea id="ei_note" name="note" defaultValue={item.note ?? ""} />
          </div>
          <div className="btnrow">
            <button type="button" className="btn" onClick={onClose} disabled={submitting}>
              {m.common.cancel}
            </button>
            <button type="button" className="btn danger" onClick={onDelete} disabled={submitting}>
              {deleting ? m.common.loading : m.cabang.orderItemDeleteCta}
            </button>
            <button type="submit" className="btn primary lg block" disabled={submitting}>
              {submitting ? m.common.saving : m.common.save}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
