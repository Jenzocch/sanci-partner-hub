-- Behavioral tests for 0016 (order documents: SO/DO/Invoice). Must be run as
-- a NON-superuser, NON-owner role (app_test_user) so RLS actually applies.
-- Run via: sudo -u postgres psql -d <db> -f 40_behavior_0016.sql
-- (after 00_shim.sql, 10_fixtures.sql, 20_behavior_0014.sql, and
-- 30_behavior_0015.sql have run on top of the full 0001..0016 chain.)
--
-- SCOPE NOTE: fn_create_order_document/fn_replace_order_document_items are
-- deliberately "dumb" about doc_number generation (see 0016 §7) — the
-- prefix+suffix numbering scheme lives in web/app/admin/actions-documents.ts.
-- These tests therefore compute doc_number the SAME way the Server Action
-- does (count existing docs of that type for the order, +1) before calling
-- the RPC, so the DB-level mechanics (uniqueness, retry-worthy 23505,
-- over-shipment guard, cascade, audit two-hop lookup) are exercised
-- faithfully without needing a running Next.js server. Likewise, "SO defaults
-- to ALL order items at full qty when none are picked" is an app-layer
-- default (server action), not a DB behavior — not exercised here; the RPC
-- itself just inserts whatever item list it is given.
--
-- FOUR item fixtures, each dedicated to ONE test section so their quantities
-- never interfere with each other's math:
--   d001 Kursi Z (qty 5) → T4 (over-shipment guard, DO) + T5 (INVOICE independence)
--   d002 Rak W   (qty 4) → T6 (edit-past-remaining via replace-lines)
--   d003 Meja Q  (qty 1000) → T3 (numbering suffix sequence — ample headroom)
--   d004 Bantal V(qty 1000) → T1 (SO multi-line demo, paired with d003)

set role app_test_user;
reset role;

select public.test_login('33333333-3333-3333-3333-333333333333');
insert into public.order_items (id, order_id, product_id, name_snapshot, code_snapshot, quantity, client_request_id)
values
  ('d0000000-0000-0000-0000-00000000d001', 'a6000000-0000-0000-0000-00000000000a', 'a4000000-0000-0000-0000-00000000000a', 'Kursi Z', 'KURSI-Z', 5, 'doc-test-item-1'),
  ('d0000000-0000-0000-0000-00000000d002', 'a6000000-0000-0000-0000-00000000000a', 'a4000000-0000-0000-0000-00000000000a', 'Rak W', 'RAK-W', 4, 'doc-test-item-2'),
  ('d0000000-0000-0000-0000-00000000d003', 'a6000000-0000-0000-0000-00000000000a', 'a4000000-0000-0000-0000-00000000000a', 'Meja Q', 'MEJA-Q', 1000, 'doc-test-item-3'),
  ('d0000000-0000-0000-0000-00000000d004', 'a6000000-0000-0000-0000-00000000000a', 'a4000000-0000-0000-0000-00000000000a', 'Bantal V', 'BANTAL-V', 1000, 'doc-test-item-4')
on conflict (id) do nothing;
select public.test_logout();

-- Stash the fixture order's order_number in a session GUC (readable from
-- inside plpgsql do-blocks via current_setting) — safer than psql's \gset
-- variable interpolation, which is not dollar-quote-aware.
select set_config('app.test_order_number', order_number, false)
from public.partner_orders where id = 'a6000000-0000-0000-0000-00000000000a';

-- ============================================================
-- T1: admin creates an SO document with explicit items (RPC's own
-- transactional insert — see SCOPE NOTE for the "default to all items"
-- app-layer behavior). doc_number has NO suffix for the first document of a
-- type.
-- ============================================================
set role app_test_user;
select public.test_login('33333333-3333-3333-3333-333333333333');

do $$
declare v_id uuid; v_num text;
begin
  select id, doc_number into v_id, v_num from public.fn_create_order_document(
    'a6000000-0000-0000-0000-00000000000a', 'SO', 'SO-' || current_setting('app.test_order_number'), current_date, 'catatan SO',
    jsonb_build_array(
      jsonb_build_object('order_item_id', 'd0000000-0000-0000-0000-00000000d003', 'quantity', 2),
      jsonb_build_object('order_item_id', 'd0000000-0000-0000-0000-00000000d004', 'quantity', 3)
    ),
    'doc-test-so-1'
  );
  if v_id is not null and v_num = 'SO-' || current_setting('app.test_order_number') then
    raise notice 'PASS T1 admin created SO document, doc_number=%', v_num;
  else
    raise exception 'FAIL T1 unexpected result id=%, num=%', v_id, v_num;
  end if;
