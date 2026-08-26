/**
 * Teks khusus layar SANCI Admin (/admin/**) — dipakai staf kantor SANCI di
 * komputer. Baca aturan lengkap di common.ts, dan GLOSSARY.md untuk istilah.
 *
 * Nada bahasa: ringkas dan tepat. Pemakainya bekerja dengan layar ini
 * seharian, jadi label pendek lebih baik daripada kalimat penjelas.
 *
 * Kunci berawalan sesuai layar: partners (daftar & detail partner),
 * branch/staff (cabang & staf), package (package), user/reset (akun
 * login & kata sandi — lihat catatan keamanan di actions-users.ts, kata-kata
 * di sini SENGAJA tidak dilemahkan maknanya), product/catalog (katalog
 * produk SANCI), order/tab (pesanan partner & tab navigasi).
 */

const id = {
  // Nav (admin-nav.tsx) — signOut dipakai dari common.ts (m.common.signOut),
  // jangan didefinisikan ulang di sini.
  navOrders: "Pesanan Partner",
  navPartners: "Partner",
  navProducts: "Produk",
  navCustomers: "Pelanggan",
  navCalculator: "Kalkulator Penawaran",

  // ---- Kalkulator Penawaran (/admin/kalkulator) ----
  // Teks UI kalkulatornya sendiri hidup di common.ts (komponen bersama dua
  // area, lihat lib/kalkulator-client.tsx); di sini hanya teks khusus admin.
  // CTA konversi + hand-off SENGAJA punya key admin sendiri (bukan pinjam
  // slice cabang): teks cabang menyebut izin/alur khas cabang yang tidak
  // berlaku untuk admin (admin tidak pernah digerbang izin penawaran — 0014/
  // 0015 melepas lewat fn_is_admin).
  calcAdminIntroNote:
    "Alat hitung penawaran yang sama dengan sisi cabang — untuk tim SANCI tanpa berganti akun. Tidak ada yang " +
    "tersimpan ke sistem selagi dipakai; tekan \"Buat Pesanan\" di tab keranjang untuk membawa angka dan daftar " +
    "produknya ke form pesanan admin.",
  calcAdminConvertCta: "Buat Pesanan",
  calcAdminConvertScopeNote:
    "\"Buat Pesanan\" membawa subtotal, rantai diskon, dan daftar produk (nama, kode, jumlah, harga) ke form " +
    "pesanan admin — pilih partner dan cabang di sana seperti biasa.",

  // Hand-off Kalkulator → /admin/orders/baru (lihat lib/calculator-shared.ts:
  // CalcHandoff, sekali pakai lewat localStorage, key area admin).
  calcAdminHandoffBanner: "Dari Kalkulator Penawaran: {n} barang · Subtotal {subtotal} · Total Akhir {final}.",
  calcAdminHandoffApplyCta: "Gunakan angka ini",
  calcAdminHandoffDismissCta: "Abaikan",
  calcAdminHandoffScopeHint:
    "Ini akan mengisi \"Total belanja pelanggan\" dengan subtotal dari kalkulator. Setelah pesanan berhasil " +
    "dibuat, rantai diskonnya otomatis diterapkan ke Penawaran SANCI pesanan itu, dan daftar produk dari " +
    "kalkulator (nama, kode, jumlah, harga) otomatis ditambahkan ke Isi Pesanan.",
  calcAdminHandoffAppliedOk: "Rantai diskon dari Kalkulator Penawaran berhasil diterapkan ke Penawaran SANCI pesanan ini.",
  calcAdminHandoffAppliedFailed:
    "Pesanan berhasil dibuat, tapi rantai diskon dari Kalkulator Penawaran belum bisa otomatis diterapkan — atur " +
    "manual di bagian Penawaran SANCI halaman pesanan.",
  // Hasil penulisan baris "Isi Pesanan" form pesanan baru (fitur picker
  // 2026-08-24). SATU daftar + SATU jalur tulis: baris bisa berasal dari
  // picker produk maupun prefill hand-off Kalkulator — kunci lama
  // calcAdminItemsApplied{Ok,Partial,Failed} (yang menyebut "dari
  // kalkulator") dihapus bersama pemakainya; PriceNote TETAP karena
  // kalimatnya tidak menyebut kalkulator (dan untuk sesi admin seharusnya
  // mustahil terpicu — fn_is_admin melepas price guard, 0014).
  calcAdminItemsAppliedPriceNote: "Harga per barang tidak ikut tersimpan — cek dan lengkapi di Isi Pesanan.",
  formItemsAppliedOk: "{n} produk berhasil ditambahkan ke pesanan ini.",
  formItemsAppliedPartial:
    "{n} dari {total} produk berhasil ditambahkan ke pesanan ini; sisanya gagal — cek dan tambahkan manual di " +
    "Isi Pesanan.",
  formItemsAppliedFailed:
    "Pesanan berhasil dibuat, tapi produk yang dipilih belum bisa otomatis ditambahkan — tambahkan manual di " +
    "Isi Pesanan.",

  // ---- Dipakai lintas layar admin ----
  openBtn: "Buka",
  filterStatusAll: "Status: semua",
  filterAccessAll: "Akses: semua",
  accessViewOnly: "Lihat saja",
  accessViewEdit: "Lihat + edit",
  savedMsg: "Tersimpan.",
  tabOverview: "Ringkasan",
  tabBranches: "Cabang",
  tabPackages: "Package",
  tabUsers: "Akun",
  tabPermissions: "Hak Akses",
  tabHistory: "Riwayat",
  tabStaff: "Staf",
  tabActivity: "Aktivitas",

  // ---- Daftar Partner (app/admin/page.tsx) ----
  partnersSearchPlaceholder: "Cari partner / cabang / kode…",
  partnersColBrand: "Merek",
  partnersColAccess: "Akses",
  partnersAccessNotSet: "Belum diatur",
  partnersEmpty: "Belum ada partner.",
  partnersEmptyFiltered: 'Tidak ada partner yang cocok dengan "{q}".',
  partnersMatchedBranch: "Cabang cocok: {branch}",

  // ---- Tambah Partner (add-partner-button.tsx) ----
  partnerAddBtn: "+ Tambah Partner",
  partnerAddModalTitle: "Tambah Partner",
  partnerDupWarning:
    'Kemungkinan duplikat: {name}. Klik "Buat Partner" lagi untuk tetap melanjutkan, atau batal.',
  partnerNameFieldLabel: "Nama partner *",
  partnerNameHint:
    "Nama tampilan toko/perusahaan — muncul di semua layar admin dan jadi identitas toko yang " +
    "dilihat akun cabang di beranda aplikasinya.",
  partnerCodeFieldLabel: "Kode partner *",
  partnerCodeHint:
    "2–8 karakter, A–Z 0–9 dan tanda hubung — contoh: GH. Menjadi awalan setiap nomor pesanan " +
    "(mis. GH-BSD-260817-0001) dan usulan ID login; setelah partner diaktifkan, kode tidak bisa diubah lagi.",
  partnerCreateBtn: "Buat Partner",
  partnerCreateBtnDup: "Tetap Buat Partner",
  partnerCreatingBtn: "Menyimpan…",

  // ---- Ubah/Nonaktifkan/Hapus Partner (partner-actions.tsx) ----
  closeBtn: "Tutup",
  partnerEditModalTitle: "Ubah Partner",
  partnerCodeLockedHint: "Kode terkunci selama partner {status}.",
  partnerLogoFieldLabel: "Logo (opsional)",
  partnerLogoHint:
    "PNG, JPG, atau WebP. Maksimal 5 MB — gambar diperkecil otomatis sebelum dikirim. Biarkan " +
    "kosong kalau tidak ingin mengubah logo.",
  partnerSuspendBtn: "Tangguhkan",
  partnerReactivateBtn: "Aktifkan lagi",
  partnerEndPartnershipBtn: "Akhiri kerja sama",
  partnerDeleteDraftBtn: "Hapus draf",
  partnerActivateBtn: "Aktifkan partner",
  partnerActivateHint: "Tombol menyala setelah semua Syarat aktivasi di kartu sebelah tercentang.",
  partnerDeactivateModalTitle: "Akhiri kerja sama dengan {name}?",
  partnerDeactivateBody:
    "Status menjadi NONAKTIF dan partner ini keluar dari alur kerja harian. Semua cabang, staf, " +
    "dan riwayat tetap tersimpan, dan admin masih bisa memulihkannya nanti lewat tombol Aktifkan " +
    "lagi. Kalau hanya ingin jeda sementara, pakai Tangguhkan — bukan tombol ini.",
  partnerDeactivateFieldLabel: "Ketik {code} untuk konfirmasi",
  partnerDeactivateConfirmBtn: "Akhiri kerja sama",
  partnerDeleteModalTitle: "Hapus {name}?",
  partnerDeleteFieldLabel: "Ketik {code} untuk menghapus permanen",
  partnerDeletePermanentBtn: "Hapus permanen",
  partnerDeletingBtn: "Menghapus…",

  // ---- Server actions partner (actions.ts) ----
  partnerNameRequired: "Nama partner wajib diisi.",
  partnerCodeInvalid: "2–8 karakter, hanya A–Z, 0–9, dan tanda hubung.",
  partnerCodeTaken: "Kode partner {code} sudah dipakai.",
  partnerNotFound: "Partner tidak ditemukan.",
  partnerActivationRequirementsMissing: "Syarat aktivasi belum lengkap.",
  partnerStatusChangeFailed: "Tidak bisa mengubah status sekarang.",
  partnerDeleteDraftOnly: "Hanya partner berstatus DRAF yang bisa dihapus permanen.",
  partnerDeleteCodeMismatch: "Ketik {code} persis untuk konfirmasi.",
  partnerHasRelatedData: "Partner ini sudah punya data terkait — tidak bisa dihapus permanen.",
  partnerDeleteFailed: "Tidak bisa menghapus partner sekarang.",
  logoUploadFailed: "Logo gagal diunggah — data partner tetap tersimpan.",
  logoUrlUnrecognized: "Alamat logo tidak dikenali.",

  // ---- Detail Partner — kartu Ringkasan (partners/[id]/page.tsx) ----
  partnerInfoTitle: "Informasi Partner",
  activationRequirementsTitle: "Syarat aktivasi",
  gateIntro:
    "Selesaikan tiga langkah ini dulu; sesudah semuanya tercentang, tombol Aktifkan partner bisa " +
    "ditekan.",
  gateReqBranch: "Minimal 1 cabang aktif",
  gateReqUser: "Minimal 1 akun login aktif",
  gateReqAccess: "Hak akses sudah diatur",
  gateGoBranches: "Buka tab Cabang",
  gateGoUsers: "Buka tab Akun",
  gateGoAccess: "Buka tab Hak Akses",
  gateUnknownNote: "Belum bisa diperiksa sekarang — muat ulang halaman untuk memeriksa lagi.",
  gateStaffRecommended: "Minimal 1 staf — disarankan",
  gateStaffWhy:
    "Tidak menahan aktivasi, tapi dibutuhkan nanti saat cabang membuat pesanan (pilihan " +
    "Sales/PIC). Staf ditambahkan di halaman detail cabang.",
  branchesEmpty: "Belum ada cabang.",

  // ---- Tab Package (partners/[id]/page.tsx, add-package-button.tsx, package-actions.tsx) ----
  packageMigrationMsg: "Fitur package belum aktif — migrasi belum dijalankan.",
  packagesEmpty: "Belum ada package.",
  packageAddBtn: "+ Tambah Package",
  packageAddModalTitle: "Tambah Package",
  packageNameFieldLabel: "Nama package *",
  packageNameHint: "Nama inilah yang dilihat staf cabang saat memilih package di form pesanan baru.",
  packageCodeFieldLabel: "Kode package *",
  packageCodeHint: "Unik di dalam partner ini. Partner lain boleh pakai kode yang sama.",
  packageDescFieldLabel: "Deskripsi",
  packageCreateBtn: "Buat Package",
  packageEditModalTitle: "Ubah Package",
  packageNameRequired: "Nama package wajib diisi.",
  packageCodeTaken: "Kode package sudah dipakai.",
  // Isi Package (migrasi 0012)
  packageItemsTitle: "Isi Package",
  packageItemsLink: "Isi Package",
  packageItemsEmpty: "Belum ada produk di package ini.",
  packageItemsAdd: "Tambah Produk",
  packageItemsSearchPlaceholder: "Cari nama atau kode produk…",
  packageItemsNoMatch: "Tidak ada produk yang cocok.",
  packageItemsAllAdded: "Semua produk aktif sudah ada di package ini.",
  packageItemRemove: "Hapus",
  packageItemRemoveConfirm: "Hapus {name} dari package ini?",
  packageItemQtyInvalid: "Jumlah harus angka bulat lebih dari 0.",
  packageItemDuplicate: "Produk ini sudah ada di package. Ubah jumlahnya di baris yang sudah ada.",
  packageItemMigrationMsg: "Fitur isi package belum aktif — migrasi 0012 belum dijalankan.",
  packageItemCatalogEmpty: "Katalog produk masih kosong — tambahkan produk dulu di menu Produk.",

  // ---- Tab Cabang (partners/[id]/page.tsx) ----
  colAddress: "Alamat",

  // ---- Tambah Cabang (add-branch-button.tsx) ----
  branchAddBtn: "+ Tambah Cabang",
  branchAddModalTitle: "Tambah Cabang",
  branchNameFieldLabel: "Nama cabang *",
  branchNameHint:
    "Muncul di pilihan cabang dan daftar pesanan di layar admin, dan dilihat staf cabang itu " +
    "sendiri di aplikasinya.",
  branchCodeFieldLabel: "Kode cabang *",
  branchCodeHint:
    "Kode singkat cabang — menjadi bagian setiap nomor pesanan dan kode pelanggan cabang ini " +
    "(mis. BSD pada GH-BSD-260817-0001). Unik di dalam partner ini; partner lain boleh pakai kode yang sama.",
  branchAddressFieldLabel: "Alamat lengkap *",
  branchCreateBtn: "Buat Cabang",
  branchEditModalTitle: "Ubah Cabang",
  branchSuspendBtn: "Tangguhkan",
  branchReactivateBtn: "Aktifkan lagi",
  branchNameRequired: "Nama cabang wajib diisi.",
  branchAddressRequired: "Alamat lengkap wajib diisi.",
  branchCodeTaken: "Kode cabang {code} sudah ada di partner ini.",
  branchNotFound: "Cabang tidak ditemukan.",

  // ---- Tab Akun (partners/[id]/page.tsx) ----
  usersServiceKeyMissing:
    "Pembuatan akun login dan penggantian kata sandi belum aktif di server ini. Minta petugas " +
    "teknis mengisi variabel lingkungan SUPABASE_SERVICE_ROLE_KEY di Vercel; sesudah itu tombol " +
    "Tambah Akun dan Atur Ulang Kata Sandi muncul sendiri di halaman ini. Menonaktifkan dan " +
    "mengaktifkan kembali akun yang sudah ada tetap bisa dilakukan sekarang.",
  usersNoActiveBranch:
    "Belum ada cabang aktif. Buat dan aktifkan cabangnya dulu di tab Cabang — setiap akun login " +
    "harus terikat ke satu cabang.",
  usersEmpty: "Belum ada akun login.",
  usersFootnote:
    "Satu cabang memakai satu akun bersama; nama penjual dan PIC tetap dipilih dari daftar staf " +
    "saat membuat pesanan. ID login tidak ditampilkan di daftar ini — catat saat akun " +
    "dibuat. Kata sandinya ditentukan tokonya sendiri dan diketikkan admin saat akun dibuat; " +
    "sesudah tersimpan, sistem tidak bisa menampilkannya lagi kepada siapa pun. Kalau tokonya lupa, " +
    "tekan Atur Ulang Kata Sandi pada barisnya untuk menetapkan kata sandi baru — jangan membuat " +
    "akun kedua untuk cabang yang sama.",
  userToggleDeactivateBtn: "Nonaktifkan",
  userToggleReactivateBtn: "Aktifkan lagi",
  userToggleFailed: "Tidak bisa mengubah status akun sekarang.",
  userNotFound: "Akun tidak ditemukan.",

  // ---- Tambah Akun (add-user-button.tsx) — jaga makna, jangan dilemahkan ----
  userAddBtn: "+ Tambah Akun",
  userAddModalTitle: "Tambah Akun Login",
  userAddInfoBanner:
    "Satu cabang memakai satu akun bersama. Nama penjual dan PIC tetap dipilih dari daftar staf " +
    "saat membuat pesanan — bukan dari akun ini. Kata sandinya ditentukan tokonya sendiri dan Anda " +
    "yang mengetikkannya di sini; setelah disimpan, sistem tidak bisa menampilkannya lagi kepada " +
    "siapa pun. Kalau nanti tokonya lupa, pakai tombol Atur Ulang Kata Sandi di daftar Akun untuk " +
    "menetapkan kata sandi baru.",
  userNameFieldLabel: "Nama *",
  userNameHint:
    "Hanya label yang tampil di daftar akun, mis. nama toko atau cabangnya — bukan dipakai untuk masuk.",
  userBranchFieldLabel: "Cabang *",
  userEmailFieldLabel: "ID login *",
  userEmailHint:
    "Sudah diusulkan otomatis dari kode partner dan kode cabang — biarkan saja, boleh juga " +
    "diubah. Bentuknya seperti email, tapi ini bukan email sungguhan dan tidak menerima surat; " +
    "toko mengetik ID ini di kotak Email saat masuk.",
  userPasswordFieldLabel: "Kata sandi pilihan toko *",
  userPasswordHint:
    "Ketik kata sandi yang diminta tokonya sendiri (biasanya dikabari lewat WhatsApp) — bukan kata " +
    "sandi buatan sistem. Minimal {min} karakter. Sengaja tidak disembunyikan supaya Anda bisa " +
    "memastikan ketikannya benar sebelum disimpan.",
  userCreateBtn: "Buat Akun",
  userCreatingBtn: "Membuat…",
  userCredentialTitle: "Akun login berhasil dibuat",
  userCredentialWarning:
    "Kata sandi di bawah hanya terlihat SEKARANG, karena Anda sendiri yang barusan mengetikkannya. " +
    "Sistem tidak menyimpan salinan yang bisa dibaca ulang, jadi setelah kotak ini ditutup tidak " +
    "ada seorang pun — termasuk SANCI — yang bisa melihatnya lagi. Pastikan tokonya sudah pegang " +
    "kata sandi ini sebelum menutup kotak ini.",
  userCredentialEmailLabel: "ID login",
  userCredentialPasswordLabel: "Kata sandi",
  userCredentialFootnote:
    "ID login ini bentuknya seperti email tapi tidak menerima surat — saat masuk, toko " +
    "mengetiknya di kotak Email. Kalau tokonya lupa " +
    "kata sandi, jangan membuat akun baru: buka tab Akun, lalu tekan Atur Ulang Kata Sandi pada " +
    "barisnya untuk menetapkan kata sandi baru.",
  copyCredentialsBtn: "Salin email & kata sandi",
  copyDoneBtn: "Saya sudah mencatat — Tutup",
  copySuccessMsg: "Tersalin. Tempel di WhatsApp kepala toko sekarang.",
  copyFailMsg: "Tidak bisa menyalin otomatis di perangkat ini — catat manual dari layar.",
  // Disamakan persis dengan PESAN_AKUN.buatTidakPasti di actions-users.ts.
  userCreateUnconfirmedMsg:
    "Koneksi ke server terputus sebelum jawaban sampai, jadi belum bisa dipastikan akun login " +
    "sudah dibuat atau belum. JANGAN langsung membuat ulang. Muat ulang halaman ini dan lihat " +
    "daftar Akun: kalau akun belum muncul tetapi email tadi ditolak karena sudah dipakai, hubungi " +
    "petugas teknis dan sebutkan email tersebut.",

  // ---- Atur Ulang Kata Sandi (reset-password-button.tsx) — jaga makna ----
  resetPasswordBtn: "Atur Ulang Kata Sandi",
  resetPasswordModalTitle: "Atur Ulang Kata Sandi",
  resetPasswordWarningBanner:
    "Kata sandi lama akun {user}{branch} akan langsung berhenti berlaku begitu disimpan. Pastikan " +
    "Anda bisa segera mengirim kata sandi barunya ke kepala toko — kalau tidak, mereka tidak bisa " +
    "masuk. Perangkat yang saat ini sudah terbuka bisa saja tetap bisa dipakai sampai keluar sendiri.",
  resetPasswordInfoBanner:
    "Kata sandi yang lama tidak bisa dilihat oleh siapa pun, termasuk SANCI — sistem hanya " +
    "menyimpan sidik jarinya, bukan kata sandinya. Karena itu untuk toko yang lupa, yang bisa " +
    "dilakukan adalah menetapkan kata sandi baru di sini. Tanyakan dulu ke tokonya kata sandi apa " +
    "yang mereka mau, lalu ketikkan di bawah.",
  resetPasswordFieldLabel: "Kata sandi baru pilihan toko *",
  resetPasswordHint:
    "Minimal {min} karakter. Sengaja tidak disembunyikan supaya Anda bisa memastikan ketikannya " +
    "benar sebelum disimpan.",
  resetPasswordRepeatFieldLabel: "Ketik ulang kata sandi baru *",
  resetPasswordRepeatHint:
    "Harus sama persis dengan kotak di atas. Satu huruf salah ketik membuat tokonya tidak bisa " +
    "masuk sama sekali.",
  resetPasswordMismatchErr: "Kedua kotak belum sama persis. Periksa lagi — huruf besar dan kecil dihitung.",
  resetPasswordSaveBtn: "Simpan Kata Sandi Baru",
  resetPasswordDoneTitle: "Kata sandi sudah diperbarui",
  resetPasswordDoneWarning:
    "Kirimkan kata sandi baru ini ke kepala toko sekarang juga. Kata sandi lamanya sudah tidak " +
    "berlaku, jadi sebelum kata sandi baru sampai, mereka tidak bisa masuk. Setelah kotak ini " +
    "ditutup, sistem tidak bisa menampilkannya lagi kepada siapa pun.",
  resetPasswordDoneNewLabel: "Kata sandi baru",
  resetPasswordCopyBtn: "Salin kata sandi",
  resetPasswordCloseBtn: "Sudah saya kirim — Tutup",
  // Disamakan persis dengan PESAN_RESET.tidakPasti di actions-users.ts.
  resetPasswordUnconfirmedMsg:
    "Koneksi ke server terputus sebelum jawaban sampai, jadi belum bisa dipastikan kata sandinya " +
    "sudah berganti atau belum. Coba lagi dengan kata sandi baru yang SAMA — mengulang dengan kata " +
    "sandi yang sama tidak menimbulkan masalah. Jangan memberi tahu tokonya sebelum layar ini " +
    "menyatakan berhasil.",

  // ---- Server actions akun login (actions-users.ts) — jaga makna, jangan dilemahkan ----
  userNotAuthorized: "Anda tidak berwenang membuat akun login.",
  userPermCheckFailed: "Tidak bisa memastikan hak akses Anda sekarang. Muat ulang halaman lalu coba lagi.",
  userServiceKeyMissingCreate:
    "Pembuatan akun login belum bisa dijalankan karena pengaturan server belum lengkap. Minta " +
    "petugas teknis mengisi variabel lingkungan SUPABASE_SERVICE_ROLE_KEY di Vercel, lalu buka " +
    "halaman ini lagi. Isian Anda tidak ada yang tersimpan.",
  userEmailTaken:
    "ID login ini sudah dipakai. Gunakan yang lain. Kalau menurut Anda ID ini seharusnya belum " +
    "terpakai, hubungi petugas teknis — jangan dipaksa dibuat ulang.",
  userWeakPassword:
    "Kata sandi itu ditolak sistem login karena belum memenuhi syarat keamanan. Minta tokonya " +
    "memilih kata sandi yang lebih panjang dan mencampur huruf besar, huruf kecil, serta angka.",
  userEmailRejected: "Sistem login menolak ID login ini. Periksa penulisannya, lalu coba lagi.",
  userCreateFailedGeneric: "Tidak bisa membuat akun login sekarang. Coba lagi sebentar lagi.",
  userCreateCleanRollback:
    "Akun login GAGAL dibuat dan tidak ada yang tertinggal di sistem. Silakan coba lagi dengan " +
    "email yang sama.",
  // Fungsi pesanSetengahJadi(email) — {email} diganti alamat email yang gagal terhubung.
  userHalfCreated:
    "Akun login untuk {email} sudah dibuat di sistem login, TETAPI belum terhubung ke partner ini, " +
    "jadi belum bisa dipakai untuk masuk. Jangan membuat ulang dengan email yang sama. Catat email " +
    "ini dan hubungi petugas teknis.",
  userNameRequiredField: "Nama wajib diisi.",
  userEmailRequiredField: "ID login wajib diisi.",
  userEmailFormatInvalid: "Bentuk ID login harus seperti alamat email. Contoh: gh-bsd@sanci.com",
  userPasswordRequiredField: "Kata sandi dari toko wajib diisi.",
  userPasswordTooShort: "Kata sandi minimal {min} karakter. Minta tokonya memilih kata sandi yang lebih panjang.",
  userBranchRequiredField: "Cabang wajib dipilih.",
  userBranchNotFoundOnPartner: "Cabang tidak ditemukan pada partner ini.",
  userBranchInactive: "Cabang itu sedang tidak aktif. Aktifkan cabangnya dulu, baru buat akunnya.",

  resetServiceKeyMissing:
    "Penggantian kata sandi belum bisa dijalankan karena pengaturan server belum lengkap. Minta " +
    "petugas teknis mengisi variabel lingkungan SUPABASE_SERVICE_ROLE_KEY di Vercel, lalu buka " +
    "halaman ini lagi. Kata sandi lama masih berlaku seperti biasa.",
  resetAccountNotFound: "Akun itu tidak ditemukan. Muat ulang halaman ini, lalu coba lagi.",
  resetAccountIncomplete:
    "Akun ini belum terhubung ke sistem login, jadi kata sandinya tidak bisa diganti dari sini. " +
    "Hubungi petugas teknis.",
  resetGenericFail: "Tidak bisa mengganti kata sandi sekarang. Kata sandi lama masih berlaku. Coba lagi sebentar lagi.",
  resetPasswordRequiredField: "Kata sandi baru wajib diisi.",
  resetPasswordTooShortField: "Kata sandi baru minimal {min} karakter.",

  // ---- Hak Akses (partners/[id]/page.tsx, permissions-form.tsx) ----
  catalogMigrationMsg: "Fitur katalog produk belum aktif — migrasi belum dijalankan.",
  permVisibilityTitle: "Visibilitas Cabang",
  permVisibilityDesc: "Hanya SANCI Admin yang dapat mengubah pengaturan ini. Berlaku untuk semua akun login {partner}.",
  permNotConfiguredWarning: "Belum diatur — saat ini berlaku: Hanya cabang sendiri (bawaan).",
  permOwnBranchDesc: "Setiap cabang hanya melihat cabangnya sendiri.",
  permAllBranchesLabel: "Semua cabang sesama partner",
  permAllBranchesDesc: "Semua cabang {partner} bisa saling melihat. Tidak pernah partner lain.",
  permEditTitle: "Akses ke cabang lain",
  permViewOnlyDesc: "Cabang lain hanya bisa dilihat.",
  permViewEditDesc: "Staf cabang lain juga bisa dikelola.",
  permSaveBtn: "Simpan hak akses",
  permFootnote:
    "Aturan cabang terpilih (misal hanya Jakarta A ↔ Jakarta B) disiapkan untuk fase berikutnya — " +
    "skema data sudah mendukung, layar ini belum.",
  visibilityScopeInvalid: "Visibilitas tidak valid.",
  editScopeInvalid: "Cakupan edit tidak valid.",
  permSaveFailed: "Tidak bisa menyimpan hak akses sekarang.",

  // ---- Izin Penawaran SANCI per partner (offer-permissions-form.tsx, migrasi 0014) ----
  offerPermTitle: "Izin Penawaran SANCI",
  offerPermDesc:
    "Mengatur apakah staf cabang {partner} boleh melihat/mengisi Penawaran SANCI pada pesanan CABANG MEREKA SENDIRI. " +
    "Cabang tetap tidak pernah melihat penawaran partner lain, apa pun pengaturan ini.",
  offerPermViewLabel: "Boleh melihat Penawaran SANCI",
  offerPermViewDesc: "Staf cabang bisa melihat nilai penawaran, uang muka (DP), dan kondisi pembayaran pada pesanan cabang mereka sendiri.",
  offerPermEditLabel: "Boleh mengisi/mengubah Penawaran SANCI",
  offerPermEditDesc:
    "Staf cabang bisa mengisi/mengubah nilai penawaran, uang muka, kondisi pembayaran, dan harga per baris pada pesanan cabang mereka sendiri. " +
    "Menghapus penawaran tetap khusus SANCI Admin.",
  offerPermSaveBtn: "Simpan izin penawaran",
  offerPermSaveFailed: "Tidak bisa menyimpan izin penawaran sekarang.",

  // ---- Katalog Produk SANCI per partner (catalog-access-form.tsx) ----
  catalogAccessTitle: "Katalog Produk SANCI",
  catalogAccessDesc: "Jika terbuka, semua cabang partner ini bisa melihat katalog produk SANCI.",
  catalogOpenLabel: "Terbuka",
  catalogClosedLabel: "Tertutup",
  catalogSaveFailed: "Tidak bisa menyimpan pengaturan katalog sekarang.",

  // ---- Detail Cabang (branches/[branchId]/page.tsx) ----
  branchInfoColCode: "Kode cabang",
  branchInfoColAddress: "Alamat lengkap",
  staffInfoBanner: "Cabang: {partner} · {branch} — otomatis dari halaman ini, tidak bisa dipilih.",
  staffEmpty: "Belum ada staf terdaftar di cabang ini.",
  staffNoPhone: "tanpa telepon",
  activityEmpty: "Belum ada aktivitas tercatat.",
  auditFootnote: "Catatan audit hanya bertambah. Tidak ada yang bisa mengubah atau menghapusnya dari aplikasi.",

  // ---- Tambah Staf (add-staff-button.tsx) ----
  staffAddBtn: "+ Tambah Staf",
  staffAddModalTitle: "Tambah Staf",
  staffNameFieldLabel: "Nama lengkap *",
  staffNameHint:
    "Nama ini yang muncul di pilihan Sales/PIC saat membuat pesanan, dan tercetak sebagai " +
    "Nama Sales di dokumen SO.",
  staffRoleFieldLabel: "Peran *",
  staffRoleHint: "Peran bisnis di toko — terpisah dari hak akses login sistem.",
  staffCodeFieldLabel: "Kode Staf",
  staffCodeHint:
    "Opsional — diusulkan otomatis dari inisial nama, bebas diubah. Menjadi bagian kode pelanggan " +
    "otomatis untuk pelanggan yang dilayani staf ini (mis. AS pada GH-BSD-AS/26/001); kosongkan kalau belum perlu.",
  staffCodeInvalidFormat: "Kode staf hanya boleh huruf besar/angka, maksimal 10 karakter.",
  staffCodeTaken: "Kode staf ini sudah dipakai staf lain di partner yang sama.",
  staffCreateBtn: "Tambah Staf",
  staffRoleSales: "Sales",
  staffRoleReception: "Resepsionis / CS",
  staffRoleManager: "Manajer",
  staffRoleOther: "Lainnya",

  // ---- Ubah/Pindahkan Staf (staff-actions.tsx) ----
  staffEditModalTitle: "Ubah Staf",
  staffTransferModalTitle: "Pindahkan {name}",
  staffTransferDesc: "Pemindahan mengakhiri penugasan lama dan memulai yang baru — riwayat tidak pernah ditulis ulang.",
  staffTransferBranchFieldLabel: "Cabang tujuan *",
  staffTransferBtn: "Pindahkan",
  staffTransferringBtn: "Memindahkan…",
  staffDeactivateBtn: "Nonaktifkan",
  staffDeactivateConfirm: "Nonaktifkan {name}? Riwayat tetap tersimpan.",
  staffFullNameRequired: "Nama lengkap wajib diisi.",
  staffDeactivateFailed: "Tidak bisa menonaktifkan sekarang.",
  staffAssignmentSavedFailed: "Tidak bisa menyimpan peran sekarang.",
  staffTransferActiveNotFound: "Penugasan aktif tidak ditemukan.",
  staffTransferFailed: "Tidak bisa memindahkan sekarang.",
  staffAssignmentPartialFail: "Staf tersimpan tetapi penugasan cabang gagal. Hubungi dukungan teknis.",

  // ---- Katalog Produk SANCI (produk/page.tsx dan seterusnya) ----
  produkSearchPlaceholder: "Cari nama / kode produk…",
  filterStockAll: "Stok: semua",
  filterCategoryAll: "Kategori: semua",
  produkEmpty: "Belum ada produk.",
  produkEmptyFiltered: 'Tidak ada produk yang cocok dengan "{q}".',
  produkEmptyFilteredCategory: "Tidak ada produk di kategori ini.",
  produkFootnote: "Produk nonaktif tidak terlihat oleh partner.",
  productNoPhoto: "Tanpa foto",
  productStockFieldLabel: "Status stok",

  // ---- Tambah Produk (add-product-button.tsx) ----
  productAddBtn: "+ Tambah Produk",
  productAddModalTitle: "Tambah Produk",
  productNameFieldLabel: "Nama produk *",
  productCodeFieldLabel: "Kode",
  productCategoryFieldLabel: "Kategori",
  productStockStatusFieldLabel: "Status Stok",
  // ── Harga Dasar SANCI (0021) — kolom di modal Tambah/Ubah Produk. ──
  // Grid /admin/produk TETAP bebas harga (keputusan rencana 0021 — layar
  // jelajah bersih); modal inilah permukaan kelolanya. Jangan dicampur
  // dengan "Penawaran SANCI" (nilai penawaran TINGKAT PESANAN, 0013).
  productBasePriceFieldLabel: "Harga Dasar SANCI (Rp)",
  productBasePriceHint:
    "Opsional. Titik awal harga untuk semua partner — tiap partner bisa menimpanya dengan Harga Normal " +
    "tokonya sendiri. Kosongkan lalu simpan untuk menghapus.",
  productBasePriceLoadFailed:
    "Harga dasar gagal dimuat — kolom dinonaktifkan supaya tidak menghapus harga tanpa sengaja. Tutup lalu buka lagi untuk mencoba ulang.",
  productBasePriceSaveFailed:
    "Produk tersimpan, tapi Harga Dasar SANCI GAGAL tersimpan. Buka Ubah Produk lalu isi lagi.",
  productBasePriceInvalid: "Isi angka rupiah yang benar.",
  productPhotoFieldLabel: "Foto (opsional)",
  productPhotoHint: "PNG, JPG, atau WebP. Maksimal 5 MB — gambar diperkecil otomatis sebelum dikirim.",
  productPhotoHintKeep: "PNG, JPG, atau WebP. Maksimal 5 MB. Biarkan kosong kalau tidak ingin mengubah foto.",
  productCreateBtn: "Buat Produk",
  productEditModalTitle: "Ubah Produk",
  productNameRequired: "Nama produk wajib diisi.",
  productStockStatusInvalid: "Status stok tidak valid.",
  productCodeTaken: "Kode produk sudah dipakai.",
  productStockChangeFailed: "Tidak bisa mengubah status stok sekarang.",
  productStatusChangeFailed: "Tidak bisa mengubah status produk sekarang.",
  productStatusInvalid: "Status produk tidak valid.",
  photoUploadFailed: "Foto gagal diunggah — data produk tetap tersimpan.",
  photoUrlUnrecognized: "Alamat foto tidak dikenali.",
  catalogSettingInvalid: "Tidak bisa menyimpan pengaturan katalog sekarang.",

  // ---- Pesanan Partner — daftar (orders/page.tsx) ----
  ordersFeatureOff: "Fitur pesanan belum aktif — migration database belum dijalankan.",
  ordersSearchPlaceholder: "Cari nomor pesanan / nama customer / telepon…",
  filterFulfillmentAll: "Jalur: semua",
  ordersEmpty: "Belum ada pesanan.",
  ordersEmptyFiltered: 'Tidak ada pesanan yang cocok dengan "{q}".',
  colCustomer: "Customer",
  colSales: "Sales",
  colFulfillment: "Jalur",
  // GLOSSARY.md: PIC tetap "PIC" di Indonesia/Inggris, jadi "负责人" di 中文.
  picLabel: "PIC",
  ordersShowingCount: "Menampilkan {n} terbaru{cap}.",
  ordersShowingCap: " (maks. 50)",

  // ---- Detail Pesanan (orders/[orderId]/page.tsx) ----
  orderFeatureOff: "Modul Pesanan belum aktif di database (migrasi belum dijalankan).",
  orderDetailLoadFailed: "Gagal memuat detail pesanan.",
  orderOverline: "PESANAN PARTNER",
  orderBranchPrefix: "Cabang {branch}",
  branchUnknown: "tidak ditemukan",
  partnerUnknown: "Partner tidak ditemukan",
  customerCardTitle: "Customer",
  customerUnknown: "Pelanggan tidak diketahui",
  orderCardTitle: "Pesanan",
  packageCodeInactive: " (kode {code}, nonaktif)",
  packageCodeActive: " (kode {code})",
  personInactiveSuffix: " (nonaktif)",
  fulfillmentMigrationOff: "Migrasi belum dijalankan",
  fulfillmentReported: "Belum dilaporkan",
  viewInvoiceBtn: "Lihat Invoice",
  invoiceNotLoadable: "Invoice belum bisa dimuat.",
  invoiceNotUploaded: "Belum diunggah",
  createdAtServerTimeSuffix: " · waktu server",
  customerArrivedLabel: "Pelanggan tiba",
  markArrivedBtn: "Tandai Pelanggan Sudah Tiba",
  orderCancelledTitle: "Pesanan dibatalkan",
  cancelInfoMigrationOff: "Info pembatalan belum tersedia (migrasi database belum dijalankan).",
  cancelReasonPrefix: "Alasan: ",
  cancelTimePrefix: "Waktu: ",
  internalNoteCardTitle: "Catatan Internal SANCI",
  internalNoteVisibilityWarning: "Hanya terlihat oleh SANCI — partner tidak bisa melihat bagian ini.",
  internalNoteFeatureOff: "Fitur catatan internal belum aktif — migrasi database belum dijalankan.",
  internalNoteEmpty: "Belum ada catatan internal untuk pesanan ini.",
  internalNoteFootnote:
    "Catatan internal hanya bertambah. Salah tulis dikoreksi dengan menambah catatan baru, bukan mengubah yang lama.",
  orderActivityEmpty: "Belum ada aktivitas tercatat untuk pesanan ini.",
  attributionDiffLabel: "Cabang: {before} → {after}",
  reasonDiffPrefix: "Alasan: ",

  // ---- Koreksi Atribusi (correct-attribution-button.tsx) ----
  correctAttributionBtn: "Koreksi Cabang",
  correctAttributionModalTitle: "Koreksi Cabang Pesanan",
  correctAttributionDesc:
    "Cabang saat ini: {branch}. Hanya cabang lain milik partner yang sama yang bisa dipilih — " +
    "partner tidak bisa diubah lewat layar ini. Setiap koreksi tercatat di Activity beserta alasannya.",
  correctAttributionNoOtherBranches: "Tidak ada cabang lain yang aktif di partner ini.",
  correctAttributionBranchFieldLabel: "Cabang tujuan *",
  correctAttributionBranchPlaceholder: "— Pilih cabang —",
  correctAttributionReasonFieldLabel: "Alasan koreksi *",
  correctAttributionReasonPlaceholder: "Contoh: salah pilih cabang saat input pesanan...",
  correctAttributionSaveBtn: "Simpan Koreksi",
  correctAttributionBranchRequired: "Pilih cabang tujuan.",
  correctAttributionReasonRequired: "Alasan koreksi wajib diisi.",
  correctAttributionReasonTooLong: "Alasan terlalu panjang (maksimal 500 karakter).",
  correctAttributionMigrationOff: "Fitur koreksi atribusi belum aktif — migrasi belum dijalankan.",
  correctAttributionGenericFail: "Tidak bisa mengoreksi atribusi sekarang. Periksa cabang tujuan lalu coba lagi.",

  // ---- Tandai Pelanggan Sudah Tiba (mark-arrived-button.tsx) ----
  markArrivedModalTitle: "Tandai Pelanggan Sudah Tiba",
  markArrivedDesc:
    "Pesanan {orderNumber} atas nama {customer} akan ditandai pelanggan sudah tiba di SANCI. Waktu " +
    "dan petugas yang menandai tercatat otomatis di Activity dan tidak bisa diubah dari layar ini.",
  markArrivedConfirmBtn: "Ya, Sudah Tiba",
  markArrivedMarkingBtn: "Menandai…",
  fulfillmentMigrationOffOrder: "Fitur jalur pesanan belum aktif — migrasi database belum dijalankan.",
  orderNotFound: "Pesanan tidak ditemukan.",
  markArrivedWrongFulfillment: "Hanya pesanan jalur Kunjungan Showroom yang bisa ditandai tiba.",
  markArrivedFailed: "Tidak bisa menandai kedatangan sekarang. Coba lagi.",

  // ---- Catatan Internal — form (internal-note-form.tsx) ----
  internalNoteFieldLabel: "Catatan baru",
  internalNotePlaceholder: "Contoh: Invoice 2,5jt → penawaran diskon dekorasi diberikan ke pelanggan.",
  internalNoteSaveBtn: "Simpan Catatan",
  internalNoteEmptyErr: "Catatan tidak boleh kosong.",
  internalNoteTooLong: "Catatan terlalu panjang (maksimal 2000 karakter).",
  internalNoteFeatureOffAction: "Fitur catatan internal belum aktif — migrasi belum dijalankan.",

  // ---- Penawaran SANCI (0013 — order-offer-form.tsx + halaman detail) ----
  // Kalimat visibilitas di bawah SENGAJA menyebut "lewat API", bukan cuma
  // "tidak terlihat": yang menutupnya adalah RLS, dan admin perlu tahu bahwa
  // jaminannya sungguhan — bukan sekadar layar yang disembunyikan.
  orderOfferCardTitle: "Penawaran SANCI",
  orderOfferVisibilityWarning:
    "Hanya terlihat oleh SANCI. Partner dan cabang tidak bisa melihat angka ini sama sekali — " +
    "bukan hanya disembunyikan di layar, tapi ditolak oleh basis data.",
  orderOfferFeatureOff: "Fitur penawaran SANCI belum aktif — migrasi database belum dijalankan.",
  orderOfferEmpty: "Belum ada penawaran SANCI untuk pesanan ini.",
  orderOfferFootnote:
    "Angka ini keputusan SANCI untuk pesanan ini saja, bukan harga produk. Setiap pengisian, " +
    "perubahan, dan penghapusan tercatat di Activity beserta nilai lama dan barunya.",
  orderOfferSetBtn: "Isi Penawaran",
  orderOfferEditBtn: "Ubah Penawaran",
  orderOfferModalTitle: "Penawaran SANCI",
  orderOfferModalDesc:
    "Isi nilai penawaran yang SANCI berikan untuk pesanan ini. Kosongkan artinya belum diputuskan; " +
    "kalau SANCI memutuskan tidak memberi penawaran, pakai tombol Hapus Penawaran — bukan angka 0 " +
    "(0 berarti penawaran senilai nol Rupiah).",
  orderOfferFieldLabel: "Nilai penawaran (Rp)",
  orderOfferPlaceholder: "Contoh: 1.500.000",
  orderOfferSaveBtn: "Simpan Penawaran",
  orderOfferClearBtn: "Hapus Penawaran",
  orderOfferClearingBtn: "Menghapus…",
  orderOfferClearConfirm:
    "Hapus nilai penawaran untuk pesanan ini? Nilai terakhirnya tetap tercatat di Activity.",
  orderOfferInvalid: "Nilai penawaran tidak valid. Isi angka Rupiah, contoh: 1.500.000.",
  orderOfferFeatureOffAction: "Fitur penawaran SANCI belum aktif — migrasi belum dijalankan.",
  orderOfferDpFieldLabel: "Uang Muka (DP, Rp)",
  orderOfferPaymentConditionFieldLabel: "Kondisi Pembayaran",
  orderOfferPaymentConditionPlaceholder: "Contoh: Full payment, DP 50%",
  orderOfferRemainingLabel: "Sisa Bayar",
  orderOfferDpExceedsAmount: "Uang muka tidak boleh melebihi nilai penawaran.",
  orderOfferNoPermissionView: "Partner ini belum diizinkan melihat Penawaran SANCI cabangnya — atur di tab Hak Akses.",
  orderOfferNoPermissionEdit: "Partner ini belum diizinkan mengisi Penawaran SANCI dari cabang.",

  // ---- Rantai diskon (0015 — order-offer-form.tsx) ----
  // "Diskon" DIIZINKAN di sini (GLOSSARY.md §"订单层级的折扣链计算") — beda
  // dari lineDiscount (common.ts) yang sengaja menghindari kata itu.
  orderOfferDiscountSectionTitle: "Diskon, Markup & Potongan Tunai",
  orderOfferDiscountHint:
    "Setiap diskon dihitung berurutan dari nilai dasar (8% lalu 10% = ×0,92×0,90, BUKAN 18%). " +
    "Markup diterapkan setelah semua diskon. Potongan tunai dikurangi paling akhir — dipakai " +
    "untuk pembulatan angka atau kesepakatan tunai.",
  orderOfferDiscountFieldLabel: "Diskon {n} (%)",
  orderOfferDiscountAddBtn: "+ Tambah Diskon",
  orderOfferDiscountRemoveBtn: "Hapus",
  orderOfferDiscountMaxReached: "Maksimal 6 diskon dalam satu rantai.",
  orderOfferMarkupFieldLabel: "Markup (%)",
  orderOfferCashFieldLabel: "Potongan Tunai (Rp)",
  orderOfferFinalLiveLabel: "Harga Akhir (perkiraan)",
  orderOfferFinalLiveHint: "Angka ini dihitung ulang di layar saat mengetik — nilai yang tersimpan tetap dihitung server.",
  orderOfferDiscountInvalid: "Setiap nilai diskon harus lebih dari 0 dan kurang dari 100.",
  orderOfferMarkupInvalid: "Nilai markup harus antara 0 dan 100.",
  orderOfferCashInvalid: "Nilai potongan tunai tidak valid.",
  // orderOfferFinalNegative digabung jadi common.offerFinalNegative
  // (2026-08-22) — teksnya identik dengan cabangOfferFinalNegative lama.
  orderOfferNoPermissionDiscount: "Partner ini belum diizinkan mengatur diskon dari cabang — atur di tab Hak Akses.",

  // ---- Izin diskon (0015 — offer-permissions-form.tsx) ----
  offerPermDiscountLabel: "Boleh mengatur diskon",
  offerPermDiscountDesc:
    "Staf cabang bisa mengisi rantai diskon %, markup %, dan potongan tunai pada Penawaran SANCI " +
    "pesanan cabang mereka sendiri. Mengandaikan izin \"Boleh mengisi/mengubah Penawaran SANCI\" " +
    "tetap dinyalakan — tanpa itu izin ini tidak berpengaruh apa pun.",

  // ---- Isi Pesanan (order-items-section.tsx, migrasi 0014) ----
  orderItemsCardTitle: "Isi Pesanan",
  orderItemsEmpty: "Belum ada isi pesanan.",
  orderItemsFeatureOff: "Fitur isi pesanan belum aktif — migrasi database belum dijalankan.",
  orderItemsCopyWarningPartial: "Sebagian isi paket gagal disalin otomatis ke pesanan ini — tambahkan baris manual bila perlu.",
  orderItemColName: "Nama",
  orderItemColCode: "Kode",
  orderItemColQty: "Jumlah",
  orderItemColNote: "Catatan",
  orderItemColColor: "Warna",
  orderItemColSize: "Ukuran",
  orderItemEditBtn: "Ubah",
  orderItemDeleteBtn: "Hapus",
  orderItemDeleteConfirm: "Hapus baris \"{name}\" dari pesanan ini? Tindakan ini tidak bisa dibatalkan.",
  orderItemAddBtn: "Tambah Baris",
  orderItemModalTitleAdd: "Tambah Baris Pesanan",
  orderItemModalTitleEdit: "Ubah Baris Pesanan",
  orderItemNameFieldLabel: "Nama Produk",
  orderItemNameRequired: "Nama produk wajib diisi.",
  orderItemQtyFieldLabel: "Jumlah",
  orderItemNoteFieldLabel: "Catatan",
  orderItemColorFieldLabel: "Kode Warna",
  orderItemSizeFieldLabel: "Ukuran Custom",
  orderItemUnitPriceFieldLabel: "Harga Satuan (Rp)",
  orderItemLineDiscountFieldLabel: "Potongan Baris (Rp)",
  orderItemPriceFieldsLockedHint: "Kolom harga hanya bisa diisi kalau partner punya izin \"Boleh mengisi/mengubah Penawaran SANCI\".",
  orderItemSaveFailed: "Tidak bisa menyimpan baris ini sekarang.",
  orderItemDeleteFailed: "Tidak bisa menghapus baris ini sekarang.",
  orderItemQtyInvalid: "Jumlah harus angka bulat lebih dari 0.",
  orderItemPriceInvalid: "Nilai harga tidak valid.",

  // ---- Dokumen Pesanan (documents-section.tsx, migrasi 0016) ----
  docCardTitle: "Dokumen",
  docEmpty: "Belum ada dokumen untuk pesanan ini.",
  docFeatureOff: "Fitur dokumen pesanan belum aktif — migrasi database belum dijalankan.",
  docCreateSoBtn: "+ Buat SO",
  docCreateDoBtn: "+ Buat DO",
  docCreateInvoiceBtn: "+ Buat Invoice",
  docColType: "Jenis",
  docColNumber: "Nomor",
  docColDate: "Tanggal",
  docColLines: "Baris",
  docLinesCount: "{n} baris",
  docViewBtn: "Cetak",
  docEditBtn: "Ubah",
  docDeleteBtn: "Hapus",
  docDeleteConfirm: "Hapus dokumen {number}? Tindakan ini tidak bisa dibatalkan — isi dokumen ikut terhapus.",
  docDeleteFailed: "Tidak bisa menghapus dokumen ini sekarang.",
  docSaveFailed: "Tidak bisa menyimpan dokumen ini sekarang — periksa kembali jumlah tiap item.",
  docModalTitleCreate: "Buat Dokumen {type}",
  docModalTitleEdit: "Ubah Dokumen {type}",
  docDateFieldLabel: "Tanggal Dokumen",
  docDateRequired: "Tanggal dokumen wajib diisi.",
  docNotesFieldLabel: "Catatan (opsional)",
  docItemsSectionTitle: "Pilih Item",
  docItemColName: "Nama",
  docItemColOrderedQty: "Dipesan",
  docItemColCoveredQty: "Sudah Tercakup",
  docItemColRemainingQty: "Sisa",
  docItemColInputQty: "Jumlah",
  docItemQtyInvalid: "Jumlah harus angka bulat lebih dari 0, atau kosongkan untuk tidak menyertakan item ini.",
  docItemOvership: "Kuantitas untuk \"{name}\" melebihi sisa yang tersedia (sisa {remaining}).",
  docTypeInvalid: "Jenis dokumen tidak dikenal.",
  docNumberingFailed: "Tidak bisa membuat nomor dokumen sekarang — coba lagi sebentar lagi.",
  docSaveBtn: "Simpan Dokumen",
  docNumberLabel: "Nomor Dokumen",
  docPrintBtn: "Cetak / Simpan PDF",
  docBackToOrderBtn: "Kembali ke Pesanan",

  // ---- Pelanggan (app/admin/pelanggan/page.tsx) — Phase 2 slice 13, migrasi 0018 ----
  customerCreatedViaSanci: "SANCI langsung",
  customerCreatedViaUnknownPartner: "Partner tidak diketahui",
  customerTabList: "Daftar Pelanggan",
  customerTabSources: "Kode Sumber Tamu",
  customerTabSales: "Kode Sales",
  customerSearchPlaceholder: "Cari nama / telepon / kode…",
  customerEmpty: "Belum ada pelanggan.",
  customerEmptyFiltered: 'Tidak ada pelanggan yang cocok dengan "{q}".',
  customerColCode: "Kode Pelanggan",
  customerColSourceSales: "Sumber · Sales",
  customerColCreatedVia: "Dibuat Lewat",
  customerCodeMigrationMsg: "Fitur kode pelanggan otomatis belum aktif — migrasi belum dijalankan.",

  // ---- Tambah Pelanggan (add-customer-button.tsx) ----
  customerNameRequired: "Nama pelanggan wajib diisi.",
  customerPhoneInvalid: "Nomor telepon tidak valid.",
  customerSourceSalesPairRequired:
    "Sumber dan Sales harus diisi berdua, atau dikosongkan berdua — tidak bisa hanya salah satu.",
  customerAddBtn: "+ Tambah Pelanggan",
  customerAddModalTitle: "Tambah Pelanggan",
  customerSavedMsg: "Pelanggan tersimpan.",
  customerNoCodeGenerated: "Tidak ada kode (Sumber/Sales tidak diisi).",
  customerNameFieldLabel: "Nama pelanggan *",
  customerPhoneFieldLabel: "Telepon *",
  customerSourceFieldLabel: "Sumber",
  customerSalesFieldLabel: "Sales",
  customerSourceSalesEmptyOption: "— Pilih —",
  customerSourceSalesHint:
    "Isi Sumber dan Sales berdua untuk mendapat Kode Pelanggan otomatis, atau kosongkan berdua kalau tidak perlu.",
  customerCreateBtn: "Simpan Pelanggan",

  // ---- Master "Kode Sumber Tamu" / "Kode Sales" (master-data-section.tsx) ----
  sourceCodeFieldLabel: "Kode *",
  sourceLabelFieldLabel: "Label *",
  sourceAddBtn: "+ Tambah Sumber",
  sourceAddModalTitle: "Tambah Kode Sumber Tamu",
  sourceEditModalTitle: "Ubah Kode Sumber Tamu",
  sourceEmpty: "Belum ada kode sumber tamu.",
  sourceColLabel: "Label",
  salesCodeFieldLabel: "Kode *",
  salesNameFieldLabel: "Nama *",
  salesAddBtn: "+ Tambah Sales",
  salesAddModalTitle: "Tambah Kode Sales",
  salesEditModalTitle: "Ubah Kode Sales",
  salesEmpty: "Belum ada kode sales.",
  salesColName: "Nama",
  customerMasterDeactivateTitle: "Nonaktifkan {text}?",
  customerMasterDeactivateBody:
    "Kode ini tidak akan bisa dipilih untuk pelanggan baru. Pelanggan lama yang sudah memakai kode ini tidak berubah.",

  // ---- Server Actions (actions-customers.ts) ----
  sourceCodeInvalid: "Kode harus 1–4 huruf besar (A–Z).",
  sourceLabelRequired: "Label wajib diisi.",
  sourceCodeTaken: "Kode sumber ini sudah dipakai kode aktif lain.",
  sourceStatusChangeFailed: "Tidak bisa mengubah status sumber sekarang.",
  salesCodeInvalid: "Kode harus 1–4 huruf besar (A–Z).",
  salesNameRequired: "Nama wajib diisi.",
  salesCodeTaken: "Kode sales ini sudah dipakai kode aktif lain.",
  salesStatusChangeFailed: "Tidak bisa mengubah status sales sekarang.",

  // ---- Buat Pesanan atas nama cabang (orders/baru + actions-create-order.ts) ----
  // Teks form disamakan kata demi kata dengan form cabang (cabang.ts) di mana
  // konsepnya sama — GLOSSARY: satu konsep = satu kata.
  orderCreateBtn: "+ Buat Pesanan",
  orderCreateTitle: "Buat Pesanan",
  orderCreateIntro:
    "Pesanan dibuat atas nama partner & cabang yang dipilih — akun cabang itu akan melihatnya seperti pesanan buatannya sendiri, termasuk pelanggan barunya.",
  orderCreateSelectPartnerPlaceholder: "— Pilih Partner —",
  orderCreateSelectBranchPlaceholder: "— Pilih Cabang —",
  orderCreateNoActivePartners: "Belum ada partner aktif.",
  orderCreateNoActiveBranches: "Partner ini belum punya cabang aktif.",
  orderCreateOptionsLoadFailed: "Data cabang & package gagal dimuat — coba lagi.",
  orderCreateStaffLoadFailed: "Daftar staf gagal dimuat — coba lagi.",
  orderCreatePhoneLabel: "Nomor HP / WhatsApp *",
  orderCreateChecking: "Memeriksa pelanggan…",
  orderCreateCheckFailed: "Tidak dapat memeriksa pelanggan — coba lagi.",
  orderCreateCustomerFoundPrefix: "Pelanggan ditemukan:",
  orderCreateUseCustomerCta: "Gunakan Pelanggan Ini",
  orderCreateCustomerSelectedPrefix: "Pelanggan dipilih:",
  orderCreateChangeCustomerCta: "Ganti Pelanggan",
  orderCreateNewCustomerHint: "Belum ada pelanggan dengan nomor ini — isi nama untuk membuat baru.",
  orderCreateSectionLockedHint:
    "Pilih partner & cabang, lalu isi atau pastikan data pelanggan di atas untuk mengisi bagian ini.",
  orderCreateAmountLabel: "Total belanja pelanggan di toko (opsional)",
  orderCreateAmountHint: "Membantu SANCI menyiapkan penawaran yang sesuai.",
  orderCreatePackageFieldLabel: "Package *",
  orderCreateSelectPackagePlaceholder: "— Pilih Package —",
  orderCreatePackageManualOption: "Lainnya (ketik manual)",
  orderCreatePackageNameFieldLabel: "Nama Package *",
  orderCreateSalesFieldLabel: "Sales *",
  orderCreateSelectSalesPlaceholder: "— Pilih Sales —",
  orderCreateNoActiveStaffHint: "Belum ada staf aktif di cabang ini.",
  orderCreatePicLabel: "PIC",
  orderCreateNotSelectedOption: "— Tidak dipilih —",
  orderCreateShippingLabel: "Alamat Pengiriman",
  orderCreateShippingHint:
    "Boleh beda dari alamat pelanggan — misalnya kirim ke kantor atau alamat lain. Selalu bisa diubah nanti.",
  // 0020 — nomor PO milik pelanggan/toko; tercetak di baris "Purchase
  // Order" pada Invoice kalau diisi (kosong = Invoice memakai nomor
  // pesanan sistem, perilaku lama).
  orderCreateCustomerPoLabel: "Nomor PO Pelanggan",
  orderCreateCustomerPoHint:
    "Nomor Purchase Order dari pelanggan atau toko sendiri (kalau ada). Tercetak di Invoice pada baris Purchase Order.",
  orderCreateOptionalPlaceholder: "Opsional...",
  orderCreateInvoiceFieldLabel: "Foto/PDF Invoice (opsional)",
  orderCreateInvoiceFieldHint:
    "PNG, JPG, WebP, atau PDF. Maksimal 5 MB — gambar diperkecil otomatis sebelum dikirim. Diunggah setelah pesanan berhasil dibuat.",
  orderCreateSubmitCta: "Buat Pesanan",
  orderCreateSuccessBanner: "Pesanan berhasil dibuat.",
  orderCreateOpenOrderCta: "Buka Pesanan",
  orderCreateAgainCta: "Buat Pesanan Lagi",
  orderCreateUnknownAfterConfirm:
    "Pesanan kemungkinan sudah tersimpan, tapi rinciannya belum bisa dimuat. Buka Daftar Pesanan.",
  // Server Actions (actions-create-order.ts)
  orderCreatePairInvalid: "Partner/cabang tidak valid atau sudah nonaktif — pilih ulang.",
  orderCreateModuleInactive: "Modul Pesanan belum aktif di database (migrasi belum dijalankan).",
  orderCreateCustomerGone: "Pelanggan tidak ditemukan lagi. Muat ulang halaman dan cari ulang.",
  orderCreateFullNameRequired: "Nama lengkap wajib diisi.",
  orderCreatePhoneInvalid: "Nomor telepon tidak valid.",
  orderCreateSalesRequired: "Sales wajib dipilih.",
  orderCreateSalesInvalid: "Sales harus dipilih dari daftar staf aktif cabang ini.",
  orderCreatePicInvalid: "PIC harus dipilih dari daftar staf aktif cabang ini.",
  orderCreatePackageNotFound: "Package tidak ditemukan atau sudah tidak aktif. Pilih ulang.",
  orderCreatePackageRequired: "Package wajib dipilih.",
  orderCreatePackageNameRequired: "Nama package wajib diisi.",
  orderCreateFulfillmentRequired: "Pilih jalur pesanan",
  orderCreateFulfillmentInvalid: "Jalur pesanan tidak valid.",
  orderCreateAmountInvalid: "Jumlah belanja tidak valid.",
  orderCreatePartialFailed: "Pelanggan tersimpan. Pesanan gagal — coba kirim lagi; pelanggan sudah dipilih otomatis.",
  orderCreatePartialUnknown:
    "Pelanggan tersimpan. Status pesanan belum bisa dipastikan karena koneksi terputus — cek Daftar Pesanan sebelum mencoba lagi.",
  orderCreateSummaryUnavailable:
    "Pesanan tersimpan tetapi rinciannya belum bisa dimuat ulang. Buka Daftar Pesanan untuk memastikan.",
  orderCreateItemsCopyWarning: "Sebagian isi paket gagal tersalin otomatis ke pesanan ini.",
  orderCreateInvoicePathInvalid: "Alamat invoice tidak dikenali.",
  orderCreateInvoiceOrderCancelled: "Pesanan sudah dibatalkan — invoice tidak dicatat.",
  orderCreateInvoiceRecordFailed: "Invoice gagal dicatat — data pesanan tetap tersimpan.",
  // Unggah invoice sisi client (orders/baru/invoice-upload-admin.ts)
  orderCreateInvoiceUploadFailed: "Invoice gagal diunggah — data pesanan tetap tersimpan.",
  orderCreateInvoiceWrongType: "Format invoice harus PNG, JPG, WebP, atau PDF.",
  orderCreateInvoiceTooLarge: "Ukuran invoice maksimal 5 MB. Pilih berkas yang lebih kecil.",
} as const;

