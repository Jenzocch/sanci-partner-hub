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
| 0013 | `0013_order_offer_amount.sql` | Irisan ketujuh: nilai penawaran SANCI per pesanan — tabel `order_sanci_offers` (satu baris per pesanan, `order_id` sebagai PRIMARY KEY sehingga penulisannya upsert idempoten). **Khusus admin SANCI, baca maupun tulis**; pengguna cabang nol akses, SELECT sekalipun — ditegakkan RLS, bukan disembunyikan layar. Mendefinisikan ULANG `fn_audit_row` untuk menambah awalan `ORDER_OFFER`. |
| 0014 | `0014_permissions_items_shipping.sql` | Irisan kedelapan: 2 flag izin (`can_view_offer`/`can_edit_offer`) di `partner_access_policies` yang MEMBUKA akses cabang ke `order_sanci_offers` miliknya sendiri (3 policy SELECT/INSERT/UPDATE baru — evolusi janji 0013 §4); `dp_amount`/`payment_condition` di `order_sanci_offers`; tabel BARU `order_items` (snapshot isi pesanan per baris + catatan/warna/ukuran, disalin otomatis dari isi Package saat pesanan dibuat, boleh diedit cabang selama pesanan aktif — harga per baris digerbangi `can_edit_offer` lewat trigger); `partner_orders.shipping_address` (selalu bisa diedit, TIDAK masuk daftar beku 0005). Mendefinisikan ULANG `fn_audit_row` untuk menambah awalan `ORDER_ITEM`. **Sengaja TIDAK membangun** rantai perhitungan diskon/markup/potongan-tunai yang direncanakan awal — bentrok langsung dengan `GLOSSARY.md`/`FEATURES.md` yang ditulis di commit yang sama (0013) yang menyatakan sistem ini tidak menghitung diskon; lihat kepala berkas 0014 untuk penjelasan lengkap. |
| 0015 | `0015_order_discount_chain.sql` | Irisan kesembilan: konflik 0013/0014 SUDAH diputuskan owner (2026-08-20, FEATURES.md §"衝突已裁決") — rantai diskon TINGKAT PESANAN sekarang DIBANGUN. 4 kolom baru di `order_sanci_offers`: `discount_pcts` (jsonb, array % berurutan, maks 6, divalidasi trigger), `markup_pct` (opsional, CHECK 0–100), `cash_discount` (default 0, CHECK ≥0), `final_amount` (WAJIB, DIHITUNG trigger BEFORE INSERT/UPDATE — TIDAK PERNAH dipercaya dari client). Constraint `dp_amount<=amount` (0014) DIGANTI `dp_amount<=final_amount`. Flag izin ketiga `can_discount` di `partner_access_policies` (DEFAULT false) + trigger gerbang baru (`fn_guard_order_offer_discount_fields`) — can_discount adalah gerbang TAMBAHAN di ATAS can_edit_offer (RLS 0014 TIDAK diubah), bukan flag sejajar; matriks lengkap di kepala berkas §6. `fn_audit_row` **TIDAK didefinisikan ulang** — migrasi PERTAMA sejak 0009 yang tidak menyentuhnya (tidak ada tabel baru, kolom baru otomatis ikut lewat `to_jsonb`). |

## ATURAN BESI

> **Setiap kali sebuah berkas LAMA dijalankan ulang, SEMUA berkas sesudahnya
> WAJIB dijalankan ulang juga, dalam urutan
> `0001 → 0003 → 0004 → 0005 → 0006 → 0007 → 0008 → 0009 → 0010 → 0011 → 0012 → 0013 → 0014 → 0015`.**

Kenapa: beberapa berkas mendefinisikan ULANG fungsi/policy milik berkas
sebelumnya (`fn_audit_row`, `fn_check_order_refs`, `c_partner_read`,
`s_partner_read`, `fn_can_view_branch`, `fn_can_edit_branch`). `CREATE OR
REPLACE` selalu dimenangkan yang dijalankan **terakhir**, bukan yang paling
baru nomornya.

Yang benar-benar terjadi kalau aturan ini dilanggar — sudah diukur, bukan dugaan:

