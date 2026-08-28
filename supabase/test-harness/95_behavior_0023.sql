-- Behavioral tests for 0023 (customer order link — /lihat/<token>, tahap
-- pesanan, penanda "sudah diterima pelanggan", pembukaan alamat lewat nomor
-- HP). Run AFTER 20..90_behavior_*.sql on the full chain 0001→…→0021→0023
-- + 00_shim + 10_fixtures.
--
-- Branch-user sections run as NON-superuser app_test_user so RLS actually
-- applies (same discipline as 20_behavior_0014.sql); admin sections run via
-- test_login only.
--
-- Covers exactly the behavior claims of migration 0023's header:
--   T1  every order carries a token: NOT NULL, unique, >= 64 chars — old
--       rows included (ADD COLUMN table-rewrite backfill, §1)
--   T2  anon reads ZERO rows from partner_orders / customers / order_items /
--       order_sanci_offers / order_documents directly (no anon policy at all)
--   T3  fn_customer_order_view: unknown token → NULL; real token → the
--       WHITELIST only — no phone, no full address, no cancellation reason,
--       no uuid anywhere in the payload
--   T4  stage derivation (owner decision D): DIRECT_DELIVERY without DO →
--       ORDER_RECEIVED; with DO → SHIPPING (+ do_date); delivered →
--       DELIVERED; SHOWROOM_VISIT → READY_FOR_PICKUP / PICKED_UP
--   T5  CANCELLED order → cancelled=true, stage CANCELLED, and the payload
--       carries NO items/amounts and above all NO cancellation_reason
--   T6  amounts: absent while there is no offer row; final/dp/sisa once
--       there is one
--   T7  a BRANCH user can mark delivered (o_partner_update, 0005 §4) and
--       the value is SERVER-forced: a client-supplied timestamp is ignored
--   T8  marking delivered is audited as ORDER_UPDATED with before/after
--       carrying delivered_at — with fn_audit_row UNTOUCHED by 0023
--   T9  a branch user can NOT un-mark delivered, can NOT change the token
--   T10 fn_customer_reveal_address: wrong phone → invalid + attempts_left
--       counting down; 5th wrong → locked 15 min; while locked even the
--       CORRECT phone is refused; correct phone (after unlock) → address
--   T11 the lockout table is invisible to anon, authenticated AND admin
--       (RLS on, zero policies)
--
-- State discipline: this file creates its own order/customer/product rows
-- (prefix c9…) and deletes them at the end, so re-runs and earlier suites
-- see the same starting state. audit_logs rows are append-only by design
-- and are left in place (same as every other suite).

select public.test_logout();

\set ON_ERROR_STOP on
\set QUIET on

-- ── Fixtures milik berkas ini ────────────────────────────────
select public.test_login('33333333-3333-3333-3333-333333333333');

delete from public.order_documents where order_id in
  ('c9000000-0000-0000-0000-000000000001','c9000000-0000-0000-0000-000000000002');
delete from public.order_items where order_id in
  ('c9000000-0000-0000-0000-000000000001','c9000000-0000-0000-0000-000000000002');
delete from public.order_sanci_offers where order_id in
  ('c9000000-0000-0000-0000-000000000001','c9000000-0000-0000-0000-000000000002');
delete from public.customer_view_attempts where order_id in
  ('c9000000-0000-0000-0000-000000000001','c9000000-0000-0000-0000-000000000002');
delete from public.partner_orders where id in
  ('c9000000-0000-0000-0000-000000000001','c9000000-0000-0000-0000-000000000002');
delete from public.customers where id = 'c9000000-0000-0000-0000-00000000000c';

insert into public.customers
  (id, full_name, phone, phone_normalized, address, city, created_via_partner_id, created_via_branch_id)
values
  ('c9000000-0000-0000-0000-00000000000c', 'Budi Santoso Wijaya', '0812-3456-7890', '6281234567890',
   'Jl. Melati No. 12 RT 03 RW 05, Kelurahan Cibeunying', 'Bandung',
   'a0000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a');

