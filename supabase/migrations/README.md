# Migrations — SANCI Partner Hub

Satu baris per berkas, aturan besi, dan daftar angka verifikasi untuk dicocokkan
tanpa perlu membaca SQL-nya.

## Berkas

| # | Berkas | Isinya |
|---|--------|--------|
| 0001 | `0001_partner_foundation.sql` | Fondasi Phase 1: 9 tabel partner/cabang/staf/pengguna/izin/audit, helper izin, trigger audit, RLS. |
| 0002 | `0002_bind_admin.sql` | Mengikat akun Auth Jenzo sebagai SANCI Super Admin. **Jalankan setelah akunnya dibuat di Dashboard.** |
| 0003 | `0003_partner_logo.sql` | Bucket storage `partner-logos` + RLS-nya (baca publik, tulis admin). |
| 0004 | `0004_customer_order.sql` | Phase 2: tabel `customers`, `partner_orders`, penghitung + penomoran order, RLS, perluasan audit. |
| 0005 | `0005_order_edit_cancel.sql` | Edit & pembatalan order oleh cabang: kolom pembatalan, policy UPDATE, penjaga kolom beku, aksi audit `ORDER_CANCELLED`. |
| 0006 | `0006_own_branch_without_policy.sql` | Perbaikan: cabang sendiri terlihat walau Partner belum punya baris kebijakan (`LEFT JOIN`). |
| 0007 | `0007_audit_fixes.sql` | Perbaikan audit basis data: **P0** `INSERT … RETURNING` pelanggan/staf tidak lagi gagal, **P1** `fn_next_order_seq` ditutup dari publik. |
| 0008 | `0008_packages_customer_edit_attribution.sql` | Irisan ketiga: master `partner_packages`, kolom `partner_orders.package_id`, Customer Edit untuk cabang, RPC koreksi atribusi khusus admin. |
| 0009 | `0009_fulfillment_invoice_arrival.sql` | Irisan keempat: 5 kolom baru di `partner_orders` (jalur pesanan, total belanja, invoice, penanda pelanggan tiba), tabel `order_internal_notes` khusus admin & append-only, bucket **privat** `order-invoices` + RLS-nya. |
| 0010 | `0010_sanci_product_catalog.sql` | Irisan kelima: Katalog Produk SANCI — tabel `sanci_products` (tanpa harga, stok hanya STATUS), saklar visibilitas per partner `sanci_catalog_access` (**fail-closed**: tanpa baris = tertutup), gerbang `fn_catalog_enabled()`, bucket **publik** `product-photos` + RLS-nya. |
| 0011 | `0011_audit_hardening.sql` | Pengerasan audit round 3, seluruhnya di lapisan database: **P2** `fn_check_order_refs` akhirnya ikut memeriksa `customer_id` (pelanggan partner lain tidak lagi bisa ditautkan lewat API), **P3** `sanci_catalog_access.enabled` DEFAULT `true` → `false`, **P3** `invoice_url` wajib menunjuk folder pesanannya sendiri (trigger `trg_order_invoice_path`). |
| 0012 | `0012_package_product_components.sql` | Irisan keenam: isi Package — tabel `partner_package_items` (produk + jumlah di dalam sebuah Package, FK sungguhan ke `sanci_products`), menutup penundaan SPEC §23. Admin kelola penuh, partner **hanya baca** isi paketnya sendiri. Mendefinisikan ULANG `fn_audit_row` untuk menambah awalan `PACKAGE_ITEM`. |

## ATURAN BESI

> **Setiap kali sebuah berkas LAMA dijalankan ulang, SEMUA berkas sesudahnya
> WAJIB dijalankan ulang juga, dalam urutan
> `0001 → 0003 → 0004 → 0005 → 0006 → 0007 → 0008 → 0009 → 0010 → 0011 → 0012`.**

Kenapa: beberapa berkas mendefinisikan ULANG fungsi/policy milik berkas
sebelumnya (`fn_audit_row`, `fn_check_order_refs`, `c_partner_read`,
`s_partner_read`, `fn_can_view_branch`, `fn_can_edit_branch`). `CREATE OR
REPLACE` selalu dimenangkan yang dijalankan **terakhir**, bukan yang paling
baru nomornya.

Yang benar-benar terjadi kalau aturan ini dilanggar — sudah diukur, bukan dugaan:

| Yang dijalankan ulang | Yang rusak diam-diam |
|---|---|
| 0001 | `s_partner_read` kembali ke versi lama → **setiap "Simpan staf" dari cabang gagal**; `fn_audit_row` kehilangan awalan `PACKAGE`, `CUSTOMER_PHONE_CHANGED`, `ORDER_ATTRIBUTION_CORRECTED`, `ORDER_CANCELLED`, `ORDER_CUSTOMER_ARRIVED`, awalan `ORDER_INTERNAL_NOTE`, serta awalan `PRODUCT` & `CATALOG_ACCESS`. |
| 0004 | `c_partner_read` kembali ke versi lama → **setiap "Simpan pelanggan" dari cabang gagal**; `fn_check_order_refs` berhenti memeriksa pemilik paket **dan pemilik pelanggan (lubang P2 milik 0011 terbuka lagi)**; `fn_audit_row` seperti di atas. |
| 0005 | `fn_audit_row` kehilangan tambahan 0008 (PACKAGE / PHONE_CHANGED / ATTRIBUTION), 0009 (ARRIVED / INTERNAL_NOTE) dan 0010 (PRODUCT / CATALOG_ACCESS). |
| 0006 | tidak ada — 0006 hanya menulis dua helper, dan sejak 0007 isi 0001 sudah sama. |
| 0008 | `fn_check_order_refs` **berhenti memeriksa pemilik pelanggan** (lubang P2 milik 0011 terbuka lagi — pemeriksaan paket sendiri selamat karena 0008 memang memuatnya); `fn_audit_row` kehilangan tambahan 0009 (ARRIVED / INTERNAL_NOTE) dan 0010 (PRODUCT / CATALOG_ACCESS). |
| 0009 | `fn_audit_row` kehilangan tambahan 0010 saja (PRODUCT / CATALOG_ACCESS). |
| 0010 | `fn_audit_row` kehilangan tambahan 0012 (awalan `PACKAGE_ITEM` **dan** pencarian partner lewat paket induknya). DEFAULT `enabled` **tidak** kembali ke `true`: `create table if not exists` tidak dijalankan lagi pada tabel yang sudah ada, dan 0010 tetap tidak mendefinisikan ulang apa pun milik 0011. |
| 0011 | tidak ada — 0011 tidak mendefinisikan ulang `fn_audit_row` (dinyatakan lewat komentar di dalam berkasnya) maupun apa pun milik 0012. |
| 0012 | tidak ada — 0012 adalah berkas terakhir dalam rantai. Versi `fn_audit_row` miliknya memuat SELURUH perilaku 0004+0005+0008+0009+0010, jadi menjalankannya paling akhir justru **memulihkan** seluruh pemetaan yang sempat tertimpa berkas lama. |

Khusus lubang P2 (`fn_check_order_refs` tanpa pemeriksaan pelanggan): ia TIDAK
menghasilkan satu pun pesan error atau gejala di layar. Yang terjadi hanyalah
sebuah pintu terbuka kembali. Karena itu untuk berkas ini "sudah dijalankan
ulang sampai yang terakhir" bukan formalitas — cocokkan `REFS_CHECK_CUSTOMER`
di blok verifikasi 0011, itu satu-satunya bukti bahwa pintunya masih tertutup.

Khusus 0009 dan 0010, kerusakannya sudah diukur satu per satu — yang hilang
HANYA isi `fn_audit_row`. Trigger `trg_order_arrival`, kedua policy
`order_internal_notes`, keempat policy `order_invoices_*`, status privat bucket
`order-invoices`, kedua tabel katalog beserta keempat policy-nya, fungsi
`fn_catalog_enabled()` beserta hak EXECUTE-nya, dan keempat policy
`product_photos_*` semuanya **selamat** (diukur dengan menjalankan ulang
0001/0004/0005/0008/0009 satu per satu di atas rantai lengkap). Bentuk
kerusakannya persis begini:

| Yang terlihat di layar Aktivitas | Seharusnya |
|---|---|
| `ORDER_INTERNAL_NOTES_CREATED` (pakai S) | `ORDER_INTERNAL_NOTE_CREATED` |
| `ORDER_UPDATED` saat pelanggan ditandai tiba | `ORDER_CUSTOMER_ARRIVED` |
| `SANCI_PRODUCTS_CREATED` | `PRODUCT_CREATED` |
| `SANCI_PRODUCTS_STATUS_CHANGED` | `PRODUCT_STATUS_CHANGED` |
| `SANCI_CATALOG_ACCESS_UPDATED` | `CATALOG_ACCESS_UPDATED` |
| `PARTNER_ORDERS_UPDATED` (kalau yang diulang 0001) | `ORDER_UPDATED` |
| `PARTNER_PACKAGE_ITEMS_CREATED` (kalau yang diulang 0001–0010) | `PACKAGE_ITEM_CREATED` |

Kode mentah itu akan tampil apa adanya kepada pembacanya karena
`web/lib/audit-format.ts` tidak punya labelnya. Perbaikannya satu langkah:
jalankan ulang berkas TERAKHIR. Sebaliknya — dan ini sengaja — versi
`fn_audit_row` di 0012 memuat SELURUH perilaku 0004+0005+0008+0009+0010, jadi
menjalankan 0012 paling akhir juga **memulihkan** pemetaan yang sempat tertimpa
berkas lama. Untuk `fn_check_order_refs` yang memulihkan adalah 0011, jadi
langkah pemulihannya tetap: **0011 lalu 0012.**

Satu akibat tambahan yang khusus milik `partner_package_items`: selain awalannya,
yang ikut hilang adalah pencarian `partner_id` lewat paket induknya. Baris
auditnya tetap tercatat, tapi kolom `partner_id`-nya kosong — sehingga kejadian
itu **menghilang dari layar Aktivitas yang disaring per partner**, bukan sekadar
tampil dengan nama yang salah. Bentuk kerusakan yang sama persis pernah diukur
untuk `order_internal_notes` di 0009.

Dua hal yang **tidak** ikut rusak, supaya tidak ditakuti tanpa perlu:

* `fn_can_view_branch` / `fn_can_edit_branch` — sejak 0007, versi `LEFT JOIN`
  milik 0006 sudah disalin balik ke 0001, jadi menjalankan ulang 0001 tidak lagi
  menghidupkan bug "cabang sendiri tidak terlihat".
* Hak EXECUTE yang dicabut 0007 — `CREATE OR REPLACE` mempertahankan hak akses,
  jadi `fn_next_order_seq` tetap tertutup.