| Yang dijalankan ulang | Yang rusak diam-diam |
|---|---|
| 0001 | `s_partner_read` kembali ke versi lama → **setiap "Simpan staf" dari cabang gagal**; `fn_audit_row` kehilangan awalan `PACKAGE`, `CUSTOMER_PHONE_CHANGED`, `ORDER_ATTRIBUTION_CORRECTED`, `ORDER_CANCELLED`, `ORDER_CUSTOMER_ARRIVED`, awalan `ORDER_INTERNAL_NOTE`, awalan `PRODUCT` & `CATALOG_ACCESS`, awalan `PACKAGE_ITEM`, awalan `ORDER_OFFER` (0013), serta awalan `ORDER_ITEM` (0014). |
| 0004 | `c_partner_read` kembali ke versi lama → **setiap "Simpan pelanggan" dari cabang gagal**; `fn_check_order_refs` berhenti memeriksa pemilik paket **dan pemilik pelanggan (lubang P2 milik 0011 terbuka lagi)**; `fn_audit_row` seperti di atas, `ORDER_OFFER` dan `ORDER_ITEM` termasuk. |
| 0005 | `fn_audit_row` kehilangan tambahan 0008 (PACKAGE / PHONE_CHANGED / ATTRIBUTION), 0009 (ARRIVED / INTERNAL_NOTE), 0010 (PRODUCT / CATALOG_ACCESS), 0012 (PACKAGE_ITEM), 0013 (ORDER_OFFER) dan 0014 (ORDER_ITEM). |
| 0006 | tidak ada — 0006 hanya menulis dua helper, dan sejak 0007 isi 0001 sudah sama. |
| 0008 | `fn_check_order_refs` **berhenti memeriksa pemilik pelanggan** (lubang P2 milik 0011 terbuka lagi — pemeriksaan paket sendiri selamat karena 0008 memang memuatnya); `fn_audit_row` kehilangan tambahan 0009 (ARRIVED / INTERNAL_NOTE), 0010 (PRODUCT / CATALOG_ACCESS), 0012 (PACKAGE_ITEM), 0013 (ORDER_OFFER) dan 0014 (ORDER_ITEM). |
| 0009 | `fn_audit_row` kehilangan tambahan 0010 (PRODUCT / CATALOG_ACCESS), 0012 (PACKAGE_ITEM), 0013 (ORDER_OFFER) dan 0014 (ORDER_ITEM). |
| 0010 | `fn_audit_row` kehilangan tambahan 0012 (awalan `PACKAGE_ITEM` **dan** pencarian partner lewat paket induknya), 0013 (awalan `ORDER_OFFER`) dan 0014 (awalan `ORDER_ITEM` **dan** ketiganya kehilangan pencarian partner/branch lewat pesanannya bersama-sama) — sudah diukur, bukan dugaan. DEFAULT `enabled` **tidak** kembali ke `true`: `create table if not exists` tidak dijalankan lagi pada tabel yang sudah ada, dan 0010 tetap tidak mendefinisikan ulang apa pun milik 0011. |
| 0011 | tidak ada — 0011 tidak mendefinisikan ulang `fn_audit_row` (dinyatakan lewat komentar di dalam berkasnya) maupun apa pun milik 0012/0013/0014. |
| 0012 | `fn_audit_row` kehilangan tambahan 0013 (awalan `ORDER_OFFER`) dan 0014 (awalan `ORDER_ITEM`), termasuk pencarian partner/branch lewat pesanan untuk keduanya. Awalan `PACKAGE_ITEM` miliknya sendiri **tetap ada** (sudah diukur satu per satu di Postgres 16 lokal). |
| 0013 | `fn_audit_row` kehilangan tambahan 0014 SAJA — awalan `ORDER_ITEM` dan pencarian partner/branch lewat pesanannya. **Selain itu**, `order_sanci_offers` juga kehilangan TIGA policy cabang baru milik 0014 (`oso_partner_read`/`_insert`/`_update` — `DROP POLICY IF EXISTS oso_admin_all` di 0013 tidak menyentuh nama policy itu, tapi 0013 juga tidak MEMBUATNYA lagi, jadi kalau 0014 belum pernah dijalankan ulang sesudahnya, urutan asli tetap aman; risiko hanya muncul kalau 0013 dijalankan ulang SETELAH 0014 sempat berjalan tanpa 0014 ikut dijalankan ulang lagi — lihat catatan ⚠️ di blok verifikasi 0014). Awalan `ORDER_OFFER` miliknya sendiri **tetap ada**. |
| 0014 | **Sudah diukur di Postgres 16 lokal, bukan diperkirakan**: `order_sanci_offers_dp_le_amount_check` (constraint LAMA milik 0014 sendiri, `dp_amount<=amount`) **muncul KEMBALI** berdampingan dengan `order_sanci_offers_dp_le_final_check` (constraint BARU milik 0015, `dp_amount<=final_amount`) — 0014 §2 memakai `if not exists (select … where conname = 'order_sanci_offers_dp_le_amount_check')` untuk idempotensi, dan begitu 0015 sudah pernah men-DROP constraint itu, kondisi "belum ada" jadi BENAR lagi sehingga 0014 MEMBUATNYA ULANG. Akibatnya KEDUA constraint aktif bersamaan: kalau `final_amount` lebih BESAR dari `amount` (markup > jumlah diskon), constraint lama yang sudah seharusnya digantikan diam-diam kembali membatasi DP ke `amount`, menolak nilai DP yang SAH menurut aturan 0015 (`dp<=final_amount`) tanpa satu pun peringatan di layar Aktivitas. **Yang TIDAK ikut rusak** (diukur eksplisit, bukan diasumsikan): kedua trigger 0015 (`trg_order_offer_discount_guard`, `trg_order_offer_final_compute`), ketiga policy `oso_partner_*`, dan `fn_audit_row` — 0014 tidak mendefinisikan ulang atau menyentuh satu pun dari ketiganya. **Pemulihan**: jalankan ulang 0015 sekali lagi — constraint lama ter-DROP kembali, hanya `dp_le_final_check` yang tersisa (diverifikasi: re-run persis skenario ini menghasilkan tepat satu constraint `dp_le_*`). **Pemulihan untuk kasus 0013 dijalankan ulang** (baris di atas): jalankan ulang 0014 sekali lagi — ketiga policy `oso_partner_*` dan awalan `ORDER_ITEM` kembali utuh (fungsi `fn_audit_row` versi 0014 tetap identik dengan versi yang dipakai 0015, jadi menjalankan ulang 0014 di sini tidak mengubah pemetaan aksi apa pun). |
| 0015 | tidak ada — 0015 adalah berkas terakhir dalam rantai saat ini. Versi `fn_audit_row` yang berlaku (dari 0014, TIDAK didefinisikan ulang oleh 0015) memuat SELURUH perilaku 0004+0005+0008+0009+0010+0012+0013+0014, jadi kalau berkas LAMA mana pun dijalankan ulang lalu diikuti 0014 (bukan 0015 — 0015 tidak menyentuh `fn_audit_row` sama sekali), pemetaan aksinya tetap pulih lewat mekanisme 0014 yang sudah dijelaskan di baris atas. Yang HANYA dipulihkan oleh 0015 sendiri adalah baris di atas (constraint `dp_le_*` kalau 0014 sempat dijalankan ulang sesudah 0015). |

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
| `ORDER_SANCI_OFFERS_CREATED` (kalau yang diulang 0001–0012) | `ORDER_OFFER_CREATED` |

