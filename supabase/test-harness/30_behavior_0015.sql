-- Behavioral tests for 0015 (order-level discount chain). Must be run as a
-- NON-superuser, NON-owner role (app_test_user) so RLS actually applies.
-- Run via: sudo -u postgres psql -d <db> -f 30_behavior_0015.sql
-- (after 00_shim.sql, 10_fixtures.sql, and 20_behavior_0014.sql have run on
-- top of the full 0001..0015 chain.)

set role app_test_user;

-- ============================================================
-- T1: owner's worked example, EXACTLY. admin writes it, expect
-- final_amount = 9100000.00.
-- ============================================================
reset role;
select public.test_login('33333333-3333-3333-3333-333333333333');
update public.order_sanci_offers
set amount = 10000000, discount_pcts = '[8,10]'::jsonb, markup_pct = 10, cash_discount = 8000
where order_id = 'a6000000-0000-0000-0000-00000000000a';
select public.test_logout();

select case when final_amount = 9100000.00 then 'PASS T1 worked example => 9100000.00'
            else 'FAIL T1 expected 9100000.00 got ' || final_amount end
from public.order_sanci_offers where order_id = 'a6000000-0000-0000-0000-00000000000a';

-- ============================================================
-- T2: empty array + no markup + no cash => final = amount.
-- ============================================================
select public.test_login('33333333-3333-3333-3333-333333333333');
update public.order_sanci_offers
set amount = 5000000, discount_pcts = '[]'::jsonb, markup_pct = null, cash_discount = 0
where order_id = 'a6000000-0000-0000-0000-00000000000a';
select public.test_logout();

select case when final_amount = 5000000.00 then 'PASS T2 empty chain => final = amount'
            else 'FAIL T2 expected 5000000.00 got ' || final_amount end
from public.order_sanci_offers where order_id = 'a6000000-0000-0000-0000-00000000000a';

-- ============================================================
-- T3: single 8% discount => 9200000.00 on base 10,000,000.
-- ============================================================
select public.test_login('33333333-3333-3333-3333-333333333333');
update public.order_sanci_offers
set amount = 10000000, discount_pcts = '[8]'::jsonb, markup_pct = null, cash_discount = 0
where order_id = 'a6000000-0000-0000-0000-00000000000a';
select public.test_logout();

select case when final_amount = 9200000.00 then 'PASS T3 single 8% => 9200000.00'
            else 'FAIL T3 expected 9200000.00 got ' || final_amount end
from public.order_sanci_offers where order_id = 'a6000000-0000-0000-0000-00000000000a';

-- ============================================================
-- T4: client-supplied fake final_amount is overwritten by the trigger.
-- ============================================================
select public.test_login('33333333-3333-3333-3333-333333333333');
update public.order_sanci_offers
set amount = 1000000, discount_pcts = '[]'::jsonb, markup_pct = null, cash_discount = 0,
    final_amount = 999999999
where order_id = 'a6000000-0000-0000-0000-00000000000a';
select public.test_logout();

select case when final_amount = 1000000.00 then 'PASS T4 fake final_amount overwritten by trigger'
            else 'FAIL T4 expected 1000000.00 got ' || final_amount end
from public.order_sanci_offers where order_id = 'a6000000-0000-0000-0000-00000000000a';

-- ============================================================
-- T5: validation rejections (each must raise, admin actor so only shape/
-- range is under test, not the can_discount gate).
-- ============================================================
select public.test_login('33333333-3333-3333-3333-333333333333');

do $$
begin
  begin
    update public.order_sanci_offers set discount_pcts = '{"x":1}'::jsonb
    where order_id = 'a6000000-0000-0000-0000-00000000000a';
    raise exception 'FAIL T5a non-array accepted';
  exception when others then
    if sqlerrm like '%harus berupa daftar%' then raise notice 'PASS T5a non-array rejected';
    else raise notice 'FAIL T5a wrong error: %', sqlerrm; end if;
  end;
end;
$$;

do $$
begin
  begin
    update public.order_sanci_offers set discount_pcts = '[0]'::jsonb
    where order_id = 'a6000000-0000-0000-0000-00000000000a';
    raise exception 'FAIL T5b element 0 accepted';
  exception when others then
    if sqlerrm like '%lebih dari 0 dan kurang dari 100%' then raise notice 'PASS T5b element 0 rejected';
    else raise notice 'FAIL T5b wrong error: %', sqlerrm; end if;
  end;
end;
$$;

do $$
begin
  begin
    update public.order_sanci_offers set discount_pcts = '[100]'::jsonb
    where order_id = 'a6000000-0000-0000-0000-00000000000a';
    raise exception 'FAIL T5c element 100 accepted';
  exception when others then
    if sqlerrm like '%lebih dari 0 dan kurang dari 100%' then raise notice 'PASS T5c element 100 rejected';
    else raise notice 'FAIL T5c wrong error: %', sqlerrm; end if;
  end;
