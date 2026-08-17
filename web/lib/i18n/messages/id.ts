/**
 * Bahasa Indonesia — SUMBER KEBENARAN untuk daftar kunci.
 *
 * Dua bahasa lain (en.ts, zh.ts) bertipe `Messages` yang diturunkan dari file
 * ini, jadi kunci yang hilang atau salah ketik di sana = ERROR SAAT BUILD,
 * bukan tulisan mentah yang muncul di layar pengguna.
 *
 * Menambah teks baru: tambahkan di SINI dulu, lalu TypeScript akan memaksa
 * dua file lain mengikutinya. Patuhi GLOSSARY.md — satu konsep satu kata.
 */

export const id = {
  common: {
    appName: "SANCI Partner Hub",
    // Tombol & aksi
    save: "Simpan",
    cancel: "Batal",
    edit: "Ubah",
    add: "Tambah",
    search: "Cari",
    back: "Kembali",
    close: "Tutup",
    retry: "Coba Lagi",
    activate: "Aktifkan",
    deactivate: "Nonaktifkan",
    saving: "Menyimpan…",
    loading: "Memuat…",
    // Status umum
    statusActive: "Aktif",
    statusInactive: "Nonaktif",
    statusDraft: "Draf",
    statusSuspended: "Ditangguhkan",
    // Keadaan halaman
    emptyDefault: "Belum ada data.",
    errorLoad: "Gagal memuat data. Muat ulang halaman untuk mencoba lagi.",
    errorSection: "Bagian ini gagal dimuat — muat ulang halaman.",
    required: "Wajib diisi",
    optional: "Opsional",
    yes: "Ya",
    no: "Tidak",
    // Istilah inti (GLOSSARY.md)
    partner: "Partner",
    branch: "Cabang",
    staff: "Staf",
    account: "Akun",
    customer: "Pelanggan",
    order: "Pesanan",
    orderNumber: "Nomor Pesanan",
    package: "Package",
    product: "Produk",
    catalog: "Katalog",
    activity: "Aktivitas",
    reason: "Alasan",
    notes: "Catatan",
    phone: "Telepon",
    whatsapp: "WhatsApp",
    address: "Alamat",
    city: "Kota",
    province: "Provinsi",
    name: "Nama",
    fullName: "Nama Lengkap",
    code: "Kode",
    createdAt: "Dibuat",
    serverTime: "waktu server",
    language: "Bahasa",
  },
} as const;

/** Bentuk kunci yang WAJIB diikuti en.ts dan zh.ts. */
export type Messages = {
  [K in keyof typeof id]: { [K2 in keyof (typeof id)[K]]: string };
};