Kode mentah itu akan tampil apa adanya kepada pembacanya karena
`web/lib/audit-format.ts` tidak punya labelnya. Perbaikannya satu langkah:
jalankan ulang berkas TERAKHIR. Sebaliknya — dan ini sengaja — versi
`fn_audit_row` di 0013 memuat SELURUH perilaku 0004+0005+0008+0009+0010+0012,
jadi menjalankan 0013 paling akhir juga **memulihkan** pemetaan yang sempat
tertimpa berkas lama (sudah diukur: setelah 0012 lalu 0010 dijalankan ulang di
atas rantai penuh, satu kali 0013 mengembalikan SEMUANYA). Untuk
`fn_check_order_refs` yang memulihkan adalah 0011, jadi langkah pemulihannya
menjadi: **0011 lalu 0012 lalu 0013.**

Satu akibat tambahan yang khusus milik `partner_package_items`: selain awalannya,
yang ikut hilang adalah pencarian `partner_id` lewat paket induknya. Baris
auditnya tetap tercatat, tapi kolom `partner_id`-nya kosong — sehingga kejadian
itu **menghilang dari layar Aktivitas yang disaring per partner**, bukan sekadar
tampil dengan nama yang salah. Bentuk kerusakan yang sama persis pernah diukur
untuk `order_internal_notes` di 0009, dan berlaku sekali lagi untuk
`order_sanci_offers` di 0013 — bedanya di sini yang hilang DUA kolom sekaligus
(`partner_id` **dan** `branch_id`), jadi kejadiannya menghilang dari layar
Aktivitas Partner maupun Aktivitas Cabang.

Dua hal yang **tidak** ikut rusak, supaya tidak ditakuti tanpa perlu:

* `fn_can_view_branch` / `fn_can_edit_branch` — sejak 0007, versi `LEFT JOIN`
  milik 0006 sudah disalin balik ke 0001, jadi menjalankan ulang 0001 tidak lagi
  menghidupkan bug "cabang sendiri tidak terlihat".
* Hak EXECUTE yang dicabut 0007 — `CREATE OR REPLACE` mempertahankan hak akses,
  jadi `fn_next_order_seq` tetap tertutup.

Tetap saja: **jalankan ulang berurutan sampai 0013.** Setelah dijalankan ulang,
cocokkan lagi angka di tabel bawah — itu satu-satunya bukti (LESSONS #7 & #16;
"Run tanpa tulisan merah" bukan bukti).

## Angka verifikasi yang diharapkan

Kolom **fresh** = nilai saat berkas itu dijalankan pertama kali dalam rantai.
Kolom **setelah 0012** = nilai kalau blok verifikasi berkas itu dijalankan ulang
pada database yang sudah lengkap. Nilai yang **berubah** ditandai `→`.

