-- Behavioral tests for 0020 (partner_orders.customer_po). Run AFTER
-- 20..70_behavior_*.sql on the full chain 0001→…→0020 + 00_shim + 10_fixtures.
-- Must be run as a NON-superuser, NON-owner role (app_test_user) for the
-- branch-user sections so RLS + non-admin trigger branches actually apply —
-- same discipline as 20_behavior_0014.sql.
--
-- Covers exactly the behavior claims of migration 0020's header:
--   T1  branch can SET customer_po on its own editable (REGISTERED) order
--   T2  branch can EDIT (change) it afterwards
--   T2b another partner's branch cannot touch it (0 rows, silent RLS)
--   T3  after the order is CANCELLED, branch edit is REJECTED (raise from
--       trg_order_status_flow 0005 — whole-row freeze, same as
--       shipping_address; an exception, NOT a silent 0-row no-op, because
--       RLS o_partner_update has no status filter: the row IS selected,
--       then the BEFORE trigger raises)
--   T4  admin CAN still edit customer_po on the CANCELLED order (v_admin
--       branch of fn_guard_order_status_flow)
--   T5  the value is audited: ORDER_UPDATED rows carry customer_po in
--       before/after jsonb (full-row audit via to_jsonb — the reason 0020
--       does NOT redefine fn_audit_row)
--
-- State discipline: the fixture order a6000000-… is expected REGISTERED when
-- this file starts (70_behavior_0019 does not touch it; 20_behavior_0014
-- re-opened it). This file re-opens it at the end so re-runs and later
-- suites see the same starting state.

-- Safety: make sure the fixture order is REGISTERED before starting (admin).
select public.test_login('33333333-3333-3333-3333-333333333333');
update public.partner_orders set status = 'REGISTERED'
where id = 'a6000000-0000-0000-0000-00000000000a' and status <> 'REGISTERED';
select public.test_logout();

-- ============================================================
-- T1: branch A sets customer_po on own REGISTERED order.
-- ============================================================
set role app_test_user;
select public.test_login('11111111-1111-1111-1111-111111111111');
update public.partner_orders set customer_po = 'PO/GH/2026/0812'
where id = 'a6000000-0000-0000-0000-00000000000a';
select case when customer_po = 'PO/GH/2026/0812' then 'PASS T1 branch can set customer_po on own editable order'
            else 'FAIL T1 customer_po = ' || coalesce(customer_po, 'NULL') end
from public.partner_orders where id = 'a6000000-0000-0000-0000-00000000000a';

-- ============================================================
-- T2: branch A edits (changes) it — not write-once.
-- ============================================================
update public.partner_orders set customer_po = 'PO/GH/2026/0812-REV1'
where id = 'a6000000-0000-0000-0000-00000000000a';
select case when customer_po = 'PO/GH/2026/0812-REV1' then 'PASS T2 branch can change customer_po afterwards'
            else 'FAIL T2 customer_po = ' || coalesce(customer_po, 'NULL') end
from public.partner_orders where id = 'a6000000-0000-0000-0000-00000000000a';
select public.test_logout();

-- T2b: branch B (other partner) cannot touch it — silent 0 rows (RLS), and
-- the value stays what branch A wrote.
select public.test_login('22222222-2222-2222-2222-222222222222');
with upd as (
  update public.partner_orders set customer_po = 'HACKED'
  where id = 'a6000000-0000-0000-0000-00000000000a'
  returning id
)
select case when count(*) = 0 then 'PASS T2b other-partner branch blocked (0 rows)'
            else 'FAIL T2b other branch updated ' || count(*) || ' row(s)' end
from upd;
select public.test_logout();
reset role;

select public.test_login('33333333-3333-3333-3333-333333333333');
select case when customer_po = 'PO/GH/2026/0812-REV1' then 'PASS T2c value unchanged by blocked update'
            else 'FAIL T2c customer_po is now: ' || coalesce(customer_po, 'NULL') end
from public.partner_orders where id = 'a6000000-0000-0000-0000-00000000000a';
select public.test_logout();

-- ============================================================
-- T3: cancel the order (admin), then branch edit must be REJECTED.
-- ============================================================
select public.test_login('33333333-3333-3333-3333-333333333333');
update public.partner_orders set status = 'CANCELLED', cancellation_reason = 'test cancel 0020'
where id = 'a6000000-0000-0000-0000-00000000000a';
select public.test_logout();

