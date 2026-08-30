/**
 * Teks yang dipakai di MANA-MANA (tombol, status, keadaan halaman, istilah
 * inti). Teks khusus satu layar TIDAK ditaruh di sini — lihat cabang.ts /
 * admin.ts.
 *
 * ATURAN FILE PESAN (berlaku untuk semua file di folder ini):
 *   1. `id` adalah sumber kebenaran. `en` dan `zh` memakai `satisfies Shape`,
 *      jadi kunci yang hilang atau salah ketik = ERROR SAAT BUILD, bukan
 *      tulisan mentah di layar pengguna.
 *   2. Tiga bahasa ditulis BERDAMPINGAN supaya mudah dibandingkan saat
 *      menerjemahkan — bukan tiga file terpisah yang gampang melenceng.
 *   3. Patuhi GLOSSARY.md. Satu konsep = satu kata, di seluruh aplikasi.
 *      Kata baru yang akan dipakai lebih dari sekali: tambahkan ke glosarium
 *      dulu, baru dipakai.
 *   4. 简体中文 harus yang dimengerti orang Tiongkok daratan — bukan hasil
 *      ubah huruf tradisional ke sederhana. Daftar kata terlarang ada di
 *      GLOSSARY.md.
 *   5. Label bersama (status pesanan, jalur pesanan, status stok, Aktivitas)
 *      HANYA hidup di sini. lib/orders-shared.ts, lib/catalog-shared.ts dan
 *      lib/audit-format.ts membacanya lewat fungsi yang menerima `Messages` —
 *      jangan pernah menulis ulang teksnya di file lain.
 */

import { offline } from "./offline";