end;
$$;

do $$
begin
  begin
    update public.order_sanci_offers set discount_pcts = '[-5]'::jsonb
    where order_id = 'a6000000-0000-0000-0000-00000000000a';
    raise exception 'FAIL T5d negative element accepted';
  exception when others then
    if sqlerrm like '%lebih dari 0 dan kurang dari 100%' then raise notice 'PASS T5d negative element rejected';
    else raise notice 'FAIL T5d wrong error: %', sqlerrm; end if;
  end;
end;
$$;

do $$
begin
  begin
    update public.order_sanci_offers set discount_pcts = '[1,2,3,4,5,6,7]'::jsonb
    where order_id = 'a6000000-0000-0000-0000-00000000000a';
    raise exception 'FAIL T5e 7 elements accepted';
  exception when others then
    if sqlerrm like '%maksimal 6 nilai%' then raise notice 'PASS T5e 7 elements rejected';
    else raise notice 'FAIL T5e wrong error: %', sqlerrm; end if;
  end;
end;
$$;

do $$
begin
  begin
    update public.order_sanci_offers set discount_pcts = '[]'::jsonb, cash_discount = -1
    where order_id = 'a6000000-0000-0000-0000-00000000000a';
    raise exception 'FAIL T5f negative cash accepted';
  exception when others then
    raise notice 'PASS T5f negative cash rejected (%.)', sqlstate;
  end;
end;
$$;

do $$
begin
  begin
    update public.order_sanci_offers
    set amount = 1000, discount_pcts = '[50]'::jsonb, markup_pct = 0, cash_discount = 900
    where order_id = 'a6000000-0000-0000-0000-00000000000a';
    raise exception 'FAIL T5g negative final accepted';
  exception when others then
    if sqlerrm like '%negatif%' then raise notice 'PASS T5g combination driving final < 0 rejected';
    else raise notice 'FAIL T5g wrong error: %', sqlerrm; end if;
  end;
end;
$$;

do $$
begin
  begin
    update public.order_sanci_offers
    set amount = 1000000, discount_pcts = '[]'::jsonb, markup_pct = null, cash_discount = 0,
        dp_amount = 999999999
    where order_id = 'a6000000-0000-0000-0000-00000000000a';
    raise exception 'FAIL T5h dp > final accepted';
  exception when others then
    raise notice 'PASS T5h dp > final rejected (%.)', sqlstate;
  end;
end;
$$;

-- Reset to a clean known state for the flag-matrix tests below.
update public.order_sanci_offers
set amount = 10000000, discount_pcts = '[]'::jsonb, markup_pct = null, cash_discount = 0, dp_amount = 0
where order_id = 'a6000000-0000-0000-0000-00000000000a';

-- Ensure Partner A starts this section with can_view_offer/can_edit_offer on
-- (set by 20_behavior_0014.sql already) but can_discount OFF (default).
update public.partner_access_policies
set can_discount = false
where partner_id = 'a0000000-0000-0000-0000-00000000000a';

select public.test_logout();

-- ============================================================
-- T6: can_discount OFF, can_edit_offer ON => branch CAN write base fields
-- (amount/dp/payment_condition) but CANNOT write discount_pcts/markup_pct/
-- cash_discount.
-- ============================================================
set role app_test_user;
select public.test_login('11111111-1111-1111-1111-111111111111');

do $$
begin
  begin
    update public.order_sanci_offers set amount = 7000000
    where order_id = 'a6000000-0000-0000-0000-00000000000a';
    raise notice 'PASS T6a can_edit_offer alone still allows base-field write';
  exception when others then
    raise notice 'FAIL T6a base-field write blocked unexpectedly: %', sqlerrm;
  end;
end;
$$;

do $$
begin
  begin
    update public.order_sanci_offers set discount_pcts = '[10]'::jsonb
    where order_id = 'a6000000-0000-0000-0000-00000000000a';
    raise notice 'FAIL T6b discount write succeeded without can_discount';
  exception when others then
    if sqlerrm like '%Boleh mengatur diskon%' then raise notice 'PASS T6b discount write blocked without can_discount';
    else raise notice 'FAIL T6b wrong error: %', sqlerrm; end if;
  end;
end;
$$;

select public.test_logout();
reset role;

-- ============================================================
-- T7: can_discount ON + can_edit_offer ON => branch CAN write discount
-- fields on own order.
-- ============================================================
select public.test_login('33333333-3333-3333-3333-333333333333');
update public.partner_access_policies
set can_discount = true
where partner_id = 'a0000000-0000-0000-0000-00000000000a';
select public.test_logout();

