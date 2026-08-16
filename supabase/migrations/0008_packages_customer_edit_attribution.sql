-- ============================================================
-- SANCI Partner Hub — Phase 2 irisan ketiga
-- Migration 0008: master Package + Customer Edit (cabang) + Koreksi Atribusi
--                 (idempotent — aman dijalankan ulang)
-- Jalankan di: Supabase Studio → SQL Editor → paste seluruh file → Run
--
-- PRASYARAT: 0001 → 0003 → 0004 → 0005 → 0006 → 0007 sudah dijalankan, DALAM
-- URUTAN ITU. Blok pengaman di bawah berhenti dengan pesan jelas kalau belum.
--
-- APA YANG DIBUKA IRISAN INI (dan hanya ini):
--   partner_packages → tabel master baru. SANCI Admin kelola; pengguna partner
--                      HANYA BACA (SPEC §21–23: Package dikurasi SANCI).
--   partner_orders   → kolom package_id (opsional) menunjuk master itu.
--   customers        → UPDATE untuk pengguna cabang, sebatas fn_can_edit_branch
--                      atas cabang ASAL pelanggan (SPEC §33–34).
--   RPC fn_correct_order_attribution → koreksi cabang order, khusus admin,
--                      wajib beralasan (SPEC §16, §64).
--
-- YANG SENGAJA TIDAK DIBUKA:
--   * DELETE untuk siapa pun selain admin — di mana pun.
--   * Tulis partner_packages dari sisi cabang.
--   * Koreksi atribusi LINTAS PARTNER — di luar lingkup irisan ini.
--   * Isi produk di dalam Package (SPEC §23: Phase berikutnya).
--
-- CATATAN KOMPATIBILITAS: package_name di partner_orders TIDAK diubah dan TIDAK
-- dipindahkan. Ia tetap teks bebas dan tetap SATU-SATUNYA sumber kebenaran untuk
-- tampilan & riwayat — nama paket pada order lama harus tetap berbunyi seperti
-- saat order itu dibuat, walau master paketnya kelak diganti nama atau
-- dinonaktifkan. package_id hanyalah kaitan opsional ke master.
-- ============================================================

-- ── 0. Pengaman prasyarat ───────────────────────────────────

do $$
begin
  if to_regclass('public.partner_orders') is null
     or to_regprocedure('public.fn_can_edit_branch(uuid)') is null
     or to_regprocedure('public.fn_audit_row()') is null then
    raise exception
      'Migration 0001/0004/0005 belum dijalankan di database ini. Jalankan 0001 → 0003 → 0004 → 0005 → 0006 → 0007 dulu, baru 0008.';
  end if;

  -- Penanda 0007. Tanpa 0007, policy SELECT customers masih versi lama dan
  -- SETIAP "Simpan pelanggan" dari cabang gagal — termasuk lewat fitur baru
  -- di file ini. Berhenti di sini jauh lebih baik daripada menyerahkan bug itu
  -- kepada pengguna.
  if to_regprocedure('public.fn_customer_has_visible_order(uuid)') is null then
    raise exception
      'Migration 0007_audit_fixes.sql belum dijalankan di database ini. Jalankan 0007 dulu, baru 0008.';
  end if;
end;
$$;

-- ── 1. Master Package (SPEC §21–23) ─────────────────────────

