-- Behavioral tests for 0019 (branch-created customer_code auto-generation —
-- partner_staff.code, partner_customer_counters, fn_next_customer_seq,
-- fn_check_customer_staff_ref, extended fn_set_customer_code). Must be run
-- as a NON-superuser, NON-owner role (app_test_user) so RLS actually
-- applies EXCEPT where explicitly noted (T3 runs as superuser on purpose —
-- see its own comment). Run via:
--   sudo -u postgres psql -d <db> -f 70_behavior_0019.sql
-- (after 00_shim.sql, 10_fixtures.sql, 20/30/40/50/60_behavior_*.sql and
-- migrations 0001..0019 have all run on top of the full chain.)
--
-- Fixture reminder (10_fixtures.sql): Partner A (code 'PA', id a0000000...),
-- Branch A1 (code 'A1', id a1000000..., partner A), staff 'Sales A'
-- (id a3000000..., partner A, active assignment to Branch A1). Partner B
-- (code 'PB'), Branch B1 (code 'B1'). Branch users: 11111111 (Branch A1),
-- 22222222 (Branch B1). Admin: 33333333.

set role app_test_user;
select public.test_login('33333333-3333-3333-3333-333333333333');

-- ── Setup: give the fixture staff a code, add a second staff for Partner B ──
update public.partner_staff set code = 'SA' where id = 'a3000000-0000-0000-0000-00000000000a';

insert into public.partner_staff (id, partner_id, full_name, status) values
  ('b3000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-00000000000b', 'Sales B', 'ACTIVE')
on conflict (id) do nothing;
insert into public.partner_staff_assignments (staff_id, branch_id, role) values
  ('b3000000-0000-0000-0000-00000000000b', 'b1000000-0000-0000-0000-00000000000b', 'Sales')
on conflict do nothing;
update public.partner_staff set code = 'SB' where id = 'b3000000-0000-0000-0000-00000000000b';

-- A second, code-less staff at Branch A1 for T4/T5.
insert into public.partner_staff (id, partner_id, full_name, status) values
  ('a3000000-0000-0000-0000-00000000000c', 'a0000000-0000-0000-0000-00000000000a', 'No Code Staff', 'ACTIVE')
on conflict (id) do nothing;
insert into public.partner_staff_assignments (staff_id, branch_id, role) values
  ('a3000000-0000-0000-0000-00000000000c', 'a1000000-0000-0000-0000-00000000000a', 'Sales')
on conflict do nothing;

select case when count(*) = 2 then 'PASS T0 both staff codes set (SA/SB)'
            else 'FAIL T0 expected 2 coded staff, got ' || count(*) end
from public.partner_staff where code in ('SA', 'SB');

-- ── T1: partner_staff.code uniqueness scoped to (partner_id, code) ──────
-- Same code at Partner A (staff already has 'SA') rejected for a SECOND
-- Partner A staff; the SAME code 'SA' reused at Partner B (different
-- partner) must succeed — proves the scope is partner_id, not global.
do $$
begin
  insert into public.partner_staff (partner_id, full_name, code, status)
  values ('a0000000-0000-0000-0000-00000000000a', 'Duplicate SA', 'SA', 'ACTIVE');
  raise exception 'FAIL T1a duplicate code within same partner was accepted';
exception
  when unique_violation then
    raise notice 'PASS T1a duplicate (partner_id, code) rejected by unique index';
end;
$$;

do $$
declare v_id uuid;
begin
  insert into public.partner_staff (partner_id, full_name, code, status)
  values ('b0000000-0000-0000-0000-00000000000b', 'Reused SA at Partner B', 'SA', 'ACTIVE')
  returning id into v_id;
  if v_id is not null then
    raise notice 'PASS T1b same code SA at a DIFFERENT partner succeeded (scope is partner_id, not global)';
  end if;
  delete from public.partner_staff where id = v_id; -- cleanup, not needed elsewhere
