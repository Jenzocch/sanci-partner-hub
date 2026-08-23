/**
 * TIGA kunci yang dipakai halaman /offline — dipisah ke berkas mungil ini
 * KHUSUS supaya `app/offline/offline-card.tsx` (client component yang
 * disimpan service worker di ponsel SETIAP pengguna dan harus terbuka tanpa
 * jaringan) tidak perlu meng-import seluruh slice `common`: satu export
 * objek tidak bisa di-tree-shake per properti (LESSONS #38), jadi import
 * `common` membuat bundle /offline membawa 231 kunci × 3 bahasa hanya untuk
 * tiga kalimat ini (audit kecepatan muat 2026-08-22 #12).
 *
 * INI SUMBER KEBENARAN TUNGGALNYA — `common.ts` menyebarkan (`...offline.id`
 * dst.) objek ini ke dalam slice-nya, jadi seluruh app lain tetap membaca
 * kunci yang sama lewat `m.common.retry`/`offlineTitle`/`offlineBody` tanpa
 * ada terjemahan yang diduplikasi. Mengubah kalimatnya = ubah DI SINI saja.
 */

const id = {
  retry: "Coba Lagi",
  offlineTitle: "Tidak ada koneksi",
  offlineBody:
    "Halaman ini belum pernah dibuka sebelumnya, jadi tidak tersedia secara offline. Sambungkan kembali ke internet lalu coba lagi.",
} as const;

type Shape = Record<keyof typeof id, string>;

const en = {
  retry: "Try again",
  offlineTitle: "No connection",
  offlineBody:
    "This page has never been opened before, so it is not available offline. Get back online and try again.",
} satisfies Shape;

const zh = {
  retry: "重试",
  offlineTitle: "没有网络",
  offlineBody: "这个页面之前没有打开过，所以离线时看不到内容。请连上网络后再试。",
} satisfies Shape;

export const offline = { id, en, zh };
