-- ============================================================
-- SANCI Partner Hub — Phase 2 irisan kedua puluh enam
-- Migration 0031: Spesifikasi produk (dari Price List 2026-09) +
--                 catatan internal produk KHUSUS ADMIN
-- Jalankan di: Supabase Studio → SQL Editor → paste seluruh file → Run
--
-- PRASYARAT: 0001 → … → 0030 sudah dijalankan, DALAM URUTAN ITU.
-- BERKAS INI ATOMIK: tanpa `commit;` di tengah.
--
-- ============================================================
-- LATAR BELAKANG (owner 2026-09-22)
-- ============================================================
--
-- "匯入此價格表所有資訊 … 新增專屬欄位" — Price List SANCI 2026-09 membawa
-- kolom yang belum punya tempat di sistem: Material, Configuration,
-- Packing, CBM, Weight, Remarks, dan "Old showroom price".
--
-- DIBELAH DUA MENURUT SIAPA YANG BOLEH MEMBACA:
--
--   1. SPESIFIKASI (material, configuration, packing, cbm, weight) → kolom
--      baru di `sanci_products`. Ini data fisik barang yang setara `size`:
--      boleh dibaca partner dan ANON (sp_anon_read, 0022) — sales memang
--      perlu menjawab "bahannya apa, muat berapa di truk".
--
--   2. INTERNAL (remarks, old_showroom_price) → tabel BARU
--      `product_internal_notes`, RLS HANYA ADMIN. Alasannya keras:
--      `sanci_products` terbaca ANON, dan remarks di price list berisi
--      HARGA ("Old showroom price, code …; other sizes: Rp …"). Aturan besi
--      0010 PRODUCT_NO_PRICE_COLUMN = 0 bukan cuma soal nama kolom — harga
--      yang disisipkan ke kolom teks publik sama bocornya.
--
-- ============================================================
-- YANG SENGAJA TIDAK DIBUKA
-- ============================================================
--   * RLS `sanci_products` TIDAK disentuh (kolom baru ikut 3 policy lama).
--   * Kolom spesifikasi SENGAJA text, bukan numeric: isi price list tidak
--     seragam ("90KG", "1.2", "2 boxes") — dipaksa angka berarti data owner
--     dibuang diam-diam saat impor.
--   * `product_internal_notes` TANPA policy partner/anon sama sekali —
--     partner tidak butuh harga showroom lama SANCI.
--   * `fn_audit_row` TIDAK didefinisikan ulang (tetap 0025); tabel baru
--     memakai `id` uuid sendiri supaya audit generik bekerja apa adanya.
--   * `fn_price_stamp` (0021) DIPAKAI ULANG untuk updated_at/updated_by —
--     tidak ada fungsi baru.
-- ============================================================

-- ── 0. Pengaman prasyarat ────────────────────────────────────
do $$
begin
  if to_regclass('public.sanci_products') is null then
    raise exception 'Tabel sanci_products belum ada. Jalankan 0001 → … → 0030 dulu, baru 0031.';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='sanci_products' and column_name='discontinued') then
    raise exception 'sanci_products.discontinued (0030) belum ada — jalankan 0030 dulu, baru 0031.';
  end if;
  if to_regprocedure('public.fn_price_stamp()') is null or to_regprocedure('public.fn_is_admin()') is null then
    raise exception 'fn_price_stamp/fn_is_admin belum ada — rantai migrasi belum lengkap.';
  end if;
end;
$$;

-- ── 1. Spesifikasi (publik, setara size) ─────────────────────
alter table public.sanci_products
  add column if not exists material      text,
  add column if not exists configuration text,
  add column if not exists packing       text,
  add column if not exists cbm           text,
  add column if not exists weight        text;

-- ── 2. Catatan internal (KHUSUS ADMIN) ───────────────────────
create table if not exists public.product_internal_notes (
  id                 uuid primary key default gen_random_uuid(),
  product_id         uuid not null unique references public.sanci_products(id) on delete cascade,
  remarks            text,
  old_showroom_price bigint check (old_showroom_price is null or old_showroom_price >= 0),
  updated_at         timestamptz not null default now(),
  updated_by         uuid
);

drop trigger if exists trg_price_stamp on public.product_internal_notes;
create trigger trg_price_stamp before insert or update on public.product_internal_notes
  for each row execute function public.fn_price_stamp();

drop trigger if exists trg_audit on public.product_internal_notes;
create trigger trg_audit after insert or update or delete on public.product_internal_notes
  for each row execute function public.fn_audit_row();

alter table public.product_internal_notes enable row level security;

drop policy if exists pin_admin_all on public.product_internal_notes;
create policy pin_admin_all on public.product_internal_notes
  for all using (public.fn_is_admin()) with check (public.fn_is_admin());

-- ── 3. Verifikasi (hasilnya di-copy balik) ───────────────────
--   SPEC_COLUMNS               5   ← material/configuration/packing/cbm/weight
--   NOTES_TABLE                1
--   NOTES_RLS_ON               1
--   NOTES_POLICIES             1   ← hanya pin_admin_all
--   NOTES_NON_ADMIN_POLICIES   0   ← tidak ada jalur partner/anon
--   NOTES_TRIGGERS             2   ← trg_price_stamp + trg_audit
--   PRODUCT_POLICIES           3   ← RLS sanci_products tidak berubah
--   PRODUCT_NO_PRICE_COLUMN    0   ← rujukan 0010, DIULANG
--   AUDIT_STILL_0025           1   ← fn_audit_row tidak disentuh
select 'SPEC_COLUMNS' as check_type,
       (select count(*)::text from information_schema.columns
        where table_schema='public' and table_name='sanci_products'
          and column_name in ('material','configuration','packing','cbm','weight')) as result
union all
select 'NOTES_TABLE', (select count(*)::text from pg_tables where schemaname='public' and tablename='product_internal_notes')
union all
select 'NOTES_RLS_ON', (select count(*)::text from pg_class where oid='public.product_internal_notes'::regclass and relrowsecurity)
union all
select 'NOTES_POLICIES', (select count(*)::text from pg_policies where schemaname='public' and tablename='product_internal_notes')
union all
select 'NOTES_NON_ADMIN_POLICIES',
       (select count(*)::text from pg_policies where schemaname='public' and tablename='product_internal_notes'
          and (coalesce(qual,'') not like '%fn_is_admin()%' or coalesce(with_check, qual) not like '%fn_is_admin()%'))
union all
select 'NOTES_TRIGGERS',
       (select count(*)::text from pg_trigger where tgrelid='public.product_internal_notes'::regclass and not tgisinternal)
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