exception
  when unique_violation then
    raise exception 'FAIL T1b code reuse across DIFFERENT partners was rejected — scope should be per-partner';
end;
$$;

do $$
begin
  insert into public.partner_staff (partner_id, full_name, code, status)
  values ('a0000000-0000-0000-0000-00000000000a', 'Bad Format', 'sa-lower', 'ACTIVE');
  raise exception 'FAIL T1c lowercase/hyphenated code was accepted';
exception
  when check_violation then
    raise notice 'PASS T1c lowercase/hyphenated staff code rejected by format CHECK';
end;
$$;

select public.test_logout();

-- ── T2: literal generated code for a REAL branch-created scenario ───────
-- Deterministic regardless of what else consumed the counter: read
-- last_seq for (Branch A1, current WIB year) BEFORE this insert, then
-- assert the generated suffix is PRECISELY that value + 1 — mirrors the
-- rigor of 0018's own T2 (a real generated string compared to a real
-- expected string, not just "the trigger exists").
select public.test_login('11111111-1111-1111-1111-111111111111');

do $$
declare
  v_before integer;
  v_code text;
  v_expected text;
  v_yy text := to_char(now() at time zone 'Asia/Jakarta', 'YY');
begin
  select coalesce(last_seq, 0) into v_before
  from public.partner_customer_counters
  where branch_id = 'a1000000-0000-0000-0000-00000000000a'
    and seq_year = extract(year from (now() at time zone 'Asia/Jakarta'))::integer;
  v_before := coalesce(v_before, 0);

  insert into public.customers
    (full_name, phone, phone_normalized, created_via_partner_id, created_via_branch_id, attributed_staff_id)
  values ('T2 Literal Gen Branch', '081190000002', '62811900000002',
          'a0000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a',
          'a3000000-0000-0000-0000-00000000000a')
  returning customer_code into v_code;

  v_expected := 'PA-A1-SA/' || v_yy || '/' || lpad((v_before + 1)::text, 3, '0');
  if v_code = v_expected then
    raise notice 'PASS T2 generated exactly %', v_code;
  else
    raise exception 'FAIL T2 expected %, got %', v_expected, v_code;
  end if;
end;
$$;

-- ── T4: attributed staff exists but has NO code → customer_code stays NULL, no error ──
do $$
declare v_code text;
begin
  insert into public.customers
    (full_name, phone, phone_normalized, created_via_partner_id, created_via_branch_id, attributed_staff_id)
  values ('T4 No Staff Code', '081190000004', '62811900000004',
          'a0000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a',
          'a3000000-0000-0000-0000-00000000000c')
  returning customer_code into v_code;
  if v_code is null then
    raise notice 'PASS T4 staff without a code leaves customer_code NULL (no error)';
  else
    raise exception 'FAIL T4 expected NULL customer_code, got %', v_code;
  end if;
end;
$$;

-- ── T5: no attributed_staff_id at all → customer_code stays NULL, no error ──
do $$
declare v_code text;
begin
  insert into public.customers
    (full_name, phone, phone_normalized, created_via_partner_id, created_via_branch_id)
  values ('T5 No Staff At All', '081190000005', '62811900000005',
          'a0000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a')
  returning customer_code into v_code;
  if v_code is null then
    raise notice 'PASS T5 branch customer with no attributed staff leaves customer_code NULL (no error)';
  else
    raise exception 'FAIL T5 expected NULL customer_code, got %', v_code;
  end if;
end;
$$;

