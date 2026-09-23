-- ============================================================
-- SANCI Partner Hub — Phase 2 irisan kedua puluh delapan
-- Migration 0033: Laporan Penjualan — fungsi baca `fn_sales_report`
-- Jalankan di: Supabase Studio → SQL Editor → paste seluruh file → Run
--
-- PRASYARAT: 0001 → … → 0032 sudah dijalankan, DALAM URUTAN ITU.
-- BERKAS INI ATOMIK: tanpa `commit;` di tengah.
--
-- LATAR BELAKANG (owner 2026-09-23): kantor minta satu laporan penjualan
-- per bulan/tahun — jumlah pesanan, nilai penjualan, unit, yang sudah
-- di-Invoice, yang sudah dibayar, dan sisanya — untuk SEMUA admin SANCI
-- (tidak ada peran superadmin), dan versi cabang yang hanya melihat
-- datanya sendiri.
--
-- SATU fungsi BARU `public.fn_sales_report(p_from, p_to, p_granularity)`:
--   * SECURITY INVOKER (BUKAN definer) — ini inti desainnya. Fungsi berjalan
--     dengan hak PEMANGGIL, jadi RLS partner_orders (o_partner_read 0004),
--     order_items (oi_partner_read 0014), order_sanci_offers
--     (oso_partner_read 0014, digerbang can_view_offer), order_documents
--     (od_admin_all 0016 — KHUSUS admin) dan partners/partner_branches
--     (0001) yang menyaring barisnya. Admin melihat semua; pengguna cabang
--     otomatis hanya melihat cabang yang boleh ia lihat — TANPA satu pun
--     parameter partner/cabang dari client (LESSONS #6). Tidak ada jalur
--     untuk membaca lebih dari yang sudah bisa dibaca lewat tabelnya
--     langsung (LESSONS #5): fungsi ini hanya MENJUMLAHKAN.
--   * Konsekuensi yang DISENGAJA dari invoker, dicatat supaya tidak
--     dianggap bug: untuk pengguna cabang `invoiced_amount` selalu 0
--     (order_documents admin-only sejak 0016), dan `sales_amount` hanya
--     menghitung pesanan yang Penawaran SANCI-nya boleh ia lihat
--     (can_view_offer). Kolom `unpriced_orders` menghitung pesanan tanpa
--     Harga Akhir yang TERLIHAT, supaya layar bisa berkata "N pesanan
--     belum punya Harga Akhir" alih-alih diam-diam menampilkan Rp 0
--     (LESSONS #10).
--
-- DEFINISI ANGKA (keputusan owner 2026-09-23):
--   * Pesanan CANCELLED dikecualikan di SEMUA kolom.
--   * orders / sales_amount / items_qty / paid_amount / outstanding_amount
--     → menurut TANGGAL PESANAN = created_at di Asia/Jakarta (LESSONS #43:
--     batas hari WIB, bukan UTC).
--   * sales_amount = SUM(order_sanci_offers.final_amount) — "Harga Akhir"
--     0015. Pesanan tanpa baris penawaran TIDAK dihitung sebagai 0 di
--     `outstanding_amount` (tidak ada tagihan yang bisa bersisa) dan
--     dihitung di `unpriced_orders`.
--   * paid_amount = SUM(partner_orders.customer_paid_amount) (0026).
--   * outstanding_amount = SUM(GREATEST(final_amount − customer_paid_amount,
--     0)) per pesanan yang punya Harga Akhir — lantai 0 PER PESANAN, supaya
--     kelebihan bayar satu pesanan tidak menutupi utang pesanan lain.
--   * invoiced_amount = final_amount pesanan yang punya ≥1 dokumen INVOICE
--     (0016), diatribusikan ke doc_date INVOICE PALING AWAL (tanggal
--     kalender murni, bukan WIB — LESSONS #43 bagian `date`). Jadi satu
--     pesanan Agustus yang di-Invoice September muncul di baris September
--     untuk kolom ini. Periode dan filter rentangnya memakai tanggal
--     invoice itu, BUKAN tanggal pesanan.
--
-- Bentuk hasil: SATU baris per (periode, cabang) yang punya angka ≠ kosong;
-- layar menjumlah sendiri untuk total/per-periode/per-cabang.
--
-- TIDAK disentuh: tabel apa pun, RLS apa pun, fn_audit_row (tetap 0025).
-- ============================================================

-- ── 0. Pengaman prasyarat (LESSONS #41: periksa OBJEK, bukan versi) ──
do $$
begin
  if to_regclass('public.order_documents') is null
     or to_regclass('public.order_items') is null
     or to_regclass('public.order_sanci_offers') is null
     or not exists (select 1 from information_schema.columns
                    where table_schema='public' and table_name='order_sanci_offers'
                      and column_name='final_amount')
     or not exists (select 1 from information_schema.columns
                    where table_schema='public' and table_name='partner_orders'
                      and column_name='customer_paid_amount')
     or to_regclass('public.product_internal_notes') is null then
    raise exception 'Objek prasyarat (order_documents 0016 / final_amount 0015 / customer_paid_amount 0026 / product_internal_notes 0031) belum ada — jalankan 0001 → … → 0032 dulu, baru 0033.';
  end if;
end;
$$;

-- ── 1. Fungsi laporan ────────────────────────────────────────
-- plpgsql (bukan sql) hanya demi `raise` validasi parameter. Semua kolom
-- tabel diberi alias eksplisit + `#variable_conflict use_column` karena
-- nama kolom hasil (partner_id, branch_id, …) sama dengan kolom tabel.
--
-- `drop … if exists` dulu: `create or replace` TIDAK boleh mengubah
-- bentuk RETURNS TABLE — kalau suatu hari kolomnya ditambah, rerun berkas
-- versi baru tetap bersih. Hak EXECUTE dipasang ulang di §2 setiap run.
drop function if exists public.fn_sales_report(date, date, text);

create function public.fn_sales_report(p_from date, p_to date, p_granularity text)
returns table (
  period_start       date,
  partner_id         uuid,
  partner_name       text,
  partner_code       text,
  branch_id          uuid,
  branch_name        text,
  branch_code        text,
  orders             integer,
  sales_amount       numeric,
  items_qty          bigint,
  invoiced_amount    numeric,
  paid_amount        numeric,
  outstanding_amount numeric,
  unpriced_orders    integer
)
language plpgsql
stable
security invoker
set search_path = public
as $$
#variable_conflict use_column
begin
  if p_granularity is null or p_granularity not in ('month', 'year') then
    raise exception 'fn_sales_report: p_granularity harus ''month'' atau ''year'' (diterima: %)', p_granularity
      using errcode = '22023';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'fn_sales_report: rentang tanggal tidak valid (% s/d %)', p_from, p_to
      using errcode = '22023';
  end if;

  return query
  with
  -- Aliran A — menurut TANGGAL PESANAN (WIB). Batas dihitung sebagai
  -- timestamptz sekali saja supaya perbandingan created_at tetap bisa
  -- memakai indeks (bukan fungsi per baris).
  ord as (
    select o.id,
           o.partner_id,
           o.branch_id,
           date_trunc(p_granularity, o.created_at at time zone 'Asia/Jakarta')::date as ps,
           o.customer_paid_amount as paid,
           s.final_amount as fa,
           (select coalesce(sum(i.quantity), 0) from order_items i where i.order_id = o.id)::bigint as qty
    from partner_orders o
    left join order_sanci_offers s on s.order_id = o.id
    where o.status = 'REGISTERED'
      and o.created_at >= (p_from::timestamp at time zone 'Asia/Jakarta')
      and o.created_at <  ((p_to + 1)::timestamp at time zone 'Asia/Jakarta')
  ),
  a as (
    select ord.ps, ord.partner_id, ord.branch_id,
           count(*)::integer                                            as n_orders,
           coalesce(sum(ord.fa), 0)                                     as sales,
           coalesce(sum(ord.qty), 0)::bigint                            as qty,
           coalesce(sum(ord.paid), 0)                                   as paid,
           coalesce(sum(greatest(ord.fa - coalesce(ord.paid, 0), 0)), 0) as outstanding,
           count(*) filter (where ord.fa is null)::integer              as unpriced
    from ord
    group by ord.ps, ord.partner_id, ord.branch_id
  ),
  -- Aliran B — menurut INVOICE PALING AWAL. Pesanan dengan invoice pertama
  -- di dalam rentang dihitung, walau pesanannya dibuat sebelum p_from.
  inv as (
    select d.order_id, min(d.doc_date) as first_doc
    from order_documents d
    where d.doc_type = 'INVOICE'
    group by d.order_id
  ),
  b as (
    select date_trunc(p_granularity, inv.first_doc::timestamp)::date as ps,
           o.partner_id, o.branch_id,
           coalesce(sum(s.final_amount), 0) as invoiced
    from inv
    join partner_orders o on o.id = inv.order_id and o.status = 'REGISTERED'
    left join order_sanci_offers s on s.order_id = o.id
    where inv.first_doc between p_from and p_to
    group by 1, o.partner_id, o.branch_id
  ),
  ab as (
    select coalesce(a.ps, b.ps)                   as ps,
           coalesce(a.partner_id, b.partner_id)   as partner_id,
           coalesce(a.branch_id, b.branch_id)     as branch_id,
           coalesce(a.n_orders, 0)                as n_orders,
           coalesce(a.sales, 0)                   as sales,
           coalesce(a.qty, 0)::bigint             as qty,
           coalesce(b.invoiced, 0)                as invoiced,
           coalesce(a.paid, 0)                    as paid,
           coalesce(a.outstanding, 0)             as outstanding,
           coalesce(a.unpriced, 0)                as unpriced
    from a
    full outer join b
      on b.ps = a.ps and b.partner_id = a.partner_id and b.branch_id = a.branch_id
  )
  select ab.ps,
         ab.partner_id, p.name, p.code,
         ab.branch_id, br.name, br.code,
         ab.n_orders, ab.sales, ab.qty, ab.invoiced, ab.paid, ab.outstanding, ab.unpriced
  from ab
  -- LEFT JOIN: nama adalah hiasan. Kalau RLS partners/partner_branches
  -- menyembunyikan barisnya (tidak terjadi di jalur normal — pesanan yang
  -- terlihat selalu milik cabang yang terlihat), angkanya tetap dijumlah
  -- dan layar menampilkan kode kosong, bukan baris yang hilang diam-diam.
  left join partners p on p.id = ab.partner_id
  left join partner_branches br on br.id = ab.branch_id
  order by ab.ps, p.name, br.name;
end;
$$;

-- ── 2. Hak EXECUTE (LESSONS #26: diputuskan saat lahir) ──────
-- Invoker → tidak ada hak istimewa yang bisa bocor, tapi tetap dikunci ke
-- pengguna login saja: anon tidak punya urusan dengan laporan penjualan.
-- Supabase memberi EXECUTE default ke anon/authenticated untuk fungsi baru
-- di schema public, jadi pencabutannya WAJIB eksplisit.
revoke all on function public.fn_sales_report(date, date, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.fn_sales_report(date, date, text) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.fn_sales_report(date, date, text) to authenticated';
  end if;
end;
$$;

-- ── 3. Verifikasi ────────────────────────────────────────────
--   SALES_FN_EXISTS          1
--   SALES_FN_INVOKER         1   ← WAJIB 1: prosecdef = false (RLS pemanggil berlaku)
--   SALES_FN_STABLE          1
--   SALES_FN_PUBLIC_EXEC     0
--   SALES_FN_ANON_EXEC       0
--   SALES_FN_AUTH_EXEC       1
--   SALES_FN_SMOKE_1990      0   ← panggilan sungguhan, rentang tanpa data
--   PRODUCT_NO_PRICE_COLUMN  0
--   AUDIT_STILL_0025         1
select 'SALES_FN_EXISTS' as check_type,
       (select count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='fn_sales_report') as result
union all
select 'SALES_FN_INVOKER',
       (select count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='fn_sales_report' and not p.prosecdef)
union all
select 'SALES_FN_STABLE',
       (select count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='fn_sales_report' and p.provolatile='s')
union all
select 'SALES_FN_PUBLIC_EXEC',
       (select count(*)::text
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace,
             lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        where n.nspname='public' and p.proname='fn_sales_report'
          and a.grantee = 0 and a.privilege_type='EXECUTE')
union all
select 'SALES_FN_ANON_EXEC',
       (select case when not exists (select 1 from pg_roles where rolname='anon') then '0'
                    when has_function_privilege('anon', 'public.fn_sales_report(date, date, text)', 'EXECUTE') then '1'
                    else '0' end)
union all
select 'SALES_FN_AUTH_EXEC',
       (select case when not exists (select 1 from pg_roles where rolname='authenticated') then '0'
                    when has_function_privilege('authenticated', 'public.fn_sales_report(date, date, text)', 'EXECUTE') then '1'
                    else '0' end)
union all
select 'SALES_FN_SMOKE_1990',
       (select count(*)::text from public.fn_sales_report('1990-01-01', '1990-12-31', 'month'))
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