### 0001
| Cek | fresh | setelah 0013 | setelah 0014 |
|---|---|---|---|
| TABLES | 9 | 9 | 9 |
| RLS_ENABLED | 9 | 9 → **18** (+customers, partner_orders, partner_order_counters, partner_packages, order_internal_notes, sanci_products, sanci_catalog_access, partner_package_items, order_sanci_offers) | 18 → **19** (+order_items) |
| POLICIES | 19 | 19 → **38** (+6 dari 0004, +1 dari 0005, +3 dari 0008, +2 dari 0009, +4 dari 0010, +2 dari 0012, +1 dari 0013) | 38 → **46** (+3 `oso_partner_*` baru di order_sanci_offers, +5 policy order_items — 2 kolom baru di partner_access_policies TIDAK menambah policy) |
| TRIGGERS | 12 | 12 → **27** (+5 dari 0004, +2 dari 0005, +3 dari 0008, +1 dari 0009, +0 dari 0010, +1 dari 0011, +3 dari 0012, **+0 dari 0013**) | **tetap 27** (+0 dari 0014 — kelima trigger `order_items` TIDAK ikut terhitung, sama seperti order_internal_notes/order_sanci_offers) |

`TRIGGERS` di 0001 hanya menghitung tabel berawalan `partner%`, jadi kedua
trigger `order_internal_notes` dan kelima trigger kedua tabel katalog TIDAK ikut
terhitung di sini — yang bertambah dari 0009 hanya `trg_order_arrival` pada
`partner_orders`, 0010 tidak menambah apa pun ke angka ini, dan 0011 menambah
`trg_order_invoice_path` (juga pada `partner_orders`). Ketiga trigger 0012
JUSTRU ikut terhitung, karena `partner_package_items` berawalan `partner%` —
beda dari `order_internal_notes`. Ketiga trigger 0013 pada `order_sanci_offers`
dan kelima trigger 0014 pada `order_items` **TIDAK** ikut terhitung (kedua nama
tabel berawalan `order_`, sama seperti `order_internal_notes`), sehingga
`TRIGGERS` tetap **27** sesudah 0013 MAUPUN sesudah 0014 — satu-satunya angka
0001 yang TIDAK berubah lagi kali ini. Kelima angka ini sudah diukur pada
Postgres 16 lokal, bukan diperkirakan.

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

### 0013
| Cek | nilai |
|---|---|
| OFFER_TABLE | 1 |
| OFFER_PK_ORDER_ID | 1 |
| OFFER_NO_ID_COLUMN | **0** |
| OFFER_NO_CLIENT_REQUEST_ID | **0** |
| OFFER_FK_RESTRICT / OFFER_FK_NOT_CASCADE | **1** / **0** |
| OFFER_AMOUNT_CHECK / OFFER_AMOUNT_NOT_NULL | 1 / **1** |
| OFFER_AMOUNT_TYPE | `numeric(15,2)` |
| OFFER_RLS / OFFER_POLICIES | 1 / 1 |
| OFFER_NONADMIN_POLICIES | **0** |
| OFFER_TRIGGERS | 3 |
| AUDIT_ORDER_OFFER / AUDIT_ORDER_OFFER_LOOKUP | 1 / 1 |
| AUDIT_KEEP_0012_PKG_ITEM / AUDIT_KEEP_0012_PKG_LOOKUP | 1 / 1 |
| AUDIT_KEEP_0010_PRODUCT / AUDIT_KEEP_0010_CATALOG | 1 / 1 |
| AUDIT_KEEP_0009_ARRIVED / AUDIT_KEEP_0009_NOTE | 1 / 1 |
| AUDIT_KEEP_0008_PKG / AUDIT_KEEP_0008_PHONE / AUDIT_KEEP_0008_ATTR | 1 / 1 / 1 |
| AUDIT_KEEP_0005 / AUDIT_KEEP_0004 | 1 / 1 |
| REFS_CHECK_CUSTOMER | **1** |

Empat angka yang paling menentukan, dan kenapa:

* `OFFER_NONADMIN_POLICIES` **wajib 0** — tidak ada satu pun policy pada
  `order_sanci_offers` yang bisa bernilai benar tanpa `fn_is_admin()`. Inilah
  seluruh isi irisan ini: pengguna cabang mendapat NOL baris, SELECT sekalipun.
  Kalau angkanya menjadi 1, nilai penawaran SANCI terbaca partner lewat API
  tanpa satu pun pesan error dan tanpa apa pun berubah di layar — persis
  keadaan yang membuat kolom ini SENGAJA tidak ditaruh di `partner_orders`
  (RLS bekerja per BARIS, bukan per kolom; baris pesanan sudah terbaca cabang
  sejak `o_partner_read` di 0004).
* `OFFER_AMOUNT_TYPE` **wajib `numeric(15,2)`** — sama persis dengan
  `partner_orders.partner_purchase_amount`. Kedua angka ini tampil berdampingan
  di layar yang sama dan diketik lewat `parseIDRInput()` yang sama; kalau
  tipenya berbeda, suatu hari akan ada satu nilai yang diterima di satu kolom
  lalu ditolak di kolom sebelahnya dengan kode mentah 22003.
