-- Behavioral tests for 0021 (product_prices — harga dasar SANCI + override
-- per partner). Run AFTER 20..80_behavior_*.sql on the full chain
-- 0001→…→0021 + 00_shim + 10_fixtures. Branch-user sections run as
-- NON-superuser app_test_user so RLS actually applies (same discipline as
-- 20_behavior_0014.sql); admin sections run via test_login only (superuser
-- session — fine, pp_admin_all allows the same rows anyway).
--
-- Covers exactly the behavior claims of migration 0021's header:
--   T1  catalog NOT opened → branch reads ZERO rows, base price included
--       (fail-closed, owner decision B), and cannot insert an override
--   T2  catalog opened → branch sees the SANCI base row
--   T3  branch inserts its own override via INSERT…RETURNING (LESSONS #25
--       proof: the returned row passes pp_partner_read)
--   T4  partner B sees the base row but NOT partner A's override
--   T5  partner B cannot update A's override (silent 0 rows, value intact)
--   T6  branch cannot write the BASE row: insert rejected (42501), update
--       and delete are silent 0-row no-ops and the row survives
--   T7  duplicate (product, partner) override → 23505 (unique backstop —
--       LESSONS #3: the constraint is the defense, app upsert rides on it)
--   T8  updated_at/updated_by are SERVER-forced (fn_price_stamp): client-
--       supplied values are overwritten with now()/auth.uid()
--   T9  audited with before/after: PRODUCT_PRICE_CREATED/UPDATED carry the
--       price values, partner_id filled for override rows, actor_role
--       PARTNER_USER for branch writes
--   T10 deleting own override falls back to the base price (and is audited
--       as PRODUCT_PRICE_DELETED)
--   T11 admin full control: writes the base row; its audit rows carry
--       partner_id NULL (base = milik SANCI, 0010 pattern)
--   T12 anon: zero rows
--
-- State discipline: fixtures ship NO sanci_catalog_access rows and NO
-- product_prices rows — this file creates what it needs and removes ALL of
-- it at the end (catalog access + price rows), so re-runs and earlier
-- suites see the same starting state. audit_logs rows are append-only by
-- design and are left in place (same as every other suite).

select public.test_logout();

-- Safety: start from "catalog closed, no price rows" even on re-runs.
select public.test_login('33333333-3333-3333-3333-333333333333');
delete from public.product_prices
 where product_id = 'a4000000-0000-0000-0000-00000000000a';
delete from public.sanci_catalog_access
 where partner_id in ('a0000000-0000-0000-0000-00000000000a',
                      'b0000000-0000-0000-0000-00000000000b');

-- Admin creates the SANCI base price (partner_id NULL) up front — T1 then
-- proves a gate-closed branch cannot see even this row.
insert into public.product_prices (product_id, partner_id, price)
values ('a4000000-0000-0000-0000-00000000000a', null, 1500000);
select public.test_logout();

-- ============================================================
-- T1: catalog NOT opened → zero rows for branch A, base included;
--     and the branch cannot insert an override either.
-- ============================================================
set role app_test_user;
select public.test_login('11111111-1111-1111-1111-111111111111');
select case when count(*) = 0 then 'PASS T1 gate closed: branch reads 0 price rows (base included)'
            else 'FAIL T1 branch saw ' || count(*) || ' row(s) with catalog closed' end
from public.product_prices;

do $$
begin
  begin
    insert into public.product_prices (product_id, partner_id, price)
    values ('a4000000-0000-0000-0000-00000000000a',
            'a0000000-0000-0000-0000-00000000000a', 1000000);
    raise exception 'FAIL T1b override insert accepted with catalog closed';
  exception
    when insufficient_privilege then
      raise notice 'PASS T1b override insert rejected while catalog closed (42501)';
    when raise_exception then raise;
  end;
end;
$$;
select public.test_logout();
reset role;

-- Open the catalog for BOTH partners (admin) — from here on the price list
-- is reachable; per-partner isolation is what the rest of the file proves.
select public.test_login('33333333-3333-3333-3333-333333333333');
insert into public.sanci_catalog_access (partner_id, enabled)
values ('a0000000-0000-0000-0000-00000000000a', true),
       ('b0000000-0000-0000-0000-00000000000b', true)
on conflict (partner_id) do update set enabled = true;
select public.test_logout();

-- ============================================================
-- T2: catalog opened → branch A sees exactly the base row.
-- ============================================================
set role app_test_user;
select public.test_login('11111111-1111-1111-1111-111111111111');
select case when count(*) = 1 then 'PASS T2 branch sees the SANCI base row once catalog opened'
            else 'FAIL T2 expected 1 row, got ' || count(*) end
from public.product_prices
where product_id = 'a4000000-0000-0000-0000-00000000000a' and partner_id is null and price = 1500000;

-- ============================================================
-- T3: branch A inserts its own override, INSERT…RETURNING (LESSONS #25).
-- ============================================================
with ins as (
  insert into public.product_prices (product_id, partner_id, price)
  values ('a4000000-0000-0000-0000-00000000000a',
          'a0000000-0000-0000-0000-00000000000a', 1200000)
  returning id, price
)
select case when count(*) = 1 then 'PASS T3 own override inserted and RETURNING passed RLS (LESSONS #25)'
            else 'FAIL T3 RETURNING gave ' || count(*) || ' row(s)' end
from ins;

-- ============================================================
-- T7: duplicate (product, partner) → 23505, the unique backstop.
-- (run here while still logged in as branch A)
-- ============================================================
do $$
begin
  begin
    insert into public.product_prices (product_id, partner_id, price)
    values ('a4000000-0000-0000-0000-00000000000a',
            'a0000000-0000-0000-0000-00000000000a', 999999);
    raise exception 'FAIL T7 duplicate override was accepted';
  exception
    when unique_violation then
      raise notice 'PASS T7 duplicate (product, partner) rejected by unique constraint (23505)';
    when raise_exception then raise;
  end;
end;
$$;

-- ============================================================
-- T6: branch A cannot write the BASE row (partner_id NULL).
-- ============================================================
-- (a) inserting a second base row for another fixture-less product id is
-- impossible anyway (FK), so prove it on the same product via a DIFFERENT
-- surface: a base-row INSERT — WITH CHECK must reject before the partial
-- unique even matters.
do $$
begin
  begin
    insert into public.product_prices (product_id, partner_id, price)
    values ('a4000000-0000-0000-0000-00000000000a', null, 1);
    raise exception 'FAIL T6a branch inserted a BASE row';
  exception
    when insufficient_privilege then
      raise notice 'PASS T6a base-row insert from branch rejected (42501)';
    when unique_violation then
      raise exception 'FAIL T6a rejected by unique constraint, not RLS — policy let a base row through';
    when raise_exception then raise;
  end;
end;
$$;

-- (b) update of the base row: silent 0 rows (RLS row filter), not an error.
with upd as (
  update public.product_prices set price = 1
  where product_id = 'a4000000-0000-0000-0000-00000000000a' and partner_id is null
  returning id
)
select case when count(*) = 0 then 'PASS T6b base-row update from branch is a silent 0-row no-op'
            else 'FAIL T6b branch updated ' || count(*) || ' base row(s)' end
from upd;

-- (c) delete of the base row: silent 0 rows.
with del as (
  delete from public.product_prices
  where product_id = 'a4000000-0000-0000-0000-00000000000a' and partner_id is null
  returning id
)
select case when count(*) = 0 then 'PASS T6c base-row delete from branch is a silent 0-row no-op'
            else 'FAIL T6c branch deleted ' || count(*) || ' base row(s)' end
from del;
select public.test_logout();

-- ============================================================
-- T4: partner B sees the base row but NOT partner A's override.
-- ============================================================
select public.test_login('22222222-2222-2222-2222-222222222222');
select case when count(*) = 0 then 'PASS T4 partner B cannot see partner A''s override'
            else 'FAIL T4 partner B saw ' || count(*) || ' foreign override row(s)' end
from public.product_prices where partner_id is not null;
select case when count(*) = 1 then 'PASS T4b partner B still sees the shared base row'
            else 'FAIL T4b partner B base-row count = ' || count(*) end
from public.product_prices where partner_id is null and price = 1500000;

-- ============================================================
-- T5: partner B cannot update A's override — silent 0 rows.
-- ============================================================
with upd as (
  update public.product_prices set price = 1
  where partner_id = 'a0000000-0000-0000-0000-00000000000a'
  returning id
)
select case when count(*) = 0 then 'PASS T5 cross-partner override update blocked (0 rows)'
            else 'FAIL T5 partner B updated ' || count(*) || ' row(s) of partner A' end
from upd;
select public.test_logout();
reset role;

-- Value intact after the blocked update + base row survived T6 (admin view).
select public.test_login('33333333-3333-3333-3333-333333333333');
select case when count(*) = 1 then 'PASS T5b partner A''s override value unchanged (still 1200000)'
            else 'FAIL T5b override row missing/changed' end
from public.product_prices
where partner_id = 'a0000000-0000-0000-0000-00000000000a' and price = 1200000;
select case when count(*) = 1 then 'PASS T6d base row survived all branch write attempts (still 1500000)'
            else 'FAIL T6d base row missing/changed' end
from public.product_prices where partner_id is null and price = 1500000;
select public.test_logout();

-- ============================================================
-- T8: updated_at/updated_by are SERVER-forced (fn_price_stamp) — the
--     branch update sends bogus values for both, the row keeps server's.
-- ============================================================
set role app_test_user;
select public.test_login('11111111-1111-1111-1111-111111111111');
update public.product_prices
   set price = 1300000,
       updated_by = '22222222-2222-2222-2222-222222222222',  -- lie: user B
       updated_at = '2000-01-01T00:00:00Z'                    -- lie: past
 where partner_id = 'a0000000-0000-0000-0000-00000000000a';
select case
         when updated_by = '11111111-1111-1111-1111-111111111111'
              and updated_at > now() - interval '1 minute'
         then 'PASS T8 updated_by/updated_at forced to auth.uid()/now() by trigger'
         else 'FAIL T8 updated_by=' || coalesce(updated_by::text, 'NULL') || ' updated_at=' || updated_at::text
       end
from public.product_prices
where partner_id = 'a0000000-0000-0000-0000-00000000000a';
select public.test_logout();
reset role;

-- ============================================================
-- T9: audit — created/updated rows carry price in before/after, the
--     override rows carry partner_id, branch writes are PARTNER_USER.
-- ============================================================
select public.test_login('33333333-3333-3333-3333-333333333333');
select case when count(*) >= 1 then 'PASS T9a PRODUCT_PRICE_CREATED audited with price + partner_id + PARTNER_USER'
            else 'FAIL T9a no matching PRODUCT_PRICE_CREATED audit row' end
from public.audit_logs
where action = 'PRODUCT_PRICE_CREATED' and entity_type = 'product_prices'
  and partner_id = 'a0000000-0000-0000-0000-00000000000a'
  and (after->>'price') = '1200000' and actor_role = 'PARTNER_USER';
select case when count(*) >= 1 then 'PASS T9b PRODUCT_PRICE_UPDATED audited with before 1200000 -> after 1300000'
            else 'FAIL T9b no matching PRODUCT_PRICE_UPDATED audit row' end
from public.audit_logs
where action = 'PRODUCT_PRICE_UPDATED' and entity_type = 'product_prices'
  and (before->>'price') = '1200000' and (after->>'price') = '1300000';
select public.test_logout();

-- ============================================================
-- T10: deleting own override falls back to the base price.
-- ============================================================
set role app_test_user;
select public.test_login('11111111-1111-1111-1111-111111111111');
with del as (
  delete from public.product_prices
  where product_id = 'a4000000-0000-0000-0000-00000000000a'
    and partner_id = 'a0000000-0000-0000-0000-00000000000a'
  returning id
)
select case when count(*) = 1 then 'PASS T10 own override deleted (revert button works)'
            else 'FAIL T10 delete removed ' || count(*) || ' row(s)' end
from del;
-- Fallback: what branch A now reads for this product is ONLY the base row.
select case when count(*) = 1 and min(price) = 1500000
            then 'PASS T10b lookup falls back to the SANCI base price'
            else 'FAIL T10b rows=' || count(*) || ' price=' || coalesce(min(price)::text, 'NULL') end
from public.product_prices
where product_id = 'a4000000-0000-0000-0000-00000000000a';
select public.test_logout();
reset role;

select public.test_login('33333333-3333-3333-3333-333333333333');
select case when count(*) >= 1 then 'PASS T10c PRODUCT_PRICE_DELETED audited (before carries 1300000)'
            else 'FAIL T10c no PRODUCT_PRICE_DELETED audit row' end
from public.audit_logs
where action = 'PRODUCT_PRICE_DELETED' and entity_type = 'product_prices'
  and (before->>'price') = '1300000';

-- ============================================================
-- T11: admin full control — updates the base row; base audit rows carry
--      partner_id NULL (harga milik SANCI, pola sanci_products 0010).
-- ============================================================
update public.product_prices set price = 1600000
where product_id = 'a4000000-0000-0000-0000-00000000000a' and partner_id is null;
select case when count(*) = 1 then 'PASS T11 admin updated the base row (1500000 -> 1600000)'
            else 'FAIL T11 base row after admin update: ' || count(*) end
from public.product_prices where partner_id is null and price = 1600000;
select case when count(*) >= 1 then 'PASS T11b base-row audit carries partner_id NULL + SANCI_ADMIN'
            else 'FAIL T11b no matching base-row PRODUCT_PRICE_UPDATED audit row' end
from public.audit_logs
where action = 'PRODUCT_PRICE_UPDATED' and entity_type = 'product_prices'
  and partner_id is null and (after->>'price') = '1600000' and actor_role = 'SANCI_ADMIN';
select public.test_logout();

-- ============================================================
-- T12: anon — zero rows.
-- ============================================================
set role app_test_user;
select public.test_logout();
select case when count(*) = 0 then 'PASS T12 anon: 0 product_prices rows'
            else 'FAIL T12 anon saw ' || count(*) end
from public.product_prices;
reset role;

-- ============================================================
-- Cleanup: remove EVERYTHING this file created (price rows + catalog
-- access rows) so earlier suites / re-runs start from fixture state.
-- ============================================================
select public.test_login('33333333-3333-3333-3333-333333333333');
delete from public.product_prices
 where product_id = 'a4000000-0000-0000-0000-00000000000a';
delete from public.sanci_catalog_access
 where partner_id in ('a0000000-0000-0000-0000-00000000000a',
                      'b0000000-0000-0000-0000-00000000000b');
select public.test_logout();

select 'DONE 0021 behavior suite' as note;
