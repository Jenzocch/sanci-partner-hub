"use client";

import { useCallback, useMemo, useState } from "react";
import { STOCK_STATUS_CHIP, stockStatusLabel, type StockStatus } from "@/lib/catalog-shared";
import { useCabangMessages } from "@/lib/i18n/provider";
import { formatIDR } from "@/lib/orders-shared";
import ProductImg from "@/lib/product-img";
import styles from "../produk.module.css";

export type GalleryPhoto = { id: string; photo_url: string };

export type ProdukDetailItem = {
  id: string;
  name: string;
  code: string | null;
  category: string | null;
  description: string | null;
  size: string | null;
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
  // DEDUPE per URL: sampul dan salah satu baris galeri boleh menunjuk berkas
  // yang sama (tidak ada yang melarangnya di DB) — tanpa ini dua thumbnail
  // pertama tampil identik dan pengguna mengira galerinya rusak.
  const photos = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const u of [item.photoUrl, ...gallery.map((g) => g.photo_url)]) {
      if (!u || seen.has(u)) continue;
      seen.add(u);
      out.push(u);
    }
    return out;
  }, [item.photoUrl, gallery]);
  const [active, setActive] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  // Foto yang alamatnya TIDAK bisa dibuka. Diangkat ke sini (bukan hanya di
  // dalam ProductImg) karena pembungkus foto besar adalah <button> pembuka
  // lightbox: kotak tinggi yang bisa ditekan tapi isinya rusak lebih buruk
  // daripada kotak yang jelas-jelas cuma placeholder.
  const [broken, setBroken] = useState<ReadonlySet<string>>(() => new Set());
  const tandaiRusak = useCallback((url: string) => {
    setBroken((prev) => (prev.has(url) ? prev : new Set(prev).add(url)));
  }, []);
  const activeUrl = photos[active] ?? null;
  const activeUsable = !!activeUrl && !broken.has(activeUrl);

  const shareText = m.cabang.produkDetailShareText.replace("{name}", item.name).replace("{url}", item.publicUrl);
  const waHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  return (
    <>
      {activeUsable ? (
        <button
          type="button"
          className={styles.detailphoto}
          onClick={() => setLightboxOpen(true)}
          aria-label={item.name}
        >
          <ProductImg
            src={activeUrl}
            alt={item.name}
            loading="eager"
            onFail={tandaiRusak}
            placeholder={<div className={styles.placeholder}>{m.common.noPhotoPlaceholder}</div>}
          />
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
              <ProductImg
                src={url}
                alt=""
                onFail={tandaiRusak}
                placeholder={<span className={styles.placeholder}>{m.common.noPhotoPlaceholder}</span>}
              />
            </button>
          ))}
        </div>
      )}

      <h2 className={styles.detailname}>{item.name}</h2>
      <div className="row" style={{ marginTop: 8, marginBottom: 4 }}>
        {item.code && <span className="code">{item.code}</span>}
        <span className={STOCK_STATUS_CHIP[item.stockStatus]}>{stockStatusLabel(m, item.stockStatus)}</span>
      </div>
      {item.category && <div className="muted small">{item.category}</div>}

      {/* Ukuran (0024) — spesifikasi, jadi di ATAS harga: staf menjawab
          "muat tidak di kamarnya" sebelum menyebut angka rupiah. */}
      {item.size && (
        <div className={`rowline ${styles.specline}`} style={{ marginTop: 12 }}>
          <span className="muted">{m.cabang.produkDetailSizeLabel}</span>
          {/* .speclineValue: ukuran panjang seperti
              "(1200-1550)*1200/(1600-1800)*2000" harus PATAH, bukan
              terpotong diam-diam oleh body{overflow-x:hidden}. */}
          <span className={styles.speclineValue}>{item.size}</span>
        </div>
      )}

      {/* Harga Normal (0021) — hanya tampil kalau toko ini punya harga
          efektif (override sendiri atau Harga Dasar SANCI). Tanpa harga =
          baris ini TIDAK ADA sama sekali, bukan "Rp 0" (0 adalah harga
          promo yang sah, beda makna dari "belum ada harga"). */}
      {item.price !== null && (
        <div className={`rowline ${styles.specline}`}>
          <span className="muted">{m.cabang.produkDetailPriceLabel}</span>
          <span className={styles.speclineValue} style={{ fontVariantNumeric: "tabular-nums" }}>
            {formatIDR(item.price)}
          </span>
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

      {lightboxOpen && activeUsable && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setLightboxOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label={item.name}>
            <ProductImg
              src={activeUrl}
              alt={item.name}
              loading="eager"
              onFail={tandaiRusak}
              placeholder={<div className={styles.placeholder}>{m.common.noPhotoPlaceholder}</div>}
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