* `OFFER_NO_ID_COLUMN` dan `OFFER_NO_CLIENT_REQUEST_ID` **wajib 0**, keduanya
  disengaja. `order_id` ADALAH kunci utamanya (satu pesanan = satu nilai yang
  berlaku), dan justru bentuk itulah yang membuat penulisannya upsert idempoten
  tanpa perlu nomor permintaan (alasan yang sama dengan `sanci_catalog_access`
  di 0010). Kalau suatu hari muncul kolom `id`, tabel ini diam-diam berubah
  menjadi buku catatan yang boleh punya dua nilai berlaku sekaligus.
* `REFS_CHECK_CUSTOMER` **wajib 1**. Diperiksa ulang di sini karena 0013 adalah
  berkas TERAKHIR dalam rantai: kalau angkanya 0, berarti 0004 atau 0008 sempat
  dijalankan ulang sesudah 0011 dan lubang P2 tanpa gejala itu terbuka lagi.

Angka berkas LAMA setelah 0013 — sudah diukur, bukan diperkirakan: **hanya blok
0001 yang berubah** (`RLS_ENABLED` 17 → 18, `POLICIES` 37 → 38; `TRIGGERS` tetap
27). Blok 0004, 0005, 0009, 0010, 0011 dan 0012 **tidak berubah satu angka pun** —
0013 tidak menyentuh `partner_orders` maupun tabel mana pun yang mereka hitung.

### 0014
| Cek | nilai |
|---|---|
| POLICY_NEW_COLS / POLICY_NEW_COLS_DEFAULT_FALSE | 2 / **2** |
| OFFER_NEW_COLS | 2 |
| OFFER_DP_CHECK / OFFER_DP_LE_AMOUNT_CHECK | 1 / 1 |
| OFFER_POLICIES | **4** |
| OFFER_NONADMIN_POLICIES | **3** |
| OFFER_TRIGGERS | 3 (tetap — tidak ada guard trigger baru di tabel ini) |
| ORDER_SHIPPING_COLUMN / ORDER_SHIPPING_NOT_FROZEN | 1 / **1** |
| ORDER_ITEM_TABLE | 1 |
| ORDER_ITEM_QTY_CHECK | 1 |
| ORDER_ITEM_FK_ORDER_RESTRICT / _NOT_CASCADE | **1** / **0** |
| ORDER_ITEM_FK_PRODUCT_RESTRICT / _NOT_CASCADE | **1** / **0** |
| ORDER_ITEM_INDEXES | 2 |
| ORDER_ITEM_RLS / ORDER_ITEM_POLICIES | 1 / 5 |
| ORDER_ITEM_PARTNER_WRITE_POLICIES | **3** |
| ORDER_ITEM_TRIGGERS | 5 |
| ITEM_PRICE_GUARD_EXEC_PUBLIC / ITEM_IMMUTABLE_GUARD_EXEC_PUBLIC | **0** / **0** |
| AUDIT_ORDER_ITEM / AUDIT_ITEM_OFFER_NOTE_LOOKUP | 1 / 1 |
| AUDIT_KEEP_0013_OFFER | 1 |
| AUDIT_KEEP_0012_PKG_ITEM / AUDIT_KEEP_0012_PKG_LOOKUP | 1 / 1 |
| AUDIT_KEEP_0010_PRODUCT / AUDIT_KEEP_0010_CATALOG | 1 / 1 |
| AUDIT_KEEP_0009_ARRIVED / AUDIT_KEEP_0009_NOTE | 1 / 1 |
| AUDIT_KEEP_0008_PKG / AUDIT_KEEP_0008_PHONE / AUDIT_KEEP_0008_ATTR | 1 / 1 / 1 |
| AUDIT_KEEP_0005 / AUDIT_KEEP_0004 | 1 / 1 |
| REFS_CHECK_CUSTOMER | **1** |

38 baris total, semua sudah diukur di Postgres 16 lokal (bukan diperkirakan) —
lihat blok verifikasi lengkap di kepala berkas `0014_permissions_items_shipping.sql`
untuk penjelasan tiap angka.

⚠️ **`OFFER_POLICIES` (1 → 4) dan `OFFER_NONADMIN_POLICIES` (0 → 3) BERUBAH dari
angka yang ditulis di 0013.** Ini DISENGAJA, bukan regresi — 0013 sendiri TIDAK
diedit (dan tidak boleh diedit), jadi komentarnya di sana tetap berbunyi seperti
semula selamanya; begitu 0014 menjadi berkas terakhir dalam rantai, keadaan
sesungguhnya berubah karena §3 berkas ini menambah TIGA policy baru
(`oso_partner_read`/`_insert`/`_update`) yang membuka akses TERKONTROL untuk
cabang lewat dua flag `can_view_offer`/`can_edit_offer`. Siapa pun yang
mencocokkan angka 0013 pada database yang SUDAH punya 0014 WAJIB memakai angka
BARU ini (4 / 3), bukan angka lama (1 / 0) di berkas 0013.