insert into public.partner_orders
  (id, customer_id, partner_id, branch_id, partner_sales_staff_id, package_name, status,
   fulfillment_path, shipping_address, notes)
values
  ('c9000000-0000-0000-0000-000000000001', 'c9000000-0000-0000-0000-00000000000c',
   'a0000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a',
   'a3000000-0000-0000-0000-00000000000a', 'Paket 1', 'REGISTERED',
   'DIRECT_DELIVERY', 'Jl. Melati No. 12 RT 03 RW 05, Bandung', 'catatan internal cabang'),
  ('c9000000-0000-0000-0000-000000000002', 'c9000000-0000-0000-0000-00000000000c',
   'a0000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a',
   'a3000000-0000-0000-0000-00000000000a', 'Paket 1', 'REGISTERED',
   'SHOWROOM_VISIT', null, null);

insert into public.order_items (order_id, product_id, name_snapshot, code_snapshot, quantity, unit_price)
values ('c9000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-00000000000a',
        'Sofa X', 'SOFA-X', 2, 1500000);

select public.test_logout();

-- ── T1 — setiap pesanan punya token, unik, panjang penuh ─────
select 'T1 token backfill+unique' as test,
       case when (select count(*) from public.partner_orders where customer_view_token is null) = 0
             and (select count(*) from public.partner_orders) =
                 (select count(distinct customer_view_token) from public.partner_orders)
             and (select min(length(customer_view_token)) from public.partner_orders) >= 64
            then 'PASS' else 'FAIL' end as result;

-- T1b — pesanan fixture LAMA (dibuat 10_fixtures.sql sebelum 0023 ada di
-- database ini pada urutan jalan yang sesungguhnya) juga punya token.
select 'T1b old order has token' as test,
       case when (select customer_view_token from public.partner_orders
                  where id = 'a6000000-0000-0000-0000-00000000000a') is not null
            then 'PASS' else 'FAIL' end as result;

-- ── T2 — anon TIDAK melihat satu baris pun secara langsung ───
set role anon;
select 'T2 anon sees no order/customer/item/offer/doc rows' as test,
       case when (select count(*) from public.partner_orders) = 0
             and (select count(*) from public.customers) = 0
             and (select count(*) from public.order_items) = 0
             and (select count(*) from public.order_sanci_offers) = 0
             and (select count(*) from public.order_documents) = 0
            then 'PASS' else 'FAIL' end as result;
reset role;

-- ── T3 — daftar putih RPC (dipanggil SEBAGAI anon) ───────────
-- Token diambil ke variabel psql SELAGI MASIH superuser: begitu `set role
-- anon` aktif, partner_orders memang tidak terbaca sama sekali (itulah yang
-- dibuktikan T2) — subquery pengambil token akan pulang NULL dan seluruh
-- pengujian di bawah jadi menguji "token null", bukan yang dimaksud.
-- Kesalahan ini benar-benar terjadi pada versi pertama berkas ini dan
-- lolos sebagai "FAIL yang membingungkan"; dicatat di sini supaya tidak
-- diulang.
select customer_view_token as tok1 from public.partner_orders
where id = 'c9000000-0000-0000-0000-000000000001'
\gset
select customer_view_token as tok2 from public.partner_orders
where id = 'c9000000-0000-0000-0000-000000000002'
\gset

set role anon;
select 'T3a unknown token -> NULL' as test,
       case when public.fn_customer_order_view('tidak-ada-token-seperti-ini') is null
            then 'PASS' else 'FAIL' end as result;

select 'T3b whitelist keys only' as test,
       case when (select array_agg(k order by k)
                  from jsonb_object_keys(public.fn_customer_order_view(:'tok1')) k) =
                 array['amounts','cancelled','city','customer_first_name','delivered_at',
                       'do_date','fulfillment_path','has_address','items','order_number','stage']
            then 'PASS' else 'FAIL' end as result;

