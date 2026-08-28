-- Behavioral tests for 0022 (product_photos gallery + anon read policies on
-- product_photos AND sanci_products). Run AFTER 20..90_behavior_*.sql on the
-- full chain 0001→…→0022 + 00_shim + 10_fixtures. Sections that must observe
-- RLS run as NON-superuser app_test_user (same discipline as
-- 20_behavior_0014.sql / 90_behavior_0021.sql); admin sections run via
-- test_login only (superuser session — fine, ph_admin_all/sp_admin_all allow
-- the same rows anyway).
--
-- "Anon" here means test_logout() (auth.uid() IS NULL) while running as
-- app_test_user — NOT `set role anon`. This mirrors 90_behavior_0021.sql T12
-- exactly, and is not a shortcut: the new policies in 0022 are deliberately
-- written against `auth.uid() is null` (not `TO anon`), precisely because
-- this harness's `app_test_user` carries BOTH the anon and authenticated
-- grants (00_shim.sql) and can never be restricted to only one PostgreSQL
-- role — auth.uid() IS NULL is the only thing this harness (and the real
-- app, which never trusts the PG role either) can reliably distinguish.
--
-- Covers exactly the behavior claims of migration 0022's header:
--   T1  anon (logged out) reads photos of the ACTIVE fixture product
--   T2  anon reads ZERO rows for an INACTIVE product — both sanci_products
--       itself and its product_photos
--   T3  anon cannot INSERT into product_photos (RLS rejects, 42501) and
--       cannot UPDATE sanci_products (silent 0-row no-op, value intact)
--   T4  authenticated partner WITHOUT catalog access still reads ZERO rows
--       from sanci_products AND product_photos — proves sp_anon_read/
--       ph_anon_read did NOT weaken the existing catalog gate for logged-in
--       partner sessions (auth.uid() is null is false for them)
--   T5  authenticated partner WITH catalog access reads the ACTIVE
--       product's gallery via ph_partner_read, in (sort_order, created_at,
--       id) order — the pre-existing partner gate still works unchanged
--   T6  anon reads ZERO rows from product_prices, partner_orders and
--       sanci_catalog_access (0022 touches none of their policies)
--   T7  admin full CRUD: insert two gallery photos, delete one; FK RESTRICT
--       blocks deleting a product that still has a photo row
--   T8  audited with before/after: PRODUCT_PHOTO_CREATED/DELETED carry
--       partner_id/branch_id NULL (photos belong to SANCI, not a partner —
--       same pattern as sanci_products itself, 0010) and actor_role
--       SANCI_ADMIN
--
-- State discipline: fixtures ship NO product_photos rows and no INACTIVE
-- product. This file creates one throwaway INACTIVE product (needed for
-- T2/T4's "even inactive/closed" boundary) plus the photo rows it needs,
-- and removes ALL of it at the end — re-runs and earlier suites see the
-- same starting state. audit_logs rows are append-only by design and are
-- left in place (same as every other suite).

select public.test_logout();

-- Safety: start from "no photos, no throwaway product" even on re-runs.
select public.test_login('33333333-3333-3333-3333-333333333333');
delete from public.product_photos
 where product_id in ('a4000000-0000-0000-0000-00000000000a', 'c4000000-0000-0000-0000-00000000000c');
delete from public.sanci_products where id = 'c4000000-0000-0000-0000-00000000000c';
select public.test_logout();

-- Admin creates: an INACTIVE throwaway product (T2/T4's negative case) and
-- two gallery photos on the ACTIVE fixture product 'Sofa X' (a4000000...).
select public.test_login('33333333-3333-3333-3333-333333333333');
insert into public.sanci_products (id, name, code, status)
values ('c4000000-0000-0000-0000-00000000000c', 'Produk Ditarik', 'DITARIK', 'INACTIVE');
insert into public.product_photos (id, product_id, photo_url, sort_order)
values
  ('d1000000-0000-0000-0000-00000000000d', 'a4000000-0000-0000-0000-00000000000a',
   'https://example.test/product-photos/a4000000/gallery/1.webp?v=1', 1),
  ('d2000000-0000-0000-0000-00000000000d', 'a4000000-0000-0000-0000-00000000000a',
   'https://example.test/product-photos/a4000000/gallery/0.webp?v=1', 0),
  ('d3000000-0000-0000-0000-00000000000d', 'c4000000-0000-0000-0000-00000000000c',
   'https://example.test/product-photos/c4000000/gallery/0.webp?v=1', 0);
select public.test_logout();

-- ============================================================
-- T1: anon reads the ACTIVE product's photos (both rows, gallery works
--     with zero login and zero catalog access anywhere).
-- ============================================================
set role app_test_user;
select public.test_logout();
select case when count(*) = 2 then 'PASS T1 anon reads both photos of the ACTIVE product'
            else 'FAIL T1 anon saw ' || count(*) || ' photo row(s) for the ACTIVE product' end
from public.product_photos where product_id = 'a4000000-0000-0000-0000-00000000000a';
select case when count(*) = 1 then 'PASS T1b anon reads the ACTIVE product row itself'
            else 'FAIL T1b anon saw ' || count(*) || ' sanci_products row(s) for the ACTIVE product' end
from public.sanci_products where id = 'a4000000-0000-0000-0000-00000000000a';

-- ============================================================
-- T2: anon reads ZERO rows for the INACTIVE product — neither the product
--     row itself nor its photo.
-- ============================================================
select case when count(*) = 0 then 'PASS T2 anon: 0 rows for the INACTIVE product'
            else 'FAIL T2 anon saw ' || count(*) || ' sanci_products row(s) for the INACTIVE product' end
from public.sanci_products where id = 'c4000000-0000-0000-0000-00000000000c';
select case when count(*) = 0 then 'PASS T2b anon: 0 photo rows for the INACTIVE product'
            else 'FAIL T2b anon saw ' || count(*) || ' photo row(s) for the INACTIVE product' end
from public.product_photos where product_id = 'c4000000-0000-0000-0000-00000000000c';

-- ============================================================
-- T3: anon cannot write. INSERT into product_photos is rejected outright
--     (no existing row for it to "belong" to a passing SELECT policy);
--     UPDATE on sanci_products is a silent 0-row no-op, value untouched.
-- ============================================================
do $$
begin
  begin
    insert into public.product_photos (product_id, photo_url)
    values ('a4000000-0000-0000-0000-00000000000a', 'https://example.test/hacked.webp');
    raise exception 'FAIL T3 anon photo insert was accepted';
  exception
    when insufficient_privilege then
      raise notice 'PASS T3 anon photo insert rejected (42501)';
    when raise_exception then raise;
  end;
end;
$$;

update public.sanci_products set name = 'HACKED' where id = 'a4000000-0000-0000-0000-00000000000a';
select case when count(*) = 0 then 'PASS T3b anon update affected 0 rows silently'
            else 'FAIL T3b anon update affected ' || count(*) || ' row(s)' end
from public.sanci_products where id = 'a4000000-0000-0000-0000-00000000000a' and name = 'HACKED';
select public.test_logout();
reset role;

-- ============================================================
-- T4: authenticated partner B (10_fixtures user, no sanci_catalog_access
--     row for Partner B at this point in the suite — fixtures ship none)
--     still reads ZERO rows from sanci_products AND product_photos. Proves
--     sp_anon_read/ph_anon_read (auth.uid() is null) did NOT leak the
--     ACTIVE catalog to a logged-in partner whose catalog isn't open.
-- ============================================================
set role app_test_user;
select public.test_login('22222222-2222-2222-2222-222222222222');
select case when count(*) = 0 then 'PASS T4 logged-in partner (catalog closed) still reads 0 sanci_products rows'
            else 'FAIL T4 partner saw ' || count(*) || ' sanci_products row(s) with catalog closed' end
from public.sanci_products;
select case when count(*) = 0 then 'PASS T4b logged-in partner (catalog closed) still reads 0 product_photos rows'
            else 'FAIL T4b partner saw ' || count(*) || ' product_photos row(s) with catalog closed' end
from public.product_photos;
select public.test_logout();
reset role;

-- Open the catalog for Partner A only (mirrors 90_behavior_0021.sql) — from
-- here on T5 proves the PRE-EXISTING partner gate (sp_partner_read/
-- ph_partner_read) still works exactly as before 0022.
select public.test_login('33333333-3333-3333-3333-333333333333');
insert into public.sanci_catalog_access (partner_id, enabled)
values ('a0000000-0000-0000-0000-00000000000a', true)
on conflict (partner_id) do update set enabled = true;
select public.test_logout();

-- ============================================================
-- T5: partner A (catalog open) reads the ACTIVE product's gallery, ordered
--     (sort_order, created_at, id) — the migration's documented order.
-- ============================================================
set role app_test_user;
select public.test_login('11111111-1111-1111-1111-111111111111');
select case when count(*) = 2 then 'PASS T5 partner A (catalog open) reads both gallery photos'
            else 'FAIL T5 partner A saw ' || count(*) || ' photo row(s)' end
from public.product_photos where product_id = 'a4000000-0000-0000-0000-00000000000a';
select case when array_agg(id order by sort_order, created_at, id) =
                  array['d2000000-0000-0000-0000-00000000000d'::uuid, 'd1000000-0000-0000-0000-00000000000d'::uuid]
            then 'PASS T5b gallery order is sort_order, created_at, id (0 before 1)'
            else 'FAIL T5b unexpected gallery order' end
from public.product_photos where product_id = 'a4000000-0000-0000-0000-00000000000a';
select public.test_logout();
reset role;

-- ============================================================
-- T6: anon — zero rows on the three tables 0022 must NEVER expose.
-- ============================================================
set role app_test_user;
select public.test_logout();
select case when count(*) = 0 then 'PASS T6a anon: 0 product_prices rows'
            else 'FAIL T6a anon saw ' || count(*) || ' product_prices row(s)' end
from public.product_prices;
select case when count(*) = 0 then 'PASS T6b anon: 0 partner_orders rows'
            else 'FAIL T6b anon saw ' || count(*) || ' partner_orders row(s)' end
from public.partner_orders;
select case when count(*) = 0 then 'PASS T6c anon: 0 sanci_catalog_access rows'
            else 'FAIL T6c anon saw ' || count(*) || ' sanci_catalog_access row(s)' end
from public.sanci_catalog_access;
reset role;

-- ============================================================
-- T7: admin full CRUD + FK RESTRICT.
-- ============================================================
select public.test_login('33333333-3333-3333-3333-333333333333');
delete from public.product_photos where id = 'd1000000-0000-0000-0000-00000000000d';
select case when count(*) = 1 then 'PASS T7 admin deleted one gallery photo, one remains'
            else 'FAIL T7 expected 1 remaining photo, got ' || count(*) end
from public.product_photos where product_id = 'a4000000-0000-0000-0000-00000000000a';

do $$
begin
  begin
    delete from public.sanci_products where id = 'c4000000-0000-0000-0000-00000000000c';
    raise exception 'FAIL T7b deleting a product with a photo row was accepted (FK should RESTRICT)';
  exception
    when foreign_key_violation then
      raise notice 'PASS T7b FK RESTRICT blocked deleting a product that still has a photo row';
  end;
end;
$$;

-- ============================================================
-- T8: audit — PRODUCT_PHOTO_CREATED/DELETED carry partner_id/branch_id
--     NULL and actor_role SANCI_ADMIN (photos belong to SANCI, 0010 pattern).
-- ============================================================
select case when count(*) >= 1 then 'PASS T8 PRODUCT_PHOTO_CREATED audited, partner_id/branch_id NULL, SANCI_ADMIN'
            else 'FAIL T8 no matching PRODUCT_PHOTO_CREATED audit row' end
from public.audit_logs
where action = 'PRODUCT_PHOTO_CREATED' and entity_type = 'product_photos'
  and entity_id = 'd2000000-0000-0000-0000-00000000000d'
  and partner_id is null and branch_id is null and actor_role = 'SANCI_ADMIN';
select case when count(*) >= 1 then 'PASS T8b PRODUCT_PHOTO_DELETED audited with before payload'
            else 'FAIL T8b no matching PRODUCT_PHOTO_DELETED audit row' end
from public.audit_logs
where action = 'PRODUCT_PHOTO_DELETED' and entity_type = 'product_photos'
  and entity_id = 'd1000000-0000-0000-0000-00000000000d'
  and before is not null and actor_role = 'SANCI_ADMIN';
select public.test_logout();

-- ============================================================
-- Cleanup: remove EVERYTHING this file created (photo rows + throwaway
-- product + Partner A catalog access) so earlier suites / re-runs start
-- from fixture state.
-- ============================================================
select public.test_login('33333333-3333-3333-3333-333333333333');
delete from public.product_photos
 where product_id in ('a4000000-0000-0000-0000-00000000000a', 'c4000000-0000-0000-0000-00000000000c');
delete from public.sanci_products where id = 'c4000000-0000-0000-0000-00000000000c';
delete from public.sanci_catalog_access where partner_id = 'a0000000-0000-0000-0000-00000000000a';
select public.test_logout();

select 'DONE 0022 behavior suite' as note;
