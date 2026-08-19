-- ============================================================
-- SANCI Partner Hub — Phase 2 irisan keenam
-- Migration 0012: Isi Package — komponen produk di dalam sebuah Package
--                 (idempotent — aman dijalankan ulang)
-- Jalankan di: Supabase Studio → SQL Editor → paste seluruh file → Run
--
-- PRASYARAT: 0001 → 0003 → 0004 → 0005 → 0006 → 0007 → 0008 → 0009 → 0010 →
-- 0011 sudah dijalankan, DALAM URUTAN ITU. Blok pengaman di bawah berhenti
-- dengan pesan jelas kalau belum. Setelah file ini, rantai penuhnya menjadi
-- 0001 → 0003 → 0004 → 0005 → 0006 → 0007 → 0008 → 0009 → 0010 → 0011 → 0012
-- (lihat migrations/README.md — ATURAN BESI).
--
-- ============================================================
-- LATAR BELAKANG BISNIS
-- ============================================================
--
-- Package sudah ada sejak 0008, tapi isinya hanya nama/code/deskripsi. SPEC
-- §23 waktu itu SENGAJA menunda "Package Product Components" dengan alasan
-- yang jelas: pemilihan produk menunggu katalog produk sungguhan. Katalog itu
-- sekarang ADA (0010, `sanci_products`, berisi produk beserta fotonya), jadi
-- penundaan tersebut selesai dan berkas inilah yang menutupnya.
--
-- Masalah nyata yang diselesaikan: tanpa tabel ini, admin menuliskan kode
-- produk ke dalam kolom `description` sebagai teks bebas. Akibatnya kode yang
-- salah ketik tidak ketahuan siapa pun, produk yang sudah ditarik tetap
-- "ada" di dalam paket, dan tidak ada satu pun cara untuk menanyakan
-- "paket mana saja yang memakai produk X". Menautkannya lewat foreign key
-- sungguhan membuat ketiga hal itu menjadi mustahil, bukan sekadar tidak
-- disarankan.
--
-- ============================================================
-- APA YANG DIBUKA IRISAN INI (dan hanya ini)
-- ============================================================
--   partner_package_items → tabel BARU. Satu baris = satu produk di dalam satu
--                           Package, beserta jumlahnya. SANCI Admin kelola
--                           penuh; pengguna partner HANYA BACA, dan hanya isi
--                           paket miliknya sendiri.
--
-- YANG SENGAJA TIDAK DIBUKA:
--   * Tulis partner_package_items dari sisi cabang — apa pun caranya. Package
--     dikurasi SANCI (SPEC §21), dan isinya adalah bagian dari kurasi itu.
--   * Harga, diskon, atau subtotal per baris. Batas "tanpa harga" milik 0010
--     berlaku penuh di sini: sebuah paket adalah DAFTAR BARANG, bukan kuitansi.
--   * Menyalin isi paket ke dalam pesanan (snapshot per order). Pesanan masih
--     menunjuk paket lewat `partner_orders.package_id` seperti sebelumnya, dan
--     `package_name` tetap teks bebas yang membekukan nama saat itu (catatan
--     kompatibilitas 0008). Membekukan ISI paket per pesanan adalah keputusan
--     tersendiri dengan tabel tersendiri — jangan ditempelkan di sini.
--   * Tampilan isi paket di sisi cabang. Policy baca di §4 sudah mengizinkannya
--     di lapisan basis data, tapi layarnya belum dibuat — itu irisan berikutnya.
-- ============================================================

-- ── 0. Pengaman prasyarat ───────────────────────────────────

