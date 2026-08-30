"use client";

/**
 * Bar keranjang katalog — SATU komponen untuk dua layar katalog cabang:
 * /cabang/produk (grid) dan /cabang/produk/[productId] (detail). Keduanya
 * memasangnya dari halaman server-nya masing-masing, di bawah konten.
 *
 * Tugasnya tiga:
 *   1. meringkas apa yang barusan dipilih (jumlah baris + subtotal);
 *   2. membawanya ke form pesanan baru lewat hand-off SEKALI PAKAI
 *      (lib/catalog-cart.ts) — bukan menulis apa pun ke database;
 *   3. menyediakan jalan keluar ("Kosongkan") supaya salah pencet tidak
 *      meninggalkan bar yang tidak bisa dihilangkan.
 *
 * Keranjang kosong = komponen ini TIDAK merender apa pun (termasuk spacer):
 * layar katalog kembali persis seperti sebelum fitur ini ada.
 *
 * Subtotal di sini murni bantuan visual "ini yang barusan saya pilih" —
 * sifatnya sama dengan angka di lib/order-sticky-bar.tsx, TIDAK otoritatif
 * dan tidak pernah dikirim ke server. Harga yang benar-benar tersimpan tetap
 * harga per baris di form pesanan (dan di sisi cabang tetap tunduk pada
 * trg_order_item_price_guard 0014). Kalau ada baris tanpa harga, subtotal
 * ini TIDAK LENGKAP dan itu ditulis terus terang di bawah angkanya.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCabangMessages } from "@/lib/i18n/provider";
import { formatIDR } from "@/lib/orders-shared";
import {
  clearCatalogCart,
  readCatalogCart,
  subscribeCatalogCart,
  writeCatalogHandoff,
  type CatalogCartLine,
} from "@/lib/catalog-cart";
import styles from "./catalog-cart-bar.module.css";

export default function CatalogCartBar() {
  const m = useCabangMessages();
  const router = useRouter();
  // Mulai KOSONG lalu diisi di useEffect: localStorage tidak ada di server,
  // dan render pertama di klien harus sama dengan render server (hidrasi).
  const [lines, setLines] = useState<CatalogCartLine[]>([]);
  const [gagal, setGagal] = useState(false);

  useEffect(() => {
    setLines(readCatalogCart());
    // Tombol "+" hidup di komponen LAIN (daftar/detail) — langganan ini yang
    // membuat bar bergerak saat ditekan; lihat catatan di lib/catalog-cart.ts.
    return subscribeCatalogCart(setLines);
  }, []);

  if (lines.length === 0) return null;

  const count = lines.length;
  const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0);
  const adaTanpaHarga = lines.some((l) => l.unitPrice <= 0);

  /**
   * "Buat Pesanan": tulis hand-off → kosongkan keranjang → pindah ke form.
   * Urutannya penting. Hand-off ditulis DULU dan hasilnya diperiksa: kalau
   * penyimpanan gagal, keranjang TIDAK dikosongkan dan tidak ada navigasi —
   * mengosongkan keranjang lalu pindah halaman dengan tangan kosong berarti
   * pilihan staf lenyap tanpa jejak (persis "gagal menyamar jadi sukses"
   * yang dilarang LESSONS #2/#10).
   */
  function handleBuatPesanan() {
    if (!writeCatalogHandoff(lines)) {
      setGagal(true);
      return;
    }
    setGagal(false);
    clearCatalogCart();
    router.push("/cabang/pesanan/baru");
  }

  function handleKosongkan() {
    if (!clearCatalogCart()) {
      setGagal(true);
      return;
    }
    setGagal(false);
  }

  return (
    <>
      <div className={styles.spacer} aria-hidden="true" />
      <div className={styles.bar}>
        <div className={styles.left}>
          <span className={styles.count}>{m.common.orderStickyCount.replace("{n}", String(count))}</span>
          <span className={styles.total}>{formatIDR(subtotal)}</span>
          {gagal ? (
            <span className={styles.note}>{m.cabang.katalogCartSaveFailed}</span>
          ) : (
            adaTanpaHarga && <span className={styles.note}>{m.cabang.katalogCartPriceIncomplete}</span>
          )}
        </div>
        <div className={styles.actions}>
          <button type="button" className="btn sm" onClick={handleKosongkan}>
            {m.cabang.katalogCartClearCta}
          </button>
          <button type="button" className="btn primary" onClick={handleBuatPesanan}>
            {m.cabang.createOrderCta}
          </button>
        </div>
      </div>
    </>
  );
}
