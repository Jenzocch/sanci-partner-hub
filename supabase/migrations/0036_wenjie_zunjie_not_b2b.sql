-- ============================================================
-- SANCI Partner Hub — Phase 2 irisan ketiga puluh satu
-- Migration 0036: Wenjie 200 / Zunjie 200 BUKAN produk B2B Hotel
-- Jalankan di: Supabase Studio → SQL Editor → paste seluruh file → Run
--
-- PRASYARAT: 0001 → … → 0035 sudah dijalankan, DALAM URUTAN ITU.
-- BERKAS INI ATOMIK: tanpa `commit;` di tengah.
--
-- LATAR BELAKANG (owner 2026-09-25): 0035 menandai Wenjie 200 dan
-- Zunjie 200 sebagai `b2b_hotel_only` karena harganya masih harga lama
-- (Remarks price list) sama seperti 6 produk lain di 0035. Owner
-- mengoreksi: "Wenjie 200 dan Zunjie 200 tidak untuk hotel" — keduanya
-- produk ECERAN biasa, harganya memang belum diperbarui, TAPI bukan
-- produk proyek hotel. Menandainya B2B salah arah: sales akan
-- membacanya "jangan tawarkan ke pelanggan biasa", padahal produk ini
-- justru UNTUK pelanggan biasa, hanya harganya yang perlu diperbarui.
--
-- SEBALIKNYA: owner MENGKONFIRMASI 12 kode kasur (CX01/CX02/CX03 R90-110
-- & R200, ML02 R90 & R200, ML03 R90 & R200, ST01 R90 & R200, sudah
-- ditandai sejak 0032) MEMANG PERMANEN B2B Hotel — bukan menunggu harga
-- baru, tidak akan pernah punya harga eceran. Tidak ada perubahan data
-- untuk 12 kode itu (0032 sudah benar), catatan ini murni supaya
-- pembaca migrasi berikutnya tahu keputusannya sudah final.
--
-- YANG BERUBAH: b2b_hotel_only → false untuk Wenjie 200 & Zunjie 200.
-- product_internal_notes TIDAK dihapus (harga proyek lama tetap
-- tercatat untuk referensi admin) — hanya ditambah catatan bahwa
-- penandaannya sudah dicabut.
--
-- TIDAK disentuh: fn_audit_row (tetap 0025), RLS, fungsi lain.
-- ============================================================

-- ── 0. Pengaman prasyarat ────────────────────────────────────
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='sanci_products' and column_name='b2b_hotel_only') then
    raise exception 'sanci_products.b2b_hotel_only (0032) belum ada — jalankan 0001 → … → 0035 dulu, baru 0036.';
  end if;
end;
$$;

-- ── 1. Cabut penanda B2B ──────────────────────────────────────
update public.sanci_products
   set b2b_hotel_only = false
 where code in ('Wenjie 200','Zunjie 200')
   and b2b_hotel_only;

-- ── 2. Catat koreksinya di catatan internal (best-effort) ────
update public.product_internal_notes n
   set remarks = coalesce(n.remarks || E'\n', '') || 'DIKOREKSI 2026-09-25: BUKAN produk B2B Hotel — harga masih perlu diperbarui ke harga eceran baru.'
  from public.sanci_products p
 where p.id = n.product_id
   and p.code in ('Wenjie 200','Zunjie 200')
   and n.remarks not like '%DIKOREKSI 2026-09-25%';

-- ── Verifikasi ───────────────────────────────────────────────
--   B2B_TRUE_ROWS            16   ← 18 (0035) − 2 (Wenjie 200, Zunjie 200)
--   WENJIE_ZUNJIE_STILL_B2B   0   ← keduanya sudah dicabut
--   MATTRESS_12_STILL_B2B    12   ← 0032 tidak tersentuh, tetap permanen
--   PRODUCT_NO_PRICE_COLUMN   0
--   AUDIT_STILL_0025          1
select 'B2B_TRUE_ROWS' as check_type, (select count(*)::text from public.sanci_products where b2b_hotel_only) as result
union all
select 'WENJIE_ZUNJIE_STILL_B2B',
       (select count(*)::text from public.sanci_products where code in ('Wenjie 200','Zunjie 200') and b2b_hotel_only)
union all
select 'MATTRESS_12_STILL_B2B',
       (select count(*)::text from public.sanci_products
        where code in ('CX01-R200','CX01-R90-110','CX02-R200','CX02-R90-110','CX03-R200','CX03-R90-110',
                        'ML02-R200','ML02-R90','ML03-R200','ML03-R90','ST01-R200','ST01-R90')
          and b2b_hotel_only)
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
