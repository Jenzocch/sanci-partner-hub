-- ============================================================
-- SANCI Partner Hub — Phase 2 irisan kelima belas
-- Migration 0020: nomor PO pelanggan per-pesanan (partner_orders.customer_po)
--                  (idempotent — aman dijalankan ulang)
-- Jalankan di: Supabase Studio → SQL Editor → paste seluruh file → Run
--
-- PRASYARAT: 0001 → … → 0018 → 0019 sudah dijalankan, DALAM URUTAN ITU.
-- Blok pengaman di bawah berhenti dengan pesan jelas kalau belum. Setelah
-- berkas ini, rantai penuhnya menjadi 0001 → 0003 → … → 0019 → 0020 (lihat
-- migrations/README.md — ATURAN BESI).
--
-- ============================================================
-- LATAR BELAKANG BISNIS (owner, verbatim, 2026-08-24)
-- ============================================================
--
-- "訂單加客戶 PO 編號欄位 do it" — pelanggan (pembeli toko furnitur, atau
-- toko itu sendiri) menerbitkan nomor Purchase Order MEREKA SENDIRI untuk
-- pembelian mereka. Sistem hari ini tidak punya tempat menyimpannya sama
-- sekali: baris "Purchase Order" di Invoice tercetak
-- (web/app/admin/orders/[orderId]/documents/[documentId]/print/page.tsx)
-- mengisi baris itu dengan NOMOR PESANAN SISTEM (`order_number`,
-- `GH-BSD-260817-0001`) — nomor internal kita, bukan nomor PO yang
-- diterbitkan pihak pelanggan. Untuk pelanggan korporat/toko yang
-- administrasinya mencocokkan tagihan terhadap PO mereka sendiri, baris itu
-- harus bisa memuat nomor MEREKA.
--
-- ============================================================
-- APA YANG DIBUKA IRISAN INI (dan hanya ini)
-- ============================================================
--   partner_orders.customer_po → kolom BARU, nullable, text bebas. Nomor PO
--                             yang diketik manusia — sistem TIDAK memvalidasi
--                             formatnya (nomor itu milik administrasi
--                             PELANGGAN, formatnya urusan mereka; kita hanya
--                             mencatat). Diisi opsional saat pesanan dibuat
--                             (form cabang & form admin), bisa diubah lewat
--                             modal Ubah Pesanan cabang selama pesanan masih
--                             aktif — kelas kolom yang SAMA PERSIS dengan
--                             shipping_address (0014 §4): detail operasional
--                             pesanan, BUKAN atribusi.
--
-- YANG SENGAJA TIDAK DIBUKA:
--   * CHECK constraint (blank-guard / batas panjang) pada kolom ini — TIDAK
--     ADA, dan itu KEPUTUSAN SADAR, bukan kelalaian: kedua saudara
--     sekelasnya di tabel yang sama (`shipping_address` 0014, `notes` 0004)
--     sama-sama text polos tanpa CHECK apa pun. Normalisasi string kosong →
--     NULL dilakukan Server Action (trim || null), pola yang sama persis
--     dengan normalizeShippingAddress di web/app/cabang/pesanan/actions.ts.
--     Menambah CHECK hanya pada kolom baru ini akan membuat tiga kolom
--     sekelas berperilaku beda tanpa alasan bisnis — kalau suatu hari
--     blank-guard dianggap perlu, itu untuk KETIGANYA lewat migrasi
--     tersendiri, bukan diselundupkan di sini. Dibuktikan
--     ORDER_CUSTOMER_PO_NO_CHECK = 0 di blok verifikasi.
--   * Unique constraint — dua pesanan BOLEH membawa nomor PO yang sama
--     (satu PO pelanggan bisa dipecah jadi beberapa pesanan sistem; nomor
--     ini juga bukan identitas milik kita untuk dijaga keunikannya).
--   * fn_guard_order_immutable_cols (0005) — TIDAK didefinisikan ulang.
--     Fungsi itu MENYEBUT SATU PER SATU kolom yang DIBEKUKAN
--     (id/partner_id/branch_id/customer_id/order_number/created_by/
--     client_request_id/created_at) — kolom yang tidak disebut otomatis
--     BOLEH diubah cabang. customer_po memang harus bisa diubah (kelas
--     shipping_address, lihat 0014 §4 — ORDER_SHIPPING_NOT_FROZEN), jadi
--     TIDAK ADA APA PUN yang perlu ditulis: cukup dibuktikan lewat
--     ORDER_CUSTOMER_PO_NOT_FROZEN di blok verifikasi (prosrc fungsi 0005
--     tidak menyebut customer_po). Pesanan CANCELLED tetap beku TOTAL untuk
--     cabang — itu kerja fn_guard_order_status_flow (0005) yang menolak
--     SEMUA update cabang pada baris CANCELLED tanpa memandang kolom, jadi
--     customer_po otomatis ikut membeku setelah pembatalan, sama seperti
--     shipping_address (diuji perilaku di test-harness 80_behavior_0020.sql,
--     bukan hanya dibaca dari teks SQL).
--   * RLS partner_orders — TIDAK disentuh sama sekali (nol create/drop
--     policy). RLS Postgres bekerja per BARIS, bukan per kolom — kolom baru
--     otomatis tunduk pada keempat policy yang sudah ada sejak 0004/0005
--     (o_admin_all, o_partner_read, o_partner_insert, o_partner_update);
--     argumen yang sama persis dipakai 0014 §4 untuk shipping_address dan
--     0017 §3 untuk customer_code/email. Dibuktikan ORDER_POLICIES tetap 4,
--     ORDER_UPDATE_POLICY tetap 1, ORDER_DELETE_POLICY tetap 0.
--   * fn_audit_row — TIDAK didefinisikan ulang. Tidak ada tabel baru yang
--     butuh pemetaan nama entitas baru; kolom baru pada partner_orders
--     otomatis ikut ke audit lewat to_jsonb(new)/(old) karena tabel INDUKnya
--     sudah dipetakan ke awalan ORDER sejak 0004 — preseden persis: 0015
--     (4 kolom baru order_sanci_offers), 0017 (2 kolom baru customers),
--     0019 (2 kolom baru partner_staff/customers), tidak satu pun
--     menyentuh fn_audit_row. Dibuktikan lewat AUDIT_STILL_0018_* di blok
--     verifikasi: prosrc fn_audit_row yang AKTIF masih PERSIS versi 0018
--     (masih memuat 'CUSTOMER_SOURCE'/'SALES_STAFF' yang HANYA ditulis
--     0018) — pembuktian LANGSUNG bahwa definer yang berlaku tidak berubah,
--     bukan sekadar "berkas ini tidak menulis CREATE OR REPLACE".
--   * Trigger baru APA PUN. Berkas ini juga tidak men-DROP/mengganti
--     constraint bernama milik berkas lain — dua pola interaksi berbahaya
--     LESSONS #35 (DROP+CREATE constraint) dan #37 (BEFORE trigger mengubah
--     nilai sebelum CHECK) sama-sama TIDAK mungkin terjadi di sini karena
--     tidak ada trigger dan tidak ada CHECK yang lahir dari berkas ini.
-- ============================================================

