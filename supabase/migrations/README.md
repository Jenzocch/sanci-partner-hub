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

## ATURAN BESI

> **Setiap kali sebuah berkas LAMA dijalankan ulang, SEMUA berkas sesudahnya
> WAJIB dijalankan ulang juga, dalam urutan
> `0001 → 0003 → 0004 → 0005 → 0006 → 0007 → 0008 → 0009`.**

Kenapa: beberapa berkas mendefinisikan ULANG fungsi/policy milik berkas
sebelumnya (`fn_audit_row`, `fn_check_order_refs`, `c_partner_read`,
`s_partner_read`, `fn_can_view_branch`, `fn_can_edit_branch`). `CREATE OR
REPLACE` selalu dimenangkan yang dijalankan **terakhir**, bukan yang paling
baru nomornya.

Yang benar-benar terjadi kalau aturan ini dilanggar — sudah diukur, bukan dugaan:

| Yang dijalankan ulang | Yang rusak diam-diam |
|---|---|
| 0001 | `s_partner_read` kembali ke versi lama → **setiap "Simpan staf" dari cabang gagal**; `fn_audit_row` kehilangan awalan `PACKAGE`, `CUSTOMER_PHONE_CHANGED`, `ORDER_ATTRIBUTION_CORRECTED`, `ORDER_CANCELLED`, `ORDER_CUSTOMER_ARRIVED`, dan awalan `ORDER_INTERNAL_NOTE`. |
| 0004 | `c_partner_read` kembali ke versi lama → **setiap "Simpan pelanggan" dari cabang gagal**; `fn_check_order_refs` berhenti memeriksa pemilik paket; `fn_audit_row` seperti di atas. |
| 0005 | `fn_audit_row` kehilangan tambahan 0008 (PACKAGE / PHONE_CHANGED / ATTRIBUTION) dan tambahan 0009 (ARRIVED / INTERNAL_NOTE). |
| 0006 | tidak ada — 0006 hanya menulis dua helper, dan sejak 0007 isi 0001 sudah sama. |
| 0008 | `fn_audit_row` kehilangan tambahan 0009 saja (ARRIVED / INTERNAL_NOTE). |

Khusus 0009, kerusakannya sudah diukur satu per satu — yang hilang HANYA isi
`fn_audit_row`; trigger `trg_order_arrival`, kedua policy
`order_internal_notes`, keempat policy `order_invoices_*`, dan status privat
bucket `order-invoices` semuanya **selamat**. Bentuk kerusakannya persis begini:

| Yang terlihat di layar Aktivitas | Seharusnya |
|---|---|
| `ORDER_INTERNAL_NOTES_CREATED` (pakai S) | `ORDER_INTERNAL_NOTE_CREATED` |
| `ORDER_UPDATED` saat pelanggan ditandai tiba | `ORDER_CUSTOMER_ARRIVED` |
| `PARTNER_ORDERS_UPDATED` (kalau yang diulang 0001) | `ORDER_UPDATED` |

Kode mentah itu akan tampil apa adanya kepada pembacanya karena
`web/lib/audit-format.ts` tidak punya labelnya. Perbaikannya satu langkah:
jalankan ulang 0009. Sebaliknya — dan ini sengaja — versi `fn_audit_row` di
0009 memuat SELURUH perilaku 0004+0005+0008, jadi menjalankan 0009 paling
akhir juga **memulihkan** pemetaan yang sempat tertimpa berkas lama.

Dua hal yang **tidak** ikut rusak, supaya tidak ditakuti tanpa perlu:

* `fn_can_view_branch` / `fn_can_edit_branch` — sejak 0007, versi `LEFT JOIN`
  milik 0006 sudah disalin balik ke 0001, jadi menjalankan ulang 0001 tidak lagi
  menghidupkan bug "cabang sendiri tidak terlihat".
* Hak EXECUTE yang dicabut 0007 — `CREATE OR REPLACE` mempertahankan hak akses,
  jadi `fn_next_order_seq` tetap tertutup.

Tetap saja: **jalankan ulang berurutan sampai 0009.** Setelah dijalankan ulang,
cocokkan lagi angka di tabel bawah — itu satu-satunya bukti (LESSONS #7 & #16;
"Run tanpa tulisan merah" bukan bukti).