Tetap saja: **jalankan ulang berurutan sampai 0011.** Setelah dijalankan ulang,
cocokkan lagi angka di tabel bawah — itu satu-satunya bukti (LESSONS #7 & #16;
"Run tanpa tulisan merah" bukan bukti).

## Angka verifikasi yang diharapkan

Kolom **fresh** = nilai saat berkas itu dijalankan pertama kali dalam rantai.
Kolom **setelah 0012** = nilai kalau blok verifikasi berkas itu dijalankan ulang
pada database yang sudah lengkap. Nilai yang **berubah** ditandai `→`.

### 0001
| Cek | fresh | setelah 0012 |
|---|---|---|
| TABLES | 9 | 9 |
| RLS_ENABLED | 9 | 9 → **17** (+customers, partner_orders, partner_order_counters, partner_packages, order_internal_notes, sanci_products, sanci_catalog_access, partner_package_items) |
| POLICIES | 19 | 19 → **37** (+6 dari 0004, +1 dari 0005, +3 dari 0008, +2 dari 0009, +4 dari 0010, +2 dari 0012) |
| TRIGGERS | 12 | 12 → **27** (+5 dari 0004, +2 dari 0005, +3 dari 0008, +1 dari 0009, +0 dari 0010, +1 dari 0011, +3 dari 0012) |

`TRIGGERS` di 0001 hanya menghitung tabel berawalan `partner%`, jadi kedua
trigger `order_internal_notes` dan kelima trigger kedua tabel katalog TIDAK ikut
terhitung di sini — yang bertambah dari 0009 hanya `trg_order_arrival` pada
`partner_orders`, 0010 tidak menambah apa pun ke angka ini, dan 0011 menambah
`trg_order_invoice_path` (juga pada `partner_orders`). Ketiga trigger 0012
JUSTRU ikut terhitung, karena `partner_package_items` berawalan `partner%` —
beda dari `order_internal_notes`. Ketiga angka ini sudah diukur pada Postgres 16
lokal, bukan diperkirakan.

### 0003
| Cek | fresh | setelah 0011 |
|---|---|---|
| BUCKET | 1 | 1 |
| BUCKET_PUBLIC | true | true |
| STORAGE_POLICIES | 4 | 4 |
| LOGO_URL_COLUMN | 1 | 1 |

Blok 0003 menyaring `policyname like 'partner_logos_%'`, jadi keempat policy
`order_invoices_*` milik 0009 dan keempat policy `product_photos_*` milik 0010
memang tidak boleh muncul di angka ini. Kalau `STORAGE_POLICIES` menjadi 8 atau
12, berarti penyaringnya ikut terubah — laporkan.

### 0004
| Cek | fresh | setelah 0011 |
|---|---|---|
| TABLES | 3 | 3 |
| RLS_ENABLED | 3 | 3 |
| POLICIES | 6 | 6 → **8** (+`o_partner_update` 0005, +`c_partner_update` 0008) |
| TRIGGERS | 8 | 8 → **13** (+2 penjaga order 0005, +1 penjaga pelanggan 0008, +1 penjaga kedatangan 0009, +1 penjaga invoice 0011) |
| INDEXES | 10 | 10 → **12** (+`idx_partner_orders_status` 0005, +`idx_partner_orders_package` 0008) |
| FUNCTIONS | 5 | 5 |
| AUDIT_MAP | 1 | 1 |

### 0005
| Cek | fresh | setelah 0011 |
|---|---|---|
| CANCEL_COLUMNS | 3 | 3 |
| ORDER_POLICIES | 4 | 4 |
| ORDER_UPDATE_POLICY | 1 | 1 |
| CUSTOMER_UPDATE_POLICY | 0 | 0 → **1** ⚠ |
| ORDER_DELETE_POLICY | 0 | 0 |
| ORDER_TRIGGERS | 7 | 7 → **9** (+`trg_order_arrival` 0009, +`trg_order_invoice_path` 0011) |
| GUARD_FUNCTIONS | 2 | 2 |
| REFS_ON_UPDATE | 1 | 1 |
| AUDIT_CANCEL / AUDIT_KEEP_0004 / AUDIT_REASON | 1 / 1 / 1 | 1 / 1 / 1 |

0009 dan 0011 TIDAK menambah policy apa pun ke `partner_orders`: cabang mengisi
jalur pesanan, total belanja, dan invoice lewat celah UPDATE yang sudah dibuka
0005 (`o_partner_update`), dan 0011 hanya menambah trigger. Jadi
`ORDER_POLICIES` tetap 4, dan `ORDER_DELETE_POLICY` tetap **WAJIB 0**.

⚠ `CUSTOMER_UPDATE_POLICY` adalah **satu-satunya** angka bertanda "WAJIB 0" yang
memang berubah menjadi 1, dan itu disengaja: Customer Edit untuk cabang adalah
isi 0008 (SPEC §33–34). Kalau nilainya 1 padahal 0008 **belum** dijalankan,
itu masalah — laporkan.

### 0006
| Cek | fresh | setelah 0011 |
|---|---|---|
| VIEW_LEFT_JOIN / EDIT_LEFT_JOIN | 1 / 1 | 1 / 1 |
| VIEW_INNER_JOIN / EDIT_INNER_JOIN | 0 / 0 | 0 / 0 |
| PARTNER_TANPA_KEBIJAKAN | tergantung data | tergantung data |
| PENGGUNA_TERTOLONG | tergantung data | tergantung data |