-- Asersi NEGATIF: teks payload tidak boleh memuat nomor HP, alamat lengkap,
-- catatan internal, atau uuid apa pun.
select 'T3c no phone / full address / notes / uuid leaks' as test,
       case when payload not like '%6281234567890%'
             and payload not like '%0812-3456-7890%'
             and payload not like '%RT 03%'
             and payload not like '%catatan internal%'
             and payload not like '%c9000000-0000%'
             and payload not like '%a0000000-0000%'
            then 'PASS' else 'FAIL' end as result
from (select public.fn_customer_order_view(:'tok1')::text as payload) p;

select 'T3d first name only + city + has_address' as test,
       case when v->>'customer_first_name' = 'Budi'
             and v->>'city' = 'Bandung'
             and (v->>'has_address')::boolean
            then 'PASS' else 'FAIL' end as result
from (select public.fn_customer_order_view(:'tok1') as v) x;
reset role;

-- ── T4 — penurunan tahap ─────────────────────────────────────
select 'T4a DIRECT tanpa DO -> ORDER_RECEIVED' as test,
       case when public.fn_customer_order_view(
                 (select customer_view_token from public.partner_orders
                  where id = 'c9000000-0000-0000-0000-000000000001'))->>'stage' = 'ORDER_RECEIVED'
            then 'PASS' else 'FAIL' end as result;

select public.test_login('33333333-3333-3333-3333-333333333333');
insert into public.order_documents (order_id, doc_type, doc_number, doc_date)
values ('c9000000-0000-0000-0000-000000000001', 'DO', 'DO-T0023-1', date '2026-08-20'),
       ('c9000000-0000-0000-0000-000000000001', 'DO', 'DO-T0023-2', date '2026-08-22');
select public.test_logout();

select 'T4b DIRECT dengan DO -> SHIPPING + do_date TERBARU' as test,
       case when v->>'stage' = 'SHIPPING' and v->>'do_date' = '2026-08-22'
            then 'PASS' else 'FAIL' end as result
from (select public.fn_customer_order_view(
               (select customer_view_token from public.partner_orders
                where id = 'c9000000-0000-0000-0000-000000000001')) as v) x;

select 'T4c SHOWROOM tanpa kedatangan -> READY_FOR_PICKUP' as test,
       case when public.fn_customer_order_view(
                 (select customer_view_token from public.partner_orders
                  where id = 'c9000000-0000-0000-0000-000000000002'))->>'stage' = 'READY_FOR_PICKUP'
            then 'PASS' else 'FAIL' end as result;

select public.test_login('33333333-3333-3333-3333-333333333333');
update public.partner_orders set customer_arrived_at = now()
where id = 'c9000000-0000-0000-0000-000000000002';
select public.test_logout();

select 'T4d SHOWROOM sesudah kedatangan -> PICKED_UP' as test,
       case when public.fn_customer_order_view(
                 (select customer_view_token from public.partner_orders
                  where id = 'c9000000-0000-0000-0000-000000000002'))->>'stage' = 'PICKED_UP'
            then 'PASS' else 'FAIL' end as result;

-- ── T6 — bagian uang muncul HANYA kalau ada baris penawaran ──
select 'T6a tanpa penawaran -> amounts NULL' as test,
       case when public.fn_customer_order_view(
                 (select customer_view_token from public.partner_orders
                  where id = 'c9000000-0000-0000-0000-000000000001'))->'amounts' = 'null'::jsonb
            then 'PASS' else 'FAIL' end as result;

select public.test_login('33333333-3333-3333-3333-333333333333');
insert into public.order_sanci_offers (order_id, amount, dp_amount)
values ('c9000000-0000-0000-0000-000000000001', 3000000, 1000000);
select public.test_logout();

select 'T6b dengan penawaran -> final/dp/sisa' as test,
       case when (v->'amounts'->>'final')::numeric = 3000000
             and (v->'amounts'->>'dp')::numeric = 1000000
             and (v->'amounts'->>'sisa')::numeric = 2000000
            then 'PASS' else 'FAIL' end as result
from (select public.fn_customer_order_view(
               (select customer_view_token from public.partner_orders
                where id = 'c9000000-0000-0000-0000-000000000001')) as v) x;

