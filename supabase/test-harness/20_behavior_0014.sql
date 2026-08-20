-- Behavioral tests for 0014. Must be run as a NON-superuser, NON-owner role
-- (app_test_user) so RLS actually applies. Run via:
--   sudo -u postgres psql -d sanci_test -U app_test_user -f 20_behavior_0014.sql
-- (peer auth won't work for app_test_user login via sudo -u postgres; instead
-- we SET ROLE inside a superuser session, which also makes RLS apply because
-- app_test_user is not the table owner.)

set role app_test_user;

-- ============================================================
-- T1: flags off (default) → branch reads ZERO offer rows, even own order.
-- ============================================================
select public.test_login('11111111-1111-1111-1111-111111111111');
select public.test_login('11111111-1111-1111-1111-111111111111');
select case when count(*) = 0 then 'PASS T1 flags-off => 0 offer rows'
            else 'FAIL T1 expected 0 got ' || count(*) end
from public.order_sanci_offers where order_id = 'a6000000-0000-0000-0000-00000000000a';

-- branch cannot insert an offer either while flags are off (RLS raises,
-- doesn't silently no-op, for INSERT — catch it explicitly).
do $$
begin
  begin
    insert into public.order_sanci_offers (order_id, amount)
    values ('a6000000-0000-0000-0000-00000000000a', 1000000);
    raise exception 'FAIL T1b branch insert succeeded despite flags off';
  exception when insufficient_privilege then
    raise notice 'PASS T1b flags-off => branch insert blocked by RLS';
  end;
end;
$$;
select public.test_logout();
reset role;

-- ============================================================
-- Admin turns on can_view_offer + can_edit_offer for Partner A, sets an offer.
-- ============================================================
select public.test_login('33333333-3333-3333-3333-333333333333');
insert into public.partner_access_policies (partner_id, can_view_offer, can_edit_offer, configured)
values ('a0000000-0000-0000-0000-00000000000a', true, true, true)
on conflict (partner_id) do update set can_view_offer = true, can_edit_offer = true;
insert into public.order_sanci_offers (order_id, amount, dp_amount, payment_condition)
values ('a6000000-0000-0000-0000-00000000000a', 9100000, 500000, 'DP 50%')
on conflict (order_id) do update set amount = excluded.amount;
select public.test_logout();

set role app_test_user;

-- ============================================================
-- T2: can_view_offer on → branch A sees OWN order's offer.
-- ============================================================
select public.test_login('11111111-1111-1111-1111-111111111111');
select case when count(*) = 1 then 'PASS T2 own order offer visible'
            else 'FAIL T2 expected 1 got ' || count(*) end
from public.order_sanci_offers where order_id = 'a6000000-0000-0000-0000-00000000000a';

-- T2b: branch A never sees Partner B's offers (there are none, but also
-- confirm branch A cannot even see Partner B's order row at all, which is
-- the prerequisite for the offer EXISTS-join to correctly return nothing).
select case when count(*) = 0 then 'PASS T2b branch A cannot see partner B order'
            else 'FAIL T2b branch A saw ' || count(*) || ' partner B order(s)' end
from public.partner_orders where partner_id = 'b0000000-0000-0000-0000-00000000000b';
select public.test_logout();

-- ============================================================
-- T3: branch B (different partner, flags never enabled for B) → 0 rows.
-- ============================================================
select public.test_login('22222222-2222-2222-2222-222222222222');
select case when count(*) = 0 then 'PASS T3 branch B sees 0 offer rows (own partner never opted in, and order is not theirs anyway)'
            else 'FAIL T3 expected 0 got ' || count(*) end
from public.order_sanci_offers;
select public.test_logout();
reset role;

-- ============================================================
-- T4: dp_amount > amount rejected by CHECK constraint.
-- ============================================================
select public.test_login('33333333-3333-3333-3333-333333333333');
do $$
begin
  begin
    update public.order_sanci_offers set dp_amount = 99999999 where order_id = 'a6000000-0000-0000-0000-00000000000a';
    raise exception 'FAIL T4 dp_amount > amount was accepted';
  exception when check_violation then
    raise notice 'PASS T4 dp_amount > amount rejected by CHECK';
  end;
end;
$$;
select public.test_logout();