Dua hal lain yang perlu diketahui pembaca berkas ini:

* **Fitur diskon/markup/potongan-tunai yang direncanakan awal SENGAJA TIDAK
  dibangun DI SINI (0014).** Bentrok langsung dengan `GLOSSARY.md` §"Penawaran
  SANCI bukan harga" dan `FEATURES.md` §"Phase 2 irisan ketujuh" — keduanya
  ditulis di commit 0013 (satu hari sebelum berkas ini) dan secara eksplisit
  menyatakan sistem ini tidak menghitung diskon apa pun. Membangunnya di atas
  keputusan yang baru saja dibuat, tanpa konfirmasi ulang, berisiko membangun
  sesuatu yang justru baru saja diputuskan TIDAK diinginkan — lihat penjelasan
  lengkap di kepala berkas 0014. Yang dibangun sebagai gantinya (`dp_amount`,
  `payment_condition`) murni pencatatan, bukan perhitungan.
  **⚠️ Konflik ini kemudian DIPUTUSKAN owner (2026-08-20) — lihat 0015 di
  bawah.** GLOSSARY.md/FEATURES.md sudah disinkronkan; kalimat di atas
  ditinggalkan APA ADANYA sebagai jejak keputusan pada saat 0014 ditulis
  (migration yang sudah/akan dijalankan tidak diedit retroaktif).
* **`can_discount` (flag izin ketiga yang diminta rencana awal) TIDAK
  dibangun DI SINI (0014)** — konsekuensi langsung dari poin di atas. Dibangun
  di 0015 sebagai gerbang TAMBAHAN di atas `can_edit_offer`, bukan flag
  sejajar — lihat penjelasan lengkap di kepala berkas 0015 §6.

### 0015