-- ── T7 — cabang MENANDAI diterima; nilainya dipaksa server ───
-- Dijalankan sebagai app_test_user (bukan superuser) supaya RLS
-- o_partner_update (0005 §4) sungguh berlaku.
set role app_test_user;
select public.test_login('11111111-1111-1111-1111-111111111111');

update public.partner_orders
   set delivered_at = timestamptz '2001-01-01 00:00:00+00',   -- jam palsu dari client
       delivered_by = '22222222-2222-2222-2222-222222222222'  -- aktor palsu dari client
 where id = 'c9000000-0000-0000-0000-000000000001';

select 'T7 branch can mark delivered, server-forced value+actor' as test,
       case when delivered_at is not null
             and delivered_at > timestamptz '2020-01-01 00:00:00+00'
             and delivered_by = '11111111-1111-1111-1111-111111111111'
            then 'PASS' else 'FAIL' end as result
from public.partner_orders where id = 'c9000000-0000-0000-0000-000000000001';
reset role;
select public.test_logout();

select 'T7b stage jadi DELIVERED' as test,
       case when public.fn_customer_order_view(
                 (select customer_view_token from public.partner_orders
                  where id = 'c9000000-0000-0000-0000-000000000001'))->>'stage' = 'DELIVERED'
            then 'PASS' else 'FAIL' end as result;

-- ── T8 — audit: ORDER_UPDATED generik membawa diff delivered_at ──
select 'T8 audited as ORDER_UPDATED with delivered_at diff' as test,
       case when exists (
              select 1 from public.audit_logs
              where entity_type = 'partner_orders'
                and entity_id = 'c9000000-0000-0000-0000-000000000001'
                and action = 'ORDER_UPDATED'
                and (before->>'delivered_at') is null
                and (after->>'delivered_at') is not null
                and actor_user_id = '11111111-1111-1111-1111-111111111111'
                and actor_role = 'PARTNER_USER')
            then 'PASS' else 'FAIL' end as result;

-- ── T9 — cabang tidak bisa membatalkan penandaan / ganti token ──
set role app_test_user;
select public.test_login('11111111-1111-1111-1111-111111111111');

do $$
declare v_ok boolean := false;
begin
  begin
    update public.partner_orders set delivered_at = null
     where id = 'c9000000-0000-0000-0000-000000000001';
  exception when others then v_ok := true;
  end;
  raise notice 'T9a branch cannot un-mark delivered: %', case when v_ok then 'PASS' else 'FAIL' end;
end;
$$;

do $$
declare v_ok boolean := false;
begin
  begin
    update public.partner_orders set customer_view_token = 'tebakan-gampang'
     where id = 'c9000000-0000-0000-0000-000000000001';
  exception when others then v_ok := true;
  end;
  raise notice 'T9b branch cannot change link token: %', case when v_ok then 'PASS' else 'FAIL' end;
end;
$$;
reset role;
select public.test_logout();

-- ── T5 — pesanan DIBATALKAN: tanpa alasan, tanpa isi ─────────
select public.test_login('33333333-3333-3333-3333-333333333333');
update public.partner_orders
   set status = 'CANCELLED', cancellation_reason = 'pelanggan berubah pikiran soal warna'
 where id = 'c9000000-0000-0000-0000-000000000002';
select public.test_logout();

select 'T5 cancelled: no reason, no items, no amounts' as test,
       case when (v->>'cancelled')::boolean
             and v->>'stage' = 'CANCELLED'
             and not (v ? 'items') and not (v ? 'amounts') and not (v ? 'city')
             and v::text not like '%berubah pikiran%'
            then 'PASS' else 'FAIL' end as result
from (select public.fn_customer_order_view(
               (select customer_view_token from public.partner_orders
                where id = 'c9000000-0000-0000-0000-000000000002')) as v) x;

-- ── T10 — rem penebak nomor HP ───────────────────────────────
set role anon;
select 'T10a wrong phone -> invalid, attempts_left 4' as test,
       case when v->>'status' = 'invalid' and (v->>'attempts_left')::int = 4
            then 'PASS' else 'FAIL' end as result
