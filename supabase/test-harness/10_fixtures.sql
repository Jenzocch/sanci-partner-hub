-- Fixtures for behavioral testing of 0014. Run as superuser (postgres).
select public.test_logout();

-- Two partners, one branch each, one branch-user each, one product, one
-- package with that product, one order for Partner A / Branch A.
insert into public.partners (id, name, code, status) values
  ('a0000000-0000-0000-0000-00000000000a', 'Partner A', 'PA', 'ACTIVE'),
  ('b0000000-0000-0000-0000-00000000000b', 'Partner B', 'PB', 'ACTIVE')
on conflict (id) do nothing;

insert into public.partner_branches (id, partner_id, name, code, address, status) values
  ('a1000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'Branch A1', 'A1', 'Jl A', 'ACTIVE'),
  ('b1000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-00000000000b', 'Branch B1', 'B1', 'Jl B', 'ACTIVE')
on conflict (id) do nothing;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'branch-a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'branch-b@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'admin@test.local')
on conflict (id) do nothing;

insert into public.platform_admins (auth_user_id, note) values
  ('33333333-3333-3333-3333-333333333333', 'test admin')
on conflict do nothing;

insert into public.partner_users (id, auth_user_id, name, partner_id, branch_id, status) values
  ('a2000000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'User A1', 'a0000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a', 'ACTIVE'),
  ('b2000000-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222', 'User B1', 'b0000000-0000-0000-0000-00000000000b', 'b1000000-0000-0000-0000-00000000000b', 'ACTIVE')
on conflict (id) do nothing;

insert into public.partner_staff (id, partner_id, full_name, status) values
  ('a3000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'Sales A', 'ACTIVE')
on conflict (id) do nothing;
insert into public.partner_staff_assignments (staff_id, branch_id, role) values
  ('a3000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a', 'Sales')
on conflict do nothing;

insert into public.sanci_products (id, name, code, status) values
  ('a4000000-0000-0000-0000-00000000000a', 'Sofa X', 'SOFA-X', 'ACTIVE')
on conflict (id) do nothing;

insert into public.partner_packages (id, partner_id, name, code, status) values
  ('a5000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'Paket 1', 'PKT1', 'ACTIVE')
on conflict (id) do nothing;
insert into public.partner_package_items (package_id, product_id, quantity) values
  ('a5000000-0000-0000-0000-00000000000a', 'a4000000-0000-0000-0000-00000000000a', 2)
on conflict do nothing;

-- Order for Partner A / Branch A1, created as admin (bypasses RLS, simplest for fixture).
select public.test_login('33333333-3333-3333-3333-333333333333');

insert into public.customers (id, full_name, phone, phone_normalized, created_via_partner_id, created_via_branch_id)
values ('a7000000-0000-0000-0000-00000000000a', 'Cust A', '0812', '62812',
        'a0000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a')
on conflict (id) do nothing;

insert into public.partner_orders (id, customer_id, partner_id, branch_id, partner_sales_staff_id, package_name, package_id, status)
values ('a6000000-0000-0000-0000-00000000000a', 'a7000000-0000-0000-0000-00000000000a',
        'a0000000-0000-0000-0000-00000000000a', 'a1000000-0000-0000-0000-00000000000a',
        'a3000000-0000-0000-0000-00000000000a', 'Paket 1', 'a5000000-0000-0000-0000-00000000000a', 'REGISTERED')
on conflict (id) do nothing;
select public.test_logout();

select 'FIXTURES_ORDER' as check_type, count(*)::text from public.partner_orders where id = 'a6000000-0000-0000-0000-00000000000a';