const id = {
  proposalCoverKicker: "Proposal Produk Pelanggan",
  proposalCoverSub: "Pilihan furnitur yang kami siapkan khusus untuk rumah Anda.",
  proposalIntroTitle: "Sebuah proposal untuk rumah Anda.",
  proposalIntroNote: "Dokumen ini memuat produk yang dipilih bersama Anda, lengkap dengan spesifikasi, foto, dan harga akhirnya.",
  proposalMetaNo: "Nomor",
  proposalMetaDate: "Tanggal",
  proposalMetaBy: "Disiapkan oleh",
  proposalMetaCount: "Produk dipilih",
  proposalSelectionKicker: "01 / Pilihan Anda",
  proposalSummaryKicker: "02 / Ringkasan",
  proposalSummaryTitle: "Ringkasan Harga",
  proposalSummaryNote: "Angka di atas mengikuti perhitungan sistem SANCI dan ditampilkan di sini sebagai ringkasan untuk pelanggan.",
  proposalCollectionKicker: "03 / Koleksi",
  proposalCollectionTitle: "Pilihan yang kami siapkan untuk Anda.",
  proposalAboutLabel: "Tentang produk",
  proposalDetailKicker: "{name} / Rincian",
  proposalGalleryKicker: "{name} / Galeri",
  proposalGalleryTitle: "Detail Produk",
  proposalFinalKicker: "04 / Akhir",
  proposalFinalTitle: "Pilihan Anda.",
  proposalFinalPrice: "Harga akhir",
  proposalThanksTitle: "Terima kasih.",
  proposalThanksBody: "Kami menantikan kesempatan membantu Anda menciptakan rumah yang terasa tepat.",
  proposalContactShowroom: "Showroom",
  proposalContactLabel: "Kontak",
  proposalProductsCount: "{n} produk dipilih",
  proposalSpecCode: "Kode produk",
  /* Proposal — dokumen cetak untuk pelanggan, dipasang di dua area
     (cabang & admin), jadi teksnya milik slice common. */
  proposalTitle: "Proposal",
  proposalSubtitle: "Pilihan produk yang kami siapkan untuk Anda",
  proposalForLabel: "Disiapkan untuk",
  proposalCustomerPlaceholder: "Nama pelanggan / proyek (opsional)",
  proposalPrintCta: "Cetak / Simpan PDF",
  proposalBackCta: "Kembali ke Kalkulator",
  proposalColItem: "Produk",
  proposalColQty: "Jumlah",
  proposalColUnit: "Harga Satuan",
  proposalColTotal: "Jumlah Harga",
  proposalSelectionTitle: "Pilihan Anda",
  proposalSubtotal: "Subtotal",
  proposalDiscountStep: "Diskon {pct}%",
  proposalMarkup: "Penyesuaian {pct}%",
  proposalCashDiscount: "Potongan tunai",
  proposalGrandTotal: "Total",
  proposalSpecSize: "Ukuran",
  proposalSpecCategory: "Kategori",
  proposalFootnote:
    "Harga dalam Rupiah dan belum termasuk ongkos kirim serta pemasangan, kecuali disebutkan lain. " +
    "Ketersediaan barang dikonfirmasi ulang saat pesanan dibuat.",
  proposalEmptyTitle: "Belum ada yang bisa dicetak",
  proposalEmptyBody:
    "Pilih dulu produknya di Kalkulator Penawaran, lalu tekan \"Buat Proposal\" di keranjang.",
  proposalLoadFailed: "Detail produk gagal dimuat, jadi halaman profil produk belum bisa ditampilkan.",
  proposalCatalogClosed: "Katalog SANCI belum dibuka untuk toko ini, jadi profil produk tidak bisa ditampilkan.",
  proposalProfilesMissing:
    "Ringkasan di atas tetap lengkap. Halaman profil produk bisa dicoba lagi setelah masalah di atas beres.",
  // Tiga kunci offline (retry/offlineTitle/offlineBody) hidup di offline.ts
  // (sumber tunggal — lihat komentar di sana; audit 2026-08-22 #12) dan
  // disebar masuk ke sini supaya pemakai lain tetap membaca m.common.*.
  ...offline.id,
  // "Muat Lebih Banyak" — tombol batch berikutnya di keenam layar katalog
  // (kontrak lib/catalog-query.ts, 2026-08-26). Menggantikan peringatan
  // catalogListCappedMsg (stopgap .limit(200) dari audit 2026-08-22 #11):
  // sejak pencarian/paging dieksekusi server, tidak ada lagi batas 200 yang
  // memotong diam-diam, jadi kuncinya dihapus bersama stopgap-nya.
  loadMoreCta: "Muat Lebih Banyak",
  appName: "SANCI Partner System",
  // Tombol & aksi
  save: "Simpan",
  cancel: "Batal",
  edit: "Ubah",
  add: "Tambah",
  search: "Cari",
  back: "Kembali",
  close: "Tutup",
  activate: "Aktifkan",
  deactivate: "Nonaktifkan",
  saving: "Menyimpan…",
  loading: "Memuat…",
  // Status umum
  statusActive: "Aktif",
  statusInactive: "Nonaktif",
  statusDraft: "Draf",
  statusSuspended: "Ditangguhkan",
  statusEnded: "Berakhir",
  statusDisabled: "Dinonaktifkan",
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
  email: "Email",
  label: "Label",
  address: "Alamat",
  city: "Kota",
  province: "Provinsi",
  name: "Nama",
  fullName: "Nama Lengkap",
  code: "Kode",
  createdAt: "Dibuat",
  serverTime: "waktu server",
  language: "Bahasa",
  status: "Status",
  description: "Deskripsi",
  category: "Kategori",
  contactName: "Kontak",
  role: "Peran",
  // "Invoice" TIDAK diterjemahkan di bahasa mana pun (GLOSSARY.md): kata itu
  // sudah dipakai sehari-hari, terjemahannya justru bikin salah paham.
  invoice: "Invoice",
  // "SO"/"DO" (Sales Order/Surat Jalan) — SAMA alasannya dengan Invoice di
  // atas (GLOSSARY.md), dipakai migrasi 0016 (dokumen pesanan).
  docTypeSO: "SO",
  docTypeDO: "DO",
  docTypeInvoice: "Invoice",

  // Status pesanan (dipakai lib/orders-shared.ts)
  orderStatusRegistered: "Terdaftar",
  orderStatusCancelled: "Dibatalkan",
  // Jalur pesanan + penjelasannya di form (dipakai lib/orders-shared.ts)
  fulfillment: "Jalur Pesanan",
  fulfillmentDirect: "Kirim Langsung",
  fulfillmentShowroom: "Kunjungan Showroom",
  fulfillmentDirectDesc:
    "Produk SANCI sudah dibeli di toko — SANCI kirim langsung, pelanggan tidak perlu datang",
  fulfillmentShowroomDesc:
    "Pelanggan akan datang ke SANCI untuk melihat / memilih produk",
  // Status stok (dipakai lib/catalog-shared.ts)
  stockStatus: "Status Stok",
  quantity: "Jumlah",
  stockAvailable: "Tersedia",
  stockLimited: "Terbatas",
  stockOutOfStock: "Habis",

  // Hak akses & peran (dipakai lib/audit-format.ts, juga layar Hak Akses)
  visibilityScope: "Visibilitas",
  editScope: "Cakupan Edit",
  scopeOwnBranch: "Cabang sendiri",
  scopePartnerAll: "Sesama partner",
  scopeSelectedBranches: "Cabang terpilih",
  roleBranchUser: "Pengguna Cabang",
  roleSanciAdmin: "SANCI Admin",
  roleSystem: "Sistem",

  // Nama kolom yang muncul di Aktivitas (lib/audit-format.ts)
  configured: "Dikonfigurasi",
  endDate: "Tanggal Berakhir",
  cancellationReason: "Alasan Pembatalan",
  storePurchase: "Total Belanja di Toko",
  // 0013 — nilai kesepakatan yang SANCI putuskan untuk satu pesanan. Bukan
  // harga produk (katalog tetap tanpa harga) dan bukan belanja pelanggan di
  // toko mitra (itu storePurchase di atas) — tiga angka berbeda.
  sanciOffer: "Penawaran SANCI",
  catalogAccess: "Akses Katalog",
  removed: "dihapus",
  // 0014 — DP/Kondisi Pembayaran (order_sanci_offers), alamat pengiriman
  // (partner_orders), dan kolom-kolom order_items. Lihat GLOSSARY.md.
  // `lineDiscount` SENGAJA tidak dipanggil "Diskon" (lihat GLOSSARY.md §"Penawaran
  // SANCI bukan harga" — sistem ini tidak menghitung diskon apa pun; ini murni
  // angka potongan yang diketik manusia per baris, sama sifatnya dengan `amount`).
  dpAmount: "Uang Muka (DP)",
  paymentCondition: "Kondisi Pembayaran",
  shippingAddress: "Alamat Pengiriman",
  // 0020 — nomor Purchase Order yang diterbitkan PELANGGAN sendiri (bukan
  // nomor pesanan sistem). "PO" tidak diterjemahkan di ketiga bahasa —
  // istilah dagang, prinsip yang sama dengan Invoice/SO/DO (GLOSSARY.md).
  customerPo: "Nomor PO Pelanggan",
  orderItems: "Isi Pesanan",
  colorCode: "Kode Warna",
  customSize: "Ukuran Custom",
  unitPrice: "Harga Satuan",
  // 0021 — kolom `price` di product_prices (daftar harga: Harga Dasar
  // SANCI + Harga Normal partner). Kata "Harga" DI SINI diizinkan — 0021
  // memang membuka konteks penetapan harga; layar jelajah katalog tetap
  // bebas harga (GLOSSARY.md).
  price: "Harga",
  lineDiscount: "Potongan Baris",
  // 0015 — rantai diskon TINGKAT PESANAN (order_sanci_offers). "Diskon" DI SINI
  // diizinkan (beda dari lineDiscount di atas) — lihat GLOSSARY.md §"订单层级
  // 的折扣链计算": owner sudah menetapkan sistem MEMANG menghitung ini.
  discountPcts: "Diskon",
  markupPct: "Markup",
  cashDiscount: "Potongan Tunai",
  finalAmount: "Harga Akhir",
  remainingBalance: "Sisa Bayar",

  // 0023 — Tautan pesanan untuk pelanggan (/lihat/<token>). Hidup di
  // common.ts karena kartu yang SAMA digambar di DUA sisi (detail pesanan
  // cabang DAN admin) — kalau ditulis dua kali, dua sisi akan menyimpang.
  // Kata-katanya sengaja bahasa pegawai toko sehari-hari, bukan istilah
  // teknis: yang membacanya staf penjualan, bukan admin sistem.
  custLinkTitle: "Link untuk Pelanggan",
  custLinkHint:
    "Link ini menampilkan status pesanan, isi pesanan, dan sisa pembayaran. Alamat lengkap baru muncul setelah pelanggan memasukkan nomor HP-nya sendiri.",
  custLinkCopyCta: "Salin link untuk pelanggan",
  custLinkCopiedMsg: "Link tersalin.",
  custLinkCopyFailedMsg: "Link tidak bisa disalin otomatis. Salin manual dari kotak di atas.",
  custLinkSendCompanyCta: "Kirim link via WhatsApp perusahaan",
  custLinkSendingMsg: "Mengirim…",
  // "Terkirim", BUKAN "sampai": yang kita tahu hanyalah layanan WhatsApp
  // menerima pesannya (LESSONS #7 — antrean bukan bukti sampai). Jangan
  // diganti dengan kata yang lebih kuat.
  custLinkSentCompanyMsg: "Terkirim dari nomor perusahaan.",
  custLinkSendSelfCta: "Kirim dari WhatsApp saya",
  custLinkNoPhoneMsg: "Pelanggan ini belum punya nomor WhatsApp yang bisa dipakai.",
  // Dipakai HANYA di jalur kirim/salin link (sisi cabang & admin). Untuk
  // tombol "Tandai sudah diterima pelanggan" ada kunci sendiri di bawah:
  // di sana kalimat tentang "link" menyebut benda yang salah dan tidak
  // menjawab pertanyaan pegawai ("jadi tertandai atau tidak?").
  custLinkUnavailableMsg: "Link untuk pelanggan belum bisa dibuat — fiturnya belum aktif. Hubungi SANCI Admin.",
  waOpenChatAria: "Buka percakapan WhatsApp dengan {phone}",

  markDeliveredCta: "Tandai sudah diterima pelanggan",
  markDeliveredModalTitle: "Tandai sudah diterima pelanggan?",
  markDeliveredDesc:
    "Pesanan {orderNumber} untuk {customer} akan ditandai sudah diterima. Waktunya diambil dari server, dan penandaan ini tidak bisa dibatalkan dari sini.",
  markDeliveredConfirmCta: "Ya, sudah diterima",
  markDeliveredWorkingCta: "Menandai…",
  markDeliveredDoneLabel: "Sudah diterima pelanggan",
  markDeliveredFailedMsg: "Penandaan belum tersimpan. Coba lagi sebentar lagi.",
  markDeliveredUnavailableMsg:
    "Pesanan ini BELUM ditandai sudah diterima pelanggan — fiturnya belum aktif. Hubungi SANCI Admin.",
  deliveredAt: "Diterima Pelanggan",

  // Kalimat Aktivitas (kode aksi audit → bahasa sehari-hari)
  auditOrderCreated: "Pesanan dibuat",
  auditOrderUpdated: "Pesanan diubah",
  auditOrderStatusChanged: "Status pesanan berubah",
  auditOrderCancelled: "Pesanan dibatalkan",
  auditOrderAttributionCorrected: "Atribusi cabang dikoreksi",
  auditOrderCustomerArrived: "Pelanggan tiba di SANCI",
  auditOrderInternalNote: "Catatan internal SANCI ditambahkan",
  auditOrderOfferSet: "Penawaran SANCI diisi",
  auditOrderOfferUpdated: "Penawaran SANCI diubah",
  auditOrderOfferRemoved: "Penawaran SANCI dihapus",
  auditOrderItemCreated: "Item pesanan ditambahkan",
  auditOrderItemUpdated: "Item pesanan diubah",
  auditOrderItemDeleted: "Item pesanan dihapus",
  auditOrderDocumentCreated: "Dokumen pesanan dibuat",
  auditOrderDocumentUpdated: "Dokumen pesanan diubah",
  auditOrderDocumentDeleted: "Dokumen pesanan dihapus",
  auditOrderDocumentItemCreated: "Baris dokumen ditambahkan",
  auditOrderDocumentItemUpdated: "Baris dokumen diubah",
  auditOrderDocumentItemDeleted: "Baris dokumen dihapus",
  auditCustomerCreated: "Pelanggan dibuat",
  auditCustomerUpdated: "Pelanggan diubah",
  auditCustomerPhoneChanged: "Nomor telepon pelanggan diubah",
  auditCustomerSourceCreated: "Kode sumber tamu dibuat",
  auditCustomerSourceUpdated: "Kode sumber tamu diubah",
  auditCustomerSourceStatusChanged: "Status kode sumber tamu berubah",
  auditSalesStaffCreated: "Kode sales dibuat",
  auditSalesStaffUpdated: "Kode sales diubah",
  auditSalesStaffStatusChanged: "Status kode sales berubah",
  auditPackageCreated: "Package dibuat",
  auditPackageUpdated: "Package diubah",
  auditPackageStatusChanged: "Status package berubah",
  auditPackageItemAdded: "Isi package ditambahkan",
  auditPackageItemUpdated: "Jumlah isi package diubah",
  auditPackageItemRemoved: "Isi package dihapus",
  auditProductCreated: "Produk ditambahkan",
  auditProductUpdated: "Produk diubah",
  auditProductStatusChanged: "Status produk berubah",
  auditProductDeleted: "Produk dihapus",
  // 0021 — daftar harga (product_prices): tiga aksi generik saja (tabel
  // tanpa kolom status). "Dihapus" = override dicabut (kembali ke Harga
  // Dasar SANCI) atau harga dasar dicabut admin.
  auditProductPriceSet: "Harga produk diisi",
  auditProductPriceUpdated: "Harga produk diubah",
  auditProductPriceRemoved: "Harga produk dihapus",
  auditCatalogAccessCreated: "Akses katalog dibuka",
  auditCatalogAccessUpdated: "Akses katalog diubah",
  auditPartnerCreated: "Partner dibuat",
  auditPartnerUpdated: "Partner diubah",
  auditPartnerStatusChanged: "Status partner berubah",
  auditBranchCreated: "Cabang dibuat",
  auditBranchUpdated: "Cabang diubah",
  auditBranchStatusChanged: "Status cabang berubah",
  auditStaffCreated: "Staf ditambahkan",
  auditStaffUpdated: "Staf diubah",
  auditStaffDeactivated: "Staf dinonaktifkan",
  auditStaffStatusChanged: "Status staf berubah",
  auditStaffAssignmentCreated: "Penugasan staf dibuat",
  auditStaffAssignmentUpdated: "Penugasan staf berubah",
  auditStaffAssignmentStatusChanged: "Status penugasan staf berubah",
  auditUserCreated: "Akun dibuat",
  auditUserDisabled: "Akun dinonaktifkan",
  auditUserReactivated: "Akun diaktifkan kembali",
  auditUserStatusChanged: "Status akun berubah",
  auditPermissionChanged: "Izin akses diubah",

  // Perlindungan jaringan lemah (lib/safe-write.ts). Selalu jelaskan APA yang
  // terjadi pada data yang sudah diketik — jangan cuma bilang "gagal".
  //
  // {tombol} = TULISAN PERSIS di tombol layar yang sedang dipakai, diisi
  // pemanggil lewat `buttonLabel` pada submitSafely (default `common.save`).
  // Dulu semua kalimat ini menyebut "Simpan" mati — padahal tombolnya sering
  // "Buat Pesanan"/"Simpan Penawaran"/"Ya, sudah diterima", jadi pengguna
  // disuruh menekan tombol yang tidak ada di layarnya (audit teks
  // 2026-08-28). Jangan menambahkan kata "tombol" sebelum {tombol}: satu
  // pemakainya adalah dropdown Stok di /admin/produk, bukan tombol.
  netOffline:
    "Tidak ada koneksi internet. Data yang Anda ketik masih ada di layar ini — sambungkan internet lalu tekan \"{tombol}\" lagi.",
  netNotSaved:
    "Koneksi terputus dan data BELUM tersimpan di server. Data yang Anda ketik masih ada di layar ini — tekan \"{tombol}\" lagi.",
  netUnsureCreate:
    "Koneksi terputus sebelum server sempat menjawab, jadi belum bisa dipastikan tersimpan atau belum. Jangan isi ulang dari awal — cukup tekan \"{tombol}\" lagi. Menekannya sekali lagi tidak akan menyimpan data yang sama dua kali.",
  netUnsureUpdate:
    "Koneksi terputus sebelum server sempat menjawab, jadi perubahan belum bisa dipastikan tersimpan. Tekan \"{tombol}\" lagi — menyimpan perubahan yang sama dua kali tidak membuat data ganda.",
  netServerBusy: "Tidak bisa menyimpan sekarang. Coba lagi sebentar lagi.",
  // Dua kunci "versi lama" (deteksi di submitSafely, lib/safe-write.ts):
  // halaman dari deployment lama men-submit ke server yang sudah deployment
  // baru → Server Action-nya 404 dan TIDAK PERNAH dijalankan. "Tekan
  // tombolnya lagi" di sini nasihat yang salah — yang benar hanya muat ulang
  // halaman.
  //   - netStaleNotSaved: action-nya sendiri yang ditolak 404 → server
  //     terbukti tidak menjalankan apa pun, jadi BOLEH bilang "belum
  //     tersimpan" (bukti, bukan tebakan — LESSONS #7).
  //   - netStaleUnsure: versi server terbukti beda tapi nasib tulisannya
  //     sendiri tidak terbukti (misal timeout biasa yang kebetulan bertepatan
  //     dengan deploy) → tetap jujur "belum bisa dipastikan".
  netStaleNotSaved:
    "Aplikasi baru saja diperbarui, sedangkan halaman ini masih versi lama — data BELUM tersimpan, dan menekan \"{tombol}\" lagi tidak akan berhasil. Muat ulang halaman ini dulu (tarik layar ke bawah atau tekan tombol reload), lalu isi dan simpan lagi.",
  netStaleUnsure:
    "Aplikasi baru saja diperbarui, sedangkan halaman ini masih versi lama — belum bisa dipastikan datanya tersimpan atau belum, dan menekan \"{tombol}\" lagi tidak akan berhasil. Muat ulang halaman ini dulu (tarik layar ke bawah atau tekan tombol reload), lalu periksa apakah datanya sudah masuk sebelum mengisi ulang.",

  // Pengecilan gambar sebelum unggah (lib/compress-image.ts). {label} diganti
  // salah satu compressLabel* di bawah, {maxMB}/{limitMB} diganti angka MB.
  compressLabelLogo: "Logo",
  compressLabelInvoice: "Foto invoice",
  compressLabelProduk: "Foto produk",
  compressWrongType: "Format {label} harus PNG, JPG, atau WebP.",
  compressTooLarge: "Ukuran {label} maksimal {maxMB} MB. Pilih gambar yang lebih kecil.",
  compressUnreadable: "Gambar itu tidak bisa dibaca. Coba pilih berkas gambar lain.",
  compressCannotProcess:
    "{label} tidak bisa diproses di perangkat ini. Coba pakai gambar yang lebih kecil (di bawah {limitMB} MB).",


  // Draf lokal (lib/use-local-draft.ts + lib/draft-banner.tsx). {n} diganti
  // angka, {waktu} diganti hasil waktuRelatif().
  dateLocale: "id-ID",
  timeJustNow: "beberapa detik lalu",
  timeMinutesAgo: "{n} menit lalu",
  timeHoursAgo: "{n} jam lalu",
  timeDayAgo: "1 hari lalu",
  timeDaysAgo: "{n} hari lalu",
  draftFound: "Ada draf tersimpan dari {waktu}. Lanjutkan mengisi atau buang?",
  draftContinue: "Lanjutkan",
  draftDiscard: "Buang",

  // Halaman masuk (app/page.tsx, app/login-form.tsx)
  loginTitle: "Partner System",
  loginSubtitle: "Masuk dengan akun yang dibuat oleh SANCI Admin.",
  loginEmail: "Email",
  loginPassword: "Kata sandi",
  loginSubmit: "Masuk",
  loginSubmitting: "Masuk…",
  loginWrong: "Email atau kata sandi salah.",
  loginFailed: "Tidak bisa masuk sekarang. Coba lagi sebentar lagi.",
  signOut: "Keluar",
  signingOut: "Keluar…",
  accountNotLinkedTitle: "Akun belum terdaftar",
  accountNotLinkedBody:
    "Akun Anda berhasil masuk tetapi belum dihubungkan ke partner mana pun. Hubungi SANCI Admin.",

  // ── Kalkulator Penawaran (lib/kalkulator-client.tsx) ──────────────────
  // Dipindah UTUH dari cabang.ts (2026-08-22) saat komponen kalkulator mulai
  // dipakai DUA area (/cabang/kalkulator DAN /admin/kalkulator) — teksnya
  // tidak diubah satu huruf pun, cuma pindah slice. Konsekuensi yang disadari:
  // slice `common` terkirim di SEMUA provider (termasuk halaman masuk dan
  // /offline), jadi jangan menambah teks satu-layar lain ke sini tanpa alasan
  // sekuat "komponen ini benar-benar dipasang di dua area".
  // Kunci yang TETAP di cabang.ts: calcIntroNote / calcConvertCta /
  // calcConvertScopeNote (menyebut alur pesanan cabang) + seluruh calcHandoff*/
  // calcItems* (dibaca form pesanan baru cabang, bukan kalkulatornya).
  //
  // `produkSearchPlaceholder` di admin.ts adalah kunci BERBEDA dengan teks
  // lebih sempit (pencarian /admin/produk tidak mencakup kategori) — bukan
  // duplikat terjemahan dari kunci di bawah ini.
  filterAll: "Semua",
  produkSearchPlaceholder: "Cari nama, kode, atau kategori produk...",
  noProductsYet: "Belum ada produk di katalog.",
  noProductsMatchSearch: "Tidak ada produk yang cocok dengan pencarian.",
  noPhotoPlaceholder: "Tidak ada foto",
  // ── Picker produk di form pembuatan pesanan (lib/order-item-picker.tsx) ──
  // Dipasang di DUA form (/admin/orders/baru + /cabang/pesanan/baru) — syarat
  // "benar-benar dipakai dua area" untuk menaruh kunci di common terpenuhi.
  // Judul modalnya memakai ulang calcGoToProductsCta ("Pilih Produk") dan
  // tombol per barisnya memakai `add` — konsep yang sama tidak diberi kunci
  // kedua (GLOSSARY: satu konsep satu kata).
  pickerOpenCta: "+ Tambah Produk",
  pickerAddAria: "Tambah {name} ke pesanan",
  pickerEmptyHint: "Opsional — pesanan tetap bisa dibuat tanpa daftar produk.",
  // Bar total sticky di form pesanan baru (lib/order-sticky-bar.tsx,
  // 2026-08-29) — HANYA tampil di ponsel selagi minimal satu produk sudah
  // dipilih. "{n} produk" bukan salinan calcTabCart ("Keranjang ({n})"):
  // beda konteks (label tab vs ringkasan bar), teksnya juga beda kata.
  orderStickyCount: "{n} produk",
  orderStickySubmitAria: "Kirim pesanan — {n} produk, {total}",
  // Dulu ada DUA kunci dengan teks identik kata per kata di ketiga bahasa:
  // cabangOfferFinalNegative (cabang.ts) dan orderOfferFinalNegative
  // (admin.ts). Sekarang SATU kunci untuk kalkulator + form penawaran cabang
  // + form penawaran admin — terjemahan tidak boleh terduplikasi antar slice.
  offerFinalNegative:
    "Kombinasi diskon/markup/potongan tunai menghasilkan nilai akhir negatif. Periksa kembali nilainya.",
  calcPageTitle: "Kalkulator Penawaran",
  calcTabProducts: "Produk",
  calcTabCart: "Keranjang ({n})",
  calcCartCardTitle: "Keranjang",
  calcAddToCartAria: "Tambah {name} ke keranjang",
  calcCartEmpty: "Keranjang masih kosong — pilih produk untuk mulai menghitung penawaran.",
  calcGoToProductsCta: "Pilih Produk",
  calcUnitPriceLabel: "Harga satuan (Rp)",
  calcQtyLabel: "Jumlah",
  calcRemoveLineCta: "Hapus",
  calcRemoveLineAria: "Hapus {name} dari keranjang",
  calcDiscountSectionTitle: "Diskon, Markup & Potongan Tunai",
  calcDiscountHint:
    "Setiap diskon dihitung berurutan dari subtotal (bukan dijumlahkan). Markup dihitung setelah semua diskon. " +
    "Potongan tunai dikurangi paling akhir.",
  calcDiscountFieldLabel: "Diskon {n} (%)",
  calcDiscountStepAmount: "Diskon {n} ({pct}%)",
  calcDiscountAddBtn: "+ Tambah Diskon",
  calcDiscountRemoveBtn: "Hapus",
  calcMarkupFieldLabel: "Markup (%)",
  calcCashFieldLabel: "Potongan Tunai (Rp)",
  calcBreakdownSubtotal: "Subtotal",
  calcBreakdownAfterDiscount: "Setelah Diskon",
  calcBreakdownTotalDiscount: "Total Diskon",
  calcBreakdownAfterMarkup: "Setelah Markup",
  calcClearCartCta: "Kosongkan",
  calcClearCartConfirm: "Kosongkan seluruh keranjang kalkulator?",
  calcClearConfirmYes: "Ya, kosongkan",
  calcClearedUndoMsg: "Keranjang sudah dikosongkan.",
  calcClearedUndoCta: "Kembalikan",
  calcPhotoViewAria: "Perbesar foto {name}",
  calcFooterItemCount: "{n} barang",
  calcFooterAria: "{n} barang, total {amount} — ketuk untuk buka keranjang",
} as const;