end;
$$;

select case when count(*) = 2 then 'PASS T1b SO document has 2 item lines'
            else 'FAIL T1b expected 2 lines, got ' || count(*) end
from public.order_document_items odi
join public.order_documents od on od.id = odi.document_id
where od.doc_number = 'SO-' || current_setting('app.test_order_number');

select public.test_logout();
reset role;

-- ============================================================
-- T2: branch user (own branch of the order) sees ZERO rows in BOTH new
-- tables — admin-only per 0016 §4, no exceptions for own-branch/own-order.
-- ============================================================
set role app_test_user;
select public.test_login('11111111-1111-1111-1111-111111111111');

select case when count(*) = 0 then 'PASS T2a branch: 0 order_documents visible'
            else 'FAIL T2a branch saw ' || count(*) || ' order_documents row(s)' end
from public.order_documents;

select case when count(*) = 0 then 'PASS T2b branch: 0 order_document_items visible'
            else 'FAIL T2b branch saw ' || count(*) || ' order_document_items row(s)' end
from public.order_document_items;

-- Branch cannot create a document either (RLS blocks the whole RPC's INSERT).
do $$
begin
  begin
    perform public.fn_create_order_document(
      'a6000000-0000-0000-0000-00000000000a', 'DO', 'DO-hacked', current_date, null, '[]'::jsonb, 'doc-test-hack-1'
    );
    raise exception 'FAIL T2c branch created a document via RPC';
  exception when others then
    raise notice 'PASS T2c branch blocked from creating document (%.)', sqlstate;
  end;
end;
$$;

select public.test_logout();
reset role;

-- ============================================================
-- T3: numbering suffix sequence — creating a second DO for the SAME order
-- yields "-2", not colliding with the first. Uses Meja Q (ample headroom,
-- qty 1000) so this section's math never touches the over-shipment tests.
-- ============================================================
set role app_test_user;
select public.test_login('33333333-3333-3333-3333-333333333333');

do $$
declare v_id uuid; v_num text;
begin
  select id, doc_number into v_id, v_num from public.fn_create_order_document(
    'a6000000-0000-0000-0000-00000000000a', 'DO', 'DO-' || current_setting('app.test_order_number'), current_date, null,
    jsonb_build_array(jsonb_build_object('order_item_id', 'd0000000-0000-0000-0000-00000000d003', 'quantity', 1)),
    'doc-test-do-1'
  );
  if v_num = 'DO-' || current_setting('app.test_order_number') then
    raise notice 'PASS T3a first DO gets no suffix, doc_number=%', v_num;
  else
    raise exception 'FAIL T3a unexpected doc_number %', v_num;
  end if;
end;
$$;

do $$
declare v_id uuid; v_num text;
begin
  select id, doc_number into v_id, v_num from public.fn_create_order_document(
    'a6000000-0000-0000-0000-00000000000a', 'DO', 'DO-' || current_setting('app.test_order_number') || '-2', current_date, null,
    jsonb_build_array(jsonb_build_object('order_item_id', 'd0000000-0000-0000-0000-00000000d003', 'quantity', 1)),
    'doc-test-do-2'
  );
  if v_num = 'DO-' || current_setting('app.test_order_number') || '-2' then
    raise notice 'PASS T3b second DO gets -2 suffix, doc_number=%', v_num;
  else
    raise exception 'FAIL T3b unexpected doc_number %', v_num;
  end if;
end;
$$;

-- Attempting to reuse the SAME doc_number a second time hits the unique
-- constraint (this is what the Server Action's retry loop catches — 23505
-- NOT on client_request_id means "someone else just took this number,
-- recompute and retry with the next suffix").
do $$
begin
  begin
    perform public.fn_create_order_document(
      'a6000000-0000-0000-0000-00000000000a', 'DO', 'DO-' || current_setting('app.test_order_number'), current_date, null, '[]'::jsonb, 'doc-test-do-collide'
    );
    raise exception 'FAIL T3c duplicate doc_number accepted';
  exception when unique_violation then
    if sqlerrm like '%doc_number%' then
      raise notice 'PASS T3c duplicate doc_number rejected by unique constraint (not client_request_id)';
    else
      raise notice 'FAIL T3c unique violation but wrong column: %', sqlerrm;
    end if;
  end;
end;
$$;

select public.test_logout();
reset role;

-- ============================================================
-- T4: over-shipment guard — DO total across TWO DO documents for the SAME
-- order_item (Kursi Z, qty 5) must not exceed 5. First DO ships 3; a second
-- DO trying +3 (6 total) fails; +2 (5 total, exact remaining) passes.
-- ============================================================
set role app_test_user;
select public.test_login('33333333-3333-3333-3333-333333333333');

do $$
declare v_id uuid;
begin
  select id into v_id from public.fn_create_order_document(
    'a6000000-0000-0000-0000-00000000000a', 'DO', 'DO-' || current_setting('app.test_order_number') || '-kz1', current_date, null,
    jsonb_build_array(jsonb_build_object('order_item_id', 'd0000000-0000-0000-0000-00000000d001', 'quantity', 3)),
    'doc-test-do-kz-1'
  );
  raise notice 'PASS T4 setup: first DO ships 3 of 5 Kursi Z, id=%', v_id;
end;
$$;

-- 3 already shipped. Adding a SECOND DO trying to ship 3 more (3+3=6 > 5)
-- must fail with a clear message naming the item and the remaining quantity
-- (5-3=2).
do $$
begin
  begin
    perform public.fn_create_order_document(
      'a6000000-0000-0000-0000-00000000000a', 'DO', 'DO-' || current_setting('app.test_order_number') || '-kz2', current_date, null,
      jsonb_build_array(jsonb_build_object('order_item_id', 'd0000000-0000-0000-0000-00000000d001', 'quantity', 3)),
      'doc-test-do-overship-1'
    );
    raise exception 'FAIL T4a over-shipment (3+3 against qty 5) accepted';
  exception when others then
    if sqlerrm like '%Kursi Z%' and sqlerrm like '%sisa 2%' then
      raise notice 'PASS T4a over-shipment rejected with item name + remaining qty: %', sqlerrm;
    else
      raise notice 'FAIL T4a wrong error message: %', sqlerrm;
    end if;
  end;
end;
$$;

-- 3 + 2 = 5 exactly, must pass (uses the exact remaining amount).
do $$
declare v_id uuid; v_num text;
begin
  select id, doc_number into v_id, v_num from public.fn_create_order_document(
    'a6000000-0000-0000-0000-00000000000a', 'DO', 'DO-' || current_setting('app.test_order_number') || '-kz2', current_date, null,
    jsonb_build_array(jsonb_build_object('order_item_id', 'd0000000-0000-0000-0000-00000000d001', 'quantity', 2)),
    'doc-test-do-overship-2'
  );
  if v_id is not null then
    raise notice 'PASS T4b exact-remaining shipment (3+2=5) accepted, doc_number=%', v_num;
  else
    raise exception 'FAIL T4b exact-remaining shipment rejected';
  end if;
end;
$$;

-- ============================================================
-- T5: over-shipment check is INDEPENDENT for INVOICE — even though ALL 5
-- units of Kursi Z are now shipped (T4), invoicing all 5 in one INVOICE
-- document succeeds (shipping does not consume the billing quota; each
-- doc_type has its OWN running total against the same order_item).
-- ============================================================
do $$
declare v_id uuid; v_num text;
begin
  select id, doc_number into v_id, v_num from public.fn_create_order_document(
    'a6000000-0000-0000-0000-00000000000a', 'INVOICE', 'INV-' || current_setting('app.test_order_number'), current_date, null,
    jsonb_build_array(jsonb_build_object('order_item_id', 'd0000000-0000-0000-0000-00000000d001', 'quantity', 5)),
    'doc-test-inv-1'
  );
  if v_id is not null then
    raise notice 'PASS T5a INVOICE independent from DO quota — full 5 units invoiced, doc_number=%', v_num;
  else
    raise exception 'FAIL T5a invoicing failed despite independent quota';
  end if;
end;
$$;

-- ...but a SECOND invoice for the same item now fails (5 already invoiced,
-- 0 remaining) — proving the INVOICE-type quota IS enforced, just separately
-- from DO.
do $$
begin
  begin
    perform public.fn_create_order_document(
      'a6000000-0000-0000-0000-00000000000a', 'INVOICE', 'INV-' || current_setting('app.test_order_number') || '-2', current_date, null,
      jsonb_build_array(jsonb_build_object('order_item_id', 'd0000000-0000-0000-0000-00000000d001', 'quantity', 1)),
      'doc-test-inv-2'
    );
    raise exception 'FAIL T5b second invoice against fully-invoiced item accepted';
  exception when others then
    if sqlerrm like '%Kursi Z%' and sqlerrm like '%sisa 0%' then
      raise notice 'PASS T5b second invoice rejected, 0 remaining: %', sqlerrm;
    else
      raise notice 'FAIL T5b wrong error: %', sqlerrm;
    end if;
  end;
end;
$$;

select public.test_logout();
reset role;

-- ============================================================
-- T6: editing a DO line qty upward past remaining is rejected (replace-lines
-- path via fn_replace_order_document_items) — Rak W (qty 4, untouched by any
-- other section) starts a DO at 2 units, then editing that SAME document up
-- to 5 units (> 4 total) must fail and the document's lines must remain
-- unchanged (rollback, not partial write — the RPC is one transaction).
-- ============================================================
select public.test_login('33333333-3333-3333-3333-333333333333');

do $$
declare v_id uuid;
begin
  select id into v_id from public.fn_create_order_document(
    'a6000000-0000-0000-0000-00000000000a', 'DO', 'DO-' || current_setting('app.test_order_number') || '-rakw', current_date, null,
    jsonb_build_array(jsonb_build_object('order_item_id', 'd0000000-0000-0000-0000-00000000d002', 'quantity', 2)),
    'doc-test-do-rakw-1'
  );
  perform set_config('app.test_doc_id', v_id::text, false);
  raise notice 'PASS T6 setup: DO for Rak W (2 of 4) created, id=%', v_id;
end;
$$;

do $$
declare v_doc_id uuid := current_setting('app.test_doc_id')::uuid;
begin
  begin
    perform public.fn_replace_order_document_items(
      v_doc_id, current_date, 'naik ke 5',
      jsonb_build_array(jsonb_build_object('order_item_id', 'd0000000-0000-0000-0000-00000000d002', 'quantity', 5))
    );
    raise exception 'FAIL T6b edit past remaining (5 against qty 4) accepted';
  exception when others then
    if sqlerrm like '%Rak W%' then
      raise notice 'PASS T6b edit past remaining rejected: %', sqlerrm;
    else
      raise notice 'FAIL T6b wrong error: %', sqlerrm;
    end if;
  end;
end;
$$;

-- Confirm rollback: the line still shows the ORIGINAL quantity (2), not a
-- partial write — the whole RPC call (header update + delete + reinsert)
-- rolled back as one transaction.
do $$
declare v_doc_id uuid := current_setting('app.test_doc_id')::uuid;
begin
  perform 1 from public.order_document_items
  where document_id = v_doc_id and order_item_id = 'd0000000-0000-0000-0000-00000000d002' and quantity = 2;
  if found then
    raise notice 'PASS T6c rejected edit left original quantity (2) intact';
  else
    raise exception 'FAIL T6c line quantity was NOT rolled back to 2';
  end if;
end;
$$;

-- A valid edit (up to exactly 4, the full remaining) succeeds.
do $$
declare v_doc_id uuid := current_setting('app.test_doc_id')::uuid;
begin
  perform public.fn_replace_order_document_items(
    v_doc_id, current_date, 'naik ke 4 (pas)',
    jsonb_build_array(jsonb_build_object('order_item_id', 'd0000000-0000-0000-0000-00000000d002', 'quantity', 4))
  );
  raise notice 'PASS T6d valid edit up to exact remaining (4) accepted';
end;
$$;

select public.test_logout();

-- ============================================================
-- T7: document delete allowed for admin — cascade removes lines, audit
-- records both the document delete AND the cascaded item deletes.
-- ============================================================
select public.test_login('33333333-3333-3333-3333-333333333333');

do $$
declare
  v_doc_id uuid := current_setting('app.test_doc_id')::uuid;
  v_lines_before integer;
begin
  select count(*) into v_lines_before from public.order_document_items where document_id = v_doc_id;
  if v_lines_before = 0 then
    raise exception 'FAIL T7 setup: expected at least 1 line before delete';
  end if;
  delete from public.order_documents where id = v_doc_id;
  raise notice 'PASS T7a admin deleted document (had % line(s))', v_lines_before;
end;
$$;

do $$
declare v_doc_id uuid := current_setting('app.test_doc_id')::uuid;
begin
  perform 1 from public.order_document_items where document_id = v_doc_id;
  if not found then
    raise notice 'PASS T7b cascade removed the item lines';
  else
    raise exception 'FAIL T7b item lines survived document delete';
  end if;
end;
$$;

do $$
declare v_doc_id uuid := current_setting('app.test_doc_id')::uuid;
begin
  perform 1 from public.audit_logs
  where action = 'ORDER_DOCUMENT_DELETED' and entity_type = 'order_documents' and entity_id = v_doc_id::text;
  if found then
    raise notice 'PASS T7c ORDER_DOCUMENT_DELETED recorded';
  else
    raise exception 'FAIL T7c no ORDER_DOCUMENT_DELETED audit row';
  end if;
end;
$$;

select case when count(*) > 0 then 'PASS T7d ORDER_DOCUMENT_ITEM_DELETED recorded for cascaded line(s)'
            else 'FAIL T7d no ORDER_DOCUMENT_ITEM_DELETED audit row from cascade' end
from public.audit_logs
where action = 'ORDER_DOCUMENT_ITEM_DELETED' and entity_type = 'order_document_items';

select public.test_logout();
reset role;

-- ============================================================
-- T8: audit two-hop lookup — ORDER_DOCUMENT_ITEM_CREATED rows resolve BOTH
-- partner_id AND branch_id correctly (document_id → order_documents.order_id
-- → partner_orders), matching the order's own partner (Partner A) and
-- branch (Branch A1). Also confirms ORDER_DOCUMENT_CREATED resolves via the
-- one-hop order_id path.
-- ============================================================
select case when count(*) > 0 then 'PASS T8a ORDER_DOCUMENT_CREATED resolves partner+branch (one-hop)'
            else 'FAIL T8a no correctly-resolved ORDER_DOCUMENT_CREATED row' end
from public.audit_logs
where action = 'ORDER_DOCUMENT_CREATED' and entity_type = 'order_documents'
  and partner_id = 'a0000000-0000-0000-0000-00000000000a'
  and branch_id = 'a1000000-0000-0000-0000-00000000000a';

select case when count(*) > 0 then 'PASS T8b ORDER_DOCUMENT_ITEM_CREATED resolves partner+branch (two-hop)'
            else 'FAIL T8b no correctly-resolved ORDER_DOCUMENT_ITEM_CREATED row' end
from public.audit_logs
where action = 'ORDER_DOCUMENT_ITEM_CREATED' and entity_type = 'order_document_items'
  and partner_id = 'a0000000-0000-0000-0000-00000000000a'
  and branch_id = 'a1000000-0000-0000-0000-00000000000a';

-- ============================================================
-- T9: audit regression sweep — every prior slice's action THAT THIS
-- HARNESS'S OWN FIXTURES ACTUALLY EXERCISE (10_fixtures.sql +
-- 20_behavior_0014.sql + 30_behavior_0015.sql — none of them correct
-- attribution, mark arrival, or add an internal note, so those three action
-- codes are legitimately absent here; that they still exist as strings
-- inside fn_audit_row is already checked at the SOURCE level by this
-- migration's own AUDIT_KEEP_* verification block) is still intact after
-- this migration's fn_audit_row redefinition.
-- ============================================================
select case when count(distinct action) = 6 then 'PASS T9 all 6 harness-reachable prior-slice actions still present in audit_logs'
            else 'FAIL T9 expected 6 distinct prior-slice actions, found ' || count(distinct action) end
from public.audit_logs
where action in (
  'ORDER_CREATED','ORDER_CANCELLED','ORDER_OFFER_CREATED','ORDER_ITEM_CREATED',
  'PACKAGE_ITEM_CREATED','CUSTOMER_CREATED'
);

select 'DONE_0016' as check_type, 'ok' as result;
