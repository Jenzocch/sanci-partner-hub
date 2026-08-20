-- ============================================================
-- SANCI Partner Hub — Phase 2 irisan kesebelas
-- Migration 0017: dua kolom label pada customers — customer_code (kode
--                  pelanggan internal Jenzo, mis. "A/26-C/033") dan email
--                  (idempotent — aman dijalankan ulang)
-- Jalankan di: Supabase Studio → SQL Editor → paste seluruh file → Run
--
-- PRASYARAT: 0001 → 0003 → 0004 → 0005 → 0006 → 0007 → 0008 → 0009 → 0010 →
-- 0011 → 0012 → 0013 → 0014 → 0015 → 0016 sudah dijalankan, DALAM URUTAN ITU.
-- Blok pengaman di bawah berhenti dengan pesan jelas kalau belum. Setelah
-- berkas ini, rantai penuhnya menjadi 0001 → 0003 → … → 0016 → 0017 (lihat
-- migrations/README.md — ATURAN BESI).
--
-- LATAR BELAKANG (owner, 2026-08-20, "客戶資料也進去"): Jenzo minta daftar 36
-- pelanggan lama (dari luar sistem — Excel/WhatsApp/ingatan tim sales)
-- diimpor, DENGAN SYARAT KERAS: pelanggan hasil impor ini TIDAK BOLEH
-- terlihat cabang mana pun. Berkas ini HANYA menambah dua kolom label ke
-- `customers`; kepatuhan pada syarat keras itu bukan urusan skema (RLS
-- `customers` SUDAH menjamin ini sejak 0004/0007 — lihat §3 di bawah) —
-- sepenuhnya urusan skrip impor (`web/scripts/import-customers/`) yang
-- menulis `created_via_partner_id`/`created_via_branch_id` = NULL untuk
-- setiap baris.
-- ============================================================
-- APA YANG DIBUKA IRISAN INI (dan hanya ini)
-- ============================================================
--   customers.customer_code → kolom BARU, text, nullable. Kode internal
--                             Jenzo per pelanggan (format bebas, contoh nyata
--                             dari 36 baris data impor: "A/26-C/033"). Blank-
--                             guard CHECK + partial UNIQUE index — lihat §2
--                             untuk kenapa aman menambah UNIQUE di sini
--                             (36 baris data nyata sudah diperiksa, TIDAK ADA
--                             duplikat).
--   customers.email         → kolom BARU, text, nullable. Blank-guard CHECK
--                             saja — TIDAK unique (owner tidak memintanya,
--                             dan email bukan identitas pelanggan di sistem
--                             ini, sama seperti telepon — SPEC §9).
--   fn_audit_row            → TIDAK disentuh sama sekali. Lihat §4.
--   RLS customers            → TIDAK disentuh sama sekali. Lihat §3.
-- ============================================================

-- ── 0. Pengaman prasyarat ───────────────────────────────────

do $$
begin
  if to_regclass('public.order_documents') is null then
    raise exception
      'Migration 0016_order_documents.sql belum dijalankan di database ini. Jalankan 0001 → … → 0016 dulu, baru 0017.';
  end if;
end;
$$;

-- ── 1. Kolom baru ───────────────────────────────────────────

alter table public.customers add column if not exists customer_code text;
alter table public.customers add column if not exists email text;

-- Blank-guard: string kosong BUKAN "tidak ada kode"/"tidak ada email" — kalau
-- dibiarkan, index unique di §2 akan menganggap banyak baris '' sebagai NILAI
-- SAMA (bukan NULL) dan saling menolak. Pola sama persis dengan
-- `sanci_products_code_not_blank` (0010).
do $$
begin
  if not exists (select 1 from pg_constraint
                 where conname = 'customers_customer_code_not_blank'
                   and conrelid = 'public.customers'::regclass) then
    alter table public.customers
      add constraint customers_customer_code_not_blank
      check (customer_code is null or btrim(customer_code) <> '');
  end if;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_constraint
                 where conname = 'customers_email_not_blank'
                   and conrelid = 'public.customers'::regclass) then
    alter table public.customers
      add constraint customers_email_not_blank
      check (email is null or btrim(email) <> '');
  end if;
end;
$$;

-- ── 2. Keunikan customer_code — DIPERIKSA, bukan diasumsikan ─

