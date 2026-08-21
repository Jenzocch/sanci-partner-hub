"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { STOCK_STATUS_CHIP, stockStatusLabel, type StockStatus } from "@/lib/catalog-shared";
import { useCabangMessages } from "@/lib/i18n/provider";
import { formatIDR, parseIDRInput } from "@/lib/orders-shared";
import DraftBanner from "@/lib/draft-banner";
import {
  CALC_MAX_DISCOUNT_SLOTS,
  CALC_MAX_QTY,
  CALC_DRAFT_DEBOUNCE_MS,
  discountChainMultiplier,
  computeChainFinal,
  emptyCartState,
  readCalcDraft,
  writeCalcDraft,
  clearCalcDraft,
  writeCalcHandoff,
  type CalcLine,
  type CalcCartState,
  type CalcDraft,
} from "@/lib/calculator-shared";
import styles from "./kalkulator.module.css";

export type KalkulatorProduct = {
  id: string;
  name: string;
  code: string | null;
  category: string | null;
  photoUrl: string | null;
  stockStatus: StockStatus;
};

/**
 * Kalkulator Penawaran — lihat catatan panjang di page.tsx untuk DUA
 * penyimpangan sengaja (tanpa gerbang izin diskon, tanpa tulis DB sampai
 * "Buat Pesanan"). Komponen ini murni state lokal + localStorage
 * (lib/calculator-shared.ts) — tidak ada Server Action di file ini sama
 * sekali, konsisten dengan prinsip "tidak ada yang tersimpan selagi dipakai".
 */
