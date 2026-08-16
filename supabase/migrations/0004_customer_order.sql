-- ============================================================
-- SANCI Partner Hub — Phase 2 Customer & Partner Order
-- Migration 0004: schema + order number + RLS + audit  (idempotent — aman dijalankan ulang)
-- Jalankan di: Supabase Studio → SQL Editor → paste seluruh file → Run
--
-- PRASYARAT: migration 0001 SUDAH dijalankan. File ini memakai ulang helper
-- security definer dari 0001 (fn_is_admin, fn_pu_partner, fn_pu_branch,
-- fn_can_view_branch, fn_can_edit_branch), trigger fn_touch_updated_at, dan
-- fn_audit_row. Blok pengaman di bawah berhenti dengan pesan jelas kalau 0001
-- belum ada — jangan biarkan Jenzo menebak-nebak dari pesan error Postgres.
--
-- CATATAN normalisasi telepon: kolom phone_normalized diisi Server Action lewat
-- normalizePhoneID() di web/lib/orders-shared.ts. SQL SENGAJA tidak menduplikasi
-- logika itu — satu sumber kebenaran saja.
-- ============================================================

-- ── 0. Pengaman prasyarat ───────────────────────────────────

do $$
begin
  if to_regprocedure('public.fn_can_view_branch(uuid)') is null
     or to_regprocedure('public.fn_pu_branch()') is null
     or to_regprocedure('public.fn_audit_row()') is null then
    raise exception
      'Migration 0001_partner_foundation.sql belum dijalankan di database ini. Jalankan 0001 dulu, baru 0004.';
  end if;
end;
$$;

-- ── 1. Tables ───────────────────────────────────────────────