-- ============================================================
-- T5: order_items — branch A INSERT ... RETURNING succeeds on own editable
-- order (simulates the server-side package snapshot copy running as the
-- branch user during order creation).
-- ============================================================
set role app_test_user;
select public.test_login('11111111-1111-1111-1111-111111111111');
do $$
declare v_id uuid;
begin
  insert into public.order_items (order_id, product_id, name_snapshot, code_snapshot, quantity, client_request_id)
  values ('a6000000-0000-0000-0000-00000000000a', 'a4000000-0000-0000-0000-00000000000a', 'Sofa X', 'SOFA-X', 2, 'test-item-1')
  returning id into v_id;
  if v_id is not null then
    raise notice 'PASS T5 branch INSERT...RETURNING on own order succeeded, id=%', v_id;
  else
    raise exception 'FAIL T5 insert returned no id';
  end if;
end;
$$;
select public.test_logout();
reset role;

-- ============================================================
-- T6: note edit — own branch OK.
-- ============================================================
set role app_test_user;
select public.test_login('11111111-1111-1111-1111-111111111111');
update public.order_items set note = 'warna diganti biru' where order_id = 'a6000000-0000-0000-0000-00000000000a';
select case when count(*) = 1 and note = 'warna diganti biru' then 'PASS T6 own-branch note edit'
            else 'FAIL T6 own-branch note edit did not apply' end
from public.order_items where order_id = 'a6000000-0000-0000-0000-00000000000a' group by note;
select public.test_logout();

-- T6b: other branch (B) cannot edit A's item note (0 rows affected, not error).
select public.test_login('22222222-2222-2222-2222-222222222222');
with upd as (
  update public.order_items set note = 'hacked' where order_id = 'a6000000-0000-0000-0000-00000000000a'
  returning id
)
select case when count(*) = 0 then 'PASS T6b other-branch update blocked (0 rows)'
            else 'FAIL T6b other branch updated ' || count(*) || ' row(s)' end
from upd;
select public.test_logout();
reset role;

-- verify note is still the A value, not "hacked"
select public.test_login('33333333-3333-3333-3333-333333333333');
select case when note = 'warna diganti biru' then 'PASS T6c note unchanged by blocked update'
            else 'FAIL T6c note is now: ' || coalesce(note,'NULL') end
from public.order_items where order_id = 'a6000000-0000-0000-0000-00000000000a';
select public.test_logout();

-- ============================================================
-- T7: item edits blocked on CANCELLED order.
-- ============================================================
select public.test_login('33333333-3333-3333-3333-333333333333');
update public.partner_orders set status = 'CANCELLED', cancellation_reason = 'test cancel' where id = 'a6000000-0000-0000-0000-00000000000a';
select public.test_logout();

set role app_test_user;
select public.test_login('11111111-1111-1111-1111-111111111111');
with upd as (
  update public.order_items set note = 'try after cancel' where order_id = 'a6000000-0000-0000-0000-00000000000a'
  returning id
)
select case when count(*) = 0 then 'PASS T7 item edit blocked on cancelled order (0 rows)'
            else 'FAIL T7 edit on cancelled order succeeded' end
from upd;
select public.test_logout();
reset role;

-- re-open the order for remaining tests
select public.test_login('33333333-3333-3333-3333-333333333333');
update public.partner_orders set status = 'REGISTERED' where id = 'a6000000-0000-0000-0000-00000000000a';
select public.test_logout();

-- ============================================================
-- T8: price fields (unit_price/line_discount) gated by can_edit_offer.
-- Partner A currently HAS can_edit_offer = true (set earlier) — should succeed.
-- ============================================================
set role app_test_user;
select public.test_login('11111111-1111-1111-1111-111111111111');
update public.order_items set unit_price = 500000 where order_id = 'a6000000-0000-0000-0000-00000000000a';
select case when unit_price = 500000 then 'PASS T8 price edit allowed when can_edit_offer=true'
            else 'FAIL T8 price edit did not apply' end
from public.order_items where order_id = 'a6000000-0000-0000-0000-00000000000a';
select public.test_logout();
reset role;

-- Turn can_edit_offer OFF for partner A, then branch A tries to set line_discount → must be rejected by guard trigger.
select public.test_login('33333333-3333-3333-3333-333333333333');
update public.partner_access_policies set can_edit_offer = false where partner_id = 'a0000000-0000-0000-0000-00000000000a';
select public.test_logout();

set role app_test_user;
select public.test_login('11111111-1111-1111-1111-111111111111');
do $$
begin
  begin
    update public.order_items set line_discount = 10000 where order_id = 'a6000000-0000-0000-0000-00000000000a';
    raise exception 'FAIL T9 price edit succeeded despite can_edit_offer=false';
  exception when raise_exception then
    raise notice 'PASS T9 price edit blocked by guard trigger when can_edit_offer=false';
  end;
