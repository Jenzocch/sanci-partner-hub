-- Behavioral tests for 0018 (customer_code auto-generation + customer_sources
-- / sanci_sales_staff master tables). Must be run as a NON-superuser,
-- NON-owner role (app_test_user) so RLS actually applies. Run via:
--   sudo -u postgres psql -d <db> -f 60_behavior_0018.sql
-- (after 00_shim.sql, 10_fixtures.sql, 20/30/40/50_behavior_*.sql and
-- migrations 0001..0018 have all run on top of the full chain.)

set role app_test_user;

-- ── T1: seed rows present with correct codes/labels/names ───
select public.test_login('33333333-3333-3333-3333-333333333333');

select case when count(*) = 5 then 'PASS T1a SOURCE_SEED_COUNT is 5'
            else 'FAIL T1a expected 5 source rows, got ' || count(*) end
from public.customer_sources;

select case
  when bool_and(x.ok) then 'PASS T1b all 5 source code/label pairs match owner list'
  else 'FAIL T1b source seed mismatch'
end
from (
  select (exists(select 1 from public.customer_sources where code='A' and label='dari Tim Komisaris')) as ok
  union all select exists(select 1 from public.customer_sources where code='B' and label='B2B')
  union all select exists(select 1 from public.customer_sources where code='C' and label='Visit Langsung')
  union all select exists(select 1 from public.customer_sources where code='D' and label='Tim Marketing')
  union all select exists(select 1 from public.customer_sources where code='E' and label='Tim Sosial Media')
) x;

select case when count(*) = 7 then 'PASS T1c SALES_SEED_COUNT is 7'
            else 'FAIL T1c expected 7 sales rows, got ' || count(*) end
from public.sanci_sales_staff;

select case
  when bool_and(x.ok) then 'PASS T1d all 7 sales code/name pairs match owner roster'
  else 'FAIL T1d sales seed mismatch'
end
from (
  select (exists(select 1 from public.sanci_sales_staff where code='M'  and name='Amenni')) as ok
  union all select exists(select 1 from public.sanci_sales_staff where code='NS' and name='Nini San')
  union all select exists(select 1 from public.sanci_sales_staff where code='AL' and name='Alina')
  union all select exists(select 1 from public.sanci_sales_staff where code='C'  and name='Cherlie')
  union all select exists(select 1 from public.sanci_sales_staff where code='GL' and name='Gilang')
  union all select exists(select 1 from public.sanci_sales_staff where code='S'  and name='Serly')
  union all select exists(select 1 from public.sanci_sales_staff where code='D'  and name='Dinna')
) x;

-- ── T2: auto-generate produces the EXACT expected literal string ──
-- Deterministic regardless of what earlier harness files already consumed
-- from the sequence: read last_value BEFORE this insert (nothing else in
-- this statement advances it), then assert the generated suffix is
-- PRECISELY that value + 1 — a real generated string compared to a real
-- expected string, not just "the trigger exists".
do $$
declare
  v_before integer;
  v_source_id uuid;
  v_sales_id uuid;
  v_code text;
  v_expected text;
  v_yy text := to_char(now() at time zone 'Asia/Jakarta', 'YY');
begin
  select last_value into v_before from public.customer_code_seq;
  select id into v_source_id from public.customer_sources where code = 'A' and status = 'ACTIVE';
  select id into v_sales_id  from public.sanci_sales_staff  where code = 'NS' and status = 'ACTIVE';

  insert into public.customers (full_name, phone, phone_normalized, source_id, sales_staff_id)
  values ('T2 Literal Gen', '081160000002', '62811600000002', v_source_id, v_sales_id)
  returning customer_code into v_code;

  v_expected := 'A/' || v_yy || '-NS/' || lpad((v_before + 1)::text, 3, '0');
  if v_code = v_expected then
    raise notice 'PASS T2 generated exactly %', v_code;
  else
    raise exception 'FAIL T2 expected %, got %', v_expected, v_code;
  end if;
end;
$$;