| Cek | nilai |
|---|---|
| CAN_DISCOUNT_COL / CAN_DISCOUNT_DEFAULT_FALSE | 1 / **1** |
| DISCOUNT_PCTS_COL / DISCOUNT_PCTS_TYPE / DISCOUNT_PCTS_NOT_NULL | 1 / `jsonb` / 1 |
| DISCOUNT_DEFAULT_EMPTY_ARRAY | **1** |
| MARKUP_PCT_COL / MARKUP_PCT_CHECK | 1 / 1 |
| CASH_DISCOUNT_COL / CASH_DEFAULT_ZERO / CASH_DISCOUNT_CHECK | 1 / **1** / 1 |
| FINAL_AMOUNT_COL / FINAL_NOT_NULL | 1 / **1** |
| FINAL_AMOUNT_TYPE | `numeric(15,2)` |
| DP_LE_AMOUNT_CHECK_GONE | **0** ← WAJIB 0: constraint lama 0014 sudah diganti |
| DP_LE_FINAL_CHECK | **1** |
| COMPUTE_TRIGGER_EXISTS / DISCOUNT_GUARD_TRIGGER_EXISTS | 1 / 1 |
| OFFER_TRIGGERS | **5** ← ⚠ BERUBAH dari 3 (0013/0014) |
| DISCOUNT_GUARD_EXEC_PUBLIC | **0** (LESSONS #26) |
| AUDIT_KEEP_0014_ITEM / AUDIT_KEEP_0013_OFFER | 1 / 1 |
| AUDIT_KEEP_0012_PKG_ITEM / AUDIT_KEEP_0012_PKG_LOOKUP | 1 / 1 |
| AUDIT_KEEP_0010_PRODUCT / AUDIT_KEEP_0010_CATALOG | 1 / 1 |
| AUDIT_KEEP_0009_ARRIVED / AUDIT_KEEP_0009_NOTE | 1 / 1 |
| AUDIT_KEEP_0008_PKG / AUDIT_KEEP_0008_PHONE / AUDIT_KEEP_0008_ATTR | 1 / 1 / 1 |
| AUDIT_KEEP_0005 / AUDIT_KEEP_0004 | 1 / 1 |
| REFS_CHECK_CUSTOMER | **1** |

34 baris total, semua sudah diukur di Postgres 16 lokal (bukan diperkirakan) —
lihat blok verifikasi lengkap di kepala berkas `0015_order_discount_chain.sql`
untuk penjelasan tiap angka.

⚠️ **`OFFER_TRIGGERS` (3 → 5) BERUBAH dari angka yang ditulis di 0013/0014.**
Sama seperti pola `OFFER_POLICIES`/`OFFER_NONADMIN_POLICIES` di atas — 0013 dan
0014 sendiri TIDAK diedit, jadi komentar di kedua berkas itu tetap berbunyi "3"
selamanya; begitu 0015 menjadi berkas terakhir dalam rantai, angka
sesungguhnya menjadi 5 (dua trigger baru: `trg_order_offer_discount_guard`,
`trg_order_offer_final_compute`). Siapa pun yang mencocokkan angka 0013/0014
pada database yang SUDAH punya 0015 WAJIB memakai angka BARU ini (5), bukan
angka lama (3).

Angka blok verifikasi berkas LAMA setelah 0015 — SUDAH DIUKUR di Postgres 16
lokal: **hanya blok 0013 yang berubah** (`OFFER_TRIGGERS` 3 → 5, dijelaskan di
atas; SEMUA angka lain di blok 0013 tetap). Blok 0001 TIDAK berubah satu angka
pun (`RLS_ENABLED`/`POLICIES`/`TRIGGERS` tetap 19/46/27 — 0015 tidak membuat
tabel atau policy baru, dan kedua trigger barunya ada di tabel berawalan
`order_` yang TIDAK ikut terhitung blok 0001, persis pola `order_sanci_offers`/
`order_items` sebelumnya). Blok 0004/0005/0008/0009/0010/0011/0012/0014 TIDAK
berubah satu angka pun.

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

Empat batas milik 0013, semuanya sudah diukur, bukan dugaan:

1. **Aksi `ORDER_OFFER_*` TIDAK muncul di tab Activity halaman detail pesanan.**
   Query di layar itu menyaring `entity_type = 'partner_orders'`, sedangkan baris
   audit ini ber-`entity_type = 'order_sanci_offers'` — persis keadaan yang sama
   dengan `ORDER_INTERNAL_NOTE_CREATED` milik 0009, dan bukan sesuatu yang rusak.
   Riwayatnya TERBACA di **Aktivitas Partner** dan **Aktivitas Cabang** (keduanya
   khusus admin), karena §2 sengaja mengisi `partner_id` DAN `branch_id` dari
   pesanannya. Kalau suatu hari riwayat penawaran ingin tampil di halaman detail
   pesanan juga, yang diubah adalah query layar itu (tambahkan `entity_type`
   kedua), bukan migration ini.
2. **`entity_id` baris auditnya NULL.** `fn_audit_row` mengambilnya dari kolom
   `id` lalu `partner_id`, dan tabel ini tidak punya keduanya — kunci barisnya
   `order_id`. Tidak ada informasi yang hilang (`before`/`after` memuat
   `order_id` lengkap), tapi layar baru jangan menganggap `entity_id` selalu
   terisi. Keadaan yang sama sudah ada sejak `sanci_catalog_access` (0010), hanya
   di sana nilainya jatuh ke `partner_id`.
3. **Tidak ada batas atas selain tipe kolomnya.** CHECK-nya hanya `>= 0`;
   `numeric(15,2)` menampung sampai Rp 9.999.999.999.999,99. `parseIDRInput()`
   di `web/lib/orders-shared.ts` masih menerima sampai Rp 99.999.999.999.999,
   jadi Server Action `setOrderOffer()` memeriksa batas itu sendiri — kalau
   pemeriksaan itu suatu hari dihapus, pengguna akan melihat kode mentah `22003`
   alih-alih pesan yang bisa dibaca. Batas yang sama persis berlaku untuk
   `partner_purchase_amount` sejak 0009.
4. **Angka ini TIDAK divalidasi terhadap apa pun.** Basis data tidak
   membandingkannya dengan `partner_purchase_amount`, tidak menghitung diskon,
   dan tidak punya aturan penetapan harga — batas tegas 0009 berlaku penuh. Ia
   diketik manusia dan artinya diputuskan manusia. Perlu ditegaskan supaya audit
   berikutnya tidak salah menandainya: ini **bukan** pelanggaran aturan "katalog
   tanpa harga" milik 0010, karena yang disimpan adalah nilai kesepakatan untuk
   SATU pesanan konkret, bukan harga sebuah produk. `sanci_products` tetap tidak
   punya dan tidak boleh punya kolom harga.

Lima batas milik 0014, semuanya sudah diukur, bukan dugaan:

1. **⚠️ SUPERSEDED oleh 0015 untuk BAGIAN "tidak ada mesin hitung diskon".**
   Tetap benar untuk `dp_amount`/`payment_condition`/`order_items.unit_price`/
   `line_discount` — semuanya TETAP angka/teks yang diketik manusia, basis
   data TIDAK menghitung apa pun dari nilai-nilai itu (batas ini tidak
   berubah). Yang BERUBAH: `order_sanci_offers` sekarang PUNYA rantai diskon
   tingkat pesanan yang DIHITUNG database (`discount_pcts`/`markup_pct`/
   `cash_discount` → `final_amount`) — lihat "Batas milik 0015" di bawah.
2. **Isi Package TIDAK dibekukan ulang kalau pesanan diedit sesudahnya.**
   Salinan ke `order_items` terjadi SEKALI saat pesanan dibuat (best-effort).
   Kalau isi Package induknya berubah BESOK, baris `order_items` pesanan yang
   sudah dibuat HARI INI tidak ikut berubah (memang begitu maksudnya —
   riwayat), tapi juga tidak ada mekanisme "sinkronkan ulang" kalau admin
   sengaja mau menyamakan lagi — itu berarti hapus baris lama + tambah baris
   baru manual lewat layar Isi Pesanan.
3. **Salinan otomatis best-effort, BUKAN transaksional dengan pembuatan
   pesanan.** Kalau salinan gagal sebagian (mis. produk di paket sudah
   dihapus), pesanan ITU SENDIRI tetap tersimpan penuh — cabang melihat
   peringatan "sebagian isi paket gagal disalin", bukan pesanan gagal dibuat
   total. Ini disengaja (pola sama dengan unggah invoice, LESSONS #10/#12),
   tapi berarti `order_items` sebuah pesanan BISA sah kosong walau
   `package_id`-nya terisi — layar tidak boleh menganggap "package_id ada"
   berarti "pasti ada baris order_items".
4. **`quantity` di order_items tidak punya batas atas selain tipe kolomnya**
   (sama seperti `partner_package_items` 0012) — CHECK-nya hanya `> 0`.
5. **Kombinasi shipping_address "digabung" ke tier fallback yang sama dengan
   fulfillment_path/partner_purchase_amount di `createCustomerAndOrder`**
   (`web/app/cabang/pesanan/actions.ts`) — penyederhanaan sadar: memisahkan
   setiap kolom jadi tier fallback tersendiri lebih presisi tapi jauh lebih
   rumit untuk risiko yang sempit (kolom-kolom ini datang dari migrasi
   berbeda — 0009 vs 0014 — jadi ADA skenario teoretis "0009 sudah jalan,
   0014 belum" yang membuat grup ini gagal bersama dan jawaban fulfillment
   ikut ditandai partial walau sebenarnya hanya shipping_address yang
   bermasalah). Tidak ada kehilangan data diam-diam (mekanisme partial yang
   sudah ada tetap melapor jujur), hanya kurang presisi soal kolom mana yang
   sebenarnya gagal.

Enam batas milik 0015, semuanya sudah diukur, bukan dugaan:

1. **Diskon PER-BARIS (`order_items.unit_price`/`line_discount`) TIDAK ikut
   berubah.** Keduanya TETAP angka absolut yang diketik manusia — rantai
   diskon di berkas ini murni TINGKAT PESANAN (`order_sanci_offers`). Tidak
   ada rencana menyatukan keduanya; nama kolomnya sengaja dibedakan dari awal
   (`line_discount` vs `discount_pcts`) supaya tidak pernah tertukar.
2. **`can_discount` adalah gerbang TAMBAHAN di ATAS `can_edit_offer`, BUKAN
   flag sejajar.** RLS `oso_partner_insert`/`oso_partner_update` (0014) TIDAK
   diubah berkas ini — tetap mensyaratkan `can_edit_offer` untuk SELURUH
   baris. Partner dengan `can_discount=true` tapi `can_edit_offer=false`
   mendapat NOL baris tertulis (RLS menolak sebelum trigger sempat
   dievaluasi) — diuji eksplisit di test-harness (T8). Ini keputusan SADAR
   (lihat kepala berkas 0015 §6/§7 untuk penjelasan penuh kenapa melebarkan
   RLS akan membuka celah), bukan bug.
3. **Tidak ada pembulatan otomatis di luar `cash_discount`.** "去尾数"
   (membulatkan ke angka bersih) dilakukan MANUSIA dengan mengisi
   `cash_discount` sampai `final_amount` jadi angka yang diinginkan — basis
   data tidak menebak atau membulatkan sendiri kapan pun.
4. **`discount_pcts` tidak punya batas atas selain 6 elemen dan rentang
   (0,100) per elemen** — tidak ada aturan bisnis seperti "total diskon tidak
   boleh lebih dari X%"; enam diskon 99% masing-masing SAH secara validasi
   (walau hasilnya, digabung markup/cash, mungkin kena penjaga
   `final_amount < 0` kalau kombinasinya ekstrem).
5. **`final_amount` TIDAK divalidasi terhadap `partner_purchase_amount`.**
   Sama seperti batas 0013 untuk `amount` — basis data tidak membandingkan
   nilai penawaran/harga akhir dengan belanja pelanggan di toko, dan tidak
   punya aturan penetapan harga apa pun di luar rumus rantai diskon itu
   sendiri.
6. **Backfill `final_amount` untuk baris LAMA hanya valid karena kolom
   diskon BARU SAJA mendapat nilai bawaannya di migrasi yang SAMA.** Kalau
   suatu hari seseorang menulis migrasi lanjutan yang mengubah DEFAULT
   `discount_pcts`/`markup_pct`/`cash_discount` SEBELUM backfill 0015 pernah
   berjalan (skenario yang seharusnya tidak mungkin karena 0015 sudah
   dijalankan di production sebelum migrasi mana pun berikutnya), asumsi
   "backfill = amount" di kepala berkas 0015 §3 perlu ditinjau ulang — tidak
   berlaku otomatis untuk skema yang berbeda.
