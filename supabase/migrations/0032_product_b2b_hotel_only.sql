-- ============================================================
-- SANCI Partner Hub — Phase 2 irisan kedua puluh tujuh
-- Migration 0032: Penanda "Only For B2B Hotel" pada produk
-- Jalankan di: Supabase Studio → SQL Editor → paste seluruh file → Run
--
-- PRASYARAT: 0001 → … → 0031 sudah dijalankan, DALAM URUTAN ITU.
-- BERKAS INI ATOMIK: tanpa `commit;` di tengah.
--
-- LATAR BELAKANG (owner 2026-09-23): sebagian ukuran kasur (mis. CX01-R200
-- 6.890.950) harganya adalah HARGA PROYEK HOTEL jumlah besar, bukan harga
-- eceran. Catatan itu sudah ada di product_internal_notes (0031), tapi
-- tabel itu KHUSUS ADMIN — sales tidak melihatnya dan bisa menawarkan harga
-- proyek ke pelanggan biasa. "業務也看得到專案價的提醒 — Only For B2B Hotel".
--
-- SATU kolom BARU `sanci_products.b2b_hotel_only` boolean NOT NULL DEFAULT
-- false — pola persis 0030 `discontinued`: boolean status produk, BUKAN
-- harga (aturan besi 0010 tetap). Angka harga proyeknya tetap hanya di
-- product_internal_notes (admin).
--
-- §2 menandai 12 produk yang owner konfirmasi 2026-09-23 (hasil SQL
-- catatan "專案價 hotel 大數量"). Idempoten.
--
-- TIDAK disentuh: RLS sanci_products, fn_audit_row (tetap 0025).
-- ============================================================

-- ── 0. Pengaman prasyarat ────────────────────────────────────
do $$
begin
  if to_regclass('public.product_internal_notes') is null then
    raise exception 'product_internal_notes (0031) belum ada — jalankan 0031 dulu, baru 0032.';
  end if;
end;
$$;

-- ── 1. Kolom ─────────────────────────────────────────────────
alter table public.sanci_products
  add column if not exists b2b_hotel_only boolean not null default false;

-- ── 2. Tandai produk harga proyek hotel (keputusan owner) ────
update public.sanci_products
   set b2b_hotel_only = true
 where code in ('CX01-R200','CX01-R90-110','CX02-R200','CX02-R90-110','CX03-R200','CX03-R90-110',
                'ML02-R200','ML02-R90','ST01-R200','ST01-R90','ML03-R200','ML03-R90')
   and not b2b_hotel_only;

-- ── 3. Verifikasi ────────────────────────────────────────────
--   B2B_COLUMN              1
--   B2B_NOT_NULL_DEFAULT    1
--   B2B_TRUE_ROWS          12
--   PRODUCT_POLICIES        3
--   PRODUCT_NO_PRICE_COLUMN 0
--   AUDIT_STILL_0025        1
select 'B2B_COLUMN' as check_type,
       (select count(*)::text from information_schema.columns
        where table_schema='public' and table_name='sanci_products' and column_name='b2b_hotel_only') as result
union all
select 'B2B_NOT_NULL_DEFAULT',
       (select count(*)::text from information_schema.columns
        where table_schema='public' and table_name='sanci_products' and column_name='b2b_hotel_only'
          and is_nullable='NO' and column_default='false')
union all
select 'B2B_TRUE_ROWS', (select count(*)::text from public.sanci_products where b2b_hotel_only)
union all
select 'PRODUCT_POLICIES', (select count(*)::text from pg_policies where schemaname='public' and tablename='sanci_products')
union all
select 'PRODUCT_NO_PRICE_COLUMN',
       (select count(*)::text from information_schema.columns
        where table_schema='public' and table_name='sanci_products'
          and column_name in ('price','harga','unit_price','base_price'))
union all
select 'AUDIT_STILL_0025',
       (select case when count(*) > 0 then 1 else 0 end::text
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='fn_audit_row' and p.prosrc like '%PRODUCT_COLOR%');
