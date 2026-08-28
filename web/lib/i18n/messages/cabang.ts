/**
 * Teks khusus layar CABANG (/cabang/**) — dipakai staf toko mitra di HP.
 * Baca aturan lengkap di common.ts, dan GLOSSARY.md untuk istilah.
 *
 * Nada bahasa: seperti rekan kerja yang menjelaskan, bukan sistem yang
 * memerintah. Kalimat pendek, kata sehari-hari.
 *
 * Beberapa nilai memuat placeholder `{name}` / `{q}` / `{n}` / `{branch}` —
 * diganti lewat `.replace("{token}", value)` di komponen (tidak ada helper
 * interpolasi terpisah di proyek ini, lihat pemakaiannya di app/cabang/**).
 */

const id = {
  // Beranda
  homeNewOrder: "+ Pesanan Baru",
  homeOrders: "Daftar Pesanan",
  homeCustomers: "Pelanggan",
  homeProducts: "Produk SANCI",
  homeStaff: "Staf",
  homeBranchProfile: "Profil Cabang",
  homeMyAccount: "Akun Saya",
  homeSignOut: "Keluar",
  signingOut: "Keluar…",
  homeBranchLabel: "Cabang {name}",
  homeOtherBranches: "Cabang {name} lainnya",
  homeAccessViewEdit: "Lihat + edit",
  homeAccessViewOnly: "Lihat saja",
  homeFooterWarehouse: "Gudang dan pengiriman adalah fase berikutnya — sengaja belum ditampilkan.",

  // Navigasi umum (tombol "kembali" di banyak halaman)
  navBackHome: "← Beranda",
  navBackCustomers: "← Pelanggan",
  navBackOrders: "← Daftar Pesanan",
  navBackProducts: "← Daftar Produk",

  // Error umum lintas halaman (dipakai berulang — satu kalimat, satu kunci)
  errAccountLoad: "Data akun gagal dimuat. Muat ulang halaman untuk mencoba lagi.",
  errAccountLoadRetry: "Data akun gagal dimuat — coba lagi.",
  errSessionInvalid: "Sesi tidak valid. Muat ulang halaman.",
  errPartnerLoad: "Data partner Anda tidak dapat dimuat. Hubungi SANCI Admin untuk memeriksa pengaturan akun.",
  errPartnerBranchLoad:
    "Data partner/cabang Anda tidak dapat dimuat. Hubungi SANCI Admin untuk memeriksa pengaturan akun dan izin cabang.",
  // Pesan "belum aktif" untuk PEGAWAI TOKO: sebut apa yang tidak bisa
  // dipakai dan siapa yang dihubungi — JANGAN sebut "migrasi database".
  // Pegawai toko tidak bisa berbuat apa pun dengan nomor migrasi, dan kata
  // itu membuat kalimatnya terdengar seperti kerusakan besar. Padanan di
  // admin.ts SENGAJA tetap menyebut migrasi: staf kantor SANCI memang
  // meneruskan nomornya (audit teks 2026-08-28).
  errOrderModuleInactive: "Modul Pesanan belum aktif. Hubungi SANCI Admin.",
  errCustomerModuleInactive: "Modul Pelanggan belum aktif. Hubungi SANCI Admin.",
  errCatalogModuleInactive: "Modul Katalog Produk belum aktif. Hubungi SANCI Admin.",
  errFeatureInactive: "Fitur ini belum aktif. Hubungi SANCI Admin.",
  errNotAllowedMigration:
    "Perubahan tidak tersimpan — Anda belum punya izin mengubah data ini, atau fiturnya belum aktif. Hubungi " +
    "SANCI Admin.",
  errFullNameRequired: "Nama lengkap wajib diisi.",
  errPhoneInvalid: "Nomor telepon tidak valid.",
  noPhoneNumber: "tanpa telepon",
  optionalPlaceholder: "Opsional...",
  picLabel: "PIC",

  // Akun Saya
  loginIdentityDt: "Identitas login",
  akunFootnote:
    "Identitas cabang Anda ditetapkan oleh SANCI — tidak ada pilihan ganti cabang. Akun dibuat dan dikelola oleh SANCI Admin.",

  // Profil Cabang
  profilFootnote: "Alamat atau kontak salah? Hubungi SANCI Admin untuk memperbarui.",

  // Daftar Pelanggan
  newCustomerCta: "+ Pelanggan Baru",
  customerSearchPlaceholder: "Cari nama atau telepon...",
  noCustomersYet: "Belum ada pelanggan tercatat.",
  noCustomersMatchSearch: 'Tidak ada pelanggan yang cocok dengan pencarian "{q}".',
  customerOrderCount: "{n} Pesanan",
  errCustomerListLoadFailed: "Gagal memuat daftar pelanggan.",

  // Detail Pelanggan
  errCustomerDetailLoadFailed: "Gagal memuat detail pelanggan.",
  customerOtherBranchNote: "Pelanggan ini dibuat oleh cabang lain — hanya bisa dilihat dari sini.",
  orderHistoryTitle: "Riwayat Pesanan",
  noOrdersForCustomer: "Belum ada pesanan untuk pelanggan ini.",
  orderUnknownCustomer: "Pelanggan tidak diketahui",

  // Ubah Pelanggan (modal)
  editCustomerModalTitle: "Ubah Pelanggan",
  phoneWhatsappLabel: "Nomor HP / WhatsApp *",
  phoneUpdateHint: "Nomor telepon akan diperbarui untuk semua pesanan pelanggan ini.",
  whatsappIfDifferentLabel: "WhatsApp (jika beda)",

  // Daftar Pesanan
  orderSearchPlaceholder: "Cari nama, telepon, atau nomor order...",
  // filterAll pindah ke common.ts (2026-08-22, dipakai kalkulator dua area).
  noOrdersYet: "Belum ada pesanan tercatat di cabang ini.",
  noOrdersMatchSearch: 'Tidak ada pesanan yang cocok dengan pencarian "{q}".',
  noOrdersWithStatus: "Tidak ada pesanan dengan status ini.",
  orderListSalesLabel: "Sales {name}",
  orderListOtherBranchViewOnly: " · Cabang lain — hanya lihat",
  errOrderListLoadFailed: "Gagal memuat daftar pesanan.",

  // Detail Pesanan
  partnerOrderLabel: "Pesanan Partner",
  otherBranchViewOnlyBanner: "Cabang lain — hanya lihat.",
  reloadCta: "Muat Ulang",
  customerArrivedPrefix: "Pelanggan sudah tiba di SANCI —",
  notSetChip: "Belum ditentukan",
  salesDt: "Sales",
  orderCancelledHeading: "Pesanan dibatalkan",
  cancelInfoUnavailableMsg:
    "Pesanan ini tetap dibatalkan; hanya alasan dan waktu pembatalannya yang belum bisa ditampilkan. Hubungi " +
    "SANCI Admin.",
  cancelTimeLabel: "Waktu",
  orderCancelledReadonlyNote: "Pesanan yang sudah dibatalkan tidak bisa diubah lagi.",
  orderOtherBranchReadonlyNote:
    "Pesanan ini hanya bisa dilihat dari sisi cabang ini. Perubahan atau pembatalan dilakukan oleh cabang pemilik pesanan.",
  errOrderDetailLoadFailed: "Gagal memuat detail pesanan.",

  // Ubah / Batalkan Pesanan (modal)
  editOrderCta: "Ubah Pesanan",
  cancelOrderCta: "Batalkan Pesanan",
  purchaseAmountLabel: "Total belanja pelanggan di toko (opsional)",
  purchaseAmountHint: "Membantu SANCI menyiapkan penawaran yang sesuai.",

  // ---- Alamat Pengiriman (migrasi 0014) ----
  shippingAddressFieldLabel: "Alamat Pengiriman",
  shippingAddressHint: "Boleh beda dari alamat pelanggan — misalnya kirim ke kantor atau alamat lain. Selalu bisa diubah nanti.",
  shippingAddressPrefilledNote: "Diisi otomatis dari alamat pelanggan — masih bisa diubah.",
  // 0020 — nomor PO milik pelanggan/toko sendiri; tercetak di baris
  // "Purchase Order" pada Invoice kalau diisi (kalau kosong, Invoice tetap
  // memakai nomor pesanan sistem seperti sebelumnya).
  customerPoFieldLabel: "Nomor PO Pelanggan",
  customerPoHint: "Nomor Purchase Order dari pelanggan atau toko sendiri (kalau ada). Tercetak di Invoice pada baris Purchase Order.",

  // ---- Isi Pesanan (order-items-section.tsx, migrasi 0014) ----
  orderItemsCardTitle: "Isi Pesanan",
  orderItemsEmpty: "Belum ada isi pesanan.",
  orderItemsFeatureOff: "Fitur isi pesanan belum aktif.",
  orderItemsCopyWarningPartial: "Sebagian isi paket gagal tersalin otomatis ke pesanan ini.",
  orderItemColName: "Nama",
  orderItemColCode: "Kode",
  orderItemColQty: "Jumlah",
  orderItemColNote: "Catatan",
  orderItemColColor: "Warna",
  orderItemColSize: "Ukuran",
  orderItemEditCta: "Ubah",
  orderItemDeleteCta: "Hapus",
  orderItemDeleteConfirm: "Hapus baris \"{name}\" dari pesanan ini?",
  orderItemModalTitle: "Ubah Baris Pesanan",
  orderItemNoteFieldLabel: "Catatan",
  orderItemColorFieldLabel: "Kode Warna",
  orderItemSizeFieldLabel: "Ukuran Custom",
  orderItemQtyFieldLabel: "Jumlah",
  orderItemQtyInvalid: "Jumlah harus angka bulat lebih dari 0.",
  orderItemSaveFailed: "Tidak bisa menyimpan baris ini sekarang.",
  orderItemDeleteFailed: "Tidak bisa menghapus baris ini sekarang.",
  packageFieldLabel: "Package *",
  selectPackagePlaceholder: "— Pilih Package —",
  packageManualOption: "Lainnya (ketik manual)",
  packageNameFieldLabel: "Nama Package *",
  packageLoadErrorHint: "Daftar package gagal dimuat — ketik manual.",

  // Isi Package (hanya baca, migrasi 0012) — tombol di bawah dropdown Package
  // dan di samping nama Package pada detail pesanan.
  packageContentsCta: "Lihat isi",
  packageContentsHideCta: "Sembunyikan isi",
  packageContentsTitle: "Isi Package",
  packageContentsEmpty: "SANCI belum mengisi produk apa pun di package ini.",
  packageContentsLoadError: "Isi package gagal dimuat.",
  packageContentsCatalogClosed:
    "Isi package belum bisa ditampilkan — SANCI belum membuka katalog produk untuk toko Anda.",
  packageContentsProductGone: "Produk sudah ditarik dari katalog",

  salesFieldLabel: "Sales *",
  selectSalesPlaceholder: "— Pilih Sales —",
  noActiveStaffHint: "Belum ada staf aktif di cabang ini.",
  notSelectedOption: "— Tidak dipilih —",
  cancelOrderConfirmTitle: "Batalkan Pesanan?",
  selectReasonPlaceholder: "— Pilih Alasan —",
  cancelReasonCustomerCancelled: "Pelanggan membatalkan pembelian",
  cancelReasonWrongOrder: "Pesanan salah",
  cancelReasonDuplicateOrder: "Pesanan ganda",
  cancelReasonOther: "Lainnya",
  otherReasonLabel: "Alasan Lainnya *",
  otherReasonPlaceholder: "Tuliskan alasan pembatalan...",
  cancellingOrder: "Membatalkan…",
  errReasonRequired: "Pilih alasan pembatalan.",
  errCancelReasonRequired: "Alasan pembatalan wajib diisi.",
  errCancelReasonTooLong: "Alasan pembatalan terlalu panjang (maksimal 500 karakter).",

  // Invoice
  noInvoiceYet: "Belum ada invoice diunggah.",
  loadingInvoice: "Memuat invoice…",
  errInvoiceLoadFailed: "Invoice tidak bisa dimuat sekarang — muat ulang halaman.",
  openInvoicePdfCta: "Buka Invoice (PDF)",
  replaceInvoiceLabel: "Ganti Invoice",
  uploadInvoiceLabel: "Unggah Invoice",
  invoiceFileHintShort: "PNG, JPG, WebP, atau PDF. Maksimal 5 MB.",
  errInvoiceUploadFailed: "Invoice gagal diunggah — data pesanan tetap tersimpan.",
  errInvoiceWrongType: "Format invoice harus PNG, JPG, WebP, atau PDF.",
  errInvoiceTooLarge: "Ukuran invoice maksimal 5 MB. Pilih berkas yang lebih kecil.",
  errInvoicePathInvalid: "Alamat invoice tidak dikenali.",

  // Pesanan Baru (halaman + form)
  newOrderTitle: "Pelanggan & Pesanan Baru",
  orderCreatedBanner: "Pesanan berhasil dibuat.",
  newOrderAgainCta: "Buat Pesanan Lagi",
  customerSavedBanner: "Pelanggan berhasil disimpan.",
  newCustomerNoOrdersHint: "Belum ada pesanan untuk pelanggan ini. Anda bisa membuat pesanan sekarang.",
  newOrderForCustomerCta: "Buat Pesanan untuk Pelanggan Ini",
  checkingCustomer: "Memeriksa pelanggan…",
  errCustomerCheckFailed: "Tidak dapat memeriksa pelanggan — coba lagi.",
  customerFoundPrefix: "Pelanggan ditemukan:",
  useThisCustomerCta: "Gunakan Pelanggan Ini",
  customerSelectedPrefix: "Pelanggan dipilih:",
  changeCustomerCta: "Ganti Pelanggan",
  newCustomerHint: "Belum ada pelanggan dengan nomor ini — isi nama untuk membuat baru.",
  orderSectionLockedHint: "Isi atau pastikan dulu data pelanggan di atas untuk mengisi bagian ini.",
  invoiceFieldLabel: "Foto/PDF Invoice (opsional)",
  invoiceFieldHint:
    "PNG, JPG, WebP, atau PDF. Maksimal 5 MB — gambar diperkecil otomatis sebelum dikirim. Diunggah setelah pesanan berhasil dibuat.",
  saveCustomerOnlyCta: "Simpan Pelanggan Saja",
  createOrderCta: "Buat Pesanan",
  errOrderUnknownAfterConfirm: "Pesanan kemungkinan sudah tersimpan, tapi rinciannya belum bisa dimuat. Buka Daftar Pesanan.",

  // Server Action: Pelanggan & Pesanan (pesanan/actions.ts, pelanggan/actions.ts)
  errPackageNotFound: "Package tidak ditemukan atau sudah tidak aktif. Pilih ulang.",
  errPackageRequired: "Package wajib dipilih.",
  errPackageNameRequired: "Nama package wajib diisi.",
  errFulfillmentRequired: "Pilih jalur pesanan",
  errFulfillmentInvalid: "Jalur pesanan tidak valid.",
  errPurchaseAmountInvalid: "Jumlah belanja tidak valid.",
  errCustomerNotFoundReload: "Pelanggan tidak ditemukan lagi. Muat ulang halaman dan cari ulang.",
  errSalesRequired: "Sales wajib dipilih.",
  errSalesInvalidStaff: "Sales harus dipilih dari daftar staf aktif cabang ini.",
  errPicInvalidStaff: "PIC harus dipilih dari daftar staf aktif cabang ini.",
  partialOrderFailed: "Pelanggan tersimpan. Pesanan gagal — ulangi dari daftar pelanggan.",
  // Sama-sama "pelanggan selamat, pesanan tidak" seperti partialOrderFailed,
  // tapi penyebabnya modul yang belum aktif — mengulang sekarang tidak akan
  // menolong, jadi kalimatnya harus beda (audit teks 2026-08-28: dulu pesan
  // errOrderModuleInactive yang dipakai, dan pegawai tidak pernah tahu
  // pelanggannya sudah tersimpan).
  partialOrderModuleOff:
    "Pelanggan tersimpan. Pesanannya belum bisa dibuat karena Modul Pesanan belum aktif — mengulang sekarang " +
    "tidak akan berhasil. Hubungi SANCI Admin, lalu buat pesanannya dari daftar pelanggan.",
  partialOrderUnknownStatus:
    "Pelanggan tersimpan. Status pesanan belum bisa dipastikan karena koneksi terputus — cek Daftar Pesanan sebelum mencoba lagi.",
  partialOrderSummaryUnavailable:
    "Pesanan tersimpan tetapi rinciannya belum bisa dimuat ulang. Buka Daftar Pesanan untuk memastikan.",
  partialFulfillmentDropped:
    "Pesanan tersimpan, tetapi Jalur Pesanan belum bisa disimpan (fitur belum aktif di server). Hubungi SANCI Admin.",
  errOrderNotFoundNoAccess: "Pesanan tidak ditemukan atau Anda tidak punya akses.",
  errOrderAlreadyCancelled: "Pesanan ini sudah dibatalkan dan tidak bisa diubah lagi.",
  errOrderUpdateNoAccess:
    "Pesanan tidak bisa diubah — Anda mungkin tidak punya akses ke cabang ini, atau pesanan sudah berubah/dibatalkan. Muat ulang halaman.",
  errOrderAlreadyCancelledBefore: "Pesanan ini sudah dibatalkan sebelumnya.",
  errOrderCancelNoAccess:
    "Pesanan tidak bisa dibatalkan — Anda mungkin tidak punya akses ke cabang ini, atau pesanan sudah berubah. Muat ulang halaman.",

  // Staf
  staffPageTitle: "Staf — {name}",
  staffOtherBranchNote: "Cabang {name} lainnya.",
  staffCanEditNote: "Anda bisa mengubahnya (kebijakan Lihat + edit).",
  staffViewOnlyNote: "Lihat saja.",
  noStaffRegistered: "Belum ada staf terdaftar di cabang ini.",
  addStaffCta: "+ Tambah Staf",
  addStaffModalTitle: "Tambah Staf",
  staffBranchAutoNote: "Cabang: {branch} — otomatis dari halaman ini, tidak bisa dipilih.",
  staffNameHint:
    "Nama ini yang muncul di pilihan Sales/PIC saat membuat pesanan, dan tercetak sebagai " +
    "Nama Sales di dokumen SO.",
  roleFieldHint: "Peran bisnis di toko — terpisah dari hak akses login sistem.",
  staffCodeFieldLabel: "Kode Staf",
  staffCodeHint:
    "Opsional — diusulkan otomatis dari inisial nama, bebas diubah. Menjadi bagian kode pelanggan " +
    "otomatis untuk pelanggan yang dilayani staf ini (mis. AS pada GH-BSD-AS/26/001); kosongkan kalau belum perlu.",
  editStaffModalTitle: "Ubah Staf",
  confirmDeactivateStaff: "Nonaktifkan {name}? Riwayat tetap tersimpan.",

  // Produk SANCI
  errCatalogStatusLoadFailed: "Gagal memuat status katalog.",
  catalogNotOpenedMsg: "Katalog belum dibuka untuk toko Anda — hubungi SANCI.",
  errProductListLoadFailed: "Gagal memuat daftar produk.",
  // produkSearchPlaceholder / noProductsYet / noProductsMatchSearch /
  // noPhotoPlaceholder pindah ke common.ts (2026-08-22, dipakai kalkulator
  // dua area — produk-list-client.tsx ikut membacanya dari sana).
  produkViewDetailAria: "Lihat detail {name}",
  // Harga Normal di KARTU daftar (keputusan owner 2026-08-28). DUA kalimat
  // pengganti yang berbeda, jangan disatukan: "belum ada harga" adalah
  // FAKTA yang dipastikan server, "gagal dimuat" berarti kita tidak tahu —
  // manajer yang menyebut harga ke pelanggan harus bisa membedakannya
  // (LESSONS #10).
  produkCardPriceNone: "Belum ada harga",
  produkCardPriceLoadFailed: "Harga gagal dimuat",
  // Diumumkan lewat aria-live sesudah "Muat Lebih Banyak" berhasil — {n}
  // produk baru muncul JAUH di bawah layar, tombolnya saja tidak cukup.
  produkLoadedMoreAnnounce: "{n} produk lagi ditambahkan ke daftar.",
  // ---- Detail Produk (/cabang/produk/[productId], migration 0022) ----
  errProductDetailLoadFailed: "Gagal memuat detail produk.",
  produkDetailPriceLabel: "Harga Normal",
  produkDetailSizeLabel: "Ukuran",
  produkDetailGalleryAria: "Lihat foto {n} dari {total}",
  produkDetailShareBtn: "Bagikan ke Pelanggan (WhatsApp)",
  // {name} nama produk, {url} alamat halaman publik /p/[productId] —
  // disusun server (headers() untuk host, LESSONS: jangan tulis domain
  // statis supaya vercel.app maupun domain resmi sama-sama benar).
  produkDetailShareText: "Lihat produk ini: {name}\n{url}",

  // Penawaran SANCI (0014 izin can_view_offer/can_edit_offer, 0015 rantai
  // diskon can_discount) — hanya terlihat/terisi kalau admin membuka izinnya
  // di tab Hak Akses. Label kolom (Diskon, Markup, dst) datang dari
  // common.ts supaya sama persis dengan layar admin.
  cabangOfferCardTitle: "Penawaran SANCI",
  cabangOfferEmpty: "Belum ada penawaran SANCI untuk pesanan ini.",
  cabangOfferReadOnlyNote: "Hanya SANCI Admin yang bisa mengubah ini.",
  cabangOfferSetBtn: "Isi Penawaran",
  cabangOfferEditBtn: "Ubah Penawaran",
  cabangOfferModalTitle: "Penawaran SANCI",
  cabangOfferModalDesc: "Isi nilai penawaran yang SANCI berikan untuk pesanan ini.",
  cabangOfferFieldLabel: "Nilai penawaran (Rp)",
  cabangOfferSaveBtn: "Simpan Penawaran",
  cabangOfferInvalid: "Nilai penawaran tidak valid. Isi angka Rupiah, contoh: 1,500,000.",
  cabangOfferDpExceedsAmount: "Uang muka tidak boleh melebihi nilai penawaran.",
  cabangOfferNoPermissionEdit: "Toko Anda belum diizinkan mengisi Penawaran SANCI — hubungi SANCI Admin.",
  cabangOfferDiscountSectionTitle: "Diskon, Markup & Potongan Tunai",
  cabangOfferDiscountHint:
    "Setiap diskon dihitung berurutan dari nilai dasar. Markup diterapkan setelah semua diskon. " +
    "Potongan tunai dikurangi paling akhir.",
  cabangOfferDiscountFieldLabel: "Diskon {n} (%)",
  cabangOfferDiscountAddBtn: "+ Tambah Diskon",
  cabangOfferDiscountRemoveBtn: "Hapus",
  cabangOfferDiscountMaxReached: "Maksimal 6 diskon dalam satu rantai.",
  cabangOfferMarkupFieldLabel: "Markup (%)",
  cabangOfferCashFieldLabel: "Potongan Tunai (Rp)",
  cabangOfferDiscountInvalid: "Setiap nilai diskon harus lebih dari 0 dan kurang dari 100.",
  cabangOfferMarkupInvalid: "Nilai markup harus antara 0 dan 100.",
  cabangOfferCashInvalid: "Nilai potongan tunai tidak valid.",
  // cabangOfferFinalNegative digabung jadi common.offerFinalNegative
  // (2026-08-22) — teksnya identik dengan orderOfferFinalNegative di admin.ts.
  cabangOfferNoPermissionDiscount: "Toko Anda belum diizinkan mengatur diskon — hubungi SANCI Admin.",

  // Kalkulator Penawaran (/cabang/kalkulator) — owner brief 2026-08-20. DUA
  // penyimpangan sengaja dari halaman lain (didokumentasikan di page.tsx +
  // FEATURES.md): tanpa gerbang izin can_discount/can_edit_offer, dan tidak
  // menulis apa pun ke database selagi dipakai (murni localStorage).
  // Sebagian besar teks kalkulator (calcPageTitle, calcTab*, calcBreakdown*,
  // dst.) pindah ke common.ts (2026-08-22) — komponennya sekarang dipakai
  // dua area (/cabang/kalkulator dan /admin/kalkulator). Yang tersisa di
  // bawah ini HANYA yang menyebut alur pesanan cabang.
  homeCalculator: "Kalkulator Penawaran",
  // ── Harga Normal (/cabang/harga, migrasi 0021) ──
  // "Harga Normal" = harga jual normal toko ke pelanggan (sebelum diskon)
  // — nama pilihan owner (GLOSSARY.md). Pembandingnya "Harga Dasar SANCI"
  // (harga dasar milik SANCI, titik awal semua partner). JANGAN dicampur
  // dengan "Penawaran SANCI" (nilai penawaran TINGKAT PESANAN, 0013).
  homePriceList: "Harga Normal",
  hargaPageTitle: "Harga Normal",
  hargaIntroNote:
    "Harga jual normal toko Anda per produk. Kosong = mengikuti Harga Dasar SANCI. Harga di sini otomatis " +
    "terisi sebagai harga awal di Kalkulator dan Isi Pesanan — selalu bisa diubah saat dipakai.",
  hargaBaseLabel: "Harga Dasar SANCI",
  hargaMyLabel: "Harga Normal toko ini (Rp)",
  hargaNoBase: "belum ditetapkan",
  hargaFollowsBaseNote: "Mengikuti Harga Dasar SANCI.",
  hargaResetCta: "Ikuti harga SANCI",
  hargaSavedOk: "Harga tersimpan.",
  hargaClearedOk: "Kembali mengikuti Harga Dasar SANCI.",
  hargaSaveFailed: "Gagal menyimpan harga. Coba lagi.",
  hargaSaveUnsure:
    "Jawaban server tidak sampai — harga mungkin sudah tersimpan. Muat ulang halaman untuk memastikan sebelum mencoba lagi.",
  hargaInvalidInput: "Isi angka rupiah yang benar.",
  hargaModuleInactiveMsg: "Fitur Harga Normal belum aktif, jadi harga belum bisa disimpan. Hubungi SANCI Admin.",
  // Tombol kalkulator TIDAK BOLEH bernama sama dengan tombol simpan di form
  // pesanan (`createOrderCta`): kalkulator tidak menulis apa pun ke database
  // (lihat handleConvertToOrder di lib/kalkulator-client.tsx — cuma hand-off
  // + router.push), sedangkan `createOrderCta` di new-order-form.tsx yang
  // benar-benar membuat pesanan. Dua tombol berlabel sama = pegawai yakin
  // pesanannya sudah jadi padahal belum (audit teks 2026-08-28).
  calcIntroNote:
    "Alat hitung cepat untuk dipakai langsung di depan pelanggan. Di layar ini TIDAK ADA yang tersimpan ke " +
    "sistem. Tombol \"Lanjut ke Pesanan Baru\" cuma membawa angkanya ke form Pesanan Baru — pesanannya baru " +
    "benar-benar tersimpan setelah Anda mengisi pelanggan di form itu lalu menekan \"Buat Pesanan\" di sana. " +
    "Rantai diskon di sini bisa dipakai semua cabang, terlepas dari izin diskon pada pesanan sungguhan.",
  calcConvertCta: "Lanjut ke Pesanan Baru",
  calcConvertScopeNote:
    "\"Lanjut ke Pesanan Baru\" membawa subtotal, rantai diskon, dan daftar produk (nama, kode, jumlah) ke form " +
    "Pesanan Baru — belum menyimpan apa pun. Harga per barang ikut kalau toko Anda punya izin \"Lihat & atur " +
    "Penawaran SANCI\" — kalau belum, barangnya tetap dibuat tanpa harga.",

  // Hand-off Kalkulator → Pesanan Baru (lihat lib/calculator-shared.ts:
  // CalcHandoff, sekali pakai lewat localStorage).
  calcHandoffBanner: "Dari Kalkulator Penawaran: {n} barang · Subtotal {subtotal} · Harga Akhir {final}.",
  calcHandoffApplyCta: "Gunakan angka ini",
  calcHandoffDismissCta: "Abaikan",
  calcHandoffScopeHint:
    "Ini akan mengisi \"Total belanja pelanggan\" dengan subtotal dari kalkulator. Rantai diskonnya otomatis " +
    "diterapkan ke Penawaran SANCI setelah pesanan ini berhasil dibuat (kalau toko Anda punya izin diskon). " +
    "Daftar produk dari kalkulator (nama, kode, jumlah) juga ikut ditambahkan ke pesanan — harga per barang ikut " +
    "kalau toko Anda punya izin \"Lihat & atur Penawaran SANCI\".",
  calcHandoffAppliedOk: "Rantai diskon dari Kalkulator Penawaran berhasil diterapkan ke Penawaran SANCI pesanan ini.",
  calcHandoffAppliedFailed:
    "Pesanan berhasil dibuat, tapi rantai diskon dari Kalkulator Penawaran belum bisa otomatis diterapkan — toko " +
    "Anda mungkin belum punya izin diskon. Masukkan manual di halaman pesanan ini, atau hubungi SANCI Admin.",
  // Hasil penulisan baris "Isi Pesanan" form pesanan baru (fitur picker
  // 2026-08-24). SATU daftar + SATU jalur tulis: baris bisa berasal dari
  // picker produk maupun prefill hand-off Kalkulator — kunci lama
  // calcItemsApplied{Ok,Partial,Failed} (yang menyebut "dari kalkulator")
  // dihapus bersama pemakainya; PriceNote TETAP karena kalimatnya tidak
  // menyebut kalkulator dan degradasi izin harganya sama persis.
  calcItemsAppliedPriceNote:
    "Harga per barang tidak ikut karena toko Anda belum punya izin \"Lihat & atur Penawaran SANCI\".",
  formItemsAppliedOk: "{n} produk berhasil ditambahkan ke pesanan ini.",
  formItemsAppliedPartial:
    "{n} dari {total} produk berhasil ditambahkan ke pesanan ini; sisanya gagal — cek dan tambahkan manual di " +
    "Isi Pesanan bila perlu.",
  formItemsAppliedFailed:
    "Pesanan berhasil dibuat, tapi produk yang dipilih belum bisa otomatis ditambahkan — tambahkan manual di " +
    "Isi Pesanan.",
} as const;

