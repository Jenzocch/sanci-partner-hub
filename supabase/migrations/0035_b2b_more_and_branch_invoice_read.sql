-- ============================================================
-- SANCI Partner Hub — Phase 2 irisan ketiga puluh
-- Migration 0035: (A) 6 produk lagi ditandai "Only For B2B Hotel"
--                 (B) cabang boleh MELIHAT dokumen pesanannya sendiri
-- Jalankan di: Supabase Studio → SQL Editor → paste seluruh file → Run
--
-- PRASYARAT: 0001 → … → 0034 sudah dijalankan, DALAM URUTAN ITU.
-- BERKAS INI ATOMIK: tanpa `commit;` di tengah.
--
-- (A) LATAR BELAKANG (owner 2026-09-23): Remarks price list 2026-09 menulis
-- "Old showroom price … other sizes: 160 cm: Rp …, 200 cm: Rp …". Harga lama
-- itu = HARGA PROYEK (keputusan owner, lihat 0032). Ukuran 180 sudah diganti
-- harga eceran baru oleh impor (harga lamanya tersimpan di
-- product_internal_notes), tapi ukuran saudaranya di bawah ini MASIH memakai
-- harga lama sebagai harga dasar → ditandai B2B sampai ada harga baru.
-- Harga dasarnya TIDAK diubah; angka yang sama dicatat sebagai harga proyek
-- di product_internal_notes (pola SQL 2026-09-23 untuk 12 kasur).
--
-- (B) "分店端可以看到 如果是給分店的" — SATU policy SELECT baru di
-- `order_documents` (janji 0016 §4: "kalau suatu hari cabang perlu MELIHAT
-- dokumen pesanannya sendiri, itu SATU policy SELECT baru"). Hanya KEPALA
-- dokumen (jenis, nomor, tanggal) — `order_document_items` TETAP admin-only,
-- dan tidak ada policy tulis. Nilai Invoice di laporan cabang tetap Harga
-- Akhir SANCI, jadi tetap digerbang can_view_offer (0014) lewat
-- order_sanci_offers — fn_sales_report SECURITY INVOKER (0033/0034).
--
-- TIDAK disentuh: fn_audit_row (tetap 0025), policy lain.
-- ============================================================

-- ── 0. Pengaman prasyarat ────────────────────────────────────
do $$
begin
  if to_regprocedure('public.fn_sales_report(date, date, text)') is null
     or to_regclass('public.product_internal_notes') is null
     or not exists (select 1 from information_schema.columns
                    where table_schema='public' and table_name='sanci_products' and column_name='b2b_hotel_only') then
    raise exception 'Rantai belum lengkap (0031/0032/0033). Jalankan 0001 → … → 0034 dulu, baru 0035.';
  end if;
end;
$$;

-- ── A1. Catat harga dasar sekarang sebagai harga proyek ──────
insert into public.product_internal_notes (product_id, remarks, old_showroom_price)
select p.id, '專案價 hotel 大數量 / Harga proyek hotel, jumlah besar (price list 2026-09)', pp.price
from public.sanci_products p
left join public.product_prices pp on pp.product_id = p.id and pp.partner_id is null
where p.code in ('CE-RC3018 160','CE-RC3018 200','SC-TG Supermoon 160','SC-TG Supermoon 200','Wenjie 200','Zunjie 200')
  and not p.b2b_hotel_only
on conflict (product_id) do update
  set remarks = excluded.remarks || coalesce(E'\n' || public.product_internal_notes.remarks, ''),
      old_showroom_price = excluded.old_showroom_price;

-- ── A2. Tandai B2B ───────────────────────────────────────────
update public.sanci_products
   set b2b_hotel_only = true
 where code in ('CE-RC3018 160','CE-RC3018 200','SC-TG Supermoon 160','SC-TG Supermoon 200','Wenjie 200','Zunjie 200')
   and not b2b_hotel_only;

-- ── B. Cabang membaca kepala dokumen pesanannya sendiri ──────
drop policy if exists od_partner_read on public.order_documents;
create policy od_partner_read on public.order_documents
  for select using (
    exists (select 1 from public.partner_orders o
            where o.id = order_documents.order_id
              and public.fn_can_view_branch(o.branch_id))
  );

-- ── Verifikasi ───────────────────────────────────────────────
--   B2B_TRUE_ROWS            18   ← 12 (0032) + 6
--   B2B_NEW_WITH_NOTE         6
--   DOC_POLICIES              2   ← od_admin_all + od_partner_read
--   DOC_PARTNER_WRITE         0   ← tidak ada policy tulis non-admin
--   DOC_ITEM_POLICIES         1   ← order_document_items tetap admin-only
--   PRODUCT_NO_PRICE_COLUMN   0
--   AUDIT_STILL_0025          1
select 'B2B_TRUE_ROWS' as check_type, (select count(*)::text from public.sanci_products where b2b_hotel_only) as result
union all
select 'B2B_NEW_WITH_NOTE',
       (select count(*)::text from public.sanci_products p join public.product_internal_notes n on n.product_id = p.id
        where p.b2b_hotel_only and p.code in ('CE-RC3018 160','CE-RC3018 200','SC-TG Supermoon 160','SC-TG Supermoon 200','Wenjie 200','Zunjie 200'))
union all
select 'DOC_POLICIES', (select count(*)::text from pg_policies where schemaname='public' and tablename='order_documents')
union all
select 'DOC_PARTNER_WRITE',
       (select count(*)::text from pg_policies where schemaname='public' and tablename='order_documents'
          and policyname <> 'od_admin_all' and cmd <> 'SELECT')
union all
select 'DOC_ITEM_POLICIES', (select count(*)::text from pg_policies where schemaname='public' and tablename='order_document_items')
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