type Shape = Record<keyof typeof id, string>;

const en = {
  navOrders: "Partner orders",
  navPartners: "Partners",
  navProducts: "Products",
  navCustomers: "Customers",
  navCalculator: "Offer Calculator",

  calcAdminIntroNote:
    "The same offer calculator branches have — for the SANCI team, without switching accounts. Nothing is " +
    "saved to the system while you work; press \"Create order\" on the cart tab to carry the numbers and " +
    "product list into the admin order form.",
  calcAdminConvertCta: "Create order",
  calcAdminConvertScopeNote:
    "\"Create order\" carries the subtotal, discount chain, and product list (name, code, quantity, price) " +
    "into the admin order form — pick the partner and branch there as usual.",

  calcAdminHandoffBanner: "From the Offer Calculator: {n} items · Subtotal {subtotal} · Final total {final}.",
  calcAdminHandoffApplyCta: "Use these numbers",
  calcAdminHandoffDismissCta: "Dismiss",
  calcAdminHandoffScopeHint:
    "This fills \"Customer's total purchase\" with the calculator's subtotal. After the order is created, the " +
    "discount chain is applied to that order's SANCI Offer automatically, and the calculator's product list " +
    "(name, code, quantity, price) is added to its Order items.",
  calcAdminHandoffAppliedOk: "The Offer Calculator's discount chain was applied to this order's SANCI Offer.",
  calcAdminHandoffAppliedFailed:
    "The order was created, but the calculator's discount chain could not be applied automatically — set it " +
    "manually in the SANCI Offer section of the order page.",
  calcAdminItemsAppliedPriceNote: "Per-item prices were not saved — review and complete them under Order items.",
  formItemsAppliedOk: "{n} products were added to this order.",
  formItemsAppliedPartial:
    "{n} of {total} products were added to this order; the rest failed — review and add them manually under " +
    "Order items.",
  formItemsAppliedFailed:
    "The order was created, but the selected products could not be added automatically — add them manually " +
    "under Order items.",

  openBtn: "Open",
  filterStatusAll: "Status: all",
  filterAccessAll: "Access: all",
  accessViewOnly: "View only",
  accessViewEdit: "View + edit",
  savedMsg: "Saved.",
  tabOverview: "Overview",
  tabBranches: "Branches",
  tabPackages: "Packages",
  tabUsers: "Accounts",
  tabPermissions: "Access",
  tabHistory: "History",
  tabStaff: "Staff",
  tabActivity: "Activity",

  partnersSearchPlaceholder: "Search partner / branch / code…",
  partnersColBrand: "Brand",
  partnersColAccess: "Access",
  partnersAccessNotSet: "Not set",
  partnersEmpty: "No partners yet.",
  partnersEmptyFiltered: 'No partners match "{q}".',
  partnersMatchedBranch: "Matched branch: {branch}",

  partnerAddBtn: "+ Add Partner",
  partnerAddModalTitle: "Add Partner",
  partnerDupWarning:
    'Possible duplicate: {name}. Click "Create Partner" again to continue anyway, or cancel.',
  partnerNameFieldLabel: "Partner name *",
  partnerNameHint:
    "The store/company's display name — appears across the admin screens and is the store " +
    "identity branch accounts see on their app's home screen.",
  partnerCodeFieldLabel: "Partner code *",
  partnerCodeHint:
    "2–8 characters, A–Z, 0–9, and hyphens — e.g. GH. Becomes the start of every order number " +
    "(e.g. GH-BSD-260817-0001) and the suggested login ID; once the partner is activated the code can no longer be changed.",
  partnerCreateBtn: "Create Partner",
  partnerCreateBtnDup: "Create Partner Anyway",
  partnerCreatingBtn: "Saving…",

  closeBtn: "Close",
  partnerEditModalTitle: "Edit Partner",
  partnerCodeLockedHint: "The code is locked while the partner is {status}.",
  partnerLogoFieldLabel: "Logo (optional)",
  partnerLogoHint:
    "PNG, JPG, or WebP. Maximum 5 MB — the image is resized automatically before upload. Leave " +
    "blank if you do not want to change the logo.",
  partnerSuspendBtn: "Suspend",
  partnerReactivateBtn: "Reactivate",
  partnerEndPartnershipBtn: "End partnership",
  partnerDeleteDraftBtn: "Delete draft",
  partnerActivateBtn: "Activate partner",
  partnerActivateHint: "The button lights up once every activation requirement in the next card is checked.",
  partnerDeactivateModalTitle: "End the partnership with {name}?",
  partnerDeactivateBody:
    "The status becomes INACTIVE and this partner drops out of day-to-day work. All branches, " +
    "staff, and history stay saved, and an admin can still restore it later with the Reactivate " +
    "button. If you only want a temporary pause, use Suspend — not this button.",
  partnerDeactivateFieldLabel: "Type {code} to confirm",
  partnerDeactivateConfirmBtn: "End partnership",
  partnerDeleteModalTitle: "Delete {name}?",
  partnerDeleteFieldLabel: "Type {code} to permanently delete",
  partnerDeletePermanentBtn: "Delete permanently",
  partnerDeletingBtn: "Deleting…",

  partnerNameRequired: "Partner name is required.",
  partnerCodeInvalid: "2–8 characters, only A–Z, 0–9, and hyphens.",
  partnerCodeTaken: "Partner code {code} is already in use.",
  partnerNotFound: "Partner not found.",
  partnerActivationRequirementsMissing: "Activation requirements are not complete yet.",
  partnerStatusChangeFailed: "Cannot change the status right now.",
  partnerDeleteDraftOnly: "Only partners with DRAFT status can be permanently deleted.",
  partnerDeleteCodeMismatch: "Type {code} exactly to confirm.",
  partnerHasRelatedData: "This partner already has related data — it cannot be permanently deleted.",
  partnerDeleteFailed: "Cannot delete the partner right now.",
  logoUploadFailed: "The logo failed to upload — the partner data was still saved.",
  logoUrlUnrecognized: "Logo address not recognized.",

  partnerInfoTitle: "Partner Information",
  activationRequirementsTitle: "Activation requirements",
  gateIntro:
    "Finish these three steps first; once all are checked, the Activate partner button can be " +
    "pressed.",
  gateReqBranch: "At least 1 active branch",
  gateReqUser: "At least 1 active login account",
  gateReqAccess: "Access has been configured",
  gateGoBranches: "Open the Branch tab",
  gateGoUsers: "Open the Account tab",
  gateGoAccess: "Open the Access tab",
  gateUnknownNote: "Could not be checked right now — reload the page to check again.",
  gateStaffRecommended: "At least 1 staff member — recommended",
  gateStaffWhy:
    "Does not hold up activation, but it is needed later when a branch creates an order (the " +
    "Sales/PIC choice). Staff are added on the branch detail page.",
  branchesEmpty: "No branches yet.",

  packageMigrationMsg: "The package feature is not active yet — the migration has not been run.",
  packagesEmpty: "No packages yet.",
  packageAddBtn: "+ Add Package",
  packageAddModalTitle: "Add Package",
  packageNameFieldLabel: "Package name *",
  packageNameHint: "This is the name branch staff see when choosing a package on the new-order form.",
  packageCodeFieldLabel: "Package code *",
  packageCodeHint: "Unique within this partner. Other partners may reuse the same code.",
  packageDescFieldLabel: "Description",
  packageCreateBtn: "Create Package",
  packageEditModalTitle: "Edit Package",
  packageNameRequired: "Package name is required.",
  packageCodeTaken: "Package code is already in use.",
  packageItemsTitle: "Package contents",
  packageItemsLink: "Contents",
  packageItemsEmpty: "No products in this package yet.",
  packageItemsAdd: "Add product",
  packageItemsSearchPlaceholder: "Search product name or code…",
  packageItemsNoMatch: "No matching products.",
  packageItemsAllAdded: "Every active product is already in this package.",
  packageItemRemove: "Remove",
  packageItemRemoveConfirm: "Remove {name} from this package?",
  packageItemQtyInvalid: "Quantity must be a whole number greater than 0.",
  packageItemDuplicate: "This product is already in the package. Change the quantity on the existing line instead.",
  packageItemMigrationMsg: "The package contents feature is not active yet — migration 0012 has not been run.",
  packageItemCatalogEmpty: "The product catalog is still empty — add products under Product first.",

  colAddress: "Address",

  branchAddBtn: "+ Add Branch",
  branchAddModalTitle: "Add Branch",
  branchNameFieldLabel: "Branch name *",
  branchNameHint:
    "Shown in branch dropdowns and the order list on the admin screens, and seen by the " +
    "branch's own staff in their app.",
  branchCodeFieldLabel: "Branch code *",
  branchCodeHint:
    "The branch's short code — part of every order number and customer code for this branch " +
    "(e.g. the BSD in GH-BSD-260817-0001). Unique within this partner; other partners may reuse the same code.",
  branchAddressFieldLabel: "Full address *",
  branchCreateBtn: "Create Branch",
  branchEditModalTitle: "Edit Branch",
  branchSuspendBtn: "Suspend",
  branchReactivateBtn: "Reactivate",
  branchNameRequired: "Branch name is required.",
  branchAddressRequired: "Full address is required.",
  branchCodeTaken: "Branch code {code} already exists for this partner.",
  branchNotFound: "Branch not found.",

  usersServiceKeyMissing:
    "Creating login accounts and resetting passwords is not active on this server yet. Ask a " +
    "technical staff member to fill in the SUPABASE_SERVICE_ROLE_KEY environment variable in " +
    "Vercel; after that the Add Account and Reset Password buttons will appear here automatically. " +
    "Disabling and re-enabling existing accounts still works now.",
  usersNoActiveBranch:
    "There is no active branch yet. Create and activate a branch first in the Branches tab — every " +
    "login account must be tied to one branch.",
  usersEmpty: "No login accounts yet.",
  usersFootnote:
    "One branch shares one account; the salesperson's name and PIC are still picked from the staff " +
    "list when creating an order. The login ID is not shown in this list — note it down when " +
    "the account is created. The password is chosen by the store and typed in by the admin when " +
    "the account is created; once saved, the system can never show it again to anyone. If the store " +
    "forgets it, press Reset Password on its row to set a new one — do not create a second account " +
    "for the same branch.",
  userToggleDeactivateBtn: "Deactivate",
  userToggleReactivateBtn: "Reactivate",
  userToggleFailed: "Cannot change the account status right now.",
  userNotFound: "Account not found.",

  userAddBtn: "+ Add Account",
  userAddModalTitle: "Add Login Account",
  userAddInfoBanner:
    "One branch shares one account. The salesperson's name and PIC are still picked from the staff " +
    "list when creating an order — not from this account. The password is chosen by the store and " +
    "you type it in here; once saved, the system can never show it again to anyone. If the store " +
    "forgets it later, use the Reset Password button in the Accounts list to set a new one.",
  userNameFieldLabel: "Name *",
  userNameHint:
    "Just a label shown in the accounts list, e.g. the store or branch name — not used for signing in.",
  userBranchFieldLabel: "Branch *",
  userEmailFieldLabel: "Login ID *",
  userEmailHint:
    "Suggested automatically from the partner code and branch code — leaving it as is works " +
    "fine, and it can be edited. It looks like an email, but it is not a real mailbox and " +
    "receives no mail; the store types this ID into the Email box when signing in.",
  userPasswordFieldLabel: "Password chosen by the store *",
  userPasswordHint:
    "Type the password the store itself asked for (usually sent over WhatsApp) — not a " +
    "system-generated one. Minimum {min} characters. It is deliberately shown in plain text so you " +
    "can confirm it is typed correctly before saving.",
  userCreateBtn: "Create Account",
  userCreatingBtn: "Creating…",
  userCredentialTitle: "Login account created",
  userCredentialWarning:
    "The password below is visible only NOW, because you just typed it in yourself. The system " +
    "does not keep a readable copy, so once this box is closed nobody — including SANCI — can see " +
    "it again. Make sure the store already has this password before closing this box.",
  userCredentialEmailLabel: "Login ID",
  userCredentialPasswordLabel: "Password",
  userCredentialFootnote:
    "This login ID is shaped like an email but receives no mail — when signing in, the store " +
    "types it into the Email box. If the store forgets the " +
    "password, do not create a new account: open the Accounts tab, then press Reset Password on its " +
    "row to set a new one.",
  copyCredentialsBtn: "Copy email & password",
  copyDoneBtn: "I've noted it down — Close",
  copySuccessMsg: "Copied. Paste it to the store manager on WhatsApp now.",
  copyFailMsg: "Could not copy automatically on this device — write it down manually from the screen.",
  userCreateUnconfirmedMsg:
    "The connection to the server dropped before the answer arrived, so we cannot yet confirm " +
    "whether the login account was created. Do NOT create it again right away. Reload this page and " +
    "check the Accounts list: if the account has not appeared but that email was rejected as " +
    "already in use, contact technical staff and mention that email address.",

  resetPasswordBtn: "Reset Password",
  resetPasswordModalTitle: "Reset Password",
  resetPasswordWarningBanner:
    "The old password for account {user}{branch} will stop working the moment this is saved. Make " +
    "sure you can send the new password to the store manager right away — otherwise they will not " +
    "be able to sign in. A device that is already signed in may keep working until it signs out on " +
    "its own.",
  resetPasswordInfoBanner:
    "Nobody can view the old password, including SANCI — the system only stores its fingerprint, " +
    "not the password itself. So for a store that has forgotten it, the only option is to set a new " +
    "one here. Ask the store what password they want first, then type it in below.",
  resetPasswordFieldLabel: "New password chosen by the store *",
  resetPasswordHint:
    "Minimum {min} characters. It is deliberately shown in plain text so you can confirm it is " +
    "typed correctly before saving.",
  resetPasswordRepeatFieldLabel: "Retype the new password *",
  resetPasswordRepeatHint:
    "Must match the box above exactly. One mistyped letter means the store cannot sign in at all.",
  resetPasswordMismatchErr: "The two boxes do not match yet. Check again — upper and lower case matter.",
  resetPasswordSaveBtn: "Save New Password",
  resetPasswordDoneTitle: "Password updated",
  resetPasswordDoneWarning:
    "Send this new password to the store manager right now. The old password no longer works, so " +
    "until the new one arrives, they cannot sign in. Once this box is closed, the system can never " +
    "show it again to anyone.",
  resetPasswordDoneNewLabel: "New password",
  resetPasswordCopyBtn: "Copy password",
  resetPasswordCloseBtn: "I've sent it — Close",
  resetPasswordUnconfirmedMsg:
    "The connection to the server dropped before the answer arrived, so we cannot yet confirm " +
    "whether the password was changed. Try again with the SAME new password — retrying with the " +
    "same password causes no problem. Do not tell the store it is done until this screen confirms " +
    "success.",

  userNotAuthorized: "You are not authorized to create login accounts.",
  userPermCheckFailed: "Cannot confirm your access rights right now. Reload the page and try again.",
  userServiceKeyMissingCreate:
    "Creating a login account cannot run yet because the server setup is incomplete. Ask a " +
    "technical staff member to fill in the SUPABASE_SERVICE_ROLE_KEY environment variable in " +
    "Vercel, then open this page again. None of what you entered was saved.",
  userEmailTaken:
    "This login ID is already in use. Use a different one. If you believe this ID should not be " +
    "taken, contact technical staff — do not force it to be recreated.",
  userWeakPassword:
    "The login system rejected that password because it does not meet the security requirements. " +
    "Ask the store to choose a longer password that mixes upper case, lower case, and numbers.",
  userEmailRejected: "The login system rejected this login ID. Check the spelling, then try again.",
  userCreateFailedGeneric: "Cannot create the login account right now. Please try again in a moment.",
  userCreateCleanRollback:
    "The login account FAILED to be created and nothing was left behind in the system. Please try " +
    "again with the same email.",
  userHalfCreated:
    "A login account for {email} was created in the login system, BUT it is not yet linked to a " +
    "partner, so it cannot be used to sign in. Do not create it again with the same email. Note " +
    "this email down and contact technical staff.",
  userNameRequiredField: "Name is required.",
  userEmailRequiredField: "The login ID is required.",
  userEmailFormatInvalid: "The login ID must be shaped like an email address. Example: gh-bsd@sanci.com",
  userPasswordRequiredField: "The store's password is required.",
  userPasswordTooShort: "Password must be at least {min} characters. Ask the store to choose a longer one.",
  userBranchRequiredField: "A branch must be selected.",
  userBranchNotFoundOnPartner: "Branch not found for this partner.",
  userBranchInactive: "That branch is currently inactive. Activate the branch first, then create the account.",

  resetServiceKeyMissing:
    "Changing the password cannot run yet because the server setup is incomplete. Ask a technical " +
    "staff member to fill in the SUPABASE_SERVICE_ROLE_KEY environment variable in Vercel, then " +
    "open this page again. The old password still works as usual.",
  resetAccountNotFound: "That account was not found. Reload this page, then try again.",
  resetAccountIncomplete:
    "This account is not linked to the login system yet, so its password cannot be changed from " +
    "here. Contact technical staff.",
  resetGenericFail: "Cannot change the password right now. The old password still works. Please try again in a moment.",
  resetPasswordRequiredField: "New password is required.",
  resetPasswordTooShortField: "New password must be at least {min} characters.",

  catalogMigrationMsg: "The product catalog feature is not active yet — the migration has not been run.",
  permVisibilityTitle: "Branch Visibility",
  permVisibilityDesc: "Only SANCI Admin can change this setting. It applies to every login account of {partner}.",
  permNotConfiguredWarning: "Not configured yet — currently in effect: Own branch only (default).",
  permOwnBranchDesc: "Each branch only sees its own branch.",
  permAllBranchesLabel: "All branches of the same partner",
  permAllBranchesDesc: "All branches of {partner} can see each other. Never other partners.",
  permEditTitle: "Access to other branches",
  permViewOnlyDesc: "Other branches can only be viewed.",
  permViewEditDesc: "Staff of other branches can also be managed.",
  permSaveBtn: "Save access",
  permFootnote:
    "Selected-branch rules (e.g. only Jakarta A ↔ Jakarta B) are prepared for a future phase — the " +
    "data schema already supports it, this screen does not yet.",
  visibilityScopeInvalid: "Visibility is not valid.",
  editScopeInvalid: "Edit scope is not valid.",
  permSaveFailed: "Cannot save access settings right now.",

  // ---- SANCI offer permissions per partner (offer-permissions-form.tsx, migration 0014) ----
  offerPermTitle: "SANCI offer permissions",
  offerPermDesc:
    "Controls whether {partner}'s branch staff can view/set the SANCI offer on orders from THEIR OWN BRANCH. " +
    "Branches never see another partner's offer, regardless of this setting.",
  offerPermViewLabel: "Can view the SANCI offer",
  offerPermViewDesc: "Branch staff can see the offer amount, down payment (DP), and payment condition on their own branch's orders.",
  offerPermEditLabel: "Can set/edit the SANCI offer",
  offerPermEditDesc:
    "Branch staff can set/edit the offer amount, down payment, payment condition, and per-line prices on their own branch's orders. " +
    "Deleting an offer stays SANCI-admin only.",
  offerPermSaveBtn: "Save offer permissions",
  offerPermSaveFailed: "Cannot save offer permissions right now.",

  catalogAccessTitle: "SANCI Product Catalog",
  catalogAccessDesc: "If open, every branch of this partner can see the SANCI product catalog.",
  catalogOpenLabel: "Open",
  catalogClosedLabel: "Closed",
  catalogSaveFailed: "Cannot save the catalog setting right now.",

  branchInfoColCode: "Branch code",
  branchInfoColAddress: "Full address",
  staffInfoBanner: "Branch: {partner} · {branch} — automatic from this page, cannot be changed.",
  staffEmpty: "No staff registered at this branch yet.",
  staffNoPhone: "no phone",
  activityEmpty: "No activity recorded yet.",
  auditFootnote: "The audit trail only ever grows. Nothing in the app can change or delete it.",

  staffAddBtn: "+ Add Staff",
  staffAddModalTitle: "Add Staff",
  staffNameFieldLabel: "Full name *",
  staffNameHint:
    "This name appears in the Sales/PIC choices when creating an order, and is printed as the " +
    "sales name on the SO document.",
  staffRoleFieldLabel: "Role *",
  staffRoleHint: "The store job role — separate from the login access role.",
  staffCodeFieldLabel: "Staff Code",
  staffCodeHint:
    "Optional — suggested automatically from the name's initials, free to change. Becomes part of " +
    "the automatic customer code for customers this staff member serves (e.g. the AS in GH-BSD-AS/26/001); " +
    "leave blank if not needed yet.",
  staffCodeInvalidFormat: "Staff code may only contain uppercase letters/digits, up to 10 characters.",
  staffCodeTaken: "This staff code is already used by another staff member at the same partner.",
  staffCreateBtn: "Add Staff",
  staffRoleSales: "Sales",
  staffRoleReception: "Receptionist / CS",
  staffRoleManager: "Manager",
  staffRoleOther: "Other",

  staffEditModalTitle: "Edit Staff",
  staffTransferModalTitle: "Transfer {name}",
  staffTransferDesc: "Transferring ends the old assignment and starts a new one — history is never rewritten.",
  staffTransferBranchFieldLabel: "Destination branch *",
  staffTransferBtn: "Transfer",
  staffTransferringBtn: "Transferring…",
  staffDeactivateBtn: "Deactivate",
  staffDeactivateConfirm: "Deactivate {name}? History stays saved.",
  staffFullNameRequired: "Full name is required.",
  staffDeactivateFailed: "Cannot deactivate right now.",
  staffAssignmentSavedFailed: "Cannot save the role right now.",
  staffTransferActiveNotFound: "Active assignment not found.",
  staffTransferFailed: "Cannot transfer right now.",
  staffAssignmentPartialFail: "The staff record was saved but the branch assignment failed. Contact technical support.",

  produkSearchPlaceholder: "Search product name / code…",
  filterStockAll: "Stock: all",
  filterCategoryAll: "Category: all",
  produkEmpty: "No products yet.",
  produkEmptyFiltered: 'No products match "{q}".',
  produkEmptyFilteredCategory: "No products in this category.",
  produkFootnote: "Inactive products are not visible to partners.",
  productNoPhoto: "No photo",
  productStockFieldLabel: "Stock status",

  productAddBtn: "+ Add Product",
  productAddModalTitle: "Add Product",
  productNameFieldLabel: "Product name *",
  productCodeFieldLabel: "Code",
  productCategoryFieldLabel: "Category",
  productStockStatusFieldLabel: "Stock Status",
  productBasePriceFieldLabel: "SANCI base price (Rp)",
  productBasePriceHint:
    "Optional. The starting price for every partner — each partner can override it with their own store's " +
    "normal price. Clear the field and save to remove it.",
  productBasePriceLoadFailed:
    "The base price could not be loaded — the field is disabled so a price can't be removed by accident. Close and reopen to retry.",
  productBasePriceSaveFailed:
    "The product was saved, but the SANCI base price FAILED to save. Open Edit Product and enter it again.",
  productBasePriceInvalid: "Enter a valid rupiah amount.",
  productPhotoFieldLabel: "Photo (optional)",
  productPhotoHint: "PNG, JPG, or WebP. Maximum 5 MB — the image is resized automatically before upload.",
  productPhotoHintKeep: "PNG, JPG, or WebP. Maximum 5 MB. Leave blank to keep the current photo.",
  productCreateBtn: "Create Product",
  productEditModalTitle: "Edit Product",
  productNameRequired: "Product name is required.",
  productStockStatusInvalid: "Stock status is not valid.",
  productCodeTaken: "Product code is already in use.",
  productStockChangeFailed: "Cannot change the stock status right now.",
  productStatusChangeFailed: "Cannot change the product status right now.",
  productStatusInvalid: "Product status is not valid.",
  photoUploadFailed: "The photo failed to upload — the product data was still saved.",
  photoUrlUnrecognized: "Photo address not recognized.",
  catalogSettingInvalid: "Cannot save the catalog setting right now.",

  ordersFeatureOff: "The orders feature is not active yet — the database migration has not been run.",
  ordersSearchPlaceholder: "Search order number / customer name / phone…",
  filterFulfillmentAll: "Fulfillment: all",
  ordersEmpty: "No orders yet.",
  ordersEmptyFiltered: 'No orders match "{q}".',
  colCustomer: "Customer",
  colSales: "Sales",
  colFulfillment: "Fulfillment",
  picLabel: "PIC",
  ordersShowingCount: "Showing the {n} most recent{cap}.",
  ordersShowingCap: " (max. 50)",

  orderFeatureOff: "The Orders module is not active in the database yet (the migration has not been run).",
  orderDetailLoadFailed: "Failed to load the order detail.",
  orderOverline: "PARTNER ORDER",
  orderBranchPrefix: "{branch} Branch",
  branchUnknown: "not found",
  partnerUnknown: "Partner not found",
  customerCardTitle: "Customer",
  customerUnknown: "Unknown customer",
  orderCardTitle: "Order",
  packageCodeInactive: " (code {code}, inactive)",
  packageCodeActive: " (code {code})",
  personInactiveSuffix: " (inactive)",
  fulfillmentMigrationOff: "Migration not run yet",
  fulfillmentReported: "Not reported yet",
  viewInvoiceBtn: "View Invoice",
  invoiceNotLoadable: "The invoice cannot be loaded yet.",
  invoiceNotUploaded: "Not uploaded yet",
  createdAtServerTimeSuffix: " · server time",
  customerArrivedLabel: "Customer arrived",
  markArrivedBtn: "Mark Customer as Arrived",
  orderCancelledTitle: "Order cancelled",
  cancelInfoMigrationOff: "Cancellation details are not available yet (the database migration has not been run).",
  cancelReasonPrefix: "Reason: ",
  cancelTimePrefix: "Time: ",
  internalNoteCardTitle: "SANCI Internal Note",
  internalNoteVisibilityWarning: "Only visible to SANCI — partners cannot see this section.",
  internalNoteFeatureOff: "The internal note feature is not active yet — the database migration has not been run.",
  internalNoteEmpty: "No internal notes for this order yet.",
  internalNoteFootnote:
    "Internal notes only ever grow. A mistaken entry is corrected by adding a new note, not by editing the old one.",
  orderActivityEmpty: "No activity recorded for this order yet.",
  attributionDiffLabel: "Branch: {before} → {after}",
  reasonDiffPrefix: "Reason: ",

  correctAttributionBtn: "Correct Branch",
  correctAttributionModalTitle: "Correct Order Branch",
  correctAttributionDesc:
    "Current branch: {branch}. Only other branches of the same partner can be chosen — the partner " +
    "cannot be changed from this screen. Every correction is recorded in Activity along with the reason.",
  correctAttributionNoOtherBranches: "There is no other active branch for this partner.",
  correctAttributionBranchFieldLabel: "Destination branch *",
  correctAttributionBranchPlaceholder: "— Select a branch —",
  correctAttributionReasonFieldLabel: "Reason for correction *",
  correctAttributionReasonPlaceholder: "Example: picked the wrong branch when entering the order...",
  correctAttributionSaveBtn: "Save Correction",
  correctAttributionBranchRequired: "Select the destination branch.",
  correctAttributionReasonRequired: "A reason for the correction is required.",
  correctAttributionReasonTooLong: "The reason is too long (maximum 500 characters).",
  correctAttributionMigrationOff: "The attribution correction feature is not active yet — the migration has not been run.",
  correctAttributionGenericFail: "Cannot correct the attribution right now. Check the destination branch and try again.",

  markArrivedModalTitle: "Mark Customer as Arrived",
  markArrivedDesc:
    "Order {orderNumber} for {customer} will be marked as the customer having arrived at SANCI. " +
    "The time and the staff member who marked it are recorded automatically in Activity and cannot " +
    "be changed from this screen.",
  markArrivedConfirmBtn: "Yes, They Arrived",
  markArrivedMarkingBtn: "Marking…",
  fulfillmentMigrationOffOrder: "The fulfillment feature is not active yet — the database migration has not been run.",
  orderNotFound: "Order not found.",
  markArrivedWrongFulfillment: "Only orders on the Showroom Visit path can be marked as arrived.",
  markArrivedFailed: "Cannot mark the arrival right now. Try again.",

  internalNoteFieldLabel: "New note",
  internalNotePlaceholder: "Example: Invoice 2.5M → a decoration discount offer was given to the customer.",
  internalNoteSaveBtn: "Save Note",
  internalNoteEmptyErr: "The note cannot be empty.",
  internalNoteTooLong: "The note is too long (maximum 2000 characters).",
  internalNoteFeatureOffAction: "The internal note feature is not active yet — the migration has not been run.",

  orderOfferCardTitle: "SANCI offer",
  orderOfferVisibilityWarning:
    "Visible to SANCI only. Partners and branches cannot see this amount at all — " +
    "it is not merely hidden on screen, the database refuses it.",
  orderOfferFeatureOff: "The SANCI offer feature is not active yet — the database migration has not been run.",
  orderOfferEmpty: "No SANCI offer for this order yet.",
  orderOfferFootnote:
    "This amount is SANCI's decision for this order only, not a product price. Every entry, " +
    "change, and removal is recorded in Activity together with the old and new values.",
  orderOfferSetBtn: "Set offer",
  orderOfferEditBtn: "Change offer",
  orderOfferModalTitle: "SANCI offer",
  orderOfferModalDesc:
    "Enter the offer SANCI gives for this order. Leaving it unset means not decided yet; " +
    "if SANCI decides not to make an offer, use Remove offer — not the number 0 " +
    "(0 means an offer worth zero Rupiah).",
  orderOfferFieldLabel: "Offer amount (Rp)",
  orderOfferPlaceholder: "Example: 1,500,000",
  orderOfferSaveBtn: "Save offer",
  orderOfferClearBtn: "Remove offer",
  orderOfferClearingBtn: "Removing…",
  orderOfferClearConfirm:
    "Remove the offer amount for this order? The last value stays recorded in Activity.",
  orderOfferInvalid: "That offer amount is not valid. Enter a Rupiah number, for example 1,500,000.",
  orderOfferFeatureOffAction: "The SANCI offer feature is not active yet — the migration has not been run.",
  orderOfferDpFieldLabel: "Down payment (DP, Rp)",
  orderOfferPaymentConditionFieldLabel: "Payment condition",
  orderOfferPaymentConditionPlaceholder: "Example: Full payment, DP 50%",
  orderOfferRemainingLabel: "Remaining balance",
  orderOfferDpExceedsAmount: "The down payment cannot exceed the offer amount.",
  orderOfferNoPermissionView: "This partner isn't allowed to view its branches' SANCI offer yet — set it on the Access tab.",
  orderOfferNoPermissionEdit: "This partner isn't allowed to set the SANCI offer from a branch yet.",

  orderOfferDiscountSectionTitle: "Discount, markup & cash discount",
  orderOfferDiscountHint:
    "Each discount is applied in order from the base amount (8% then 10% = ×0.92×0.90, NOT 18%). " +
    "Markup applies after all discounts. Cash discount is subtracted last — used for rounding or " +
    "cash deals.",
  orderOfferDiscountFieldLabel: "Discount {n} (%)",
  orderOfferDiscountAddBtn: "+ Add discount",
  orderOfferDiscountRemoveBtn: "Remove",
  orderOfferDiscountMaxReached: "Maximum 6 discounts in one chain.",
  orderOfferMarkupFieldLabel: "Markup (%)",
  orderOfferCashFieldLabel: "Cash discount (Rp)",
  orderOfferFinalLiveLabel: "Final price (estimate)",
  orderOfferFinalLiveHint: "Recalculated live as you type — the saved value is always computed by the server.",
  orderOfferDiscountInvalid: "Each discount value must be more than 0 and less than 100.",
  orderOfferMarkupInvalid: "The markup value must be between 0 and 100.",
  orderOfferCashInvalid: "That cash discount value is not valid.",
  orderOfferNoPermissionDiscount: "This partner isn't allowed to set discounts from a branch yet — set it on the Access tab.",

  offerPermDiscountLabel: "May set discounts",
  offerPermDiscountDesc:
    "Branch staff can fill in the discount % chain, markup %, and cash discount on the SANCI offer " +
    "for their own branch's orders. Assumes the \"May set/edit the SANCI offer\" permission stays " +
    "on — without it this permission has no effect.",

  // ---- Order items (order-items-section.tsx, migration 0014) ----
  orderItemsCardTitle: "Order items",
  orderItemsEmpty: "No order items yet.",
  orderItemsFeatureOff: "The order items feature is not active yet — the database migration has not been run.",
  orderItemsCopyWarningPartial: "Some package items failed to copy into this order automatically — add lines manually if needed.",
  orderItemColName: "Name",
  orderItemColCode: "Code",
  orderItemColQty: "Qty",
  orderItemColNote: "Note",
  orderItemColColor: "Color",
  orderItemColSize: "Size",
  orderItemEditBtn: "Edit",
  orderItemDeleteBtn: "Delete",
  orderItemDeleteConfirm: "Delete the line \"{name}\" from this order? This cannot be undone.",
  orderItemAddBtn: "Add line",
  orderItemModalTitleAdd: "Add order line",
  orderItemModalTitleEdit: "Edit order line",
  orderItemNameFieldLabel: "Product name",
  orderItemNameRequired: "Product name is required.",
  orderItemQtyFieldLabel: "Quantity",
  orderItemNoteFieldLabel: "Note",
  orderItemColorFieldLabel: "Color code",
  orderItemSizeFieldLabel: "Custom size",
  orderItemUnitPriceFieldLabel: "Unit price (Rp)",
  orderItemLineDiscountFieldLabel: "Line deduction (Rp)",
  orderItemPriceFieldsLockedHint: "Price fields can only be filled in if the partner has the \"Can set/edit the SANCI offer\" permission.",
  orderItemSaveFailed: "Cannot save this line right now.",
  orderItemDeleteFailed: "Cannot delete this line right now.",
  orderItemQtyInvalid: "Quantity must be a whole number greater than 0.",
  orderItemPriceInvalid: "That price value is not valid.",

  // ---- Order documents (documents-section.tsx, migration 0016) ----
  docCardTitle: "Documents",
  docEmpty: "No documents for this order yet.",
  docFeatureOff: "The order documents feature is not active yet — the database migration has not been run.",
  docCreateSoBtn: "+ Create SO",
  docCreateDoBtn: "+ Create DO",
  docCreateInvoiceBtn: "+ Create Invoice",
  docColType: "Type",
  docColNumber: "Number",
  docColDate: "Date",
  docColLines: "Lines",
  docLinesCount: "{n} line(s)",
  docViewBtn: "Print",
  docEditBtn: "Edit",
  docDeleteBtn: "Delete",
  docDeleteConfirm: "Delete document {number}? This cannot be undone — its lines are deleted with it.",
  docDeleteFailed: "Cannot delete this document right now.",
  docSaveFailed: "Cannot save this document right now — check each item's quantity.",
  docModalTitleCreate: "Create {type} document",
  docModalTitleEdit: "Edit {type} document",
  docDateFieldLabel: "Document date",
  docDateRequired: "Document date is required.",
  docNotesFieldLabel: "Notes (optional)",
  docItemsSectionTitle: "Pick items",
  docItemColName: "Name",
  docItemColOrderedQty: "Ordered",
  docItemColCoveredQty: "Already covered",
  docItemColRemainingQty: "Remaining",
  docItemColInputQty: "Quantity",
  docItemQtyInvalid: "Quantity must be a whole number greater than 0, or leave it empty to exclude this item.",
  docItemOvership: "The quantity for \"{name}\" exceeds what remains available (remaining: {remaining}).",
  docTypeInvalid: "Unknown document type.",
  docNumberingFailed: "Cannot generate a document number right now — try again shortly.",
  docSaveBtn: "Save document",
  docNumberLabel: "Document number",
  docPrintBtn: "Print / Save PDF",
  docBackToOrderBtn: "Back to order",

  // ---- Customers (app/admin/pelanggan/page.tsx) — Phase 2 slice 13, migration 0018 ----
  customerCreatedViaSanci: "SANCI direct",
  customerCreatedViaUnknownPartner: "Unknown partner",
  customerTabList: "Customer List",
  customerTabSources: "Source Codes",
  customerTabSales: "Sales Codes",
  customerSearchPlaceholder: "Search name / phone / code…",
  customerEmpty: "No customers yet.",
  customerEmptyFiltered: 'No customers match "{q}".',
  customerColCode: "Customer Code",
  customerColSourceSales: "Source · Sales",
  customerColCreatedVia: "Created Via",
  customerCodeMigrationMsg: "The automatic customer code feature is not active yet — the migration has not been run.",

  // ---- Add Customer (add-customer-button.tsx) ----
  customerNameRequired: "Customer name is required.",
  customerPhoneInvalid: "Invalid phone number.",
  customerSourceSalesPairRequired: "Source and Sales must be filled in together, or left blank together — not just one.",
  customerAddBtn: "+ Add Customer",
  customerAddModalTitle: "Add Customer",
  customerSavedMsg: "Customer saved.",
  customerNoCodeGenerated: "No code (Source/Sales not filled in).",
  customerNameFieldLabel: "Customer name *",
  customerPhoneFieldLabel: "Phone *",
  customerSourceFieldLabel: "Source",
  customerSalesFieldLabel: "Sales",
  customerSourceSalesEmptyOption: "— Select —",
  customerSourceSalesHint:
    "Fill in both Source and Sales to get an automatic Customer Code, or leave both blank if not needed.",
  customerCreateBtn: "Save Customer",

  // ---- Master "Source Codes" / "Sales Codes" (master-data-section.tsx) ----
  sourceCodeFieldLabel: "Code *",
  sourceLabelFieldLabel: "Label *",
  sourceAddBtn: "+ Add Source",
  sourceAddModalTitle: "Add Source Code",
  sourceEditModalTitle: "Edit Source Code",
  sourceEmpty: "No source codes yet.",
  sourceColLabel: "Label",
  salesCodeFieldLabel: "Code *",
  salesNameFieldLabel: "Name *",
  salesAddBtn: "+ Add Sales",
  salesAddModalTitle: "Add Sales Code",
  salesEditModalTitle: "Edit Sales Code",
  salesEmpty: "No sales codes yet.",
  salesColName: "Name",
  customerMasterDeactivateTitle: "Deactivate {text}?",
  customerMasterDeactivateBody:
    "This code will no longer be selectable for new customers. Existing customers already using it are unchanged.",

  // ---- Server Actions (actions-customers.ts) ----
  sourceCodeInvalid: "Code must be 1–4 uppercase letters (A–Z).",
  sourceLabelRequired: "Label is required.",
  sourceCodeTaken: "This source code is already used by another active code.",
  sourceStatusChangeFailed: "Could not change the source's status right now.",
  salesCodeInvalid: "Code must be 1–4 uppercase letters (A–Z).",
  salesNameRequired: "Name is required.",
  salesCodeTaken: "This sales code is already used by another active code.",
  salesStatusChangeFailed: "Could not change the sales status right now.",

  // ---- Create order on behalf of a branch (orders/baru + actions-create-order.ts) ----
  orderCreateBtn: "+ Create order",
  orderCreateTitle: "Create order",
  orderCreateIntro:
    "The order is created on behalf of the selected partner & branch — that branch's account will see it as its own order, including any new customer.",
  orderCreateSelectPartnerPlaceholder: "— Choose a partner —",
  orderCreateSelectBranchPlaceholder: "— Choose a branch —",
  orderCreateNoActivePartners: "No active partners yet.",
  orderCreateNoActiveBranches: "This partner has no active branches yet.",
  orderCreateOptionsLoadFailed: "Couldn't load branches & packages — try again.",
  orderCreateStaffLoadFailed: "Couldn't load the staff list — try again.",
  orderCreatePhoneLabel: "Phone / WhatsApp number *",
  orderCreateChecking: "Checking customer…",
  orderCreateCheckFailed: "Couldn't check the customer — try again.",
  orderCreateCustomerFoundPrefix: "Customer found:",
  orderCreateUseCustomerCta: "Use this customer",
  orderCreateCustomerSelectedPrefix: "Customer selected:",
  orderCreateChangeCustomerCta: "Change customer",
  orderCreateNewCustomerHint: "No customer with this number yet — enter a name to create one.",
  orderCreateSectionLockedHint:
    "Choose a partner & branch, then fill in or confirm the customer above before filling in this section.",
  orderCreateAmountLabel: "Customer's total purchase at the store (optional)",
  orderCreateAmountHint: "Helps SANCI prepare a matching offer.",
  orderCreatePackageFieldLabel: "Package *",
  orderCreateSelectPackagePlaceholder: "— Choose a package —",
  orderCreatePackageManualOption: "Other (type manually)",
  orderCreatePackageNameFieldLabel: "Package name *",
  orderCreateSalesFieldLabel: "Sales *",
  orderCreateSelectSalesPlaceholder: "— Choose sales staff —",
  orderCreateNoActiveStaffHint: "No active staff at this branch yet.",
  orderCreatePicLabel: "PIC",
  orderCreateNotSelectedOption: "— Not selected —",
  orderCreateShippingLabel: "Shipping address",
  orderCreateShippingHint:
    "Can differ from the customer's address — e.g. ship to an office or another address. Always editable later.",
  orderCreateCustomerPoLabel: "Customer PO No.",
  orderCreateCustomerPoHint:
    "The customer's or store's own Purchase Order number (if any). Printed on the Invoice in the Purchase Order row.",
  orderCreateOptionalPlaceholder: "Optional...",
  orderCreateInvoiceFieldLabel: "Invoice photo/PDF (optional)",
  orderCreateInvoiceFieldHint:
    "PNG, JPG, WebP, or PDF. Max 5 MB — images are resized automatically before sending. Uploaded after the order is created.",
  orderCreateSubmitCta: "Create order",
  orderCreateSuccessBanner: "Order created successfully.",
  orderCreateOpenOrderCta: "Open order",
  orderCreateAgainCta: "Create another order",
  orderCreateUnknownAfterConfirm:
    "The order was likely saved, but its details couldn't load. Open the order list.",
  // Server Actions (actions-create-order.ts)
  orderCreatePairInvalid: "Invalid or inactive partner/branch — choose again.",
  orderCreateModuleInactive: "The Orders module isn't active in the database yet (migration not run).",
  orderCreateCustomerGone: "This customer could no longer be found. Reload the page and search again.",
  orderCreateFullNameRequired: "Full name is required.",
  orderCreatePhoneInvalid: "This phone number isn't valid.",
  orderCreateSalesRequired: "Please choose sales staff.",
  orderCreateSalesInvalid: "Sales staff must be chosen from this branch's active staff list.",
  orderCreatePicInvalid: "PIC must be chosen from this branch's active staff list.",
  orderCreatePackageNotFound: "Package not found, or it's no longer active. Please choose again.",
  orderCreatePackageRequired: "Please choose a package.",
  orderCreatePackageNameRequired: "Please enter a package name.",
  orderCreateFulfillmentRequired: "Choose a fulfillment path",
  orderCreateFulfillmentInvalid: "Invalid fulfillment path.",
  orderCreateAmountInvalid: "Invalid purchase amount.",
  orderCreatePartialFailed: "Customer saved. The order failed — send again; the customer is already selected.",
  orderCreatePartialUnknown:
    "Customer saved. The order's status couldn't be confirmed because the connection dropped — check the order list before trying again.",
  orderCreateSummaryUnavailable:
    "The order was saved but its details couldn't be reloaded. Open the order list to confirm.",
  orderCreateItemsCopyWarning: "Some package items failed to copy into this order automatically.",
  orderCreateInvoicePathInvalid: "Invoice location not recognized.",
  orderCreateInvoiceOrderCancelled: "This order is already cancelled — the invoice wasn't recorded.",
  orderCreateInvoiceRecordFailed: "The invoice couldn't be recorded — the order was still saved.",
  // Client-side invoice upload (orders/baru/invoice-upload-admin.ts)
  orderCreateInvoiceUploadFailed: "The invoice failed to upload — the order was still saved.",
  orderCreateInvoiceWrongType: "The invoice must be PNG, JPG, WebP, or PDF.",
  orderCreateInvoiceTooLarge: "The invoice can be at most 5 MB. Choose a smaller file.",
} satisfies Shape;