## Angka verifikasi yang diharapkan

Kolom **fresh** = nilai saat berkas itu dijalankan pertama kali dalam rantai.
Kolom **setelah 0009** = nilai kalau blok verifikasi berkas itu dijalankan ulang
pada database yang sudah lengkap. Nilai yang **berubah** ditandai `→`.

### 0001
| Cek | fresh | setelah 0009 |
|---|---|---|
| TABLES | 9 | 9 |
| RLS_ENABLED | 9 | 9 → **14** (+customers, partner_orders, partner_order_counters, partner_packages, order_internal_notes) |
| POLICIES | 19 | 19 → **31** (+6 dari 0004, +1 dari 0005, +3 dari 0008, +2 dari 0009) |
| TRIGGERS | 12 | 12 → **23** (+5 dari 0004, +2 dari 0005, +3 dari 0008, +1 dari 0009) |

`TRIGGERS` di 0001 hanya menghitung tabel berawalan `partner%`, jadi kedua
trigger `order_internal_notes` TIDAK ikut terhitung di sini — yang bertambah
dari 0009 hanya `trg_order_arrival` pada `partner_orders`.

### 0003
| Cek | fresh | setelah 0009 |
|---|---|---|
| BUCKET | 1 | 1 |
| BUCKET_PUBLIC | true | true |
| STORAGE_POLICIES | 4 | 4 |
| LOGO_URL_COLUMN | 1 | 1 |

Blok 0003 menyaring `policyname like 'partner_logos_%'`, jadi keempat policy
`order_invoices_*` milik 0009 memang tidak boleh muncul di angka ini. Kalau
`STORAGE_POLICIES` menjadi 8, berarti penyaringnya ikut terubah — laporkan.

### 0004
| Cek | fresh | setelah 0009 |
|---|---|---|
| TABLES | 3 | 3 |
| RLS_ENABLED | 3 | 3 |
| POLICIES | 6 | 6 → **8** (+`o_partner_update` 0005, +`c_partner_update` 0008) |
| TRIGGERS | 8 | 8 → **12** (+2 penjaga order 0005, +1 penjaga pelanggan 0008, +1 penjaga kedatangan 0009) |
| INDEXES | 10 | 10 → **12** (+`idx_partner_orders_status` 0005, +`idx_partner_orders_package` 0008) |
| FUNCTIONS | 5 | 5 |
| AUDIT_MAP | 1 | 1 |

### 0005
| Cek | fresh | setelah 0009 |
|---|---|---|
| CANCEL_COLUMNS | 3 | 3 |
| ORDER_POLICIES | 4 | 4 |
| ORDER_UPDATE_POLICY | 1 | 1 |
| CUSTOMER_UPDATE_POLICY | 0 | 0 → **1** ⚠ |
| ORDER_DELETE_POLICY | 0 | 0 |
| ORDER_TRIGGERS | 7 | 7 → **8** (+`trg_order_arrival` 0009) |
| GUARD_FUNCTIONS | 2 | 2 |
| REFS_ON_UPDATE | 1 | 1 |
| AUDIT_CANCEL / AUDIT_KEEP_0004 / AUDIT_REASON | 1 / 1 / 1 | 1 / 1 / 1 |

0009 TIDAK menambah policy apa pun ke `partner_orders`: cabang mengisi jalur
pesanan, total belanja, dan invoice lewat celah UPDATE yang sudah dibuka 0005
(`o_partner_update`). Jadi `ORDER_POLICIES` tetap 4, dan `ORDER_DELETE_POLICY`
tetap **WAJIB 0**.

⚠ `CUSTOMER_UPDATE_POLICY` adalah **satu-satunya** angka bertanda "WAJIB 0" yang
memang berubah menjadi 1, dan itu disengaja: Customer Edit untuk cabang adalah
isi 0008 (SPEC §33–34). Kalau nilainya 1 padahal 0008 **belum** dijalankan,
itu masalah — laporkan.

### 0006
| Cek | fresh | setelah 0009 |
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
| ORDER_TRIGGERS | 8 |
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
