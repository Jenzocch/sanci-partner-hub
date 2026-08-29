"use client";

/**
 * Bar total sticky di form pesanan baru — SATU komponen untuk DUA form
 * (/admin/orders/baru + /cabang/pesanan/baru), pola yang sama dengan
 * lib/order-item-picker.tsx (kenapa satu komponen dua area ada di kepala
 * berkas itu). Dibuat 2026-08-29 dari temuan review: manajer yang sudah
 * memilih 3 produk lewat picker harus menggulir lewat Sales/PIC/Alamat/PO/
 * Catatan/Invoice sebelum mencapai tombol "Buat Pesanan" di dasar form —
 * jarak operasi yang jauh justru di saat pelanggan berdiri di depannya.
 *
 * BUKAN pengganti tombol submit asli di dasar form — itu TETAP ada dan
 * TETAP jalur utama di desktop (satu gulir wajar di sana). Bar ini cuma
 * DUPLIKAT tombolnya, sengaja mati total di atas 767px (lihat
 * order-sticky-bar.module.css) supaya tidak menambah elemen mengambang di
 * layar besar yang tidak butuh itu.
 *
 * `onClick`/`disabled` DILEMPAR PERSIS dari pemanggil, bukan dihitung ulang
 * di sini — kedua form pemasang memakai `type="button"` + onClick manual
 * (BUKAN <form onSubmit>, lihat catatan panjang di new-order-form.tsx
 * tentang kenapa), jadi komponen ini tidak boleh berasumsi form submission
 * bawaan browser akan memanggil apa pun. Menduplikasi syarat `disabled`
 * (mis. `!customerReady`) di sini akan membusuk begitu syaratnya berubah di
 * satu tempat tapi tidak di sini — jadi TIDAK diduplikasi, cuma diteruskan.
 *
 * Subtotal DIHITUNG DI SINI dari `lines` (unitPrice × qty per baris) —
 * BUKAN ditulis ke server, BUKAN otoritatif. `partner_purchase_amount` yang
 * disimpan tetap datang dari field-nya sendiri (field bebas, tidak terikat
 * ke baris produk — lihat catatan panjang di new-order-form.tsx). Angka di
 * bar ini murni bantuan visual "ini yang barusan saya pilih", sama sifatnya
 * dengan liveFinal di kalkulator.
 */

import styles from "./order-sticky-bar.module.css";
import { formatIDR } from "@/lib/orders-shared";
import type { PickedLine } from "./order-item-picker";

export default function OrderStickyBar({
  lines,
  submitting,
  disabled,
  onClick,
  submitLabel,
  savingLabel,
  countLabel,
  submitAriaLabel,
  admin,
}: {
  lines: PickedLine[];
  submitting: boolean;
  /** Persis nilai `disabled` tombol submit asli di dasar form — lihat catatan di atas. */
  disabled: boolean;
  onClick: () => void;
  submitLabel: string;
  savingLabel: string;
  /** `m.orderStickyCount` — pemanggil menyisipkan {n} sendiri (lihat catatan pesan()/di i18n lain di proyek ini). */
  countLabel: string;
  submitAriaLabel: string;
  /** Rel navigasi desktop admin selebar --side-w — lihat catatan di module.css. */
  admin?: boolean;
}) {
  // Tidak ada apa pun dipilih = tidak ada yang perlu diringkas; form tetap
  // bisa dikirim tanpa produk (pickerEmptyHint), jadi bar ini diam saja
  // alih-alih menampilkan "0 produk · Rp 0" yang tidak berguna.
  if (lines.length === 0) return null;

  const itemCount = lines.length;
  const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0);

  return (
    <>
      <div className={styles.bottomSpacer} aria-hidden="true" />
      <div className={`${styles.stickyBar} ${admin ? styles.stickyBarAdmin : ""}`}>
        <div className={styles.stickyLeft}>
          <span className={styles.stickyCount}>{countLabel.replace("{n}", String(itemCount))}</span>
          <span className={styles.stickyTotal}>{formatIDR(subtotal)}</span>
        </div>
        <button
          type="button"
          className={`btn primary ${styles.stickyBtn}`}
          disabled={disabled}
          onClick={onClick}
          aria-label={submitAriaLabel.replace("{n}", String(itemCount)).replace("{total}", formatIDR(subtotal))}
        >
          {submitting ? savingLabel : submitLabel}
        </button>
      </div>
    </>
  );
}