-- ── T6: 0018 and 0019 paths NEVER both fire on one row ───────────────────
-- T6a: branch-created row (this test's own path) must NOT carry any
-- 0018-shaped fields, and its generated code must NOT match 0018's
-- SHAPE (letters/YY-letters/NNN — no leading partner-branch-staff dashes).
select case
  when customer_code ~ '^PA-A1-SA/[0-9]{2}/[0-9]{3,}$'
   and customer_code !~ '^[A-Z]+/[0-9]{2}-[A-Z]+/[0-9]{3,}$'
  then 'PASS T6a branch-created row (T2) matches ONLY the 0019 shape, never the 0018 shape'
  else 'FAIL T6a T2 row shape mismatch: ' || customer_code
end
from public.customers where full_name = 'T2 Literal Gen Branch';

select public.test_logout();

-- T6b: a SANCI-direct row (admin, source_id+sales_staff_id, created_via_*
-- both NULL) must generate ONLY the 0018 shape, and never touch the
-- branch-path logic (created_via_* stay NULL — the branch path's very
-- first condition never matches).
select public.test_login('33333333-3333-3333-3333-333333333333');

do $$
declare
  v_code text;
  v_created_via_partner uuid;
  v_created_via_branch uuid;
begin
  insert into public.customers
    (full_name, phone, phone_normalized, source_id, sales_staff_id)
  values ('T6b Sanci Direct', '081190000006', '62811900000006',
          (select id from public.customer_sources where code = 'A' and status = 'ACTIVE'),
          (select id from public.sanci_sales_staff where code = 'NS' and status = 'ACTIVE'))
  returning customer_code, created_via_partner_id, created_via_branch_id
    into v_code, v_created_via_partner, v_created_via_branch;

  if v_created_via_partner is not null or v_created_via_branch is not null then
    raise exception 'FAIL T6b SANCI-direct row unexpectedly has created_via_* set (%,%)', v_created_via_partner, v_created_via_branch;
  end if;
  if v_code ~ '^[A-Z]+/[0-9]{2}-[A-Z]+/[0-9]{3,}$' and v_code !~ '-.*-.*/' then
    raise notice 'PASS T6b SANCI-direct row matches ONLY the 0018 shape (%), branch path never ran', v_code;
  else
    raise exception 'FAIL T6b unexpected shape: %', v_code;
  end if;
end;
$$;

-- ── T7: ownership guard — attributed_staff_id from a DIFFERENT partner rejected ──
do $$
begin
  insert into public.customers
    (full_name, phone, phone_normalized, created_via_partner_id, created_via_branch_id, attributed_staff_id)
  values ('T7 Cross Partner Staff', '081190000007', '62811900000007',
          'a0000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a',
          'b3000000-0000-0000-0000-00000000000b'); -- Sales B, belongs to Partner B not Partner A
  raise exception 'FAIL T7 cross-partner attributed_staff_id was accepted';
exception
  when others then
    if sqlerrm like '%bukan milik partner%' then
      raise notice 'PASS T7 fn_check_customer_staff_ref rejected cross-partner attributed_staff_id';
    else
      raise exception 'FAIL T7 unexpected error: %', sqlerrm;
    end if;
end;
$$;

-- ── T8: FK RESTRICT blocks deleting a staff row still referenced ────────
do $$
begin
  begin
    delete from public.partner_staff where id = 'a3000000-0000-0000-0000-00000000000a';
    raise exception 'FAIL T8 delete of a referenced partner_staff row was NOT blocked';
  exception
    when foreign_key_violation then
      raise notice 'PASS T8 FK RESTRICT blocked deleting a partner_staff row referenced by attributed_staff_id';
  end;
end;
$$;

select public.test_logout();

-- ── T3: per-branch-per-year counter — reset at year boundary, no cross-
-- branch collision. Calls fn_next_customer_seq DIRECTLY as the superuser
-- session (before `set role app_test_user`'s EXECUTE-revoked context would
-- reject it — see NEXT_SEQ_EXEC_* = 0 in migration 0019's own verification
-- block, re-proven behaviorally in T11 below) so the counter PARTITIONING
-- logic itself is tested in isolation from the trigger's own date/timezone
-- computation (which is a single `extract(year from ...)` call, low risk
-- and not the thing this test needs to prove).
reset role;
do $$
declare
  v_a_2026_1 integer; v_a_2026_2 integer; v_a_2027_1 integer; v_b_2026_1 integer;
begin
  v_a_2026_1 := public.fn_next_customer_seq('a1000000-0000-0000-0000-00000000000a', 2026);
  v_a_2026_2 := public.fn_next_customer_seq('a1000000-0000-0000-0000-00000000000a', 2026);
  v_a_2027_1 := public.fn_next_customer_seq('a1000000-0000-0000-0000-00000000000a', 2027);
  v_b_2026_1 := public.fn_next_customer_seq('b1000000-0000-0000-0000-00000000000b', 2026);

  if v_a_2026_2 <> v_a_2026_1 + 1 then
    raise exception 'FAIL T3a same branch/year did not increment sequentially: % then %', v_a_2026_1, v_a_2026_2;
  end if;
  raise notice 'PASS T3a Branch A1/2026 increments sequentially (% -> %)', v_a_2026_1, v_a_2026_2;

  if v_a_2027_1 <> 1 then
    raise exception 'FAIL T3b Branch A1/2027 did not reset to 1, got %', v_a_2027_1;
  end if;
  raise notice 'PASS T3b Branch A1/2027 reset to 1 (new year, same branch) despite A1/2026 already at %', v_a_2026_2;

  if v_b_2026_1 <> 1 then
    raise exception 'FAIL T3c Branch B1/2026 did not start at 1 independently of Branch A1/2026 (%), got %', v_a_2026_2, v_b_2026_1;
  end if;
  raise notice 'PASS T3c Branch B1/2026 starts at 1, independent of Branch A1/2026 (no cross-branch collision)';
end;
$$;

-- ── T11: branch/anon/authenticated CANNOT call fn_next_customer_seq directly ──
-- (LESSONS #26 — same P1 class fn_next_order_seq had before 0007 closed it;
-- closed here from birth, not retrofitted.) Also confirms the counter
-- table itself is 0-policy closed (mirrors 0018 T6-style zero-access proof).
set role app_test_user;
select public.test_login('11111111-1111-1111-1111-111111111111');

do $$
begin
  perform public.fn_next_customer_seq('a1000000-0000-0000-0000-00000000000a', 2026);
  raise exception 'FAIL T11a branch user was able to call fn_next_customer_seq directly';
exception
  when insufficient_privilege then
    raise notice 'PASS T11a branch user rejected calling fn_next_customer_seq directly';
end;
$$;

select case when count(*) = 0 then 'PASS T11b branch user sees ZERO partner_customer_counters rows'
            else 'FAIL T11b expected 0, got ' || count(*) end
from public.partner_customer_counters;

select public.test_logout();
reset role;

-- ── T9: audit regression — STAFF_UPDATED still fires for code changes,
-- CUSTOMER_CREATED still fires for branch-created rows (no new prefix
-- needed — both tables were already mapped by fn_audit_row since 0001/0004,
-- proving the "fn_audit_row unchanged" claim behaviorally, not just by
-- re-reading its prosrc as migration 0019's own verification block does).
select case when count(*) >= 1 then 'PASS T9a STAFF_UPDATED emitted for the code-setting UPDATE in this file'
            else 'FAIL T9a expected >=1 STAFF_UPDATED row, got ' || count(*) end
from public.audit_logs where action = 'STAFF_UPDATED';

select case when count(*) >= 1 then 'PASS T9b CUSTOMER_CREATED emitted for branch-created rows in this file'
            else 'FAIL T9b expected >=1 CUSTOMER_CREATED row, got ' || count(*) end
from public.audit_logs
where action = 'CUSTOMER_CREATED' and entity_id in (
  select id::text from public.customers where full_name in ('T2 Literal Gen Branch', 'T4 No Staff Code', 'T5 No Staff At All')
);

reset role;
