"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { STOCK_STATUS_CHIP, stockStatusLabel, type StockStatus } from "@/lib/catalog-shared";
import type { CatalogPageInput, CatalogPageOutcome } from "@/lib/catalog-query";
import { useCatalogSearch, type CatalogFetchResult } from "@/lib/use-catalog-search";
import { useCommonMessages } from "@/lib/i18n/provider";
import { formatIDR, parseIDRInput } from "@/lib/orders-shared";
import DraftBanner from "@/lib/draft-banner";
import {
  CALC_MAX_DISCOUNT_SLOTS,
  CALC_MAX_QTY,
  CALC_DRAFT_DEBOUNCE_MS,
  discountChainMultiplier,
  computeChainFinal,
  emptyCartState,
  newCalcLineId,
  readCalcDraft,
  writeCalcDraft,
  clearCalcDraft,
  writeCalcHandoff,
  type CalcArea,
  type CalcLine,
  type CalcCartState,
  type CalcDraft,
  type ColorOptionRow,
  type FetchColorsFn,
} from "@/lib/calculator-shared";
import { writeProposalHandoff } from "@/lib/proposal-shared";
import { takeCalcPrefill } from "@/lib/calc-prefill";
import styles from "./kalkulator.module.css";

export type KalkulatorProduct = {
  id: string;
  name: string;
  code: string | null;
  category: string | null;
  photoUrl: string | null;
  stockStatus: StockStatus;
  price?: number | null;
};

export type KalkulatorConvert = { cta: string; scopeNote: string; href: string };
export type KalkulatorProposal = { cta: string; href: string; saveFailed: string };
export type KalkulatorFetchMessages = {
  notOpened?: string;
  moduleInactive: string;
  loadFailed: string;
};

