-- Behavioral tests for 0027's customer_settled_on. Run AFTER 10_fixtures.sql
-- on the full chain 0001→…→0027.
--
-- WHY THIS LIVES HERE AND NOT IN THE MIGRATION: same reason as
-- 110_behavior_0026.sql — every test below WRITES to a partner_orders row.
-- A migration is pasted by hand into a production SQL Editor; behavioural
-- tests that mutate real orders do not belong there. The whole block is
-- wrapped in a transaction that ALWAYS rolls back.
--
-- The four things 0027 actually claims, each tested by trying to break it:
--   T1  customer_settled_on accepts a hand-typed date and the 0026 trigger
--       does NOT wipe it (proves the trigger ignores this column)
--   T2  writing customer_settled_on does NOT move customer_settled_at
--       (the two dates are independent — the whole point of option B)
--   T3  customer_settled_at is STILL server-forced even when the caller
--       sends both columns in one UPDATE (0026's guarantee survives 0027)
--   T4  customer_settled_on is accepted on an order that is NOT settled —
--       the historical-import case, the only reason this column exists
--   T5  no residue after rollback (proves the wrapper, not just the tests)

begin;

do $$
declare
  v_id           uuid;
  v_settled_at_0 timestamptz;
  v_settled_at_1 timestamptz;
  v_settled_at_2 timestamptz;
  v_on_1         date;
  v_on_2         date;
  v_ok_1 boolean := false;
  v_ok_2 boolean := false;
  v_ok_3 boolean := false;
  v_ok_4 boolean := false;
begin
  select id into v_id
  from public.partner_orders
  where status <> 'CANCELLED'
  order by created_at
  limit 1;

  if v_id is null then
    raise exception 'FIXTURE HILANG: jalankan 10_fixtures.sql dulu';
  end if;

  -- ── Titik awal: pesanan BELUM lunas (total ada, paid 0). Dipasang
  --    eksplisit supaya tes ini tidak bergantung pada isi fixture.
  update public.partner_orders
  set customer_total_amount = 1000000,
      customer_paid_amount  = 0,
      customer_settled_on   = null
  where id = v_id;

  select customer_settled_at into v_settled_at_0
  from public.partner_orders where id = v_id;

  -- T4 (dijalankan lebih dulu karena ia memakai keadaan BELUM lunas ini):
  -- tanggal lunas sungguhan boleh diisi walau sistem menganggapnya belum
  -- lunas. Kalau suatu saat ada yang menambahkan CHECK "hanya kalau lunas",
  -- baris ini yang akan gagal — dan memang harus.
  update public.partner_orders
  set customer_settled_on = date '2025-03-12'
  where id = v_id;

  select customer_settled_on, customer_settled_at into v_on_1, v_settled_at_1
  from public.partner_orders where id = v_id;

  v_ok_4 := (v_on_1 = date '2025-03-12');
  -- T1: triggernya tidak menghapus nilai yang baru saja diketik.
  v_ok_1 := (v_on_1 is not null);
  -- T2: menulis kolom ini TIDAK menggeser cap sistem. Pesanan ini belum
  -- lunas, jadi capnya harus TETAP null seperti sebelum UPDATE.
  v_ok_2 := (v_settled_at_1 is not distinct from v_settled_at_0)
            and v_settled_at_1 is null;

  -- T3: sekarang lunasi, DAN pada UPDATE yang SAMA coba kirim cap sistem
  -- karangan sendiri. 0026 §2 harus tetap menghitung ulang capnya dari nol
  -- (nilai client dibuang), sementara kolom isi-tangan lewat apa adanya.
  update public.partner_orders
  set customer_paid_amount = 1000000,
      customer_settled_at  = timestamptz '2001-01-01 00:00:00+00',
      customer_settled_on  = date '2025-03-12'
  where id = v_id;

  select customer_settled_on, customer_settled_at into v_on_2, v_settled_at_2
  from public.partner_orders where id = v_id;

  v_ok_3 := v_settled_at_2 is not null
            and v_settled_at_2 <> timestamptz '2001-01-01 00:00:00+00'
            and v_on_2 = date '2025-03-12';

  raise notice 'T1_SETTLED_ON_SURVIVES_TRIGGER=%', v_ok_1;
  raise notice 'T2_SETTLED_ON_DOES_NOT_MOVE_SETTLED_AT=%', v_ok_2;
  raise notice 'T3_SETTLED_AT_STILL_SERVER_FORCED=%', v_ok_3;
  raise notice 'T4_SETTLED_ON_ALLOWED_WHEN_NOT_LUNAS=%', v_ok_4;

  if not (v_ok_1 and v_ok_2 and v_ok_3 and v_ok_4) then
    raise exception '0027 GAGAL: T1=% T2=% T3=% T4=%', v_ok_1, v_ok_2, v_ok_3, v_ok_4;
  end if;
end;
$$;

-- T5: apa pun hasil di atas, TIDAK ADA satu byte pun yang boleh tersisa.
rollback;

-- Bukti T5 dijalankan di luar transaksi: tidak ada baris yang membawa
-- tanggal uji 2025-03-12.
select
  'T5_NO_RESIDUE' as check_type,
  (count(*) = 0)::int::text as result
from public.partner_orders
where customer_settled_on = date '2025-03-12';
