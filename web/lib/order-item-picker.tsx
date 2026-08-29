"use client";

/**
 * Isi Pesanan di FORM pembuatan pesanan — satu komponen untuk DUA form:
 *   - /admin/orders/baru   (web/app/admin/orders/baru/new-order-form.tsx)
 *   - /cabang/pesanan/baru (web/app/cabang/pesanan/baru/new-order-form.tsx)
 *
 * Jalur ketiga masuknya baris pesanan saat PEMBUATAN (owner 2026-08-24):
 * selain salinan Package (:item:) dan hand-off Kalkulator, pengguna kini bisa
 * memilih produk langsung di form lewat picker modal ini. Penulisan ke
 * order_items dilakukan FORM pemasang setelah pesanan berhasil dibuat —
 * lewat `copyCalcCartItemsToOrder` yang sama dengan jalur hand-off (satu
 * daftar, satu jalur tulis; lihat catatan panjang di kedua form).
 *
 * Keputusan desain yang mengikat komponen ini:
 *   - Daftar produk dimuat MALAS: halaman form TIDAK boleh mengambil daftar
 *     produk di muka (form-nya harus tetap ringan) — fetch pertama terjadi
 *     saat picker dibuka, lewat Server Action per area (`loadProducts` prop).
 *     Sejak 2026-08-26 pencarian/kategori dieksekusi DATABASE dan daftar
 *     tumbuh per 60 lewat "Muat Lebih Banyak" (kontrak lib/catalog-query.ts,
 *     hook lib/use-catalog-search.ts) — menggantikan pola `.limit(200)` +
 *     peringatan catalogListCappedMsg. Daftar kategori chip diminta pada
 *     fetch pertama (withCategories) supaya lengkap terlepas halaman tampil.
 *   - Produk habis stok TETAP tampil, hanya diredam visual (aturan kejujuran
 *     yang sama dengan kalkulator — menyembunyikan barang ≠ jujur soal stok).
 *   - Pilih produk = qty 1; produk yang sama digabung dengan MENJUMLAH qty
 *     (aturan addToCart kalkulator). Kolom harga selalu tampil di kedua area;
 *     di sisi cabang trg_order_item_price_guard (0014) tetap penentunya —
 *     tanpa can_edit_offer harga gugur di server dan form melaporkannya lewat
 *     banner degradasi (…PriceNote), bukan menyembunyikan kolomnya.
 *   - Komponen ini SENGAJA ramping: tanpa rantai diskon, tanpa breakdown —
 *     itu tetap tugas Kalkulator Penawaran.
 *   - Semua input di sini TANPA atribut `name`: draf lokal form cabang
 *     (use-local-draft.ts::kumpulkan) dan FormData submit sama-sama hanya
 *     membaca field ber-`name`, jadi baris pilihan tidak pernah bocor ke
 *     keduanya (baris hidup sebagai state React murni).
 *   - Teks semuanya dari slice `common` (komponen dipasang di dua area,
 *     aturan yang sama dengan lib/kalkulator-client.tsx); judul section
 *     dirender form pemasang dengan kunci slice-nya sendiri
 *     (orderItemsCardTitle) supaya tidak menambah kunci common baru untuk
 *     kata yang sudah ada di kedua slice.
 */

import { useMemo, useState } from "react";
import { STOCK_STATUS_CHIP, stockStatusLabel, type StockStatus } from "@/lib/catalog-shared";
import { useCatalogSearch, type CatalogFetchInput } from "@/lib/use-catalog-search";
import { useCommonMessages } from "@/lib/i18n/provider";
import { formatIDR, parseIDRInput } from "@/lib/orders-shared";
import { CALC_MAX_QTY, type CalcHandoffLine } from "@/lib/calculator-shared";

export type PickerProduct = {
  id: string;
  name: string;
  code: string | null;
  category: string | null;
  photoUrl: string | null;
  stockStatus: StockStatus;
  /**
   * Harga efektif 0021 — PREFILL unitPrice saat produk ditambahkan
   * (cabang: override toko sendiri → Harga Dasar SANCI; form admin: harga
   * efektif partner TERPILIH). null/absen = mulai 0, ketik manual
   * (perilaku lama). Kolom harga baris tetap selalu bisa diketik; di sisi
   * cabang trg_order_item_price_guard (0014) tetap penentu akhirnya.
   */
  price?: number | null;
};

/** Satu baris Isi Pesanan yang dipilih di form (state React murni, bukan field form). */
export type PickedLine = {
  productId: string;
  name: string;
  code: string | null;
  /** Diketik bebas — katalog tidak punya harga (0010); 0 = tidak diisi. */
  unitPrice: number;
  qty: number;
};

