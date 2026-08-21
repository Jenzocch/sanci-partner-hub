"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { submitSafely } from "@/lib/safe-write";
import { useMessages } from "@/lib/i18n/provider";
import { STOCK_STATUS_CHIP, stockStatusLabel, type StockStatus } from "@/lib/catalog-shared";
import {
  addPackageItem,
  updatePackageItemQuantity,
  removePackageItem,
} from "../../../../actions-package-items";
import { lookupByRequestId } from "../../../../actions-lookup";

export type PackageItem = {
  id: string;
  quantity: number;
  productId: string;
  productName: string;
  productCode: string | null;
  photoUrl: string | null;
  productStatus: string;
};

export type CatalogProduct = {
  id: string;
  name: string;
  code: string | null;
  photoUrl: string | null;
  stockStatus: StockStatus;
};

/**
 * Thumbnail kecil untuk baris isi package. Sengaja tidak memakai
 * app/admin/produk/product-photo.tsx apa adanya: komponen itu mengunci
 * aspect-ratio 4/3 selebar kartu grid, sedangkan di sini yang dibutuhkan
 * kotak kecil sejajar teks. Perilaku "foto gagal dimuat → placeholder,
 * bukan ikon rusak bawaan browser" tetap sama.
 */
function Thumb({ url, name }: { url: string | null; name: string }) {
  const [gagal, setGagal] = useState(false);
  const kosong = !url || gagal;
  return (
    <div
      style={{
        width: 48,
        height: 48,
        flex: "none",
        borderRadius: 6,
        overflow: "hidden",
        background: "var(--surface2)",
        border: "1px solid var(--line)",
      }}
    >
      {kosong ? null : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url ?? undefined}
          alt={name}
          loading="lazy"
          decoding="async"
          onError={() => setGagal(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      )}
    </div>
  );
}