export default function KalkulatorClient({
  initialProducts,
  initialHasMore,
  initialCategories,
  fetchPage,
  fetchMessages,
  area,
  convert,
  proposal = null,
  fetchColors,
}: {
  initialProducts: KalkulatorProduct[];
  initialHasMore: boolean;
  initialCategories: string[];
  fetchPage: (input: CatalogPageInput) => Promise<CatalogPageOutcome>;
  fetchMessages: KalkulatorFetchMessages;
  area: CalcArea;
  convert: KalkulatorConvert | null;
  proposal?: KalkulatorProposal | null;
  fetchColors: FetchColorsFn;
}) {
  const m = useCommonMessages();
  const router = useRouter();

  const [tab, setTab] = useState<"produk" | "keranjang">("produk");
  const [lines, setLines] = useState<CalcLine[]>([]);
  const [discountSlots, setDiscountSlots] = useState<string[]>([""]);
  const [markup, setMarkup] = useState("");
  const [cash, setCash] = useState("");
  const [proposalErr, setProposalErr] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<{
    n: number;
    skipped: number;
    merged: number;
    customerName: string;
  } | null>(null);

  const [pendingDraft, setPendingDraft] = useState<CalcDraft | null>(null);
  const [ready, setReady] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const pre = takeCalcPrefill(area);
    if (pre) {
      if (pre.lines.length > 0) {
        // Satu order_item = satu baris kalkulator. Jangan gabungkan lagi
        // berdasarkan productId/warna: Qty setiap baris harus tetap milik
        // barisnya sendiri. Prefill lama yang belum punya lineId diberi id
        // baru sekali saat dituangkan ke state ini.
        const restored: CalcLine[] = pre.lines.map((l) => ({
          lineId: typeof l.lineId === "string" && l.lineId ? l.lineId : newCalcLineId(),
          productId: l.productId,
          name: l.name,
          code: l.code,
          photoUrl: null,
          unitPrice: 0,
          qty: Math.min(CALC_MAX_QTY, l.qty),
          colorCode: l.colorCode,
        }));
        setLines(restored);
        setTab("keranjang");
        setPrefill({
          n: restored.length,
          skipped: pre.skipped,
          merged: 0,
          customerName: pre.customerName,
        });
        setReady(true);
        return;
      }
      setPrefill({ n: 0, skipped: pre.skipped, merged: 0, customerName: pre.customerName });
      setReady(true);
      return;
    }
    const d = readCalcDraft(area);
    if (d) setPendingDraft(d);
    else setReady(true);
  }, [area]);

  function handleRestoreDraft() {
    if (pendingDraft) {
      setLines(pendingDraft.state.lines);
      setDiscountSlots(pendingDraft.state.discountSlots.length ? pendingDraft.state.discountSlots : [""]);
      setMarkup(pendingDraft.state.markup);
      setCash(pendingDraft.state.cash);
    }
    setPendingDraft(null);
    setReady(true);
  }

  function handleDiscardDraft() {
    clearCalcDraft(area);
    setPendingDraft(null);
    setReady(true);
  }

  useEffect(() => {
    if (!ready) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      writeCalcDraft(area, { lines, discountSlots, markup, cash });
    }, CALC_DRAFT_DEBOUNCE_MS);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [ready, area, lines, discountSlots, markup, cash]);

  const fetchForHook = useCallback(
    async (input: { q: string; category: string | null; offset: number; withCategories?: boolean }): Promise<
      CatalogFetchResult<KalkulatorProduct>
    > => {
      try {
        const res = await fetchPage({ ...input, withPrices: true });
        if (res.status === "ok") {
          return {
            ok: true,
            hasMore: res.hasMore,
            categories: res.categories,
            products: res.products.map((p) => ({
              id: p.id,
              name: p.name,
              code: p.code,
              category: p.category,
              photoUrl: p.photo_url,
              stockStatus: p.stock_status,
              price: p.price ?? null,
            })),
          };
        }
        if (res.status === "not_opened") return { ok: false, message: fetchMessages.notOpened ?? fetchMessages.loadFailed };
        if (res.status === "module_inactive") return { ok: false, message: fetchMessages.moduleInactive };
        return { ok: false, message: fetchMessages.loadFailed };
      } catch {
        return { ok: false, message: fetchMessages.loadFailed };
      }
    },
    [fetchPage, fetchMessages]
  );

  const katalog = useCatalogSearch<KalkulatorProduct>({
    fetchPage: fetchForHook,
    initial: { products: initialProducts, hasMore: initialHasMore },
    initialCategories,
    fallbackErrorMessage: fetchMessages.loadFailed,
  });
  const { products, hasMore, searching, loadingMore, error: catalogError } = katalog;
  const q = katalog.q;
  const kategori = katalog.category;

  const categories = useMemo(
    () => [...katalog.categories].sort((a, b) => a.localeCompare(b, m.dateLocale)),
    [katalog.categories, m.dateLocale]
  );

  // Kartu produk hanya mengendalikan Qty baris yang BELUM diberi warna.
  // Kalau ada lebih dari satu baris belum berwarna, jumlahnya dijumlahkan
  // supaya badge tidak menampilkan Qty baris terakhir saja.
  const cartQtyByProduct = useMemo(() => {
    const map = new Map<string, number>();
    lines.forEach((l) => {
      if (l.colorCode === null) map.set(l.productId, (map.get(l.productId) ?? 0) + l.qty);
    });
    return map;
  }, [lines]);

  type ColorLoadState = { status: "loading" } | { status: "idle" } | { status: "error" } | { status: "ready"; colors: ColorOptionRow[] };
  const [colorLoads, setColorLoads] = useState<Map<string, ColorLoadState>>(new Map());
  const colorFetchedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const productIds = Array.from(new Set(lines.map((l) => l.productId)));
    const toFetch = productIds.filter((id) => !colorFetchedRef.current.has(id));
    if (toFetch.length === 0) return;
    toFetch.forEach((id) => colorFetchedRef.current.add(id));
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

  function addToCart(p: KalkulatorProduct) {
    setClearedSnapshot(null);
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.productId === p.id && l.colorCode === null);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: Math.min(CALC_MAX_QTY, next[idx].qty + 1) };
        return next;
      }
      return [
        ...prev,
        {
          lineId: newCalcLineId(),
          productId: p.id,
          name: p.name,
          code: p.code,
          photoUrl: p.photoUrl,
          unitPrice: p.price ?? 0,
          qty: 1,
          colorCode: null,
        },
      ];
    });
  }

  function removeLine(lineId: string) {
    setLines((prev) => prev.filter((l) => l.lineId !== lineId));
  }

  function decLineOnCard(productId: string) {
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.productId === productId && l.colorCode === null);
      if (idx < 0) return prev;
      const next = [...prev];
      if (next[idx].qty <= 1) return next.filter((_, i) => i !== idx);
      next[idx] = { ...next[idx], qty: next[idx].qty - 1 };
      return next;
    });
  }

  function goToCart() {
    setTab("keranjang");
    window.scrollTo({ top: 0 });
  }

  function setLineUnitPrice(lineId: string, raw: string) {
    const n = parseIDRInput(raw);
    setLines((prev) => prev.map((l) => (l.lineId === lineId ? { ...l, unitPrice: n ?? 0 } : l)));
  }

  function setLineQty(lineId: string, qty: number) {
    const clamped = Math.max(1, Math.min(CALC_MAX_QTY, Math.round(qty) || 1));
    setLines((prev) => prev.map((l) => (l.lineId === lineId ? { ...l, qty: clamped } : l)));
  }

  function setLineColor(lineId: string, newColorCode: string | null) {
    setLines((prev) => prev.map((l) => (l.lineId === lineId ? { ...l, colorCode: newColorCode } : l)));
  }

  /**
   * Owner rule 2026-09-02: tiap tekan = SATU baris baru Qty 1. Tidak boleh
   * menambah Qty ke baris kosong yang sudah ada. Karena identitasnya lineId,
   * lima baris kosong bisa hidup bersamaan lalu diberi lima warna berbeda.
   */
  function addColorVariant(fromLine: CalcLine) {
    setLines((prev) => [
      ...prev,
      {
        lineId: newCalcLineId(),
        productId: fromLine.productId,
        name: fromLine.name,
        code: fromLine.code,
        photoUrl: fromLine.photoUrl,
        unitPrice: fromLine.unitPrice,
        qty: 1,
        colorCode: null,
      },
    ]);
  }

  function addDiscountSlot() {
    setDiscountSlots((slots) => (slots.length >= CALC_MAX_DISCOUNT_SLOTS ? slots : [...slots, ""]));
  }
  function removeDiscountSlot(idx: number) {
    setDiscountSlots((slots) => slots.filter((_, i) => i !== idx));
  }

  const [confirmClear, setConfirmClear] = useState(false);
  const [clearedSnapshot, setClearedSnapshot] = useState<CalcCartState | null>(null);
  const [photoView, setPhotoView] = useState<{ name: string; url: string } | null>(null);

  function handleClearCartConfirmed() {
    setClearedSnapshot({ lines, discountSlots, markup, cash });
    const empty: CalcCartState = emptyCartState();
    setLines(empty.lines);
    setDiscountSlots(empty.discountSlots);
    setMarkup(empty.markup);
    setCash(empty.cash);
    clearCalcDraft(area);
    setConfirmClear(false);
  }
  function handleUndoClear() {
    if (!clearedSnapshot) return;
    setLines(clearedSnapshot.lines);
    setDiscountSlots(clearedSnapshot.discountSlots.length ? clearedSnapshot.discountSlots : [""]);
    setMarkup(clearedSnapshot.markup);
    setCash(clearedSnapshot.cash);
    setClearedSnapshot(null);
  }

  const parsedDiscounts = discountSlots
    .map((s) => Number(s.trim().replace(",", ".")))
    .filter((n) => Number.isFinite(n) && n > 0 && n < 100);
  const markupTrimmed = markup.trim();
  const parsedMarkupRaw = markupTrimmed === "" ? 0 : Number(markupTrimmed.replace(",", "."));
  const parsedMarkup = Number.isFinite(parsedMarkupRaw) ? parsedMarkupRaw : 0;
  const markupOutOfRange = markupTrimmed !== "" && (!Number.isFinite(parsedMarkupRaw) || parsedMarkupRaw < 0 || parsedMarkupRaw > 100);
  const parsedCash = parseIDRInput(cash) ?? 0;

  const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0);
  const itemQty = lines.reduce((sum, l) => sum + l.qty, 0);
  const mult = discountChainMultiplier(parsedDiscounts);
  const afterDiscountDisplay = Math.round(subtotal * mult);
  const afterMarkupDisplay = Math.round(subtotal * mult * (1 + parsedMarkup / 100));
  const finalTotal = computeChainFinal(subtotal, parsedDiscounts, parsedMarkup, parsedCash);
  const finalDisplay = Math.max(finalTotal, 0);

  let discountRunning = subtotal;
  const discountSteps = parsedDiscounts.map((pct, i) => {
    const before = discountRunning;
    discountRunning = before * (1 - pct / 100);
    return { n: i + 1, pct, amount: Math.round(before - discountRunning) };
  });
  const totalDiscountAmount = subtotal - afterDiscountDisplay;

  function handleMakeProposal() {
    if (!proposal || lines.length === 0) return;
    const ok = writeProposalHandoff({
      customerName: prefill?.customerName ?? "",
      subtotal,
      discountPcts: parsedDiscounts,
      totalDiscountAmount,
      markupPct: markupTrimmed === "" ? null : parsedMarkup,
      cashDiscount: parsedCash,
      finalAmount: finalDisplay,
      lines: lines.map((l) => ({
        lineId: l.lineId,
        productId: l.productId,
        name: l.name,
        code: l.code,
        unitPrice: l.unitPrice,
        qty: l.qty,
        colorCode: l.colorCode,
      })),
    });
    if (!ok) {
      setProposalErr(proposal.saveFailed);
      return;
    }
    setProposalErr(null);
    router.push(proposal.href);
  }

  function handleConvertToOrder() {
    if (!convert || lines.length === 0) return;
    writeCalcHandoff(area, {
      lineCount: lines.length,
      itemQty,
      subtotal,
      discountPcts: parsedDiscounts,
      markupPct: markupTrimmed === "" ? null : parsedMarkup,
      cashDiscount: parsedCash,
      finalAmount: finalDisplay,
      lines: lines.map((l) => ({
        lineId: l.lineId,
        productId: l.productId,
        name: l.name,
        code: l.code,
        unitPrice: l.unitPrice,
        qty: l.qty,
        colorCode: l.colorCode,
      })),
    });
    router.push(convert.href);
  }

  return (
    <>
      <DraftBanner
        draft={pendingDraft ? { savedAt: pendingDraft.savedAt, values: {} } : null}
        onRestore={handleRestoreDraft}
        onDiscard={handleDiscardDraft}
      />

      {prefill && (
        <div className="banner info">
          {prefill.n > 0 && m.calcPrefillBanner.replace("{n}", String(prefill.n))}
          {prefill.merged > 0 && (
            <div style={{ marginTop: prefill.n > 0 ? 6 : 0 }}>
              {m.calcPrefillMerged.replace("{n}", String(prefill.merged))}
            </div>
          )}
          {prefill.skipped > 0 && (
            <div style={{ marginTop: prefill.n > 0 || prefill.merged > 0 ? 6 : 0 }}>
              {m.calcPrefillSkipped.replace("{n}", String(prefill.skipped))}
            </div>
          )}
          <div className="btnrow-inline">
            <button type="button" className="btn sm" onClick={() => setPrefill(null)}>{m.close}</button>
          </div>
        </div>
      )}

      <div className="tabs">
        <button type="button" className={`tab${tab === "produk" ? " on" : ""}`} onClick={() => setTab("produk")}>
          {m.calcTabProducts}
        </button>
        <button type="button" className={`tab${tab === "keranjang" ? " on" : ""}`} onClick={() => setTab("keranjang")}>
          {m.calcTabCart.replace("{n}", String(lines.length))}
        </button>
      </div>

      {tab === "produk" ? (
        <>
          <div className="searchrow">
            <input className="search-input" type="search" placeholder={m.produkSearchPlaceholder} value={q} onChange={(e) => katalog.setQuery(e.target.value)} />
          </div>

          {categories.length > 0 && (
            <div className={styles.filters}>
              <button type="button" className={`${styles.filterchip}${kategori === null ? ` ${styles.filterOn}` : ""}`} onClick={() => katalog.setCategoryFilter(null)}>
                {m.filterAll}
              </button>
              {categories.map((c) => (
                <button key={c} type="button" className={`${styles.filterchip}${kategori === c ? ` ${styles.filterOn}` : ""}`} onClick={() => katalog.setCategoryFilter(kategori === c ? null : c)}>
                  {c}
                </button>
              ))}
            </div>
          )}

          {catalogError && <div className="banner bad">{catalogError}</div>}
          {searching && <div className="hint">{m.loading}</div>}

          {products.length === 0 ? (
            !searching && <div className="card emptybox">{katalog.isFiltered ? m.noProductsMatchSearch : m.noProductsYet}</div>
          ) : (
            <div className={styles.grid}>
              {products.map((p) => {
                const inCartQty = cartQtyByProduct.get(p.id) ?? 0;
                const isOut = p.stockStatus === "OUT_OF_STOCK";
                const clickable = inCartQty === 0;
                return (
                  <div
                    key={p.id}
                    role={clickable ? "button" : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    className={`${styles.card}${inCartQty > 0 ? ` ${styles.inCart}` : ""}`}
                    onClick={clickable ? () => addToCart(p) : undefined}
                    onKeyDown={clickable ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        addToCart(p);
                      }
                    } : undefined}
                    aria-label={clickable ? m.calcAddToCartAria.replace("{name}", p.name) : undefined}
                  >
                    <div className={styles.photo}>
                      {inCartQty > 0 && (
                        <span className={styles.cardStepper}>
                          <button type="button" className={styles.stepBtn} onClick={() => decLineOnCard(p.id)} aria-label="−">−</button>
                          <span className={styles.cardStepperQty}>×{inCartQty}</span>
                          <button type="button" className={styles.stepBtn} onClick={() => addToCart(p)} aria-label="+">+</button>
                        </span>
                      )}
                      {p.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.photoUrl} alt={p.name} loading="lazy" style={isOut ? { filter: "grayscale(70%)", opacity: 0.6 } : undefined} />
                      ) : <div className={styles.placeholder}>{m.noPhotoPlaceholder}</div>}
                    </div>
                    <div className={styles.body}>
                      <div className={styles.name}>{p.name}</div>
                      <div className={styles.metaRow}>
                        {p.code && <span className="code">{p.code}</span>}
                        <span className={STOCK_STATUS_CHIP[p.stockStatus]}>{stockStatusLabel({ common: m }, p.stockStatus)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {hasMore && products.length > 0 && (
            <div className="btnrow" style={{ justifyContent: "center", marginTop: 14 }}>
              <button type="button" className="btn" onClick={katalog.loadMore} disabled={loadingMore || searching}>
                {loadingMore ? m.loading : m.loadMoreCta}
              </button>
            </div>
          )}
        </>
      ) : lines.length === 0 ? (
        <>
          {clearedSnapshot && (
            <div className="banner warn">
              {m.calcClearedUndoMsg}
              <div className="btnrow-inline" style={{ marginTop: 9 }}>
                <button type="button" className="btn sm" onClick={handleUndoClear}>{m.calcClearedUndoCta}</button>
              </div>
            </div>
          )}
          <div className="card emptybox">
            <p style={{ marginBottom: 14 }}>{m.calcCartEmpty}</p>
            <button type="button" className="btn primary" onClick={() => setTab("produk")}>{m.calcGoToProductsCta}</button>
          </div>
        </>
      ) : (
        <>
          <div className="card">
            <div className="spread" style={{ marginBottom: 4 }}>
              <h3 style={{ fontSize: 17 }}>{m.calcCartCardTitle}</h3>
              {!confirmClear && <button type="button" className="btn sm ghost" onClick={() => setConfirmClear(true)}>{m.calcClearCartCta}</button>}
            </div>
            {confirmClear && (
              <div className="banner warn" style={{ marginBottom: 10 }}>
                {m.calcClearCartConfirm}
                <div className="btnrow-inline" style={{ marginTop: 9 }}>
                  <button type="button" className="btn sm" onClick={handleClearCartConfirmed}>{m.calcClearConfirmYes}</button>
                  <button type="button" className="btn sm ghost" onClick={() => setConfirmClear(false)}>{m.cancel}</button>
                </div>
              </div>
            )}
            {lines.map((line) => {
              const lineKey = line.lineId;
              const colorLoad = colorLoads.get(line.productId);
              const colorReady = colorLoad?.status === "ready" ? colorLoad.colors : null;
              const selectedColor = colorReady?.find((c) => c.code === line.colorCode);
              return (
                <div key={lineKey} className={styles.cartLine}>
                  {line.photoUrl ? (
                    <button type="button" className={`${styles.lineThumb} ${styles.lineThumbBtn}`} onClick={() => setPhotoView({ name: line.name, url: line.photoUrl as string })} aria-label={m.calcPhotoViewAria.replace("{name}", line.name)}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={line.photoUrl} alt={line.name} loading="lazy" />
                    </button>
                  ) : <div className={styles.lineThumb}>{m.noPhotoPlaceholder}</div>}
                  <div className={styles.lineBody}>
                    <div className={styles.lineName}>{line.name} {line.code && <span className="code">{line.code}</span>}</div>
                    {colorReady && (
                      <div className="field" style={{ margin: "6px 0" }}>
                        <label htmlFor={`color_${lineKey}`}>{m.calcColorFieldLabel}</label>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <select
                            id={`color_${lineKey}`}
                            value={line.colorCode ?? ""}
                            onChange={(e) => setLineColor(line.lineId, e.target.value || null)}
                            style={{ flex: 1 }}
                            aria-label={m.calcColorPickerAria.replace("{name}", line.name)}
                          >
                            <option value="">{m.calcColorPickerPlaceholder}</option>
                            {colorReady.map((c) => <option key={c.id} value={c.code}>{c.name ? `${c.code} — ${c.name}` : c.code}</option>)}
                          </select>
                          {selectedColor?.photo_url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={selectedColor.photo_url} alt="" style={{ width: 28, height: 28, borderRadius: "var(--r-sm)", objectFit: "cover", border: "1px solid var(--line)", flex: "none" }} />
                          )}
                        </div>
                      </div>
                    )}
                    {colorLoad?.status === "error" && <div className="hint" style={{ marginBottom: 6 }}>{m.calcColorLoadFailedNote}</div>}
                    <div className={styles.lineControls}>
                      <div className={styles.priceField}>
                        <label htmlFor={`price_${lineKey}`}>{m.calcUnitPriceLabel}</label>
                        <input id={`price_${lineKey}`} type="text" inputMode="numeric" placeholder="Rp 0" value={line.unitPrice ? formatIDR(line.unitPrice) : ""} onChange={(e) => setLineUnitPrice(line.lineId, e.target.value)} />
                      </div>
                      <div className={styles.qtyField}>
                        <label htmlFor={`qty_${lineKey}`}>{m.calcQtyLabel}</label>
                        <div className={styles.stepper}>
                          <button type="button" className={styles.stepBtn} onClick={() => setLineQty(line.lineId, line.qty - 1)} aria-label="−">−</button>
                          <input id={`qty_${lineKey}`} className={styles.qtyInput} type="number" min={1} max={CALC_MAX_QTY} value={line.qty} onChange={(e) => setLineQty(line.lineId, Number(e.target.value))} />
                          <button type="button" className={styles.stepBtn} onClick={() => setLineQty(line.lineId, line.qty + 1)} aria-label="+">+</button>
                        </div>
                      </div>
                    </div>
                    {colorReady && (
                      <button type="button" className="btn sm" style={{ marginTop: 8 }} onClick={() => addColorVariant(line)} aria-label={m.calcAddColorVariantAria.replace("{name}", line.name)}>
                        {m.calcAddColorVariantCta}
                      </button>
                    )}
                    <div className={styles.lineFooter}>
                      <span className={styles.lineSubtotal}>{formatIDR(line.unitPrice * line.qty)}</span>
                      <button type="button" className="btn sm" onClick={() => removeLine(line.lineId)} aria-label={m.calcRemoveLineAria.replace("{name}", line.name)}>{m.calcRemoveLineCta}</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="card">
            <h3 style={{ fontSize: 17, marginBottom: 4 }}>{m.calcDiscountSectionTitle}</h3>
            <p className="small muted" style={{ marginBottom: 10 }}>{m.calcDiscountHint}</p>
            {discountSlots.map((slot, idx) => (
              <div key={idx} className={`field ${styles.discSlotRow} ${styles[`disc${idx % 6}`]}`} style={{ marginBottom: 8, display: "flex", gap: 8, alignItems: "flex-end" }}>
                <div style={{ flex: 1 }}>
                  <label htmlFor={`calc_discount_${idx}`}>{m.calcDiscountFieldLabel.replace("{n}", String(idx + 1))}</label>
                  <input id={`calc_discount_${idx}`} type="text" inputMode="decimal" value={slot} onChange={(e) => setDiscountSlots((slots) => slots.map((s, i) => (i === idx ? e.target.value : s)))} />
                </div>
                {discountSlots.length > 1 && <button type="button" className="btn sm" onClick={() => removeDiscountSlot(idx)}>{m.calcDiscountRemoveBtn}</button>}
              </div>
            ))}
            {discountSlots.length < CALC_MAX_DISCOUNT_SLOTS && <button type="button" className="btn sm" onClick={addDiscountSlot} style={{ marginBottom: 10 }}>{m.calcDiscountAddBtn}</button>}
            <div className="field" style={{ marginBottom: 10 }}>
              <label htmlFor="calc_markup">{m.calcMarkupFieldLabel}</label>
              <input id="calc_markup" type="text" inputMode="decimal" value={markup} onChange={(e) => setMarkup(e.target.value)} placeholder="0" />
            </div>
            <div className="field">
              <label htmlFor="calc_cash">{m.calcCashFieldLabel}</label>
              <input id="calc_cash" type="text" inputMode="numeric" value={cash} onChange={(e) => setCash(e.target.value)} placeholder="Rp 0" />
            </div>
          </div>

          <div className="card">
            {finalTotal < 0 && <div className="banner bad">{m.offerFinalNegative}</div>}
            {markupOutOfRange && <div className="banner bad">{m.calcMarkupOutOfRange}</div>}
            <div className={styles.breakdown}>
              <div className={styles.breakdownRow}><span>{m.calcBreakdownSubtotal}</span><span>{formatIDR(subtotal)}</span></div>
              {discountSteps.map((step) => (
                <div className={`${styles.breakdownRow} ${styles[`disc${(step.n - 1) % 6}`]}`} key={step.n}>
                  <span className={styles.discStepLabel}><span className={styles.discDot} aria-hidden="true" />{m.calcDiscountStepAmount.replace("{n}", String(step.n)).replace("{pct}", String(step.pct))}</span>
                  <span>−{formatIDR(step.amount)}</span>
                </div>
              ))}
              {discountSteps.length > 0 && <div className={styles.breakdownRow}><span>{m.calcBreakdownTotalDiscount}</span><span>−{formatIDR(totalDiscountAmount)}</span></div>}
              <div className={styles.breakdownRow}><span>{m.calcBreakdownAfterDiscount}</span><span>{formatIDR(afterDiscountDisplay)}</span></div>
              <div className={styles.breakdownRow}><span>{m.calcBreakdownAfterMarkup}</span><span>{formatIDR(afterMarkupDisplay)}</span></div>
              <div className={`${styles.breakdownRow} ${styles.final}`}><span>{m.finalAmount}</span><span>{formatIDR(finalDisplay)}</span></div>
            </div>
            {proposal && (
              <>
                {proposalErr && <div className="banner bad" style={{ marginTop: 12 }}>{proposalErr}</div>}
                <div className="btnrow" style={{ marginTop: 12 }}>
                  <button type="button" className="btn" disabled={lines.length === 0} onClick={handleMakeProposal}>{proposal.cta}</button>
                </div>
              </>
            )}
            {convert && <p className="footnote" style={{ marginTop: 12 }}>{convert.scopeNote}</p>}
          </div>
        </>
      )}

      {photoView && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setPhotoView(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label={photoView.name}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoView.url} alt={photoView.name} style={{ width: "100%", height: "auto", borderRadius: "var(--r-md)", marginBottom: 12, display: "block" }} />
            <div className={styles.lineName} style={{ marginBottom: 12 }}>{photoView.name}</div>
            <button type="button" className="btn" onClick={() => setPhotoView(null)}>{m.close}</button>
          </div>
        </div>
      )}

      <div className={styles.bottomSpacer} />
      <div className={`${styles.stickyBar}${area === "admin" ? ` ${styles.stickyBarAdmin}` : ""}`}>
        <button
          type="button"
          className={styles.stickyLeft}
          style={{ background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer" }}
          onClick={goToCart}
          aria-label={m.calcFooterAria.replace("{n}", String(itemQty)).replace("{amount}", formatIDR(finalDisplay))}
        >
          <span className={styles.stickyCount}>{m.calcFooterItemCount.replace("{n}", String(itemQty))}</span>
          <span className={styles.stickyTotal}>{formatIDR(finalDisplay)}</span>
        </button>
        {tab === "produk" ? (
          <button type="button" className={`btn primary lg ${styles.stickyBtn}`} disabled={lines.length === 0} onClick={goToCart}>
            {m.calcTabCart.replace("{n}", String(lines.length))}
          </button>
        ) : (
          convert && <button type="button" className={`btn primary lg ${styles.stickyBtn}`} disabled={lines.length === 0} onClick={handleConvertToOrder}>{convert.cta}</button>
        )}
      </div>
    </>
  );
}