type Shape = Record<keyof typeof id, string>;

const en = {
  proposalCoverKicker: "Customer Product Proposal",
  proposalCoverSub: "A curated selection of furniture prepared for your home.",
  proposalIntroTitle: "A proposal made for your home.",
  proposalIntroNote: "This document brings together the products selected with you, along with their specifications, imagery and final price.",
  proposalMetaNo: "Number",
  proposalMetaDate: "Date",
  proposalMetaBy: "Prepared by",
  proposalMetaCount: "Products selected",
  proposalSelectionKicker: "01 / Your Selection",
  proposalSummaryKicker: "02 / Summary",
  proposalSummaryTitle: "Price Summary",
  proposalSummaryNote: "The amount above follows the value calculated by the SANCI system and is shown here as the customer-facing summary.",
  proposalCollectionKicker: "03 / Collection",
  proposalCollectionTitle: "The selection we prepared for you.",
  proposalAboutLabel: "About the product",
  proposalDetailKicker: "{name} / Details",
  proposalGalleryKicker: "{name} / Gallery",
  proposalGalleryTitle: "Product Details",
  proposalFinalKicker: "04 / Final",
  proposalFinalTitle: "Your selection.",
  proposalFinalPrice: "Final price",
  proposalThanksTitle: "Thank you.",
  proposalThanksBody: "We look forward to helping you create a home that feels right for you.",
  proposalContactShowroom: "Showroom",
  proposalContactLabel: "Contact",
  proposalProductsCount: "{n} products selected",
  proposalSpecCode: "Product code",
  proposalTitle: "Proposal",
  proposalSubtitle: "A selection we have prepared for you",
  proposalForLabel: "Prepared for",
  proposalCustomerPlaceholder: "Customer / project name (optional)",
  proposalPrintCta: "Print / Save PDF",
  proposalBackCta: "Back to Calculator",
  proposalColItem: "Product",
  proposalColQty: "Qty",
  proposalColUnit: "Unit price",
  proposalColTotal: "Amount",
  proposalSelectionTitle: "Your selection",
  proposalSubtotal: "Subtotal",
  proposalDiscountStep: "Discount {pct}%",
  proposalMarkup: "Adjustment {pct}%",
  proposalCashDiscount: "Cash discount",
  proposalGrandTotal: "Total",
  proposalSpecSize: "Size",
  proposalSpecCategory: "Category",
  proposalFootnote:
    "Prices are in Rupiah and exclude delivery and installation unless stated otherwise. " +
    "Availability is reconfirmed when the order is placed.",
  proposalEmptyTitle: "Nothing to print yet",
  proposalEmptyBody:
    "Pick the products in the Offer Calculator first, then press \"Create Proposal\" in the cart.",
  proposalLoadFailed: "Product details failed to load, so the product pages cannot be shown yet.",
  proposalCatalogClosed: "The SANCI catalogue is not open for this store, so product pages cannot be shown.",
  proposalProfilesMissing:
    "The summary above is still complete. The product pages can be retried once the problem above is resolved.",
  ...offline.en,
  loadMoreCta: "Load more",
  appName: "SANCI Partner System",
  save: "Save",
  cancel: "Cancel",
  edit: "Edit",
  add: "Add",
  search: "Search",
  back: "Back",
  close: "Close",
  activate: "Activate",
  deactivate: "Deactivate",
  saving: "Saving…",
  loading: "Loading…",
  statusActive: "Active",
  statusInactive: "Inactive",
  statusDraft: "Draft",
  statusSuspended: "Suspended",
  statusEnded: "Ended",
  statusDisabled: "Disabled",
  emptyDefault: "Nothing here yet.",
  errorLoad: "Could not load the data. Reload the page to try again.",
  errorSection: "This section failed to load — reload the page.",
  required: "Required",
  optional: "Optional",
  yes: "Yes",
  no: "No",
  partner: "Partner",
  branch: "Branch",
  staff: "Staff",
  account: "Account",
  customer: "Customer",
  order: "Order",
  orderNumber: "Order no.",
  package: "Package",
  product: "Product",
  catalog: "Catalog",
  activity: "Activity",
  reason: "Reason",
  notes: "Notes",
  phone: "Phone",
  whatsapp: "WhatsApp",
  email: "Email",
  label: "Label",
  address: "Address",
  city: "City",
  province: "Province",
  name: "Name",
  fullName: "Full name",
  code: "Code",
  createdAt: "Created",
  serverTime: "server time",
  language: "Language",
  status: "Status",
  description: "Description",
  category: "Category",
  contactName: "Contact",
  role: "Role",
  invoice: "Invoice",
  docTypeSO: "SO",
  docTypeDO: "DO",
  docTypeInvoice: "Invoice",

  orderStatusRegistered: "Registered",
  orderStatusCancelled: "Cancelled",
  fulfillment: "Fulfillment",
  fulfillmentDirect: "Direct delivery",
  fulfillmentShowroom: "Showroom visit",
  fulfillmentDirectDesc:
    "The SANCI product is already bought in the store — SANCI delivers it, the customer does not need to come",
  fulfillmentShowroomDesc:
    "The customer will come to SANCI to see / pick a product",
  stockStatus: "Stock status",
  quantity: "Quantity",
  stockAvailable: "Available",
  stockLimited: "Limited",
  stockOutOfStock: "Out of stock",

  visibilityScope: "Visibility",
  editScope: "Edit scope",
  scopeOwnBranch: "Own branch",
  scopePartnerAll: "All partner branches",
  scopeSelectedBranches: "Selected branches",
  roleBranchUser: "Branch user",
  roleSanciAdmin: "SANCI admin",
  roleSystem: "System",

  configured: "Configured",
  endDate: "End date",
  cancellationReason: "Cancellation reason",
  storePurchase: "Store purchase",
  sanciOffer: "SANCI offer",
  catalogAccess: "Catalog access",
  removed: "removed",
  dpAmount: "Down payment (DP)",
  paymentCondition: "Payment condition",
  shippingAddress: "Shipping address",
  customerPo: "Customer PO No.",
  orderItems: "Order items",
  colorCode: "Color code",
  customSize: "Custom size",
  unitPrice: "Unit price",
  price: "Price",
  lineDiscount: "Line deduction",
  discountPcts: "Discount",
  markupPct: "Markup",
  cashDiscount: "Cash discount",
  finalAmount: "Final price",
  remainingBalance: "Remaining balance",

  custLinkTitle: "Customer link",
  custLinkHint:
    "This link shows the order status, the items, and the outstanding balance. The full address only appears after the customer enters their own phone number.",
  custLinkCopyCta: "Copy link for customer",
  custLinkCopiedMsg: "Link copied.",
  custLinkCopyFailedMsg: "The link could not be copied automatically. Copy it manually from the box above.",
  custLinkSendCompanyCta: "Send link via company WhatsApp",
  custLinkSendingMsg: "Sending…",
  custLinkSentCompanyMsg: "Sent from the company number.",
  custLinkSendSelfCta: "Send from my WhatsApp",
  custLinkNoPhoneMsg: "This customer has no usable WhatsApp number.",
  custLinkUnavailableMsg: "The customer link cannot be created yet — the feature is not active. Contact SANCI Admin.",
  waOpenChatAria: "Open a WhatsApp chat with {phone}",

  markDeliveredCta: "Mark as received by customer",
  markDeliveredModalTitle: "Mark as received by the customer?",
  markDeliveredDesc:
    "Order {orderNumber} for {customer} will be marked as received. The time comes from the server, and this mark cannot be undone from here.",
  markDeliveredConfirmCta: "Yes, it was received",
  markDeliveredWorkingCta: "Marking…",
  markDeliveredDoneLabel: "Received by customer",
  markDeliveredFailedMsg: "The mark was not saved. Try again in a moment.",
  markDeliveredUnavailableMsg:
    "This order was NOT marked as received by the customer — the feature is not active. Contact SANCI Admin.",
  deliveredAt: "Received by customer",

  auditOrderCreated: "Order created",
  auditOrderUpdated: "Order edited",
  auditOrderStatusChanged: "Order status changed",
  auditOrderCancelled: "Order cancelled",
  auditOrderAttributionCorrected: "Branch attribution corrected",
  auditOrderCustomerArrived: "Customer arrived at SANCI",
  auditOrderInternalNote: "SANCI internal note added",
  auditOrderOfferSet: "SANCI offer set",
  auditOrderOfferUpdated: "SANCI offer changed",
  auditOrderOfferRemoved: "SANCI offer removed",
  auditOrderItemCreated: "Order item added",
  auditOrderItemUpdated: "Order item edited",
  auditOrderItemDeleted: "Order item removed",
  auditOrderDocumentCreated: "Order document created",
  auditOrderDocumentUpdated: "Order document edited",
  auditOrderDocumentDeleted: "Order document deleted",
  auditOrderDocumentItemCreated: "Document line added",
  auditOrderDocumentItemUpdated: "Document line edited",
  auditOrderDocumentItemDeleted: "Document line removed",
  auditCustomerCreated: "Customer added",
  auditCustomerUpdated: "Customer edited",
  auditCustomerPhoneChanged: "Customer phone number changed",
  auditCustomerSourceCreated: "Source code created",
  auditCustomerSourceUpdated: "Source code changed",
  auditCustomerSourceStatusChanged: "Source code status changed",
  auditSalesStaffCreated: "Sales code created",
  auditSalesStaffUpdated: "Sales code changed",
  auditSalesStaffStatusChanged: "Sales code status changed",
  auditPackageCreated: "Package added",
  auditPackageUpdated: "Package edited",
  auditPackageStatusChanged: "Package status changed",
  auditPackageItemAdded: "Package item added",
  auditPackageItemUpdated: "Package item quantity changed",
  auditPackageItemRemoved: "Package item removed",
  auditProductCreated: "Product added",
  auditProductUpdated: "Product edited",
  auditProductStatusChanged: "Product status changed",
  auditProductDeleted: "Product deleted",
  auditProductPriceSet: "Product price set",
  auditProductPriceUpdated: "Product price changed",
  auditProductPriceRemoved: "Product price removed",
  auditCatalogAccessCreated: "Catalog access opened",
  auditCatalogAccessUpdated: "Catalog access changed",
  auditPartnerCreated: "Partner added",
  auditPartnerUpdated: "Partner edited",
  auditPartnerStatusChanged: "Partner status changed",
  auditBranchCreated: "Branch added",
  auditBranchUpdated: "Branch edited",
  auditBranchStatusChanged: "Branch status changed",
  auditStaffCreated: "Staff added",
  auditStaffUpdated: "Staff edited",
  auditStaffDeactivated: "Staff deactivated",
  auditStaffStatusChanged: "Staff status changed",
  auditStaffAssignmentCreated: "Staff assignment added",
  auditStaffAssignmentUpdated: "Staff assignment changed",
  auditStaffAssignmentStatusChanged: "Staff assignment status changed",
  auditUserCreated: "Account created",
  auditUserDisabled: "Account disabled",
  auditUserReactivated: "Account switched back on",
  auditUserStatusChanged: "Account status changed",
  auditPermissionChanged: "Access changed",

  netOffline:
    "No internet connection. What you typed is still on this screen — get back online, then press \"{tombol}\" again.",
  netNotSaved:
    "The connection dropped and nothing was saved on the server. What you typed is still on this screen — press \"{tombol}\" again.",
  netUnsureCreate:
    "The connection dropped before the server could answer, so we cannot tell yet whether it was saved. Do not type everything again — just press \"{tombol}\" again. Pressing it a second time will not save the same thing twice.",
  netUnsureUpdate:
    "The connection dropped before the server could answer, so we cannot tell yet whether the change was saved. Press \"{tombol}\" again — saving the same change twice does not create a second copy.",
  netServerBusy: "Cannot save right now. Please try again in a moment.",
  netStaleNotSaved:
    "The app was just updated, but this page is still the old version — the data was NOT saved, and pressing \"{tombol}\" again will not work. Reload this page first (pull the screen down or press the reload button), then fill it in and save again.",
  netStaleUnsure:
    "The app was just updated, but this page is still the old version — we cannot tell whether the data was saved, and pressing \"{tombol}\" again will not work. Reload this page first (pull the screen down or press the reload button), then check whether the data is already there before typing it again.",

  compressLabelLogo: "Logo",
  compressLabelInvoice: "Invoice photo",
  compressLabelProduk: "Product photo",
  compressWrongType: "{label} format must be PNG, JPG, or WebP.",
  compressTooLarge: "{label} size must be under {maxMB} MB. Choose a smaller image.",
  compressUnreadable: "That image can't be read. Try a different image file.",
  compressCannotProcess:
    "{label} can't be processed on this device. Try a smaller image (under {limitMB} MB).",


  dateLocale: "en-GB",
  timeJustNow: "a few seconds ago",
  timeMinutesAgo: "{n} min ago",
  timeHoursAgo: "{n} hr ago",
  timeDayAgo: "1 day ago",
  timeDaysAgo: "{n} days ago",
  draftFound: "There is a draft saved {waktu}. Carry on with it, or throw it away?",
  draftContinue: "Carry on",
  draftDiscard: "Throw away",

  loginTitle: "Partner System",
  loginSubtitle: "Sign in with the account SANCI Admin made for you.",
  loginEmail: "Email",
  loginPassword: "Password",
  loginSubmit: "Sign in",
  loginSubmitting: "Signing in…",
  loginWrong: "Wrong email or password.",
  loginFailed: "Cannot sign in right now. Please try again in a moment.",
  signOut: "Sign out",
  signingOut: "Signing out…",
  accountNotLinkedTitle: "Account not linked yet",
  accountNotLinkedBody:
    "You are signed in, but your account is not linked to any partner yet. Please contact SANCI Admin.",


  // Offer Calculator (lib/kalkulator-client.tsx) — moved verbatim from
  // cabang.ts, see the note on the `id` block.
  filterAll: "All",
  produkSearchPlaceholder: "Search by product name, code, or category...",
  noProductsYet: "No products in the catalog yet.",
  noProductsMatchSearch: "No products match your search.",
  noPhotoPlaceholder: "No photo",
  pickerOpenCta: "+ Add product",
  pickerAddAria: "Add {name} to the order",
  pickerEmptyHint: "Optional — the order can still be created without a product list.",
  orderStickyCount: "{n} products",
  orderStickySubmitAria: "Submit order — {n} products, {total}",
  offerFinalNegative:
    "This combination of discount/markup/cash discount produces a negative final price. Please check the values.",
  calcPageTitle: "Offer Calculator",
  calcTabProducts: "Products",
  calcTabCart: "Cart ({n})",
  calcCartCardTitle: "Cart",
  calcAddToCartAria: "Add {name} to cart",
  calcCartEmpty: "Cart is empty — pick products to start pricing an offer.",
  calcGoToProductsCta: "Pick products",
  calcUnitPriceLabel: "Unit price (Rp)",
  calcQtyLabel: "Quantity",
  calcRemoveLineCta: "Remove",
  calcRemoveLineAria: "Remove {name} from cart",
  calcDiscountSectionTitle: "Discount, Markup & Cash Discount",
  calcDiscountHint:
    "Each discount is applied in order from the subtotal (not added together). Markup is applied after all " +
    "discounts. Cash discount is subtracted last.",
  calcDiscountFieldLabel: "Discount {n} (%)",
  calcDiscountStepAmount: "Discount {n} ({pct}%)",
  calcDiscountAddBtn: "+ Add discount",
  calcDiscountRemoveBtn: "Remove",
  calcMarkupFieldLabel: "Markup (%)",
  calcCashFieldLabel: "Cash discount (Rp)",
  calcBreakdownSubtotal: "Subtotal",
  calcBreakdownAfterDiscount: "After discount",
  calcBreakdownTotalDiscount: "Total discount",
  calcBreakdownAfterMarkup: "After markup",
  calcClearCartCta: "Clear",
  calcClearCartConfirm: "Clear the whole calculator cart?",
  calcClearConfirmYes: "Yes, clear it",
  calcClearedUndoMsg: "The cart has been cleared.",
  calcClearedUndoCta: "Restore",
  calcPhotoViewAria: "Enlarge photo of {name}",
  calcFooterItemCount: "{n} items",
  calcFooterAria: "{n} items, total {amount} — tap to open the cart",
} satisfies Shape;

