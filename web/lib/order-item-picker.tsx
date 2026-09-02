"use client";

/**
 * Isi Pesanan bersama untuk form Admin + Cabang.
 *
 * Row identity adalah `lineId`, bukan productId/colorCode. Ini wajib sejak
 * satu produk boleh dipilih sebagai beberapa baris independen dengan Qty,
 * harga, dan warna masing-masing. ProductId/warna adalah data yang boleh
 * berubah; menggunakannya sebagai identity akan membuat dua baris terlebur.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { STOCK_STATUS_CHIP, stockStatusLabel, type StockStatus } from "@/lib/catalog-shared";
import { useCatalogSearch, type CatalogFetchInput } from "@/lib/use-catalog-search";
import { useCommonMessages } from "@/lib/i18n/provider";
import { formatIDR, parseIDRInput } from "@/lib/orders-shared";
import {
  CALC_MAX_QTY,
  newCalcLineId,
  type ColorOptionRow,
  type FetchColorsFn,
} from "@/lib/calculator-shared";

export type PickerProduct = {
  id: string;
  name: string;
  code: string | null;
  category: string | null;
  photoUrl: string | null;
  stockStatus: StockStatus;
  price?: number | null;
};

export type PickedLine = {
  lineId: string;
  productId: string;
  name: string;
  code: string | null;
  unitPrice: number;
  qty: number;
  colorCode: string | null;
};

export type PickerLoadResult =
  | { ok: true; products: PickerProduct[]; hasMore: boolean; categories?: string[] }
  | { ok: false; message: string };

type MergeableHandoffLine = {
  lineId?: string;
  productId: string;
  name: string;
  code: string | null;
  unitPrice: number;
  qty: number;
  colorCode?: string | null;
};

/**
 * Hand-off rows stay rows. No merge by product/color: Qty belongs to the row.
 * Existing `lineId` is preserved; legacy/catalog hand-offs get a fresh one.
 * Collision on a corrupt/repeated lineId is repaired instead of editing two
 * rows through one React key.
 */
export function mergeLinesFromHandoff(prev: PickedLine[], handoffLines: MergeableHandoffLine[]): PickedLine[] {
  const next = [...prev];
  const used = new Set(next.map((l) => l.lineId));
  for (const h of handoffLines) {
    let lineId = h.lineId?.trim() || newCalcLineId();
    while (used.has(lineId)) lineId = newCalcLineId();
    used.add(lineId);
    next.push({
      lineId,
      productId: h.productId,
      name: h.name,
      code: h.code,
      unitPrice: h.unitPrice,
      qty: Math.max(1, Math.min(CALC_MAX_QTY, Math.round(h.qty) || 1)),
      colorCode: h.colorCode ?? null,
    });
  }
  return next;
}

function PickerThumb({
  url,
  name,
  muted,
  placeholder,
}: {
  url: string | null;
  name: string;
  muted: boolean;
  placeholder: string;
}) {
  const [broken, setBroken] = useState(false);
  const box: React.CSSProperties = {
    width: 48,
    height: 48,
    flex: "0 0 48px",
    borderRadius: "var(--r-sm)",
    background: "var(--surface2)",
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
  if (!url || broken) {
    return (
      <div style={box} aria-hidden="true">
        <span className="small muted" style={{ fontSize: 9, textAlign: "center", lineHeight: 1.2 }}>
          {placeholder}
        </span>
      </div>
    );
  }
  return (
    <div style={box}>
      {/* eslint-disable-next-line @next/next/no-img-element -- public SANCI catalog photo */}
      <img
        src={url}
        alt={name}
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          ...(muted ? { filter: "grayscale(70%)", opacity: 0.6 } : null),
        }}
      />
    </div>
  );
}