-- Package MILIK partner (SPEC §22): "Package A" milik Golden Home dan "Package
-- A" milik Partner B adalah dua benda berbeda. Karena itu keunikan code
-- BERPASANGAN dengan partner_id, bukan global — persis pola partner_branches
-- di 0001.
--
-- status ACTIVE/INACTIVE, bukan hard delete (LESSONS #4): begitu sebuah paket
-- pernah dipakai order, menghapusnya akan menghapus arti order itu. DEFAULT
-- 'ACTIVE' aman ditinjau dari LESSONS #8 — paket yang baru dibuat memang untuk
-- dipakai, dan nilai ini bukan "kondisi terburuk yang senyap".
create table if not exists public.partner_packages (
  id                uuid primary key default gen_random_uuid(),
  partner_id        uuid not null references public.partners(id) on delete restrict,
  name              text not null,
  code              text not null,
  description       text,
  status            text not null default 'ACTIVE'
                    check (status in ('ACTIVE','INACTIVE')),
  client_request_id text unique,          -- idempotency jaringan lemah (LESSONS #3, #21)
  created_by        uuid,                 -- auth.uid(), dipaksa trigger 0004
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (partner_id, code)               -- SPEC §22
);

-- ── 2. partner_orders.package_id (kaitan opsional) ──────────

-- ON DELETE RESTRICT: master yang sudah dipakai tidak boleh lenyap (LESSONS #4).
-- Ditambahkan dua langkah supaya benar-benar idempotent — ADD COLUMN IF NOT
-- EXISTS tidak akan memasang foreign key kalau kolomnya sudah ada dari
-- percobaan sebelumnya.
alter table public.partner_orders
  add column if not exists package_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint
                 where conname = 'partner_orders_package_id_fkey'
                   and conrelid = 'public.partner_orders'::regclass) then
    alter table public.partner_orders
      add constraint partner_orders_package_id_fkey
      foreign key (package_id) references public.partner_packages(id) on delete restrict;
  end if;
end;
$$;

create index if not exists idx_partner_orders_package
  on public.partner_orders (package_id);

-- package_id SENGAJA TIDAK dimasukkan ke daftar kolom tak-boleh-berubah milik
-- 0005 (fn_guard_order_immutable_cols). Alasannya: mengganti paket adalah Edit
-- biasa yang memang hak cabang (SPEC §36), bukan atribusi. File ini TIDAK
-- menyentuh fungsi itu.

-- ── 3. Integritas: paket harus milik partner order-nya ──────

-- Definisi ulang UTUH fn_check_order_refs milik 0004 (bukan tambalan) supaya
-- file ini idempotent. SELURUH perilaku 0004 dipertahankan kata demi kata;
-- yang bertambah hanya pemeriksaan package_id.
--
-- Kenapa perlu: RLS memaksa order berada di partner/cabang si pengguna, tapi
-- TIDAK memeriksa isi kolom package_id. Tanpa penjaga ini, pengguna cabang
-- Golden Home bisa mengirim id paket milik Partner B lewat API (UI tidak akan
-- menawarkannya — dan justru itulah sebabnya UI bukan pertahanan, LESSONS #5).
-- Akibatnya order Golden Home terkait ke master partner lain: atribusi kacau
-- dan, lebih buruk, keberadaan paket partner lain jadi bisa diraba-raba.
--
-- CATATAN untuk yang menjalankan ulang 0004 SETELAH file ini: definisi ini akan
-- tertimpa versi 0004 dan pemeriksaan paket hilang diam-diam. Jalankan ulang
-- 0008 untuk memulihkannya (lihat migrations/README.md).
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

  -- baru di 0008
  if new.package_id is not null
     and not exists (select 1 from partner_packages
                     where id = new.package_id and partner_id = new.partner_id) then
    raise exception 'paket bukan milik partner %', new.partner_id;
  end if;

  return new;
end;
$$;

-- ── 4. Customer Edit untuk cabang (SPEC §33–35) ─────────────

-- Kolom identitas asal-usul TIDAK boleh disentuh aplikasi cabang. Sama seperti
-- fn_guard_order_immutable_cols di 0005: RLS hanya melihat baris HASIL, ia tidak
-- bisa membandingkan nilai LAMA vs BARU — jadi perbandingan OLD/NEW harus hidup
-- di trigger. Tanpa ini, pengguna cabang bisa "memindahkan" pelanggan menjadi
-- buatan cabangnya sendiri dan semua policy tetap lolos.
--
-- SECURITY INVOKER (bawaan): fungsi ini tidak membaca tabel apa pun. Keputusan
-- "siapa admin" tetap datang dari fn_is_admin() milik 0001.
create or replace function public.fn_guard_customer_immutable_cols() returns trigger
language plpgsql set search_path = public as $$
declare v_bad text[] := array[]::text[];
begin
  if public.fn_is_admin() then
    return new;
  end if;

  if new.id                     is distinct from old.id                     then v_bad := v_bad || 'id'::text; end if;
  if new.created_via_partner_id is distinct from old.created_via_partner_id then v_bad := v_bad || 'created_via_partner_id'::text; end if;
  if new.created_via_branch_id  is distinct from old.created_via_branch_id  then v_bad := v_bad || 'created_via_branch_id'::text; end if;
  if new.created_by             is distinct from old.created_by             then v_bad := v_bad || 'created_by'::text; end if;
  if new.client_request_id      is distinct from old.client_request_id      then v_bad := v_bad || 'client_request_id'::text; end if;
  if new.created_at             is distinct from old.created_at             then v_bad := v_bad || 'created_at'::text; end if;

  if array_length(v_bad, 1) is not null then
    raise exception
      'Kolom % tidak boleh diubah dari aplikasi cabang. Asal-usul pelanggan (partner, cabang, pembuat) hanya bisa dikoreksi oleh admin SANCI.',
      array_to_string(v_bad, ', ');
  end if;

  -- phone dan phone_normalized adalah SATU nilai dalam dua bentuk. Kalau nomor
  -- mentahnya berubah, bentuk kanoniknya WAJIB ikut dikirim — kalau tidak,
  -- pencarian nomor dan deteksi duplikat (SPEC §10, §82) diam-diam memakai nomor
  -- lama, dan tidak ada yang tahu sampai ada pelanggan yang tidak ketemu.
  --
  -- Trigger SENGAJA hanya memeriksa "terisi", bukan menghitung ulang: logika
  -- normalisasi hidup di normalizePhoneID() (web/lib/orders-shared.ts) dan sudah
  -- diputuskan sejak 0004 untuk TIDAK diduplikasi di SQL — dua salinan aturan
  -- pasti akan berbeda suatu hari. Batasnya jujur disebut di sini: penjaga ini
  -- menangkap nilai kosong, BUKAN nilai basi. Yang menghitung tetap Server Action.
  if new.phone is distinct from old.phone
     and nullif(btrim(coalesce(new.phone_normalized, '')), '') is null then
    raise exception
      'Nomor telepon yang sudah dinormalkan wajib ikut diperbarui saat nomor telepon diubah.';
  end if;

  -- Berlaku untuk SEMUA update, bukan cuma saat phone berubah: mengosongkan
  -- phone_normalized akan membuat pelanggan itu hilang dari pencarian nomor.
  if nullif(btrim(coalesce(new.phone_normalized, '')), '') is null then
    raise exception 'Nomor telepon yang sudah dinormalkan tidak boleh kosong.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_customer_immutable_cols on public.customers;
create trigger trg_customer_immutable_cols before update on public.customers
  for each row execute function public.fn_guard_customer_immutable_cols();

-- Satu celah UPDATE untuk cabang. fn_can_edit_branch dari 0006 sudah menangani
-- OWN_BRANCH vs PARTNER_ALL_BRANCHES; jangan menulis ulang logikanya di sini.
--
-- Yang dipakai adalah created_via_branch_id, yaitu cabang ASAL pelanggan —
-- BUKAN cabang yang kebetulan punya order dengannya. Ini SPEC §34 apa adanya:
-- boleh mengubah pelanggan yang dibuat cabang sendiri. Konsekuensi yang memang
-- diinginkan: pelanggan yang hanya TERLIHAT karena punya order di cabang kita
-- tetap bisa dibaca, tapi tidak bisa diubah — data identitas orang tidak boleh
-- ikut berpindah tangan setiap kali ia berbelanja di tempat lain (SPEC §12).
--
-- Perilaku yang diinginkan saat tidak berhak: "0 baris terupdate", BUKAN error.
-- Server Action WAJIB memeriksa jumlah baris dan tidak menampilkan sukses palsu
-- (LESSONS #2/#7).
drop policy if exists c_partner_update on public.customers;
create policy c_partner_update on public.customers
  for update using (public.fn_can_edit_branch(created_via_branch_id))
       with check (public.fn_can_edit_branch(created_via_branch_id));

-- ── 5. Koreksi Atribusi khusus admin (SPEC §16, §64) ────────

-- Kenapa RPC dan bukan UPDATE biasa dari sisi admin: SPEC §16 menuntut ALASAN
-- yang tersimpan. Kolom alasan tidak ada di partner_orders, dan menambahkannya
-- akan mencampur "keadaan order" dengan "catatan tindakan". Jadi alasan
-- dititipkan ke audit lewat GUC transaksi, dan RPC ini adalah satu-satunya
-- pintu yang memastikan alasan itu benar-benar ada.
--
-- SECURITY DEFINER: berjalan sebagai pemilik fungsi, jadi RLS partner_orders
-- dilewati. Karena itu pemeriksaan fn_is_admin() ada di BARIS PERTAMA dan
-- bukan di UI — kalau baris itu dihapus, fungsi ini menjadi lubang penuh
-- (LESSONS #5). fn_is_admin() tetap membaca auth.uid() milik PEMANGGIL,
-- SECURITY DEFINER tidak mengubah identitas sesi.
--
-- Lintas partner SENGAJA DITOLAK di irisan ini: memindahkan order ke partner
-- lain berarti memindahkan hubungan bisnis, dan itu butuh aturan tersendiri
-- (SPEC §15). Lebih baik ditolak dengan kalimat jelas daripada diam-diam bisa.
create or replace function public.fn_correct_order_attribution(
  p_order_id      uuid,
  p_new_branch_id uuid,
  p_reason        text
) returns public.partner_orders
language plpgsql security definer set search_path = public as $$
declare
  v_order  public.partner_orders%rowtype;
  v_branch public.partner_branches%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.fn_is_admin() then
    raise exception 'Hanya admin SANCI yang boleh mengoreksi atribusi order.'
      using errcode = '42501';
  end if;

  -- Spasi saja tidak dihitung sebagai alasan (pola yang sama dengan alasan
  -- pembatalan di 0005).
  if v_reason is null then
    raise exception 'Alasan koreksi atribusi wajib diisi.';
  end if;

  select * into v_order from partner_orders where id = p_order_id;
  if not found then
    raise exception 'Order % tidak ditemukan.', p_order_id;
  end if;

  select * into v_branch from partner_branches where id = p_new_branch_id;
  if not found then
    raise exception 'Cabang % tidak ditemukan.', p_new_branch_id;
  end if;

  if v_branch.partner_id is distinct from v_order.partner_id then
    raise exception
      'Cabang tujuan milik partner lain. Koreksi atribusi lintas partner belum didukung — hubungi pengembang.';
  end if;

  -- Sudah berada di cabang tujuan → tidak ada yang perlu dikoreksi, dan ini
  -- BUKAN kesalahan pengguna: pada jaringan lemah, panggilan pertama bisa saja
  -- sudah berhasil sementara jawabannya hilang di jalan, lalu aplikasi mencoba
  -- lagi (LESSONS #2, #21). Mengembalikan order apa adanya membuat percobaan
  -- ulang aman; tidak ada baris audit kedua karena tidak ada yang berubah.
  if v_order.branch_id = p_new_branch_id then
    return v_order;
  end if;

  -- Alasan dititipkan ke fn_audit_row lewat GUC transaksi (parameter ketiga
  -- true = hanya untuk transaksi ini, otomatis hilang setelah commit/rollback).
  perform set_config('app.audit_reason', v_reason, true);

  update partner_orders
     set branch_id = p_new_branch_id
   where id = p_order_id
  returning * into v_order;

  -- Dibersihkan lagi supaya UPDATE lain di transaksi yang SAMA tidak ikut
  -- terlabeli alasan ini.
  perform set_config('app.audit_reason', '', true);

  return v_order;
end;
$$;

-- Catatan tentang trigger 0005 yang ikut jalan di sini — sudah dipastikan tidak
-- bentrok: trg_order_immutable_cols melepas admin di baris pertamanya
-- (fn_is_admin()), trg_order_status_flow tidak melakukan apa-apa karena status
-- tidak berubah, dan trg_check_order_refs (versi §3 di atas) justru berguna: ia
-- memverifikasi ulang bahwa cabang barunya memang milik partner order tersebut.
-- Staf sales/PIC TIDAK ikut dipindah — mereka tetap staf partner yang sama
-- sehingga pemeriksaan lolos; menyesuaikan staf setelah koreksi adalah urusan
-- Edit biasa, bukan urusan fungsi ini.

-- EXECUTE: hanya authenticated (pemeriksaan admin ada di dalam fungsi).
-- PUBLIC & anon dicabut — pengunjung yang belum login tidak punya urusan di
-- sini, dan Postgres memberi EXECUTE ke PUBLIC secara default untuk SETIAP
-- fungsi baru (temuan P1 di 0007).
do $$
begin
  execute 'revoke all on function public.fn_correct_order_attribution(uuid, uuid, text) from public';
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.fn_correct_order_attribution(uuid, uuid, text) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.fn_correct_order_attribution(uuid, uuid, text) to authenticated';
  end if;
end;
$$;

-- ── 6. Audit: PACKAGE, CUSTOMER_PHONE_CHANGED, ORDER_ATTRIBUTION_CORRECTED ──

-- Definisi ulang UTUH sekali lagi (bukan tambalan) supaya file ini idempotent.
-- SELURUH perilaku 0004 dan 0005 dipertahankan kata demi kata: awalan
-- CUSTOMER/ORDER, pengambilan partner/branch dari created_via_*,
-- ORDER_CANCELLED beserta alasannya. Yang bertambah hanya tiga hal:
--   1. awalan 'PACKAGE' untuk tabel partner_packages (SPEC §61–62)
--   2. UPDATE customers yang mengubah phone_normalized → CUSTOMER_PHONE_CHANGED
--      (SPEC §35), bukan CUSTOMER_UPDATED yang generik
--   3. UPDATE partner_orders yang mengubah partner_id/branch_id →
--      ORDER_ATTRIBUTION_CORRECTED, dengan alasan diambil dari GUC
--      app.audit_reason (SPEC §64)
--
-- Poin 3 sengaja dinilai dari PERUBAHAN DATA, bukan dari "siapa yang memanggil".
-- Jadi admin yang mengubah branch_id lewat jalur lain pun tetap tercatat sebagai
-- koreksi atribusi — hanya saja kolom reason-nya kosong, dan justru itu yang
-- membedakan koreksi resmi dari suntingan langsung (SPEC §64 menuntut alasan).
--
-- Kolom before/after tetap menyimpan baris utuh, sehingga "Before Partner /
-- Before Branch / After Partner / After Branch" (SPEC §64) dan "Before 62812…
-- / After 62857…" (SPEC §35) bisa dibaca tanpa tabel tambahan.
--
-- CATATAN untuk yang menjalankan ulang 0001/0004/0005 SETELAH file ini:
-- definisi ini akan tertimpa dan ketiga aksi di atas kembali menjadi
-- CUSTOMER_UPDATED / ORDER_UPDATED / PARTNER_PACKAGES_CREATED. Jalankan ulang
-- 0008 untuk memulihkannya (lihat migrations/README.md).
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
    when 'partner_packages' then 'PACKAGE'
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
    elsif tg_table_name = 'partner_orders'
          and ((rec->>'partner_id') is distinct from (old_rec->>'partner_id')
               or (rec->>'branch_id') is distinct from (old_rec->>'branch_id')) then
      v_action := 'ORDER_ATTRIBUTION_CORRECTED';
      v_reason := nullif(btrim(coalesce(current_setting('app.audit_reason', true), '')), '');
    elsif tg_table_name = 'customers'
          and (rec->>'phone_normalized') is distinct from (old_rec->>'phone_normalized') then
      v_action := 'CUSTOMER_PHONE_CHANGED';
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

-- ── 7. Trigger partner_packages ─────────────────────────────

drop trigger if exists trg_audit on public.partner_packages;
create trigger trg_audit after insert or update or delete on public.partner_packages
  for each row execute function public.fn_audit_row();

drop trigger if exists trg_touch on public.partner_packages;
create trigger trg_touch before update on public.partner_packages
  for each row execute function public.fn_touch_updated_at();

drop trigger if exists trg_set_created_by on public.partner_packages;
create trigger trg_set_created_by before insert on public.partner_packages
  for each row execute function public.fn_set_created_by();

-- ── 8. RLS partner_packages ─────────────────────────────────

alter table public.partner_packages enable row level security;

drop policy if exists pkg_admin_all on public.partner_packages;
create policy pkg_admin_all on public.partner_packages
  for all using (public.fn_is_admin()) with check (public.fn_is_admin());

-- HANYA BACA untuk pengguna partner, dan hanya paket partner sendiri.
-- Paket INACTIVE ikut terbaca dengan sengaja: order lama menunjuk ke sana, dan
-- layar riwayat harus tetap bisa menyebut namanya (LESSONS #4). Penyaringan
-- "hanya tawarkan yang ACTIVE" adalah urusan formulir, bukan urusan RLS.
--
-- TIDAK ADA policy INSERT/UPDATE/DELETE untuk cabang: Package dikelola SANCI
-- Admin (SPEC §21). Tanpa policy = tertutup, bukan sekadar tersembunyi.
drop policy if exists pkg_partner_read on public.partner_packages;
create policy pkg_partner_read on public.partner_packages
  for select using (partner_id = public.fn_pu_partner());

-- ── 9. Verifikasi (hasilnya di-copy balik ke Claude) ────────
-- Harapan:
--   PACKAGE_TABLE            1   ← tabel partner_packages ada
--   PACKAGE_UNIQUE           1   ← unique (partner_id, code) terpasang
--   PACKAGE_RLS              1   ← RLS aktif
--   PACKAGE_POLICIES         2   ← pkg_admin_all + pkg_partner_read
--   PACKAGE_WRITE_POLICIES   0   ← WAJIB 0: cabang tidak boleh menulis Package
--   PACKAGE_TRIGGERS         3   ← audit, touch, set_created_by
--   ORDER_PACKAGE_COLUMN     1   ← partner_orders.package_id ada
--   ORDER_PACKAGE_FK         1   ← beserta foreign key-nya
--   ORDER_PACKAGE_NOT_FROZEN 1   ← WAJIB 1: package_id BUKAN kolom beku 0005
--   CUSTOMER_UPDATE_POLICY   1   ← Customer Edit dibuka (di 0005 nilainya 0)
--   CUSTOMER_GUARD_TRIGGER   1   ← trg_customer_immutable_cols terpasang
--   CUSTOMER_DELETE_POLICY   0   ← WAJIB 0: cabang tetap tidak boleh menghapus
--   ATTRIBUTION_RPC          1   ← fn_correct_order_attribution ada
--   ATTRIBUTION_RPC_SECDEF   1   ← dan security definer
--   RPC_EXEC_PUBLIC          0   ← WAJIB 0
--   RPC_EXEC_ANON            0   ← WAJIB 0
--   RPC_EXEC_AUTHENTICATED   1   ← WAJIB 1 (pemeriksaan admin di dalam fungsi)
--   AUDIT_PACKAGE            1   ← fn_audit_row mengenal awalan PACKAGE
--   AUDIT_PHONE_CHANGED      1   ← mengenal CUSTOMER_PHONE_CHANGED
--   AUDIT_ATTRIBUTION        1   ← mengenal ORDER_ATTRIBUTION_CORRECTED
--   AUDIT_KEEP_0004          1   ← pemetaan created_via_* milik 0004 masih utuh
--   AUDIT_KEEP_0005          1   ← ORDER_CANCELLED milik 0005 masih utuh
--   REFS_CHECK_PACKAGE       1   ← fn_check_order_refs memeriksa pemilik paket
--
-- Angka blok verifikasi file LAMA yang BERUBAH setelah 0008 — ini normal,
-- daftar lengkapnya ada di migrations/README.md:
--   0004: POLICIES 7 → 8 · TRIGGERS 10 → 11 · INDEXES 11 → 12
--   0005: CUSTOMER_UPDATE_POLICY 0 → 1  (satu-satunya angka "WAJIB 0" yang
--         memang berubah — Customer Edit adalah isi irisan ini)
-- Angka 0005 yang lain HARUS tetap sama. Kalau ada yang tidak cocok, JANGAN
-- anggap beres: laporkan apa adanya (LESSONS #7 & #16).

select 'PACKAGE_TABLE' as check_type,
       count(*)::text as result
from information_schema.tables
where table_schema = 'public' and table_name = 'partner_packages'
union all
select 'PACKAGE_UNIQUE', count(*)::text
from pg_constraint
where conrelid = 'public.partner_packages'::regclass and contype = 'u'
  and pg_get_constraintdef(oid) like '%(partner_id, code)%'
union all
select 'PACKAGE_RLS', count(*)::text
from pg_tables where schemaname = 'public' and tablename = 'partner_packages' and rowsecurity
union all
select 'PACKAGE_POLICIES', count(*)::text
from pg_policies where schemaname = 'public' and tablename = 'partner_packages'
union all
select 'PACKAGE_WRITE_POLICIES', count(*)::text
from pg_policies
where schemaname = 'public' and tablename = 'partner_packages'
  and cmd in ('INSERT','UPDATE','DELETE')
union all
select 'PACKAGE_TRIGGERS', count(*)::text
from pg_trigger tg join pg_class cl on cl.oid = tg.tgrelid
join pg_namespace ns on ns.oid = cl.relnamespace
where not tg.tgisinternal and ns.nspname = 'public' and cl.relname = 'partner_packages'
union all
select 'ORDER_PACKAGE_COLUMN', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'partner_orders' and column_name = 'package_id'
union all
select 'ORDER_PACKAGE_FK', count(*)::text
from pg_constraint
where conname = 'partner_orders_package_id_fkey'
  and conrelid = 'public.partner_orders'::regclass
union all
select 'ORDER_PACKAGE_NOT_FROZEN', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_guard_order_immutable_cols'
  and p.prosrc not like '%package_id%'
union all
select 'CUSTOMER_UPDATE_POLICY', count(*)::text
from pg_policies where schemaname = 'public' and tablename = 'customers' and cmd = 'UPDATE'
union all
select 'CUSTOMER_GUARD_TRIGGER', count(*)::text
from pg_trigger tg join pg_class cl on cl.oid = tg.tgrelid
join pg_namespace ns on ns.oid = cl.relnamespace
where not tg.tgisinternal and ns.nspname = 'public' and cl.relname = 'customers'
  and tg.tgname = 'trg_customer_immutable_cols'
union all
select 'CUSTOMER_DELETE_POLICY', count(*)::text
from pg_policies where schemaname = 'public' and tablename = 'customers' and cmd = 'DELETE'
union all
select 'ATTRIBUTION_RPC', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_correct_order_attribution'
union all
select 'ATTRIBUTION_RPC_SECDEF', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_correct_order_attribution' and p.prosecdef
union all
select 'RPC_EXEC_PUBLIC',
       (has_function_privilege('public', 'public.fn_correct_order_attribution(uuid, uuid, text)', 'execute'))::int::text
union all
select 'RPC_EXEC_ANON',
       coalesce((select (has_function_privilege('anon', 'public.fn_correct_order_attribution(uuid, uuid, text)', 'execute'))::int::text
                 from pg_roles where rolname = 'anon'), '0')
union all
select 'RPC_EXEC_AUTHENTICATED',
       coalesce((select (has_function_privilege('authenticated', 'public.fn_correct_order_attribution(uuid, uuid, text)', 'execute'))::int::text
                 from pg_roles where rolname = 'authenticated'), '0')
union all
select 'AUDIT_PACKAGE', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%partner_packages%'
union all
select 'AUDIT_PHONE_CHANGED', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%CUSTOMER_PHONE_CHANGED%'
union all
select 'AUDIT_ATTRIBUTION', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%ORDER_ATTRIBUTION_CORRECTED%'
union all
select 'AUDIT_KEEP_0004', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%created_via_partner_id%'
union all
select 'AUDIT_KEEP_0005', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%ORDER_CANCELLED%'
union all
select 'REFS_CHECK_PACKAGE', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_check_order_refs' and p.prosrc like '%partner_packages%';