Dua angka terakhir menghitung isi database, bukan benar/salah — berapa pun
nilainya wajar.

### 0007
| Cek | nilai |
|---|---|
| CUSTOMER_READ_NO_SELFLOOKUP | 1 |
| STAFF_READ_NO_SELFLOOKUP | 1 |
| NEW_HELPERS | 2 |
| SEQ_EXEC_PUBLIC / SEQ_EXEC_ANON / SEQ_EXEC_AUTHENTICATED | 0 / 0 / 0 |
| TRIGGER_FN_TERKUNCI | 9 |
| POLICY_HELPER_EXEC | 10 |
| VIEW_LEFT_JOIN / EDIT_LEFT_JOIN | 1 / 1 |

`POLICY_HELPER_EXEC` **wajib 10**. Kalau kurang, RLS akan melempar *error*
"permission denied for function …" alih-alih menyembunyikan data — aplikasi
langsung mati, bukan sekadar salah tampil.

### 0008
| Cek | nilai |
|---|---|
| PACKAGE_TABLE / PACKAGE_UNIQUE / PACKAGE_RLS | 1 / 1 / 1 |
| PACKAGE_POLICIES | 2 |
| PACKAGE_WRITE_POLICIES | 0 |
| PACKAGE_TRIGGERS | 3 |
| ORDER_PACKAGE_COLUMN / ORDER_PACKAGE_FK | 1 / 1 |
| ORDER_PACKAGE_NOT_FROZEN | 1 |
| CUSTOMER_UPDATE_POLICY / CUSTOMER_GUARD_TRIGGER | 1 / 1 |
| CUSTOMER_DELETE_POLICY | 0 |
| ATTRIBUTION_RPC / ATTRIBUTION_RPC_SECDEF | 1 / 1 |
| RPC_EXEC_PUBLIC / RPC_EXEC_ANON / RPC_EXEC_AUTHENTICATED | 0 / 0 / **1** |
| AUDIT_PACKAGE / AUDIT_PHONE_CHANGED / AUDIT_ATTRIBUTION | 1 / 1 / 1 |
| AUDIT_KEEP_0004 / AUDIT_KEEP_0005 | 1 / 1 |
| REFS_CHECK_PACKAGE | 1 |

### 0009
| Cek | nilai |
|---|---|
| ORDER_NEW_COLUMNS / ORDER_NEW_COLS_NULLABLE | 5 / **5** |
| ORDER_NEW_CHECKS | 2 |
| ORDER_NEW_COLS_NOT_FROZEN | **1** |
| ARRIVAL_GUARD_FN / ARRIVAL_TRIGGER / ARRIVAL_TRIGGER_ON_INSERT | 1 / 1 / **1** |
| ORDER_TRIGGERS | 8 → **9** setelah 0011 (+`trg_order_invoice_path`) |
| NOTES_TABLE / NOTES_FK_RESTRICT / NOTES_RLS | 1 / 1 / 1 |
| NOTES_POLICIES | 2 |
| NOTES_UPDATE_DELETE_POLICIES | **0** |
| NOTES_NON_ADMIN_POLICIES | **0** |
| NOTES_TRIGGERS | 2 |
| INVOICE_BUCKET | 1 |
| INVOICE_BUCKET_PUBLIC | **false** |
| INVOICE_BUCKET_LIMIT / INVOICE_BUCKET_MIME | 5242880 / 4 |
| INVOICE_POLICIES / INVOICE_DELETE_ADMIN_ONLY | 4 / 1 |
| INVOICE_HELPER / INVOICE_HELPER_SECDEF | 1 / 1 |
| INVOICE_HELPER_EXEC_ANON / INVOICE_HELPER_EXEC_AUTHENTICATED | **1** / **1** |
| ARRIVAL_GUARD_EXEC_PUBLIC | **0** |
| LOGO_BUCKET_PUBLIC / LOGO_POLICIES | true / 4 |
| AUDIT_CUSTOMER_ARRIVED / AUDIT_INTERNAL_NOTE | 1 / 1 |
| AUDIT_KEEP_0004 / AUDIT_KEEP_0005 | 1 / 1 |
| AUDIT_KEEP_0008_PKG / AUDIT_KEEP_0008_PHONE / AUDIT_KEEP_0008_ATTR | 1 / 1 / 1 |

Empat angka yang paling menentukan, dan kenapa:

* `INVOICE_BUCKET_PUBLIC` **wajib `false`**. Bucket publik di Supabase bisa
  dibuka siapa pun yang tahu path-nya, tanpa login — storage RLS tidak
  menolongnya sama sekali. Kalau nilainya `true`, seluruh foto invoice
  pelanggan terbuka ke internet, dan tiga policy di bawahnya jadi hiasan.
* `NOTES_NON_ADMIN_POLICIES` **wajib 0** — tidak ada satu pun policy pada
  `order_internal_notes` yang bisa bernilai benar tanpa `fn_is_admin()`. Inilah
  isolasi rahasia dagang lintas Partner: cabang nol akses, SELECT sekalipun.
* `ORDER_NEW_COLS_NOT_FROZEN` **wajib 1** — kelima kolom baru TIDAK masuk daftar
  kolom beku milik 0005. Kalau 0, cabang tidak akan bisa mengisi jalur pesanan
  maupun total belanja, dan gejalanya "Simpan berhasil tapi datanya tidak ada".