set role app_test_user;
select public.test_login('11111111-1111-1111-1111-111111111111');
do $$
begin
  begin
    update public.partner_orders set customer_po = 'PO-AFTER-CANCEL'
    where id = 'a6000000-0000-0000-0000-00000000000a';
    raise exception 'FAIL T3 branch edited customer_po on a CANCELLED order';
  exception when raise_exception then
    -- the raise we EXPECT is the one from trg_order_status_flow ("sudah
    -- dibatalkan"); our own FAIL marker above is also raise_exception, so
    -- tell them apart by message content.
    if sqlerrm like 'FAIL T3%' then
      raise;
    end if;
    raise notice 'PASS T3 branch edit on cancelled order rejected: %', sqlerrm;
  end;
end;
$$;
select public.test_logout();
reset role;

-- value must still be the pre-cancel one
select public.test_login('33333333-3333-3333-3333-333333333333');
select case when customer_po = 'PO/GH/2026/0812-REV1' then 'PASS T3b value unchanged after rejected edit'
            else 'FAIL T3b customer_po is now: ' || coalesce(customer_po, 'NULL') end
from public.partner_orders where id = 'a6000000-0000-0000-0000-00000000000a';

-- ============================================================
-- T4: admin CAN edit customer_po on the CANCELLED order.
-- ============================================================
update public.partner_orders set customer_po = 'PO-ADMIN-FIX'
where id = 'a6000000-0000-0000-0000-00000000000a';
select case when customer_po = 'PO-ADMIN-FIX' then 'PASS T4 admin can edit customer_po on cancelled order'
            else 'FAIL T4 customer_po = ' || coalesce(customer_po, 'NULL') end
from public.partner_orders where id = 'a6000000-0000-0000-0000-00000000000a';

-- re-open the order so re-runs / later suites start from REGISTERED again
update public.partner_orders set status = 'REGISTERED'
where id = 'a6000000-0000-0000-0000-00000000000a';

-- ============================================================
-- T5: audit — customer_po values flow into audit_logs before/after WITHOUT
-- fn_audit_row being redefined (read as admin: al_admin_read 0001).
-- ============================================================
select case when count(*) >= 1 then 'PASS T5a ORDER_UPDATED audit row with customer_po in after jsonb: ' || count(*)
            else 'FAIL T5a no ORDER_UPDATED audit row carries customer_po' end
from audit_logs
where action = 'ORDER_UPDATED' and entity_type = 'partner_orders'
  and (after ->> 'customer_po') is not null;

-- the branch edit T2 specifically: before=REV0 value, after=REV1 value —
-- proves the DIFF (not just presence) is reconstructable for the Activity
-- screen (audit-format.ts formatAuditDiff reads exactly these two jsonb).
select case when count(*) >= 1 then 'PASS T5b diff row found (before PO/GH/2026/0812 -> after ...REV1)'
            else 'FAIL T5b expected an ORDER_UPDATED row with that exact before/after pair' end
from audit_logs
where action = 'ORDER_UPDATED' and entity_type = 'partner_orders'
  and before ->> 'customer_po' = 'PO/GH/2026/0812'
  and after  ->> 'customer_po' = 'PO/GH/2026/0812-REV1';

-- and that branch-authored edit is attributed to the branch user, not admin
select case when actor_role = 'PARTNER_USER' then 'PASS T5c branch edit audited as PARTNER_USER'
            else 'FAIL T5c actor_role = ' || coalesce(actor_role, 'NULL') end
from audit_logs
where action = 'ORDER_UPDATED' and entity_type = 'partner_orders'
  and after ->> 'customer_po' = 'PO/GH/2026/0812-REV1'
order by id desc limit 1;
select public.test_logout();

-- ============================================================
-- T6: anon (no session) sees nothing (column rides existing row policies).
-- ============================================================
set role app_test_user;
select public.test_logout();
select case when count(*) = 0 then 'PASS T6 anon: 0 partner_orders rows (customer_po unreachable)'
            else 'FAIL T6 anon saw ' || count(*) end
from public.partner_orders;
reset role;
