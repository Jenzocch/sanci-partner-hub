"use client";

/**
 * Daftar produk /admin/produk — sejak 2026-08-26 pencarian & filter berjalan
 * di DATABASE dan daftar tumbuh per 60 lewat "Muat Lebih Banyak" (kontrak
 * lib/catalog-query.ts), menggantikan pola lama "muat SEMUA baris + saring
 * di memori" (form GET). Batch pertama tetap dirender server (props
 * initial*); pencarian diketik → debounce 300 ms → getProdukPageAdmin.
 *
 * Semantik yang DIPERTAHANKAN dari versi lama:
 *   - pencarian nama/kode saja (placeholder admin memang lebih sempit);
 *   - filter stok & kategori berupa <select> (bukan chip — layar ini layar
 *     kelola, bukan etalase), kini dieksekusi query;
 *   - layar ini menampilkan SEMUA status (ACTIVE + INACTIVE) — beda sengaja
 *     dari kalkulator/picker yang ACTIVE-only;
 *   - tiga kalimat kosong yang berbeda (tanpa produk sama sekali / tidak
 *     cocok pencarian / kategori-stok kosong).
 *
 * Filter stok hidup di LUAR hook (dimensi ekstra layar ini di atas kontrak
 * bersama) — dibawa lewat ref ke closure fetch, dan predikat
 * canRestoreInitial menahan pemulihan batch awal selagi stok ≠ ALL.
 */

import { useCallback, useRef, useState } from "react";
import { formatIDR } from "@/lib/orders-shared";
import { STOCK_STATUS_CHIP, stockStatusLabel, type StockStatus } from "@/lib/catalog-shared";
import { useCatalogSearch, type CatalogFetchResult } from "@/lib/use-catalog-search";
import { useAdminMessages } from "@/lib/i18n/provider";
import { getProdukPageAdmin, type AdminProdukRow } from "../catalog-actions";
import AddProductButton from "./add-product-button";
import ProductActions from "./product-actions";
import ProductPhoto from "./product-photo";

