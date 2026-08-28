"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { submitSafely } from "@/lib/safe-write";
import { useAdminMessages } from "@/lib/i18n/provider";
import { STOCK_STATUS_CHIP, stockStatusLabel, type StockStatus } from "@/lib/catalog-shared";
import { useCatalogSearch, type CatalogFetchResult } from "@/lib/use-catalog-search";
import {
  addPackageItem,
  updatePackageItemQuantity,
  removePackageItem,
} from "../../../../actions-package-items";
import { lookupByRequestId } from "../../../../actions-lookup";
import { getCatalogPageAdmin } from "../../../../catalog-actions";

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
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
        />
      )}
    </div>
  );
}

export default function PackageItemsClient({
  packageId,
  items,
  initialCatalog,
}: {
  packageId: string;
  items: PackageItem[];
  /** Batch pertama katalog dari server page; null = query awalnya gagal —
   *  client memuat sendiri saat mount (jalur retry, LESSONS #10). */
  initialCatalog: { products: CatalogProduct[]; hasMore: boolean } | null;
}) {
  const router = useRouter();
  const m = useAdminMessages();
  const { submitting, begin, release } = useSubmitGuard();
  const [netMsg, setNetMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // Pemilih produk
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [qty, setQty] = useState("1");
  const requestId = useRef<string | null>(null);

  // Jumlah per baris yang sedang diketik (belum disimpan).
  const [qtyDraft, setQtyDraft] = useState<Record<string, string>>({});

  // Pencarian kini dieksekusi DATABASE dengan batch 60 + "Muat Lebih Banyak"
  // (kontrak lib/catalog-query.ts, 2026-08-26 — menggantikan pola "muat utuh
  // lalu saring di client"). matchCategory:false mempertahankan semantik
  // pencarian lama layar ini: nama/kode saja, tanpa kategori (placeholder-nya
  // pun berbunyi begitu). Layar ini tidak punya baris chip kategori — hanya
  // pemuatan datanya yang berubah, UX-nya tetap.
  const fetchForHook = useCallback(
    async (input: { q: string; category: string | null; offset: number }): Promise<
      CatalogFetchResult<CatalogProduct>
    > => {
      try {
        const res = await getCatalogPageAdmin({ ...input, matchCategory: false });
        if (res.status === "ok") {
          return {
            ok: true,
            hasMore: res.hasMore,
            products: res.products.map((p) => ({
              id: p.id,
              name: p.name,
              code: p.code,
              photoUrl: p.photo_url,
              stockStatus: p.stock_status,
            })),
          };
        }
        if (res.status === "module_inactive") return { ok: false, message: m.admin.catalogMigrationMsg };
        return { ok: false, message: m.common.errorLoad };
      } catch {
        return { ok: false, message: m.common.errorLoad };
      }
    },
    [m]
  );

  const katalog = useCatalogSearch<CatalogProduct>({
    fetchPage: fetchForHook,
    initial: initialCatalog,
    fallbackErrorMessage: m.common.errorLoad,
  });
  const { ensureLoaded } = katalog;

  // Batch pertama server gagal → muat lewat action begitu komponen hidup
  // (idempoten; jalur happy tidak pernah fetch di paint pertama).
  useEffect(() => {
    if (initialCatalog === null) ensureLoaded();
  }, [initialCatalog, ensureLoaded]);

  const alreadyIn = useMemo(() => new Set(items.map((it) => it.productId)), [items]);

  // Produk yang SUDAH ada di package dikeluarkan dari hasil pencarian: lebih
  // ramah daripada membiarkan admin menambahkannya lalu ditolak server dengan
  // "sudah ada di package" (server tetap menolak — ini hanya lapisan UI).
  const pickable = useMemo(
    () => katalog.products.filter((p) => !alreadyIn.has(p.id)),
    [katalog.products, alreadyIn]
  );

  /** Keadaan pemilih, dari data yang SUDAH termuat + flag hasMore server. */
  const catalogLoading = !katalog.loadedOnce && katalog.searching;
  const catalogInitialError = !katalog.loadedOnce && !katalog.searching ? katalog.error : null;
  const catalogEmpty =
    katalog.loadedOnce && katalog.products.length === 0 && !katalog.isFiltered && !katalog.hasMore;
  const allAdded =
    katalog.loadedOnce &&
    !catalogEmpty &&
    pickable.length === 0 &&
    !katalog.isFiltered &&
    !katalog.hasMore;

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
      buttonLabel: m.common.add,
    });

    if (out.status === "confirmed") {
      requestId.current = null;
      setPickedId(null);
      setQty("1");
      katalog.setQuery("");
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
    katalog.setQuery("");
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
      buttonLabel: m.common.save,
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
      buttonLabel: m.admin.packageItemRemove,
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

        {catalogLoading ? (
          <div className="hint">{m.common.loading}</div>
        ) : catalogInitialError ? (
          <div className="banner bad">
            {catalogInitialError}
            <div className="btnrow-inline">
              <button type="button" className="btn sm" onClick={katalog.reload}>
                {m.common.retry}
              </button>
            </div>
          </div>
        ) : catalogEmpty ? (
          <div className="small muted">{m.admin.packageItemCatalogEmpty}</div>
        ) : allAdded ? (
          <div className="small muted">{m.admin.packageItemsAllAdded}</div>
        ) : (
          <>
            <div className="field">
              <label htmlFor="ppi_q">{m.common.search}</label>
              <input
                id="ppi_q"
                type="search"
                value={katalog.q}
                onChange={(e) => katalog.setQuery(e.target.value)}
                placeholder={m.admin.packageItemsSearchPlaceholder}
              />
            </div>

            {/* Pencarian gagal ≠ hasil kosong — daftar yang sudah termuat
                tetap tampil di bawah banner (jaringan lemah, LESSONS #10). */}
            {katalog.error && <div className="banner bad">{katalog.error}</div>}
            {katalog.searching && <div className="hint">{m.common.loading}</div>}

            {pickable.length === 0 && !katalog.hasMore ? (
              !katalog.searching && <div className="small muted">{m.admin.packageItemsNoMatch}</div>
            ) : (
              <div
                style={{
                  maxHeight: 320,
                  overflowY: "auto",
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                }}
              >
                {pickable.map((p) => {
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
                {katalog.hasMore && (
                  <div className="btnrow" style={{ justifyContent: "center", margin: "10px 0" }}>
                    <button
                      type="button"
                      className="btn sm"
                      onClick={katalog.loadMore}
                      disabled={katalog.loadingMore || katalog.searching}
                    >
                      {katalog.loadingMore ? m.common.loading : m.common.loadMoreCta}
                    </button>
                  </div>
                )}
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