-- ── 0. Pengaman prasyarat ───────────────────────────────────

do $$
begin
  if to_regclass('public.partner_customer_counters') is null
     or to_regprocedure('public.fn_next_customer_seq(uuid, integer)') is null
     or not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'customers'
                      and column_name = 'attributed_staff_id') then
    raise exception
      'Migration 0019_branch_customer_code.sql belum dijalankan di database ini. Jalankan 0001 → … → 0019 dulu, baru 0020.';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'partner_orders'
                   and column_name = 'shipping_address') then
    raise exception
      'Kolom partner_orders.shipping_address tidak ditemukan — migration 0014 belum dijalankan. Jalankan 0001 → … → 0019 dulu, baru 0020.';
  end if;
  if to_regprocedure('public.fn_guard_order_immutable_cols()') is null
     or to_regprocedure('public.fn_guard_order_status_flow()') is null
     or to_regprocedure('public.fn_audit_row()') is null then
    raise exception
      'Fungsi dasar (fn_guard_order_immutable_cols / fn_guard_order_status_flow / fn_audit_row) belum lengkap. Jalankan 0001 → … → 0019 dulu, baru 0020.';
  end if;
end;
$$;

-- ── 1. partner_orders.customer_po ────────────────────────────

-- Nullable, text bebas — lihat § "APA YANG DIBUKA" untuk kenapa TANPA CHECK
-- dan TANPA unique. "Belum ada nomor PO dari pelanggan" adalah keadaan
-- normal (kebanyakan pelanggan perorangan tidak menerbitkan PO) — NULL di
-- sini berarti persis itu, satu-satunya arti yang mungkin (LESSONS #8 aman:
-- tidak ada DEFAULT yang bisa menyamarkan "lupa diisi").
alter table public.partner_orders
  add column if not exists customer_po text;