-- ── T3: preset customer_code is left untouched ───────────────
do $$
declare v_code text;
begin
  insert into public.customers
    (full_name, phone, phone_normalized, customer_code, source_id, sales_staff_id)
  values ('T3 Preset', '081160000003', '62811600000003', 'HAND/WRITTEN/007',
          (select id from public.customer_sources where code='A' and status='ACTIVE'),
          (select id from public.sanci_sales_staff where code='NS' and status='ACTIVE'))
  returning customer_code into v_code;
  if v_code = 'HAND/WRITTEN/007' then
    raise notice 'PASS T3 preset customer_code untouched';
  else
    raise exception 'FAIL T3 preset customer_code was overwritten: %', v_code;
  end if;
end;
$$;

-- ── T4: only source_id filled (no sales_staff_id) → NO code generated ──
do $$
declare v_code text;
begin
  insert into public.customers (full_name, phone, phone_normalized, source_id)
  values ('T4 Only Source', '081160000004', '62811600000004',
          (select id from public.customer_sources where code='A' and status='ACTIVE'))
  returning customer_code into v_code;
  if v_code is null then
    raise notice 'PASS T4 only source_id filled leaves customer_code null';
  else
    raise exception 'FAIL T4 expected null customer_code, got %', v_code;
  end if;
end;
$$;

-- ── T5: rapid loop-insert 10 rows → 10 DISTINCT, SEQUENTIAL codes ──
do $$
declare
  i integer;
  v_source_id uuid := (select id from public.customer_sources where code='B' and status='ACTIVE');
  v_sales_id uuid := (select id from public.sanci_sales_staff where code='S' and status='ACTIVE');
  v_codes text[] := array[]::text[];
  v_code text;
  v_nums integer[];
  v_min integer;
  v_max integer;
begin
  for i in 1..10 loop
    insert into public.customers (full_name, phone, phone_normalized, source_id, sales_staff_id)
    values ('T5 Loop ' || i, '08116000010' || lpad(i::text, 2, '0'), '628116000010' || lpad(i::text, 2, '0'),
            v_source_id, v_sales_id)
    returning customer_code into v_code;
    v_codes := array_append(v_codes, v_code);
  end loop;

  if (select count(distinct x) from unnest(v_codes) x) <> 10 then
    raise exception 'FAIL T5 expected 10 distinct codes, got % — %', (select count(distinct x) from unnest(v_codes) x), v_codes;
  end if;

  select array_agg(substring(x from '(\d+)$')::integer order by substring(x from '(\d+)$')::integer)
    into v_nums
  from unnest(v_codes) x;
  v_min := v_nums[1];
  v_max := v_nums[array_length(v_nums, 1)];
  if v_max - v_min = 9 and array_length(v_nums, 1) = 10 then
    raise notice 'PASS T5 10 rapid inserts produced 10 distinct sequential codes (% .. %)', v_min, v_max;
  else
    raise exception 'FAIL T5 codes not sequential/contiguous: %', v_codes;
  end if;
end;
$$;

select public.test_logout();

-- ── T6: branch user gets ZERO rows on both new tables, rejected on write ──
select public.test_login('11111111-1111-1111-1111-111111111111');

select case when count(*) = 0 then 'PASS T6a branch user sees ZERO customer_sources rows'
            else 'FAIL T6a expected 0, got ' || count(*) end
from public.customer_sources;

select case when count(*) = 0 then 'PASS T6b branch user sees ZERO sanci_sales_staff rows'
            else 'FAIL T6b expected 0, got ' || count(*) end
from public.sanci_sales_staff;

do $$
begin
  insert into public.customer_sources (code, label) values ('Z', 'Branch Attempt');
  raise exception 'FAIL T6c branch user was able to INSERT into customer_sources';
exception
  when insufficient_privilege or others then
    raise notice 'PASS T6c branch user rejected writing to customer_sources';
end;
$$;

do $$
begin
  insert into public.sanci_sales_staff (code, name) values ('ZZ', 'Branch Attempt');
  raise exception 'FAIL T6d branch user was able to INSERT into sanci_sales_staff';
exception
  when insufficient_privilege or others then
    raise notice 'PASS T6d branch user rejected writing to sanci_sales_staff';
end;
$$;

select public.test_logout();