type Shape = Record<keyof typeof id, string>;

const en = {
  homeNewOrder: "+ New order",
  homeOrders: "Orders",
  homeCustomers: "Customers",
  homeProducts: "SANCI products",
  homeStaff: "Staff",
  homeBranchProfile: "Branch profile",
  homeMyAccount: "My account",
  homeSignOut: "Sign out",
  signingOut: "Signing out…",
  homeBranchLabel: "Branch {name}",
  homeOtherBranches: "Other {name} branches",
  homeAccessViewEdit: "View + edit",
  homeAccessViewOnly: "View only",
  homeFooterWarehouse: "Warehouse and delivery are coming in a later phase — not shown here yet on purpose.",

  navBackHome: "← Home",
  navBackCustomers: "← Customers",
  navBackOrders: "← Orders",
  navBackProducts: "← Product List",

  errAccountLoad: "Could not load account data. Reload the page to try again.",
  errAccountLoadRetry: "Could not load account data — try again.",
  errSessionInvalid: "Your session isn't valid. Reload the page.",
  errPartnerLoad: "Could not load your partner data. Contact SANCI Admin to check your account settings.",
  errPartnerBranchLoad:
    "Could not load your partner/branch data. Contact SANCI Admin to check your account and branch access.",
  errOrderModuleInactive: "The Orders module isn't active yet. Contact SANCI Admin.",
  errCustomerModuleInactive: "The Customers module isn't active yet. Contact SANCI Admin.",
  errCatalogModuleInactive: "The Product Catalog module isn't active yet. Contact SANCI Admin.",
  errFeatureInactive: "This feature isn't active yet. Contact SANCI Admin.",
  errNotAllowedMigration:
    "The change was not saved — you don't have permission to edit this yet, or the feature isn't active. " +
    "Contact SANCI Admin.",
  errFullNameRequired: "Full name is required.",
  errPhoneInvalid: "This phone number isn't valid.",
  noPhoneNumber: "no phone",
  optionalPlaceholder: "Optional...",
  picLabel: "PIC",

  loginIdentityDt: "Login identity",
  akunFootnote:
    "Your branch identity is set by SANCI — there's no option to switch branches. Accounts are created and managed by SANCI Admin.",

  profilFootnote: "Wrong address or contact info? Contact SANCI Admin to update it.",

  newCustomerCta: "+ New customer",
  customerSearchPlaceholder: "Search by name or phone...",
  noCustomersYet: "No customers recorded yet.",
  noCustomersMatchSearch: 'No customers match "{q}".',
  customerOrderCount: "{n} orders",
  errCustomerListLoadFailed: "Could not load the customer list.",

  errCustomerDetailLoadFailed: "Could not load customer details.",
  customerOtherBranchNote: "This customer was created by another branch — you can only view them here.",
  orderHistoryTitle: "Order history",
  noOrdersForCustomer: "No orders for this customer yet.",
  orderUnknownCustomer: "Unknown customer",

  editCustomerModalTitle: "Edit customer",
  phoneWhatsappLabel: "Phone / WhatsApp number *",
  phoneUpdateHint: "The phone number will be updated on all of this customer's orders.",
  whatsappIfDifferentLabel: "WhatsApp (if different)",

  orderSearchPlaceholder: "Search by name, phone, or order number...",
  noOrdersYet: "No orders recorded at this branch yet.",
  noOrdersMatchSearch: 'No orders match "{q}".',
  noOrdersWithStatus: "No orders with this status.",
  orderListSalesLabel: "Sales {name}",
  orderListOtherBranchViewOnly: " · Other branch — view only",
  errOrderListLoadFailed: "Could not load the order list.",

  partnerOrderLabel: "Partner order",
  otherBranchViewOnlyBanner: "Other branch — view only.",
  reloadCta: "Reload",
  customerArrivedPrefix: "Customer has arrived at SANCI —",
  notSetChip: "Not set",
  salesDt: "Sales",
  orderCancelledHeading: "Order cancelled",
  cancelInfoUnavailableMsg:
    "This order is still cancelled; only the reason and time of cancellation can't be shown yet. Contact " +
    "SANCI Admin.",
  cancelTimeLabel: "Time",
  orderCancelledReadonlyNote: "A cancelled order can no longer be changed.",
  orderOtherBranchReadonlyNote:
    "This order can only be viewed from this branch. Changes or cancellation are handled by the branch that owns the order.",
  errOrderDetailLoadFailed: "Could not load order details.",

  editOrderCta: "Edit order",
  cancelOrderCta: "Cancel order",
  purchaseAmountLabel: "Customer's total purchase at the store (optional)",
  purchaseAmountHint: "Helps SANCI prepare a matching offer.",

  shippingAddressFieldLabel: "Shipping address",
  shippingAddressHint: "Can differ from the customer's address — e.g. ship to an office or another address. Always editable later.",
  shippingAddressPrefilledNote: "Pre-filled from the customer's address — still editable.",
  customerPoFieldLabel: "Customer PO No.",
  customerPoHint: "The customer's or store's own Purchase Order number (if any). Printed on the Invoice in the Purchase Order row.",

  orderItemsCardTitle: "Order items",
  orderItemsEmpty: "No order items yet.",
  orderItemsFeatureOff: "The order items feature is not active yet.",
  orderItemsCopyWarningPartial: "Some package items failed to copy into this order automatically.",
  orderItemColName: "Name",
  orderItemColCode: "Code",
  orderItemColQty: "Qty",
  orderItemColNote: "Note",
  orderItemColColor: "Color",
  orderItemColSize: "Size",
  orderItemEditCta: "Edit",
  orderItemDeleteCta: "Delete",
  orderItemDeleteConfirm: "Delete the line \"{name}\" from this order?",
  orderItemModalTitle: "Edit order line",
  orderItemNoteFieldLabel: "Note",
  orderItemColorFieldLabel: "Color code",
  orderItemSizeFieldLabel: "Custom size",
  orderItemQtyFieldLabel: "Quantity",
  orderItemQtyInvalid: "Quantity must be a whole number greater than 0.",
  orderItemSaveFailed: "Cannot save this line right now.",
  orderItemDeleteFailed: "Cannot delete this line right now.",
  packageFieldLabel: "Package *",
  selectPackagePlaceholder: "— Choose a package —",
  packageManualOption: "Other (type manually)",
  packageNameFieldLabel: "Package name *",
  packageLoadErrorHint: "Couldn't load the package list — type it manually.",

  packageContentsCta: "View contents",
  packageContentsHideCta: "Hide contents",
  packageContentsTitle: "Package contents",
  packageContentsEmpty: "SANCI hasn't put any product in this package yet.",
  packageContentsLoadError: "Couldn't load the package contents.",
  packageContentsCatalogClosed:
    "The package contents can't be shown yet — SANCI hasn't opened the product catalog for your store.",
  packageContentsProductGone: "Product withdrawn from the catalog",

  salesFieldLabel: "Sales *",
  selectSalesPlaceholder: "— Choose sales staff —",
  noActiveStaffHint: "No active staff at this branch yet.",
  notSelectedOption: "— Not selected —",
  cancelOrderConfirmTitle: "Cancel this order?",
  selectReasonPlaceholder: "— Choose a reason —",
  cancelReasonCustomerCancelled: "Customer cancelled the purchase",
  cancelReasonWrongOrder: "Wrong order",
  cancelReasonDuplicateOrder: "Duplicate order",
  cancelReasonOther: "Other",
  otherReasonLabel: "Other reason *",
  otherReasonPlaceholder: "Write the cancellation reason...",
  cancellingOrder: "Cancelling…",
  errReasonRequired: "Choose a cancellation reason.",
  errCancelReasonRequired: "A cancellation reason is required.",
  errCancelReasonTooLong: "The cancellation reason is too long (max 500 characters).",

  noInvoiceYet: "No invoice uploaded yet.",
  loadingInvoice: "Loading invoice…",
  errInvoiceLoadFailed: "Couldn't load the invoice right now — reload the page.",
  openInvoicePdfCta: "Open invoice (PDF)",
  replaceInvoiceLabel: "Replace invoice",
  uploadInvoiceLabel: "Upload invoice",
  invoiceFileHintShort: "PNG, JPG, WebP, or PDF. Max 5 MB.",
  errInvoiceUploadFailed: "The invoice failed to upload — the order was still saved.",
  errInvoiceWrongType: "The invoice must be PNG, JPG, WebP, or PDF.",
  errInvoiceTooLarge: "The invoice can be at most 5 MB. Choose a smaller file.",
  errInvoicePathInvalid: "Invoice location not recognized.",

  newOrderTitle: "New customer & order",
  orderCreatedBanner: "Order created successfully.",
  newOrderAgainCta: "Create another order",
  customerSavedBanner: "Customer saved successfully.",
  newCustomerNoOrdersHint: "No orders for this customer yet. You can create one now.",
  newOrderForCustomerCta: "Create order for this customer",
  checkingCustomer: "Checking customer…",
  errCustomerCheckFailed: "Couldn't check the customer — try again.",
  customerFoundPrefix: "Customer found:",
  useThisCustomerCta: "Use this customer",
  customerSelectedPrefix: "Customer selected:",
  changeCustomerCta: "Change customer",
  newCustomerHint: "No customer with this number yet — enter a name to create one.",
  orderSectionLockedHint: "Fill in or confirm the customer above before filling in this section.",
  invoiceFieldLabel: "Invoice photo/PDF (optional)",
  invoiceFieldHint:
    "PNG, JPG, WebP, or PDF. Max 5 MB — images are resized automatically before sending. Uploaded after the order is created.",
  saveCustomerOnlyCta: "Save customer only",
  createOrderCta: "Create order",
  errOrderUnknownAfterConfirm: "The order was likely saved, but its details couldn't load. Open the order list.",

  errPackageNotFound: "Package not found, or it's no longer active. Please choose again.",
  errPackageRequired: "Please choose a package.",
  errPackageNameRequired: "Please enter a package name.",
  errFulfillmentRequired: "Choose a fulfillment path",
  errFulfillmentInvalid: "Invalid fulfillment path.",
  errPurchaseAmountInvalid: "Invalid purchase amount.",
  errCustomerNotFoundReload: "This customer could no longer be found. Reload the page and search again.",
  errSalesRequired: "Please choose sales staff.",
  errSalesInvalidStaff: "Sales staff must be chosen from this branch's active staff list.",
  errPicInvalidStaff: "PIC must be chosen from this branch's active staff list.",
  partialOrderFailed: "Customer saved. Order failed — retry from the customer list.",
  partialOrderModuleOff:
    "Customer saved. The order could not be created because the Orders module isn't active yet — retrying now " +
    "will not help. Contact SANCI Admin, then create the order from the customer list.",
  partialOrderUnknownStatus:
    "Customer saved. The order's status couldn't be confirmed because the connection dropped — check the order list before trying again.",
  partialOrderSummaryUnavailable:
    "The order was saved but its details couldn't be reloaded. Open the order list to confirm.",
  partialFulfillmentDropped:
    "The order was saved, but the fulfillment path couldn't be saved (this feature isn't active on the server yet). Contact SANCI Admin.",
  errOrderNotFoundNoAccess: "Order not found, or you don't have access to it.",
  errOrderAlreadyCancelled: "This order has already been cancelled and can no longer be changed.",
  errOrderUpdateNoAccess:
    "The order couldn't be updated — you may not have access to this branch, or the order has changed or been cancelled. Reload the page.",
  errOrderAlreadyCancelledBefore: "This order was already cancelled.",
  errOrderCancelNoAccess:
    "The order couldn't be cancelled — you may not have access to this branch, or the order has changed. Reload the page.",

  staffPageTitle: "Staff — {name}",
  staffOtherBranchNote: "Another {name} branch.",
  staffCanEditNote: "You can edit it (View + edit policy).",
  staffViewOnlyNote: "View only.",
  noStaffRegistered: "No staff registered at this branch yet.",
  addStaffCta: "+ Add staff",
  addStaffModalTitle: "Add staff",
  staffBranchAutoNote: "Branch: {branch} — automatic from this page, can't be changed.",
  staffNameHint:
    "This name appears in the Sales/PIC choices when creating an order, and is printed as the " +
    "sales name on the SO document.",
  roleFieldHint: "Their role at the store — separate from system login access.",
  staffCodeFieldLabel: "Staff Code",
  staffCodeHint:
    "Optional — suggested automatically from the name's initials, free to change. Becomes part of " +
    "the automatic customer code for customers this staff member serves (e.g. the AS in GH-BSD-AS/26/001); " +
    "leave blank if not needed yet.",
  editStaffModalTitle: "Edit staff",
  confirmDeactivateStaff: "Deactivate {name}? Their history stays saved.",

  errCatalogStatusLoadFailed: "Could not load catalog status.",
  catalogNotOpenedMsg: "The catalog hasn't been opened for your store yet — contact SANCI.",
  errProductListLoadFailed: "Could not load the product list.",
  produkViewDetailAria: "View details for {name}",
  produkCardPriceNone: "No price yet",
  produkCardPriceLoadFailed: "Price failed to load",
  produkLoadedMoreAnnounce: "{n} more products added to the list.",
  errProductDetailLoadFailed: "Could not load the product detail.",
  produkDetailPriceLabel: "Normal Price",
  produkDetailSizeLabel: "Size",
  produkDetailGalleryAria: "View photo {n} of {total}",
  produkDetailShareBtn: "Share with Customer (WhatsApp)",
  produkDetailShareText: "Check out this product: {name}\n{url}",

  cabangOfferCardTitle: "SANCI offer",
  cabangOfferEmpty: "No SANCI offer for this order yet.",
  cabangOfferReadOnlyNote: "Only SANCI Admin can change this.",
  cabangOfferSetBtn: "Set offer",
  cabangOfferEditBtn: "Edit offer",
  cabangOfferModalTitle: "SANCI offer",
  cabangOfferModalDesc: "Fill in the offer amount SANCI is giving for this order.",
  cabangOfferFieldLabel: "Offer amount (Rp)",
  cabangOfferSaveBtn: "Save offer",
  cabangOfferInvalid: "That offer amount is not valid. Enter a Rupiah number, for example 1,500,000.",
  cabangOfferDpExceedsAmount: "The down payment cannot exceed the offer amount.",
  cabangOfferNoPermissionEdit: "Your store isn't allowed to set the SANCI offer yet — contact SANCI Admin.",
  cabangOfferDiscountSectionTitle: "Discount, markup & cash discount",
  cabangOfferDiscountHint:
    "Each discount is applied in order from the base amount. Markup applies after all discounts. " +
    "Cash discount is subtracted last.",
  cabangOfferDiscountFieldLabel: "Discount {n} (%)",
  cabangOfferDiscountAddBtn: "+ Add discount",
  cabangOfferDiscountRemoveBtn: "Remove",
  cabangOfferDiscountMaxReached: "Maximum 6 discounts in one chain.",
  cabangOfferMarkupFieldLabel: "Markup (%)",
  cabangOfferCashFieldLabel: "Cash discount (Rp)",
  cabangOfferDiscountInvalid: "Each discount value must be more than 0 and less than 100.",
  cabangOfferMarkupInvalid: "The markup value must be between 0 and 100.",
  cabangOfferCashInvalid: "That cash discount value is not valid.",
  cabangOfferNoPermissionDiscount: "Your store isn't allowed to set discounts yet — contact SANCI Admin.",

  // Offer Calculator (/cabang/kalkulator) — owner brief 2026-08-20. Two
  // deliberate exceptions from other screens (documented in page.tsx +
  // FEATURES.md): no can_discount/can_edit_offer gate, and nothing is
  // written to the database while it's in use (localStorage only).
  homeCalculator: "Offer Calculator",
  // Harga Normal (/cabang/harga, 0021) — owner-chosen name, GLOSSARY.md.
  homePriceList: "Normal price",
  hargaPageTitle: "Normal price",
  hargaIntroNote:
    "Your store's normal selling price per product. Empty = follows the SANCI base price. Prices here are " +
    "filled in automatically as the starting price in the Calculator and Order items — always editable in use.",
  hargaBaseLabel: "SANCI base price",
  hargaMyLabel: "This store's normal price (Rp)",
  hargaNoBase: "not set",
  hargaFollowsBaseNote: "Following the SANCI base price.",
  hargaResetCta: "Follow SANCI price",
  hargaSavedOk: "Price saved.",
  hargaClearedOk: "Now following the SANCI base price.",
  hargaSaveFailed: "Could not save the price. Try again.",
  hargaSaveUnsure:
    "No reply from the server — the price may have been saved. Reload the page to check before trying again.",
  hargaInvalidInput: "Enter a valid rupiah amount.",
  hargaModuleInactiveMsg:
    "The Normal price feature isn't active yet, so prices can't be saved. Contact SANCI Admin.",
  calcIntroNote:
    "A quick calculator for use right in front of the customer. NOTHING on this screen is saved to the system. " +
    "The \"Continue to new order\" button only carries the numbers over to the new order form — the order is " +
    "not saved until you fill in the customer there and press \"Create order\" on that screen. The discount " +
    "chain here can be used by every branch, regardless of discount permissions on real orders.",
  calcConvertCta: "Continue to new order",
  calcConvertScopeNote:
    "\"Continue to new order\" carries the subtotal, discount chain, and product list (name, code, quantity) " +
    "into the new order form — it does not save anything yet. Per-item prices come along too if your store has " +
    "\"View & set SANCI Offer\" permission — if not, items are still created, just without a price.",

  // Calculator → New order hand-off (see lib/calculator-shared.ts:
  // CalcHandoff, one-shot via localStorage).
  calcHandoffBanner: "From the Offer Calculator: {n} items · Subtotal {subtotal} · Final price {final}.",
  calcHandoffApplyCta: "Use these numbers",
  calcHandoffDismissCta: "Dismiss",
  calcHandoffScopeHint:
    "This fills \"Customer's total purchase\" with the calculator's subtotal. The discount chain is applied " +
    "automatically to the SANCI Offer once this order is created (if your store has discount permission). The " +
    "calculator's product list (name, code, quantity) is also added to the order — per-item prices come along " +
    "if your store has \"View & set SANCI Offer\" permission.",
  calcHandoffAppliedOk: "The Offer Calculator's discount chain was applied to this order's SANCI Offer.",
  calcHandoffAppliedFailed:
    "The order was created, but the Offer Calculator's discount chain couldn't be applied automatically — your " +
    "store may not have discount permission yet. Enter it manually on this order's page, or contact SANCI Admin.",
  calcItemsAppliedPriceNote:
    "Prices weren't carried over because your store doesn't have \"View & set SANCI Offer\" permission yet.",
  formItemsAppliedOk: "{n} products were added to this order.",
  formItemsAppliedPartial:
    "{n} of {total} products were added to this order; the rest failed — check and add them manually in " +
    "Order Items if needed.",
  formItemsAppliedFailed:
    "The order was created, but the selected products couldn't be added automatically — add them manually in " +
    "Order Items.",
} satisfies Shape;

