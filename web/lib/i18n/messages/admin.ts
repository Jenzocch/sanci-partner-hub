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
  partnerCodeFieldLabel: "Kode partner *",
  partnerCodeHint: "2–8 karakter, A–Z 0–9 dan tanda hubung. Contoh: GH, GOLDEN, GH-ID.",
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
  partnerActivateHint: "Lengkapi semua syarat aktivasi untuk mengaktifkan.",
  partnerDeactivateModalTitle: "Akhiri kerja sama dengan {name}?",
  partnerDeactivateBody: "Status menjadi NONAKTIF. Semua cabang, staf, dan riwayat tetap tersimpan.",
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
  gateReqName: "Nama partner",
  gateReqCode: "Kode partner",
  gateReqBranch: "Minimal 1 cabang aktif",
  gateReqUser: "Minimal 1 akun login aktif",
  gateReqAccess: "Hak akses sudah diatur",
  branchesEmpty: "Belum ada cabang.",

  // ---- Tab Package (partners/[id]/page.tsx, add-package-button.tsx, package-actions.tsx) ----
  packageMigrationMsg: "Fitur package belum aktif — migrasi belum dijalankan.",
  packagesEmpty: "Belum ada package.",
  packageAddBtn: "+ Tambah Package",
  packageAddModalTitle: "Tambah Package",
  packageNameFieldLabel: "Nama package *",
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
  branchCodeFieldLabel: "Kode cabang *",
  branchCodeHint: "Unik di dalam partner ini. Partner lain boleh pakai kode yang sama.",
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
    "saat membuat pesanan. Email untuk masuk tidak ditampilkan di daftar ini — catat saat akun " +
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
  userNameHint: "Nama yang tampil di daftar akun, mis. nama toko atau cabangnya.",
  userBranchFieldLabel: "Cabang *",
  userEmailFieldLabel: "Email untuk masuk *",
  userEmailHint:
    "Tidak perlu email asli — alamat ini hanya dipakai untuk masuk, tidak menerima surat. Usulan " +
    "otomatis mengikuti kode partner dan kode cabang.",
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
  userCredentialEmailLabel: "Email untuk masuk",
  userCredentialPasswordLabel: "Kata sandi",
  userCredentialFootnote:
    "Email ini tidak menerima surat — fungsinya hanya sebagai nama untuk masuk. Kalau tokonya lupa " +
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
    "Email ini sudah dipakai. Gunakan email lain. Kalau menurut Anda email ini seharusnya belum " +
    "terpakai, hubungi petugas teknis — jangan dipaksa dibuat ulang.",
  userWeakPassword:
    "Kata sandi itu ditolak sistem login karena belum memenuhi syarat keamanan. Minta tokonya " +
    "memilih kata sandi yang lebih panjang dan mencampur huruf besar, huruf kecil, serta angka.",
  userEmailRejected: "Email ini ditolak sistem login. Periksa penulisannya, lalu coba lagi.",
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
  userEmailRequiredField: "Email wajib diisi.",
  userEmailFormatInvalid: "Format email belum benar. Contoh: gh-bsd@sanci.com",
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
  staffRoleFieldLabel: "Peran *",
  staffRoleHint: "Peran bisnis di toko — terpisah dari hak akses login sistem.",
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
  orderOfferFinalNegative: "Kombinasi diskon/markup/potongan tunai menghasilkan nilai akhir negatif. Periksa kembali nilainya.",
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
} as const;

type Shape = Record<keyof typeof id, string>;

const en = {
  navOrders: "Partner orders",
  navPartners: "Partners",
  navProducts: "Products",

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
  partnerCodeFieldLabel: "Partner code *",
  partnerCodeHint: "2–8 characters, A–Z, 0–9, and hyphens. Example: GH, GOLDEN, GH-ID.",
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
  partnerActivateHint: "Complete every activation requirement to activate.",
  partnerDeactivateModalTitle: "End the partnership with {name}?",
  partnerDeactivateBody: "The status becomes INACTIVE. All branches, staff, and history stay saved.",
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
  gateReqName: "Partner name",
  gateReqCode: "Partner code",
  gateReqBranch: "At least 1 active branch",
  gateReqUser: "At least 1 active login account",
  gateReqAccess: "Access has been configured",
  branchesEmpty: "No branches yet.",

  packageMigrationMsg: "The package feature is not active yet — the migration has not been run.",
  packagesEmpty: "No packages yet.",
  packageAddBtn: "+ Add Package",
  packageAddModalTitle: "Add Package",
  packageNameFieldLabel: "Package name *",
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
  branchCodeFieldLabel: "Branch code *",
  branchCodeHint: "Unique within this partner. Other partners may reuse the same code.",
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
    "list when creating an order. The sign-in email is not shown in this list — note it down when " +
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
  userNameHint: "The name shown in the accounts list, e.g. the store or branch name.",
  userBranchFieldLabel: "Branch *",
  userEmailFieldLabel: "Sign-in email *",
  userEmailHint:
    "It does not need to be a real email — this address is only used to sign in, it does not " +
    "receive mail. The suggestion follows the partner code and branch code automatically.",
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
  userCredentialEmailLabel: "Sign-in email",
  userCredentialPasswordLabel: "Password",
  userCredentialFootnote:
    "This email does not receive mail — it only serves as a sign-in name. If the store forgets the " +
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
    "This email is already in use. Use a different one. If you believe this email should not be " +
    "taken, contact technical staff — do not force it to be recreated.",
  userWeakPassword:
    "The login system rejected that password because it does not meet the security requirements. " +
    "Ask the store to choose a longer password that mixes upper case, lower case, and numbers.",
  userEmailRejected: "The login system rejected this email. Check the spelling, then try again.",
  userCreateFailedGeneric: "Cannot create the login account right now. Please try again in a moment.",
  userCreateCleanRollback:
    "The login account FAILED to be created and nothing was left behind in the system. Please try " +
    "again with the same email.",
  userHalfCreated:
    "A login account for {email} was created in the login system, BUT it is not yet linked to a " +
    "partner, so it cannot be used to sign in. Do not create it again with the same email. Note " +
    "this email down and contact technical staff.",
  userNameRequiredField: "Name is required.",
  userEmailRequiredField: "Email is required.",
  userEmailFormatInvalid: "The email format is not valid yet. Example: gh-bsd@sanci.com",
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
  staffRoleFieldLabel: "Role *",
  staffRoleHint: "The store job role — separate from the login access role.",
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
  orderOfferFinalNegative: "This combination of discount/markup/cash discount produces a negative final price. Please check the values.",
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
} satisfies Shape;