/**
 * Hasil pemuatan SATU halaman daftar produk, SUDAH diterjemahkan area
 * pemasang: outcome area-spesifik (katalog belum dibuka / migrasi belum
 * jalan / error) dipetakan ke kalimat slice masing-masing SEBELUM sampai ke
 * komponen ini, supaya komponen bebas dari slice cabang/admin. `categories`
 * hanya terisi saat diminta lewat withCategories (fetch pertama).
 */
export type PickerLoadResult =
  | { ok: true; products: PickerProduct[]; hasMore: boolean; categories?: string[] }
  | { ok: false; message: string };

/**
 * Prefill baris dari hand-off Kalkulator ("Gunakan angka ini") — aturan
 * gabung yang SAMA dengan penambahan lewat picker: produk yang sudah ada di
 * daftar dijumlah qty-nya; harga baris yang sudah ada TIDAK ditimpa (kalau
 * kosong/0, harga hand-off dipakai). Satu tempat untuk aturan ini supaya dua
 * form tidak menyimpang.
 */
export function mergeLinesFromHandoff(prev: PickedLine[], handoffLines: CalcHandoffLine[]): PickedLine[] {
  const next = [...prev];
  for (const h of handoffLines) {
    const idx = next.findIndex((l) => l.productId === h.productId);
    if (idx >= 0) {
      const cur = next[idx];
      next[idx] = {
        ...cur,
        qty: Math.min(CALC_MAX_QTY, cur.qty + h.qty),
        unitPrice: cur.unitPrice > 0 ? cur.unitPrice : h.unitPrice,
      };
    } else {
      next.push({ productId: h.productId, name: h.name, code: h.code, unitPrice: h.unitPrice, qty: h.qty });
    }
  }
  return next;
}

/**
 * Thumbnail 48px mengikuti aturan lib/catalog-shared.ts untuk `<img>` biasa:
 * lazy + decoding async, ruang dipesan lebih dulu (kotak 48px tetap),
 * onError → placeholder (bukan ikon rusak browser), object-fit contain.
 */