* `INVOICE_HELPER_EXEC_ANON` / `_AUTHENTICATED` **wajib 1** (LESSONS #26). Kalau
  0, setiap operasi storage pada bucket ini melempar *error* "permission denied
  for function", bukan sekadar menyembunyikan berkas.

### 0010
| Cek | nilai |
|---|---|
| PRODUCT_TABLE | 1 |
| PRODUCT_NO_PARTNER_COLUMN | **0** |
| PRODUCT_STOCK_CHECK / PRODUCT_STOCK_VALUES | 1 / **1** |
| PRODUCT_STATUS_CHECK | 1 |
| PRODUCT_CODE_UNIQUE_PARTIAL / PRODUCT_CODE_NOT_BLANK | 1 / 1 |
| PRODUCT_NO_PRICE_COLUMN / PRODUCT_NO_STOCK_QTY_COLUMN | **0** / **0** |
| PRODUCT_IDEMPOTENCY_KEY | 1 |
| PRODUCT_RLS / PRODUCT_POLICIES | 1 / 2 |
| PRODUCT_PARTNER_WRITE_POLICIES | **0** |
| PRODUCT_READ_GATED | **1** |
| PRODUCT_TRIGGERS | 3 |
| ACCESS_TABLE / ACCESS_PK_PARTNER / ACCESS_FK_CASCADE | 1 / 1 / 1 |
| ACCESS_RLS / ACCESS_POLICIES | 1 / 2 |
| ACCESS_PARTNER_WRITE_POLICIES | **0** |
| ACCESS_TRIGGERS | 2 |
| ACCESS_NO_ROW_MEANS_CLOSED | **1** |
| CATALOG_FN / CATALOG_FN_SECDEF | 1 / 1 |
| CATALOG_FN_EXEC_ANON / CATALOG_FN_EXEC_AUTHENTICATED | **1** / **1** |
| PHOTO_BUCKET | 1 |
| PHOTO_BUCKET_PUBLIC | **true** |
| PHOTO_BUCKET_LIMIT / PHOTO_BUCKET_MIME | 5242880 / 3 |
| PHOTO_POLICIES / PHOTO_WRITE_ADMIN_ONLY | 4 / 3 |
| LOGO_BUCKET_PUBLIC / LOGO_POLICIES | true / 4 |
| INVOICE_BUCKET_PUBLIC / INVOICE_POLICIES | false / 4 |
| AUDIT_PRODUCT / AUDIT_CATALOG_ACCESS | 1 / 1 |
| AUDIT_KEEP_0004 / AUDIT_KEEP_0005 | 1 / 1 |
| AUDIT_KEEP_0008_PKG / AUDIT_KEEP_0008_PHONE / AUDIT_KEEP_0008_ATTR | 1 / 1 / 1 |
| AUDIT_KEEP_0009_ARRIVED / AUDIT_KEEP_0009_NOTE | 1 / 1 |

Lima angka yang paling menentukan, dan kenapa:

* `PRODUCT_PARTNER_WRITE_POLICIES` dan `ACCESS_PARTNER_WRITE_POLICIES` **wajib
  0**. Tidak boleh ada satu pun policy tulis yang bisa bernilai benar tanpa
  `fn_is_admin()`. Kalau `ACCESS_PARTNER_WRITE_POLICIES` menjadi 1, partner bisa
  menyalakan saklarnya sendiri — dan seluruh gagasan "visibilitas ditentukan
  SANCI" runtuh tanpa satu pun pesan error.
* `PRODUCT_READ_GATED` **wajib 1** — policy baca partner menyebut `ACTIVE` DAN
  `fn_catalog_enabled()` sekaligus. Kalau salah satu hilang: tanpa `ACTIVE`
  produk yang sudah ditarik muncul lagi di layar partner; tanpa
  `fn_catalog_enabled()` SELURUH katalog terbuka untuk SEMUA partner.
* `ACCESS_NO_ROW_MEANS_CLOSED` **wajib 1** — `fn_catalog_enabled()` memakai
  `EXISTS(... and enabled)`, sehingga "tidak ada baris" bernilai false. Inilah
  fail-closed yang diminta owner; kalau seseorang mengubahnya menjadi
  `coalesce(..., true)`, setiap partner baru langsung melihat seluruh katalog.
* `PHOTO_BUCKET_PUBLIC` **wajib `true`** — kebalikan dari `order-invoices`, dan
  itu disengaja (alasannya di §7 berkas 0010: foto produk adalah materi
  pemasaran; yang dilindungi RLS adalah DAFTAR produknya). Kalau `false`, grid
  katalog menampilkan gambar rusak sampai signed URL dibuatkan.
* `CATALOG_FN_EXEC_ANON` / `_AUTHENTICATED` **wajib 1** (LESSONS #26). Kalau 0,
  setiap SELECT ke `sanci_products` melempar *error* "permission denied for
  function", bukan sekadar mengembalikan 0 baris.

### 0011
| Cek | nilai |
|---|---|
| REFS_CHECK_CUSTOMER | **1** |
| REFS_CUSTOMER_ADMIN_EXEMPT / REFS_SECDEF | 1 / 1 |
| REFS_ON_INSERT / REFS_ON_UPDATE | 1 / 1 |
| REFS_KEEP_BRANCH / REFS_KEEP_SALES / REFS_KEEP_PIC / REFS_KEEP_PACKAGE | 1 / 1 / 1 / 1 |
| REFS_EXEC_PUBLIC | **0** |
| ACCESS_DEFAULT_FALSE / ACCESS_DEFAULT_TRUE | **1** / **0** |
| ACCESS_NO_ROW_MEANS_CLOSED | 1 |
| INVOICE_GUARD_FN / INVOICE_GUARD_FN_INVOKER | 1 / 1 |
| INVOICE_GUARD_TRIGGER / INVOICE_GUARD_ON_INSERT / INVOICE_GUARD_ON_UPDATE | 1 / 1 / 1 |
| INVOICE_GUARD_EXEC_PUBLIC | **0** |
| INVOICE_URL_STILL_NOT_FROZEN | **1** |
| ORDER_TRIGGERS | **9** |
| ORDER_POLICIES / ORDER_DELETE_POLICY | 4 / **0** |
| ARRIVAL_TRIGGER / ARRIVAL_GUARD_EXEC_PUBLIC | 1 / **0** |
| FROZEN_COLS_KEEP_CUSTOMER | 1 |
| CATALOG_FN_EXEC_ANON / CATALOG_FN_EXEC_AUTHENTICATED | 1 / 1 |
| INVOICE_BUCKET_PUBLIC / INVOICE_POLICIES | false / 4 |
| PHOTO_BUCKET_PUBLIC / LOGO_BUCKET_PUBLIC | true / true |
| AUDIT_KEEP_0009_ARRIVED / AUDIT_KEEP_0010_PRODUCT | 1 / 1 |

Empat angka yang paling menentukan, dan kenapa:

* `REFS_CHECK_CUSTOMER` **wajib 1**. Inilah satu-satunya bukti bahwa lubang P2
  tertutup, dan ia adalah lubang yang **tidak punya gejala**: kalau 0004 atau
  0008 dijalankan ulang sesudah 0011, angka ini kembali 0 dan tidak ada satu pun
  pesan error, layar aneh, atau data yang terlihat salah. Yang berubah cuma:
  pengguna cabang Partner A kembali bisa menautkan pelanggan Partner B ke
  pesanannya lewat API, dan sejak itu seluruh baris pelanggan tersebut (nama,
  telepon, alamat, catatan) terbuka untuknya lewat `c_partner_read`.
* `INVOICE_URL_STILL_NOT_FROZEN` **wajib 1**. 0011 mengikat ISI `invoice_url`,
  bukan hak menulisnya. Kalau seseorang "memperbaiki" temuan ini dengan
  memasukkan `invoice_url` ke daftar kolom beku 0005, angka ini menjadi 0 dan
  cabang tidak bisa mengunggah invoice sama sekali — gejalanya "Simpan berhasil
  tapi invoice-nya tidak ada", persis yang dilarang LESSONS #2/#7.
* `ACCESS_DEFAULT_FALSE` **wajib 1** dan `ACCESS_DEFAULT_TRUE` **wajib 0**.
  Keduanya diperiksa terpisah dengan sengaja: kalau kolomnya suatu hari
  didefinisikan ulang lewat `create table` baru di database kosong, hanya
  pasangan angka ini yang akan memperlihatkannya.
* `REFS_EXEC_PUBLIC` / `INVOICE_GUARD_EXEC_PUBLIC` **wajib 0** (LESSONS #26).
  `fn_check_order_refs` sudah dicabut 0007 dan `CREATE OR REPLACE` di 0011
  mempertahankannya — angka ini membuktikannya, bukan mengandaikannya.

### 0012
| Cek | nilai |
|---|---|
| PACKAGE_ITEM_TABLE / PACKAGE_ITEM_UNIQUE / PACKAGE_ITEM_QTY_CHECK | 1 / 1 / 1 |
| PACKAGE_ITEM_RLS / PACKAGE_ITEM_POLICIES | 1 / 2 |
| PACKAGE_ITEM_PARTNER_WRITE_POLICIES | **0** |
| PACKAGE_ITEM_TRIGGERS | 3 |
| PACKAGE_ITEM_FK_PRODUCT_RESTRICT / PACKAGE_ITEM_FK_PRODUCT_NOT_CASCADE | **1** / **0** |
| PACKAGE_ITEM_FK_PACKAGE_CASCADE | **1** |
| PACKAGE_ITEM_INDEXES | 2 |
| AUDIT_PACKAGE_ITEM / AUDIT_PACKAGE_ITEM_PARTNER_LOOKUP | 1 / 1 |
| AUDIT_KEEP_0010_PRODUCT / AUDIT_KEEP_0010_CATALOG | 1 / 1 |
| AUDIT_KEEP_0009_ARRIVED / AUDIT_KEEP_0009_NOTE | 1 / 1 |
| AUDIT_KEEP_0008_PKG / AUDIT_KEEP_0008_PHONE / AUDIT_KEEP_0008_ATTR | 1 / 1 / 1 |
| AUDIT_KEEP_0005 / AUDIT_KEEP_0004 | 1 / 1 |
| REFS_CHECK_CUSTOMER | **1** |

Tiga angka yang paling menentukan, dan kenapa:

* `PACKAGE_ITEM_PARTNER_WRITE_POLICIES` **wajib 0**. Tidak boleh ada satu pun
  policy tulis yang bisa bernilai benar tanpa `fn_is_admin()`. Kalau menjadi 1,
  pengguna cabang bisa menyusun ulang isi Package milik SANCI — dan seluruh
  gagasan "Package dikurasi SANCI" (SPEC §21) runtuh tanpa satu pun pesan error.
* `PACKAGE_ITEM_FK_PRODUCT_RESTRICT` **wajib 1** dan
  `PACKAGE_ITEM_FK_PRODUCT_NOT_CASCADE` **wajib 0**. Keduanya diperiksa terpisah
  dengan sengaja: yang diperiksa adalah huruf `confdeltype` sesungguhnya
  (`r` bukan `c`). Kalau suatu hari FK-nya lahir sebagai CASCADE, menghapus satu
  produk akan diam-diam mengosongkan baris isi paket di mana pun produk itu
  dipakai — tanpa ada yang memutuskannya.
* `REFS_CHECK_CUSTOMER` **wajib 1**. Diperiksa ulang di sini karena 0012 adalah
  berkas TERAKHIR dalam rantai: kalau angkanya 0, berarti 0004 atau 0008 sempat
  dijalankan ulang sesudah 0011 dan lubang P2 tanpa gejala itu terbuka lagi
  (penjelasan lengkapnya di bagian 0011 di atas).

## Batas yang diketahui (bukan bug baru, tapi jangan dilupakan)

`phone_normalized` dihitung Server Action (`normalizePhoneID()`), bukan SQL —
satu sumber kebenaran, keputusan sejak 0004. Akibatnya penjaga di 0008 hanya
bisa menolak nilai **kosong**, bukan nilai **basi**: kalau sebuah Server Action
mengubah `phone` tanpa ikut mengirim `phone_normalized` yang baru, database akan
menerimanya. Aturan yang lebih ketat ("`phone_normalized` wajib ikut berubah")
sudah dicoba dan ditolak karena menghasilkan penolakan palsu — merapikan format
(`0812-345678` → `0812 345678`) atau menulis `+62…` alih-alih `0…` menghasilkan
bentuk kanonik yang SAMA. Jadi: **setiap Server Action yang menyentuh `phone`
wajib selalu mengirim `phone_normalized` hasil hitung ulang.**

Tiga batas milik 0009, semuanya sudah diukur, bukan dugaan:

1. **Penandaan "pelanggan tiba" TIDAK bisa dilakukan tanpa sesi login** — SQL
   Editor, skrip pemeliharaan, dan Edge Function ber-`service_role` sama-sama
   ditolak, karena penjaganya memakai `fn_is_admin()` dan di sana `auth.uid()`
   kosong. Itu DISENGAJA (zero-trust, sama seperti penjaga 0005/0008). Kalau
   suatu hari perlu koreksi manual, bungkus dalam satu transaksi:
   `alter table public.partner_orders disable trigger trg_order_arrival;` …
   perbaikan … `… enable trigger trg_order_arrival;`
2. **`partner_purchase_amount` bertipe `numeric(15,2)`** → paling besar
   9.999.999.999.999,99. `parseIDRInput()` di `web/lib/orders-shared.ts` masih
   menerima sampai 99.999.999.999.999. Angka di antara keduanya ditolak database
   dengan `22003`, bukan oleh formulir — Server Action wajib menerjemahkan pesan
   itu, jangan biarkan pengguna melihat kode mentah.
3. **Batas ukuran 5 MB dan daftar MIME bucket `order-invoices` ditegakkan
   layanan Storage, bukan Postgres.** Keduanya tersimpan di `storage.buckets`
   dan sudah diverifikasi ada, tapi yang menolak berkas 20 MB atau berkas `.exe`
   adalah storage-api saat unggah — tidak ada tes SQL yang bisa membuktikannya.
   Sama untuk `public = false`: nilainya diperiksa blok verifikasi, tapi
   akibatnya (URL publik mati, wajib signed URL) hanya terlihat di Supabase
   sungguhan. Ketiganya masuk daftar verifikasi produksi, bukan daftar "sudah
   terbukti".

Empat batas milik 0010, semuanya sudah diukur, bukan dugaan:

1. **Foto produk TIDAK dilindungi RLS — hanya daftarnya yang dilindungi.** Bucket
   `product-photos` publik (keputusan sadar, alasannya di §7 berkas 0010), jadi
   siapa pun yang MEMEGANG alamat sebuah foto bisa membukanya tanpa login,
   selamanya. Sudah diuji: partner yang katalognya belum dibuka membaca 0 produk
   tapi tetap bisa melihat objek fotonya. Konsekuensinya satu dan wajib dipatuhi:
   **jangan pernah mengunggah berkas non-pemasaran ke bucket ini** (daftar harga
   internal, invoice, dokumen apa pun) — tempatnya `order-invoices` yang privat.
2. **`photo_url` wajib berversi.** Satu produk = satu path tetap yang ditimpa
   (upsert), jadi isi berkas berubah sementara alamatnya tidak. Tanpa parameter
   `?v=<waktu unggah>` yang ditambahkan Server Action saat menyimpan, admin yang
   mengganti foto akan tetap melihat foto lama dari cache/CDN dan menyimpulkan
   "gagal simpan" (LESSONS #22 — persis kasus `partner-logos`).
3. **Batas ukuran 5 MB, daftar MIME, dan `public = true` bucket
   `product-photos` ditegakkan layanan Storage, bukan Postgres** — sama seperti
   catatan nomor 3 milik 0009. Nilainya diperiksa blok verifikasi, tapi yang
   menolak berkas 20 MB atau `.exe` adalah storage-api saat unggah. Masuk daftar
   verifikasi produksi, bukan daftar "sudah terbukti".
4. **`web/lib/audit-format.ts` belum punya label untuk enam aksi baru** yang
   dihasilkan 0010: `PRODUCT_CREATED`, `PRODUCT_UPDATED`,
   `PRODUCT_STATUS_CHANGED`, `PRODUCT_DELETED`, `CATALOG_ACCESS_CREATED`,
   `CATALOG_ACCESS_UPDATED` (dan `CATALOG_ACCESS_DELETED` kalau baris saklar
   pernah dihapus). Sampai label itu ditambahkan, layar Aktivitas menampilkan
   kodenya apa adanya. Berkas 0010 sengaja tidak menyentuh `web/**`.

Empat batas milik 0011, semuanya sudah diukur, bukan dugaan:

1. **Tautan pelanggan lintas Partner yang PERTAMA hanya bisa dibuat admin.**
   Setelah 0011, pengguna cabang hanya boleh memakai pelanggan yang dibuat
   partner-nya sendiri ATAU yang sudah pernah punya pesanan di partner itu.
   Alur normal tidak terpengaruh sama sekali — pelanggan Partner B memang TIDAK
   TERLIHAT oleh cabang Partner A (`c_partner_read`), jadi UI-nya akan membuat
   baris pelanggan baru, bukan memakai yang lama. Kalau suatu hari SANCI benar
   ingin menyatukan dua baris pelanggan yang sebenarnya satu orang, itu
   pekerjaan admin (dan idealnya fitur "gabungkan pelanggan" tersendiri), bukan
   pekerjaan cabang.
2. **Penjaga 0011 ikut menolak perbaikan manual tanpa sesi login** — SQL Editor,
   skrip pemeliharaan, dan Edge Function ber-`service_role` sama-sama ditolak,
   karena keduanya memakai `fn_is_admin()` dan di sana `auth.uid()` kosong. Ini
   DISENGAJA dan sama persis dengan penjaga 0005/0008/0009. Jalan keluarnya
   sudah diuji dan berhasil — bungkus dalam SATU transaksi:
   `alter table public.partner_orders disable trigger trg_check_order_refs;` …
   perbaikan … `… enable trigger trg_check_order_refs;` (ganti nama trigger
   menjadi `trg_order_invoice_path` untuk kasus invoice).
3. **Nilai `invoice_url` LAMA yang terlanjur menyimpang tidak ikut dibersihkan.**
   0011 mengubah aturan penulisan, bukan data. Penjaga hanya menyala saat
   nilainya BERUBAH — supaya satu baris warisan yang aneh tidak mengunci seluruh
   Edit pesanan itu (sudah diuji: Edit kolom lain tetap jalan, menulis ulang
   nilai silangnya ditolak, menggantinya ke folder sendiri diterima). Kalau
   ingin tahu apakah ada warisan seperti itu, hitung sendiri:
   `select count(*) from partner_orders where invoice_url is not null and split_part(invoice_url,'/',1) <> id::text;`
   — pada database yang sehat jawabannya 0.
4. **DEFAULT baru `enabled = false` tidak menyentuh baris yang sudah ada.**
   Partner yang katalognya sudah dibuka tetap terbuka (sudah diuji dengan
   memasang 0011 di atas database 0010 yang sudah berisi data). Yang berubah
   hanya baris yang LAHIR sesudahnya tanpa menyebut kolom itu. Konsekuensi yang
   perlu diketahui pembaca skrip lama: perintah seperti
   `insert into sanci_catalog_access (partner_id) select id from partners`
   sekarang menghasilkan saklar TERTUTUP untuk semua, bukan terbuka.

Tiga batas milik 0012:

1. **Isi Package belum terlihat di sisi cabang.** Policy `ppi_partner_read`
   sudah mengizinkannya di lapisan basis data (dan sudah diuji: pengguna cabang
   Partner A membaca isi paketnya sendiri, dan mendapat 0 baris untuk paket
   Partner B), tapi layarnya sengaja BELUM dibuat — irisan ini admin-only.
   Membuka policy lebih dulu adalah keputusan sadar: aturan bacanya ikut diuji
   sekarang, saat konteksnya masih segar, bukan ditambahkan tergesa-gesa nanti.
2. **Isi Package TIDAK dibekukan ke dalam pesanan.** `partner_orders` masih
   menunjuk paket lewat `package_id`, dan `package_name` tetap teks bebas yang
   membekukan NAMA saat pesanan dibuat (catatan kompatibilitas 0008). Kalau isi
   sebuah paket diubah hari ini, pesanan LAMA yang menunjuk paket itu akan ikut
   terbaca dengan isi yang BARU. Membekukan isi per pesanan butuh tabel
   tersendiri dan merupakan keputusan tersendiri — jangan ditambal ke tabel ini.
3. **`quantity` tidak punya batas atas.** CHECK-nya hanya `> 0`; `integer`
   menampung sampai 2.147.483.647. Salah ketik seperti `1000` bukan `100` akan
   diterima basis data apa adanya. Formulirnya memakai `type="number" min="1"`,
   tapi itu lapisan UI — kalau suatu hari batas nyata dibutuhkan (mis. maksimum
   999 per baris), tempatnya di CHECK constraint, bukan hanya di formulir.
