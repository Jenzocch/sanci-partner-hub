"use client";

import { useMemo, useState } from "react";
import { STOCK_STATUS_CHIP, stockStatusLabel, type StockStatus } from "@/lib/catalog-shared";
import { useMessages } from "@/lib/i18n/provider";
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

export default function ProdukListClient({ items }: { items: ProdukItem[] }) {
  const m = useMessages();
  const [q, setQ] = useState("");
  const [kategori, setKategori] = useState<string | null>(null);
  const [selected, setSelected] = useState<ProdukItem | null>(null);

  // Daftar kategori diambil dari data yang sudah termuat (limit 200), bukan
  // query terpisah — kategori hanyalah nilai teks bebas pada sanci_products.
  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((it) => {
      if (it.category) set.add(it.category);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, m.common.dateLocale));
  }, [items, m.common.dateLocale]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((it) => {
      if (kategori && it.category !== kategori) return false;
      if (!needle) return true;
      if (it.name.toLowerCase().includes(needle)) return true;
      if (it.code && it.code.toLowerCase().includes(needle)) return true;
      if (it.category && it.category.toLowerCase().includes(needle)) return true;
      return false;
    });
  }, [items, q, kategori]);

  return (
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

      {items.length === 0 ? (
        <div className="card emptybox">{m.cabang.noProductsYet}</div>
      ) : filtered.length === 0 ? (
        <div className="card emptybox">{m.cabang.noProductsMatchSearch}</div>
      ) : (
        <div className={styles.grid}>
          {filtered.map((it) => {
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
                    <img src={it.photoUrl} alt={it.name} loading="lazy" />
                  ) : (
                    <div className={styles.placeholder}>{m.cabang.noPhotoPlaceholder}</div>
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

      {selected && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setSelected(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label={m.cabang.produkDetailAria.replace("{name}", selected.name)}>
            <div className={styles.detailphoto}>
              {selected.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- photo_url adalah URL publik dari SANCI (bukan aset lokal), lihat catatan di lib/catalog-shared.ts
                <img src={selected.photoUrl} alt={selected.name} />
              ) : (
                <div className={styles.placeholder}>{m.cabang.noPhotoPlaceholder}</div>
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