const zh = {
  homeNewOrder: "+ 新建订单",
  homeOrders: "订单列表",
  homeCustomers: "客户",
  homeProducts: "SANCI 产品",
  homeStaff: "员工",
  homeBranchProfile: "分店资料",
  homeMyAccount: "我的账号",
  homeSignOut: "退出",
  signingOut: "退出中…",
  homeBranchLabel: "分店 {name}",
  homeOtherBranches: "{name} 的其他分店",
  homeAccessViewEdit: "查看和修改",
  homeAccessViewOnly: "只能查看",
  homeFooterWarehouse: "仓库和配送是下一阶段的功能,现在还没有开放。",

  navBackHome: "← 首页",
  navBackCustomers: "← 客户",
  navBackOrders: "← 订单列表",
  navBackProducts: "← 产品列表",

  errAccountLoad: "账号信息加载失败,请刷新页面重试。",
  errAccountLoadRetry: "账号信息加载失败 —— 请重试。",
  errSessionInvalid: "登录状态已失效,请刷新页面。",
  errPartnerLoad: "合作商信息加载失败,请联系 SANCI 管理员检查账号设置。",
  errPartnerBranchLoad: "合作商/分店信息加载失败,请联系 SANCI 管理员检查账号和分店权限。",
  errOrderModuleInactive: "订单功能还没有启用,请联系 SANCI 管理员。",
  errCustomerModuleInactive: "客户功能还没有启用,请联系 SANCI 管理员。",
  errCatalogModuleInactive: "产品目录功能还没有启用,请联系 SANCI 管理员。",
  errFeatureInactive: "这个功能还没有启用,请联系 SANCI 管理员。",
  errNotAllowedMigration: "修改没有保存 —— 您还没有修改这项数据的权限,或者这个功能还没有启用。请联系 SANCI 管理员。",
  errFullNameRequired: "请填写姓名。",
  errPhoneInvalid: "电话号码无效。",
  noPhoneNumber: "无电话",
  optionalPlaceholder: "选填…",
  picLabel: "负责人",

  loginIdentityDt: "登录身份",
  akunFootnote: "您的分店身份由 SANCI 设定,不能自行更换分店。账号由 SANCI 管理员创建和管理。",

  profilFootnote: "地址或联系方式不对?请联系 SANCI 管理员更新。",

  newCustomerCta: "+ 新建客户",
  customerSearchPlaceholder: "搜索姓名或电话…",
  noCustomersYet: "还没有客户记录。",
  noCustomersMatchSearch: '没有符合"{q}"的客户。',
  customerOrderCount: "{n} 个订单",
  errCustomerListLoadFailed: "客户列表加载失败。",

  errCustomerDetailLoadFailed: "客户详情加载失败。",
  customerOtherBranchNote: "该客户由其他分店创建 —— 在这里只能查看。",
  orderHistoryTitle: "订单记录",
  noOrdersForCustomer: "该客户还没有订单。",
  orderUnknownCustomer: "未知客户",

  editCustomerModalTitle: "修改客户",
  phoneWhatsappLabel: "手机号 / WhatsApp 号码 *",
  phoneUpdateHint: "电话号码更新后,会同步到该客户的所有订单。",
  whatsappIfDifferentLabel: "WhatsApp(如果不同)",

  orderSearchPlaceholder: "搜索姓名、电话或订单编号…",
  noOrdersYet: "本店还没有订单记录。",
  noOrdersMatchSearch: '没有符合"{q}"的订单。',
  noOrdersWithStatus: "没有该状态的订单。",
  orderListSalesLabel: "销售员 {name}",
  orderListOtherBranchViewOnly: " · 其他分店 —— 仅可查看",
  errOrderListLoadFailed: "订单列表加载失败。",

  partnerOrderLabel: "合作商订单",
  otherBranchViewOnlyBanner: "其他分店 —— 仅可查看。",
  reloadCta: "刷新",
  customerArrivedPrefix: "客户已到达 SANCI ——",
  notSetChip: "未设置",
  salesDt: "销售员",
  orderCancelledHeading: "订单已取消",
  cancelInfoUnavailableMsg: "这笔订单确实已经取消,只是取消原因和时间暂时无法显示。请联系 SANCI 管理员。",
  cancelTimeLabel: "时间",
  orderCancelledReadonlyNote: "已取消的订单不能再修改。",
  orderOtherBranchReadonlyNote: "在本店只能查看这个订单。修改或取消需要由订单所属的分店操作。",
  errOrderDetailLoadFailed: "订单详情加载失败。",

  editOrderCta: "修改订单",
  cancelOrderCta: "取消订单",
  purchaseAmountLabel: "客户在店内的消费总额(选填)",
  purchaseAmountHint: "帮助 SANCI 准备合适的报价。",

  shippingAddressFieldLabel: "收货地址",
  shippingAddressHint: "可以跟客户地址不一样 —— 比如送到公司或其他地址。之后随时可以修改。",
  shippingAddressPrefilledNote: "已自动带入客户的地址 —— 仍然可以修改。",
  customerPoFieldLabel: "客户 PO 号",
  customerPoHint: "客户或门店自己开出的采购单（PO）编号（如有）。会打印在 Invoice 的 Purchase Order 一行。",

  orderItemsCardTitle: "订单明细",
  orderItemsEmpty: "该订单暂无明细。",
  orderItemsFeatureOff: "订单明细功能尚未启用。",
  orderItemsCopyWarningPartial: "部分套装内容未能自动复制到这笔订单。",
  orderItemColName: "名称",
  orderItemColCode: "代码",
  orderItemColQty: "数量",
  orderItemColNote: "备注",
  orderItemColColor: "颜色",
  orderItemColSize: "尺寸",
  orderItemEditCta: "修改",
  orderItemDeleteCta: "删除",
  orderItemDeleteConfirm: "确定要删除这笔订单里的「{name}」吗？",
  orderItemModalTitle: "修改订单明细",
  orderItemNoteFieldLabel: "备注",
  orderItemColorFieldLabel: "颜色代码",
  orderItemSizeFieldLabel: "定制尺寸",
  orderItemQtyFieldLabel: "数量",
  orderItemQtyInvalid: "数量必须是大于 0 的整数。",
  orderItemSaveFailed: "现在无法保存这一行。",
  orderItemDeleteFailed: "现在无法删除这一行。",
  packageFieldLabel: "套装 *",
  selectPackagePlaceholder: "—— 请选择套装 ——",
  packageManualOption: "其他(手动输入)",
  packageNameFieldLabel: "套装名称 *",
  packageLoadErrorHint: "套装列表加载失败 —— 请手动输入。",

  packageContentsCta: "查看内容",
  packageContentsHideCta: "收起内容",
  packageContentsTitle: "套装内容",
  packageContentsEmpty: "SANCI 还没有为该套装添加任何产品。",
  packageContentsLoadError: "套装内容加载失败。",
  packageContentsCatalogClosed: "暂时无法显示套装内容 —— SANCI 还没有为贵店开放产品目录。",
  packageContentsProductGone: "该产品已从目录下架",

  salesFieldLabel: "销售员 *",
  selectSalesPlaceholder: "—— 请选择销售员 ——",
  noActiveStaffHint: "本店暂时没有在职员工。",
  notSelectedOption: "—— 未选择 ——",
  cancelOrderConfirmTitle: "确定要取消这个订单吗?",
  selectReasonPlaceholder: "—— 请选择原因 ——",
  cancelReasonCustomerCancelled: "客户取消购买",
  cancelReasonWrongOrder: "订单错误",
  cancelReasonDuplicateOrder: "重复订单",
  cancelReasonOther: "其他",
  otherReasonLabel: "其他原因 *",
  otherReasonPlaceholder: "请填写取消原因…",
  cancellingOrder: "取消中…",
  errReasonRequired: "请选择取消原因。",
  errCancelReasonRequired: "请填写取消原因。",
  errCancelReasonTooLong: "取消原因太长了(最多 500 字)。",

  noInvoiceYet: "还没有上传 Invoice。",
  loadingInvoice: "Invoice 加载中…",
  errInvoiceLoadFailed: "现在无法加载 Invoice —— 请刷新页面。",
  openInvoicePdfCta: "打开 Invoice(PDF)",
  replaceInvoiceLabel: "更换 Invoice",
  uploadInvoiceLabel: "上传 Invoice",
  invoiceFileHintShort: "支持 PNG、JPG、WebP 或 PDF,最大 5 MB。",
  errInvoiceUploadFailed: "Invoice 上传失败 —— 订单数据已经保存。",
  errInvoiceWrongType: "Invoice 格式必须是 PNG、JPG、WebP 或 PDF。",
  errInvoiceTooLarge: "Invoice 最大 5 MB,请选择小一点的文件。",
  errInvoicePathInvalid: "无法识别 Invoice 的存储路径。",

  newOrderTitle: "新建客户和订单",
  orderCreatedBanner: "订单创建成功。",
  newOrderAgainCta: "再建一个订单",
  customerSavedBanner: "客户保存成功。",
  newCustomerNoOrdersHint: "该客户还没有订单,您现在可以为他建一个。",
  newOrderForCustomerCta: "为该客户建订单",
  checkingCustomer: "正在查客户…",
  errCustomerCheckFailed: "无法查询客户 —— 请重试。",
  customerFoundPrefix: "找到客户:",
  useThisCustomerCta: "使用这个客户",
  customerSelectedPrefix: "已选客户:",
  changeCustomerCta: "更换客户",
  newCustomerHint: "还没有这个号码的客户 —— 填写姓名来新建一个。",
  orderSectionLockedHint: "请先填好上面的客户信息,才能填这部分。",
  invoiceFieldLabel: "Invoice 照片/PDF(选填)",
  invoiceFieldHint: "支持 PNG、JPG、WebP 或 PDF,最大 5 MB —— 图片会自动压缩后再上传,订单创建成功后才会上传。",
  saveCustomerOnlyCta: "仅保存客户",
  createOrderCta: "创建订单",
  errOrderUnknownAfterConfirm: "订单可能已经保存,但详情暂时无法加载,请打开订单列表查看。",

  errPackageNotFound: "套装未找到或已停用,请重新选择。",
  errPackageRequired: "请选择套装。",
  errPackageNameRequired: "请填写套装名称。",
  errFulfillmentRequired: "请选择交付方式",
  errFulfillmentInvalid: "交付方式无效。",
  errPurchaseAmountInvalid: "消费金额无效。",
  errCustomerNotFoundReload: "找不到这个客户了,请刷新页面重新搜索。",
  errSalesRequired: "请选择销售员。",
  errSalesInvalidStaff: "销售员必须从本店在职员工名单中选择。",
  errPicInvalidStaff: "负责人必须从本店在职员工名单中选择。",
  partialOrderFailed: "客户已保存。订单失败 —— 请从客户列表重新操作。",
  partialOrderModuleOff:
    "客户已保存。订单功能还没有启用,所以订单没有创建 —— 现在重试也不会成功。请联系 SANCI 管理员," +
    "之后再从客户列表创建订单。",
  partialOrderUnknownStatus: "客户已保存。因网络中断,订单状态暂时无法确认 —— 请先查看订单列表,再决定是否重试。",
  partialOrderSummaryUnavailable: "订单已保存,但详情暂时无法重新加载,请打开订单列表确认。",
  partialFulfillmentDropped: "订单已保存,但交付方式暂时无法保存(服务器功能还没启用)。请联系 SANCI 管理员。",
  errOrderNotFoundNoAccess: "订单不存在,或您没有查看权限。",
  errOrderAlreadyCancelled: "这个订单已经取消,不能再修改了。",
  errOrderUpdateNoAccess: "订单无法修改 —— 您可能没有本店权限,或订单已被修改/取消。请刷新页面。",
  errOrderAlreadyCancelledBefore: "这个订单之前已经取消过了。",
  errOrderCancelNoAccess: "订单无法取消 —— 您可能没有本店权限,或订单已被修改。请刷新页面。",

  staffPageTitle: "员工 —— {name}",
  staffOtherBranchNote: "{name} 的其他分店。",
  staffCanEditNote: "您可以修改(查看和修改权限)。",
  staffViewOnlyNote: "只能查看。",
  noStaffRegistered: "本店还没有登记员工。",
  addStaffCta: "+ 新增员工",
  addStaffModalTitle: "新增员工",
  staffBranchAutoNote: "分店:{branch} —— 由本页面自动带入,不能选择。",
  staffNameHint: "创建订单时，销售员/负责人的选项里显示的就是这个姓名；它也会作为销售员姓名打印在 SO 单据上。",
  roleFieldHint: "这是员工在店里的职务,和系统登录权限是两回事。",
  staffCodeFieldLabel: "员工代码",
  staffCodeHint:
    "选填 —— 系统会按姓名首字母自动给出建议，可随意修改。它会成为该员工所服务客户的自动客户代码的" +
    "一部分（如 GH-BSD-AS/26/001 中的 AS）；暂时不需要可以留空。",
  editStaffModalTitle: "修改员工",
  confirmDeactivateStaff: "停用 {name}?历史记录会保留。",

  errCatalogStatusLoadFailed: "产品目录状态加载失败。",
  catalogNotOpenedMsg: "您的门店产品目录还没有开通 —— 请联系 SANCI。",
  errProductListLoadFailed: "产品列表加载失败。",
  produkViewDetailAria: "查看{name}详情",
  produkCardPriceNone: "尚未设定价格",
  produkCardPriceLoadFailed: "价格加载失败",
  produkLoadedMoreAnnounce: "已加入 {n} 个产品到列表。",
  errProductDetailLoadFailed: "产品详情加载失败。",
  produkDetailPriceLabel: "标准售价",
  produkDetailSizeLabel: "尺寸",
  produkDetailGalleryAria: "查看第 {n} / {total} 张照片",
  produkDetailShareBtn: "分享给客户(WhatsApp)",
  produkDetailShareText: "看看这个产品:{name}\n{url}",

  cabangOfferCardTitle: "SANCI 方案金额",
  cabangOfferEmpty: "这笔订单还没有 SANCI 方案金额。",
  cabangOfferReadOnlyNote: "只有 SANCI 管理员可以修改这个。",
  cabangOfferSetBtn: "填写方案金额",
  cabangOfferEditBtn: "修改方案金额",
  cabangOfferModalTitle: "SANCI 方案金额",
  cabangOfferModalDesc: "填写 SANCI 给这笔订单的方案金额。",
  cabangOfferFieldLabel: "方案金额（Rp）",
  cabangOfferSaveBtn: "保存方案金额",
  cabangOfferInvalid: "方案金额无效，请输入卢比数字，例如 1,500,000。",
  cabangOfferDpExceedsAmount: "订金不能超过方案金额。",
  cabangOfferNoPermissionEdit: "您的门店还没有填写 SANCI 方案金额的权限 —— 请联系 SANCI 管理员。",
  cabangOfferDiscountSectionTitle: "折扣、加成与现金折让",
  cabangOfferDiscountHint: "每笔折扣按顺序从基础金额开始计算。加成在所有折扣之后计算。现金折让最后扣除。",
  cabangOfferDiscountFieldLabel: "折扣 {n}（%）",
  cabangOfferDiscountAddBtn: "+ 添加折扣",
  cabangOfferDiscountRemoveBtn: "删除",
  cabangOfferDiscountMaxReached: "一条折扣链最多 6 笔折扣。",
  cabangOfferMarkupFieldLabel: "加成（%）",
  cabangOfferCashFieldLabel: "现金折让（Rp）",
  cabangOfferDiscountInvalid: "每笔折扣数值必须大于 0 且小于 100。",
  cabangOfferMarkupInvalid: "加成数值必须在 0 到 100 之间。",
  cabangOfferCashInvalid: "现金折让数值无效。",
  cabangOfferNoPermissionDiscount: "您的门店还没有设置折扣的权限 —— 请联系 SANCI 管理员。",

  // 方案计算器(/cabang/kalkulator)—— owner 2026-08-20 拍板。跟其他页面比
  // 有两个刻意的例外(page.tsx 和 FEATURES.md 都有说明):不设
  // can_discount/can_edit_offer 权限门槛,而且使用期间完全不写入数据库
  // (只存在浏览器 localStorage)。
  homeCalculator: "方案计算器",
  // Harga Normal(/cabang/harga,0021)—— owner 指定叫法,GLOSSARY.md。
  homePriceList: "标准售价",
  hargaPageTitle: "标准售价",
  hargaIntroNote:
    "本店每件产品的标准售价。留空 = 跟随 SANCI 基准价。这里的价格会自动填入计算器和订单明细的起始价 —— " +
    "使用时随时可以改。",
  hargaBaseLabel: "SANCI 基准价",
  hargaMyLabel: "本店标准售价(Rp)",
  hargaNoBase: "未设置",
  hargaFollowsBaseNote: "目前跟随 SANCI 基准价。",
  hargaResetCta: "改回跟随 SANCI",
  hargaSavedOk: "价格已保存。",
  hargaClearedOk: "已改回跟随 SANCI 基准价。",
  hargaSaveFailed: "价格保存失败,请重试。",
  hargaSaveUnsure: "没有收到服务器回复 —— 价格可能已保存。请先刷新页面确认,再决定要不要重试。",
  hargaInvalidInput: "请输入正确的 Rupiah 金额。",
  hargaModuleInactiveMsg: "标准售价功能还没有启用,所以价格暂时无法保存。请联系 SANCI 管理员。",
  calcIntroNote:
    "快速计算工具,可以直接在客户面前使用。这个页面上的任何内容都不会保存到系统。\"前往新建订单页面\"这个按钮" +
    "只是把数字带到新建订单表单 —— 要在那个表单里填好客户,再按那里的\"创建订单\",订单才真正保存。" +
    "这里的折扣链所有门店都能用,跟真实订单的折扣权限无关。",
  calcConvertCta: "前往新建订单页面",
  calcConvertScopeNote:
    "\"前往新建订单页面\"会把小计、折扣链和产品清单(名称、代码、数量)带到新建订单表单,这一步还不会保存" +
    "任何东西。如果您的门店有\"查看及设置 SANCI 方案\"权限,每件商品的单价也会一起带过去 —— 没有的话," +
    "商品仍会创建,只是不带价格。",

  // 计算器 → 新建订单的交接(见 lib/calculator-shared.ts 的 CalcHandoff,
  // 一次性,透过 localStorage)。
  calcHandoffBanner: "来自方案计算器:{n}件 · 小计{subtotal} · 最终金额{final}。",
  calcHandoffApplyCta: "使用这些数字",
  calcHandoffDismissCta: "忽略",
  calcHandoffScopeHint:
    "这会把计算器的小计填入\"客户在店内的消费总额\"。订单创建成功后,折扣链会自动应用到 SANCI 方案金额" +
    "(如果您的门店有折扣权限)。计算器里的产品清单(名称、代码、数量)也会一起加入这笔订单 —— 每件商品的单价" +
    "则要看您的门店是否有\"查看及设置 SANCI 方案\"权限。",
  calcHandoffAppliedOk: "方案计算器的折扣链已成功应用到这笔订单的 SANCI 方案金额。",
  calcHandoffAppliedFailed:
    "订单已经创建成功,但方案计算器的折扣链无法自动应用 —— 您的门店可能还没有折扣权限。请在这笔订单页面手动" +
    "输入,或联系 SANCI 管理员。",
  calcItemsAppliedPriceNote: "价格没有一起带过来 —— 您的门店还没有\"查看及设置 SANCI 方案\"权限。",
  formItemsAppliedOk: "已成功把 {n} 件产品加入这笔订单。",
  formItemsAppliedPartial:
    "{total} 件产品中,{n} 件已成功加入这笔订单;其余失败了 —— 请到订单明细查看,需要的话手动补上。",
  formItemsAppliedFailed: "订单已经创建成功,但选中的产品无法自动加入 —— 请到订单明细手动补上。",
} satisfies Shape;

export const cabang = { id, en, zh };