function PickerThumb({ url, name, muted, placeholder }: { url: string | null; name: string; muted: boolean; placeholder: string }) {
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
        <span className="small muted" style={{ fontSize: 9, textAlign: "center", lineHeight: 1.2 }}>{placeholder}</span>
      </div>
    );
  }
  return (
    <div style={box}>
      {/* eslint-disable-next-line @next/next/no-img-element -- photo_url adalah URL publik dari SANCI (bukan aset lokal), lihat catatan di lib/catalog-shared.ts */}
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
}: {
  lines: PickedLine[];
  onLinesChange: (next: PickedLine[]) => void;
  /** Server Action per area, dibungkus form pemasang (lihat PickerLoadResult).
   *  Pencocokan nama/kode/kategori kini terjadi di query action-nya —
   *  semantiknya sama dengan memo `filtered` lama (lib/catalog-query.ts). */
  loadProducts: (input: CatalogFetchInput) => Promise<PickerLoadResult>;
}) {
  const m = useCommonMessages();
  const [open, setOpen] = useState(false);

  // Mode MALAS (initial: null): fetch pertama saat picker dibuka; hasil
  // di-cache hook selama halaman hidup (buka-tutup modal tidak fetch ulang).
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

  /** Pemuatan pertama gagal total (belum ada daftar sehat) vs error susulan
   *  (daftar lama tetap tampil) — dua perlakuan berbeda di JSX bawah. */
  const initialLoading = !loadedOnce && searching;
  const initialError = !loadedOnce && !searching ? error : null;

  const qtyByProduct = useMemo(() => {
    const map = new Map<string, number>();
    lines.forEach((l) => map.set(l.productId, l.qty));
    return map;
  }, [lines]);

  /** Qty 1; duplikat digabung dengan menjumlah qty (aturan addToCart kalkulator). */
  function addProduct(p: PickerProduct) {
    const idx = lines.findIndex((l) => l.productId === p.id);
    if (idx >= 0) {
      const next = [...lines];
      next[idx] = { ...next[idx], qty: Math.min(CALC_MAX_QTY, next[idx].qty + 1) };
      onLinesChange(next);
      return;
    }
    // Prefill harga efektif 0021 — nilai awal yang bisa diubah, bukan kunci.
    onLinesChange([...lines, { productId: p.id, name: p.name, code: p.code, unitPrice: p.price ?? 0, qty: 1 }]);
  }

  function removeLine(productId: string) {
    onLinesChange(lines.filter((l) => l.productId !== productId));
  }
  function setLineQty(productId: string, qty: number) {
    const clamped = Math.max(1, Math.min(CALC_MAX_QTY, Math.round(qty) || 1));
    onLinesChange(lines.map((l) => (l.productId === productId ? { ...l, qty: clamped } : l)));
  }
  function setLineUnitPrice(productId: string, raw: string) {
    const n = parseIDRInput(raw);
    onLinesChange(lines.map((l) => (l.productId === productId ? { ...l, unitPrice: n ?? 0 } : l)));
  }

  // 44px ("var(--tap)") — bukan 34px seperti sebelumnya. Kontrol qty +/-
  // yang SAMA di kalkulator (lib/kalkulator.module.css .stepBtn) sudah
  // benar 44px sejak awal; baris ini adalah satu-satunya tempat di app yang
  // tertinggal 34px (temuan review 2026-08-29) — kontrol yang paling sering
  // ditekan di seluruh alur bikin pesanan, salah satu yang paling penting
  // untuk memenuhi kontrak --tap.
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
        <p className="hint" style={{ marginBottom: 8 }}>
          {m.pickerEmptyHint}
        </p>
      ) : (
        lines.map((line) => (
          <div
            key={line.productId}
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
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginTop: 8 }}>
              <div className="field" style={{ margin: 0, flex: "1 1 150px", minWidth: 130 }}>
                <label htmlFor={`oi_price_${line.productId}`}>{m.calcUnitPriceLabel}</label>
                <input
                  id={`oi_price_${line.productId}`}
                  type="text"
                  inputMode="numeric"
                  placeholder="Rp 0"
                  value={line.unitPrice ? formatIDR(line.unitPrice) : ""}
                  onChange={(e) => setLineUnitPrice(line.productId, e.target.value)}
                />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label htmlFor={`oi_qty_${line.productId}`}>{m.calcQtyLabel}</label>
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <button type="button" style={stepBtn} onClick={() => setLineQty(line.productId, line.qty - 1)} aria-label="−">
                    −
                  </button>
                  <input
                    id={`oi_qty_${line.productId}`}
                    type="number"
                    min={1}
                    max={CALC_MAX_QTY}
                    value={line.qty}
                    onChange={(e) => setLineQty(line.productId, Number(e.target.value))}
                    style={{ width: 64, textAlign: "center" }}
                  />
                  <button type="button" style={stepBtn} onClick={() => setLineQty(line.productId, line.qty + 1)} aria-label="+">
                    +
                  </button>
                </div>
              </div>
              <button
                type="button"
                className="btn sm"
                style={{ marginLeft: "auto" }}
                onClick={() => removeLine(line.productId)}
                aria-label={m.calcRemoveLineAria.replace("{name}", line.name)}
              >
                {m.calcRemoveLineCta}
              </button>
            </div>
          </div>
        ))
      )}

      <button type="button" className="btn" onClick={handleOpen}>
        {m.pickerOpenCta}
      </button>

      {open && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          {/* `.tall`: modal jadi kolom flex bertinggi terbatas, `.modalbody`
              di bawah jadi SATU-SATUNYA area gulir (bukan overlay MAUPUN
              modal yang ikut gulir) — sebelumnya daftar produk punya
              gulirnya sendiri (maxHeight 52vh) DI DALAM modal yang overlay-
              nya juga bisa gulir: dua area gulir bersarang, pengguna tidak
              bisa membedakan sedang menggeser yang mana (temuan review
              2026-08-29). Header/pencarian/kategori tetap di luar
              `.modalbody` supaya selalu terlihat; tombol Tutup juga di
              luar, di dasar, supaya tidak perlu digulir ke ujung daftar. */}
          <div className="modal tall" role="dialog" aria-modal="true" aria-label={m.calcGoToProductsCta}>
            <h2>{m.calcGoToProductsCta}</h2>

            {initialLoading && <div className="hint">{m.loading}</div>}
            {initialError && (
              <div className="banner bad">
                {initialError}
                <div className="btnrow-inline">
                  <button type="button" className="btn sm" onClick={katalog.reload}>
                    {m.retry}
                  </button>
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

                {/* Error susulan (pencarian/muat-lebih gagal): daftar yang
                    sudah ada TETAP tampil di bawahnya, tidak dikosongkan. */}
                {error && (
                  <div className="banner bad" style={{ flex: "none" }}>
                    {error}
                  </div>
                )}
                {searching && (
                  <div className="hint" style={{ flex: "none" }}>
                    {m.loading}
                  </div>
                )}

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
                            <button
                              type="button"
                              className="btn sm primary"
                              onClick={() => addProduct(p)}
                              aria-label={m.pickerAddAria.replace("{name}", p.name)}
                            >
                              {m.add}
                            </button>
                          </div>
                        );
                      })}
                      {hasMore && (
                        <div className="btnrow" style={{ justifyContent: "center", margin: "10px 0" }}>
                          <button
                            type="button"
                            className="btn sm"
                            onClick={katalog.loadMore}
                            disabled={loadingMore || searching}
                          >
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
              <button type="button" className="btn" onClick={() => setOpen(false)}>
                {m.close}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
