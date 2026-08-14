-- ============================================================
-- SANCI Partner Hub — Phase 1 Partner Foundation
-- Migration 0001: schema + RLS + audit  (idempotent — aman dijalankan ulang)
-- Jalankan di: Supabase Studio → SQL Editor → paste seluruh file → Run
-- ============================================================

create extension if not exists pgcrypto;

-- ── 1. Tables ────────────────────────────────────────────────

create table if not exists public.partners (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  code              text not null unique check (code ~ '^[A-Z0-9-]{2,8}$'),
  logo_url          text,
  contact_name      text,
  contact_phone     text,
  status            text not null default 'DRAFT'
                    check (status in ('DRAFT','ACTIVE','SUSPENDED','INACTIVE')),
  client_request_id uuid unique,          -- idempotency: weak-network duplicate guard (SPEC §61)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.partner_branches (
  id                uuid primary key default gen_random_uuid(),
  partner_id        uuid not null references public.partners(id) on delete restrict,
  name              text not null,
  code              text not null check (code ~ '^[A-Z0-9-]{2,8}$'),
  address           text not null,
  city              text,
  province          text,
  contact_name      text,
  contact_phone     text,
  status            text not null default 'ACTIVE'
                    check (status in ('DRAFT','ACTIVE','SUSPENDED','INACTIVE')),
  client_request_id uuid unique,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (partner_id, code)               -- GH/CBR unik; MN/CBR boleh ada (SPEC §15)
);

create table if not exists public.partner_staff (
  id                uuid primary key default gen_random_uuid(),
  partner_id        uuid not null references public.partners(id) on delete restrict,
  full_name         text not null,
  phone             text,
  status            text not null default 'ACTIVE'
                    check (status in ('ACTIVE','INACTIVE')),
  client_request_id uuid unique,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.partner_staff_assignments (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references public.partner_staff(id) on delete restrict,
  branch_id  uuid not null references public.partner_branches(id) on delete restrict,
  role       text not null check (role in ('Sales','Resepsionis / CS','Manajer','Lainnya')),
  start_at   date not null default current_date,
  end_at     date check (end_at is null or end_at >= start_at),
  status     text not null default 'ACTIVE' check (status in ('ACTIVE','ENDED')),
  created_at timestamptz not null default now()
);
-- satu penugasan aktif per staf
create unique index if not exists uq_active_assignment
  on public.partner_staff_assignments (staff_id) where end_at is null;

create table if not exists public.partner_users (
  id           uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  name         text not null,
  partner_id   uuid not null references public.partners(id) on delete restrict,
  branch_id    uuid not null references public.partner_branches(id) on delete restrict,
  staff_id     uuid references public.partner_staff(id) on delete restrict,
  role         text not null default 'BRANCH_USER' check (role in ('BRANCH_USER')),
  status       text not null default 'ACTIVE' check (status in ('ACTIVE','DISABLED')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.partner_access_policies (
  partner_id       uuid primary key references public.partners(id) on delete cascade,
  visibility_scope text not null default 'OWN_BRANCH'
                   check (visibility_scope in ('OWN_BRANCH','PARTNER_ALL_BRANCHES','SELECTED_BRANCHES')),
  edit_scope       text not null default 'OWN_BRANCH'
                   check (edit_scope in ('OWN_BRANCH','PARTNER_ALL_BRANCHES')),
  configured       boolean not null default false,
  updated_at       timestamptz not null default now()
);

create table if not exists public.partner_branch_access_rules (
  id             uuid primary key default gen_random_uuid(),
  partner_id     uuid not null references public.partners(id) on delete restrict,
  from_branch_id uuid not null references public.partner_branches(id) on delete restrict,
  to_branch_id   uuid not null references public.partner_branches(id) on delete restrict,
  can_view       boolean not null default true,
  can_edit       boolean not null default false,
  created_at     timestamptz not null default now(),
  unique (from_branch_id, to_branch_id)
);

create table if not exists public.platform_admins (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  note         text,
  created_at   timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id            bigint generated always as identity primary key,
  actor_user_id uuid,
  actor_role    text not null,
  action        text not null,
  entity_type   text not null,
  entity_id     text,
  partner_id    uuid,   -- tanpa FK: log harus tetap ada walau draf dihapus permanen
  branch_id     uuid,
  before        jsonb,
  after         jsonb,
  reason        text,
  created_at    timestamptz not null default now()   -- waktu server (SPEC §67)
);

-- ── 2. Helper functions (security definer) ──────────────────

create or replace function public.fn_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where auth_user_id = auth.uid());
$$;

create or replace function public.fn_pu_partner() returns uuid
language sql stable security definer set search_path = public as $$
  select partner_id from partner_users
  where auth_user_id = auth.uid() and status = 'ACTIVE';
$$;

create or replace function public.fn_pu_branch() returns uuid
language sql stable security definer set search_path = public as $$
  select branch_id from partner_users
  where auth_user_id = auth.uid() and status = 'ACTIVE';
$$;

create or replace function public.fn_can_view_branch(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when public.fn_is_admin() then true
    when public.fn_pu_partner() is null then false
    else exists (
      select 1 from partner_branches br
      join partner_access_policies pol on pol.partner_id = br.partner_id
      where br.id = b
        and br.partner_id = public.fn_pu_partner()
        and (br.id = public.fn_pu_branch()
             or pol.visibility_scope = 'PARTNER_ALL_BRANCHES')
    )
  end;
$$;

create or replace function public.fn_can_edit_branch(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when public.fn_is_admin() then true
    when public.fn_pu_partner() is null then false
    else exists (
      select 1 from partner_branches br
      join partner_access_policies pol on pol.partner_id = br.partner_id
      where br.id = b
        and br.partner_id = public.fn_pu_partner()
        and (br.id = public.fn_pu_branch()
             or (pol.visibility_scope = 'PARTNER_ALL_BRANCHES'
                 and pol.edit_scope = 'PARTNER_ALL_BRANCHES'))
    )
  end;
$$;

-- Visibilitas staf: HARUS security definer — subquery di dalam policy ikut terfilter RLS,
-- sehingga penugasan cabang lain "tak terlihat" dan staf itu salah dianggap tanpa penugasan (bocor nama).
create or replace function public.fn_can_view_staff(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.fn_is_admin() or (
    exists (select 1 from partner_staff s
            where s.id = sid and s.partner_id = public.fn_pu_partner())
    and (
      exists (select 1 from partner_staff_assignments a
              where a.staff_id = sid and a.end_at is null
                and public.fn_can_view_branch(a.branch_id))
      or not exists (select 1 from partner_staff_assignments a
                     where a.staff_id = sid and a.end_at is null)
    ));
$$;

create or replace function public.fn_can_edit_staff(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.fn_is_admin() or (
    exists (select 1 from partner_staff s
            where s.id = sid and s.partner_id = public.fn_pu_partner())
    and exists (select 1 from partner_staff_assignments a
                where a.staff_id = sid and a.end_at is null
                  and public.fn_can_edit_branch(a.branch_id))
  );
$$;

-- updated_at otomatis
create or replace function public.fn_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ── 3. Audit trigger (append-only, server timestamp) ────────

create or replace function public.fn_audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_prefix text;
  v_action text;
  v_partner uuid;
  v_branch uuid;
  v_role text;
  rec jsonb;
  old_rec jsonb;
begin
  v_prefix := case tg_table_name
    when 'partners' then 'PARTNER'
    when 'partner_branches' then 'BRANCH'
    when 'partner_staff' then 'STAFF'
    when 'partner_staff_assignments' then 'STAFF_ASSIGNMENT'
    when 'partner_users' then 'USER'
    when 'partner_access_policies' then 'PERMISSION'
    else upper(tg_table_name) end;

  if tg_op = 'INSERT' then
    rec := to_jsonb(new); old_rec := null;
    v_action := v_prefix || '_CREATED';
  elsif tg_op = 'UPDATE' then
    rec := to_jsonb(new); old_rec := to_jsonb(old);
    if (old_rec ? 'status') and (old_rec->>'status') is distinct from (rec->>'status') then
      v_action := v_prefix || '_STATUS_CHANGED';
    elsif tg_table_name = 'partner_access_policies' then
      v_action := 'PERMISSION_CHANGED';
    else
      v_action := v_prefix || '_UPDATED';
    end if;
  else
    rec := null; old_rec := to_jsonb(old);
    v_action := v_prefix || '_DELETED';
  end if;

  v_partner := coalesce(
    nullif(coalesce(rec->>'partner_id', old_rec->>'partner_id'),'')::uuid,
    case when tg_table_name = 'partners'
      then coalesce(rec->>'id', old_rec->>'id')::uuid end);
  v_branch := case
    when tg_table_name = 'partner_branches' then coalesce(rec->>'id', old_rec->>'id')::uuid
    else nullif(coalesce(rec->>'branch_id', old_rec->>'branch_id'),'')::uuid end;
  v_role := case when public.fn_is_admin() then 'SANCI_ADMIN'
                 when auth.uid() is null then 'SYSTEM'
                 else 'PARTNER_USER' end;

  insert into audit_logs (actor_user_id, actor_role, action, entity_type, entity_id,
                          partner_id, branch_id, before, after)
  values (auth.uid(), v_role, v_action, tg_table_name,
          coalesce(rec->>'id', old_rec->>'id', rec->>'partner_id', old_rec->>'partner_id'),
          v_partner, v_branch, old_rec, rec);
  return coalesce(new, old);
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['partners','partner_branches','partner_staff',
                           'partner_staff_assignments','partner_users','partner_access_policies']
  loop
    execute format('drop trigger if exists trg_audit on public.%I', t);
    execute format('create trigger trg_audit after insert or update or delete on public.%I
                    for each row execute function public.fn_audit_row()', t);
    if t in ('partners','partner_branches','partner_staff','partner_users') then
      execute format('drop trigger if exists trg_touch on public.%I', t);
      execute format('create trigger trg_touch before update on public.%I
                      for each row execute function public.fn_touch_updated_at()', t);
    end if;
  end loop;
end;
$$;

-- ── 4. Integrity triggers (lintas tabel) ────────────────────

-- user.branch harus milik user.partner
create or replace function public.fn_check_user_branch() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from partner_branches
                 where id = new.branch_id and partner_id = new.partner_id) then
    raise exception 'branch % bukan milik partner %', new.branch_id, new.partner_id;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_user_branch on public.partner_users;
create trigger trg_user_branch before insert or update on public.partner_users
  for each row execute function public.fn_check_user_branch();

-- assignment: staff dan branch harus satu partner
create or replace function public.fn_check_assignment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from partner_staff s join partner_branches b on b.partner_id = s.partner_id
    where s.id = new.staff_id and b.id = new.branch_id) then
    raise exception 'staff dan branch bukan satu partner';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_check_assignment on public.partner_staff_assignments;
create trigger trg_check_assignment before insert or update on public.partner_staff_assignments
  for each row execute function public.fn_check_assignment();

-- ── 5. Row Level Security ───────────────────────────────────

alter table public.partners                    enable row level security;
alter table public.partner_branches            enable row level security;
alter table public.partner_staff               enable row level security;
alter table public.partner_staff_assignments   enable row level security;
alter table public.partner_users               enable row level security;
alter table public.partner_access_policies     enable row level security;
alter table public.partner_branch_access_rules enable row level security;
alter table public.platform_admins             enable row level security;
alter table public.audit_logs                  enable row level security;

-- partners
drop policy if exists p_admin_all on public.partners;
create policy p_admin_all on public.partners
  for all using (public.fn_is_admin()) with check (public.fn_is_admin());
drop policy if exists p_partner_read on public.partners;
create policy p_partner_read on public.partners
  for select using (id = public.fn_pu_partner());

-- partner_branches
drop policy if exists b_admin_all on public.partner_branches;
create policy b_admin_all on public.partner_branches
  for all using (public.fn_is_admin()) with check (public.fn_is_admin());
drop policy if exists b_partner_read on public.partner_branches;
create policy b_partner_read on public.partner_branches
  for select using (public.fn_can_view_branch(id));

-- partner_staff  (visibilitas lewat penugasan aktif; tulis lewat cakupan edit)
drop policy if exists s_admin_all on public.partner_staff;
create policy s_admin_all on public.partner_staff
  for all using (public.fn_is_admin()) with check (public.fn_is_admin());
drop policy if exists s_partner_read on public.partner_staff;
create policy s_partner_read on public.partner_staff
  for select using (public.fn_can_view_staff(id));
drop policy if exists s_partner_insert on public.partner_staff;
create policy s_partner_insert on public.partner_staff
  for insert with check (partner_id = public.fn_pu_partner());
drop policy if exists s_partner_update on public.partner_staff;
create policy s_partner_update on public.partner_staff
  for update using (public.fn_can_edit_staff(id));

-- partner_staff_assignments
drop policy if exists a_admin_all on public.partner_staff_assignments;
create policy a_admin_all on public.partner_staff_assignments
  for all using (public.fn_is_admin()) with check (public.fn_is_admin());
drop policy if exists a_partner_read on public.partner_staff_assignments;
create policy a_partner_read on public.partner_staff_assignments
  for select using (public.fn_can_view_branch(branch_id));
drop policy if exists a_partner_insert on public.partner_staff_assignments;
create policy a_partner_insert on public.partner_staff_assignments
  for insert with check (public.fn_can_edit_branch(branch_id));
drop policy if exists a_partner_update on public.partner_staff_assignments;
create policy a_partner_update on public.partner_staff_assignments
  for update using (public.fn_can_edit_branch(branch_id));

-- partner_users  (Phase 1: hanya SANCI Admin yang kelola; user lihat dirinya sendiri)
drop policy if exists u_admin_all on public.partner_users;
create policy u_admin_all on public.partner_users
  for all using (public.fn_is_admin()) with check (public.fn_is_admin());
drop policy if exists u_self_read on public.partner_users;
create policy u_self_read on public.partner_users
  for select using (auth_user_id = auth.uid());

-- partner_access_policies
drop policy if exists pol_admin_all on public.partner_access_policies;
create policy pol_admin_all on public.partner_access_policies
  for all using (public.fn_is_admin()) with check (public.fn_is_admin());
drop policy if exists pol_partner_read on public.partner_access_policies;
create policy pol_partner_read on public.partner_access_policies
  for select using (partner_id = public.fn_pu_partner());

-- partner_branch_access_rules (fase depan — admin saja)
drop policy if exists r_admin_all on public.partner_branch_access_rules;
create policy r_admin_all on public.partner_branch_access_rules
  for all using (public.fn_is_admin()) with check (public.fn_is_admin());

-- platform_admins (baca: admin & diri sendiri; tulis: tidak ada via API)
drop policy if exists pa_read on public.platform_admins;
create policy pa_read on public.platform_admins
  for select using (public.fn_is_admin() or auth_user_id = auth.uid());

-- audit_logs (baca: admin saja; tulis: hanya lewat trigger — tanpa insert policy)
drop policy if exists al_admin_read on public.audit_logs;
create policy al_admin_read on public.audit_logs
  for select using (public.fn_is_admin());

-- ── 6. Verifikasi (hasilnya di-copy balik ke Claude) ────────

select 'TABLES' as check_type,
       count(*)::text as result
from information_schema.tables
where table_schema = 'public'
  and table_name in ('partners','partner_branches','partner_staff',
                     'partner_staff_assignments','partner_users',
                     'partner_access_policies','partner_branch_access_rules',
                     'platform_admins','audit_logs')
union all
select 'RLS_ENABLED', count(*)::text
from pg_tables
where schemaname = 'public' and rowsecurity = true
union all
select 'POLICIES', count(*)::text
from pg_policies where schemaname = 'public'
union all
select 'TRIGGERS', count(distinct tgname || '.' || tgrelid::regclass::text)::text
from pg_trigger
where not tgisinternal and tgrelid::regclass::text like 'partner%';