-- ── 2. Verifikasi (hasilnya di-copy balik ke Claude) ─────────
-- Angka yang diharapkan — cocokkan SATU PER SATU. "Run tanpa tulisan merah"
-- bukan bukti (LESSONS #7 & #16). Bukti PERILAKU (cabang bisa mengisi/
-- mengubah, beku setelah pembatalan, admin tetap bisa, nilai muncul di
-- audit) ada di supabase/test-harness/80_behavior_0020.sql terhadap fixture
-- lokal — blok ini HANYA memeriksa STRUKTUR skema, pola yang sama dengan
-- 0019 §11.
--
--   ORDER_CUSTOMER_PO_COLUMN        1
--   ORDER_CUSTOMER_PO_TYPE          text
--   ORDER_CUSTOMER_PO_NULLABLE      1   ← WAJIB 1: nullable, tanpa default
--   ORDER_CUSTOMER_PO_NO_CHECK      0   ← WAJIB 0: SENGAJA tanpa CHECK — kelas
--                                         yang sama dengan shipping_address
--                                         (0014) dan notes (0004), lihat kepala
--                                         berkas
--   ORDER_CUSTOMER_PO_NOT_FROZEN    1   ← WAJIB 1: TIDAK masuk daftar beku 0005
--                                         (pola ORDER_SHIPPING_NOT_FROZEN 0014).
--                                         Kalau 0, cabang tidak bisa mengisi
--                                         nomor PO dan gejalanya "Simpan
--                                         berhasil tapi datanya tidak ada"
--   ORDER_CUSTOMER_PO_NOT_IN_CANCEL_GUARD 1 ← WAJIB 1: fn_guard_order_status_flow
--                                         juga tidak menyebutnya — pembekuan
--                                         pasca-batal berlaku SELURUH BARIS,
--                                         bukan pengecualian per kolom
--   CANCEL_FREEZE_TRIGGER           1   ← trg_order_status_flow (0005) masih
--                                         terpasang — inilah mekanisme yang
--                                         membekukan customer_po (dan semua
--                                         kolom lain) setelah pembatalan
--   ORDER_POLICIES                  4   ← WAJIB TETAP 4 sejak 0005: bukti RLS
--                                         partner_orders tidak berubah
--   ORDER_UPDATE_POLICY             1   ← WAJIB TETAP 1 (o_partner_update 0005)
--   ORDER_DELETE_POLICY             0   ← WAJIB TETAP 0 (order tidak pernah
--                                         hard delete, SPEC §43)
--   ORDER_TRIGGERS                  9   ← WAJIB TETAP 9 (terakhir berubah 0011)
--   AUDIT_STILL_0018_SOURCE         1   ← prosrc fn_audit_row MASIH memuat
--                                         'CUSTOMER_SOURCE' (definer belum
--                                         berubah — masih versi 0018)
--   AUDIT_STILL_0018_SALES          1   ← dan 'SALES_STAFF'
--   REFS_CHECK_CUSTOMER             1   ← lubang P2 (0011) masih tertutup,
--                                         tidak diganggu berkas ini

select 'ORDER_CUSTOMER_PO_COLUMN' as check_type, count(*)::text as result
from information_schema.columns
where table_schema = 'public' and table_name = 'partner_orders' and column_name = 'customer_po'
union all
select 'ORDER_CUSTOMER_PO_TYPE', coalesce(
  (select data_type from information_schema.columns
   where table_schema = 'public' and table_name = 'partner_orders' and column_name = 'customer_po'),
  'KOLOM TIDAK ADA')
union all
select 'ORDER_CUSTOMER_PO_NULLABLE', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'partner_orders' and column_name = 'customer_po'
  and is_nullable = 'YES' and column_default is null
union all
select 'ORDER_CUSTOMER_PO_NO_CHECK', count(*)::text
from pg_constraint
where conrelid = 'public.partner_orders'::regclass and contype = 'c'
  and pg_get_constraintdef(oid) like '%customer_po%'
union all
select 'ORDER_CUSTOMER_PO_NOT_FROZEN', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_guard_order_immutable_cols'
  and p.prosrc not like '%customer_po%'
union all
select 'ORDER_CUSTOMER_PO_NOT_IN_CANCEL_GUARD', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_guard_order_status_flow'
  and p.prosrc not like '%customer_po%'
union all
select 'CANCEL_FREEZE_TRIGGER', count(*)::text
from pg_trigger tg join pg_class cl on cl.oid = tg.tgrelid
join pg_namespace ns on ns.oid = cl.relnamespace
where not tg.tgisinternal and ns.nspname = 'public' and cl.relname = 'partner_orders'
  and tg.tgname = 'trg_order_status_flow'
union all
select 'ORDER_POLICIES', count(*)::text
from pg_policies where schemaname = 'public' and tablename = 'partner_orders'
union all
select 'ORDER_UPDATE_POLICY', count(*)::text
from pg_policies
where schemaname = 'public' and tablename = 'partner_orders' and cmd = 'UPDATE'
union all
select 'ORDER_DELETE_POLICY', count(*)::text
from pg_policies
where schemaname = 'public' and tablename = 'partner_orders' and cmd = 'DELETE'
union all
select 'ORDER_TRIGGERS', count(*)::text
from pg_trigger tg join pg_class cl on cl.oid = tg.tgrelid
join pg_namespace ns on ns.oid = cl.relnamespace
where not tg.tgisinternal and ns.nspname = 'public' and cl.relname = 'partner_orders'
union all
select 'AUDIT_STILL_0018_SOURCE', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%''CUSTOMER_SOURCE''%'
union all
select 'AUDIT_STILL_0018_SALES', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%''SALES_STAFF''%'
union all
select 'REFS_CHECK_CUSTOMER', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_check_order_refs' and p.prosrc like '%customers%';