-- KEPUTUSAN: partial UNIQUE index DITAMBAHKAN (bukan dilewati). Alasannya:
-- 36 baris data impor sungguhan (scratchpad/customers-import.json, disalin ke
-- web/scripts/import-customers/customers.json) diperiksa satu per satu
-- SEBELUM berkas ini ditulis — SEMUA 36 nilai customer_code BERBEDA, nol
-- duplikat. Formatnya sendiri ("A/26-C/033": prefix sumber/tahun-inisial
-- sales/nomor urut) juga terlihat seperti skema penomoran yang MEMANG
-- dimaksudkan unik oleh Jenzo, bukan label bebas berulang. Kalau di masa
-- depan ternyata ADA kebutuhan dua pelanggan berbagi satu kode (skenario yang
-- belum pernah terjadi di data yang ada), index ini harus di-DROP oleh
-- migrasi lanjutan dengan alasan tertulis — bukan diam-diam dilonggarkan.
--
-- Bentuknya PERSIS mengikuti pola `sanci_products_code_key` (0010 §1): unique
-- HANYA untuk baris yang punya kode (`where customer_code is not null`),
-- supaya banyak pelanggan tanpa kode (mayoritas pelanggan yang dibuat lewat
-- alur normal aplikasi, BUKAN hasil impor) tidak saling bentrok — di Postgres
-- setiap NULL dianggap berbeda oleh UNIQUE biasa, tapi predikat ini ditulis
-- eksplisit supaya maksudnya tidak bisa salah dibaca oleh pembaca berikutnya.
create unique index if not exists customers_customer_code_key
  on public.customers (customer_code) where customer_code is not null;

-- customer_code tidak dapat index pencarian tersendiri di luar unique index
-- di atas — pola yang sama dengan sanci_products (index unique itu sendiri
-- SUDAH bisa dipakai planner untuk pencarian persis by customer_code kalau
-- suatu hari dibutuhkan; belum ada layar yang mencari dengan kolom ini).

-- ── 3. RLS `customers` — TIDAK disentuh, ditegaskan di sini ─

-- Berkas ini TIDAK punya satu baris pun `create policy`/`drop policy`/`alter
-- policy` untuk customers. Ini disengaja dan WAJIB ditegaskan eksplisit
-- karena syarat keras owner ("pelanggan impor TIDAK BOLEH terlihat cabang")
-- justru bergantung pada RLS yang SUDAH ADA sejak 0004/0007 TIDAK BERUBAH:
--
--   c_partner_read (0007) mengizinkan baca kalau salah satu benar:
--     1. fn_is_admin()
--     2. fn_can_view_branch(created_via_branch_id)
--     3. fn_customer_has_visible_order(id)
--
-- Skrip impor (web/scripts/import-customers/) menulis created_via_partner_id
-- DAN created_via_branch_id = NULL untuk SETIAP baris yang dibuatnya, dan
-- TIDAK PERNAH membuat order apa pun. Akibatnya untuk pengguna cabang:
--   (2) fn_can_view_branch(NULL) → exists(... where br.id = NULL ...) tidak
--       pernah cocok dengan baris partner_branches mana pun → false.
--   (3) fn_customer_has_visible_order(id) → tidak ada baris partner_orders
--       yang menunjuk pelanggan ini → false.
-- Jadi (2) dan (3) SELALU false untuk pelanggan hasil impor, dan (1) hanya
-- benar untuk SANCI Admin. RLS BUKAN kolom yang bisa "dilubangi" oleh dua
-- kolom baru migrasi ini — Postgres RLS bekerja per BARIS (via `using`/`with
-- check` pada operasi SELECT/INSERT/UPDATE/DELETE), bukan per kolom; kolom
-- baru yang ditambah §1 otomatis ikut ATURAN BARIS yang sudah ada, TANPA
-- migrasi ini perlu menyebut nama kolomnya sama sekali. RLS_POLICIES_CUSTOMER
-- di §6 memverifikasi jumlah policy customers TIDAK bertambah (tetap 4 —
-- c_admin_all/c_partner_read/c_partner_insert/c_partner_update, tidak
-- berubah sejak 0008), yang secara langsung membuktikan klaim di atas: kalau
-- berkas ini diam-diam menambah/mengurangi satu policy pun, angka itu akan
-- berubah dan pengecekan gagal.

-- ── 4. fn_audit_row: TIDAK didefinisikan ulang ──────────────

