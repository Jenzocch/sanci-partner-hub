"use client";

import { useState } from "react";
import styles from "./produk-publik.module.css";

/**
 * Strip foto + lightbox halaman publik produk — pola yang sama dengan
 * "photoView" di lib/kalkulator-client.tsx (overlay + modal, tanpa library
 * tambahan), tapi berdiri sendiri (bukan import lintas /cabang, lihat
 * catatan di produk-publik.module.css).
 *
 * BAHASA: hardcoded Bahasa Indonesia, TIDAK lewat Messages/i18n — halaman
 * ini dilihat PELANGGAN toko lewat link WhatsApp, bukan staf yang memilih
 * bahasa aplikasi (pola yang sama dengan halaman cetak dokumen, lihat
 * app/admin/orders/[orderId]/documents/[documentId]/print/page.tsx).
 */
export default function ProdukPublikClient({ name, photos }: { name: string; photos: string[] }) {
  const [active, setActive] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const activeUrl = photos[active] ?? null;

  return (
    <>
      {activeUrl ? (
        <button type="button" className={styles.detailphoto} onClick={() => setLightboxOpen(true)} aria-label={name}>
          {/* eslint-disable-next-line @next/next/no-img-element -- URL publik dari SANCI, bukan aset lokal */}
          <img src={activeUrl} alt={name} />
        </button>
      ) : (
        <div className={styles.detailphoto}>
          <div className={styles.placeholder}>Tidak ada foto</div>
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
              aria-label={`Lihat foto ${i + 1} dari ${photos.length}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- lihat catatan di atas */}
              <img src={url} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}

      {lightboxOpen && activeUrl && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setLightboxOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label={name}>
            {/* eslint-disable-next-line @next/next/no-img-element -- lihat catatan di atas */}
            <img
              src={activeUrl}
              alt={name}
              style={{ width: "100%", height: "auto", borderRadius: "var(--r-md)", marginBottom: 12, display: "block" }}
            />
            <button type="button" className="btn" onClick={() => setLightboxOpen(false)}>
              Tutup
            </button>
          </div>
        </div>
      )}
    </>
  );
}
