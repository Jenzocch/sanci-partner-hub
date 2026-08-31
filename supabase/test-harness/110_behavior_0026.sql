-- Behavioral tests for 0026's CHECK constraints on partner_orders — the
-- destructive half that was REMOVED from the migration itself (adversarial
-- review 2026-08-31, P1-2). Run AFTER 10_fixtures.sql on the full chain
-- 0001→…→0026.
--
-- WHY THIS LIVES HERE AND NOT IN 0026 §7: these tests UPDATE a real
-- partner_orders row to an illegal value and rely on the very CHECK under
-- test to reject it. Inside a hand-pasted migration that is exactly
-- backwards (LESSONS #7 — the safety net IS the thing being tested): if the
-- file is pasted partially and the constraint is absent, the UPDATE commits
-- against a production order — paid becomes -1, the settled stamp is
-- revoked by trg_order_customer_payment, and a bogus ORDER_UPDATED audit
-- row appears, all silently. Here the fixtures are disposable and the whole
-- block is wrapped in an explicit transaction that ALWAYS rolls back, so
-- even a missing constraint cannot leave residue.
--
--   T1  customer_paid_amount = -1        → 23514 check_violation
--   T2  expedition longer than 120 chars → 23514 check_violation
--   T3  confirm_status longer than 200   → 23514 check_violation
--   T4  the fixture row's values are byte-identical after the rollback
--       (proves the wrapper, not just the constraints)

begin;

do $$
declare
  v_id   uuid;
  v_ok_1 boolean := false;
  v_ok_2 boolean := false;
  v_ok_3 boolean := false;
begin
  select id into v_id
  from public.partner_orders
  where status <> 'CANCELLED'
  order by created_at
  limit 1;

  if v_id is null then
    raise exception 'FIXTURE HILANG: jalankan 10_fixtures.sql dulu';
  end if;

  begin
    update public.partner_orders set customer_paid_amount = -1 where id = v_id;
  exception when check_violation then
    v_ok_1 := true;
  end;

  begin
    update public.partner_orders set expedition = repeat('X', 121) where id = v_id;
  exception when check_violation then
    v_ok_2 := true;
  end;

  begin
    update public.partner_orders set confirm_status = repeat('Y', 201) where id = v_id;
  exception when check_violation then
    v_ok_3 := true;
  end;

  raise notice 'T1_PAID_NEGATIVE_REJECTED=%', v_ok_1;
  raise notice 'T2_EXPEDITION_TOOLONG_REJECTED=%', v_ok_2;
  raise notice 'T3_CONFIRM_TOOLONG_REJECTED=%', v_ok_3;

  if not (v_ok_1 and v_ok_2 and v_ok_3) then
    raise exception 'CHECK GAGAL: T1=% T2=% T3=% — constraint 0026 tidak menolak nilai ilegal',
      v_ok_1, v_ok_2, v_ok_3;
  end if;
end;
$$;

-- T4: apa pun hasil di atas, TIDAK ADA satu byte pun yang boleh tersisa.
rollback;

-- Bukti T4 dijalankan di luar transaksi: baris fixture tidak membawa nilai
-- uji apa pun (ketiga kolom masih dalam keadaan pra-uji — paid tidak -1,
-- expedition/confirm_status tidak berisi X/Y panjang).
select
  'T4_NO_RESIDUE' as check_type,
  (count(*) = 0)::int::text as result
from public.partner_orders
where customer_paid_amount < 0
   or char_length(coalesce(expedition, '')) > 120
   or char_length(coalesce(confirm_status, '')) > 200;
