"use client";

import { useState } from "react";
import { STOCK_STATUS_CHIP, stockStatusLabel, type StockStatus } from "@/lib/catalog-shared";
import { useCabangMessages } from "@/lib/i18n/provider";
import { formatIDR } from "@/lib/orders-shared";
import styles from "../produk.module.css";

export type GalleryPhoto = { id: string; photo_url: string };

export type ProdukDetailItem = {
  id: string;
  name: string;
  code: string | null;
  category: string | null;
  description: string | null;
  photoUrl: string | null;
  stockStatus: StockStatus;
  /** `null` = tanpa Harga Normal untuk toko ini — baris harga TIDAK
   *  ditampilkan sama sekali (bukan "Rp 0", lihat catatan di page.tsx). */
  price: number | null;
  /** URL absolut halaman publik /p/[productId] — sudah disusun server dari
   *  host request sungguhan (page.tsx), bukan domain yang ditulis tetap. */
  publicUrl: string;
};

/**
 * Konten detail produk sisi cabang (migration 0022). Sampul + galeri
 * digabung jadi SATU strip foto yang bisa ditukar-tukar (klik thumbnail
 * untuk memilih, klik foto besar untuk memperbesar) — pola lightbox
 * "photoView" yang sama dengan lib/kalkulator-client.tsx (overlay + modal,
 * tanpa library tambahan).
 */
export default function ProdukDetailClient({
  item,
  gallery,
}: {
  item: ProdukDetailItem;
  gallery: GalleryPhoto[];
}) {
  const m = useCabangMessages();
  const photos = [item.photoUrl, ...gallery.map((g) => g.photo_url)].filter((u): u is string => !!u);
  const [active, setActive] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const activeUrl = photos[active] ?? null;

  const shareText = m.cabang.produkDetailShareText.replace("{name}", item.name).replace("{url}", item.publicUrl);
  const waHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  return (
    <>
      {activeUrl ? (
        <button
          type="button"
          className={styles.detailphoto}
          onClick={() => setLightboxOpen(true)}
          aria-label={item.name}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- photo_url adalah URL publik dari SANCI (bukan aset lokal), lihat catatan di lib/catalog-shared.ts */}
          <img src={activeUrl} alt={item.name} />
        </button>
      ) : (
        <div className={styles.detailphoto}>
          <div className={styles.placeholder}>{m.common.noPhotoPlaceholder}</div>
        </div>
      )}

      {photos.length > 1 && (
        <div className={styles.gallerystrip}>
          {photos.map((url, i) => (
            <button
              key={url + i}
              type="button"
              className={`${styles.gallerythumb}${i === active ? ` ${styles.gallerythumbOn}` : ""}`}
              onClick={() => setActive(i)}
              aria-label={m.cabang.produkDetailGalleryAria.replace("{n}", String(i + 1)).replace("{total}", String(photos.length))}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- lihat catatan di atas */}
              <img src={url} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}

      <h2>{item.name}</h2>
      <div className="row" style={{ marginTop: 8, marginBottom: 4 }}>
        {item.code && <span className="code">{item.code}</span>}
        <span className={STOCK_STATUS_CHIP[item.stockStatus]}>{stockStatusLabel(m, item.stockStatus)}</span>
      </div>
      {item.category && <div className="muted small">{item.category}</div>}

      {/* Harga Normal (0021) — hanya tampil kalau toko ini punya harga
          efektif (override sendiri atau Harga Dasar SANCI). Tanpa harga =
          baris ini TIDAK ADA sama sekali, bukan "Rp 0" (0 adalah harga
          promo yang sah, beda makna dari "belum ada harga"). */}
      {item.price !== null && (
        <div className="rowline">
          <span className="muted">{m.cabang.produkDetailPriceLabel}</span>
          <span style={{ fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>{formatIDR(item.price)}</span>
        </div>
      )}

      {item.description && (
        <p className="sub" style={{ whiteSpace: "pre-line", marginTop: 12 }}>
          {item.description}
        </p>
      )}

      <div className="btnrow" style={{ marginTop: 18 }}>
        <a href={waHref} target="_blank" rel="noopener noreferrer" className="btn primary">
          {m.cabang.produkDetailShareBtn}
        </a>
      </div>

      {lightboxOpen && activeUrl && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setLightboxOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label={item.name}>
            {/* eslint-disable-next-line @next/next/no-img-element -- lihat catatan di atas */}
            <img
              src={activeUrl}
              alt={item.name}
              style={{ width: "100%", height: "auto", borderRadius: "var(--r-md)", marginBottom: 12, display: "block" }}
            />
            <button type="button" className="btn" onClick={() => setLightboxOpen(false)}>
              {m.common.close}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