-- Migrasi KEDUA sejak 0009 yang tidak menyentuh fn_audit_row (yang pertama
-- adalah 0015 — pola dan alasannya sama). ATURAN BESI (migrations/README.md)
-- mewajibkan definisi ULANG UTUH setiap kali sebuah TABEL BARU perlu awalan
-- aksi baru. Berkas ini TIDAK membuat tabel baru — hanya menambah DUA KOLOM
-- ke `customers`, tabel yang SUDAH dipetakan ke awalan 'CUSTOMER' sejak 0004
-- (`when 'customers' then 'CUSTOMER'`, lihat definisi fn_audit_row yang
-- berlaku sekarang di 0016 §6). fn_audit_row bekerja per NAMA TABEL, bukan
-- per kolom — `to_jsonb(new)`/`to_jsonb(old)` otomatis menyertakan KOLOM APA
-- PUN yang ada di baris itu tanpa perlu fungsi ini tahu namanya satu-satu.
-- Jadi CUSTOMER_CREATED/CUSTOMER_UPDATED yang lahir dari perubahan
-- customer_code/email OTOMATIS ikut membawa kedua kolom baru di
-- before/after JSON, tanpa satu baris kode baru di sini — diverifikasi §6
-- (ketiga belas AUDIT_KEEP_* + REFS_CHECK_CUSTOMER masih utuh, membuktikan
-- fungsi ini SAMA PERSIS dengan versi 0016, bukan tertimpa diam-diam oleh
-- sesuatu yang lain). Satu pengecualian yang SUDAH ADA sejak 0008 dan TIDAK
-- terpengaruh migrasi ini: UPDATE yang mengubah phone_normalized tetap
-- tercatat sebagai CUSTOMER_PHONE_CHANGED (bukan CUSTOMER_UPDATED) — cabang
-- kasus itu memeriksa kolom phone_normalized secara spesifik, tidak
-- tersentuh oleh customer_code/email.
--
-- web/lib/audit-format.ts JUGA TIDAK PERLU disentuh (LESSONS #28 diperiksa
-- eksplisit, bukan diasumsikan): SKIP hanya untuk actor UUID/storage path/
-- kolom internal murni — customer_code dan email adalah nilai teks bisnis
-- biasa yang MEMANG seharusnya tampil apa adanya di layar Aktivitas (sama
-- seperti full_name/phone/address yang sudah tampil polos sejak 0004), bukan
-- UUID mentah atau path storage yang perlu disembunyikan. LABELS/VALUE_LABELS
-- hanya untuk enum/boolean yang perlu diterjemahkan ke Bahasa Indonesia —
-- keduanya kolom ini bertipe text bebas, bukan enum, jadi tidak ada label
-- yang perlu ditambahkan.
--
-- KONSEKUENSI untuk migrations/README.md ATURAN BESI: karena 0017 tidak
-- mendefinisikan ulang fn_audit_row, ia TIDAK memulihkan apa pun kalau berkas
-- LAMA dijalankan ulang di atasnya — pemulih TERAKHIR di rantai tetap 0016.

-- ── 5. Verifikasi (hasilnya di-copy balik ke Claude) ────────
-- Harapan (semua sudah diukur di Postgres 16 lokal — lihat commit report):
--   CUSTOMER_CODE_COL              1   ← customers.customer_code ada
--   CUSTOMER_CODE_TYPE             text
--   CUSTOMER_CODE_NOT_BLANK        1   ← check (customer_code is null or btrim(...)<>'')
--   CUSTOMER_CODE_UNIQUE_PARTIAL   1   ← WAJIB 1: DITAMBAHKAN (36 baris data nyata
--                                        diperiksa, nol duplikat — lihat §2)
--   CUSTOMER_EMAIL_COL             1   ← customers.email ada
--   CUSTOMER_EMAIL_TYPE            text
--   CUSTOMER_EMAIL_NOT_BLANK       1   ← check (email is null or btrim(...)<>'')
--   CUSTOMER_EMAIL_UNIQUE          0   ← WAJIB 0: SENGAJA TIDAK unique (§ atas kepala berkas)
--   CUSTOMER_POLICIES              4   ← WAJIB TETAP 4 (c_admin_all/c_partner_read/
--                                        c_partner_insert/c_partner_update, sejak 0008) —
--                                        BUKTI RLS customers TIDAK berubah (§3)
--   CUSTOMER_RLS_ENABLED           1   ← tetap enabled sejak 0004
--   AUDIT_KEEP_0014_ITEM           1   ← awalan ORDER_ITEM milik 0014 masih utuh
--   AUDIT_KEEP_0013_OFFER          1
--   AUDIT_KEEP_0012_PKG_ITEM       1
--   AUDIT_KEEP_0012_PKG_LOOKUP     1
--   AUDIT_KEEP_0010_PRODUCT        1
--   AUDIT_KEEP_0010_CATALOG        1
--   AUDIT_KEEP_0009_ARRIVED        1
--   AUDIT_KEEP_0009_NOTE           1
--   AUDIT_KEEP_0008_PKG            1
--   AUDIT_KEEP_0008_PHONE          1
--   AUDIT_KEEP_0008_ATTR           1
--   AUDIT_KEEP_0005                1
--   AUDIT_KEEP_0004                1
--   REFS_CHECK_CUSTOMER            1   ← WAJIB 1: lubang P2 milik 0011 masih tertutup
--
-- Angka AUDIT_KEEP_*/REFS_CHECK_CUSTOMER (14 baris) TIDAK bertambah maupun
-- berkurang dari daftar 0016 — inilah bukti langsung bahwa fn_audit_row
-- benar-benar tidak disentuh berkas ini (kalau salah satunya 0, berarti ada
-- sesuatu yang lain mendefinisikan ulang fungsi ini di antara 0016 dan 0017,
-- bukan salah berkas ini).
--
-- Angka blok verifikasi berkas LAMA setelah 0017: TIDAK ADA yang berubah —
-- berkas ini tidak mendefinisikan ulang fungsi/policy milik berkas mana pun
-- sebelumnya, hanya menambah dua kolom + dua constraint + satu index baru
-- pada tabel yang sudah ada. Blok 0001 (TABLES/RLS_ENABLED/POLICIES/TRIGGERS)
-- juga TIDAK berubah — tidak ada tabel baru.