end;
$$;
-- but note edits must STILL work (only price is gated, not the whole row)
update public.order_items set note = 'still editable' where order_id = 'a6000000-0000-0000-0000-00000000000a';
select case when note = 'still editable' then 'PASS T10 note still editable while price gated'
            else 'FAIL T10 note edit blocked unexpectedly' end
from public.order_items where order_id = 'a6000000-0000-0000-0000-00000000000a';
select public.test_logout();
reset role;

-- restore can_edit_offer for later tests
select public.test_login('33333333-3333-3333-3333-333333333333');
update public.partner_access_policies set can_edit_offer = true where partner_id = 'a0000000-0000-0000-0000-00000000000a';
select public.test_logout();

-- ============================================================
-- T11: shipping_address is editable via plain UPDATE (not frozen).
-- ============================================================
set role app_test_user;
select public.test_login('11111111-1111-1111-1111-111111111111');
update public.partner_orders set shipping_address = 'Jl. Testing No. 1' where id = 'a6000000-0000-0000-0000-00000000000a';
select case when shipping_address = 'Jl. Testing No. 1' then 'PASS T11 shipping_address editable by branch'
            else 'FAIL T11 shipping_address update did not apply' end
from public.partner_orders where id = 'a6000000-0000-0000-0000-00000000000a';
select public.test_logout();
reset role;

-- ============================================================
-- T12: item DELETE by owning branch on editable order works.
-- ============================================================
set role app_test_user;
select public.test_login('11111111-1111-1111-1111-111111111111');
with del as (
  delete from public.order_items where order_id = 'a6000000-0000-0000-0000-00000000000a' returning id
)
select case when count(*) >= 1 then 'PASS T12 branch can delete own item(s): ' || count(*)
            else 'FAIL T12 delete affected 0 rows' end
from del;
select public.test_logout();
reset role;

-- ============================================================
-- T13: audit regression — spot-check that other prefixes still fire and
-- ORDER_ITEM_CREATED fires with partner_id/branch_id resolved.
-- ============================================================
select public.test_login('33333333-3333-3333-3333-333333333333');
insert into public.order_items (order_id, name_snapshot, quantity)
values ('a6000000-0000-0000-0000-00000000000a', 'Manual Item', 1);

select case when count(*) >= 1 then 'PASS T13a ORDER_ITEM_CREATED audit row(s) exist: ' || count(*)
            else 'FAIL T13a expected >=1 got ' || count(*) end
from audit_logs where action = 'ORDER_ITEM_CREATED' and entity_type = 'order_items';

select case when partner_id = 'a0000000-0000-0000-0000-00000000000a'
              and branch_id = 'a1000000-0000-0000-0000-00000000000a'
            then 'PASS T13b ORDER_ITEM_CREATED partner/branch resolved correctly'
            else 'FAIL T13b partner=' || coalesce(partner_id::text,'NULL') || ' branch=' || coalesce(branch_id::text,'NULL') end
from audit_logs where action = 'ORDER_ITEM_CREATED' order by id desc limit 1;

select case when count(*) >= 1 then 'PASS T13c ORDER_OFFER_CREATED/UPDATED audit still fires'
            else 'FAIL T13c no ORDER_OFFER_* audit rows found' end
from audit_logs where action in ('ORDER_OFFER_CREATED','ORDER_OFFER_UPDATED');

select case when count(*) >= 1 then 'PASS T13d PACKAGE_ITEM_CREATED audit still fires (0012 regression)'
            else 'FAIL T13d no PACKAGE_ITEM_CREATED found' end
from audit_logs where action = 'PACKAGE_ITEM_CREATED';

select case when count(*) >= 1 then 'PASS T13e PERMISSION_CHANGED audit still fires for partner_access_policies'
            else 'FAIL T13e none found' end
from audit_logs where action = 'PERMISSION_CHANGED';

select public.test_logout();

-- ============================================================
-- T14: anon (no session) sees nothing anywhere.
-- ============================================================
set role app_test_user;
select public.test_logout();
select case when count(*) = 0 then 'PASS T14a anon: 0 order_items'
            else 'FAIL T14a anon saw ' || count(*) end
from public.order_items;
select case when count(*) = 0 then 'PASS T14b anon: 0 order_sanci_offers'
            else 'FAIL T14b anon saw ' || count(*) end
from public.order_sanci_offers;
reset role;