-- Dua tabel induk harus ADA sebelum berkas ini bisa berarti apa-apa. Berhenti
-- dengan kalimat yang menyebutkan berkas mana yang harus dijalankan lebih dulu
-- jauh lebih baik daripada melempar "relation does not exist" milik Postgres
-- kepada orang yang menempelkan SQL ini di Supabase Studio (LESSONS #16).
do $$
begin
  if to_regclass('public.partner_packages') is null then
    raise exception
      'Migration 0008_packages_customer_edit_attribution.sql belum dijalankan di database ini. Jalankan 0001 → 0003 → 0004 → 0005 → 0006 → 0007 → 0008 → 0009 → 0010 → 0011 dulu, baru 0012.';
  end if;

  if to_regclass('public.sanci_products') is null then
    raise exception
      'Migration 0010_sanci_product_catalog.sql belum dijalankan di database ini. Jalankan 0010 (dan 0011) dulu, baru 0012.';
  end if;

  -- Ketiga trigger di §3 memakai fungsi milik 0001/0004. Tanpa salah satunya,
  -- tabel ini akan lahir tanpa audit / tanpa created_by dan tidak ada yang tahu.
  if to_regprocedure('public.fn_audit_row()') is null
     or to_regprocedure('public.fn_touch_updated_at()') is null
     or to_regprocedure('public.fn_set_created_by()') is null then
    raise exception
      'Fungsi trigger dasar (fn_audit_row / fn_touch_updated_at / fn_set_created_by) belum ada. Jalankan 0001 → … → 0011 dulu, baru 0012.';
  end if;
end;
$$;

-- ── 1. Tabel partner_package_items ──────────────────────────

-- KENAPA DUA ATURAN ON DELETE-nya BERBEDA — ini keputusan, bukan kelalaian:
--
--   package_id → ON DELETE CASCADE. Baris ini adalah BAGIAN DARI paket, bukan
--     benda berdiri sendiri: kalau paketnya benar-benar lenyap, daftar isinya
--     tidak punya arti apa pun lagi. Perlu dicatat bahwa dalam praktiknya ini
--     nyaris tidak pernah terjadi — paket TIDAK PERNAH dihapus keras
--     (LESSONS #4: status INACTIVE, bukan DELETE), jadi CASCADE di sini adalah
--     semantik yang benar untuk kasus yang hampir mustahil, bukan jalur yang
--     dipakai sehari-hari.
--
--   product_id → ON DELETE RESTRICT. Sebuah produk yang hilang TIDAK BOLEH
--     diam-diam menghapus satu baris isi paket: yang benar adalah seseorang
--     memutuskan "paket ini sekarang isinya apa", bukan basis data yang
--     memutuskannya sendiri tanpa jejak. Produk juga tidak pernah dihapus keras
--     (pola status yang sama), jadi ini pun sebagian besar teoretis — tapi
--     RESTRICT adalah semantik yang benar dan SEKALIGUS gaya yang sudah dipakai
--     `partner_orders.package_id → partner_packages` di 0008.
--
-- quantity: integer dengan CHECK (> 0). Nol bukan "tidak ada" — kalau sebuah
-- produk tidak jadi bagian paket, barisnya DIHAPUS. Membiarkan quantity = 0
-- hidup akan menghasilkan dua cara berbeda untuk menyatakan hal yang sama, dan
-- layar isi paket harus memilih salah satunya secara sewenang-wenang.
-- DEFAULT 1 aman ditinjau dari LESSONS #8: menambahkan satu produk ke paket
-- hampir selalu berarti satu unit, dan nilai ini bukan "kondisi terburuk yang
-- senyap" — ia terlihat jelas di layar dan bisa langsung diubah.
--
-- unique (package_id, product_id): satu produk muncul PALING BANYAK sekali di
-- dalam satu paket. Menambah unit kedua adalah menaikkan quantity, bukan
-- menambah baris kedua — kalau dua baris untuk produk yang sama dibiarkan,
-- "berapa banyak barang ini di paket tersebut" tidak lagi punya satu jawaban.
create table if not exists public.partner_package_items (
  id                uuid primary key default gen_random_uuid(),
  package_id        uuid not null references public.partner_packages(id) on delete cascade,
  product_id        uuid not null references public.sanci_products(id) on delete restrict,
  quantity          integer not null default 1 check (quantity > 0),
  client_request_id text unique,          -- idempotency jaringan lemah (LESSONS #3, #21)
  created_by        uuid,                 -- auth.uid(), dipaksa trigger 0004
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (package_id, product_id)
);

-- Dua indeks pencarian. Yang pertama melayani pertanyaan sehari-hari ("isi
-- paket ini apa saja") — sebenarnya sudah dilayani unique constraint di atas
-- karena package_id adalah kolom pertamanya, tapi ditulis eksplisit supaya
-- tidak hilang kalau bentuk unique-nya suatu hari berubah. Yang kedua melayani
-- pertanyaan yang justru menjadi alasan tabel ini ada: "paket mana saja yang
-- memakai produk X" — pertanyaan yang MUSTAHIL dijawab waktu isinya masih
-- berupa teks bebas di kolom description.
create index if not exists idx_package_items_package
  on public.partner_package_items (package_id);

create index if not exists idx_package_items_product
  on public.partner_package_items (product_id);

-- ── 2. Audit: awalan PACKAGE_ITEM ───────────────────────────

-- Definisi ulang UTUH fn_audit_row (bukan tambalan) — ATURAN BESI
-- migrations/README.md. Versi yang disalin adalah versi 0010, yaitu berkas
-- TERAKHIR yang mendefinisikan ulang fungsi ini (0011 sengaja tidak
-- menyentuhnya, dinyatakan lewat komentar di dalam berkas itu). SELURUH
-- perilaku 0004 + 0005 + 0008 + 0009 + 0010 dipertahankan kata demi kata.
--
-- Yang bertambah hanya DUA hal:
--   1. awalan 'PACKAGE_ITEM' untuk tabel partner_package_items. Tabel ini
--      TIDAK punya kolom `status`, jadi cabang generik yang sudah ada
--      menghasilkan PACKAGE_ITEM_CREATED / _UPDATED / _DELETED dengan
--      sendirinya — tidak ada cabang CASE baru yang perlu ditulis untuk itu.
--   2. pencarian partner_id lewat paket induknya (blok di bawah v_branch),
--      meniru persis pola order_internal_notes milik 0009/0010.
--
-- CATATAN untuk yang menjalankan ulang 0001/0004/0005/0008/0009/0010 SETELAH
-- berkas ini: definisi ini akan tertimpa dan awalan PACKAGE_ITEM hilang
-- diam-diam — layar Aktivitas akan menampilkan PARTNER_PACKAGE_ITEMS_CREATED
-- apa adanya. Jalankan ulang 0012 untuk memulihkannya (migrations/README.md).
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
    when 'partner_package_items' then 'PACKAGE_ITEM'
    when 'order_internal_notes' then 'ORDER_INTERNAL_NOTE'
    when 'sanci_products' then 'PRODUCT'
    when 'sanci_catalog_access' then 'CATALOG_ACCESS'
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
    elsif tg_table_name = 'partner_orders'
          and (old_rec->>'customer_arrived_at') is null
          and (rec->>'customer_arrived_at') is not null then
      v_action := 'ORDER_CUSTOMER_ARRIVED';
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
  -- sanci_products tidak punya satu pun dari kunci ini → kedua nilai null,
  -- persis yang dimaksud (produk milik SANCI, bukan milik partner).
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

  -- order_internal_notes tidak punya kolom partner_id/branch_id sendiri; tanpa
  -- blok ini barisnya masuk audit dengan partner kosong dan hilang dari layar
  -- Aktivitas yang disaring per partner. Aman dibaca di sini karena fungsi ini
  -- security definer (RLS partner_orders dilewati) — dan tidak menambah
  -- kebocoran apa pun, sebab audit_logs hanya bisa dibaca admin (al_admin_read,
  -- 0001), yaitu satu-satunya pihak yang boleh melihat tabel catatannya juga.
  if tg_table_name = 'order_internal_notes' then
    select o.partner_id, o.branch_id into v_partner, v_branch
    from partner_orders o
    where o.id = nullif(coalesce(rec->>'order_id', old_rec->>'order_id'), '')::uuid;
  end if;

  -- partner_package_items juga tidak punya partner_id sendiri — alasan dan
  -- keamanannya sama persis dengan blok order_internal_notes di atas. Bedanya
  -- satu: v_branch SENGAJA dibiarkan null. Package adalah benda tingkat
  -- PARTNER, bukan tingkat cabang (partner_packages sendiri tidak pernah punya
  -- branch_id sejak 0008), jadi mengarang nilai cabang di sini justru akan
  -- membuat baris audit ini muncul di saringan cabang yang tidak ada
  -- hubungannya dengan kejadiannya.
  if tg_table_name = 'partner_package_items' then
    select pp.partner_id into v_partner
    from partner_packages pp
    where pp.id = nullif(coalesce(rec->>'package_id', old_rec->>'package_id'), '')::uuid;
  end if;

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

-- ── 3. Trigger partner_package_items ────────────────────────

-- Ketiganya meniru partner_packages (0008 §7) persis: audit setiap perubahan,
-- updated_at yang tidak bisa dibohongi client (LESSONS #11), created_by yang
-- diisi server dari auth.uid() dan bukan dari nilai kiriman (LESSONS #6).
drop trigger if exists trg_audit on public.partner_package_items;
create trigger trg_audit after insert or update or delete on public.partner_package_items
  for each row execute function public.fn_audit_row();

drop trigger if exists trg_touch on public.partner_package_items;
create trigger trg_touch before update on public.partner_package_items
  for each row execute function public.fn_touch_updated_at();

drop trigger if exists trg_set_created_by on public.partner_package_items;
create trigger trg_set_created_by before insert on public.partner_package_items
  for each row execute function public.fn_set_created_by();

-- ── 4. RLS partner_package_items ────────────────────────────

alter table public.partner_package_items enable row level security;

drop policy if exists ppi_admin_all on public.partner_package_items;
create policy ppi_admin_all on public.partner_package_items
  for all using (public.fn_is_admin()) with check (public.fn_is_admin());

-- HANYA BACA untuk pengguna partner, dan hanya isi paket partner sendiri.
-- Alasannya sama persis dengan pkg_partner_read di 0008: Package dikurasi
-- SANCI dan partner tidak pernah menulisnya, tapi partner memang berhak
-- MELIHAT isi paketnya — paketnya sendiri sudah terbaca lewat pkg_partner_read
-- sejak 0008, dan sebuah paket yang bisa dibaca tapi isinya tidak, tidak ada
-- gunanya.
--
-- Kepemilikan dinilai lewat paket induknya (satu-satunya tempat partner_id
-- hidup). Perhatikan bahwa ini TIDAK melanggar LESSONS #25: policy ini menengok
-- partner_packages, yaitu tabel LAIN — bukan partner_package_items itu sendiri.
-- Kalau suatu hari seseorang tergoda menambahkan syarat yang membaca ulang
-- partner_package_items di sini, INSERT … RETURNING akan mati diam-diam persis
-- seperti kasus customers dulu.
--
-- TIDAK ADA policy INSERT/UPDATE/DELETE untuk partner: isi Package dikelola
-- SANCI Admin. Tanpa policy = tertutup, bukan sekadar tersembunyi — dan blok
-- verifikasi di §5 membuktikannya lewat PACKAGE_ITEM_PARTNER_WRITE_POLICIES.
drop policy if exists ppi_partner_read on public.partner_package_items;
create policy ppi_partner_read on public.partner_package_items
  for select using (
    exists (
      select 1 from partner_packages pp
      where pp.id = partner_package_items.package_id
        and pp.partner_id = public.fn_pu_partner()
    )
  );

-- ── 5. Verifikasi (hasilnya di-copy balik ke Claude) ────────
-- Harapan:
--   PACKAGE_ITEM_TABLE                    1   ← tabel partner_package_items ada
--   PACKAGE_ITEM_UNIQUE                   1   ← unique (package_id, product_id) terpasang
--   PACKAGE_ITEM_QTY_CHECK                1   ← check (quantity > 0) terpasang
--   PACKAGE_ITEM_RLS                      1   ← RLS aktif
--   PACKAGE_ITEM_POLICIES                 2   ← ppi_admin_all + ppi_partner_read
--   PACKAGE_ITEM_PARTNER_WRITE_POLICIES   0   ← WAJIB 0: partner tidak boleh menulis isi Package
--   PACKAGE_ITEM_TRIGGERS                 3   ← audit, touch, set_created_by
--   PACKAGE_ITEM_FK_PRODUCT_RESTRICT      1   ← WAJIB 1: FK ke sanci_products ber-ON DELETE RESTRICT ('r')
--   PACKAGE_ITEM_FK_PRODUCT_NOT_CASCADE   0   ← WAJIB 0: dan BUKAN cascade ('c')
--   PACKAGE_ITEM_FK_PACKAGE_CASCADE       1   ← WAJIB 1: FK ke partner_packages ber-ON DELETE CASCADE ('c')
--   PACKAGE_ITEM_INDEXES                  2   ← idx_package_items_package + _product
--   AUDIT_PACKAGE_ITEM                    1   ← fn_audit_row mengenal awalan PACKAGE_ITEM
--   AUDIT_PACKAGE_ITEM_PARTNER_LOOKUP     1   ← dan mencari partner lewat paket induknya
--   AUDIT_KEEP_0010_PRODUCT               1   ← awalan PRODUCT milik 0010 masih utuh
--   AUDIT_KEEP_0010_CATALOG               1   ← awalan CATALOG_ACCESS milik 0010 masih utuh
--   AUDIT_KEEP_0009_ARRIVED               1   ← ORDER_CUSTOMER_ARRIVED milik 0009 masih utuh
--   AUDIT_KEEP_0009_NOTE                  1   ← ORDER_INTERNAL_NOTE milik 0009 masih utuh
--   AUDIT_KEEP_0008_PKG                   1   ← awalan PACKAGE milik 0008 masih utuh
--   AUDIT_KEEP_0008_PHONE                 1   ← CUSTOMER_PHONE_CHANGED milik 0008 masih utuh
--   AUDIT_KEEP_0008_ATTR                  1   ← ORDER_ATTRIBUTION_CORRECTED milik 0008 masih utuh
--   AUDIT_KEEP_0005                       1   ← ORDER_CANCELLED milik 0005 masih utuh
--   AUDIT_KEEP_0004                       1   ← pemetaan created_via_* milik 0004 masih utuh
--   REFS_CHECK_CUSTOMER                   1   ← WAJIB 1: lubang P2 milik 0011 masih tertutup
--
-- Enam angka AUDIT_KEEP_* dan REFS_CHECK_CUSTOMER adalah REGRESI, bukan fitur
-- baru: berkas ini mendefinisikan ulang fn_audit_row secara utuh, dan proyek
-- ini sudah pernah kehilangan awalan lama persis dengan cara itu. Kalau salah
-- satunya 0, JANGAN teruskan — berarti versi yang tertulis di §2 bukan salinan
-- lengkap versi 0010. REFS_CHECK_CUSTOMER ikut diperiksa karena ia satu-satunya
-- bukti lubang tanpa gejala milik 0011 (migrations/README.md), dan berkas ini
-- adalah berkas terakhir dalam rantai.
--
-- Angka blok verifikasi file LAMA yang BERUBAH setelah 0012:
--   0001: RLS_ENABLED 16 → 17 · POLICIES 35 → 37 · TRIGGERS 24 → 27
--         (partner_package_items berawalan `partner%`, jadi ketiga trigger-nya
--          IKUT terhitung di blok 0001 — beda dari order_internal_notes)
-- Kalau ada yang tidak cocok, JANGAN anggap beres: laporkan apa adanya
-- (LESSONS #7 & #16).

select 'PACKAGE_ITEM_TABLE' as check_type,
       count(*)::text as result
from information_schema.tables
where table_schema = 'public' and table_name = 'partner_package_items'
union all
select 'PACKAGE_ITEM_UNIQUE', count(*)::text
from pg_constraint
where conrelid = 'public.partner_package_items'::regclass and contype = 'u'
  and pg_get_constraintdef(oid) like '%(package_id, product_id)%'
union all
select 'PACKAGE_ITEM_QTY_CHECK', count(*)::text
from pg_constraint
where conrelid = 'public.partner_package_items'::regclass and contype = 'c'
  and pg_get_constraintdef(oid) like '%quantity%'
  and pg_get_constraintdef(oid) like '%> 0%'
union all
select 'PACKAGE_ITEM_RLS', count(*)::text
from pg_tables where schemaname = 'public' and tablename = 'partner_package_items' and rowsecurity
union all
select 'PACKAGE_ITEM_POLICIES', count(*)::text
from pg_policies where schemaname = 'public' and tablename = 'partner_package_items'
union all
select 'PACKAGE_ITEM_PARTNER_WRITE_POLICIES', count(*)::text
from pg_policies
where schemaname = 'public' and tablename = 'partner_package_items'
  and cmd in ('INSERT','UPDATE','DELETE')
union all
select 'PACKAGE_ITEM_TRIGGERS', count(*)::text
from pg_trigger tg join pg_class cl on cl.oid = tg.tgrelid
join pg_namespace ns on ns.oid = cl.relnamespace
where not tg.tgisinternal and ns.nspname = 'public' and cl.relname = 'partner_package_items'
union all
select 'PACKAGE_ITEM_FK_PRODUCT_RESTRICT', count(*)::text
from pg_constraint
where conrelid = 'public.partner_package_items'::regclass and contype = 'f'
  and confrelid = 'public.sanci_products'::regclass and confdeltype = 'r'
union all
select 'PACKAGE_ITEM_FK_PRODUCT_NOT_CASCADE', count(*)::text
from pg_constraint
where conrelid = 'public.partner_package_items'::regclass and contype = 'f'
  and confrelid = 'public.sanci_products'::regclass and confdeltype = 'c'
union all
select 'PACKAGE_ITEM_FK_PACKAGE_CASCADE', count(*)::text
from pg_constraint
where conrelid = 'public.partner_package_items'::regclass and contype = 'f'
  and confrelid = 'public.partner_packages'::regclass and confdeltype = 'c'
union all
select 'PACKAGE_ITEM_INDEXES', count(*)::text
from pg_indexes
where schemaname = 'public' and tablename = 'partner_package_items'
  and indexname in ('idx_package_items_package', 'idx_package_items_product')
union all
select 'AUDIT_PACKAGE_ITEM', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%PACKAGE_ITEM%'
union all
select 'AUDIT_PACKAGE_ITEM_PARTNER_LOOKUP', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row'
  and p.prosrc like '%from partner_packages pp%'
union all
select 'AUDIT_KEEP_0010_PRODUCT', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%''PRODUCT''%'
union all
select 'AUDIT_KEEP_0010_CATALOG', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%''CATALOG_ACCESS''%'
union all
select 'AUDIT_KEEP_0009_ARRIVED', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%ORDER_CUSTOMER_ARRIVED%'
union all
select 'AUDIT_KEEP_0009_NOTE', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%ORDER_INTERNAL_NOTE%'
union all
select 'AUDIT_KEEP_0008_PKG', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%partner_packages%'
union all
select 'AUDIT_KEEP_0008_PHONE', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%CUSTOMER_PHONE_CHANGED%'
union all
select 'AUDIT_KEEP_0008_ATTR', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%ORDER_ATTRIBUTION_CORRECTED%'
union all
select 'AUDIT_KEEP_0005', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%ORDER_CANCELLED%'
union all
select 'AUDIT_KEEP_0004', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%created_via_partner_id%'
union all
select 'REFS_CHECK_CUSTOMER', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_check_order_refs' and p.prosrc like '%customers%';
