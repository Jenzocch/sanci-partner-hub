-- Behavioural proof for the Package-copy idempotency key
-- (web/lib/order-create-shared.ts, copyPackageItemsToOrder) — 2026-09-01.
--
-- WHAT IT PROVES, and why it is worth a file: the key used to be
-- `{rid}:item:{product_id}`, which is unique only for as long as
-- `unique (package_id, product_id)` (0012) stands. That constraint encodes a
-- PRODUCT decision ("one product at most once per package; a second unit is
-- a higher quantity"), not a promise to the copy routine. This test drops it
-- INSIDE a transaction that always rolls back, puts the same product in a
-- package twice, and measures what each key format actually stores:
--
--   T1  old key `{rid}:item:{product_id}`      → 2 rows in, 1 row stored
--       (the second is swallowed by ON CONFLICT DO NOTHING, with no error
--       anywhere — the failure mode this fix exists for)
--   T2  new key `{rid}:item:{package_item_id}` → 2 rows in, 2 rows stored
--   T3  the new key is still idempotent: replaying the same insert does NOT
--       duplicate (the property the old key was chosen for is not lost)
--   T4  no residue after rollback (proves the wrapper, not just the tests)
--
-- T1 is an assertion, not a demonstration: if a future schema change made
-- the old key safe, T1 FAILS and says the premise of the fix is gone.
--
-- Run AFTER 10_fixtures.sql on the full chain 0001→…→0027.

-- Membuktikan (bukan menduga) bahwa kunci LAMA menelan baris dan kunci BARU
-- tidak. Seluruhnya di dalam transaksi yang SELALU rollback.
begin;

do $$
declare
  v_order   uuid;
  v_prod    uuid;
  v_pkg     uuid;
  v_item_a  uuid;
  v_item_b  uuid;
  v_rid     text := 'ZZTEST-pkgkey';
  v_lama    int;
  v_baru    int;
begin
  select id into v_order from public.partner_orders where status <> 'CANCELLED' order by created_at limit 1;
  select id into v_prod  from public.sanci_products order by created_at limit 1;
  select id into v_pkg   from public.partner_packages order by created_at limit 1;
  if v_order is null or v_prod is null or v_pkg is null then
    raise exception 'FIXTURE HILANG: jalankan 10_fixtures.sql dulu (order=% prod=% pkg=%)', v_order, v_prod, v_pkg;
  end if;

  -- Skenario masa depan yang perbaikan ini lindungi: paket boleh memuat
  -- produk yang SAMA dua kali (mis. dua warna). Constraint-nya dilepas HANYA
  -- di dalam transaksi ini.
  alter table public.partner_package_items drop constraint partner_package_items_package_id_product_id_key;

  insert into public.partner_package_items (package_id, product_id, quantity)
  values (v_pkg, v_prod, 2) returning id into v_item_a;
  insert into public.partner_package_items (package_id, product_id, quantity)
  values (v_pkg, v_prod, 3) returning id into v_item_b;

  raise notice 'SETUP: dua baris paket untuk produk yang SAMA (id berbeda: % vs %)', v_item_a, v_item_b;

  -- ── Kunci LAMA: `{rid}:item:{product_id}` — identik untuk kedua baris ──
  insert into public.order_items (order_id, product_id, name_snapshot, code_snapshot, quantity, client_request_id)
  values
    (v_order, v_prod, 'Uji Lama', null, 2, v_rid || '-lama:item:' || v_prod::text),
    (v_order, v_prod, 'Uji Lama', null, 3, v_rid || '-lama:item:' || v_prod::text)
  on conflict (client_request_id) do nothing;

  select count(*) into v_lama from public.order_items
  where client_request_id like v_rid || '-lama:%';

  -- ── Kunci BARU: `{rid}:item:{partner_package_items.id}` ──
  insert into public.order_items (order_id, product_id, name_snapshot, code_snapshot, quantity, client_request_id)
  values
    (v_order, v_prod, 'Uji Baru', null, 2, v_rid || '-baru:item:' || v_item_a::text),
    (v_order, v_prod, 'Uji Baru', null, 3, v_rid || '-baru:item:' || v_item_b::text)
  on conflict (client_request_id) do nothing;

  select count(*) into v_baru from public.order_items
  where client_request_id like v_rid || '-baru:%';

  raise notice 'T1_KUNCI_LAMA_MENELAN_SATU_BARIS  baris_tersimpan=% (diharapkan 1 dari 2)', v_lama;
  raise notice 'T2_KUNCI_BARU_MENYIMPAN_KEDUANYA  baris_tersimpan=% (diharapkan 2 dari 2)', v_baru;

  if v_lama <> 1 then
    raise exception 'TIDAK TERBUKTI: kunci lama menyimpan % baris, bukan 1 — premis perbaikan ini salah', v_lama;
  end if;
  if v_baru <> 2 then
    raise exception 'GAGAL: kunci baru menyimpan % baris, bukan 2', v_baru;
  end if;

  -- ── T3: idempotensi kunci baru TETAP utuh (retry tidak menggandakan) ──
  insert into public.order_items (order_id, product_id, name_snapshot, code_snapshot, quantity, client_request_id)
  values
    (v_order, v_prod, 'Uji Baru', null, 2, v_rid || '-baru:item:' || v_item_a::text),
    (v_order, v_prod, 'Uji Baru', null, 3, v_rid || '-baru:item:' || v_item_b::text)
  on conflict (client_request_id) do nothing;

  select count(*) into v_baru from public.order_items
  where client_request_id like v_rid || '-baru:%';
  raise notice 'T3_RETRY_TIDAK_MENGGANDAKAN         baris_tersimpan=% (diharapkan tetap 2)', v_baru;
  if v_baru <> 2 then
    raise exception 'GAGAL: retry menggandakan baris menjadi %', v_baru;
  end if;
end;
$$;

rollback;

-- T4: bukti wrapper — tidak ada satu byte pun yang tersisa.
select 'T4_NO_RESIDUE' as check_type,
       (count(*) = 0)::int::text as result
from public.order_items where client_request_id like 'ZZTEST-pkgkey%';