export default function ProdukAdminClient({
  initialProducts,
  initialHasMore,
  categories,
}: {
  initialProducts: AdminProdukRow[];
  initialHasMore: boolean;
  /** Daftar kategori LENGKAP dari server page (independen dari halaman tampil). */
  categories: string[];
}) {
  const m = useAdminMessages();
  const [stock, setStock] = useState<"ALL" | StockStatus>("ALL");
  const stockRef = useRef<"ALL" | StockStatus>("ALL");

  const STOCK_OPTIONS: { value: "ALL" | StockStatus; label: string }[] = [
    { value: "ALL", label: m.admin.filterStockAll },
    { value: "AVAILABLE", label: m.common.stockAvailable },
    { value: "LIMITED", label: m.common.stockLimited },
    { value: "OUT_OF_STOCK", label: m.common.stockOutOfStock },
  ];

  const fetchForHook = useCallback(
    async (input: { q: string; category: string | null; offset: number }): Promise<
      CatalogFetchResult<AdminProdukRow>
    > => {
      try {
        const res = await getProdukPageAdmin({ ...input, stock: stockRef.current });
        if (res.status === "ok") return { ok: true, products: res.products, hasMore: res.hasMore };
        if (res.status === "module_inactive") return { ok: false, message: m.admin.catalogMigrationMsg };
        return { ok: false, message: m.common.errorLoad };
      } catch {
        return { ok: false, message: m.common.errorLoad };
      }
    },
    [m]
  );

  const katalog = useCatalogSearch<AdminProdukRow>({
    fetchPage: fetchForHook,
    initial: { products: initialProducts, hasMore: initialHasMore },
    initialCategories: categories,
    fallbackErrorMessage: m.common.errorLoad,
    canRestoreInitial: () => stockRef.current === "ALL",
  });
  const { products, hasMore, searching, loadingMore, error } = katalog;

  function onStockChange(value: "ALL" | StockStatus) {
    setStock(value);
    stockRef.current = value;
    katalog.reload();
  }

  const emptyMessage = katalog.q.trim()
    ? m.admin.produkEmptyFiltered.replace("{q}", katalog.q.trim())
    : katalog.category !== null || stock !== "ALL"
      ? m.admin.produkEmptyFilteredCategory
      : m.admin.produkEmpty;

  return (
    <div>
      <div className="worktop">
        <h1>{m.common.product}</h1>
        <AddProductButton />
      </div>

      <div className="searchrow wide">
        <input
          type="search"
          placeholder={m.admin.produkSearchPlaceholder}
          value={katalog.q}
          onChange={(e) => katalog.setQuery(e.target.value)}
          className="search-input"
        />
        <select
          value={stock}
          onChange={(e) => onStockChange(e.target.value as "ALL" | StockStatus)}
          className="filter-select"
          aria-label={m.admin.filterStockAll}
        >
          {STOCK_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {katalog.categories.length > 0 && (
          <select
            value={katalog.category ?? ""}
            onChange={(e) => katalog.setCategoryFilter(e.target.value || null)}
            className="filter-select"
            aria-label={m.admin.filterCategoryAll}
          >
            <option value="">{m.admin.filterCategoryAll}</option>
            {katalog.categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Pencarian gagal ≠ daftar kosong — hasil sebelumnya tetap tampil. */}
      {error && <div className="banner bad">{error}</div>}
      {searching && <div className="hint">{m.common.loading}</div>}

      {products.length === 0 ? (
        !searching && <div className="card emptybox">{emptyMessage}</div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: 18,
          }}
        >
          {products.map((p) => (
            <div
              key={p.id}
              className="card"
              style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", marginBottom: 0 }}
            >
              <ProductPhoto url={p.photo_url} name={p.name} />
              <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
                <div>
                  {/* Tinggi nama DIPAKUKAN dua baris (permintaan owner
                      2026-08-26 "排版要相同"): nama satu baris vs dua baris
                      tadinya menggeser harga/chip/tombol tiap kartu ke
                      ketinggian berbeda — grid jadi sulit dipindai. Nama
                      lebih panjang tetap tampil utuh (baris ketiga menambah
                      tinggi, tidak dipotong — layar kelola butuh nama penuh). */}
                  <div style={{ fontWeight: 650, fontSize: "var(--fs-body)", minHeight: "2.6em" }}>{p.name}</div>
                  <div style={{ marginTop: 4 }}>
                    {p.code ? <span className="code">{p.code}</span> : <span className="small muted">—</span>}
                  </div>
                  {/* Harga Dasar SANCI langsung di kartu (permintaan owner
                      2026-08-26). Tiga keadaan dibedakan — kontrak
                      attachDisplayPrices (LESSONS #10): number = harga,
                      null = pasti belum ada, undefined = query harga gagal
                      (JANGAN tampil seolah "belum ada harga"). */}
                  <div style={{ marginTop: 6 }}>
                    {typeof p.display_price === "number" ? (
                      /* Merah (token --bad, ikut tema terang/gelap) — permintaan
                         owner 2026-08-26: harga harus mencolok sekilas. */
                      <span style={{ fontWeight: 650, fontVariantNumeric: "tabular-nums", color: "var(--bad)" }}>
                        {formatIDR(p.display_price)}
                      </span>
                    ) : p.display_price === null ? (
                      <span className="small muted">{m.admin.produkCardPriceNone}</span>
                    ) : (
                      <span className="small muted">{m.admin.produkCardPriceLoadFailed}</span>
                    )}
                  </div>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <span className={STOCK_STATUS_CHIP[p.stock_status]}>{stockStatusLabel(m, p.stock_status)}</span>
                  <span className={`chip ${p.status}`}>
                    {p.status === "ACTIVE" ? m.common.statusActive : m.common.statusInactive}
                  </span>
                </div>
                {/* marginTop:auto menjepit blok kendali (Status stok + tombol)
                    ke DASAR kartu — semua kartu sebaris menaruh kendalinya di
                    garis yang sama, apa pun panjang isi di atasnya. */}
                <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
                  {/* onSaved: baris state ikut nilai yang server konfirmasi —
                      router.refresh() tidak menembus useState hook katalog
                      (LESSONS #45); tanpa ini prefill modal Ubah berikutnya
                      menulis balik data pra-simpan. */}
                  <ProductActions product={p} onSaved={(patch) => katalog.patchProduct(p.id, patch)} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {hasMore && products.length > 0 && (
        <div className="btnrow" style={{ justifyContent: "center", marginTop: 18 }}>
          <button
            type="button"
            className="btn"
            onClick={katalog.loadMore}
            disabled={loadingMore || searching}
          >
            {loadingMore ? m.common.loading : m.common.loadMoreCta}
          </button>
        </div>
      )}

      <p className="footnote">{m.admin.produkFootnote}</p>
    </div>
  );
}
