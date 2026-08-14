-- ============================================================
-- Migration 0002: ikat akun SANCI Super Admin
-- PRASYARAT: buat user dulu di Dashboard → Authentication → Add user
--            dengan email di bawah, baru jalankan file ini.
-- ============================================================

insert into public.platform_admins (auth_user_id, note)
select id, 'Jenzo — SANCI Super Admin'
from auth.users
where email = 'wahana.elite@gmail.com'
on conflict do nothing;

-- Verifikasi (hasil di-copy balik ke Claude): harap ADMIN_BOUND | 1
select 'ADMIN_BOUND' as check_type, count(*)::text as result
from public.platform_admins pa
join auth.users u on u.id = pa.auth_user_id
where u.email = 'wahana.elite@gmail.com';