select 'CUSTOMER_CODE_COL' as check_type, count(*)::text as result
from information_schema.columns
where table_schema = 'public' and table_name = 'customers' and column_name = 'customer_code'
union all
select 'CUSTOMER_CODE_TYPE', data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'customers' and column_name = 'customer_code'
union all
select 'CUSTOMER_CODE_NOT_BLANK', count(*)::text
from pg_constraint
where conrelid = 'public.customers'::regclass and contype = 'c'
  and conname = 'customers_customer_code_not_blank'
union all
select 'CUSTOMER_CODE_UNIQUE_PARTIAL', count(*)::text
from pg_indexes
where schemaname = 'public' and tablename = 'customers'
  and indexname = 'customers_customer_code_key'
  and indexdef like '%UNIQUE%' and indexdef like '%customer_code IS NOT NULL%'
union all
select 'CUSTOMER_EMAIL_COL', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'customers' and column_name = 'email'
union all
select 'CUSTOMER_EMAIL_TYPE', data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'customers' and column_name = 'email'
union all
select 'CUSTOMER_EMAIL_NOT_BLANK', count(*)::text
from pg_constraint
where conrelid = 'public.customers'::regclass and contype = 'c'
  and conname = 'customers_email_not_blank'
union all
select 'CUSTOMER_EMAIL_UNIQUE', count(*)::text
from pg_indexes
where schemaname = 'public' and tablename = 'customers'
  and indexdef like '%UNIQUE%' and indexdef like '%email%'
union all
select 'CUSTOMER_POLICIES', count(*)::text
from pg_policies where schemaname = 'public' and tablename = 'customers'
union all
select 'CUSTOMER_RLS_ENABLED', count(*)::text
from pg_tables where schemaname = 'public' and tablename = 'customers' and rowsecurity
union all
select 'AUDIT_KEEP_0014_ITEM', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%''ORDER_ITEM''%'
union all
select 'AUDIT_KEEP_0013_OFFER', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%''ORDER_OFFER''%'
union all
select 'AUDIT_KEEP_0012_PKG_ITEM', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%PACKAGE_ITEM%'
union all
select 'AUDIT_KEEP_0012_PKG_LOOKUP', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row'
  and p.prosrc like '%from partner_packages pp%'
union all
select 'AUDIT_KEEP_0010_PRODUCT', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%''PRODUCT''%'
union all
select 'AUDIT_KEEP_0010_CATALOG', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%''CATALOG_ACCESS''%'
union all
select 'AUDIT_KEEP_0009_ARRIVED', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%ORDER_CUSTOMER_ARRIVED%'
union all
select 'AUDIT_KEEP_0009_NOTE', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%ORDER_INTERNAL_NOTE%'
union all
select 'AUDIT_KEEP_0008_PKG', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%partner_packages%'
union all
select 'AUDIT_KEEP_0008_PHONE', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%CUSTOMER_PHONE_CHANGED%'
union all
select 'AUDIT_KEEP_0008_ATTR', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%ORDER_ATTRIBUTION_CORRECTED%'
union all
select 'AUDIT_KEEP_0005', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%ORDER_CANCELLED%'
union all
select 'AUDIT_KEEP_0004', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%created_via_partner_id%'
union all
select 'REFS_CHECK_CUSTOMER', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_check_order_refs' and p.prosrc like '%customers%';