const zh = {
  navOrders: "合作商订单",
  navPartners: "合作商",
  navProducts: "产品",

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
  partnerCodeFieldLabel: "合作商编号 *",
  partnerCodeHint: "2–8 位字符，A–Z、0–9 及连字符。示例：GH、GOLDEN、GH-ID。",
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
  partnerActivateHint: "请先完成全部启用条件才能启用。",
  partnerDeactivateModalTitle: "确定结束与 {name} 的合作？",
  partnerDeactivateBody: "状态将变为已停用。所有分店、员工和历史记录都会保留。",
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
  gateReqName: "合作商名称",
  gateReqCode: "合作商编号",
  gateReqBranch: "至少 1 个启用分店",
  gateReqUser: "至少 1 个启用登录账号",
  gateReqAccess: "已设置权限",
  branchesEmpty: "暂无分店。",

  packageMigrationMsg: "套装功能尚未启用 —— 迁移脚本还没有执行。",
  packagesEmpty: "暂无套装。",
  packageAddBtn: "+ 新增套装",
  packageAddModalTitle: "新增套装",
  packageNameFieldLabel: "套装名称 *",
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
  branchCodeFieldLabel: "分店编号 *",
  branchCodeHint: "在该合作商内需唯一。其他合作商可以使用相同编号。",
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
    "一个分店使用一个共用账号；创建订单时，销售员姓名和负责人仍从员工名单中选择。登录邮箱不会显示在" +
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
  userNameHint: "显示在账号列表中的名称，例如门店或分店名称。",
  userBranchFieldLabel: "分店 *",
  userEmailFieldLabel: "登录邮箱 *",
  userEmailHint: "不需要是真实邮箱 —— 此地址仅用于登录，不会收信。系统会根据合作商编号和分店编号自动生成建议地址。",
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
  userCredentialEmailLabel: "登录邮箱",
  userCredentialPasswordLabel: "密码",
  userCredentialFootnote:
    "该邮箱不会收信 —— 它的作用只是登录用户名。如果门店忘记密码，不要新建账号：请打开“账号”标签页，" +
    "在对应行点击“重设密码”设置新密码。",
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
  userEmailTaken: "该邮箱已被使用，请换一个。如果你认为这个邮箱不应该被占用，请联系技术人员 —— 不要强行重新创建。",
  userWeakPassword: "登录系统拒绝了该密码，因为不满足安全要求。请让门店选择更长的密码，并混合使用大写字母、小写字母和数字。",
  userEmailRejected: "登录系统拒绝了这个邮箱，请检查拼写后重试。",
  userCreateFailedGeneric: "现在无法创建登录账号，请稍后再试。",
  userCreateCleanRollback: "登录账号创建失败，系统中没有留下任何残留数据。请用相同邮箱再试一次。",
  userHalfCreated:
    "邮箱 {email} 的登录账号已在登录系统中创建，但尚未关联到合作商，因此还不能用于登录。请不要用同" +
    "一邮箱再次创建。请记下该邮箱并联系技术人员。",
  userNameRequiredField: "名称为必填项。",
  userEmailRequiredField: "邮箱为必填项。",
  userEmailFormatInvalid: "邮箱格式不正确。示例：gh-bsd@sanci.com",
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
  staffRoleFieldLabel: "角色 *",
  staffRoleHint: "门店内的业务角色 —— 与系统登录权限无关。",
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
  orderOfferFinalNegative: "这个折扣/加成/现金折让组合会得出负数的最终金额，请检查数值。",
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
} satisfies Shape;

export const admin = { id, en, zh };