-- customers = IDENTITAS ORANG (SPEC §9, §12). Bukan milik partner mana pun.
-- created_via_* hanya CATATAN ASAL (SPEC §32), bukan kepemilikan permanen;
-- atribusi bisnis yang sesungguhnya ada di partner_orders.
create table if not exists public.customers (
  id                     uuid primary key default gen_random_uuid(),
  full_name              text not null,
  phone                  text not null,          -- input mentah apa adanya (SPEC §8)
  phone_normalized       text not null,          -- bentuk kanonik "62..." dari Server Action
  whatsapp               text,
  address                text,
  city                   text,
  province               text,
  notes                  text,
  -- null diperbolehkan: pelanggan yang dibuat langsung oleh SANCI Admin tanpa cabang
  created_via_partner_id uuid references public.partners(id) on delete restrict,
  created_via_branch_id  uuid references public.partner_branches(id) on delete restrict,
  created_by             uuid,                   -- auth.uid(), dipaksa trigger di bawah
  client_request_id      text unique,            -- idempotency jaringan lemah (LESSONS #3)
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- Telepon BUKAN identitas (SPEC §9): index ini untuk pencarian & peringatan
-- duplikat saja — SENGAJA tidak unique. Satu keluarga boleh berbagi nomor.
create index if not exists idx_customers_phone_normalized
  on public.customers (phone_normalized);

-- partner_orders = atribusi satu transaksi ke satu partner/cabang (SPEC §13, §14).
create table if not exists public.partner_orders (
  id                     uuid primary key default gen_random_uuid(),
  -- dibuat trigger BEFORE INSERT, tidak pernah dikirim client (SPEC §18)
  order_number           text not null unique,
  customer_id            uuid not null references public.customers(id) on delete restrict,
  -- inti atribusi: dipaksa RLS dari identitas login, bukan dari kiriman client (SPEC §14)
  partner_id             uuid not null references public.partners(id) on delete restrict,
  branch_id              uuid not null references public.partner_branches(id) on delete restrict,
  partner_sales_staff_id uuid references public.partner_staff(id) on delete restrict,
  partner_pic_staff_id   uuid references public.partner_staff(id) on delete restrict,
  -- irisan ini belum punya master partner_packages: teks bebas dulu (SPEC §19, §21)
  package_name           text not null,
  -- DEFAULT sengaja 'REGISTERED': order yang sudah tersimpan memang order sah
  -- (SPEC §40). Draft hidup di sisi client saja (SPEC §39), tidak pernah masuk
  -- tabel ini — jadi default ini tidak bisa jadi bencana senyap (LESSONS #8).
  -- 'CANCELLED' belum punya UI di irisan ini; kolom disiapkan lebih dulu.
  status                 text not null default 'REGISTERED'
                         check (status in ('REGISTERED','CANCELLED')),
  notes                  text,
  client_request_id      text unique,
  created_by             uuid,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- LESSONS #21: tabel ini punya DUA unique constraint. Kalau Server Action kena
-- 23505, WAJIB lihat nama constraint-nya dulu:
--   partner_orders_client_request_id_key → kiriman sebelumnya SUKSES, laporkan
--     berhasil (jangan suruh pengguna simpan ulang → jadi data dobel).
--   partner_orders_order_number_key      → bentrok nomor (pertahanan terakhir),
--     bukan salah pengguna; boleh dicoba ulang.
create index if not exists idx_partner_orders_partner  on public.partner_orders (partner_id);
create index if not exists idx_partner_orders_branch   on public.partner_orders (branch_id);
create index if not exists idx_partner_orders_customer on public.partner_orders (customer_id);

-- Penghitung nomor order per (cabang, tanggal). Tabel internal: TIDAK pernah
-- disentuh client — hanya lewat fungsi security definer di bawah.
create table if not exists public.partner_order_counters (
  branch_id  uuid not null references public.partner_branches(id) on delete restrict,
  seq_date   date not null,
  last_seq   integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (branch_id, seq_date)
);

-- ── 2. Nomor order (SPEC §17–18) ────────────────────────────

-- Ambil nomor urut berikutnya secara ATOMIK.
-- "INSERT ... ON CONFLICT DO UPDATE" mengunci baris (branch_id, seq_date) di
-- dalam transaksi yang sama dengan INSERT order-nya. Dua HP yang menekan Simpan
-- pada detik yang sama akan diantrikan Postgres, bukan mendapat angka kembar —
-- pola "SELECT dulu, baru INSERT" justru PASTI bentrok (LESSONS #3).
-- Kalau transaksinya rollback, kenaikan penghitung ikut batal → tidak ada nomor
-- yang terbuang.
create or replace function public.fn_next_order_seq(b uuid, d date) returns integer
language plpgsql security definer set search_path = public as $$
declare v_seq integer;
begin
  insert into partner_order_counters as c (branch_id, seq_date, last_seq)
  values (b, d, 1)
  on conflict (branch_id, seq_date) do update
    set last_seq = c.last_seq + 1, updated_at = now()
  returning c.last_seq into v_seq;
  return v_seq;
end;
$$;

-- Format: <PARTNER_CODE>-<BRANCH_CODE>-<YYMMDD>-<4 digit>  → GH-CBR-260816-0012
create or replace function public.fn_set_order_number() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_partner_code text;
  v_branch_code  text;
  v_date         date;
  v_seq          integer;
  v_number       text;
begin
  -- security definer: kode partner/cabang dibaca tanpa bergantung pada RLS
  select p.code, br.code into v_partner_code, v_branch_code
  from partner_branches br
  join partners p on p.id = br.partner_id
  where br.id = new.branch_id;

  if v_branch_code is null then
    raise exception 'cabang % tidak ditemukan saat membuat nomor order', new.branch_id;
  end if;

  -- Waktu server (LESSONS #11), tapi TANGGAL BISNIS Indonesia: tanpa konversi
  -- zona, order sore hari WIB akan tercatat sebagai hari berikutnya (UTC) dan
  -- penomoran harian jadi tidak masuk akal bagi pengguna.
  v_date := (now() at time zone 'Asia/Jakarta')::date;

  -- Normalnya sekali jalan. Perulangan hanya jaring pengaman kalau penghitung
  -- pernah bergeser (mis. baris counter dihapus manual) — daripada INSERT gagal
  -- di depan pengguna, ambil nomor berikutnya yang benar-benar kosong.
  for i in 1..10 loop
    v_seq   := public.fn_next_order_seq(new.branch_id, v_date);
    v_number := v_partner_code || '-' || v_branch_code || '-' ||
                to_char(v_date, 'YYMMDD') || '-' || lpad(v_seq::text, 4, '0');
    exit when not exists (select 1 from partner_orders o where o.order_number = v_number);
  end loop;

  -- Nilai kiriman client SELALU diabaikan (SPEC §18, LESSONS #6).
  new.order_number := v_number;
  return new;
end;
$$;

-- ── 3. Trigger integritas & created_by ──────────────────────

-- created_by tidak boleh dipercayakan pada client (LESSONS #6). Kalau ada sesi
-- login, kolom ini WAJIB pemilik sesi. Tanpa sesi (SQL Editor / seed) nilai
-- dibiarkan apa adanya supaya migrasi & perbaikan manual tidak ikut gagal.
create or replace function public.fn_set_created_by() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

-- Cabang harus milik partner-nya, dan staf yang diatribusikan harus staf partner
-- yang sama — mengikuti pola fn_check_assignment di 0001. RLS sudah memaksa hal
-- ini untuk pengguna cabang, tapi kolom staf tidak punya penjaga lain sama
-- sekali; tanpa ini order bisa menunjuk staf partner lain.
create or replace function public.fn_check_order_refs() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from partner_branches
                 where id = new.branch_id and partner_id = new.partner_id) then
    raise exception 'branch % bukan milik partner %', new.branch_id, new.partner_id;
  end if;

  if new.partner_sales_staff_id is not null
     and not exists (select 1 from partner_staff
                     where id = new.partner_sales_staff_id and partner_id = new.partner_id) then
    raise exception 'staf sales bukan milik partner %', new.partner_id;
  end if;

  if new.partner_pic_staff_id is not null
     and not exists (select 1 from partner_staff
                     where id = new.partner_pic_staff_id and partner_id = new.partner_id) then
    raise exception 'staf PIC bukan milik partner %', new.partner_id;
  end if;

  return new;
end;
$$;

-- ── 4. Visibilitas customer (LESSONS #15 — WAJIB security definer) ──

-- Pelanggan boleh dilihat kalau: admin, ATAU dibuat dari cabang yang terlihat,
-- ATAU punya order di cabang yang terlihat.
--
-- Cabang "ATAU punya order" itulah jebakannya: kalau subquery ke partner_orders
-- ditulis LANGSUNG di dalam policy, subquery itu ikut terfilter RLS tabel
-- partner_orders. Order yang tidak terlihat akan tampak "tidak ada", cabang OR
-- gagal secara diam-diam, dan aturannya salah arah. Di dalam security definer
-- fungsi ini membaca data yang SEBENARNYA ada.
--
-- Konsekuensi yang memang diinginkan (SPEC §91–93): pelanggan milik Partner B
-- yang tidak punya order di cabang kita TIDAK terlihat sama sekali — pencarian
-- lintas partner tidak boleh membocorkan relasi partner lain.
create or replace function public.fn_can_view_customer(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.fn_is_admin() or exists (
    select 1 from customers c
    where c.id = cid and public.fn_can_view_branch(c.created_via_branch_id)
  ) or exists (
    select 1 from partner_orders o
    where o.customer_id = cid and public.fn_can_view_branch(o.branch_id)
  );
$$;

-- ── 5. Audit: perluas pemetaan fn_audit_row (SPEC §61–63) ───

-- Definisi ulang UTUH (bukan tambalan) supaya file ini idempotent. Perubahan
-- dari 0001 hanya dua: pemetaan nama entitas untuk 'customers'/'partner_orders',
-- dan pengambilan partner/branch dari kolom created_via_* milik customers.
-- CATATAN untuk yang menjalankan ulang 0001 SETELAH file ini: pemetaan di sini
-- akan tertimpa dan aksi tercatat sebagai 'CUSTOMERS_CREATED' dsb. — tidak
-- membuat trigger meledak, tapi jalankan ulang 0004 untuk memulihkan penamaan.
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
    when 'customers' then 'CUSTOMER'
    when 'partner_orders' then 'ORDER'
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

  -- customers memakai created_via_partner_id / created_via_branch_id, bukan
  -- partner_id / branch_id. Coalesce berlapis: tabel lama tidak punya kunci
  -- created_via_* sehingga ->> mengembalikan null dan perilakunya tak berubah.
  v_partner := coalesce(
    nullif(coalesce(rec->>'partner_id', old_rec->>'partner_id'),'')::uuid,
    nullif(coalesce(rec->>'created_via_partner_id', old_rec->>'created_via_partner_id'),'')::uuid,
    case when tg_table_name = 'partners'
      then coalesce(rec->>'id', old_rec->>'id')::uuid end);
  v_branch := case
    when tg_table_name = 'partner_branches' then coalesce(rec->>'id', old_rec->>'id')::uuid
    else coalesce(
      nullif(coalesce(rec->>'branch_id', old_rec->>'branch_id'),'')::uuid,
      nullif(coalesce(rec->>'created_via_branch_id', old_rec->>'created_via_branch_id'),'')::uuid)
    end;
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

-- ── 6. Pasang trigger ───────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array['customers','partner_orders']
  loop
    execute format('drop trigger if exists trg_audit on public.%I', t);
    execute format('create trigger trg_audit after insert or update or delete on public.%I
                    for each row execute function public.fn_audit_row()', t);

    execute format('drop trigger if exists trg_touch on public.%I', t);
    execute format('create trigger trg_touch before update on public.%I
                    for each row execute function public.fn_touch_updated_at()', t);

    execute format('drop trigger if exists trg_set_created_by on public.%I', t);
    execute format('create trigger trg_set_created_by before insert on public.%I
                    for each row execute function public.fn_set_created_by()', t);
  end loop;
end;
$$;

drop trigger if exists trg_order_number on public.partner_orders;
create trigger trg_order_number before insert on public.partner_orders
  for each row execute function public.fn_set_order_number();

drop trigger if exists trg_check_order_refs on public.partner_orders;
create trigger trg_check_order_refs before insert or update on public.partner_orders
  for each row execute function public.fn_check_order_refs();

-- ── 7. Row Level Security (P0 — SPEC §32, §89–93) ───────────

alter table public.customers              enable row level security;
alter table public.partner_orders         enable row level security;
alter table public.partner_order_counters enable row level security;

-- customers ---------------------------------------------------
drop policy if exists c_admin_all on public.customers;
create policy c_admin_all on public.customers
  for all using (public.fn_is_admin()) with check (public.fn_is_admin());

drop policy if exists c_partner_read on public.customers;
create policy c_partner_read on public.customers
  for select using (public.fn_can_view_customer(id));

-- Asal pelanggan dipaksa dari identitas login: kiriman created_via_* milik
-- partner/cabang lain ditolak database, bukan cuma disembunyikan UI (LESSONS #5).
drop policy if exists c_partner_insert on public.customers;
create policy c_partner_insert on public.customers
  for insert with check (
    public.fn_is_admin()
    or (created_via_partner_id = public.fn_pu_partner()
        and created_via_branch_id = public.fn_pu_branch())
  );

-- SENGAJA tanpa policy UPDATE/DELETE untuk pengguna cabang: di irisan ini data
-- pelanggan hanya boleh diubah SANCI Admin (tercakup c_admin_all).

-- partner_orders ----------------------------------------------
drop policy if exists o_admin_all on public.partner_orders;
create policy o_admin_all on public.partner_orders
  for all using (public.fn_is_admin()) with check (public.fn_is_admin());

-- fn_can_view_branch sudah menangani OWN_BRANCH vs PARTNER_ALL_BRANCHES (0001).
drop policy if exists o_partner_read on public.partner_orders;
create policy o_partner_read on public.partner_orders
  for select using (public.fn_is_admin() or public.fn_can_view_branch(branch_id));

-- Atribusi = identitas, bukan pilihan form (SPEC §14).
drop policy if exists o_partner_insert on public.partner_orders;
create policy o_partner_insert on public.partner_orders
  for insert with check (
    public.fn_is_admin()
    or (partner_id = public.fn_pu_partner() and branch_id = public.fn_pu_branch())
  );

-- SENGAJA tanpa policy UPDATE/DELETE untuk pengguna cabang: sisi cabang READ
-- ONLY di irisan ini (SPEC §90 — baca order cabang lain boleh, ubah/batalkan
-- tidak). Koreksi atribusi (SPEC §16) hanya lewat admin.

-- partner_order_counters --------------------------------------
-- RLS aktif TANPA policy sama sekali = tertutup total lewat API. Satu-satunya
-- jalan masuk adalah fn_next_order_seq (security definer). Ini disengaja:
-- penghitung nomor tidak boleh bisa dibaca apalagi diubah dari browser.

-- ── 8. Verifikasi (hasilnya di-copy balik ke Claude) ────────
-- Harapan: TABLES 3 · RLS_ENABLED 3 · POLICIES 6 · TRIGGERS 8 ·
--          INDEXES 10 · FUNCTIONS 5 · AUDIT_MAP 1
--
-- Kalau ada angka yang tidak cocok, JANGAN anggap beres: laporkan apa adanya.
-- "Run tanpa tulisan merah" bukan bukti (LESSONS #7 & #16) — setelah ini buka
-- Table Editor dan pastikan tabel customers & partner_orders benar-benar muncul.

select 'TABLES' as check_type,
       count(*)::text as result
from information_schema.tables
where table_schema = 'public'
  and table_name in ('customers','partner_orders','partner_order_counters')
union all
select 'RLS_ENABLED', count(*)::text
from pg_tables
where schemaname = 'public'
  and rowsecurity = true
  and tablename in ('customers','partner_orders','partner_order_counters')
union all
select 'POLICIES', count(*)::text
from pg_policies
where schemaname = 'public'
  and tablename in ('customers','partner_orders','partner_order_counters')
union all
select 'TRIGGERS', count(*)::text
from pg_trigger tg
join pg_class cl on cl.oid = tg.tgrelid
join pg_namespace ns on ns.oid = cl.relnamespace
where not tg.tgisinternal          -- trigger bawaan foreign key tidak ikut dihitung
  and ns.nspname = 'public'
  and cl.relname in ('customers','partner_orders','partner_order_counters')
union all
select 'INDEXES', count(*)::text
from pg_indexes
where schemaname = 'public'
  and tablename in ('customers','partner_orders','partner_order_counters')
union all
select 'FUNCTIONS', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('fn_can_view_customer','fn_next_order_seq','fn_set_order_number',
                    'fn_set_created_by','fn_check_order_refs')
union all
select 'AUDIT_MAP', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'fn_audit_row'
  and p.prosrc like '%partner_orders%';