from (select public.fn_customer_reveal_address(:'tok1', '628999999999') as v) x;
reset role;

do $$
declare v_tok text; v_res jsonb; v_i int;
begin
  select customer_view_token into v_tok from public.partner_orders
  where id = 'c9000000-0000-0000-0000-000000000001';
  for v_i in 2..5 loop
    v_res := public.fn_customer_reveal_address(v_tok, '628999999999');
  end loop;
  raise notice 'T10b 5th wrong attempt -> locked: %',
    case when v_res->>'status' = 'locked' and (v_res->>'locked_until') is not null
         then 'PASS' else 'FAIL' end;

  -- Terkunci: nomor yang BENAR pun ditolak (rem berlaku untuk siapa saja).
  v_res := public.fn_customer_reveal_address(v_tok, '6281234567890');
  raise notice 'T10c while locked even correct phone is refused: %',
    case when v_res->>'status' = 'locked' then 'PASS' else 'FAIL' end;

  -- Buka kunci (mensimulasikan 15 menit berlalu) → nomor benar berhasil,
  -- dan rem dilepas seluruhnya.
  update public.customer_view_attempts set locked_until = now() - interval '1 minute'
  where order_id = 'c9000000-0000-0000-0000-000000000001';
  v_res := public.fn_customer_reveal_address(v_tok, '6281234567890');
  raise notice 'T10d correct phone after unlock -> ok + full address: %',
    case when v_res->>'status' = 'ok' and v_res->>'address' like '%Jl. Melati%'
         then 'PASS' else 'FAIL' end;
  raise notice 'T10e success clears the brake: %',
    case when not exists (select 1 from public.customer_view_attempts
                          where order_id = 'c9000000-0000-0000-0000-000000000001')
         then 'PASS' else 'FAIL' end;

  -- Nomor dalam bentuk lokal "0812…" TIDAK cocok: normalisasi memang tugas
  -- normalizePhoneID() di sisi server aplikasi (lib/orders-shared.ts), bukan
  -- tugas SQL ini — batas yang DISADARI, diuji supaya tetap disadari.
  v_res := public.fn_customer_reveal_address(v_tok, '081234567890');
  raise notice 'T10f raw local format is NOT normalized here (by design): %',
    case when v_res->>'status' = 'invalid' then 'PASS' else 'FAIL' end;
end;
$$;

-- ── T11 — tabel rem tertutup untuk semua peran PostgREST ─────
select public.test_login('33333333-3333-3333-3333-333333333333');
set role app_test_user;
select 'T11 lockout table closed to branch user AND admin session' as test,
       case when (select count(*) from public.customer_view_attempts) = 0
            then 'PASS' else 'FAIL' end as result;
reset role;
set role anon;
select 'T11b lockout table closed to anon' as test,
       case when (select count(*) from public.customer_view_attempts) = 0
            then 'PASS' else 'FAIL' end as result;
reset role;
select public.test_logout();

-- ── Bersih-bersih ────────────────────────────────────────────
select public.test_login('33333333-3333-3333-3333-333333333333');
delete from public.order_documents where order_id in
  ('c9000000-0000-0000-0000-000000000001','c9000000-0000-0000-0000-000000000002');
delete from public.order_items where order_id in
  ('c9000000-0000-0000-0000-000000000001','c9000000-0000-0000-0000-000000000002');
delete from public.order_sanci_offers where order_id in
  ('c9000000-0000-0000-0000-000000000001','c9000000-0000-0000-0000-000000000002');
delete from public.customer_view_attempts where order_id in
  ('c9000000-0000-0000-0000-000000000001','c9000000-0000-0000-0000-000000000002');
delete from public.partner_orders where id in
  ('c9000000-0000-0000-0000-000000000001','c9000000-0000-0000-0000-000000000002');
delete from public.customers where id = 'c9000000-0000-0000-0000-00000000000c';
select public.test_logout();