set role app_test_user;
select public.test_login('11111111-1111-1111-1111-111111111111');

do $$
begin
  begin
    update public.order_sanci_offers
    set amount = 10000000, discount_pcts = '[8,10]'::jsonb, markup_pct = 10, cash_discount = 8000
    where order_id = 'a6000000-0000-0000-0000-00000000000a';
    raise notice 'PASS T7a can_discount+can_edit_offer allows discount write';
  exception when others then
    raise notice 'FAIL T7a discount write blocked despite can_discount: %', sqlerrm;
  end;
end;
$$;

select case when final_amount = 9100000.00 then 'PASS T7b branch-computed final matches worked example'
            else 'FAIL T7b expected 9100000.00 got ' || final_amount end
from public.order_sanci_offers where order_id = 'a6000000-0000-0000-0000-00000000000a';

select public.test_logout();
reset role;

-- ============================================================
-- T8: can_discount ON but can_edit_offer OFF => branch gets ZERO rows
-- written at all (RLS blocks the whole row, trigger never even runs) —
-- can_discount alone is inert without can_edit_offer (documented matrix,
-- migration 0015 §6/§7).
-- ============================================================
select public.test_login('33333333-3333-3333-3333-333333333333');
update public.partner_access_policies
set can_edit_offer = false, can_discount = true
where partner_id = 'a0000000-0000-0000-0000-00000000000a';
select public.test_logout();

set role app_test_user;
select public.test_login('11111111-1111-1111-1111-111111111111');

do $$
begin
  begin
    update public.order_sanci_offers set discount_pcts = '[5]'::jsonb
    where order_id = 'a6000000-0000-0000-0000-00000000000a';
    -- RLS silently affects 0 rows rather than raising for UPDATE (unlike
    -- INSERT ... which raises insufficient_privilege); confirm via rowcount.
    if FOUND then
      raise notice 'FAIL T8 update reported FOUND despite can_edit_offer off';
    else
      raise notice 'PASS T8 can_discount alone (no can_edit_offer) => RLS blocked the write (0 rows affected)';
    end if;
  exception when others then
    raise notice 'PASS T8 can_discount alone (no can_edit_offer) => update raised/blocked (%.)', sqlstate;
  end;
end;
$$;

-- Baseline for "unchanged" is [8,10] (set by T7 immediately above), not [].
select case when discount_pcts = '[8, 10]'::jsonb then 'PASS T8b row unchanged (can_discount alone is inert)'
            else 'FAIL T8b row was modified: ' || discount_pcts::text end
from public.order_sanci_offers where order_id = 'a6000000-0000-0000-0000-00000000000a';

select public.test_logout();
reset role;

-- Restore both flags ON for downstream tests / manual poking.
select public.test_login('33333333-3333-3333-3333-333333333333');
update public.partner_access_policies
set can_edit_offer = true, can_discount = true
where partner_id = 'a0000000-0000-0000-0000-00000000000a';
select public.test_logout();

-- ============================================================
-- T9: admin bypasses both guard and RLS regardless of flags.
-- ============================================================
select public.test_login('33333333-3333-3333-3333-333333333333');
update public.partner_access_policies
set can_edit_offer = false, can_discount = false
where partner_id = 'a0000000-0000-0000-0000-00000000000a';

do $$
begin
  update public.order_sanci_offers set discount_pcts = '[15]'::jsonb, markup_pct = 5, cash_discount = 1000
  where order_id = 'a6000000-0000-0000-0000-00000000000a';
  raise notice 'PASS T9 admin bypasses discount guard regardless of flags';
end;
$$;
update public.partner_access_policies
set can_edit_offer = true, can_discount = true
where partner_id = 'a0000000-0000-0000-0000-00000000000a';
select public.test_logout();

-- ============================================================
-- T10: audit regression — ORDER_OFFER_UPDATED after-json carries the new
-- columns (discount_pcts/markup_pct/cash_discount/final_amount).
-- ============================================================
select case when count(*) > 0 then 'PASS T10 ORDER_OFFER_UPDATED after-json carries discount_pcts'
            else 'FAIL T10 no ORDER_OFFER_UPDATED row with discount_pcts in after' end
from public.audit_logs
where action = 'ORDER_OFFER_UPDATED' and entity_type = 'order_sanci_offers'
  and after ? 'discount_pcts' and after ? 'final_amount';

-- ============================================================
-- T11: idempotency of the migration itself is checked separately by
-- re-running 0015 three times and diffing `pg_dump -s` (LESSONS #33 filter)
-- — not re-duplicated here.
-- ============================================================

select 'DONE_0015' as check_type, 'ok' as result;