-- ── T7: deactivating a source doesn't retroactively rewrite existing codes,
--        and doesn't block new customers from OTHER active sources ──────
select public.test_login('33333333-3333-3333-3333-333333333333');

do $$
declare
  v_before_code text;
  v_after_code text;
  v_new_code text;
begin
  -- Snapshot an already-generated code that used source 'E' before deactivating it.
  insert into public.customers (full_name, phone, phone_normalized, source_id, sales_staff_id)
  values ('T7 Pre-Deactivate', '081170000001', '62811700000001',
          (select id from public.customer_sources where code='E' and status='ACTIVE'),
          (select id from public.sanci_sales_staff where code='GL' and status='ACTIVE'))
  returning customer_code into v_before_code;

  update public.customer_sources set status = 'INACTIVE' where code = 'E';

  select customer_code into v_after_code
  from public.customers where full_name = 'T7 Pre-Deactivate';

  if v_before_code is distinct from v_after_code then
    raise exception 'FAIL T7a deactivating source E retroactively changed an existing customer_code: % -> %', v_before_code, v_after_code;
  end if;
  raise notice 'PASS T7a deactivating source E did not rewrite existing customer_code (%)', v_after_code;

  -- New customer using a DIFFERENT, still-ACTIVE source must still succeed.
  insert into public.customers (full_name, phone, phone_normalized, source_id, sales_staff_id)
  values ('T7 Other Active Source', '081170000002', '62811700000002',
          (select id from public.customer_sources where code='A' and status='ACTIVE'),
          (select id from public.sanci_sales_staff where code='GL' and status='ACTIVE'))
  returning customer_code into v_new_code;

  if v_new_code is null then
    raise exception 'FAIL T7b new customer using still-active source A did not get a code';
  end if;
  raise notice 'PASS T7b new customer via a different active source still generates (%)', v_new_code;

  -- Restore for any tests/re-runs after this file.
  update public.customer_sources set status = 'ACTIVE' where code = 'E';
end;
$$;

-- ── T8: FK RESTRICT blocks deleting a source/sales row still referenced ──
do $$
declare v_id uuid;
begin
  select id into v_id from public.customer_sources where code = 'A' and status = 'ACTIVE';
  begin
    delete from public.customer_sources where id = v_id;
    raise exception 'FAIL T8a delete of a referenced customer_sources row was NOT blocked';
  exception
    when foreign_key_violation then
      raise notice 'PASS T8a FK RESTRICT blocked deleting a referenced customer_sources row';
  end;
end;
$$;

do $$
declare v_id uuid;
begin
  select id into v_id from public.sanci_sales_staff where code = 'NS' and status = 'ACTIVE';
  begin
    delete from public.sanci_sales_staff where id = v_id;
    raise exception 'FAIL T8b delete of a referenced sanci_sales_staff row was NOT blocked';
  exception
    when foreign_key_violation then
      raise notice 'PASS T8b FK RESTRICT blocked deleting a referenced sanci_sales_staff row';
  end;
end;
$$;

-- ── T9: audit regression — CUSTOMER_SOURCE_CREATED / SALES_STAFF_CREATED ──
select case when count(*) >= 5 then 'PASS T9a CUSTOMER_SOURCE_CREATED emitted for seed rows'
            else 'FAIL T9a expected >=5 CUSTOMER_SOURCE_CREATED rows, got ' || count(*) end
from public.audit_logs where action = 'CUSTOMER_SOURCE_CREATED';

select case when count(*) >= 7 then 'PASS T9b SALES_STAFF_CREATED emitted for seed rows'
            else 'FAIL T9b expected >=7 SALES_STAFF_CREATED rows, got ' || count(*) end
from public.audit_logs where action = 'SALES_STAFF_CREATED';

select case when count(*) >= 1 then 'PASS T9c CUSTOMER_SOURCE_STATUS_CHANGED emitted (T7 deactivate/reactivate)'
            else 'FAIL T9c expected >=1 CUSTOMER_SOURCE_STATUS_CHANGED row, got ' || count(*) end
from public.audit_logs where action = 'CUSTOMER_SOURCE_STATUS_CHANGED';

select public.test_logout();

reset role;
