-- ============================================================
-- SANCI Partner Hub — Phase 1 Partner Logo (SPEC §41)
-- Migration 0003: storage bucket + storage RLS  (idempotent — aman dijalankan ulang)
-- Jalankan di: Supabase Studio → SQL Editor → paste seluruh file → Run
--
-- Catatan: kolom public.partners.logo_url SUDAH dibuat di 0001 (baris 15),
-- jadi di sini TIDAK ditambah lagi. Blok verifikasi di bawah tetap
-- memastikan kolom itu benar-benar ada.
-- ============================================================

-- ── 1. Bucket ───────────────────────────────────────────────
-- public = true: logo harus bisa dilihat siapa saja yang membuka aplikasi,
-- termasuk pengguna cabang (/cabang) — logo bukan data rahasia.
-- Batas ukuran + daftar tipe berkas di sini adalah pertahanan SERVER.
-- Pengecilan gambar di browser hanya kenyamanan, bukan pengaman.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('partner-logos', 'partner-logos', true, 5242880,
        array['image/png','image/jpeg','image/webp'])
on conflict (id) do update
  set public            = true,
      file_size_limit   = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── 2. Storage RLS ──────────────────────────────────────────
-- RLS pada storage.objects sudah aktif bawaan Supabase — sengaja TIDAK
-- dipanggil `alter table ... enable row level security` di sini, karena tabel
-- itu milik supabase_storage_admin dan perintah tersebut bisa ditolak.
--
-- Batas keamanan yang sebenarnya ada di sini. UI yang menyembunyikan tombol
-- unggah dari non-admin hanya soal tampilan (LESSONS #5).

-- Baca: siapa saja (termasuk yang belum login) — bucket ini memang publik.
drop policy if exists partner_logos_public_read on storage.objects;
create policy partner_logos_public_read on storage.objects
  for select using (bucket_id = 'partner-logos');

-- Tulis/ubah/hapus: HANYA admin platform (helper security definer dari 0001).
drop policy if exists partner_logos_admin_insert on storage.objects;
create policy partner_logos_admin_insert on storage.objects
  for insert with check (bucket_id = 'partner-logos' and public.fn_is_admin());

-- upsert ke path yang sama = UPDATE, jadi policy update wajib ada.
drop policy if exists partner_logos_admin_update on storage.objects;
create policy partner_logos_admin_update on storage.objects
  for update using (bucket_id = 'partner-logos' and public.fn_is_admin())
       with check (bucket_id = 'partner-logos' and public.fn_is_admin());

drop policy if exists partner_logos_admin_delete on storage.objects;
create policy partner_logos_admin_delete on storage.objects
  for delete using (bucket_id = 'partner-logos' and public.fn_is_admin());

-- ── 3. Verifikasi (hasilnya di-copy balik ke Claude) ────────
-- Harapan: BUCKET 1 · BUCKET_PUBLIC true · STORAGE_POLICIES 4 · LOGO_URL_COLUMN 1

select 'BUCKET' as check_type,
       count(*)::text as result
from storage.buckets
where id = 'partner-logos'
union all
select 'BUCKET_PUBLIC',
       coalesce((select public::text from storage.buckets where id = 'partner-logos'), 'TIDAK ADA')
union all
select 'STORAGE_POLICIES', count(*)::text
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname like 'partner_logos_%'
union all
select 'LOGO_URL_COLUMN', count(*)::text
from information_schema.columns
where table_schema = 'public'
  and table_name = 'partners'
  and column_name = 'logo_url';