const zh = {
  proposalCoverKicker: "客户产品提案",
  proposalCoverSub: "为您的家精心挑选的家具。",
  proposalIntroTitle: "为您的家准备的提案。",
  proposalIntroNote: "这份文件汇整了与您一同挑选的产品,包含规格、照片与最终价格。",
  proposalMetaNo: "编号",
  proposalMetaDate: "日期",
  proposalMetaBy: "提案单位",
  proposalMetaCount: "已选产品",
  proposalSelectionKicker: "01 / 您的选择",
  proposalSummaryKicker: "02 / 摘要",
  proposalSummaryTitle: "价格摘要",
  proposalSummaryNote: "上方金额沿用 SANCI 系统的计算结果,在此以客户版摘要呈现。",
  proposalCollectionKicker: "03 / 系列",
  proposalCollectionTitle: "为您准备的选品。",
  proposalAboutLabel: "关于这件产品",
  proposalDetailKicker: "{name} / 细节",
  proposalGalleryKicker: "{name} / 图集",
  proposalGalleryTitle: "产品细节",
  proposalFinalKicker: "04 / 最终",
  proposalFinalTitle: "您的选择。",
  proposalFinalPrice: "最终价格",
  proposalThanksTitle: "谢谢您。",
  proposalThanksBody: "期待能协助您打造一个真正合适的家。",
  proposalContactShowroom: "展厅",
  proposalContactLabel: "联络方式",
  proposalProductsCount: "已选 {n} 件产品",
  proposalSpecCode: "产品编号",
  proposalTitle: "产品提案",
  proposalSubtitle: "为您挑选的产品",
  proposalForLabel: "呈送",
  proposalCustomerPlaceholder: "客户 / 项目名称(可不填)",
  proposalPrintCta: "列印 / 存成 PDF",
  proposalBackCta: "回到计算器",
  proposalColItem: "产品",
  proposalColQty: "数量",
  proposalColUnit: "单价",
  proposalColTotal: "金额",
  proposalSelectionTitle: "您的选择",
  proposalSubtotal: "小计",
  proposalDiscountStep: "折扣 {pct}%",
  proposalMarkup: "调整 {pct}%",
  proposalCashDiscount: "现金折扣",
  proposalGrandTotal: "总计",
  proposalSpecSize: "尺寸",
  proposalSpecCategory: "类别",
  proposalFootnote:
    "价格以印尼盾计算,除另行说明外不含运费与安装费。备货情况于下单时再次确认。",
  proposalEmptyTitle: "还没有可以列印的内容",
  proposalEmptyBody: "请先在方案计算器里选好产品,再到购物车按\"制作提案\"。",
  proposalLoadFailed: "产品详情载入失败,产品介绍页暂时无法显示。",
  proposalCatalogClosed: "SANCI 产品目录尚未对这家门店开放,无法显示产品介绍页。",
  proposalProfilesMissing: "上方的摘要仍然完整。上述问题解决后可以再试一次产品介绍页。",
  ...offline.zh,
  loadMoreCta: "加载更多",
  appName: "SANCI 合作商系统",
  save: "保存",
  cancel: "取消",
  edit: "修改",
  add: "新增",
  search: "搜索",
  back: "返回",
  close: "关闭",
  activate: "启用",
  deactivate: "停用",
  saving: "保存中…",
  loading: "加载中…",
  statusActive: "启用",
  statusInactive: "停用",
  statusDraft: "草稿",
  statusSuspended: "已暂停",
  statusEnded: "已结束",
  statusDisabled: "已停用",
  emptyDefault: "暂无数据。",
  errorLoad: "数据加载失败，请刷新页面重试。",
  errorSection: "此部分加载失败 —— 请刷新页面。",
  required: "必填",
  optional: "选填",
  yes: "是",
  no: "否",
  partner: "合作商",
  branch: "分店",
  staff: "员工",
  account: "账号",
  customer: "客户",
  order: "订单",
  orderNumber: "订单编号",
  package: "套装",
  product: "产品",
  catalog: "产品目录",
  activity: "操作记录",
  reason: "原因",
  notes: "备注",
  phone: "电话",
  whatsapp: "WhatsApp",
  email: "Email",
  label: "标签",
  address: "地址",
  city: "城市",
  province: "省份",
  name: "名称",
  fullName: "姓名",
  code: "编号",
  createdAt: "创建时间",
  serverTime: "服务器时间",
  language: "语言",
  status: "状态",
  description: "说明",
  category: "分类",
  contactName: "联系人",
  role: "角色",
  invoice: "Invoice",
  docTypeSO: "SO",
  docTypeDO: "DO",
  docTypeInvoice: "Invoice",

  orderStatusRegistered: "已登记",
  orderStatusCancelled: "已取消",
  fulfillment: "交付方式",
  fulfillmentDirect: "直接送货",
  fulfillmentShowroom: "到店选购",
  fulfillmentDirectDesc:
    "客户已经在店里买好 SANCI 产品 —— 由 SANCI 直接送货，客户不用再跑一趟",
  fulfillmentShowroomDesc: "客户会到 SANCI 门店看货、挑选产品",
  stockStatus: "库存状态",
  quantity: "数量",
  stockAvailable: "有货",
  stockLimited: "库存少",
  stockOutOfStock: "缺货",

  visibilityScope: "可见范围",
  editScope: "修改范围",
  scopeOwnBranch: "仅本店",
  scopePartnerAll: "同合作商全部分店",
  scopeSelectedBranches: "指定分店",
  roleBranchUser: "分店账号",
  roleSanciAdmin: "SANCI 管理员",
  roleSystem: "系统",

  configured: "已配置",
  endDate: "结束日期",
  cancellationReason: "取消原因",
  storePurchase: "店内消费金额",
  sanciOffer: "SANCI 方案金额",
  catalogAccess: "产品目录权限",
  removed: "已删除",
  dpAmount: "订金",
  paymentCondition: "付款条件",
  shippingAddress: "收货地址",
  customerPo: "客户 PO 号",
  orderItems: "订单明细",
  colorCode: "颜色代码",
  customSize: "定制尺寸",
  unitPrice: "单价",
  price: "价格",
  lineDiscount: "单行扣减金额",
  discountPcts: "折扣",
  markupPct: "加成",
  cashDiscount: "现金折让",
  finalAmount: "最终金额",
  remainingBalance: "尾款",

  custLinkTitle: "客户查询链接",
  custLinkHint:
    "该链接显示订单状态、订单明细和尾款金额。完整地址只有在客户输入本人手机号之后才会显示。",
  custLinkCopyCta: "复制客户链接",
  custLinkCopiedMsg: "链接已复制。",
  custLinkCopyFailedMsg: "无法自动复制链接，请从上方文本框手动复制。",
  custLinkSendCompanyCta: "用公司 WhatsApp 发送链接",
  custLinkSendingMsg: "发送中…",
  custLinkSentCompanyMsg: "已从公司号码发出。",
  custLinkSendSelfCta: "用我的 WhatsApp 发送",
  custLinkNoPhoneMsg: "该客户没有可用的 WhatsApp 号码。",
  custLinkUnavailableMsg: "客户查询链接暂时无法生成——这个功能还没有启用。请联系 SANCI 管理员。",
  waOpenChatAria: "打开与 {phone} 的 WhatsApp 对话",

  markDeliveredCta: "标记客户已收到",
  markDeliveredModalTitle: "标记客户已收到？",
  markDeliveredDesc:
    "订单 {orderNumber}（客户 {customer}）将被标记为客户已收到。时间取自服务器，且该标记无法在此撤销。",
  markDeliveredConfirmCta: "确认已收到",
  markDeliveredWorkingCta: "标记中…",
  markDeliveredDoneLabel: "客户已收到",
  markDeliveredFailedMsg: "标记尚未保存，请稍后重试。",
  markDeliveredUnavailableMsg: "这笔订单没有被标记为“客户已收到”——这个功能还没有启用。请联系 SANCI 管理员。",
  deliveredAt: "客户已收到",

  auditOrderCreated: "订单已创建",
  auditOrderUpdated: "订单已修改",
  auditOrderStatusChanged: "订单状态已变更",
  auditOrderCancelled: "订单已取消",
  auditOrderAttributionCorrected: "分店归属已更正",
  auditOrderCustomerArrived: "客户已到 SANCI",
  auditOrderInternalNote: "已添加 SANCI 内部备注",
  auditOrderOfferSet: "已填写 SANCI 方案金额",
  auditOrderOfferUpdated: "SANCI 方案金额已修改",
  auditOrderOfferRemoved: "SANCI 方案金额已删除",
  auditOrderItemCreated: "订单明细已新增",
  auditOrderItemUpdated: "订单明细已修改",
  auditOrderItemDeleted: "订单明细已删除",
  auditOrderDocumentCreated: "订单文档已创建",
  auditOrderDocumentUpdated: "订单文档已修改",
  auditOrderDocumentDeleted: "订单文档已删除",
  auditOrderDocumentItemCreated: "文档内容行已新增",
  auditOrderDocumentItemUpdated: "文档内容行已修改",
  auditOrderDocumentItemDeleted: "文档内容行已删除",
  auditCustomerCreated: "客户已创建",
  auditCustomerUpdated: "客户已修改",
  auditCustomerPhoneChanged: "客户电话已修改",
  auditCustomerSourceCreated: "来源代码已创建",
  auditCustomerSourceUpdated: "来源代码已修改",
  auditCustomerSourceStatusChanged: "来源代码状态已变更",
  auditSalesStaffCreated: "销售员代码已创建",
  auditSalesStaffUpdated: "销售员代码已修改",
  auditSalesStaffStatusChanged: "销售员代码状态已变更",
  auditPackageCreated: "套装已创建",
  auditPackageUpdated: "套装已修改",
  auditPackageStatusChanged: "套装状态已变更",
  auditPackageItemAdded: "套装内容已添加",
  auditPackageItemUpdated: "套装内容数量已修改",
  auditPackageItemRemoved: "套装内容已删除",
  auditProductCreated: "产品已添加",
  auditProductUpdated: "产品已修改",
  auditProductStatusChanged: "产品状态已变更",
  auditProductDeleted: "产品已删除",
  auditProductPriceSet: "已设置产品价格",
  auditProductPriceUpdated: "产品价格已修改",
  auditProductPriceRemoved: "产品价格已删除",
  auditCatalogAccessCreated: "已开通产品目录权限",
  auditCatalogAccessUpdated: "产品目录权限已修改",
  auditPartnerCreated: "合作商已创建",
  auditPartnerUpdated: "合作商已修改",
  auditPartnerStatusChanged: "合作商状态已变更",
  auditBranchCreated: "分店已创建",
  auditBranchUpdated: "分店已修改",
  auditBranchStatusChanged: "分店状态已变更",
  auditStaffCreated: "员工已添加",
  auditStaffUpdated: "员工已修改",
  auditStaffDeactivated: "员工已停用",
  auditStaffStatusChanged: "员工状态已变更",
  auditStaffAssignmentCreated: "员工分配已创建",
  auditStaffAssignmentUpdated: "员工分配已修改",
  auditStaffAssignmentStatusChanged: "员工分配状态已变更",
  auditUserCreated: "账号已创建",
  auditUserDisabled: "账号已停用",
  auditUserReactivated: "账号已重新启用",
  auditUserStatusChanged: "账号状态已变更",
  auditPermissionChanged: "权限已修改",

  netOffline:
    "当前没有网络。你填的内容还在这个页面上 —— 连上网络后再按一次“{tombol}”。",
  netNotSaved:
    "网络中断，内容还没有保存到服务器。你填的内容还在这个页面上 —— 请再按一次“{tombol}”。",
  netUnsureCreate:
    "网络在服务器回应之前就中断了，暂时无法确认有没有保存成功。不用重新填一遍 —— 直接再按一次“{tombol}”。再按一次不会把同一条数据保存两次。",
  netUnsureUpdate:
    "网络在服务器回应之前就中断了，暂时无法确认修改有没有保存成功。请再按一次“{tombol}”—— 同样的修改保存两次不会产生重复数据。",
  netServerBusy: "现在无法保存，请稍后再试。",
  netStaleNotSaved:
    "应用刚刚更新了，这个页面还是旧版本 —— 数据没有保存，再按“{tombol}”也不会成功。请先刷新页面（下拉屏幕或点刷新按钮），然后重新填写并保存。",
  netStaleUnsure:
    "应用刚刚更新了，这个页面还是旧版本 —— 暂时无法确认数据有没有保存成功，再按“{tombol}”也不会成功。请先刷新页面（下拉屏幕或点刷新按钮），先检查数据有没有进来，再决定要不要重新填写。",

  compressLabelLogo: "Logo",
  compressLabelInvoice: "Invoice 照片",
  compressLabelProduk: "产品照片",
  compressWrongType: "{label}格式必须是 PNG、JPG 或 WebP。",
  compressTooLarge: "{label}大小不能超过 {maxMB} MB，请选择更小的图片。",
  compressUnreadable: "无法读取这张图片，请换一张试试。",
  compressCannotProcess: "此设备无法处理{label}，请换一张更小的图片（低于 {limitMB} MB）。",


  dateLocale: "zh-CN",
  timeJustNow: "几秒前",
  timeMinutesAgo: "{n} 分钟前",
  timeHoursAgo: "{n} 小时前",
  timeDayAgo: "1 天前",
  timeDaysAgo: "{n} 天前",
  draftFound: "有一份 {waktu} 保存的草稿。要接着填，还是丢掉？",
  draftContinue: "接着填",
  draftDiscard: "丢掉",

  loginTitle: "合作商系统",
  loginSubtitle: "请用 SANCI 管理员给你开的账号登录。",
  loginEmail: "邮箱",
  loginPassword: "密码",
  loginSubmit: "登录",
  loginSubmitting: "登录中…",
  loginWrong: "邮箱或密码不正确。",
  loginFailed: "现在无法登录，请稍后再试。",
  signOut: "退出",
  signingOut: "退出中…",
  accountNotLinkedTitle: "账号还没有开通",
  accountNotLinkedBody:
    "你已经登录成功，但账号还没有关联到任何合作商。请联系 SANCI 管理员。",


  // 方案计算器(lib/kalkulator-client.tsx)—— 原样从 cabang.ts 搬过来,
  // 说明见 `id` 区块的注释。
  filterAll: "全部",
  produkSearchPlaceholder: "搜索产品名称、编号或分类…",
  noProductsYet: "产品目录里还没有产品。",
  noProductsMatchSearch: "没有符合搜索条件的产品。",
  noPhotoPlaceholder: "没有照片",
  pickerOpenCta: "+ 新增产品",
  pickerAddAria: "把{name}加入订单",
  pickerEmptyHint: "可选 —— 不选产品也能创建订单。",
  orderStickyCount: "{n} 件产品",
  orderStickySubmitAria: "送出订单 —— {n} 件产品，{total}",
  offerFinalNegative: "这个折扣/加成/现金折让组合会得出负数的最终金额，请检查数值。",
  calcPageTitle: "方案计算器",
  calcTabProducts: "产品",
  calcTabCart: "购物车({n})",
  calcCartCardTitle: "购物车",
  calcAddToCartAria: "把{name}加入购物车",
  calcCartEmpty: "购物车还是空的 —— 选择产品开始计算方案。",
  calcGoToProductsCta: "选择产品",
  calcUnitPriceLabel: "单价(Rp)",
  calcQtyLabel: "数量",
  calcRemoveLineCta: "删除",
  calcRemoveLineAria: "从购物车删除{name}",
  calcDiscountSectionTitle: "折扣、加成与现金折让",
  calcDiscountHint: "每笔折扣按顺序从小计开始计算(不是直接相加)。加成在所有折扣之后计算。现金折让最后扣除。",
  calcDiscountFieldLabel: "折扣 {n}(%)",
  calcDiscountStepAmount: "折扣 {n}（{pct}%）",
  calcDiscountAddBtn: "+ 添加折扣",
  calcDiscountRemoveBtn: "删除",
  calcMarkupFieldLabel: "加成(%)",
  calcCashFieldLabel: "现金折让(Rp)",
  calcBreakdownSubtotal: "小计",
  calcBreakdownAfterDiscount: "折扣后",
  calcBreakdownTotalDiscount: "折扣总额",
  calcBreakdownAfterMarkup: "加成后",
  calcClearCartCta: "清空",
  calcClearCartConfirm: "清空整个计算器购物车?",
  calcClearConfirmYes: "是,清空",
  calcClearedUndoMsg: "购物车已清空。",
  calcClearedUndoCta: "恢复",
  calcPhotoViewAria: "放大{name}的照片",
  calcFooterItemCount: "{n}件",
  calcFooterAria: "{n}件,总计{amount} —— 点击打开购物车",
} satisfies Shape;

export const common = { id, en, zh };
