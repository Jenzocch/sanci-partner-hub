"use client";

import { useCallback, useMemo, useState } from "react";
import { STOCK_STATUS_CHIP, stockStatusLabel, type StockStatus } from "@/lib/catalog-shared";
import { useCatalogSearch, type CatalogFetchResult } from "@/lib/use-catalog-search";
import { useCabangMessages } from "@/lib/i18n/provider";
import { getCatalogPageBranch } from "@/app/cabang/catalog-actions";
import styles from "./produk.module.css";

export type ProdukItem = {
  id: string;
  name: string;
  code: string | null;
  category: string | null;
  description: string | null;
  photoUrl: string | null;
  stockStatus: StockStatus;
};

/**
 * Daftar Produk cabang — sejak 2026-08-26 pencarian & filter kategori
 * dieksekusi DATABASE dan daftar tumbuh per 60 lewat "Muat Lebih Banyak"
 * (kontrak lib/catalog-query.ts; menggantikan pola lama "muat ≤200 lalu
 * saring di client"). Batch pertama tetap dirender server (props initial*);
 * fetch lanjutan lewat getCatalogPageBranch — gerbang katalog + RLS yang
 * sama dengan halaman ini sendiri. Outcome fetch dipetakan ke kalimat slice
 * cabang di sini (error ≠ belum dibuka ≠ kosong, LESSONS #10); kegagalan
 * pencarian membiarkan hasil sebelumnya tetap tampil (lihat hook).
 */
export default function ProdukListClient({
  initialItems,
  initialHasMore,
  categories,
}: {
  initialItems: ProdukItem[];
  initialHasMore: boolean;
  /** Daftar kategori LENGKAP dari server page (independen dari halaman tampil). */
  categories: string[];
}) {
  const m = useCabangMessages();
  const [selected, setSelected] = useState<ProdukItem | null>(null);

  const fetchForHook = useCallback(
    async (input: { q: string; category: string | null; offset: number; withCategories?: boolean }): Promise<
      CatalogFetchResult<ProdukItem>
    > => {
      try {
        const res = await getCatalogPageBranch(input);
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
              description: p.description ?? null,
              photoUrl: p.photo_url,
              stockStatus: p.stock_status,
            })),
          };
        }
        if (res.status === "not_opened") return { ok: false, message: m.cabang.catalogNotOpenedMsg };
        if (res.status === "module_inactive") return { ok: false, message: m.cabang.errCatalogModuleInactive };
        return { ok: false, message: m.cabang.errProductListLoadFailed };
      } catch {
        return { ok: false, message: m.cabang.errProductListLoadFailed };
      }
    },
    [m]
  );

  const katalog = useCatalogSearch<ProdukItem>({
    fetchPage: fetchForHook,
    initial: { products: initialItems, hasMore: initialHasMore },
    initialCategories: categories,
    fallbackErrorMessage: m.cabang.errProductListLoadFailed,
  });
  const { products, hasMore, searching, loadingMore, error } = katalog;

  const sortedCategories = useMemo(
    () => [...katalog.categories].sort((a, b) => a.localeCompare(b, m.common.dateLocale)),
    [katalog.categories, m.common.dateLocale]
  );

  return (
    <>
      <div className="searchrow">
        <input
          className="search-input"
          type="search"
          placeholder={m.common.produkSearchPlaceholder}
          value={katalog.q}
          onChange={(e) => katalog.setQuery(e.target.value)}
        />
      </div>

      {sortedCategories.length > 0 && (
        <div className={styles.filters}>
          <button
            type="button"
            className={`${styles.filterchip}${katalog.category === null ? ` ${styles.filterOn}` : ""}`}
            onClick={() => katalog.setCategoryFilter(null)}
          >
            {m.common.filterAll}
          </button>
          {sortedCategories.map((c) => (
            <button
              key={c}
              type="button"
              className={`${styles.filterchip}${katalog.category === c ? ` ${styles.filterOn}` : ""}`}
              onClick={() => katalog.setCategoryFilter(katalog.category === c ? null : c)}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {/* Pencarian gagal ≠ daftar kosong: hasil sebelumnya tetap tampil di
          bawah banner ini (jaringan lemah tidak boleh mengosongkan layar). */}
      {error && <div className="banner bad">{error}</div>}
      {searching && <div className="hint">{m.common.loading}</div>}

      {products.length === 0 ? (
        !searching && (
          <div className="card emptybox">
            {katalog.isFiltered ? m.common.noProductsMatchSearch : m.common.noProductsYet}
          </div>
        )
      ) : (
        <div className={styles.grid}>
          {products.map((it) => {
            const isOut = it.stockStatus === "OUT_OF_STOCK";
            return (
              <button
                key={it.id}
                type="button"
                className={`${styles.card}${isOut ? ` ${styles.outofstock}` : ""}`}
                onClick={() => setSelected(it)}
                aria-label={m.cabang.produkViewDetailAria.replace("{name}", it.name)}
              >
                <div className={styles.photo}>
                  {it.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- photo_url adalah URL publik dari SANCI (bukan aset lokal), lihat catatan di lib/catalog-shared.ts
                    <img src={it.photoUrl} alt={it.name} loading="lazy" decoding="async" />
                  ) : (
                    <div className={styles.placeholder}>{m.common.noPhotoPlaceholder}</div>
                  )}
                </div>
                <div className={styles.body}>
                  <div className={styles.name}>{it.name}</div>
                  {it.category && <div className={styles.cat}>{it.category}</div>}
                  <span className={STOCK_STATUS_CHIP[it.stockStatus]}>{stockStatusLabel(m, it.stockStatus)}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {hasMore && products.length > 0 && (
        <div className="btnrow" style={{ justifyContent: "center", marginTop: 14 }}>
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

      {selected && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setSelected(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label={m.cabang.produkDetailAria.replace("{name}", selected.name)}>
            <div className={styles.detailphoto}>
              {selected.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- photo_url adalah URL publik dari SANCI (bukan aset lokal), lihat catatan di lib/catalog-shared.ts
                <img src={selected.photoUrl} alt={selected.name} />
              ) : (
                <div className={styles.placeholder}>{m.common.noPhotoPlaceholder}</div>
              )}
            </div>
            <h2>{selected.name}</h2>
            <div className="stack" style={{ marginTop: 12 }}>
              <div className="row">
                {selected.code && <span className="code">{selected.code}</span>}
                <span className={STOCK_STATUS_CHIP[selected.stockStatus]}>
                  {stockStatusLabel(m, selected.stockStatus)}
                </span>
              </div>
              {selected.category && <div className="muted small">{selected.category}</div>}
              {/* Tanpa harga sama sekali (SPEC slice 5) — penawaran disampaikan SANCI secara manual. */}
              {selected.description && <p className="sub">{selected.description}</p>}
            </div>
            <div className="btnrow">
              <button type="button" className="btn" onClick={() => setSelected(null)}>
                {m.common.close}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
