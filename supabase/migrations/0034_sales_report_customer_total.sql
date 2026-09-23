-- ============================================================
-- SANCI Partner Hub — Phase 2 irisan kedua puluh sembilan
-- Migration 0034: Laporan Penjualan — Penjualan memakai TOTAL PELANGGAN
-- Jalankan di: Supabase Studio → SQL Editor → paste seluruh file → Run
--
-- PRASYARAT: 0001 → … → 0033 sudah dijalankan, DALAM URUTAN ITU.
-- BERKAS INI ATOMIK: tanpa `commit;` di tengah.
--
-- LATAR BELAKANG (owner 2026-09-23, sesudah melihat 0033 jalan):
-- "Harga Akhir, 應該要用總價 … 因為有的是先付現金, 也算進去". Angka
-- PENJUALAN cabang adalah apa yang dibayar PELANGGAN AKHIR, yaitu
-- `partner_orders.customer_total_amount` (0026) — bukan Harga Akhir
-- Penawaran SANCI (harga SANCI ke partner). Pembayaran tunai di muka sudah
-- tercatat di `customer_paid_amount` (0026), jadi Dibayar/Sisa ikut benar.
--
-- YANG BERUBAH dari 0033 (fungsi didefinisikan ulang, tanda tangan sama):
--   * sales_amount      = SUM(customer_total_amount)
--   * outstanding_amount = SUM(GREATEST(customer_total_amount −
--                          customer_paid_amount, 0)) per pesanan
--   * unpriced_orders   = pesanan yang customer_total_amount-nya NULL
--                          ("belum dicatat", LESSONS #10 — bukan Rp 0)
--   * Efek samping yang DISENGAJA: penjualan cabang tidak lagi bergantung
--     pada izin can_view_offer (0014) — total pelanggan ada di
--     partner_orders yang memang boleh dibaca cabang (o_partner_read 0004).
--
-- YANG TIDAK BERUBAH: invoiced_amount TETAP Harga Akhir (final_amount 0015)
-- pesanan yang punya dokumen INVOICE — Invoice adalah dokumen SANCI ke
-- partner, jadi nilainya memang nilai SANCI. Segala definisi lain 0033
-- (WIB, CANCELLED dikecualikan, invoice paling awal, SECURITY INVOKER,
-- hak EXECUTE) tetap.
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
  if to_regprocedure('public.fn_sales_report(date, date, text)') is null then
    raise exception 'fn_sales_report (0033) belum ada — jalankan 0033 dulu, baru 0034.';
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
           -- 0034: TOTAL PELANGGAN, bukan Harga Akhir SANCI.
           o.customer_total_amount as fa,
           (select coalesce(sum(i.quantity), 0) from order_items i where i.order_id = o.id)::bigint as qty
    from partner_orders o
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
--   SALES_FN_USES_TOTAL      1   ← penjualan = customer_total_amount (0034)
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
select 'SALES_FN_USES_TOTAL',
       (select case when count(*) > 0 then 1 else 0 end::text
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='fn_sales_report'
          and p.prosrc like '%o.customer_total_amount as fa%')
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
