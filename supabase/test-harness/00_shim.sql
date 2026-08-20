-- ============================================================
-- Shim Supabase minimal untuk pengujian migration di Postgres 16 polos.
-- BUKAN bagian dari rantai migration bernomor — hanya dipakai lokal.
--
-- Menyediakan: schema auth (users, uid()), schema storage (buckets, objects
-- + RLS aktif), role anon/authenticated, dan helper untuk "login sebagai"
-- pengguna tertentu di dalam sesi psql (set_config, bukan JWT sungguhan).
-- ============================================================

create extension if not exists pgcrypto;

-- ── schema auth ──────────────────────────────────────────────
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  created_at timestamptz not null default now()
);

-- auth.uid(): baca dari GUC sesi 'app.test_uid'. Supabase sungguhan membaca
-- ini dari JWT; di shim ini kita set manual per sesi test lewat
-- select set_config('app.test_uid', '<uuid>', false).
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('app.test_uid', true), '')::uuid;
$$;

-- ── roles ─────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'app_test_user') then
    create role app_test_user login;
  end if;
end;
$$;

grant anon to app_test_user;
grant authenticated to app_test_user;
grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to anon;
alter default privileges in schema public grant usage, select on sequences to authenticated, anon;

-- ── schema storage (minimal) ─────────────────────────────────
create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  created_at timestamptz not null default now()
);

alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.buckets to anon, authenticated;
grant select, insert, update, delete on storage.objects to anon, authenticated;

-- ── helper: jalankan blok sebagai pengguna tertentu ─────────
-- Dipakai di skrip tes: select test_login('<uuid>'); ... select test_logout();
create or replace function public.test_login(p_uid uuid) returns void
language sql as $$
  select set_config('app.test_uid', p_uid::text, false);
$$;

create or replace function public.test_logout() returns void
language sql as $$
  select set_config('app.test_uid', '', false);
$$;