export default function OrderItemsSection({
  lines,
  onLinesChange,
  loadProducts,
  fetchColors,
}: {
  lines: PickedLine[];
  onLinesChange: (next: PickedLine[]) => void;
  loadProducts: (input: CatalogFetchInput) => Promise<PickerLoadResult>;
  fetchColors: FetchColorsFn;
}) {
  const m = useCommonMessages();
  const [open, setOpen] = useState(false);

  type ColorLoadState =
    | { status: "loading" }
    | { status: "idle" }
    | { status: "error" }
    | { status: "ready"; colors: ColorOptionRow[] };
  const [colorLoads, setColorLoads] = useState<Map<string, ColorLoadState>>(new Map());
  const fetchedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const productIds = Array.from(new Set(lines.map((l) => l.productId)));
    const toFetch = productIds.filter((id) => !fetchedRef.current.has(id));
    if (toFetch.length === 0) return;
    toFetch.forEach((id) => fetchedRef.current.add(id));
    setColorLoads((prev) => {
      const next = new Map(prev);
      toFetch.forEach((id) => next.set(id, { status: "loading" }));
      return next;
    });
    toFetch.forEach((id) => {
      fetchColors(id)
        .then((res) => {
          setColorLoads((prev) => {
            const next = new Map(prev);
            if (res.status !== "ok" || !res.hasColorOptions || res.colors.length === 0) {
              next.set(id, { status: res.status === "error" ? "error" : "idle" });
            } else {
              next.set(id, { status: "ready", colors: res.colors });
            }
            return next;
          });
        })
        .catch(() => setColorLoads((prev) => new Map(prev).set(id, { status: "error" })));
    });
  }, [lines, fetchColors]);

  const katalog = useCatalogSearch<PickerProduct>({
    fetchPage: loadProducts,
    initial: null,
    fallbackErrorMessage: m.errorLoad,
  });
  const { products, hasMore, searching, loadingMore, error, loadedOnce } = katalog;

  function handleOpen() {
    setOpen(true);
    katalog.ensureLoaded();
  }

  const categories = useMemo(
    () => [...katalog.categories].sort((a, b) => a.localeCompare(b, m.dateLocale)),
    [katalog.categories, m.dateLocale]
  );

  const initialLoading = !loadedOnce && searching;
  const initialError = !loadedOnce && !searching ? error : null;

  const qtyByProduct = useMemo(() => {
    const map = new Map<string, number>();
    lines.forEach((l) => map.set(l.productId, (map.get(l.productId) ?? 0) + l.qty));
    return map;
  }, [lines]);

  /** Product-list Add means quantity of the first row for that product. */
  function addProduct(p: PickerProduct) {
    const idx = lines.findIndex((l) => l.productId === p.id);
    if (idx >= 0) {
      const next = [...lines];
      next[idx] = { ...next[idx], qty: Math.min(CALC_MAX_QTY, next[idx].qty + 1) };
      onLinesChange(next);
      return;
    }
    onLinesChange([
      ...lines,
      {
        lineId: newCalcLineId(),
        productId: p.id,
        name: p.name,
        code: p.code,
        unitPrice: p.price ?? 0,
        qty: 1,
        colorCode: null,
      },
    ]);
  }

  function removeLine(lineId: string) {
    onLinesChange(lines.filter((l) => l.lineId !== lineId));
  }

  function setLineQty(lineId: string, qty: number) {
    const clamped = Math.max(1, Math.min(CALC_MAX_QTY, Math.round(qty) || 1));
    onLinesChange(lines.map((l) => (l.lineId === lineId ? { ...l, qty: clamped } : l)));
  }

  function setLineUnitPrice(lineId: string, raw: string) {
    const n = parseIDRInput(raw);
    onLinesChange(lines.map((l) => (l.lineId === lineId ? { ...l, unitPrice: n ?? 0 } : l)));
  }

  function setLineColor(lineId: string, newColorCode: string | null) {
    onLinesChange(lines.map((l) => (l.lineId === lineId ? { ...l, colorCode: newColorCode } : l)));
  }

  /** Every tap creates exactly one new independent row with Qty 1. */
  function addColorVariant(fromLine: PickedLine) {
    onLinesChange([
      ...lines,
      {
        lineId: newCalcLineId(),
        productId: fromLine.productId,
        name: fromLine.name,
        code: fromLine.code,
        unitPrice: fromLine.unitPrice,
        qty: 1,
        colorCode: null,
      },
    ]);
  }

  const stepBtn: React.CSSProperties = {
    width: "var(--tap)",
    height: "var(--tap)",
    border: "1px solid var(--line)",
    borderRadius: "var(--r-sm)",
    background: "var(--surface2)",
    color: "var(--ink)",
    fontSize: 16,
    lineHeight: 1,
    cursor: "pointer",
  };

  return (
    <div style={{ marginBottom: 18 }}>
      {lines.length === 0 ? (
        <p className="hint" style={{ marginBottom: 8 }}>{m.pickerEmptyHint}</p>
      ) : (
        lines.map((line) => {
          const lineKey = line.lineId;
          const colorLoad = colorLoads.get(line.productId);
          const colorReady = colorLoad?.status === "ready" ? colorLoad.colors : null;
          const selectedColor = colorReady?.find((c) => c.code === line.colorCode);
          return (
            <div
              key={lineKey}
              style={{
                border: "1px solid var(--line)",
                borderRadius: "var(--r-md)",
                padding: "10px 12px",
                marginBottom: 8,
              }}
            >
              <div style={{ fontWeight: 600 }}>
                {line.name} {line.code && <span className="code">{line.code}</span>}
              </div>

              {colorReady && (
                <div className="field" style={{ margin: "8px 0 0" }}>
                  <label htmlFor={`oi_color_${lineKey}`}>{m.calcColorFieldLabel}</label>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <select
                      id={`oi_color_${lineKey}`}
                      value={line.colorCode ?? ""}
                      onChange={(e) => setLineColor(line.lineId, e.target.value || null)}
                      style={{ flex: 1 }}
                      aria-label={m.calcColorPickerAria.replace("{name}", line.name)}
                    >
                      <option value="">{m.calcColorPickerPlaceholder}</option>
                      {colorReady.map((c) => (
                        <option key={c.id} value={c.code}>
                          {c.name ? `${c.code} — ${c.name}` : c.code}
                        </option>
                      ))}
                    </select>
                    {selectedColor?.photo_url && (
                      // eslint-disable-next-line @next/next/no-img-element -- public SANCI color photo
                      <img
                        src={selectedColor.photo_url}
                        alt=""
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: "var(--r-sm)",
                          objectFit: "cover",
                          border: "1px solid var(--line)",
                          flex: "none",
                        }}
                      />
                    )}
                  </div>
                </div>
              )}

              {colorLoad?.status === "error" && (
                <div className="hint" style={{ marginTop: 6 }}>{m.calcColorLoadFailedNote}</div>
              )}

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginTop: 8 }}>
                <div className="field" style={{ margin: 0, flex: "1 1 150px", minWidth: 130 }}>
                  <label htmlFor={`oi_price_${lineKey}`}>{m.calcUnitPriceLabel}</label>
                  <input
                    id={`oi_price_${lineKey}`}
                    type="text"
                    inputMode="numeric"
                    placeholder="Rp 0"
                    value={line.unitPrice ? formatIDR(line.unitPrice) : ""}
                    onChange={(e) => setLineUnitPrice(line.lineId, e.target.value)}
                  />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label htmlFor={`oi_qty_${lineKey}`}>{m.calcQtyLabel}</label>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <button type="button" style={stepBtn} onClick={() => setLineQty(line.lineId, line.qty - 1)} aria-label="−">−</button>
                    <input
                      id={`oi_qty_${lineKey}`}
                      type="number"
                      min={1}
                      max={CALC_MAX_QTY}
                      value={line.qty}
                      onChange={(e) => setLineQty(line.lineId, Number(e.target.value))}
                      style={{ width: 64, textAlign: "center" }}
                    />
                    <button type="button" style={stepBtn} onClick={() => setLineQty(line.lineId, line.qty + 1)} aria-label="+">+</button>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn sm"
                  style={{ marginLeft: "auto" }}
                  onClick={() => removeLine(line.lineId)}
                  aria-label={m.calcRemoveLineAria.replace("{name}", line.name)}
                >
                  {m.calcRemoveLineCta}
                </button>
              </div>

              {colorReady && (
                <div className="btnrow" style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => addColorVariant(line)}
                    aria-label={m.calcAddColorVariantAria.replace("{name}", line.name)}
                  >
                    {m.calcAddColorVariantCta}
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}

      <button type="button" className="btn" onClick={handleOpen}>{m.pickerOpenCta}</button>

      {open && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="modal tall" role="dialog" aria-modal="true" aria-label={m.calcGoToProductsCta}>
            <h2>{m.calcGoToProductsCta}</h2>

            {initialLoading && <div className="hint">{m.loading}</div>}
            {initialError && (
              <div className="banner bad">
                {initialError}
                <div className="btnrow-inline">
                  <button type="button" className="btn sm" onClick={katalog.reload}>{m.retry}</button>
                </div>
              </div>
            )}

            {loadedOnce && (
              <>
                <div className="searchrow" style={{ marginBottom: 10, flex: "none" }}>
                  <input
                    className="search-input"
                    type="search"
                    placeholder={m.produkSearchPlaceholder}
                    value={katalog.q}
                    onChange={(e) => katalog.setQuery(e.target.value)}
                  />
                </div>

                {categories.length > 0 && (
                  <div className="chipscroll" style={{ marginBottom: 10, flex: "none" }}>
                    <button
                      type="button"
                      className={`btn sm${katalog.category === null ? " primary" : ""}`}
                      onClick={() => katalog.setCategoryFilter(null)}
                    >
                      {m.filterAll}
                    </button>
                    {categories.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className={`btn sm${katalog.category === c ? " primary" : ""}`}
                        onClick={() => katalog.setCategoryFilter(katalog.category === c ? null : c)}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}

                {error && <div className="banner bad" style={{ flex: "none" }}>{error}</div>}
                {searching && <div className="hint" style={{ flex: "none" }}>{m.loading}</div>}

                <div className="modalbody">
                  {products.length === 0 ? (
                    !searching && (
                      <div className="emptybox">
                        {katalog.isFiltered ? m.noProductsMatchSearch : m.noProductsYet}
                      </div>
                    )
                  ) : (
                    <>
                      {products.map((p) => {
                        const inListQty = qtyByProduct.get(p.id) ?? 0;
                        const isOut = p.stockStatus === "OUT_OF_STOCK";
                        return (
                          <div
                            key={p.id}
                            style={{
                              display: "flex",
                              gap: 10,
                              alignItems: "center",
                              padding: "8px 2px",
                              borderBottom: "1px solid var(--line)",
                            }}
                          >
                            <PickerThumb url={p.photoUrl} name={p.name} muted={isOut} placeholder={m.noPhotoPlaceholder} />
                            <div style={{ flex: 1, minWidth: 0, ...(isOut ? { opacity: 0.6 } : null) }}>
                              <div style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{p.name}</div>
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 3 }}>
                                {p.code && <span className="code">{p.code}</span>}
                                <span className={STOCK_STATUS_CHIP[p.stockStatus]}>{stockStatusLabel({ common: m }, p.stockStatus)}</span>
                                {inListQty > 0 && <span className="small muted">×{inListQty}</span>}
                              </div>
                            </div>
                            <button type="button" className="btn sm primary" onClick={() => addProduct(p)} aria-label={m.pickerAddAria.replace("{name}", p.name)}>
                              {m.add}
                            </button>
                          </div>
                        );
                      })}

                      {hasMore && (
                        <div className="btnrow" style={{ justifyContent: "center", margin: "10px 0" }}>
                          <button type="button" className="btn sm" onClick={katalog.loadMore} disabled={loadingMore || searching}>
                            {loadingMore ? m.loading : m.loadMoreCta}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </>
            )}

            <div className="btnrow" style={{ marginTop: 14, flex: "none" }}>
              <button type="button" className="btn" onClick={() => setOpen(false)}>{m.close}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