export default function KalkulatorClient({ products }: { products: KalkulatorProduct[] }) {
  const m = useCabangMessages();
  const router = useRouter();

  const [tab, setTab] = useState<"produk" | "keranjang">("produk");
  const [q, setQ] = useState("");
  const [kategori, setKategori] = useState<string | null>(null);

  const [lines, setLines] = useState<CalcLine[]>([]);
  const [discountSlots, setDiscountSlots] = useState<string[]>([""]);
  const [markup, setMarkup] = useState("");
  const [cash, setCash] = useState("");

  const [pendingDraft, setPendingDraft] = useState<CalcDraft | null>(null);
  const [ready, setReady] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Baca draf SEKALI saat mount. TIDAK langsung dipulihkan (SPEC §58,
  // LESSONS #1) — kalau ada draf lama, tampilkan DraftBanner dan tunggu
  // pengguna memilih. Kalau tidak ada draf, langsung "ready" untuk mulai
  // auto-save state kosong saat ini (tidak ada apa pun yang bisa hilang).
  useEffect(() => {
    const d = readCalcDraft();
    if (d) {
      setPendingDraft(d);
    } else {
      setReady(true);
    }
  }, []);

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
    clearCalcDraft();
    setPendingDraft(null);
    setReady(true);
  }

  // Auto-save tertunda (800ms) — SAMA prinsip dengan use-local-draft.ts, tapi
  // dipicu oleh perubahan state React (bukan event `onInput` DOM) karena
  // keranjang bukan form. `ready` mencegah efek ini menimpa draf lama SEBELUM
  // pengguna sempat memilih Lanjutkan/Buang di atas (LESSONS #20 sepupu: timer
  // yang jalan di waktu yang salah menulis ulang state yang seharusnya sudah
  // dibuang/dipulihkan).
  useEffect(() => {
    if (!ready) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      writeCalcDraft({ lines, discountSlots, markup, cash });
    }, CALC_DRAFT_DEBOUNCE_MS);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [ready, lines, discountSlots, markup, cash]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((it) => {
      if (it.category) set.add(it.category);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, m.common.dateLocale));
  }, [products, m.common.dateLocale]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return products.filter((it) => {
      if (kategori && it.category !== kategori) return false;
      if (!needle) return true;
      if (it.name.toLowerCase().includes(needle)) return true;
      if (it.code && it.code.toLowerCase().includes(needle)) return true;
      if (it.category && it.category.toLowerCase().includes(needle)) return true;
      return false;
    });
  }, [products, q, kategori]);

  const cartQtyByProduct = useMemo(() => {
    const map = new Map<string, number>();
    lines.forEach((l) => map.set(l.productId, l.qty));
    return map;
  }, [lines]);

  function addToCart(p: KalkulatorProduct) {
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.productId === p.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: Math.min(CALC_MAX_QTY, next[idx].qty + 1) };
        return next;
      }
      return [...prev, { productId: p.id, name: p.name, code: p.code, photoUrl: p.photoUrl, unitPrice: 0, qty: 1 }];
    });
  }
  function removeLine(productId: string) {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  }
  function setLineUnitPrice(productId: string, raw: string) {
    const n = parseIDRInput(raw);
    setLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, unitPrice: n ?? 0 } : l)));
  }
  function setLineQty(productId: string, qty: number) {
    const clamped = Math.max(1, Math.min(CALC_MAX_QTY, Math.round(qty) || 1));
    setLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, qty: clamped } : l)));
  }

  function addDiscountSlot() {
    setDiscountSlots((slots) => (slots.length >= CALC_MAX_DISCOUNT_SLOTS ? slots : [...slots, ""]));
  }
  function removeDiscountSlot(idx: number) {
    setDiscountSlots((slots) => slots.filter((_, i) => i !== idx));
  }

  function handleClearCart() {
    if (!window.confirm(m.cabang.calcClearCartConfirm)) return;
    const empty: CalcCartState = emptyCartState();
    setLines(empty.lines);
    setDiscountSlots(empty.discountSlots);
    setMarkup(empty.markup);
    setCash(empty.cash);
    clearCalcDraft();
  }

  // ── Matematika: rantai diskon → markup → potongan tunai, SATU kali round
  // di akhir (0015 §5). Breakdown per-langkah di bawah dibulatkan sendiri
  // HANYA untuk ditampilkan — tidak pernah diumpankan balik ke finalTotal
  // (lihat komentar panjang di lib/calculator-shared.ts).
  const parsedDiscounts = discountSlots
    .map((s) => Number(s.trim().replace(",", ".")))
    .filter((n) => Number.isFinite(n) && n > 0 && n < 100);
  const markupTrimmed = markup.trim();
  const parsedMarkupRaw = markupTrimmed === "" ? 0 : Number(markupTrimmed.replace(",", "."));
  const parsedMarkup = Number.isFinite(parsedMarkupRaw) ? parsedMarkupRaw : 0;
  const parsedCash = parseIDRInput(cash) ?? 0;

  const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0);
  const itemQty = lines.reduce((sum, l) => sum + l.qty, 0);
  const mult = discountChainMultiplier(parsedDiscounts);
  const afterDiscountDisplay = Math.round(subtotal * mult);
  const afterMarkupDisplay = Math.round(subtotal * mult * (1 + parsedMarkup / 100));
  const finalTotal = computeChainFinal(subtotal, parsedDiscounts, parsedMarkup, parsedCash);
  const finalDisplay = Math.max(finalTotal, 0);

  // Rincian uang PER LANGKAH diskon — hanya untuk ditampilkan (bukan sumber
  // finalTotal, sama seperti afterDiscountDisplay/afterMarkupDisplay di atas).
  // Dihitung berurutan: setiap langkah memotong dari hasil langkah SEBELUMNYA
  // (rantai perkalian, bukan menjumlah persen), supaya "Diskon 2 (10%)" yang
  // ditampilkan benar-benar 10% dari harga SETELAH Diskon 1 — bukan 10% dari
  // harga awal (0015 §5 — itulah kenapa 8%+10% ≠ 18%).
  let discountRunning = subtotal;
  const discountSteps = parsedDiscounts.map((pct, i) => {
    const before = discountRunning;
    discountRunning = before * (1 - pct / 100);
    return { n: i + 1, pct, amount: Math.round(before - discountRunning) };
  });
  const totalDiscountAmount = subtotal - afterDiscountDisplay;

  function handleConvertToOrder() {
    if (lines.length === 0) return;
    writeCalcHandoff({
      lineCount: lines.length,
      itemQty,
      subtotal,
      discountPcts: parsedDiscounts,
      markupPct: markupTrimmed === "" ? null : parsedMarkup,
      cashDiscount: parsedCash,
      finalAmount: finalDisplay,
      // name/code ikut untuk ringkasan banner saja — copyCalcCartItemsToOrder
      // mengambil ulang name_snapshot/code_snapshot dari sanci_products saat
      // benar-benar menulis (LESSONS #6), tidak mempercayai nilai ini.
      lines: lines.map((l) => ({
        productId: l.productId,
        name: l.name,
        code: l.code,
        unitPrice: l.unitPrice,
        qty: l.qty,
      })),
    });
    // Kalkulator sudah selesai dipakai untuk penawaran ini — draf lokalnya
    // tidak perlu bertahan lagi (beda dari handoff, yang justru BARU ditulis
    // di atas untuk dibaca new-order-form.tsx).
    clearCalcDraft();
    router.push("/cabang/pesanan/baru");
  }

  return (
    <>
      {/* `values: {}` aman — DraftBanner cuma membaca `savedAt` lewat
          waktuRelatif(), tidak pernah membaca `values` (lihat draft-banner.tsx).
          Bentuk keranjang bukan field form jadi tidak ada `values` sungguhan
          untuk diisi di sini. */}
      <DraftBanner
        draft={pendingDraft ? { savedAt: pendingDraft.savedAt, values: {} } : null}
        onRestore={handleRestoreDraft}
        onDiscard={handleDiscardDraft}
      />

      <div className="tabs">
        <button type="button" className={`tab${tab === "produk" ? " on" : ""}`} onClick={() => setTab("produk")}>
          {m.cabang.calcTabProducts}
        </button>
        <button
          type="button"
          className={`tab${tab === "keranjang" ? " on" : ""}`}
          onClick={() => setTab("keranjang")}
        >
          {m.cabang.calcTabCart.replace("{n}", String(lines.length))}
        </button>
      </div>

      {tab === "produk" ? (
        <>
          <div className="searchrow">
            <input
              className="search-input"
              type="search"
              placeholder={m.cabang.produkSearchPlaceholder}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          {categories.length > 0 && (
            <div className={styles.filters}>
              <button
                type="button"
                className={`${styles.filterchip}${kategori === null ? ` ${styles.filterOn}` : ""}`}
                onClick={() => setKategori(null)}
              >
                {m.cabang.filterAll}
              </button>
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`${styles.filterchip}${kategori === c ? ` ${styles.filterOn}` : ""}`}
                  onClick={() => setKategori((cur) => (cur === c ? null : c))}
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          {products.length === 0 ? (
            <div className="card emptybox">{m.cabang.noProductsYet}</div>
          ) : filtered.length === 0 ? (
            <div className="card emptybox">{m.cabang.noProductsMatchSearch}</div>
          ) : (
            <div className={styles.grid}>
              {filtered.map((p) => {
                const inCartQty = cartQtyByProduct.get(p.id) ?? 0;
                const isOut = p.stockStatus === "OUT_OF_STOCK";
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`${styles.card}${inCartQty > 0 ? ` ${styles.inCart}` : ""}`}
                    onClick={() => addToCart(p)}
                    aria-label={m.cabang.calcAddToCartAria.replace("{name}", p.name)}
                  >
                    <div className={styles.photo}>
                      {inCartQty > 0 && <span className={`chip qty ${styles.cartBadge}`}>×{inCartQty}</span>}
                      {p.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- photo_url adalah URL publik dari SANCI (bukan aset lokal), lihat catatan di lib/catalog-shared.ts
                        <img
                          src={p.photoUrl}
                          alt={p.name}
                          loading="lazy"
                          style={isOut ? { filter: "grayscale(70%)", opacity: 0.6 } : undefined}
                        />
                      ) : (
                        <div className={styles.placeholder}>{m.cabang.noPhotoPlaceholder}</div>
                      )}
                    </div>
                    <div className={styles.body}>
                      <div className={styles.name}>{p.name}</div>
                      <div className={styles.metaRow}>
                        {p.code && <span className="code">{p.code}</span>}
                        <span className={STOCK_STATUS_CHIP[p.stockStatus]}>{stockStatusLabel(m, p.stockStatus)}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      ) : lines.length === 0 ? (
        <div className="card emptybox">
          <p style={{ marginBottom: 14 }}>{m.cabang.calcCartEmpty}</p>
          <button type="button" className="btn primary" onClick={() => setTab("produk")}>
            {m.cabang.calcGoToProductsCta}
          </button>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="spread" style={{ marginBottom: 4 }}>
              <h3 style={{ fontSize: 17 }}>{m.cabang.calcCartCardTitle}</h3>
              <button type="button" className="btn sm ghost" onClick={handleClearCart}>
                {m.cabang.calcClearCartCta}
              </button>
            </div>
            {lines.map((line) => (
              <div key={line.productId} className={styles.cartLine}>
                <div className={styles.lineThumb}>
                  {line.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- photo_url adalah URL publik dari SANCI (bukan aset lokal)
                    <img src={line.photoUrl} alt={line.name} loading="lazy" />
                  ) : (
                    m.cabang.noPhotoPlaceholder
                  )}
                </div>
                <div className={styles.lineBody}>
                  <div className={styles.lineName}>
                    {line.name} {line.code && <span className="code">{line.code}</span>}
                  </div>
                  <div className={styles.lineControls}>
                    <div className={styles.priceField}>
                      <label htmlFor={`price_${line.productId}`}>{m.cabang.calcUnitPriceLabel}</label>
                      <input
                        id={`price_${line.productId}`}
                        type="text"
                        inputMode="numeric"
                        placeholder="Rp 0"
                        value={line.unitPrice ? formatIDR(line.unitPrice) : ""}
                        onChange={(e) => setLineUnitPrice(line.productId, e.target.value)}
                      />
                    </div>
                    <div className={styles.qtyField}>
                      <label htmlFor={`qty_${line.productId}`}>{m.cabang.calcQtyLabel}</label>
                      <div className={styles.stepper}>
                        <button
                          type="button"
                          className={styles.stepBtn}
                          onClick={() => setLineQty(line.productId, line.qty - 1)}
                          aria-label="−"
                        >
                          −
                        </button>
                        <input
                          id={`qty_${line.productId}`}
                          className={styles.qtyInput}
                          type="number"
                          min={1}
                          max={CALC_MAX_QTY}
                          value={line.qty}
                          onChange={(e) => setLineQty(line.productId, Number(e.target.value))}
                        />
                        <button
                          type="button"
                          className={styles.stepBtn}
                          onClick={() => setLineQty(line.productId, line.qty + 1)}
                          aria-label="+"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className={styles.lineFooter}>
                    <span className={styles.lineSubtotal}>{formatIDR(line.unitPrice * line.qty)}</span>
                    <button
                      type="button"
                      className="btn sm"
                      onClick={() => removeLine(line.productId)}
                      aria-label={m.cabang.calcRemoveLineAria.replace("{name}", line.name)}
                    >
                      {m.cabang.calcRemoveLineCta}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="card">
            <h3 style={{ fontSize: 17, marginBottom: 4 }}>{m.cabang.calcDiscountSectionTitle}</h3>
            <p className="small muted" style={{ marginBottom: 10 }}>
              {m.cabang.calcDiscountHint}
            </p>
            {discountSlots.map((slot, idx) => (
              <div key={idx} className="field" style={{ marginBottom: 8, display: "flex", gap: 8, alignItems: "flex-end" }}>
                <div style={{ flex: 1 }}>
                  <label htmlFor={`calc_discount_${idx}`}>
                    {m.cabang.calcDiscountFieldLabel.replace("{n}", String(idx + 1))}
                  </label>
                  <input
                    id={`calc_discount_${idx}`}
                    type="text"
                    inputMode="decimal"
                    value={slot}
                    onChange={(e) => setDiscountSlots((slots) => slots.map((s, i) => (i === idx ? e.target.value : s)))}
                    placeholder="8"
                  />
                </div>
                {discountSlots.length > 1 && (
                  <button type="button" className="btn sm" onClick={() => removeDiscountSlot(idx)}>
                    {m.cabang.calcDiscountRemoveBtn}
                  </button>
                )}
              </div>
            ))}
            {discountSlots.length < CALC_MAX_DISCOUNT_SLOTS && (
              <button type="button" className="btn sm" onClick={addDiscountSlot} style={{ marginBottom: 10 }}>
                {m.cabang.calcDiscountAddBtn}
              </button>
            )}
            <div className="field" style={{ marginBottom: 10 }}>
              <label htmlFor="calc_markup">{m.cabang.calcMarkupFieldLabel}</label>
              <input
                id="calc_markup"
                type="text"
                inputMode="decimal"
                value={markup}
                onChange={(e) => setMarkup(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="field">
              <label htmlFor="calc_cash">{m.cabang.calcCashFieldLabel}</label>
              <input
                id="calc_cash"
                type="text"
                inputMode="numeric"
                value={cash}
                onChange={(e) => setCash(e.target.value)}
                placeholder="Rp 0"
              />
            </div>
          </div>

          <div className="card">
            {finalTotal < 0 && <div className="banner bad">{m.cabang.cabangOfferFinalNegative}</div>}
            <div className={styles.breakdown}>
              <div className={styles.breakdownRow}>
                <span>{m.cabang.calcBreakdownSubtotal}</span>
                <span>{formatIDR(subtotal)}</span>
              </div>
              {discountSteps.map((step) => (
                <div className={styles.breakdownRow} key={step.n}>
                  <span>{m.cabang.calcDiscountStepAmount.replace("{n}", String(step.n)).replace("{pct}", String(step.pct))}</span>
                  <span>−{formatIDR(step.amount)}</span>
                </div>
              ))}
              {discountSteps.length > 0 && (
                <div className={styles.breakdownRow}>
                  <span>{m.cabang.calcBreakdownTotalDiscount}</span>
                  <span>−{formatIDR(totalDiscountAmount)}</span>
                </div>
              )}
              <div className={styles.breakdownRow}>
                <span>{m.cabang.calcBreakdownAfterDiscount}</span>
                <span>{formatIDR(afterDiscountDisplay)}</span>
              </div>
              <div className={styles.breakdownRow}>
                <span>{m.cabang.calcBreakdownAfterMarkup}</span>
                <span>{formatIDR(afterMarkupDisplay)}</span>
              </div>
              <div className={`${styles.breakdownRow} ${styles.final}`}>
                <span>{m.common.finalAmount}</span>
                <span>{formatIDR(finalDisplay)}</span>
              </div>
            </div>
            <p className="footnote" style={{ marginTop: 0 }}>{m.cabang.calcConvertScopeNote}</p>
          </div>
        </>
      )}

      <div className={styles.bottomSpacer} />
      <div className={styles.stickyBar}>
        <button
          type="button"
          className={styles.stickyLeft}
          style={{ background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer" }}
          onClick={() => setTab("keranjang")}
          aria-label={m.cabang.calcFooterAria.replace("{n}", String(itemQty)).replace("{amount}", formatIDR(finalDisplay))}
        >
          <span className={styles.stickyCount}>{m.cabang.calcFooterItemCount.replace("{n}", String(itemQty))}</span>
          <span className={styles.stickyTotal}>{formatIDR(finalDisplay)}</span>
        </button>
        <button
          type="button"
          className={`btn primary lg ${styles.stickyBtn}`}
          disabled={lines.length === 0}
          onClick={handleConvertToOrder}
        >
          {m.cabang.calcConvertCta}
        </button>
      </div>
    </>
  );
}
