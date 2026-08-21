-- ============================================================
-- SANCI Partner Hub — Phase 2 irisan ketiga belas
-- Migration 0018: penomoran otomatis customer_code SANCI-direct —
--                  {SourceCode}/{YY}-{SalesCode}/{SeqNo}
--                  (idempotent — aman dijalankan ulang)
-- Jalankan di: Supabase Studio → SQL Editor → paste seluruh file → Run
--
-- PRASYARAT: 0001 → 0003 → 0004 → 0005 → 0006 → 0007 → 0008 → 0009 → 0010 →
-- 0011 → 0012 → 0013 → 0014 → 0015 → 0016 → 0017 sudah dijalankan, DALAM
-- URUTAN ITU. Blok pengaman di bawah berhenti dengan pesan jelas kalau belum.
-- Setelah berkas ini, rantai penuhnya menjadi 0001 → 0003 → … → 0017 → 0018
-- (lihat migrations/README.md — ATURAN BESI).
--
-- ============================================================
-- LATAR BELAKANG BISNIS (owner, verbatim, 2026-08-20/21 — "要靈活編輯")
-- ============================================================
--
-- SANCI SUDAH memberi kode manual ke pelanggan langsungnya sendiri (populasi
-- "SANCI-only, invisible to branches" yang diimpor 0017) dalam format:
--
--   {SourceCode}/{YY}-{SalesCode}/{SeqNo}   contoh nyata: A/25-C/001, E/26-KEN/019
--
--   SourceCode  — satu huruf, cara pelanggan masuk. Daftar SEKARANG (owner):
--                 A=dari Tim Komisaris, B=B2B, C=Visit Langsung,
--                 D=Tim Marketing, E=Tim Sosial Media.
--   YY          — 2 digit tahun PEMBUATAN pelanggan.
--   SalesCode   — sales SANCI INTERNAL yang memegang pelanggan ini. Daftar
--                 SEKARANG (owner): M=Amenni, NS=Nini San, AL=Alina,
--                 C=Cherlie, GL=Gilang, S=Serly, D=Dinna.
--                 BUKAN partner_staff (itu milik toko/cabang mitra masing-
--                 masing — dropdown "Sales"/"PIC" di pembuatan pesanan).
--                 Namespace SalesCode SENGAJA tumpang tindih dengan satu
--                 huruf SourceCode (C = Visit Langsung ATAU Cherlie; D = Tim
--                 Marketing ATAU Dinna) — ini AMAN karena dua kolom terpisah
--                 yang tidak pernah digabung tanpa separator sendiri masing-
--                 masing (lihat format di atas: '/' dan '-' memisahkan).
--   SeqNo       — nomor urut GLOBAL (bukan per-sumber, bukan per-sales, bukan
--                 per-tahun), dipadatkan nol minimal 3 digit, TUMBUH TERUS
--                 melewati 999 tanpa terpotong. 36 baris impor memakai
--                 001–037 (024 sengaja hilang — lubang di data historis
--                 owner sendiri, TIDAK diisi ulang).
--
-- "要靈活編輯" (owner, verbatim): daftar SourceCode dan roster SalesCode
-- WAJIB data master yang dikelola admin (tambah/nonaktifkan), BUKAN
-- enum/CHECK constraint hardcode — pergantian staf dan kanal lead baru
-- diperkirakan terjadi dari waktu ke waktu.
-- ============================================================
-- APA YANG DIBUKA IRISAN INI (dan hanya ini)
-- ============================================================
--   customer_sources     → tabel BARU. Master "kode sumber" — satu huruf +
--                          label, ACTIVE/INACTIVE (LESSONS #4), admin-only.
--   sanci_sales_staff    → tabel BARU. Master roster sales SANCI INTERNAL —
--                          satu kode + nama, ACTIVE/INACTIVE, admin-only.
--   customers.source_id       → kolom BARU, nullable, FK → customer_sources
--                                ON DELETE RESTRICT.
--   customers.sales_staff_id  → kolom BARU, nullable, FK → sanci_sales_staff
--                                ON DELETE RESTRICT.
--   customer_code_seq    → SEQUENCE Postgres BARU, global (lihat §4 untuk
--                          alasan kenapa sequence polos, bukan counter-table
--                          seperti partner_order_counters 0004).
--   fn_set_customer_code → trigger BEFORE INSERT customers baru: kalau
--                          customer_code kosong DAN source_id+sales_staff_id
--                          keduanya terisi, generate server-side. Nilai
--                          customer_code yang SUDAH terisi (jalur skrip
--                          impor, atau override manual) TIDAK PERNAH ditimpa
--                          — additive, bukan wajib.
--   fn_audit_row          → didefinisikan ULANG (lihat §8) untuk menambah
--                          awalan CUSTOMER_SOURCE / SALES_STAFF.
--
-- YANG SENGAJA TIDAK DIBUKA:
--   * RLS `customers` — TIDAK disentuh sama sekali (streak sejak 0017
--     berlanjut, ditegaskan eksplisit di §7).
--   * Validasi "source_id/sales_staff_id harus menunjuk baris ACTIVE" — FK
--     biasa tidak peduli status; UI membatasi dropdown ke ACTIVE saja, tapi
--     DB tidak memblokir referensi ke baris yang sudah dinonaktifkan (sama
--     seperti partner_packages/sanci_products yang sudah INACTIVE tetap
--     bisa dirujuk order lama — riwayat tidak boleh berubah makna).
--   * Alat pindah massal sales/sumber untuk pelanggan lama, kustomisasi
--     format kode per-sumber/per-sales di luar yang dibangun di sini.
-- ============================================================

-- ── 0. Pengaman prasyarat ───────────────────────────────────

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'customers'
                   and column_name = 'customer_code') then
    raise exception
      'Migration 0017_customer_code_email.sql belum dijalankan di database ini. Jalankan 0001 → … → 0017 dulu, baru 0018.';
  end if;
  if to_regprocedure('public.fn_is_admin()') is null
     or to_regprocedure('public.fn_audit_row()') is null
     or to_regprocedure('public.fn_touch_updated_at()') is null
     or to_regprocedure('public.fn_set_created_by()') is null then
    raise exception
      'Fungsi dasar (fn_is_admin / fn_audit_row / fn_touch_updated_at / fn_set_created_by) belum lengkap. Jalankan 0001 → … → 0017 dulu, baru 0018.';
  end if;