const zh = {
  navOrders: "合作商订单",
  navPartners: "合作商",
  navProducts: "产品",
  navCustomers: "客户",
  navCalculator: "方案计算器",

  calcAdminIntroNote:
    "跟分店端一样的方案计算器 —— SANCI 团队不用切换账号就能用。使用过程中任何内容都不会保存到系统;" +
    "在购物车分页点\"创建订单\",就能把数字和产品清单带到管理端的创建订单页面。",
  calcAdminConvertCta: "创建订单",
  calcAdminConvertScopeNote:
    "\"创建订单\"会把小计、折扣链和产品清单(名称、代码、数量、价格)带到管理端的创建订单页面 —— " +
    "在那里照常选择合作商和分店。",

  calcAdminHandoffBanner: "来自方案计算器:{n}件 · 小计{subtotal} · 最终金额{final}。",
  calcAdminHandoffApplyCta: "使用这些数字",
  calcAdminHandoffDismissCta: "忽略",
  calcAdminHandoffScopeHint:
    "这会把计算器的小计填入\"客户在店内的消费总额\"。订单创建成功后,折扣链会自动应用到这笔订单的 " +
    "SANCI 方案金额,计算器里的产品清单(名称、代码、数量、价格)也会自动加入订单明细。",
  calcAdminHandoffAppliedOk: "方案计算器的折扣链已成功应用到这笔订单的 SANCI 方案金额。",
  calcAdminHandoffAppliedFailed:
    "订单已经创建成功,但计算器的折扣链无法自动应用 —— 请到订单页面的 SANCI 方案金额部分手动设置。",
  calcAdminItemsAppliedPriceNote: "单价没有一起保存 —— 请到订单明细检查并补上。",
  formItemsAppliedOk: "已成功把 {n} 件产品加入这笔订单。",
  formItemsAppliedPartial:
    "{total} 件产品中,{n} 件已成功加入这笔订单;其余失败 —— 请到订单明细检查并手动补上。",
  formItemsAppliedFailed:
    "订单已经创建成功,但选中的产品无法自动加入 —— 请到订单明细手动补上。",

  openBtn: "打开",
  filterStatusAll: "状态：全部",
  filterAccessAll: "权限：全部",
  accessViewOnly: "只能查看",
  accessViewEdit: "查看和修改",
  savedMsg: "已保存。",
  tabOverview: "概览",
  tabBranches: "分店",
  tabPackages: "套装",
  tabUsers: "账号",
  tabPermissions: "权限",
  tabHistory: "历史记录",
  tabStaff: "员工",
  tabActivity: "操作记录",

  partnersSearchPlaceholder: "搜索合作商 / 分店 / 编号…",
  partnersColBrand: "品牌",
  partnersColAccess: "权限",
  partnersAccessNotSet: "未设置",
  partnersEmpty: "暂无合作商。",
  partnersEmptyFiltered: "没有符合“{q}”的合作商。",
  partnersMatchedBranch: "匹配的分店：{branch}",

  partnerAddBtn: "+ 新增合作商",
  partnerAddModalTitle: "新增合作商",
  partnerDupWarning: "可能是重复：{name}。再次点击“新建合作商”可继续新建，或取消。",
  partnerNameFieldLabel: "合作商名称 *",
  partnerNameHint: "门店/公司的显示名称 —— 在所有管理界面中显示，也是分店账号在应用首页看到的门店标识。",
  partnerCodeFieldLabel: "合作商编号 *",
  partnerCodeHint:
    "2–8 位字符，A–Z、0–9 及连字符 —— 例如 GH。它会成为每个订单编号的开头（如 GH-BSD-260817-0001）" +
    "和建议的登录 ID；合作商启用后编号无法再修改。",
  partnerCreateBtn: "新建合作商",
  partnerCreateBtnDup: "仍要新建合作商",
  partnerCreatingBtn: "保存中…",

  closeBtn: "关闭",
  partnerEditModalTitle: "修改合作商",
  partnerCodeLockedHint: "合作商处于{status}状态期间编号被锁定。",
  partnerLogoFieldLabel: "Logo（选填）",
  partnerLogoHint: "PNG、JPG 或 WebP 格式。最大 5 MB —— 图片会在上传前自动压缩。留空表示不修改 Logo。",
  partnerSuspendBtn: "暂停",
  partnerReactivateBtn: "重新启用",
  partnerEndPartnershipBtn: "结束合作",
  partnerDeleteDraftBtn: "删除草稿",
  partnerActivateBtn: "启用合作商",
  partnerActivateHint: "旁边“启用条件”卡片中的步骤全部完成后，此按钮才能点击。",
  partnerDeactivateModalTitle: "确定结束与 {name} 的合作？",
  partnerDeactivateBody:
    "状态将变为已停用，该合作商会退出日常工作流程。所有分店、员工和历史记录都会保留，管理员以后仍可" +
    "通过“重新启用”按钮恢复合作。如果只是想暂时停一停，请用“暂停”，不要用这个按钮。",
  partnerDeactivateFieldLabel: "输入 {code} 以确认",
  partnerDeactivateConfirmBtn: "结束合作",
  partnerDeleteModalTitle: "删除 {name}？",
  partnerDeleteFieldLabel: "输入 {code} 以永久删除",
  partnerDeletePermanentBtn: "永久删除",
  partnerDeletingBtn: "删除中…",

  partnerNameRequired: "合作商名称为必填项。",
  partnerCodeInvalid: "2–8 位字符，只能是 A–Z、0–9 及连字符。",
  partnerCodeTaken: "合作商编号 {code} 已被使用。",
  partnerNotFound: "未找到该合作商。",
  partnerActivationRequirementsMissing: "启用条件尚未满足。",
  partnerStatusChangeFailed: "现在无法修改状态。",
  partnerDeleteDraftOnly: "只有草稿状态的合作商可以永久删除。",
  partnerDeleteCodeMismatch: "请准确输入 {code} 以确认。",
  partnerHasRelatedData: "该合作商已有关联数据，无法永久删除。",
  partnerDeleteFailed: "现在无法删除该合作商。",
  logoUploadFailed: "Logo 上传失败 —— 合作商信息已保存。",
  logoUrlUnrecognized: "无法识别 Logo 地址。",

  partnerInfoTitle: "合作商信息",
  activationRequirementsTitle: "启用条件",
  gateIntro: "请先完成这三个步骤；全部完成后，“启用合作商”按钮才能点击。",
  gateReqBranch: "至少 1 个启用分店",
  gateReqUser: "至少 1 个启用登录账号",
  gateReqAccess: "已设置权限",
  gateGoBranches: "打开“分店”标签页",
  gateGoUsers: "打开“账号”标签页",
  gateGoAccess: "打开“权限”标签页",
  gateUnknownNote: "暂时无法检查 —— 请刷新页面重试。",
  gateStaffRecommended: "至少 1 名员工 —— 建议完成",
  gateStaffWhy: "不影响启用，但分店以后创建订单时需要（选择销售员/负责人）。员工在分店详情页添加。",
  branchesEmpty: "暂无分店。",

  packageMigrationMsg: "套装功能尚未启用 —— 迁移脚本还没有执行。",
  packagesEmpty: "暂无套装。",
  packageAddBtn: "+ 新增套装",
  packageAddModalTitle: "新增套装",
  packageNameFieldLabel: "套装名称 *",
  packageNameHint: "分店员工在新建订单时选择套装，看到的就是这个名称。",
  packageCodeFieldLabel: "套装编号 *",
  packageCodeHint: "在该合作商内需唯一。其他合作商可以使用相同编号。",
  packageDescFieldLabel: "说明",
  packageCreateBtn: "新建套装",
  packageEditModalTitle: "修改套装",
  packageNameRequired: "套装名称为必填项。",
  packageCodeTaken: "该套装编号已被使用。",
  packageItemsTitle: "套装内容",
  packageItemsLink: "套装内容",
  packageItemsEmpty: "该套装还没有产品。",
  packageItemsAdd: "添加产品",
  packageItemsSearchPlaceholder: "搜索产品名称或编号…",
  packageItemsNoMatch: "没有匹配的产品。",
  packageItemsAllAdded: "所有启用的产品都已在该套装中。",
  packageItemRemove: "删除",
  packageItemRemoveConfirm: "确定从该套装中删除 {name} 吗？",
  packageItemQtyInvalid: "数量必须是大于 0 的整数。",
  packageItemDuplicate: "该产品已在套装中。请直接修改已有那一行的数量。",
  packageItemMigrationMsg: "套装内容功能尚未启用 —— 迁移脚本 0012 还没有执行。",
  packageItemCatalogEmpty: "产品目录还是空的 —— 请先在「产品」菜单里添加产品。",

  colAddress: "地址",

  branchAddBtn: "+ 新增分店",
  branchAddModalTitle: "新增分店",
  branchNameFieldLabel: "分店名称 *",
  branchNameHint: "显示在管理界面的分店下拉选项和订单列表中，分店自己的员工在应用里也会看到。",
  branchCodeFieldLabel: "分店编号 *",
  branchCodeHint:
    "分店的简短编号 —— 会成为该分店每个订单编号和客户代码的一部分（如 GH-BSD-260817-0001 中的 BSD）。" +
    "在该合作商内需唯一，其他合作商可以使用相同编号。",
  branchAddressFieldLabel: "详细地址 *",
  branchCreateBtn: "新建分店",
  branchEditModalTitle: "修改分店",
  branchSuspendBtn: "暂停",
  branchReactivateBtn: "重新启用",
  branchNameRequired: "分店名称为必填项。",
  branchAddressRequired: "详细地址为必填项。",
  branchCodeTaken: "分店编号 {code} 在该合作商下已存在。",
  branchNotFound: "未找到该分店。",

  usersServiceKeyMissing:
    "本服务器尚未启用新建登录账号和重设密码功能。请让技术人员在 Vercel 中填写环境变量 " +
    "SUPABASE_SERVICE_ROLE_KEY，之后本页面会自动出现“新增账号”和“重设密码”按钮。目前仍可以" +
    "停用和重新启用已有账号。",
  usersNoActiveBranch: "还没有启用的分店。请先到“分店”标签页新建并启用分店 —— 每个登录账号都必须绑定一个分店。",
  usersEmpty: "暂无登录账号。",
  usersFootnote:
    "一个分店使用一个共用账号；创建订单时，销售员姓名和负责人仍从员工名单中选择。登录 ID 不会显示在" +
    "此列表中 —— 请在创建账号时记录下来。密码由门店自行决定，由管理员在创建账号时输入；保存后系统" +
    "无法再次显示给任何人。如果门店忘记密码，点击对应行的“重设密码”设置新密码 —— 不要为同一分店" +
    "重复新建账号。",
  userToggleDeactivateBtn: "停用",
  userToggleReactivateBtn: "重新启用",
  userToggleFailed: "现在无法修改账号状态。",
  userNotFound: "未找到该账号。",

  userAddBtn: "+ 新增账号",
  userAddModalTitle: "新增登录账号",
  userAddInfoBanner:
    "一个分店使用一个共用账号。创建订单时，销售员姓名和负责人仍从员工名单中选择 —— 不是从此账号中" +
    "选择。密码由门店自行决定，由你在此输入；保存后系统无法再次显示给任何人。如果门店以后忘记密码，" +
    "请在账号列表中使用“重设密码”按钮设置新密码。",
  userNameFieldLabel: "名称 *",
  userNameHint: "仅是显示在账号列表中的名称，例如门店或分店名称 —— 不用于登录。",
  userBranchFieldLabel: "分店 *",
  userEmailFieldLabel: "登录 ID *",
  userEmailHint:
    "系统已根据合作商编号和分店编号自动生成建议，直接使用即可，也可以修改。它看起来像邮箱，但不是" +
    "真实邮箱，也不会收信；门店登录时把这个 ID 填进“邮箱”一栏。",
  userPasswordFieldLabel: "门店选定的密码 *",
  userPasswordHint:
    "请输入门店自己要求的密码（通常会通过 WhatsApp 告知）—— 不是系统生成的密码。最少 {min} 位字符。" +
    "此处故意不做隐藏显示，方便你在保存前确认输入无误。",
  userCreateBtn: "创建账号",
  userCreatingBtn: "创建中…",
  userCredentialTitle: "登录账号创建成功",
  userCredentialWarning:
    "下方的密码只有现在能看到，因为是你刚刚亲手输入的。系统不会保存可再次读取的密码副本，所以这个" +
    "弹窗关闭后，任何人 —— 包括 SANCI —— 都无法再次看到它。请确认门店已经拿到这个密码，再关闭弹窗。",
  userCredentialEmailLabel: "登录 ID",
  userCredentialPasswordLabel: "密码",
  userCredentialFootnote:
    "这个登录 ID 虽然是邮箱格式，但不会收信 —— 门店登录时把它填进“邮箱”一栏。如果门店忘记密码，" +
    "不要新建账号：请打开“账号”标签页，在对应行点击“重设密码”设置新密码。",
  copyCredentialsBtn: "复制邮箱和密码",
  copyDoneBtn: "已经记录 —— 关闭",
  copySuccessMsg: "已复制。现在去 WhatsApp 发给店长吧。",
  copyFailMsg: "此设备无法自动复制 —— 请从屏幕上手动抄录。",
  userCreateUnconfirmedMsg:
    "网络在服务器回应之前就中断了，暂时无法确认登录账号是否创建成功。请不要立刻重新创建。刷新本" +
    "页面并查看“账号”列表：如果账号还没出现，但刚才那个邮箱因为已被使用而被拒绝，请联系技术人员并" +
    "告知该邮箱地址。",

  resetPasswordBtn: "重设密码",
  resetPasswordModalTitle: "重设密码",
  resetPasswordWarningBanner:
    "账号 {user}{branch} 的旧密码将在保存后立即失效。请确保能马上把新密码发给店长 —— 否则他们将无法" +
    "登录。当前已登录的设备可能仍可继续使用，直到主动退出登录。",
  resetPasswordInfoBanner:
    "任何人都无法查看旧密码，包括 SANCI —— 系统只保存密码的指纹，而不是密码本身。所以对于忘记密码的" +
    "门店，唯一的办法就是在这里设置新密码。请先询问门店想要的密码，再输入到下方。",
  resetPasswordFieldLabel: "门店选定的新密码 *",
  resetPasswordHint: "最少 {min} 位字符。此处故意不做隐藏显示，方便你在保存前确认输入无误。",
  resetPasswordRepeatFieldLabel: "再次输入新密码 *",
  resetPasswordRepeatHint: "必须与上方完全一致。一个字符打错都会导致门店完全无法登录。",
  resetPasswordMismatchErr: "两次输入的密码不一致，请再检查一次 —— 大小写也会被区分。",
  resetPasswordSaveBtn: "保存新密码",
  resetPasswordDoneTitle: "密码已更新",
  resetPasswordDoneWarning:
    "请立即把新密码发给店长。旧密码已经失效，在新密码送达之前他们将无法登录。这个弹窗关闭后，系统" +
    "无法再次显示给任何人。",
  resetPasswordDoneNewLabel: "新密码",
  resetPasswordCopyBtn: "复制密码",
  resetPasswordCloseBtn: "已经发送 —— 关闭",
  resetPasswordUnconfirmedMsg:
    "网络在服务器回应之前就中断了，暂时无法确认密码是否修改成功。请用同一个新密码再试一次 —— 重复" +
    "提交同样的密码不会有问题。在这个页面确认成功之前，不要告诉门店已经完成。",

  userNotAuthorized: "你没有权限创建登录账号。",
  userPermCheckFailed: "现在无法确认你的权限，请刷新页面后重试。",
  userServiceKeyMissingCreate:
    "由于服务器设置尚未完成，暂时无法创建登录账号。请让技术人员在 Vercel 中填写环境变量 " +
    "SUPABASE_SERVICE_ROLE_KEY，然后重新打开本页面。你输入的内容都没有被保存。",
  userEmailTaken: "该登录 ID 已被使用，请换一个。如果你认为它不应该被占用，请联系技术人员 —— 不要强行重新创建。",
  userWeakPassword: "登录系统拒绝了该密码，因为不满足安全要求。请让门店选择更长的密码，并混合使用大写字母、小写字母和数字。",
  userEmailRejected: "登录系统拒绝了这个登录 ID，请检查拼写后重试。",
  userCreateFailedGeneric: "现在无法创建登录账号，请稍后再试。",
  userCreateCleanRollback: "登录账号创建失败，系统中没有留下任何残留数据。请用相同邮箱再试一次。",
  userHalfCreated:
    "邮箱 {email} 的登录账号已在登录系统中创建，但尚未关联到合作商，因此还不能用于登录。请不要用同" +
    "一邮箱再次创建。请记下该邮箱并联系技术人员。",
  userNameRequiredField: "名称为必填项。",
  userEmailRequiredField: "登录 ID 为必填项。",
  userEmailFormatInvalid: "登录 ID 需要是邮箱格式。示例：gh-bsd@sanci.com",
  userPasswordRequiredField: "门店的密码为必填项。",
  userPasswordTooShort: "密码至少需要 {min} 位字符。请让门店选择更长的密码。",
  userBranchRequiredField: "必须选择分店。",
  userBranchNotFoundOnPartner: "在该合作商下未找到该分店。",
  userBranchInactive: "该分店当前处于停用状态。请先启用分店，再创建账号。",

  resetServiceKeyMissing:
    "由于服务器设置尚未完成，暂时无法修改密码。请让技术人员在 Vercel 中填写环境变量 " +
    "SUPABASE_SERVICE_ROLE_KEY，然后重新打开本页面。旧密码目前仍照常有效。",
  resetAccountNotFound: "未找到该账号，请刷新本页面后重试。",
  resetAccountIncomplete: "该账号尚未关联登录系统，无法在此修改密码，请联系技术人员。",
  resetGenericFail: "现在无法修改密码，旧密码仍然有效，请稍后再试。",
  resetPasswordRequiredField: "新密码为必填项。",
  resetPasswordTooShortField: "新密码至少需要 {min} 位字符。",

  catalogMigrationMsg: "产品目录功能尚未启用 —— 迁移脚本还没有执行。",
  permVisibilityTitle: "分店可见范围",
  permVisibilityDesc: "只有 SANCI 管理员可以修改此设置。此设置对 {partner} 的所有登录账号生效。",
  permNotConfiguredWarning: "尚未设置 —— 目前生效的是：仅本店（默认）。",
  permOwnBranchDesc: "每个分店只能看到自己的分店。",
  permAllBranchesLabel: "同合作商全部分店",
  permAllBranchesDesc: "{partner} 的所有分店可以互相查看，但绝不会看到其他合作商。",
  permEditTitle: "对其他分店的权限",
  permViewOnlyDesc: "其他分店只能查看。",
  permViewEditDesc: "也可以管理其他分店的员工。",
  permSaveBtn: "保存权限",
  permFootnote: "指定分店规则（例如仅限雅加达 A ↔ 雅加达 B）已为后续阶段做好准备 —— 数据结构已支持，此页面尚未开放。",
  visibilityScopeInvalid: "可见范围无效。",
  editScopeInvalid: "修改范围无效。",
  permSaveFailed: "现在无法保存权限设置。",

  // ---- SANCI 方案金额权限（offer-permissions-form.tsx，迁移 0014） ----
  offerPermTitle: "SANCI 方案金额权限",
  offerPermDesc:
    "设置 {partner} 的分店员工是否可以查看／填写自己分店订单的 SANCI 方案金额。" +
    "不管这里怎么设置，分店永远看不到其他合作商的方案金额。",
  offerPermViewLabel: "可以查看 SANCI 方案金额",
  offerPermViewDesc: "分店员工可以查看自己分店订单的方案金额、订金、付款条件。",
  offerPermEditLabel: "可以填写／修改 SANCI 方案金额",
  offerPermEditDesc:
    "分店员工可以填写／修改自己分店订单的方案金额、订金、付款条件，以及每一行的价格。" +
    "删除方案金额仍然只有 SANCI 管理员能做。",
  offerPermSaveBtn: "保存方案金额权限",
  offerPermSaveFailed: "现在无法保存方案金额权限。",

  catalogAccessTitle: "SANCI 产品目录",
  catalogAccessDesc: "开启后，该合作商的所有分店都可以查看 SANCI 产品目录。",
  catalogOpenLabel: "开放",
  catalogClosedLabel: "关闭",
  catalogSaveFailed: "现在无法保存产品目录设置。",

  branchInfoColCode: "分店编号",
  branchInfoColAddress: "详细地址",
  staffInfoBanner: "分店：{partner} · {branch} —— 由本页面自动带入，无法选择。",
  staffEmpty: "该分店暂无登记的员工。",
  staffNoPhone: "无电话",
  activityEmpty: "暂无操作记录。",
  auditFootnote: "操作记录只会增加。应用内没有任何方式可以修改或删除它。",

  staffAddBtn: "+ 新增员工",
  staffAddModalTitle: "新增员工",
  staffNameFieldLabel: "姓名 *",
  staffNameHint: "创建订单时，销售员/负责人的选项里显示的就是这个姓名；它也会作为销售员姓名打印在 SO 单据上。",
  staffRoleFieldLabel: "角色 *",
  staffRoleHint: "门店内的业务角色 —— 与系统登录权限无关。",
  staffCodeFieldLabel: "员工代码",
  staffCodeHint:
    "选填 —— 系统会按姓名首字母自动给出建议，可随意修改。它会成为该员工所服务客户的自动客户代码的" +
    "一部分（如 GH-BSD-AS/26/001 中的 AS）；暂时不需要可以留空。",
  staffCodeInvalidFormat: "员工代码只能是大写字母/数字,最多10个字符。",
  staffCodeTaken: "这个员工代码已经被同一个合作商的其他员工使用。",
  staffCreateBtn: "新增员工",
  staffRoleSales: "销售",
  staffRoleReception: "前台 / 客服",
  staffRoleManager: "经理",
  staffRoleOther: "其他",

  staffEditModalTitle: "修改员工",
  staffTransferModalTitle: "调动 {name}",
  staffTransferDesc: "调动会结束原有分配并新建一条 —— 历史记录不会被改写。",
  staffTransferBranchFieldLabel: "目标分店 *",
  staffTransferBtn: "调动",
  staffTransferringBtn: "调动中…",
  staffDeactivateBtn: "停用",
  staffDeactivateConfirm: "确定停用 {name}？历史记录会保留。",
  staffFullNameRequired: "姓名为必填项。",
  staffDeactivateFailed: "现在无法停用。",
  staffAssignmentSavedFailed: "现在无法保存角色。",
  staffTransferActiveNotFound: "未找到当前有效的分配记录。",
  staffTransferFailed: "现在无法调动。",
  staffAssignmentPartialFail: "员工信息已保存，但分店分配失败，请联系技术支持。",

  produkSearchPlaceholder: "搜索产品名称 / 编号…",
  filterStockAll: "库存：全部",
  filterCategoryAll: "分类：全部",
  produkEmpty: "暂无产品。",
  produkEmptyFiltered: "没有符合“{q}”的产品。",
  produkEmptyFilteredCategory: "这个分类下暂无产品。",
  produkFootnote: "已停用的产品对合作商不可见。",
  productNoPhoto: "暂无照片",
  productStockFieldLabel: "库存状态",

  productAddBtn: "+ 新增产品",
  productAddModalTitle: "新增产品",
  productNameFieldLabel: "产品名称 *",
  productCodeFieldLabel: "编号",
  productCategoryFieldLabel: "分类",
  productStockStatusFieldLabel: "库存状态",
  productBasePriceFieldLabel: "SANCI 基准价(Rp)",
  productBasePriceHint: "选填。所有合作商的起始价 —— 每个合作商都可以用本店标准售价覆盖。清空后保存即删除。",
  productBasePriceLoadFailed: "基准价加载失败 —— 为避免误删价格,此栏已停用。请关闭后重新打开再试。",
  productBasePriceSaveFailed: "产品已保存,但 SANCI 基准价保存失败。请打开\"修改产品\"重新填写。",
  productBasePriceInvalid: "请输入正确的 Rupiah 金额。",
  productPhotoFieldLabel: "照片（选填）",
  productPhotoHint: "PNG、JPG 或 WebP 格式。最大 5 MB —— 图片会在上传前自动压缩。",
  productPhotoHintKeep: "PNG、JPG 或 WebP 格式。最大 5 MB。留空表示不修改照片。",
  productCreateBtn: "新建产品",
  productEditModalTitle: "修改产品",
  productNameRequired: "产品名称为必填项。",
  productStockStatusInvalid: "库存状态无效。",
  productCodeTaken: "该产品编号已被使用。",
  productStockChangeFailed: "现在无法修改库存状态。",
  productStatusChangeFailed: "现在无法修改产品状态。",
  productStatusInvalid: "产品状态无效。",
  photoUploadFailed: "照片上传失败 —— 产品信息已保存。",
  photoUrlUnrecognized: "无法识别照片地址。",
  catalogSettingInvalid: "现在无法保存产品目录设置。",

  ordersFeatureOff: "订单功能尚未启用 —— 数据库迁移脚本还没有执行。",
  ordersSearchPlaceholder: "搜索订单编号 / 客户姓名 / 电话…",
  filterFulfillmentAll: "交付方式：全部",
  ordersEmpty: "暂无订单。",
  ordersEmptyFiltered: "没有符合“{q}”的订单。",
  colCustomer: "客户",
  colSales: "销售员",
  colFulfillment: "交付方式",
  picLabel: "负责人",
  ordersShowingCount: "显示最新 {n} 条{cap}。",
  ordersShowingCap: "（最多 50 条）",

  orderFeatureOff: "订单模块在数据库中尚未启用（迁移脚本还没有执行）。",
  orderDetailLoadFailed: "订单详情加载失败。",
  orderOverline: "合作商订单",
  orderBranchPrefix: "{branch} 分店",
  branchUnknown: "未找到",
  partnerUnknown: "未找到该合作商",
  customerCardTitle: "客户",
  customerUnknown: "未知客户",
  orderCardTitle: "订单",
  packageCodeInactive: "（编号 {code}，已停用）",
  packageCodeActive: "（编号 {code}）",
  personInactiveSuffix: "（已停用）",
  fulfillmentMigrationOff: "迁移脚本还没有执行",
  fulfillmentReported: "尚未上报",
  viewInvoiceBtn: "查看 Invoice",
  invoiceNotLoadable: "Invoice 暂时无法加载。",
  invoiceNotUploaded: "尚未上传",
  createdAtServerTimeSuffix: " · 服务器时间",
  customerArrivedLabel: "客户已到店",
  markArrivedBtn: "标记客户已到店",
  orderCancelledTitle: "订单已取消",
  cancelInfoMigrationOff: "取消信息暂不可用（数据库迁移脚本还没有执行）。",
  cancelReasonPrefix: "原因：",
  cancelTimePrefix: "时间：",
  internalNoteCardTitle: "SANCI 内部备注",
  internalNoteVisibilityWarning: "仅 SANCI 可见 —— 合作商无法看到此部分。",
  internalNoteFeatureOff: "内部备注功能尚未启用 —— 数据库迁移脚本还没有执行。",
  internalNoteEmpty: "该订单暂无内部备注。",
  internalNoteFootnote: "内部备注只会增加。写错时请添加新备注更正，而不是修改旧的内容。",
  orderActivityEmpty: "该订单暂无操作记录。",
  attributionDiffLabel: "分店：{before} → {after}",
  reasonDiffPrefix: "原因：",

  correctAttributionBtn: "更正分店",
  correctAttributionModalTitle: "更正订单分店",
  correctAttributionDesc:
    "当前分店：{branch}。只能选择同一合作商下的其他分店 —— 无法在此屏幕更改合作商。每次更正都会连同" +
    "原因记录在操作记录中。",
  correctAttributionNoOtherBranches: "该合作商没有其他启用的分店。",
  correctAttributionBranchFieldLabel: "目标分店 *",
  correctAttributionBranchPlaceholder: "— 请选择分店 —",
  correctAttributionReasonFieldLabel: "更正原因 *",
  correctAttributionReasonPlaceholder: "示例：录入订单时选错了分店……",
  correctAttributionSaveBtn: "保存更正",
  correctAttributionBranchRequired: "请选择目标分店。",
  correctAttributionReasonRequired: "更正原因为必填项。",
  correctAttributionReasonTooLong: "原因过长（最多 500 个字符）。",
  correctAttributionMigrationOff: "分店更正功能尚未启用 —— 迁移脚本还没有执行。",
  correctAttributionGenericFail: "现在无法更正分店归属，请检查目标分店后重试。",

  markArrivedModalTitle: "标记客户已到店",
  markArrivedDesc:
    "订单 {orderNumber}（客户 {customer}）将被标记为客户已到达 SANCI。标记时间和操作人会自动记录在" +
    "操作记录中，且无法在此屏幕修改。",
  markArrivedConfirmBtn: "是，已到店",
  markArrivedMarkingBtn: "标记中…",
  fulfillmentMigrationOffOrder: "交付方式功能尚未启用 —— 数据库迁移脚本还没有执行。",
  orderNotFound: "未找到该订单。",
  markArrivedWrongFulfillment: "只有“到店选购”交付方式的订单可以标记到店。",
  markArrivedFailed: "现在无法标记到店，请重试。",

  internalNoteFieldLabel: "新增备注",
  internalNotePlaceholder: "示例：Invoice 250 万 → 已向客户提供装修折扣优惠。",
  internalNoteSaveBtn: "保存备注",
  internalNoteEmptyErr: "备注不能为空。",
  internalNoteTooLong: "备注过长（最多 2000 个字符）。",
  internalNoteFeatureOffAction: "内部备注功能尚未启用 —— 迁移脚本还没有执行。",

  orderOfferCardTitle: "SANCI 方案金额",
  orderOfferVisibilityWarning:
    "仅 SANCI 可见。合作商和分店完全看不到这个金额 —— 不只是界面上隐藏，数据库层面就会拒绝。",
  orderOfferFeatureOff: "SANCI 方案金额功能尚未启用 —— 数据库迁移脚本还没有执行。",
  orderOfferEmpty: "该订单暂无 SANCI 方案金额。",
  orderOfferFootnote:
    "这个金额只是 SANCI 针对本订单的决定，不是产品价格。每次填写、修改、删除都会连同修改前后的数值记录在操作记录里。",
  orderOfferSetBtn: "填写方案金额",
  orderOfferEditBtn: "修改方案金额",
  orderOfferModalTitle: "SANCI 方案金额",
  orderOfferModalDesc:
    "填写 SANCI 为这笔订单提供的方案金额。留空表示还没决定；如果 SANCI 决定不提供方案，请用「删除方案金额」按钮，不要填 0（0 表示金额为零的方案）。",
  orderOfferFieldLabel: "方案金额（Rp）",
  orderOfferPlaceholder: "示例：1.500.000",
  orderOfferSaveBtn: "保存方案金额",
  orderOfferClearBtn: "删除方案金额",
  orderOfferClearingBtn: "删除中…",
  orderOfferClearConfirm: "确定删除该订单的方案金额？最后一次的数值仍会保留在操作记录里。",
  orderOfferInvalid: "方案金额不正确。请填写印尼盾数字，例如 1.500.000。",
  orderOfferFeatureOffAction: "SANCI 方案金额功能尚未启用 —— 迁移脚本还没有执行。",
  orderOfferDpFieldLabel: "订金（Rp）",
  orderOfferPaymentConditionFieldLabel: "付款条件",
  orderOfferPaymentConditionPlaceholder: "示例：全款、订金 50%",
  orderOfferRemainingLabel: "尾款",
  orderOfferDpExceedsAmount: "订金不能超过方案金额。",
  orderOfferNoPermissionView: "该合作商还没有查看自己分店 SANCI 方案金额的权限 —— 到「权限」分页设置。",
  orderOfferNoPermissionEdit: "该合作商的分店还没有填写 SANCI 方案金额的权限。",

  orderOfferDiscountSectionTitle: "折扣、加成与现金折让",
  orderOfferDiscountHint:
    "每笔折扣按顺序从基础金额开始计算（先 8% 再 10% = ×0.92×0.90，不是 18%）。加成在所有折扣之后计算。" +
    "现金折让最后扣除 —— 用于凑整数或现金优惠。",
  orderOfferDiscountFieldLabel: "折扣 {n}（%）",
  orderOfferDiscountAddBtn: "+ 添加折扣",
  orderOfferDiscountRemoveBtn: "删除",
  orderOfferDiscountMaxReached: "一条折扣链最多 6 笔折扣。",
  orderOfferMarkupFieldLabel: "加成（%）",
  orderOfferCashFieldLabel: "现金折让（Rp）",
  orderOfferFinalLiveLabel: "最终金额（预估）",
  orderOfferFinalLiveHint: "这是输入时在界面上即时算出的预估值 —— 实际保存的数字始终由服务器计算。",
  orderOfferDiscountInvalid: "每笔折扣数值必须大于 0 且小于 100。",
  orderOfferMarkupInvalid: "加成数值必须在 0 到 100 之间。",
  orderOfferCashInvalid: "现金折让数值无效。",
  orderOfferNoPermissionDiscount: "该合作商的分店还没有设置折扣的权限 —— 到「权限」分页设置。",

  offerPermDiscountLabel: "可以设置折扣",
  offerPermDiscountDesc:
    "分店员工可以为自己分店的订单填写折扣链百分比、加成百分比和现金折让。这个权限需要同时保持" +
    "「可以填写/修改 SANCI 方案金额」打开 —— 否则这个权限不会有任何作用。",

  // ---- 订单明细（order-items-section.tsx，迁移 0014） ----
  orderItemsCardTitle: "订单明细",
  orderItemsEmpty: "该订单暂无明细。",
  orderItemsFeatureOff: "订单明细功能尚未启用 —— 数据库迁移脚本还没有执行。",
  orderItemsCopyWarningPartial: "部分套装内容未能自动复制到这笔订单 —— 需要的话请手动新增。",
  orderItemColName: "名称",
  orderItemColCode: "代码",
  orderItemColQty: "数量",
  orderItemColNote: "备注",
  orderItemColColor: "颜色",
  orderItemColSize: "尺寸",
  orderItemEditBtn: "修改",
  orderItemDeleteBtn: "删除",
  orderItemDeleteConfirm: "确定要删除这笔订单里的「{name}」吗？此操作无法撤销。",
  orderItemAddBtn: "新增一行",
  orderItemModalTitleAdd: "新增订单明细",
  orderItemModalTitleEdit: "修改订单明细",
  orderItemNameFieldLabel: "产品名称",
  orderItemNameRequired: "产品名称为必填项。",
  orderItemQtyFieldLabel: "数量",
  orderItemNoteFieldLabel: "备注",
  orderItemColorFieldLabel: "颜色代码",
  orderItemSizeFieldLabel: "定制尺寸",
  orderItemUnitPriceFieldLabel: "单价（Rp）",
  orderItemLineDiscountFieldLabel: "单行扣减金额（Rp）",
  orderItemPriceFieldsLockedHint: "只有合作商拥有「可以填写／修改 SANCI 方案金额」权限时才能填写价格栏位。",
  orderItemSaveFailed: "现在无法保存这一行。",
  orderItemDeleteFailed: "现在无法删除这一行。",
  orderItemQtyInvalid: "数量必须是大于 0 的整数。",
  orderItemPriceInvalid: "价格数值不正确。",

  // ---- 订单文档（documents-section.tsx，迁移 0016） ----
  docCardTitle: "文档",
  docEmpty: "该订单暂无文档。",
  docFeatureOff: "订单文档功能尚未启用 —— 数据库迁移脚本还没有执行。",
  docCreateSoBtn: "+ 新建 SO",
  docCreateDoBtn: "+ 新建 DO",
  docCreateInvoiceBtn: "+ 新建 Invoice",
  docColType: "类型",
  docColNumber: "编号",
  docColDate: "日期",
  docColLines: "行数",
  docLinesCount: "{n} 行",
  docViewBtn: "打印",
  docEditBtn: "修改",
  docDeleteBtn: "删除",
  docDeleteConfirm: "删除文档 {number}？此操作无法撤销 —— 其内容行也会一并删除。",
  docDeleteFailed: "现在无法删除这份文档。",
  docSaveFailed: "现在无法保存这份文档 —— 请检查每个项目的数量。",
  docModalTitleCreate: "新建 {type} 文档",
  docModalTitleEdit: "修改 {type} 文档",
  docDateFieldLabel: "文档日期",
  docDateRequired: "文档日期为必填项。",
  docNotesFieldLabel: "备注（选填）",
  docItemsSectionTitle: "选择项目",
  docItemColName: "名称",
  docItemColOrderedQty: "订购数量",
  docItemColCoveredQty: "已覆盖数量",
  docItemColRemainingQty: "剩余数量",
  docItemColInputQty: "数量",
  docItemQtyInvalid: "数量必须是大于 0 的整数，留空则表示不包含此项目。",
  docItemOvership: "「{name}」的数量超过剩余可用数量（剩余 {remaining}）。",
  docTypeInvalid: "无法识别的文档类型。",
  docNumberingFailed: "现在无法生成文档编号 —— 请稍后再试。",
  docSaveBtn: "保存文档",
  docNumberLabel: "文档编号",
  docPrintBtn: "打印／保存 PDF",
  docBackToOrderBtn: "返回订单",

  // ---- 客户（app/admin/pelanggan/page.tsx）—— Phase 2 第十三切片，迁移 0018 ----
  customerCreatedViaSanci: "SANCI 直营",
  customerCreatedViaUnknownPartner: "未知合作商",
  customerTabList: "客户列表",
  customerTabSources: "来源代码",
  customerTabSales: "销售员代码",
  customerSearchPlaceholder: "搜索姓名／电话／代码…",
  customerEmpty: "还没有客户。",
  customerEmptyFiltered: '没有符合"{q}"的客户。',
  customerColCode: "客户代码",
  customerColSourceSales: "来源·销售员",
  customerColCreatedVia: "创建方式",
  customerCodeMigrationMsg: "客户代码自动生成功能尚未启用 —— 迁移脚本还没有执行。",

  // ---- 新增客户（add-customer-button.tsx） ----
  customerNameRequired: "客户姓名必须填写。",
  customerPhoneInvalid: "电话号码格式不正确。",
  customerSourceSalesPairRequired: "来源和销售员必须同时填写，或者都留空 —— 不能只填一个。",
  customerAddBtn: "+ 新增客户",
  customerAddModalTitle: "新增客户",
  customerSavedMsg: "客户已保存。",
  customerNoCodeGenerated: "没有代码（来源／销售员未填写）。",
  customerNameFieldLabel: "客户姓名 *",
  customerPhoneFieldLabel: "电话 *",
  customerSourceFieldLabel: "来源",
  customerSalesFieldLabel: "销售员",
  customerSourceSalesEmptyOption: "— 请选择 —",
  customerSourceSalesHint: "同时填写来源和销售员可自动生成客户代码，不需要的话两个都留空即可。",
  customerCreateBtn: "保存客户",

  // ---- 主档"来源代码"／"销售代码"（master-data-section.tsx） ----
  sourceCodeFieldLabel: "代码 *",
  sourceLabelFieldLabel: "标签 *",
  sourceAddBtn: "+ 新增来源",
  sourceAddModalTitle: "新增来源代码",
  sourceEditModalTitle: "修改来源代码",
  sourceEmpty: "还没有来源代码。",
  sourceColLabel: "标签",
  salesCodeFieldLabel: "代码 *",
  salesNameFieldLabel: "姓名 *",
  salesAddBtn: "+ 新增销售员",
  salesAddModalTitle: "新增销售员代码",
  salesEditModalTitle: "修改销售员代码",
  salesEmpty: "还没有销售员代码。",
  salesColName: "姓名",
  customerMasterDeactivateTitle: "停用 {text}？",
  customerMasterDeactivateBody: "停用后新客户将无法选择这个代码。已经使用这个代码的老客户不受影响。",

  // ---- Server Actions（actions-customers.ts） ----
  sourceCodeInvalid: "代码必须是 1—4 个大写字母（A—Z）。",
  sourceLabelRequired: "标签必须填写。",
  sourceCodeTaken: "这个来源代码已经被另一个启用中的代码占用。",
  sourceStatusChangeFailed: "现在无法修改来源的状态。",
  salesCodeInvalid: "代码必须是 1—4 个大写字母（A—Z）。",
  salesNameRequired: "姓名必须填写。",
  salesCodeTaken: "这个销售员代码已经被另一个启用中的代码占用。",
  salesStatusChangeFailed: "现在无法修改销售员的状态。",

  // ---- 代分店创建订单（orders/baru + actions-create-order.ts） ----
  orderCreateBtn: "+ 创建订单",
  orderCreateTitle: "创建订单",
  orderCreateIntro:
    "订单以所选合作商和分店的名义创建 —— 该分店账号会把它当作自己创建的订单看到,包括新建的客户。",
  orderCreateSelectPartnerPlaceholder: "—— 请选择合作商 ——",
  orderCreateSelectBranchPlaceholder: "—— 请选择分店 ——",
  orderCreateNoActivePartners: "还没有启用中的合作商。",
  orderCreateNoActiveBranches: "该合作商还没有启用中的分店。",
  orderCreateOptionsLoadFailed: "分店和套装数据加载失败 —— 请重试。",
  orderCreateStaffLoadFailed: "员工名单加载失败 —— 请重试。",
  orderCreatePhoneLabel: "手机号 / WhatsApp 号码 *",
  orderCreateChecking: "正在查客户…",
  orderCreateCheckFailed: "无法查询客户 —— 请重试。",
  orderCreateCustomerFoundPrefix: "找到客户:",
  orderCreateUseCustomerCta: "使用这个客户",
  orderCreateCustomerSelectedPrefix: "已选客户:",
  orderCreateChangeCustomerCta: "更换客户",
  orderCreateNewCustomerHint: "还没有这个号码的客户 —— 填写姓名来新建一个。",
  orderCreateSectionLockedHint: "请先选择合作商和分店,并填好上面的客户信息,才能填这部分。",
  orderCreateAmountLabel: "客户在店内的消费总额(选填)",
  orderCreateAmountHint: "帮助 SANCI 准备合适的报价。",
  orderCreatePackageFieldLabel: "套装 *",
  orderCreateSelectPackagePlaceholder: "—— 请选择套装 ——",
  orderCreatePackageManualOption: "其他(手动输入)",
  orderCreatePackageNameFieldLabel: "套装名称 *",
  orderCreateSalesFieldLabel: "销售员 *",
  orderCreateSelectSalesPlaceholder: "—— 请选择销售员 ——",
  orderCreateNoActiveStaffHint: "本店暂时没有在职员工。",
  orderCreatePicLabel: "负责人",
  orderCreateNotSelectedOption: "—— 未选择 ——",
  orderCreateShippingLabel: "收货地址",
  orderCreateShippingHint: "可以跟客户地址不一样 —— 比如送到公司或其他地址。之后随时可以修改。",
  orderCreateCustomerPoLabel: "客户 PO 号",
  orderCreateCustomerPoHint: "客户或门店自己开出的采购单(PO)编号(如有)。会打印在 Invoice 的 Purchase Order 一行。",
  orderCreateOptionalPlaceholder: "选填…",
  orderCreateInvoiceFieldLabel: "Invoice 照片/PDF(选填)",
  orderCreateInvoiceFieldHint:
    "支持 PNG、JPG、WebP 或 PDF,最大 5 MB —— 图片会自动压缩后再上传,订单创建成功后才会上传。",
  orderCreateSubmitCta: "创建订单",
  orderCreateSuccessBanner: "订单创建成功。",
  orderCreateOpenOrderCta: "打开订单",
  orderCreateAgainCta: "再创建一笔订单",
  orderCreateUnknownAfterConfirm: "订单可能已经保存,但详情暂时无法加载,请打开订单列表查看。",
  // Server Actions（actions-create-order.ts）
  orderCreatePairInvalid: "合作商/分店无效或已停用 —— 请重新选择。",
  orderCreateModuleInactive: "订单功能还没有启用(数据库迁移还没执行)。",
  orderCreateCustomerGone: "找不到这个客户了,请刷新页面重新搜索。",
  orderCreateFullNameRequired: "请填写姓名。",
  orderCreatePhoneInvalid: "电话号码无效。",
  orderCreateSalesRequired: "请选择销售员。",
  orderCreateSalesInvalid: "销售员必须从本店在职员工名单中选择。",
  orderCreatePicInvalid: "负责人必须从本店在职员工名单中选择。",
  orderCreatePackageNotFound: "套装未找到或已停用,请重新选择。",
  orderCreatePackageRequired: "请选择套装。",
  orderCreatePackageNameRequired: "请填写套装名称。",
  orderCreateFulfillmentRequired: "请选择交付方式",
  orderCreateFulfillmentInvalid: "交付方式无效。",
  orderCreateAmountInvalid: "消费金额无效。",
  orderCreatePartialFailed: "客户已保存。订单失败 —— 请重新提交,客户已自动选中。",
  orderCreatePartialUnknown: "客户已保存。因网络中断,订单状态暂时无法确认 —— 请先查看订单列表,再决定是否重试。",
  orderCreateSummaryUnavailable: "订单已保存,但详情暂时无法重新加载,请打开订单列表确认。",
  orderCreateItemsCopyWarning: "部分套装内容未能自动复制到这笔订单。",
  orderCreateInvoicePathInvalid: "无法识别 Invoice 的存储路径。",
  orderCreateInvoiceOrderCancelled: "这笔订单已经取消 —— Invoice 没有记录。",
  orderCreateInvoiceRecordFailed: "Invoice 记录失败 —— 订单数据已经保存。",
  // 客户端上传 Invoice（orders/baru/invoice-upload-admin.ts）
  orderCreateInvoiceUploadFailed: "Invoice 上传失败 —— 订单数据已经保存。",
  orderCreateInvoiceWrongType: "Invoice 格式必须是 PNG、JPG、WebP 或 PDF。",
  orderCreateInvoiceTooLarge: "Invoice 最大 5 MB,请选择小一点的文件。",
} satisfies Shape;

export const admin = { id, en, zh };
