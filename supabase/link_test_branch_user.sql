-- ============================================================
-- Menghubungkan satu akun login ke Partner + Cabang (untuk menguji /cabang).
-- BUKAN migration bernomor — jalankan manual, isi sesuai kebutuhan.
--
-- PRASYARAT: buat dulu di Dashboard → Authentication → Add user
--            dengan email pilihan Anda (boleh email uji coba Anda sendiri).
-- ============================================================

-- Ganti tiga nilai di bawah ini:
--   email_login   = email yang baru dibuat di Authentication
--   kode_partner  = kode partner (contoh: 'GH')
--   kode_cabang   = kode cabang (contoh: 'CBR')

insert into public.partner_users (auth_user_id, name, partner_id, branch_id, status)
select
  u.id,
  'Test Cabang',                    -- ganti dengan nama tampilan yang diinginkan
  p.id,
  b.id,
  'ACTIVE'
from auth.users u
cross join public.partners p
join public.partner_branches b on b.partner_id = p.id
where u.email = 'GANTI_EMAIL_DI_SINI'
  and p.code = 'GANTI_KODE_PARTNER'
  and b.code = 'GANTI_KODE_CABANG'
on conflict do nothing;

-- Verifikasi (harap 1 baris):
select pu.name, p.name as partner, b.name as cabang, pu.status
from public.partner_users pu
join public.partners p on p.id = pu.partner_id
join public.partner_branches b on b.id = pu.branch_id
where pu.name = 'Test Cabang';