export default function PackageItemsClient({
  packageId,
  items,
  catalog,
}: {
  packageId: string;
  items: PackageItem[];
  catalog: CatalogProduct[];
}) {
  const router = useRouter();
  const m = useMessages();
  const { submitting, begin, release } = useSubmitGuard();
  const [netMsg, setNetMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // Pemilih produk
  const [q, setQ] = useState("");
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [qty, setQty] = useState("1");
  const requestId = useRef<string | null>(null);

  // Jumlah per baris yang sedang diketik (belum disimpan).
  const [qtyDraft, setQtyDraft] = useState<Record<string, string>>({});

  const alreadyIn = useMemo(() => new Set(items.map((it) => it.productId)), [items]);

  // Produk yang SUDAH ada di package dikeluarkan dari hasil pencarian: lebih
  // ramah daripada membiarkan admin menambahkannya lalu ditolak server dengan
  // "sudah ada di package" (server tetap menolak — ini hanya lapisan UI).
  const pickable = useMemo(() => catalog.filter((p) => !alreadyIn.has(p.id)), [catalog, alreadyIn]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return pickable;
    return pickable.filter(
      (p) =>
        p.name.toLowerCase().includes(needle) ||
        (p.code ? p.code.toLowerCase().includes(needle) : false)
    );
  }, [pickable, q]);

  function resetPesan() {
    setNetMsg(null);
    setErrMsg(null);
  }

  async function onAdd() {
    const productId = pickedId;
    if (!productId) return;
    if (!begin()) return;
    resetPesan();
    if (!requestId.current) requestId.current = crypto.randomUUID();
    const rid = requestId.current;

    const out = await submitSafely({
      run: () => addPackageItem(packageId, productId, Number(qty), rid),
      lookup: () => lookupByRequestId("packageItem", rid),
      messages: m,
    });

    if (out.status === "confirmed") {
      requestId.current = null;
      setPickedId(null);
      setQty("1");
      setQ("");
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
    // Sukses: nomor permintaan dibuang supaya penambahan berikutnya punya
    // identitas sendiri (kalau dipakai ulang, server akan menganggapnya retry).
    requestId.current = null;
    release();
    setPickedId(null);
    setQty("1");
    setQ("");
    router.refresh();
  }

  async function onSaveQty(item: PackageItem) {
    const raw = qtyDraft[item.id];
    if (raw === undefined) return;
    const next = Number(raw);
    if (next === item.quantity) {
      setQtyDraft((d) => {
        const c = { ...d };
        delete c[item.id];
        return c;
      });
      return;
    }
    if (!begin()) return;
    resetPesan();
    const out = await submitSafely({
      kind: "update",
      run: () => updatePackageItemQuantity(item.id, next),
      messages: m,
    });
    release();
    if (out.status !== "ok") {
      setNetMsg(out.message);
      return;
    }
    const res = out.result;
    if ("error" in res) {
      setErrMsg(res.error.message);
      return;
    }
    setQtyDraft((d) => {
      const c = { ...d };
      delete c[item.id];
      return c;
    });
    router.refresh();
  }

  async function onRemove(item: PackageItem) {
    if (!confirm(m.admin.packageItemRemoveConfirm.replace("{name}", item.productName))) return;
    if (!begin()) return;
    resetPesan();
    const out = await submitSafely({
      kind: "update",
      run: () => removePackageItem(item.id),
      messages: m,
    });
    release();
    if (out.status !== "ok") {
      setNetMsg(out.message);
      return;
    }
    const res = out.result;
    if ("error" in res) {
      setErrMsg(res.error.message);
      return;
    }
    router.refresh();
  }

  return (
    <div>
      {netMsg && <div className="banner warn">{netMsg}</div>}
      {errMsg && <div className="banner bad">{errMsg}</div>}

      {/* ── Daftar isi package ── */}
      {items.length === 0 ? (
        <div className="card emptybox">{m.admin.packageItemsEmpty}</div>
      ) : (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>{m.common.name}</th>
                <th>{m.common.code}</th>
                <th>{m.common.quantity}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const draftVal = qtyDraft[it.id];
                const berubah = draftVal !== undefined && Number(draftVal) !== it.quantity;
                return (
                  <tr key={it.id}>
                    <td style={{ width: 60 }}>
                      <Thumb url={it.photoUrl} name={it.productName} />
                    </td>
                    <td style={{ fontWeight: 650 }}>
                      {it.productName}
                      {it.productStatus !== "ACTIVE" && (
                        <>
                          {" "}
                          <span className="chip INACTIVE">{m.common.statusInactive}</span>
                        </>
                      )}
                    </td>
                    <td>{it.productCode ? <span className="code">{it.productCode}</span> : "—"}</td>
                    <td>
                      <div className="btnrow-inline" style={{ marginTop: 0 }}>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          inputMode="numeric"
                          value={draftVal ?? String(it.quantity)}
                          onChange={(e) =>
                            setQtyDraft((d) => ({ ...d, [it.id]: e.target.value }))
                          }
                          style={{ width: 84 }}
                          aria-label={m.common.quantity}
                        />
                        {berubah && (
                          <button
                            className="btn sm primary"
                            onClick={() => onSaveQty(it)}
                            disabled={submitting}
                          >
                            {submitting ? m.common.saving : m.common.save}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="ta-right">
                      <button className="btn sm" onClick={() => onRemove(it)} disabled={submitting}>
                        {m.admin.packageItemRemove}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Tambah produk ── */}
      <div className="card" style={{ marginTop: 18 }}>
        <h2>{m.admin.packageItemsAdd}</h2>

        {catalog.length === 0 ? (
          <div className="small muted">{m.admin.packageItemCatalogEmpty}</div>
        ) : pickable.length === 0 ? (
          <div className="small muted">{m.admin.packageItemsAllAdded}</div>
        ) : (
          <>
            <div className="field">
              <label htmlFor="ppi_q">{m.common.search}</label>
              <input
                id="ppi_q"
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={m.admin.packageItemsSearchPlaceholder}
              />
            </div>

            {filtered.length === 0 ? (
              <div className="small muted">{m.admin.packageItemsNoMatch}</div>
            ) : (
              <div
                style={{
                  maxHeight: 320,
                  overflowY: "auto",
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                }}
              >
                {filtered.map((p) => {
                  const dipilih = pickedId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPickedId(dipilih ? null : p.id)}
                      aria-pressed={dipilih}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        width: "100%",
                        textAlign: "left",
                        padding: "8px 10px",
                        border: "none",
                        borderBottom: "1px solid var(--line)",
                        background: dipilih ? "var(--surface2)" : "transparent",
                        cursor: "pointer",
                      }}
                    >
                      <Thumb url={p.photoUrl} name={p.name} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontWeight: 650, display: "block" }}>{p.name}</span>
                        {p.code && <span className="code small">{p.code}</span>}
                      </span>
                      <span className={STOCK_STATUS_CHIP[p.stockStatus]}>
                        {stockStatusLabel(m, p.stockStatus)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="btnrow" style={{ alignItems: "flex-end" }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="ppi_qty">{m.common.quantity}</label>
                <input
                  id="ppi_qty"
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  style={{ width: 100 }}
                />
              </div>
              <button
                className="btn primary"
                onClick={onAdd}
                disabled={submitting || !pickedId}
              >
                {submitting ? m.common.saving : m.common.add}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
