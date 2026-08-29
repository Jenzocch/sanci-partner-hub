"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { submitSafely } from "@/lib/safe-write";
import { useAdminMessages } from "@/lib/i18n/provider";
import { formatIDR, parseIDRInput } from "@/lib/orders-shared";
import { getOrderItem, addOrderItem, updateOrderItem, deleteOrderItem } from "../../actions-orders";

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
 *
 * Tabel di bawah tetap menampilkan `items` dari render halaman — itu memang
 * potret yang sedang dilihat admin. Yang TIDAK boleh mengambil nilai dari
 * potret itu adalah formulir Ubah; lihat catatan panjang di ItemModal.
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
  const m = useAdminMessages();
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
                  <td>
                    <span className="chip qty" aria-label={`${m.admin.orderItemColQty} ${it.quantity}`}>
                      ×{it.quantity}
                    </span>
                  </td>
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
          itemId={modal === "add" ? null : modal.id}
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

/**
 * `row: null` pada status "ready" hanya terjadi pada modus TAMBAH (tidak ada
 * baris untuk dimuat). Pada modus Ubah, baris yang tidak ditemukan dilaporkan
 * server sebagai error tersendiri ("sudah tidak ada"), bukan sebagai formulir
 * kosong — dua keadaan berbeda tidak boleh terlihat sama (LESSONS #10).
 */
type ItemLoad =
  | { status: "loading" }
  | { status: "error"; message?: string }
  | { status: "ready"; row: OrderItemRow | null };

/**
 * Modal Tambah/Ubah satu baris Isi Pesanan.
 *
 * Perbaikan 2026-08-29 — modus Ubah MEMUAT ULANG barisnya dari database tiap
 * kali dibuka, dan hanya menerima `itemId` (bukan lagi seluruh baris dari
 * daftar). Sebabnya sama dengan modal Penawaran SANCI di berkas sebelah:
 * updateOrderItem menulis KEDELAPAN kolom sekaligus tanpa membandingkan apa
 * pun, sedangkan `items` di halaman ini cuma potret saat render (halaman
 * tanpa polling/Realtime). Mengisi formulir dari potret itu berarti admin
 * yang cuma membetulkan catatan ikut mengirim balik unit_price/line_discount
 * versi lama — harga baris pesanan yang baru diubah orang lain hilang tanpa
 * error, tanpa peringatan, tanpa jejak di layar siapa pun.
 *
 * Polanya ditiru dari getProductBasePrice/ProductGalleryClient di
 * /admin/produk: muat malas saat mount, tiga keadaan dibedakan, dan saat
 * gagal formulirnya TIDAK dirender — mundur ke nilai daftar sama saja dengan
 * memasang kembali bug ini.
 */
