/**
 * Tautan pesanan untuk PELANGGAN (halaman `/lihat/<token>`, migrasi 0023).
 *
 * Berkas ini SENGAJA murni: tidak mengimpor `next/headers`, tidak mengimpor
 * Supabase, tidak mengimpor `Messages`. Ia dipakai dari Server Component,
 * dari Server Action, DAN dari komponen client (tombol wa.me) — satu-satunya
 * cara supaya ketiganya tidak pernah menyusun teks yang berbeda.
 *
 * BAHASA: teks pesan WhatsApp di bawah HARDCODED Bahasa Indonesia dan TIDAK
 * lewat i18n — sama seperti halaman cetak SO/DO/Invoice
 * (`app/admin/orders/[orderId]/documents/[documentId]/print/page.tsx`) dan
 * dengan alasan yang sama persis: pembacanya adalah PELANGGAN toko, bukan
 * staf. Kalau staf kebetulan sedang memakai antarmuka Inggris/Mandarin,
 * pelanggannya tetap harus menerima pesan berbahasa Indonesia. Yang ikut
 * bahasa staf hanyalah LABEL TOMBOL di layar staf (itu lewat i18n biasa).
 */

/** Segmen rute halaman pelanggan. Satu tempat, dipakai semua penyusun URL. */
export const CUSTOMER_LINK_PATH = "/lihat";

/**
 * Menyusun alamat lengkap tautan pelanggan.
 *
 * `origin` WAJIB berasal dari header permintaan yang sedang berjalan
 * (`host` + protokol) dan TIDAK PERNAH dari nilai kiriman client. Domain yang
 * boleh disuntik pemanggil = tautan phishing yang dikirim atas nama toko;
 * proyek lain sudah pernah menambal lubang itu. Server Component pemanggil
 * yang membacanya dari `headers()`; berkas ini hanya merakit.
 */
export function customerLinkUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}${CUSTOMER_LINK_PATH}/${encodeURIComponent(token)}`;
}

/**
 * Isi pesan WhatsApp ke pelanggan — SATU teks, dipakai jalur Fonnte (nomor
 * perusahaan) MAUPUN jalur wa.me (WhatsApp staf sendiri). Kalau keduanya
 * menyusun kalimat sendiri-sendiri, pelanggan yang sama bisa menerima dua
 * gaya pesan berbeda dari toko yang sama.
 *
 * Nama depan boleh kosong (pesanan tanpa nama yang layak disapa) — sapaannya
 * lalu jatuh ke "Halo," tanpa nama, bukan "Halo undefined,".
 */
export function customerLinkMessage(opts: {
  firstName: string | null;
  orderNumber: string;
  url: string;
  storeName?: string | null;
}): string {
  const sapaan = opts.firstName ? `Halo ${opts.firstName},` : "Halo,";
  const toko = opts.storeName ? ` ${opts.storeName}` : "";
  return (
    `${sapaan}\n\n` +
    `Terima kasih sudah memesan di${toko ? toko : " toko kami"}. ` +
    `Pesanan Anda dengan nomor ${opts.orderNumber} bisa dilihat di tautan berikut:\n` +
    `${opts.url}\n\n` +
    `Di halaman itu Anda bisa melihat status pesanan, isi pesanan, dan rincian pembayaran. ` +
    `Kalau ada yang ingin ditanyakan, silakan balas pesan ini.`
  );
}

/**
 * Nomor telepon (bentuk kanonik "62…", hasil normalizePhoneID) → alamat
 * wa.me. `text` opsional: dipakai untuk tombol "Kirim link", dikosongkan
 * untuk tombol "buka percakapan" biasa di baris nomor telepon.
 *
 * Mengembalikan null kalau nomornya tidak berbentuk kanonik — pemanggil
 * lalu menampilkan nomornya sebagai teks biasa, bukan tautan yang pasti
 * membuka percakapan kosong ke nomor yang salah.
 */
export function waMeUrl(phoneNormalized: string | null | undefined, text?: string): string | null {
  if (!phoneNormalized) return null;
  const digits = phoneNormalized.replace(/[^0-9]/g, "");
  if (!digits.startsWith("62") || digits.length < 10) return null;
  return text
    ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
    : `https://wa.me/${digits}`;
}

/* ------------------------------------------------------------------ *
 * Tahap pesanan yang dilihat pelanggan (diturunkan DATABASE, 0023 §5)
 * ------------------------------------------------------------------ */

/**
 * Kode tahap dari `fn_customer_order_view`. Sengaja KODE, bukan kalimat:
 * database tidak boleh memutuskan kata-kata yang muncul di layar (konvensi
 * enum proyek ini — nilai internal Inggris, tampilan diterjemahkan).
 */
export type CustomerStage =
  | "ORDER_RECEIVED"
  | "SHIPPING"
  | "DELIVERED"
  | "READY_FOR_PICKUP"
  | "PICKED_UP"
  | "CANCELLED";

export type CustomerOrderItem = {
  name: string;
  code: string | null;
  qty: number;
  photo_url: string | null;
};

export type CustomerOrderAmounts = {
  final: number | string;
  dp: number | string;
  sisa: number | string;
};

/** Bentuk persis objek jsonb yang dikembalikan `fn_customer_order_view`. */
export type CustomerOrderView = {
  order_number: string;
  customer_first_name: string | null;
  cancelled: boolean;
  stage: CustomerStage;
  city?: string | null;
  fulfillment_path?: "DIRECT_DELIVERY" | "SHOWROOM_VISIT" | null;
  do_date?: string | null;
  delivered_at?: string | null;
  items?: CustomerOrderItem[] | null;
  amounts?: CustomerOrderAmounts | null;
  has_address?: boolean;
};

/**
 * Bentuk jawaban Server Action sisi STAF (kirim link / tandai diterima).
 * Sama pola dengan `ActionResult<T>` yang dipakai berkas aksi lain — ditaruh
 * di sini supaya kartu bersama (`customer-link-card.tsx`) dan KEDUA berkas
 * aksi (cabang & admin) memegang satu tipe yang sama.
 */
export type CustomerLinkActionResult<T> = { data: T } | { error: { message: string } };

/** Jawaban `fn_customer_reveal_address`. */
export type RevealResult =
  | { status: "ok"; address: string | null }
  | { status: "invalid"; attempts_left: number }
  | { status: "locked"; locked_until: string }
  | { status: "not_found" };