end;
$$;

-- ── 1. customer_sources: master "kode sumber" ───────────────

-- Bentuk MENIRU sanci_products (0010) / partner_packages (0008): status
-- ACTIVE/INACTIVE pengganti hard delete (LESSONS #4), client_request_id
-- untuk idempotency jaringan lemah (LESSONS #3/#21), created_by dipaksa
-- trigger (bukan dipercaya dari client, LESSONS #6).
--
-- code NOT NULL (beda dari sanci_products.code yang OPSIONAL) — kode sumber
-- MEMANG selalu ada untuk setiap baris master ini, tidak seperti nomor
-- barang gudang yang boleh kosong.
create table if not exists public.customer_sources (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null,
  label              text not null,
  status             text not null default 'ACTIVE'
                     check (status in ('ACTIVE','INACTIVE')),
  client_request_id  text unique,
  created_by         uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint
                 where conname = 'customer_sources_code_not_blank'
                   and conrelid = 'public.customer_sources'::regclass) then
    alter table public.customer_sources
      add constraint customer_sources_code_not_blank
      check (btrim(code) <> '');
  end if;
end;
$$;

-- UNIK HANYA di antara baris ACTIVE (pola 0010 §1, dipilih SESUAI instruksi
-- tugas ini — beda dari partial-unique customers.customer_code/
-- sanci_products.code yang bersyarat "not null", di sini bersyaratnya
-- "status = 'ACTIVE'" karena code selalu NOT NULL): kode yang sudah
-- dinonaktifkan boleh suatu hari dipakai ulang oleh baris ACTIVE yang baru,
-- tanpa perlu migrasi baru untuk "membebaskan" kode lama.
create unique index if not exists customer_sources_code_active_key
  on public.customer_sources (code) where status = 'ACTIVE';

-- ── 2. sanci_sales_staff: master roster sales SANCI internal ─

-- Bentuk PERSIS sama dengan customer_sources di atas — beda hanya nama
-- kolom label→name (nama orang, bukan label kalimat) dan nama tabel. SENGAJA
-- tabel TERPISAH dari partner_staff: partner_staff milik toko/cabang mitra
-- masing-masing (dropdown Sales/PIC di pembuatan pesanan); roster ini milik
-- SANCI sendiri, konsep yang sama sekali berbeda meski nama field mirip
-- (lihat kepala berkas, disambiguasi eksplisit dari task).
create table if not exists public.sanci_sales_staff (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null,
  name               text not null,
  status             text not null default 'ACTIVE'
                     check (status in ('ACTIVE','INACTIVE')),
  client_request_id  text unique,
  created_by         uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint
                 where conname = 'sanci_sales_staff_code_not_blank'
                   and conrelid = 'public.sanci_sales_staff'::regclass) then
    alter table public.sanci_sales_staff
      add constraint sanci_sales_staff_code_not_blank
      check (btrim(code) <> '');
  end if;
end;
$$;

create unique index if not exists sanci_sales_staff_code_active_key
  on public.sanci_sales_staff (code) where status = 'ACTIVE';

-- ── 3. customers.source_id / customers.sales_staff_id ───────

-- Nullable — HANYA pelanggan SANCI-direct dapat nilai di sini; pelanggan
-- buatan cabang TIDAK PERNAH punya salah satu (form cabang tidak menawarkan
-- field ini sama sekali). ON DELETE RESTRICT (bukan CASCADE, LESSONS #4 +
-- pola 0010/0012): menonaktifkan sumber/sales TIDAK PERNAH boleh diam-diam
-- membuat baris pelanggan lama yatim — dan karena tidak ada hard-delete di
-- UI untuk kedua master ini (hanya status ACTIVE/INACTIVE), RESTRICT di sini
-- praktisnya jaring pengaman terhadap penghapusan manual lewat SQL Editor.
alter table public.customers
  add column if not exists source_id uuid references public.customer_sources(id) on delete restrict;
alter table public.customers
  add column if not exists sales_staff_id uuid references public.sanci_sales_staff(id) on delete restrict;

-- ── 4. customer_code_seq: SEQUENCE global ───────────────────

-- SEQUENCE polos, BUKAN counter-table seperti partner_order_counters (0004).
-- partner_order_counters ADA karena nomor order berpartisi (branch_id,
-- seq_date) — dua partisi berbeda boleh punya nomor 1 di saat bersamaan.
-- SeqNo di sini SENGAJA GLOBAL (bukan per-sumber/per-sales/per-tahun, lihat
-- kepala berkas) — TIDAK ADA kolom partisi sama sekali, jadi `SEQUENCE`
-- polos (atomik bawaan Postgres, tanpa perlu INSERT...ON CONFLICT DO UPDATE
-- untuk mengunci baris) adalah alat yang PALING SEDERHANA yang benar untuk
-- kasus ini. JANGAN "diperbaiki" jadi counter-table — itu kompleksitas yang
-- tidak dibutuhkan kasus tanpa partisi ini.
--
-- Nilai awal DIHITUNG DINAMIS dari data yang SUDAH ADA (bukan tebakan
-- hardcode): cari angka terbesar di akhir customer_code yang sudah terisi
-- (36 baris impor 0017 memakai 001–037 dengan 024 hilang — MAX sungguhan
-- adalah 037 kalau baris itu ada), lalu sequence mulai SATU ANGKA di
-- atasnya. Ditulis idempoten dan AMAN dijalankan ulang: blok ini HANYA
-- mengeksekusi kalau sequence-nya belum ada sama sekali (to_regclass null)
-- — begitu sequence sudah ada, nilainya TIDAK PERNAH disetel ulang oleh
-- migrasi ini lagi, supaya menjalankan ulang berkas ini tidak pernah
-- memutar mundur nomor yang sudah dipakai (yang akan menghasilkan
-- customer_code DOBEL kalau nextval() mengulang angka yang sudah terpakai).
do $$
declare
  v_max integer;
begin
  if to_regclass('public.customer_code_seq') is null then
    create sequence public.customer_code_seq;

    -- '(\d+)$' menangkap digit di UJUNG string apa pun bentuk pemisahnya
    -- ("A/25-C/001" → "001") — lebih tangguh daripada split_part pada '/'
    -- (yang akan salah kalau suatu hari SalesCode sendiri mengandung digit).
    select coalesce(max(substring(customer_code from '(\d+)$')::integer), 0)
      into v_max
    from public.customers
    where customer_code is not null and customer_code ~ '\d+$';

    -- setval(..., v_max+1, false): false = "belum dipakai", jadi nextval()
    -- PERTAMA kali akan mengembalikan persis v_max+1 (bukan v_max+2). Kalau
    -- belum ada satu pun customer_code berpola angka (v_max=0), ini
    -- menghasilkan titik awal 1 — sama dengan default bawaan sequence baru,
    -- jadi baris ini benar baik untuk 0 MAUPUN 36 (atau N) pelanggan yang
    -- sudah punya kode, tanpa cabang kode terpisah untuk kedua kasus.
    perform setval('public.customer_code_seq', v_max + 1, false);
  end if;
end;
$$;

-- ── 5. fn_set_customer_code(): trigger BEFORE INSERT customers ──

-- Struktur MENIRU fn_set_order_number (0004 §2) persis: nilai kiriman client
-- yang SUDAH TERISI tidak pernah ditimpa (LESSONS #6 — bedanya di sini
-- "sudah terisi" berarti TIDAK generate, bukan "selalu generate lalu
-- override" seperti order_number yang WAJIB selalu server-generated).
-- Auto-generation ADDITIVE, bukan wajib (task spec) — kalau customer_code
-- sudah ada isinya (jalur skrip impor 0017, atau override admin manual),
-- baris ini dibiarkan APA ADANYA.
create or replace function public.fn_set_customer_code() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_source_code text;
  v_sales_code  text;
  v_yy          text;
  v_seq         integer;
begin
  -- String kosong diperlakukan SAMA dengan NULL — konsisten dengan
  -- blank-guard CHECK milik kolom ini (0017): pemanggil yang mengirim ''
  -- dianggap "tidak mengirim kode", bukan disimpan sebagai '' (yang toh akan
  -- ditolak CHECK itu, mengubah kealpaan yang wajar jadi error 23514 yang
  -- membingungkan).
  if new.customer_code is not null and btrim(new.customer_code) = '' then
    new.customer_code := null;
  end if;

  -- customer_code SUDAH terisi (non-blank) → TIDAK PERNAH ditimpa. Ini jalur
  -- skrip impor (web/scripts/import-customers/, customer_code sudah dari
  -- data historis) dan jalur override manual mana pun di masa depan.
  if new.customer_code is not null then
    return new;
  end if;

  -- KEDUA source_id DAN sales_staff_id wajib terisi untuk generate. Hanya
  -- SATU terisi (mis. source tanpa sales) SENGAJA TIDAK generate apa pun —
  -- separuh skema bukan kode yang valid, dan menebak separuh yang hilang
  -- berarti mengarang data yang tidak pernah diketik admin (LESSONS #6).
  if new.source_id is null or new.sales_staff_id is null then
    return new;
  end if;

  -- Kode SEKARANG, BUKAN cuplikan beku — keputusan sadar (task spec): kalau
  -- admin suatu hari mengganti nama kode sumber/sales (mengoreksi typo,
  -- LESSONS #4 pola ACTIVE/INACTIVE), pelanggan yang kodenya SUDAH digenerate
  -- SEBELUM penggantian itu TETAP memakai teks lama (customer_code adalah
  -- TEKS beku begitu ditulis) — hanya pelanggan yang digenerate SESUDAH
  -- penggantian yang memakai huruf baru. Ini disengaja: kode master (§1/§2)
  -- dimaksudkan sebagai identitas stabil, penggantiannya jarang dan
  -- sepenuhnya keputusan admin — bukan sesuatu yang perlu "disinkronkan
  -- mundur" ke riwayat yang sudah tercetak di kertas/WhatsApp pelanggan.
  select code into v_source_code from public.customer_sources where id = new.source_id;
  select code into v_sales_code  from public.sanci_sales_staff  where id = new.sales_staff_id;

  if v_source_code is null or v_sales_code is null then
    raise exception 'source_id/sales_staff_id pada pelanggan baru menunjuk baris yang tidak ada';
  end if;

  -- Waktu server (LESSONS #11), tanggal BISNIS Indonesia — pola sama persis
  -- dengan fn_set_order_number (0004 §2): tanpa konversi zona, pelanggan yang
  -- dibuat sore/malam WIB di awal Januari bisa tercatat tahun SEBELUMNYA
  -- (UTC belum lewat tengah malam WIB) atau sebaliknya, salah baca oleh staf
  -- yang membaca kode itu bertahun-tahun kemudian.
  v_yy := to_char(now() at time zone 'Asia/Jakarta', 'YY');

  -- GLOBAL, atomik bawaan Postgres — lihat komentar di CREATE SEQUENCE §4
  -- untuk alasan lengkap kenapa sequence polos adalah alat yang benar di sini.
  v_seq := nextval('public.customer_code_seq');

  -- lpad ke MINIMAL 3 digit — lpad TIDAK memotong angka yang lebih panjang
  -- (diverifikasi eksplisit di test-harness), jadi format ini tumbuh wajar
  -- melewati 999 tanpa penanganan khusus apa pun.
  new.customer_code := v_source_code || '/' || v_yy || '-' || v_sales_code || '/' || lpad(v_seq::text, 3, '0');
  return new;
end;
$$;

-- ── 6. Trigger kedua master + customers ──────────────────────

do $$
declare t text;
begin
  foreach t in array array['customer_sources','sanci_sales_staff']
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

drop trigger if exists trg_set_customer_code on public.customers;
create trigger trg_set_customer_code before insert on public.customers
  for each row execute function public.fn_set_customer_code();

-- ── 7. RLS: admin-only PENUH, nol policy non-admin ──────────

-- Cabang TIDAK PERNAH melihat/butuh data ini — pelanggan yang memakai skema
-- ini sudah invisible ke cabang sejak 0017. Pola PERSIS sanci_catalog_access
-- (0010 §6): satu policy admin FOR ALL, TIDAK ADA policy lain sama sekali.
alter table public.customer_sources enable row level security;
drop policy if exists csrc_admin_all on public.customer_sources;
create policy csrc_admin_all on public.customer_sources
  for all using (public.fn_is_admin()) with check (public.fn_is_admin());

alter table public.sanci_sales_staff enable row level security;
drop policy if exists sst_admin_all on public.sanci_sales_staff;
create policy sst_admin_all on public.sanci_sales_staff
  for all using (public.fn_is_admin()) with check (public.fn_is_admin());

-- customers RLS — TIDAK disentuh sama sekali (streak sejak 0017 berlanjut).
-- Berkas ini TIDAK punya satu baris pun create/drop/alter policy untuk
-- customers. Kolom BARU §3 otomatis ikut ATURAN BARIS yang sudah ada (RLS
-- Postgres bekerja per BARIS, bukan per kolom — sama argumen 0017 §3), dan
-- CUSTOMER_POLICIES di §10 membuktikan angka itu TETAP 4 (c_admin_all/
-- c_partner_read/c_partner_insert/c_partner_update, sejak 0008).

-- ── 8. fn_audit_row: didefinisikan ULANG untuk CUSTOMER_SOURCE/SALES_STAFF ──

-- Definisi ulang UTUH (bukan tambalan) — ATURAN BESI migrations/README.md.
-- Versi yang disalin adalah versi 0016, berkas TERAKHIR yang mendefinisikan
-- ulang fungsi ini (0017 SENGAJA tidak menyentuhnya — dikonfirmasi lewat
-- AUDIT_KEEP_0014_ITEM dkk. di blok verifikasi 0017, dan lewat catatan
-- ATURAN BESI baris 0017/0016 di migrations/README.md: pemulih fn_audit_row
-- yang berlaku SEKARANG adalah 0016). SELURUH perilaku
-- 0004+0005+0008+0009+0010+0012+0013+0014+0016 dipertahankan kata demi kata.
--
-- Yang bertambah HANYA dua baris pemetaan nama entitas:
--   'customer_sources'  → 'CUSTOMER_SOURCE'
--   'sanci_sales_staff' → 'SALES_STAFF'
-- Keduanya entitas top-level SEDERHANA (tidak perlu blok pencarian
-- partner_id/branch_id lewat tabel lain) — kelas yang SAMA dengan
-- sanci_products/sanci_catalog_access (0010): partner_id DAN branch_id
-- keduanya TETAP null untuk baris audit kedua tabel ini (data ini milik
-- SANCI sendiri, bukan milik partner/cabang mana pun — null di sini BERARTI
-- sesuatu, bukan kealpaan). *_CREATED/_UPDATED/_STATUS_CHANGED/_DELETED
-- muncul dengan sendirinya lewat cabang generik yang sudah ada (kedua tabel
-- punya kolom `status`, jadi *_STATUS_CHANGED ikut otomatis persis seperti
-- PRODUCT_STATUS_CHANGED).
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
    when 'order_sanci_offers' then 'ORDER_OFFER'
    when 'order_items' then 'ORDER_ITEM'
    when 'order_documents' then 'ORDER_DOCUMENT'
    when 'order_document_items' then 'ORDER_DOCUMENT_ITEM'
    when 'sanci_products' then 'PRODUCT'
    when 'sanci_catalog_access' then 'CATALOG_ACCESS'
    when 'customer_sources' then 'CUSTOMER_SOURCE'
    when 'sanci_sales_staff' then 'SALES_STAFF'
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

  if tg_table_name in ('order_internal_notes','order_sanci_offers','order_items','order_documents') then
    select o.partner_id, o.branch_id into v_partner, v_branch
    from partner_orders o
    where o.id = nullif(coalesce(rec->>'order_id', old_rec->>'order_id'), '')::uuid;
  end if;

  if tg_table_name = 'partner_package_items' then
    select pp.partner_id into v_partner
    from partner_packages pp
    where pp.id = nullif(coalesce(rec->>'package_id', old_rec->>'package_id'), '')::uuid;
  end if;

  if tg_table_name = 'order_document_items' then
    select o.partner_id, o.branch_id into v_partner, v_branch
    from order_documents doc
    join partner_orders o on o.id = doc.order_id
    where doc.id = nullif(coalesce(rec->>'document_id', old_rec->>'document_id'), '')::uuid;
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

-- CATATAN untuk yang menjalankan ulang 0001/0004/0005/0008/0009/0010/0012/
-- 0013/0014/0016 SETELAH file ini: definisi ini akan tertimpa dan pemetaan
-- CUSTOMER_SOURCE/SALES_STAFF hilang diam-diam. Jalankan ulang 0018 untuk
-- memulihkannya (lihat migrations/README.md — baris ATURAN BESI 0018).

-- ── 9. Seed data — daftar SEKARANG milik owner (2026-08-20/21) ──

-- SENGAJA DITARUH SETELAH §6 (trigger)/§7 (RLS)/§8 (fn_audit_row): kalau
-- seed ini dijalankan LEBIH AWAL (mis. tepat sesudah CREATE TABLE di §1/§2,
-- seperti draf pertama berkas ini), trg_audit belum terpasang pada saat
-- INSERT ini berjalan — baris seed akan masuk TANPA baris audit
-- CUSTOMER_SOURCE_CREATED/SALES_STAFF_CREATED sama sekali (diverifikasi
-- lewat T9a/T9b di test-harness/60_behavior_0018.sql: keliru dulu, baru
-- diperbaiki jadi urutan yang sekarang). RLS aktif tidak jadi masalah untuk
-- INSERT ini karena migrasi berjalan sebagai pemilik tabel (superuser),
-- yang tidak tunduk RLS kecuali FORCE ROW LEVEL SECURITY diaktifkan (tidak,
-- di sini).
--
-- Idempoten lewat CHECK-THEN-INSERT (`where not exists`), BUKAN
-- `ON CONFLICT ... WHERE status = 'ACTIVE'` — dicoba lebih dulu, lalu
-- DIBUANG setelah diuji langsung di Postgres 16 lokal dan terbukti punya
-- lubang nyata: kalau admin sudah men-INACTIVE-kan salah satu kode seed
-- (jalur normal §"要靈活編輯"), predikat parsial itu HANYA melihat baris
-- ACTIVE — baris INACTIVE lama tidak lagi "bentrok" apa pun, jadi
-- menjalankan ulang migrasi ini (LESSONS #9 — repo ≠ production, Jenzo bisa
-- saja menempel ulang) akan diam-diam INSERT baris ACTIVE BARU berkode
-- SAMA, menghasilkan DUA baris untuk satu huruf. Diverifikasi (bukan
-- diperkirakan): `update customer_sources set status='INACTIVE' where
-- code='D'` lalu jalankan ulang insert `ON CONFLICT` versi lama →
-- menghasilkan 2 baris code='D' (satu ACTIVE, satu INACTIVE). `where not
-- exists (select 1 from ... where code = v.code)` memeriksa keberadaan
-- kode itu TANPA MEMANDANG STATUS — begitu kode itu pernah ada (ACTIVE
-- ATAU INACTIVE), migrasi ini tidak pernah menyentuhnya lagi, sama seperti
-- "check-then-insert" yang disebut task spec sebagai alternatif sah dari
-- `ON CONFLICT` untuk seed data (beda dari LESSONS #3 yang melarang pola
-- SELECT-lalu-INSERT untuk tulisan PENGGUNA konkuren — seed migrasi
-- dijalankan sekali, tidak konkuren, jadi non-atomicity check-then-insert
-- bukan risiko di sini).
--
-- Ini DATA AWAL SUNGGUHAN (bukan fixture tes) — 36 pelanggan hasil impor
-- 0017 memakai persis huruf/kode di bawah ini pada kolom TEKS customer_code
-- mereka (diperiksa manual terhadap web/scripts/import-customers/
-- customers.json sebelum berkas ini ditulis: kelima SourceCode A–E dan enam
-- dari tujuh SalesCode di bawah muncul di 36 baris itu — "Ken"/KEN yang
-- muncul di satu baris impor SENGAJA TIDAK ikut di-seed di sini: bukan
-- bagian dari roster SEKARANG yang owner berikan, pergantian staf memang
-- diperkirakan terjadi — lihat "要靈活編輯" di kepala berkas). Baris-baris
-- 0017 TIDAK mendapat source_id/sales_staff_id dari seed ini (skrip
-- impornya tidak disentuh — di luar cakupan berkas ini); kolom
-- customer_code TEKS mereka tetap seperti apa adanya, tidak berubah.
insert into public.customer_sources (code, label)
select v.code, v.label
from (values
  ('A', 'dari Tim Komisaris'),
  ('B', 'B2B'),
  ('C', 'Visit Langsung'),
  ('D', 'Tim Marketing'),
  ('E', 'Tim Sosial Media')
) as v(code, label)
where not exists (select 1 from public.customer_sources cs where cs.code = v.code);

insert into public.sanci_sales_staff (code, name)
select v.code, v.name
from (values
  ('M',  'Amenni'),
  ('NS', 'Nini San'),
  ('AL', 'Alina'),
  ('C',  'Cherlie'),
  ('GL', 'Gilang'),
  ('S',  'Serly'),
  ('D',  'Dinna')
) as v(code, name)
where not exists (select 1 from public.sanci_sales_staff ss where ss.code = v.code);

-- ── 10. Verifikasi (hasilnya di-copy balik ke Claude) ────────
-- Angka yang diharapkan — cocokkan SATU PER SATU. "Run tanpa tulisan merah"
-- bukan bukti (LESSONS #7 & #16).
--
-- MASTER KODE SUMBER
--   SOURCE_TABLE                     1
--   SOURCE_CODE_NOT_BLANK            1
--   SOURCE_STATUS_CHECK              1
--   SOURCE_CODE_UNIQUE_ACTIVE        1   ← unique index where status='ACTIVE'
--   SOURCE_RLS                       1
--   SOURCE_NONADMIN_POLICIES         0   ← WAJIB 0: cabang nol akses
--   SOURCE_SEED_COUNT                5   ← WAJIB 5: sesuai daftar owner
-- MASTER KODE SALES
--   SALES_TABLE                      1
--   SALES_CODE_NOT_BLANK             1
--   SALES_STATUS_CHECK               1
--   SALES_CODE_UNIQUE_ACTIVE         1
--   SALES_RLS                        1
--   SALES_NONADMIN_POLICIES          0   ← WAJIB 0
--   SALES_SEED_COUNT                 7   ← WAJIB 7: sesuai daftar owner
-- CUSTOMERS: KOLOM BARU + FK
--   CUSTOMERS_SOURCE_ID_COL          1
--   CUSTOMERS_SOURCE_ID_RESTRICT     1   ← WAJIB 1: ON DELETE RESTRICT, bukan CASCADE
--   CUSTOMERS_SALES_STAFF_ID_COL     1
--   CUSTOMERS_SALES_STAFF_ID_RESTRICT 1
--   CUSTOMER_POLICIES                4   ← WAJIB TETAP 4 — BUKTI RLS customers TIDAK berubah
-- SEQUENCE + TRIGGER
--   CUSTOMER_CODE_SEQ_EXISTS         1
--   CUSTOMER_CODE_SEQ_SANE           1   ← last_value >= 1
--   TRG_SET_CUSTOMER_CODE            1
-- BUKTI LANGSUNG FORMAT (insert pelanggan uji di dalam blok ini sendiri)
--   GEN_CODE_MATCH                   1   ← WAJIB 1: string yang sungguh
--                                          digenerate SAMA PERSIS dengan
--                                          yang diharapkan (lihat §12)
--   GEN_CODE_ONLY_SOURCE_NULL        1   ← WAJIB 1: hanya source_id terisi →
--                                          customer_code TETAP null
--   GEN_CODE_PRESET_UNTOUCHED        1   ← WAJIB 1: customer_code yang sudah
--                                          diisi client TIDAK ditimpa
-- AUDIT
--   AUDIT_CUSTOMER_SOURCE            1   ← fn_audit_row mengenal awalan CUSTOMER_SOURCE
--   AUDIT_SALES_STAFF                1   ← dan SALES_STAFF
--   AUDIT_KEEP_0016_DOC              1   ← awalan ORDER_DOCUMENT milik 0016 masih utuh
--   AUDIT_KEEP_0016_DOC_ITEM         1   ← awalan ORDER_DOCUMENT_ITEM milik 0016 masih utuh
--   AUDIT_KEEP_0014_ITEM             1
--   AUDIT_KEEP_0013_OFFER            1
--   AUDIT_KEEP_0012_PKG_ITEM         1
--   AUDIT_KEEP_0012_PKG_LOOKUP       1
--   AUDIT_KEEP_0010_PRODUCT          1
--   AUDIT_KEEP_0010_CATALOG          1
--   AUDIT_KEEP_0009_ARRIVED          1
--   AUDIT_KEEP_0009_NOTE             1
--   AUDIT_KEEP_0008_PKG              1
--   AUDIT_KEEP_0008_PHONE            1
--   AUDIT_KEEP_0008_ATTR             1
--   AUDIT_KEEP_0005                  1
--   AUDIT_KEEP_0004                  1
--   REFS_CHECK_CUSTOMER              1   ← WAJIB 1: lubang P2 milik 0011 masih tertutup
--
-- Delapan belas angka AUDIT_*/REFS_CHECK_CUSTOMER TIDAK bertambah maupun
-- berkurang dari daftar 0016 (ditambah dua baru CUSTOMER_SOURCE/SALES_STAFF)
-- — bukti langsung fn_audit_row SUNGGUH memuat seluruh riwayat, bukan
-- tertimpa sesuatu yang lain di antara 0016 dan 0018.

-- ── 12. Bukti langsung format kode (insert nyata, bukan asersi kosong) ──
--
-- Pola "insert sungguhan di dalam blok verifikasi migrasi" belum pernah
-- dipakai berkas sebelumnya (semuanya memeriksa STRUKTUR skema) — di sini
-- sengaja dipilih karena satu-satunya cara membuktikan FORMAT STRING benar
-- adalah menjalankan trigger-nya sungguhan dan membaca hasilnya, persis
-- seperti "Run tanpa tulisan merah bukan bukti" (LESSONS #7/#16) menuntut.
--
-- IDEMPOTEN lewat `client_request_id` tetap (bukan phone unik per-run):
-- ketiga baris di sini punya client_request_id TETAP ('migration-0018-verify-
-- *'), jadi jalan kedua/ketiga kali (LESSONS #9 — migrasi harus aman
-- ditempel ulang) jatuh ke cabang ON CONFLICT DO UPDATE (hanya menyentuh
-- full_name, tidak pernah customer_code) alih-alih INSERT baru — trigger
-- BEFORE INSERT tidak terpicu lagi untuk baris yang SUDAH ada, dan
-- customer_code yang dibaca balik tetap nilai yang PERTAMA KALI digenerate/
-- ditinggalkan trigger, bukan nilai baru. Percobaan pertama (draf awal
-- berkas ini memakai phone unik + INSERT polos tanpa ON CONFLICT) TERBUKTI
-- gagal re-run ke-2/ke-3 dengan 23505 pada customers_customer_code_key
-- (baris ketiga memakai customer_code preset TETAP 'PRESET/CODE/999') —
-- diukur langsung di Postgres 16 lokal, bukan diperkirakan.
do $$
declare
  v_customer_code text;
  v_expected_prefix text;
  v_yy text := to_char(now() at time zone 'Asia/Jakarta', 'YY');
  v_source_id uuid;
  v_sales_id uuid;
begin
  select id into v_source_id from public.customer_sources where code = 'A' and status = 'ACTIVE';
  select id into v_sales_id  from public.sanci_sales_staff  where code = 'C' and status = 'ACTIVE';

  insert into public.customers
    (full_name, phone, phone_normalized, source_id, sales_staff_id, client_request_id)
  values ('0018 Verifikasi Format Kode', '0811000018018', '62811000018018', v_source_id, v_sales_id,
          'migration-0018-verify-format')
  on conflict (client_request_id) do update set full_name = excluded.full_name
  returning customer_code into v_customer_code;

  -- Format WAJIB: A/YY-C/NNN (NNN sekurang-kurangnya 3 digit) — SeqNo-nya
  -- sendiri tidak ditebak (global, tergantung state sequence saat ini),
  -- tapi BENTUKNYA harus persis cocok pola ini. Pada re-run, v_yy DIHITUNG
  -- ULANG dari now() tapi customer_code-nya BEKU dari insert pertama — kalau
  -- migrasi ini pernah dijalankan pertama kali di tahun WIB yang berbeda dari
  -- re-run sekarang, pengecekan prefix tahun ini akan gagal MENUNJUKKAN itu
  -- (bukan bug palsu) — dalam praktiknya migrasi selalu dijalankan sekali di
  -- hari yang sama dengan pengembangannya, jadi risiko ini diterima sadar.
  v_expected_prefix := 'A/' || v_yy || '-C/';
  if v_customer_code is null or left(v_customer_code, length(v_expected_prefix)) <> v_expected_prefix
     or right(v_customer_code, length(v_customer_code) - length(v_expected_prefix)) !~ '^[0-9]{3,}$' then
    raise exception 'GEN_CODE_MATCH gagal: dapat %, diharapkan pola %NNN (NNN >= 3 digit)',
      v_customer_code, v_expected_prefix;
  end if;

  -- Hanya source_id terisi (sales_staff_id null) → customer_code TETAP null.
  insert into public.customers
    (full_name, phone, phone_normalized, source_id, client_request_id)
  values ('0018 Verifikasi Hanya Source', '0811000018019', '62811000018019', v_source_id,
          'migration-0018-verify-only-source')
  on conflict (client_request_id) do update set full_name = excluded.full_name
  returning customer_code into v_customer_code;
  if v_customer_code is not null then
    raise exception 'GEN_CODE_ONLY_SOURCE_NULL gagal: customer_code seharusnya tetap null, dapat %', v_customer_code;
  end if;

  -- customer_code yang SUDAH diisi client (mis. jalur skrip impor) TIDAK
  -- ditimpa walau source_id+sales_staff_id keduanya juga terisi.
  insert into public.customers
    (full_name, phone, phone_normalized, customer_code, source_id, sales_staff_id, client_request_id)
  values ('0018 Verifikasi Preset', '0811000018020', '62811000018020', 'PRESET/CODE/999',
          v_source_id, v_sales_id, 'migration-0018-verify-preset')
  on conflict (client_request_id) do update set full_name = excluded.full_name
  returning customer_code into v_customer_code;
  if v_customer_code <> 'PRESET/CODE/999' then
    raise exception 'GEN_CODE_PRESET_UNTOUCHED gagal: customer_code preset seharusnya tidak berubah, dapat %', v_customer_code;
  end if;
end;
$$;

select 'SOURCE_TABLE' as check_type, count(*)::text as result
from information_schema.tables
where table_schema = 'public' and table_name = 'customer_sources'
union all
select 'SOURCE_CODE_NOT_BLANK', count(*)::text
from pg_constraint
where conrelid = 'public.customer_sources'::regclass and contype = 'c'
  and conname = 'customer_sources_code_not_blank'
union all
select 'SOURCE_STATUS_CHECK', count(*)::text
from pg_constraint
where conrelid = 'public.customer_sources'::regclass and contype = 'c'
  and pg_get_constraintdef(oid) like '%ACTIVE%' and pg_get_constraintdef(oid) like '%INACTIVE%'
union all
select 'SOURCE_CODE_UNIQUE_ACTIVE', count(*)::text
from pg_indexes
where schemaname = 'public' and tablename = 'customer_sources'
  and indexname = 'customer_sources_code_active_key'
  and indexdef like '%UNIQUE%' and indexdef like '%status = ''ACTIVE''%'
union all
select 'SOURCE_RLS', count(*)::text
from pg_tables where schemaname = 'public' and tablename = 'customer_sources' and rowsecurity
union all
select 'SOURCE_NONADMIN_POLICIES', count(*)::text
from pg_policies
where schemaname = 'public' and tablename = 'customer_sources'
  and coalesce(qual, '') || ' ' || coalesce(with_check, '') not like '%fn_is_admin%'
union all
select 'SOURCE_SEED_COUNT', count(*)::text from public.customer_sources
union all
select 'SALES_TABLE', count(*)::text
from information_schema.tables
where table_schema = 'public' and table_name = 'sanci_sales_staff'
union all
select 'SALES_CODE_NOT_BLANK', count(*)::text
from pg_constraint
where conrelid = 'public.sanci_sales_staff'::regclass and contype = 'c'
  and conname = 'sanci_sales_staff_code_not_blank'
union all
select 'SALES_STATUS_CHECK', count(*)::text
from pg_constraint
where conrelid = 'public.sanci_sales_staff'::regclass and contype = 'c'
  and pg_get_constraintdef(oid) like '%ACTIVE%' and pg_get_constraintdef(oid) like '%INACTIVE%'
union all
select 'SALES_CODE_UNIQUE_ACTIVE', count(*)::text
from pg_indexes
where schemaname = 'public' and tablename = 'sanci_sales_staff'
  and indexname = 'sanci_sales_staff_code_active_key'
  and indexdef like '%UNIQUE%' and indexdef like '%status = ''ACTIVE''%'
union all
select 'SALES_RLS', count(*)::text
from pg_tables where schemaname = 'public' and tablename = 'sanci_sales_staff' and rowsecurity
union all
select 'SALES_NONADMIN_POLICIES', count(*)::text
from pg_policies
where schemaname = 'public' and tablename = 'sanci_sales_staff'
  and coalesce(qual, '') || ' ' || coalesce(with_check, '') not like '%fn_is_admin%'
union all
select 'SALES_SEED_COUNT', count(*)::text from public.sanci_sales_staff
union all
select 'CUSTOMERS_SOURCE_ID_COL', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'customers' and column_name = 'source_id'
union all
select 'CUSTOMERS_SOURCE_ID_RESTRICT', count(*)::text
from pg_constraint
where conrelid = 'public.customers'::regclass and contype = 'f'
  and conname like '%source_id%' and confdeltype = 'r'
union all
select 'CUSTOMERS_SALES_STAFF_ID_COL', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'customers' and column_name = 'sales_staff_id'
union all
select 'CUSTOMERS_SALES_STAFF_ID_RESTRICT', count(*)::text
from pg_constraint
where conrelid = 'public.customers'::regclass and contype = 'f'
  and conname like '%sales_staff_id%' and confdeltype = 'r'
union all
select 'CUSTOMER_POLICIES', count(*)::text
from pg_policies where schemaname = 'public' and tablename = 'customers'
union all
select 'CUSTOMER_CODE_SEQ_EXISTS', case when to_regclass('public.customer_code_seq') is null then '0' else '1' end
union all
select 'CUSTOMER_CODE_SEQ_SANE',
       case when (select last_value from public.customer_code_seq) >= 1 then '1' else '0' end
union all
select 'TRG_SET_CUSTOMER_CODE', count(*)::text
from pg_trigger tg join pg_class cl on cl.oid = tg.tgrelid
join pg_namespace ns on ns.oid = cl.relnamespace
where not tg.tgisinternal and ns.nspname = 'public' and cl.relname = 'customers'
  and tg.tgname = 'trg_set_customer_code'
union all
select 'GEN_CODE_MATCH', '1'  -- lolos hanya kalau blok do $$ di atas tidak RAISE EXCEPTION
union all
select 'GEN_CODE_ONLY_SOURCE_NULL', '1'
union all
select 'GEN_CODE_PRESET_UNTOUCHED', '1'
union all
select 'AUDIT_CUSTOMER_SOURCE', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%''CUSTOMER_SOURCE''%'
union all
select 'AUDIT_SALES_STAFF', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%''SALES_STAFF''%'
union all
select 'AUDIT_KEEP_0016_DOC', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%''ORDER_DOCUMENT''%'
union all
select 'AUDIT_KEEP_0016_DOC_ITEM', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%ORDER_DOCUMENT_ITEM%'
union all
select 'AUDIT_KEEP_0014_ITEM', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%''ORDER_ITEM''%'
union all
select 'AUDIT_KEEP_0013_OFFER', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%''ORDER_OFFER''%'
union all
select 'AUDIT_KEEP_0012_PKG_ITEM', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%PACKAGE_ITEM%'
union all
select 'AUDIT_KEEP_0012_PKG_LOOKUP', count(*)::text
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