function ItemModal({
  orderId,
  itemId,
  onClose,
  onSaved,
}: {
  orderId: string;
  /** null = modus Tambah (tidak ada yang perlu dimuat). */
  itemId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const m = useAdminMessages();
  const { submitting, begin, release } = useSubmitGuard();
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [netMsg, setNetMsg] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [load, setLoad] = useState<ItemLoad>(
    itemId ? { status: "loading" } : { status: "ready", row: null }
  );

  // "Coba Lagi" bisa ditekan dua kali; hanya pemuatan TERBARU yang boleh
  // menulis state, supaya respons lama tidak mendarat belakangan dan
  // menampilkan keadaan yang sudah tidak berlaku.
  const loadSeq = useRef(0);

  const loadFresh = useCallback(async () => {
    if (!itemId) return;
    const seq = ++loadSeq.current;
    setLoad({ status: "loading" });
    try {
      const res = await getOrderItem(itemId);
      if (seq !== loadSeq.current) return;
      if ("error" in res) {
        setLoad({ status: "error", message: res.error.message });
        return;
      }
      setLoad({ status: "ready", row: res.data });
    } catch {
      if (seq !== loadSeq.current) return;
      setLoad({ status: "error" });
    }
  }, [itemId]);

  useEffect(() => {
    void loadFresh();
  }, [loadFresh]);

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
    if (itemId) {
      const out = await submitSafely({
        kind: "update",
        messages: m,
        buttonLabel: m.common.save,
        run: () => updateOrderItem(itemId, input),
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
      buttonLabel: m.common.save,
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
    // Nama yang dikonfirmasi adalah nama yang BARU dimuat — kalau baris ini
    // sempat diubah namanya di tempat lain, dialog konfirmasi tidak boleh
    // menyebut nama lama.
    const row = load.status === "ready" ? load.row : null;
    if (!itemId || !row) return;
    if (!confirm(m.admin.orderItemDeleteConfirm.replace("{name}", row.name_snapshot))) return;
    if (!begin()) return;
    setDeleting(true);
    setNetMsg(null);
    const out = await submitSafely({
      kind: "update",
      messages: m,
      buttonLabel: m.admin.orderItemDeleteBtn,
      run: () => deleteOrderItem(itemId),
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

  // Prefill setiap kolom. Pada modus Tambah tetap null → kolom kosong, persis
  // seperti sebelumnya. Pada modus Ubah nilainya SELALU hasil pemuatan segar.
  const fresh = load.status === "ready" ? load.row : null;

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true">
        <h2>{itemId ? m.admin.orderItemModalTitleEdit : m.admin.orderItemModalTitleAdd}</h2>
        {netMsg && <div className="banner warn">{netMsg}</div>}
        {errs._form && <div className="banner bad">{errs._form}</div>}

        {load.status === "loading" && (
          <>
            <div className="hint">{m.common.loading}</div>
            <div className="btnrow">
              <button type="button" className="btn" onClick={onClose}>
                {m.common.cancel}
              </button>
            </div>
          </>
        )}

        {/* Gagal memuat = formulirnya tidak dirender sama sekali: tidak ada
            kolom untuk diisi, jadi tidak ada angka basi yang bisa terkirim
            balik ke database (LESSONS #10 + #7). */}
        {load.status === "error" && (
          <>
            <div className="banner bad">{load.message ?? m.admin.orderItemLoadFailed}</div>
            <div className="btnrow">
              <button type="button" className="btn" onClick={onClose}>
                {m.common.close}
              </button>
              <button type="button" className="btn primary" onClick={loadFresh}>
                {m.common.retry}
              </button>
            </div>
          </>
        )}

        {load.status === "ready" && (
          <form onSubmit={onSubmit}>
            <div className={`field${errs.name ? " invalid" : ""}`}>
              <label htmlFor="oi_name">{m.admin.orderItemNameFieldLabel} *</label>
              <input id="oi_name" name="name" type="text" defaultValue={fresh?.name_snapshot ?? ""} />
              {errs.name && <div className="err-text">{errs.name}</div>}
            </div>
            <div className="field">
              <label htmlFor="oi_code">{m.common.code}</label>
              <input id="oi_code" name="code" type="text" defaultValue={fresh?.code_snapshot ?? ""} />
            </div>
            <div className={`field${errs.quantity ? " invalid" : ""}`}>
              <label htmlFor="oi_qty">{m.admin.orderItemQtyFieldLabel}</label>
              <input id="oi_qty" name="quantity" type="number" min={1} defaultValue={fresh?.quantity ?? 1} />
              {errs.quantity && <div className="err-text">{errs.quantity}</div>}
            </div>
            <div className="field">
              <label htmlFor="oi_color">{m.admin.orderItemColorFieldLabel}</label>
              <input id="oi_color" name="color_code" type="text" defaultValue={fresh?.color_code ?? ""} />
            </div>
            <div className="field">
              <label htmlFor="oi_size">{m.admin.orderItemSizeFieldLabel}</label>
              <input id="oi_size" name="custom_size" type="text" defaultValue={fresh?.custom_size ?? ""} />
            </div>
            <div className={`field${errs.unit_price ? " invalid" : ""}`}>
              <label htmlFor="oi_unit_price">{m.admin.orderItemUnitPriceFieldLabel}</label>
              <input
                id="oi_unit_price"
                name="unit_price"
                type="text"
                inputMode="numeric"
                defaultValue={fresh?.unit_price != null ? formatIDR(fresh.unit_price) : ""}
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
                defaultValue={fresh?.line_discount != null ? formatIDR(fresh.line_discount) : ""}
                onChange={handleAmountChange}
              />
              {errs.line_discount && <div className="err-text">{errs.line_discount}</div>}
            </div>
            <div className="field">
              <label htmlFor="oi_note">{m.admin.orderItemNoteFieldLabel}</label>
              <textarea id="oi_note" name="note" defaultValue={fresh?.note ?? ""} />
            </div>
            <div className="btnrow">
              <button type="button" className="btn" onClick={onClose} disabled={submitting}>
                {m.common.cancel}
              </button>
              {fresh && (
                <button type="button" className="btn danger" onClick={onDelete} disabled={submitting}>
                  {deleting ? m.common.loading : m.admin.orderItemDeleteBtn}
                </button>
              )}
              <button type="submit" className="btn primary lg block" disabled={submitting}>
                {submitting ? m.common.saving : m.common.save}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
