-- Behavioral tests for 0017 (customers.customer_code / customers.email).
-- Must be run as a NON-superuser, NON-owner role (app_test_user) so RLS
-- actually applies. Run via: sudo -u postgres psql -d <db> -f 50_behavior_0017.sql
-- (after 00_shim.sql, 10_fixtures.sql, 20_behavior_0014.sql, 30_behavior_0015.sql
-- and 40_behavior_0016.sql have run on top of the full 0001..0017 chain.)
--
-- SCOPE: three things need proving, matching the task's hard requirements —
--   1. Blank-guard CHECKs actually reject '' for both new columns (not just
--      declared, but ENFORCED).
--   2. customers_customer_code_key actually enforces uniqueness among
--      non-null values, and does NOT block two customers with code = NULL.
--   3. Branch invisibility: a customer inserted with created_via_partner_id/
--      created_via_branch_id = NULL (exactly what the import script does) is
--      readable by admin (0 rows would mean the fixture itself is broken)
--      but returns ZERO rows for a branch user — the whole point of this
--      slice. This is the SAME c_partner_read policy from 0007, untouched by
--      0017; this test proves the migration's own claim (§3 of its header)
--      behaviorally, not just by re-reading the SQL text.

set role app_test_user;

-- ── T1: blank string rejected for customer_code ─────────────
select public.test_login('33333333-3333-3333-3333-333333333333');

do $$
begin
  insert into public.customers (full_name, phone, phone_normalized, customer_code)
  values ('Blank Code Test', '0812', '62812', '');
  raise exception 'FAIL T1 blank customer_code was accepted';
exception
  when check_violation then
    raise notice 'PASS T1 blank customer_code rejected by CHECK';
end;
$$;

-- ── T2: blank string rejected for email ─────────────────────
do $$
begin
  insert into public.customers (full_name, phone, phone_normalized, email)
  values ('Blank Email Test', '0813', '62813', '');
  raise exception 'FAIL T2 blank email was accepted';
exception
  when check_violation then
    raise notice 'PASS T2 blank email rejected by CHECK';
end;
$$;

-- ── T3: NULL customer_code does NOT collide (many customers, no code) ──
insert into public.customers (id, full_name, phone, phone_normalized)
values
  ('e1000000-0000-0000-0000-000000000e01', 'No Code A', '081100000001', '62811100000001'),
  ('e1000000-0000-0000-0000-000000000e02', 'No Code B', '081100000002', '62811100000002')
on conflict (id) do nothing;

select case when count(*) = 2 then 'PASS T3 two NULL customer_code rows coexist'
            else 'FAIL T3 expected 2 rows, got ' || count(*) end
from public.customers where id in ('e1000000-0000-0000-0000-000000000e01','e1000000-0000-0000-0000-000000000e02');

-- ── T4: duplicate customer_code among non-null values IS rejected ──
insert into public.customers (id, full_name, phone, phone_normalized, customer_code)
values ('e1000000-0000-0000-0000-000000000e03', 'Dup Code A', '081100000003', '62811100000003', 'DUP/001')
on conflict (id) do nothing;

do $$
begin
  insert into public.customers (full_name, phone, phone_normalized, customer_code)
  values ('Dup Code B', '081100000004', '62811100000004', 'DUP/001');
  raise exception 'FAIL T4 duplicate customer_code was accepted';
exception
  when unique_violation then
    raise notice 'PASS T4 duplicate customer_code rejected by unique index';
end;
$$;

-- ── T5: import-shaped row (created_via_* = NULL, no order) is admin-visible,
--        zero-visible to a branch user — the hard requirement itself ──
insert into public.customers
  (id, full_name, phone, phone_normalized, address, email, customer_code, notes,
   created_via_partner_id, created_via_branch_id)
values
  ('e1000000-0000-0000-0000-000000000e05', 'Imported Ghost', '081199990000', '62811999900000',
   'Jl. Import Test', 'ghost@example.test', 'IMP/001', 'Sumber: dari Tim Komisaris · Sales: Cherlie',
   null, null)
on conflict (id) do nothing;

select public.test_logout();

-- Admin: must see the row (sanity — proves the fixture itself works).
select public.test_login('33333333-3333-3333-3333-333333333333');
select case when count(*) = 1 then 'PASS T5a admin sees the imported-shaped customer'
            else 'FAIL T5a expected 1 row for admin, got ' || count(*) end
from public.customers where id = 'e1000000-0000-0000-0000-000000000e05';
select public.test_logout();

-- Branch user (Partner A / Branch A1, same as every other harness fixture):
-- must see ZERO rows. This is the entire point of this slice.
select public.test_login('11111111-1111-1111-1111-111111111111');
select case when count(*) = 0 then 'PASS T5b branch user sees ZERO rows of the imported-shaped customer'
            else 'FAIL T5b expected 0 rows for branch, got ' || count(*) end
from public.customers where id = 'e1000000-0000-0000-0000-000000000e05';
select public.test_logout();

reset role;
