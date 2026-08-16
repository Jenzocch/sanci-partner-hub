-- ============================================================
-- SANCI Partner Hub — Phase 2 Order Edit & Cancel
-- Migration 0005: kolom pembatalan + UPDATE policy cabang + penjaga kolom
--                 + aturan alih status + audit ORDER_CANCELLED
--                 (idempotent — aman dijalankan ulang)
-- Jalankan di: Supabase Studio → SQL Editor → paste seluruh file → Run
--
-- PRASYARAT: migration 0004_customer_order.sql SUDAH dijalankan (dan 0001
-- sebelumnya). File ini menumpuk di atas tabel partner_orders serta memakai
-- ulang helper security definer dari 0001 (fn_is_admin, fn_pu_partner,
-- fn_can_edit_branch) dan mendefinisikan ulang fn_audit_row milik 0004.
-- Blok pengaman di bawah berhenti dengan pesan jelas kalau prasyarat belum ada.
--
-- APA YANG DIBUKA IRISAN INI (dan hanya ini):
--   partner_orders  → UPDATE untuk pengguna cabang, sebatas fn_can_edit_branch.
--   customers       → TIDAK diubah. Sisi cabang tetap tanpa UPDATE/DELETE
--                     (Customer Edit adalah irisan berikutnya, SPEC §33–34).
--   DELETE          → TIDAK dibuka untuk siapa pun selain admin. Order resmi
--                     hanya bisa DIBATALKAN, bukan dihapus (SPEC §41–43).
--
-- CATATAN pemulihan manual: penjaga di bawah memakai fn_is_admin(). Di SQL
-- Editor auth.uid() kosong sehingga fn_is_admin() = false — artinya perbaikan
-- data manual pun ikut ditolak. Itu DISENGAJA (zero-trust, LESSONS #5/#6).
-- Kalau suatu hari perlu koreksi atribusi manual, bungkus dalam satu transaksi:
--   begin;
--     alter table public.partner_orders disable trigger trg_order_immutable_cols;
--     ... perbaikan ...
--     alter table public.partner_orders enable  trigger trg_order_immutable_cols;
--   commit;
-- Fitur "Correct Attribution" khusus admin (SPEC §16) belum ada di irisan ini.
-- ============================================================

-- ── 0. Pengaman prasyarat ───────────────────────────────────

do $$
begin
  if to_regclass('public.partner_orders') is null
     or to_regprocedure('public.fn_can_edit_branch(uuid)') is null
     or to_regprocedure('public.fn_audit_row()') is null then
    raise exception
      'Migration 0004_customer_order.sql (dan 0001_partner_foundation.sql) belum dijalankan di database ini. Jalankan 0001 lalu 0004 dulu, baru 0005.';
  end if;
end;
$$;

-- ── 1. Kolom pembatalan (SPEC §41–42) ───────────────────────

-- Semuanya nullable: order yang masih REGISTERED memang tidak punya nilai ini,
-- dan itu BUKAN keadaan "belum diisi" yang berbahaya (LESSONS #8) — null di
-- sini berarti "belum pernah dibatalkan", satu-satunya arti yang mungkin.
-- cancelled_by sengaja TANPA foreign key ke auth.users, mengikuti pola
-- created_by di 0004: jejak siapa yang membatalkan harus tetap ada walau akun
-- pengguna dihapus dari Auth.
alter table public.partner_orders
  add column if not exists cancelled_at        timestamptz;
alter table public.partner_orders
  add column if not exists cancelled_by        uuid;
alter table public.partner_orders
  add column if not exists cancellation_reason text;

-- Cancelled TIDAK boleh hilang dari pencarian (SPEC §97): tidak ada filter
-- status di policy mana pun, dan index ini membantu filter "Semua / Terdaftar /
-- Dibatalkan" di daftar order per cabang.
create index if not exists idx_partner_orders_status
  on public.partner_orders (branch_id, status);

-- ── 2. Penjaga kolom yang tidak boleh berubah (SPEC §15, §37) ──

-- Atribusi adalah data inti yang melindungi hubungan kerja sama (SPEC §15).
-- RLS sudah memastikan pengguna hanya menyentuh baris cabang yang boleh ia
-- edit, tapi RLS TIDAK bisa membandingkan nilai LAMA vs BARU — WITH CHECK hanya
-- melihat baris hasil. Tanpa trigger ini, pengguna cabang Cirebon dengan
-- edit_scope PARTNER_ALL_BRANCHES bisa memindahkan order Bandung menjadi
-- miliknya sendiri dan semua policy tetap lolos. Jadi perbandingan OLD/NEW
-- HARUS hidup di trigger, bukan di policy.
--
-- Admin lolos lewat fn_is_admin(): jalur admin adalah policy o_admin_all, dan
-- koreksi atribusi resmi (SPEC §16) memang hanya boleh dari sana.
-- SECURITY INVOKER (bawaan): fungsi ini tidak membaca tabel apa pun — cukup
-- membandingkan OLD vs NEW — jadi tidak ada alasan menaikkan hak aksesnya.
-- Keputusan "siapa admin" tetap datang dari fn_is_admin() milik 0001 yang
-- memang security definer.
create or replace function public.fn_guard_order_immutable_cols() returns trigger
language plpgsql set search_path = public as $$
declare v_bad text[] := array[]::text[];
begin
  if public.fn_is_admin() then
    return new;
  end if;

  -- identitas baris & atribusi
  if new.id                is distinct from old.id                then v_bad := v_bad || 'id'::text; end if;
  if new.partner_id        is distinct from old.partner_id        then v_bad := v_bad || 'partner_id'::text; end if;
  if new.branch_id         is distinct from old.branch_id         then v_bad := v_bad || 'branch_id'::text; end if;
  if new.customer_id       is distinct from old.customer_id       then v_bad := v_bad || 'customer_id'::text; end if;
  if new.order_number      is distinct from old.order_number      then v_bad := v_bad || 'order_number'::text; end if;
  -- jejak asal-usul: siapa & kapan membuat, serta kunci idempotency
  if new.created_by        is distinct from old.created_by        then v_bad := v_bad || 'created_by'::text; end if;
  if new.client_request_id is distinct from old.client_request_id then v_bad := v_bad || 'client_request_id'::text; end if;
  if new.created_at        is distinct from old.created_at        then v_bad := v_bad || 'created_at'::text; end if;

  if array_length(v_bad, 1) is not null then
    raise exception
      'Kolom % tidak boleh diubah dari aplikasi cabang. Atribusi order (partner, cabang, pelanggan, nomor order) hanya bisa dikoreksi oleh admin SANCI.',
      array_to_string(v_bad, ', ');
  end if;

  return new;
end;
$$;

-- ── 3. Aturan alih status & pembatalan (SPEC §41–43) ────────

-- Dipisah dari penjaga kolom di atas dengan sengaja: yang satu menjawab
-- "kolom mana yang boleh disentuh", yang ini menjawab "perpindahan status mana
-- yang sah dan apa syaratnya". Digabung jadi satu fungsi, keduanya sama-sama
-- sulit dibaca dan gampang salah saat Phase 3 menambah status baru.
--
-- Urutan trigger BEFORE UPDATE di partner_orders (Postgres: urut nama):
--   trg_check_order_refs  (0004 — staf/cabang milik partner yang benar)
--   trg_order_immutable_cols
--   trg_order_status_flow
--   trg_touch             (0001 — updated_at)
-- SECURITY INVOKER (bawaan): fungsi ini tidak membaca tabel apa pun — cukup
-- membandingkan OLD vs NEW — jadi tidak ada alasan menaikkan hak aksesnya.
-- Keputusan "siapa admin" tetap datang dari fn_is_admin() milik 0001 yang
-- memang security definer.
create or replace function public.fn_guard_order_status_flow() returns trigger
language plpgsql set search_path = public as $$
declare v_admin boolean := public.fn_is_admin();
begin
  if not v_admin then
    -- Order yang sudah dibatalkan = read-only total bagi cabang (SPEC §42:
    -- tetap ada, tetap bisa dicari, tetap punya audit — tapi tidak berubah).
    if old.status = 'CANCELLED' then
      raise exception
        'Order ini sudah dibatalkan dan tidak bisa diubah lagi. Hubungi admin SANCI kalau pembatalannya keliru.';
    end if;

    if new.status is distinct from old.status then
      -- Satu-satunya perpindahan status milik cabang di Phase 2.
      if new.status <> 'CANCELLED' then
        raise exception 'Perubahan status order dari % menjadi % tidak diizinkan.',
          old.status, new.status;
      end if;
      -- Alasan WAJIB (SPEC §41, §96). Spasi saja tidak dihitung sebagai alasan.
      if nullif(btrim(coalesce(new.cancellation_reason, '')), '') is null then
        raise exception 'Alasan pembatalan wajib diisi untuk membatalkan order.';
      end if;
    else
      -- Edit biasa: kolom pembatalan bukan kolom formulir. Tanpa penjagaan ini,
      -- Edit biasa bisa dipakai menyelundupkan alasan/waktu pembatalan palsu ke
      -- order yang statusnya tetap REGISTERED.
      if new.cancelled_at        is distinct from old.cancelled_at
         or new.cancelled_by     is distinct from old.cancelled_by
         or new.cancellation_reason is distinct from old.cancellation_reason then
        raise exception
          'Kolom pembatalan hanya boleh terisi lewat aksi Batalkan Order, bukan lewat Edit biasa.';
      end if;
    end if;
  end if;

  if new.status = 'CANCELLED' and old.status is distinct from 'CANCELLED' then
    -- Waktu server, bukan jam HP (LESSONS #11); pelaku dari sesi login, bukan
    -- kiriman client (LESSONS #6). Tanpa sesi (SQL Editor / seed) nilai
    -- cancelled_by dibiarkan apa adanya — pola yang sama dengan
    -- fn_set_created_by di 0004, supaya perbaikan manual tidak ikut gagal.
    new.cancelled_at        := now();
    if auth.uid() is not null then
      new.cancelled_by := auth.uid();
    end if;
    new.cancellation_reason := nullif(btrim(new.cancellation_reason), '');

  elsif old.status = 'CANCELLED' and new.status is distinct from 'CANCELLED' then
    -- Un-cancel: hanya bisa sampai sini kalau v_admin (cabang sudah ditolak di
    -- atas). Ketiga kolom dikosongkan supaya tidak ada order aktif yang membawa
    -- sisa jejak pembatalan lama dan membingungkan pembacanya — riwayat
    -- lengkapnya tetap tersimpan di audit_logs.
    new.cancelled_at        := null;
    new.cancelled_by        := null;
    new.cancellation_reason := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_order_immutable_cols on public.partner_orders;
create trigger trg_order_immutable_cols before update on public.partner_orders
  for each row execute function public.fn_guard_order_immutable_cols();

drop trigger if exists trg_order_status_flow on public.partner_orders;
create trigger trg_order_status_flow before update on public.partner_orders
  for each row execute function public.fn_guard_order_status_flow();

-- Jaring pengaman kalau 0004 pernah dijalankan versi lama yang hanya memasang
-- trg_check_order_refs untuk INSERT: jalur UPDATE juga wajib memvalidasi staf
-- sales/PIC, kalau tidak Edit bisa menunjuk staf milik partner lain.
drop trigger if exists trg_check_order_refs on public.partner_orders;
create trigger trg_check_order_refs before insert or update on public.partner_orders
  for each row execute function public.fn_check_order_refs();

-- ── 4. RLS: satu celah UPDATE untuk cabang (SPEC §36, §47–49) ──

-- fn_can_edit_branch dari 0001 SUDAH menangani kombinasi yang benar:
--   edit_scope OWN_BRANCH            → hanya cabang sendiri
--   visibility PARTNER_ALL_BRANCHES
--     + edit_scope PARTNER_ALL_BRANCHES → semua cabang partner yang sama
-- Jadi kasus SPEC §47 (Cirebon boleh LIHAT order Bandung tapi tidak boleh
-- MENGUBAH) jatuh otomatis dari helper yang sama — jangan menulis ulang
-- logikanya di sini, satu sumber kebenaran saja.
--
-- USING  = baris mana yang boleh disentuh (pakai nilai LAMA)
-- WITH CHECK = baris hasil harus tetap di cabang yang boleh diedit
-- Keduanya diperlukan; perbandingan OLD vs NEW tetap tugas trigger di §2.
--
-- Catatan perilaku yang memang diinginkan: order cabang lain yang TERLIHAT tapi
-- tidak boleh diedit menghasilkan "0 baris terupdate", BUKAN error — baris itu
-- tidak pernah terpilih sehingga trigger pun tidak jalan. Server Action wajib
-- memeriksa jumlah baris hasil dan tidak menampilkan sukses palsu (LESSONS #2/#7).
drop policy if exists o_partner_update on public.partner_orders;
create policy o_partner_update on public.partner_orders
  for update using (public.fn_can_edit_branch(branch_id))
       with check (public.fn_can_edit_branch(branch_id));

-- SENGAJA TIDAK ditambahkan di irisan ini:
--   * policy DELETE untuk cabang  → order resmi tidak boleh hard delete (SPEC §43)
--   * policy UPDATE untuk customers → Customer Edit menyusul (SPEC §33–34)

-- ── 5. Audit: ORDER_CANCELLED + alasan (SPEC §62–64) ────────

-- Definisi ulang UTUH sekali lagi (bukan tambalan) supaya file ini idempotent.
-- SELURUH perilaku 0004 dipertahankan apa adanya: awalan CUSTOMER/ORDER dan
-- pengambilan partner/branch dari kolom created_via_* milik customers.
-- Yang bertambah hanya dua hal, keduanya khusus partner_orders:
--   1. status berubah menjadi CANCELLED → aksi ORDER_CANCELLED, bukan
--      ORDER_STATUS_CHANGED yang generik (SPEC §62).
--   2. alasan pembatalan masuk ke kolom reason milik audit_logs (0001), supaya
--      bisa dibaca tanpa menggali JSON before/after (SPEC §63–64).
-- Perubahan status LAIN (termasuk un-cancel CANCELLED→REGISTERED oleh admin)
-- dan tabel lain TIDAK berubah perilakunya.
--
-- CATATAN untuk yang menjalankan ulang 0001 atau 0004 SETELAH file ini:
-- definisi ini akan tertimpa dan pembatalan kembali tercatat sebagai
-- ORDER_STATUS_CHANGED — tidak merusak apa pun, tapi jalankan ulang 0005 untuk
-- memulihkannya.
create or replace function public.fn_audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_prefix text;
  v_action text;
  v_reason text;
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
      if tg_table_name = 'partner_orders' and (rec->>'status') = 'CANCELLED' then
        v_action := 'ORDER_CANCELLED';
        v_reason := rec->>'cancellation_reason';
      else
        v_action := v_prefix || '_STATUS_CHANGED';
      end if;
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
                          partner_id, branch_id, before, after, reason)
  values (auth.uid(), v_role, v_action, tg_table_name,
          coalesce(rec->>'id', old_rec->>'id', rec->>'partner_id', old_rec->>'partner_id'),
          v_partner, v_branch, old_rec, rec, v_reason);
  return coalesce(new, old);
end;
$$;

-- ── 6. Verifikasi (hasilnya di-copy balik ke Claude) ────────
-- Harapan:
--   CANCEL_COLUMNS        3     (cancelled_at, cancelled_by, cancellation_reason)
--   ORDER_POLICIES        4     (o_admin_all, o_partner_read, o_partner_insert, o_partner_update)
--   ORDER_UPDATE_POLICY   1     ← satu-satunya celah UPDATE yang dibuka irisan ini
--   CUSTOMER_UPDATE_POLICY 0    ← WAJIB 0: Customer Edit belum dibuka
--   ORDER_DELETE_POLICY   0     ← WAJIB 0: order resmi tidak boleh hard delete
--   ORDER_TRIGGERS        7     (audit, touch, set_created_by, order_number,
--                                check_order_refs, immutable_cols, status_flow)
--   GUARD_FUNCTIONS       2
--   REFS_ON_UPDATE        1     ← trg_check_order_refs juga jalan saat UPDATE
--   AUDIT_CANCEL          1     ← fn_audit_row mengenal ORDER_CANCELLED
--   AUDIT_KEEP_0004       1     ← pemetaan created_via_* milik 0004 masih utuh
--   AUDIT_REASON          1     ← alasan pembatalan ikut masuk kolom reason
--
-- Angka blok verifikasi 0004 BERUBAH setelah file ini dijalankan — itu normal:
--   POLICIES  6 → 7   (tambah o_partner_update)
--   TRIGGERS  8 → 10  (tambah trg_order_immutable_cols & trg_order_status_flow)
--   INDEXES  10 → 11  (tambah idx_partner_orders_status)
-- Angka 0004 yang lain (TABLES 3 · RLS_ENABLED 3 · FUNCTIONS 5 · AUDIT_MAP 1)
-- harus TETAP sama. Kalau ada yang tidak cocok, JANGAN anggap beres: laporkan
-- apa adanya — "Run tanpa tulisan merah" bukan bukti (LESSONS #7 & #16).

select 'CANCEL_COLUMNS' as check_type,
       count(*)::text as result
from information_schema.columns
where table_schema = 'public' and table_name = 'partner_orders'
  and column_name in ('cancelled_at','cancelled_by','cancellation_reason')
union all
select 'ORDER_POLICIES', count(*)::text
from pg_policies where schemaname = 'public' and tablename = 'partner_orders'
union all
select 'ORDER_UPDATE_POLICY', count(*)::text
from pg_policies
where schemaname = 'public' and tablename = 'partner_orders'
  and cmd = 'UPDATE'
union all
select 'CUSTOMER_UPDATE_POLICY', count(*)::text
from pg_policies
where schemaname = 'public' and tablename = 'customers'
  and cmd = 'UPDATE'
union all
select 'ORDER_DELETE_POLICY', count(*)::text
from pg_policies
where schemaname = 'public' and tablename = 'partner_orders'
  and cmd = 'DELETE'
union all
select 'ORDER_TRIGGERS', count(*)::text
from pg_trigger tg
join pg_class cl on cl.oid = tg.tgrelid
join pg_namespace ns on ns.oid = cl.relnamespace
where not tg.tgisinternal and ns.nspname = 'public' and cl.relname = 'partner_orders'
union all
select 'GUARD_FUNCTIONS', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('fn_guard_order_immutable_cols','fn_guard_order_status_flow')
union all
select 'REFS_ON_UPDATE', count(*)::text
from pg_trigger tg
join pg_class cl on cl.oid = tg.tgrelid
join pg_namespace ns on ns.oid = cl.relnamespace
where not tg.tgisinternal and ns.nspname = 'public'
  and cl.relname = 'partner_orders'
  and tg.tgname = 'trg_check_order_refs'
  and (tg.tgtype & 16) = 16          -- bit UPDATE
union all
select 'AUDIT_CANCEL', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row'
  and p.prosrc like '%ORDER_CANCELLED%'
union all
select 'AUDIT_KEEP_0004', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row'
  and p.prosrc like '%created_via_partner_id%'
union all
select 'AUDIT_REASON', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row'
  and p.prosrc like '%v_reason%';
