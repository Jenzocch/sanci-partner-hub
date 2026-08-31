-- ============================================================
-- SANCI Partner Hub — Phase 2 irisan kesembilan belas
-- Migration 0025: Katalog Warna Global (product_colors) + saklar per-produk
--                 "punya pilihan warna" (sanci_products.has_color_options)
--                 (idempotent — aman dijalankan ulang)
-- Jalankan di: Supabase Studio → SQL Editor → paste seluruh file → Run
--
-- PRASYARAT: 0001 → … → 0022 sudah dijalankan, DALAM URUTAN ITU (0023/0024
-- boleh sudah/belum — berkas ini tidak menyentuh maupun bergantung pada objek
-- keduanya, lihat §0). Blok pengaman di bawah berhenti dengan pesan jelas
-- kalau prasyaratnya belum. Setelah file ini, rantai penuhnya menjadi
-- 0001 → … → 0022 → 0023 → 0024 → 0025 (lihat migrations/README.md —
-- ATURAN BESI; baris itu sendiri masih perlu diperbarui manual, lihat catatan
-- di kepala 0026).
--
-- CATATAN VISIBILITAS FOTO: METADATA warna (tabel product_colors) tidak
-- punya jalur baca anon — tapi BERKAS FOTONYA hidup di bucket
-- `product-photos` yang PUBLIC (0010), jadi siapa pun yang memegang URL-nya
-- bisa membukanya tanpa login, persis seperti foto produk/galeri yang sudah
-- ada. Path-nya uuid acak (tidak bisa ditebak/dienumerasi). Kalau suatu
-- saat foto warna dianggap rahasia, itu butuh bucket terpisah — keputusan
-- yang belum diminta siapa pun.
--
-- ============================================================
-- LATAR BELAKANG BISNIS (owner, lewat rencana kerja)
-- ============================================================
--
-- Bisnis furnitur Jenzo (sofa & headboard) menjual dalam pilihan warna kain
-- yang diidentifikasi dengan KODE GLOBAL (C01, C02, …) — satu kode yang SAMA
-- berlaku lintas SEMUA produk, bukan per-produk. Lembar kerja manual kantor
-- mencatat satu kode warna per barang yang terjual;
-- `order_items.color_code` (teks bebas, lahir di 0014) SUDAH menyimpannya,
-- tapi sampai sekarang tidak ada apa pun yang membantu staf memilih kode yang
-- VALID, dan tidak ada satu pun foto warna di sistem.
--
-- Irisan ini membuka DUA hal:
--   1. Katalog warna GLOBAL dengan foto, dikelola admin — sumber kebenaran
--      untuk kode warna mana yang sedang berlaku (`product_colors`).
--   2. Saklar PER PRODUK yang menentukan apakah produk itu menawarkan
--      pilihan warna sama sekali (`sanci_products.has_color_options`).
--
-- ============================================================
-- YANG SENGAJA TIDAK DIBUKA
-- ============================================================
--   * TIDAK ADA foreign key dari `order_items.color_code` ke
--     `product_colors.code`. `color_code` (0014) tetap teks bebas apa
--     adanya — mengunci FK di sini akan memaksa migrasi DATA lama (kode yang
--     pernah dipakai tapi warnanya sekarang INACTIVE/diganti nama) untuk
--     lulus validasi yang tidak pernah ada saat baris itu ditulis. Katalog
--     warna ini adalah BANTUAN PILIH untuk UI (dropdown/picker), bukan
--     batasan integritas referensial atas riwayat pesanan.
--   * TIDAK ADA jalur baca anon (`auth.uid() is null`) ke `product_colors`,
--     berbeda SENGAJA dari `product_photos`/`sanci_products` (0022) yang
--     memang punya halaman publik `/p/[productId]`. Halaman publik produk
--     BELUM menampilkan pilihan warna sama sekali hari ini — membuka jalur
--     anon sekarang berarti membuka permukaan yang tidak dipakai siapa pun,
--     dan kalau kelak dibutuhkan, itu keputusan produk tersendiri (menambah
--     policy anon SEMPIT baru, pola persis §5 0022), bukan sesuatu yang
--     dianggap "sudah pasti begitu" di sini. Batas ini SADAR, bukan lalai.
--   * TIDAK ADA policy TULIS untuk cabang/partner di `product_colors` sama
--     sekali — SELECT saja. Katalog warna dikelola admin murni, sama seperti
--     `sanci_products` (0010) dan `product_photos` (0022).
--   * TIDAK ADA reorder/drag-drop — `sort_order` ada untuk ruang gerak nanti
--     (pola identik `product_photos.sort_order`, 0022 §1), UI hari ini boleh
--     menulis nilai statis (mis. 0) untuk semua baris.
-- ============================================================

-- ── 0. Pengaman prasyarat (LESSONS #41: periksa OBJEK, bukan versi aktif) ──
-- Guard di sini memeriksa KEBERADAAN objek 0001/0004/0010/0022 — BUKAN
-- "apakah fn_audit_row yang aktif sekarang masih memuat PRODUCT_PHOTO".
-- Alasannya identik dengan 0021 §0/0022 §0 (LESSONS #41 ditulis panjang di
-- sana): guard versi-aktif akan mengunci jalur pemulihannya sendiri kalau
-- berkas lama sempat dijalankan ulang sebelum 0025 ini dijalankan.
do $$
begin
  if to_regprocedure('public.fn_is_admin()') is null
     or to_regprocedure('public.fn_pu_partner()') is null
     or to_regprocedure('public.fn_catalog_enabled()') is null
     or to_regprocedure('public.fn_audit_row()') is null
     or to_regprocedure('public.fn_set_created_by()') is null
     or to_regclass('public.partners') is null
     or to_regclass('public.sanci_products') is null then
    raise exception
      'Fungsi/tabel dasar (fn_is_admin / fn_pu_partner / fn_catalog_enabled / fn_audit_row / fn_set_created_by / partners / sanci_products) belum lengkap. Jalankan 0001 → … → 0022 dulu, baru 0025.';
  end if;

  -- Penanda 0022: OBJEK berkas itu harus sudah ada — fn_audit_row yang
  -- DISALIN UTUH di §6 di bawah adalah versi 0022, jadi tabelnya harus
  -- sungguh sudah ada di database ini (bukan cuma diasumsikan dari nomor
  -- berkas). Pola sama dengan 0022 §0 memeriksa objek 0021.
  if to_regclass('public.product_photos') is null then
    raise exception
      'Migration 0022_product_photos.sql belum dijalankan di database ini. Jalankan 0001 → … → 0022 dulu, baru 0025.';
  end if;

  if to_regclass('storage.buckets') is null then
    raise exception
      'Schema storage tidak ditemukan. File ini khusus untuk database Supabase (bucket publik product-photos milik 0010, dipakai apa adanya).';
  end if;
end;
$$;

-- ── 1. product_colors: katalog warna GLOBAL ──────────────────

-- code: kode warna GLOBAL yang dicetak di lembar manual kantor (C01, C02,
-- …) — SATU kode berlaku lintas SEMUA produk, karena itu tabel ini BUKAN
-- turunan sanci_products (tidak ada product_id di sini sama sekali).
-- UNIQUE TOTAL (bukan partial-unique "hanya di antara baris ACTIVE" —
-- LESSONS #36 sengaja DIHINDARI di sini): kode warna yang pernah dipakai
-- lalu di-INACTIVE-kan TETAP memegang kodenya selamanya, supaya kode yang
-- sama tidak pernah bisa dipakai ulang untuk warna yang BERBEDA sementara
-- order_items.color_code lama masih menunjuknya sebagai teks bebas —
-- pemakaian ulang kode akan membuat riwayat pesanan lama tampak memakai
-- warna yang salah.
--
-- status ACTIVE/INACTIVE, DEFAULT ACTIVE — deactivate-don't-delete
-- (LESSONS #4): pesanan lama menunjuk kode warna ini sebagai TEKS SELAMANYA
-- (order_items.color_code, 0014), jadi baris warna tidak pernah boleh hard
-- delete — hilangnya baris akan membuat foto/nama warna yang tercetak di
-- SO/DO/Invoice lama tidak bisa ditelusuri lagi.
--
-- photo_url text NOT NULL: alamat PUBLIK di bucket 'product-photos' YANG
-- SUDAH ADA sejak 0010 (public=true) — TIDAK ADA bucket baru dibuat atau
-- diubah di berkas ini, PERSIS pola 0022 §-bucket (path baru DI DALAM bucket
-- lama, storage RLS tidak peduli path selama bucket_id='product-photos').
-- Path yang disepakati untuk warna: `colors/<uuid acak>.webp` — SEJAJAR
-- dengan `<product_id>/gallery/<uuid>.webp` milik galeri foto produk (0022),
-- bukan di bawah folder produk mana pun karena warna memang bukan milik satu
-- produk. `?v=<waktu unggah>` (LESSONS #22) didokumentasikan sebagai
-- konvensi APLIKASI saat mengunggah, sama seperti 0022 §1 — path storage-nya
-- sendiri sudah unik per unggahan sehingga cache-busting bukan kebutuhan
-- teknis mendesak di tingkat DDL.
--
-- sort_order int NOT NULL DEFAULT 0 — lihat "YANG SENGAJA TIDAK DIBUKA" di
-- atas.
--
-- created_at/created_by, TANPA updated_at — baris warna diedit lewat
-- hapus+unggah ulang seperti product_photos (0022 §1), bukan UPDATE
-- in-place; menambah kolom yang tidak pernah terisi hanya menambah
-- permukaan tanpa menambah makna.
create table if not exists public.product_colors (
  id         uuid primary key default gen_random_uuid(),
  code       text not null,
  name       text,
  photo_url  text not null,
  status     text not null default 'ACTIVE',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid,
  constraint product_colors_code_key unique (code),
  constraint product_colors_code_length_check
    check (char_length(btrim(code)) between 1 and 40),
  constraint product_colors_status_check
    check (status in ('ACTIVE', 'INACTIVE'))
);

-- Bentuk index mengikuti PERSIS query pemilih warna (picker): tampilkan
-- warna ACTIVE saja, urut sort_order lalu code. `status` di posisi pertama
-- supaya index bisa dipakai langsung oleh `WHERE status = 'ACTIVE' ORDER BY
-- sort_order, code` (baik dari RLS pc_partner_read §3 maupun query admin
-- kelola-semua yang menyaring status secara eksplisit) — pola yang sama
-- dengan idx_product_photos_order (0022 §1), field pertama = field yang
-- paling sering jadi predikat WHERE.
create index if not exists idx_product_colors_picker
  on public.product_colors (status, sort_order, code);

-- ── 2. Trigger ──────────────────────────────────────────────

-- created_by dipaksa server (LESSONS #6) lewat fungsi yang sudah ada sejak
-- 0004 — tidak perlu fungsi baru (pola identik 0022 §2).
drop trigger if exists trg_set_created_by on public.product_colors;
create trigger trg_set_created_by before insert on public.product_colors
  for each row execute function public.fn_set_created_by();

-- Audit dipasang untuk ketiga operasi walau policy tulisnya sempit — jalur
-- service_role/pemilik tabel melewati RLS, dan satu-satunya yang akan tahu
-- adalah baris audit ini (alasan yang sama persis dengan 0009 §4/0010 §4/
-- 0021 §4/0022 §2).
drop trigger if exists trg_audit on public.product_colors;
create trigger trg_audit after insert or update or delete on public.product_colors
  for each row execute function public.fn_audit_row();

-- SENGAJA TANPA trg_touch: tabel ini tidak punya kolom updated_at (§1).

-- NORMALISASI KODE DI DATABASE, bukan hanya di app (LESSONS #5 — app layer
-- checks are not checks). Tanpa ini, UNIQUE(code) lebih lemah dari yang
-- dijanjikan §1: 'C01', 'c01', 'C01 ', ' C01' adalah EMPAT baris sah yang
-- hidup berdampingan — pemilih warna menampilkan dua C01, order_items.
-- color_code (teks bebas) menyimpan keduanya, dan rekap "C01 terjual
-- berapa" kehilangan separuhnya. Pola preseden: fn_set_customer_code 0018
-- (normalisasi di BEFORE trigger, bukan berharap semua penulis ingat).
create or replace function public.fn_normalize_color_code() returns trigger
language plpgsql set search_path = public as $$
begin
  new.code := upper(btrim(new.code));
  return new;
end;
$$;
revoke execute on function public.fn_normalize_color_code() from public, anon, authenticated;

drop trigger if exists trg_normalize_color_code on public.product_colors;
create trigger trg_normalize_color_code before insert or update on public.product_colors
  for each row execute function public.fn_normalize_color_code();

-- ── 3. sanci_products.has_color_options ──────────────────────

-- DEFAULT false — LESSONS #8 (default yang secara bisnis paling AMAN, bukan
-- paling nyaman): produk yang SEHARUSNYA punya pilihan warna tapi lupa
-- di-toggle cuma gangguan kecil (staf tidak lihat picker, tanya admin);
-- produk yang SEHARUSNYA TIDAK punya pilihan warna tapi salah ke-toggle
-- true mengundang data warna ngawur masuk order_items.color_code untuk
-- produk yang tidak relevan (mis. rak buku diberi kode kain sofa) — kelas
-- kerusakan yang lebih mahal untuk dibersihkan belakangan. `false` menang.
alter table public.sanci_products
  add column if not exists has_color_options boolean not null default false;

-- TIDAK menyentuh RLS sanci_products SATU POLICY PUN — kolom baru otomatis
-- ikut ketiga policy yang sudah ada (sp_admin_all/sp_partner_read/
-- sp_anon_read, 0010+0022), sama seperti `size` (0024). Konsekuensi yang
-- DISADARI: has_color_options ikut terbaca ANON di halaman publik — itu
-- aman, ia cuma boolean penanda UI ("produk ini punya pilihan warna"),
-- bukan data warna itu sendiri (yang TETAP tertutup dari anon, §4 di bawah).

-- ── 4. RLS product_colors ───────────────────────────────────

alter table public.product_colors enable row level security;

-- Admin: kelola penuh (tambah/ubah status/hapus katalog warna).
-- LESSONS #25 dipatuhi: fn_is_admin() tidak membaca product_colors sama
-- sekali (membaca platform_admins) — INSERT…RETURNING aman.
drop policy if exists pc_admin_all on public.product_colors;
create policy pc_admin_all on public.product_colors
  for all using (public.fn_is_admin()) with check (public.fn_is_admin());

-- Cabang (login, partner): GERBANG SAMA dengan ph_partner_read (0022 §3) —
-- katalog terbuka untuk partner ini (fn_catalog_enabled()) DAN baris
-- berstatus ACTIVE. Bedanya HANYA di sisi kanan "DAN": ph_partner_read
-- menjawab keaktifan lewat `exists(... sanci_products p ... p.status =
-- 'ACTIVE')` karena foto MENUNJUK ke produk lain; product_colors tidak
-- menunjuk produk mana pun (warna itu sendiri GLOBAL, §1), jadi keaktifan
-- yang relevan adalah STATUS BARIS INI SENDIRI — bukan exists ke tabel
-- lain, dan karena itu BUKAN pola "self join" yang diperingatkan LESSONS
-- #15 (kolom `status` dibaca langsung dari baris yang sedang dievaluasi
-- policy-nya sendiri, tidak ada subquery balik ke product_colors).
--
-- KEPUTUSAN: warna boleh dibaca kapan pun katalog partner itu terbuka —
-- TIDAK digerbangi per-produk (tidak ada "warna ini hanya boleh dibaca
-- kalau partner boleh lihat produk X tertentu"), karena warna memang bukan
-- milik satu produk (§1). Picker order-item cabang butuh SELURUH daftar
-- warna ACTIVE begitu katalognya terbuka, bukan subset per produk.
drop policy if exists pc_partner_read on public.product_colors;
create policy pc_partner_read on public.product_colors
  for select using (public.fn_catalog_enabled() and status = 'ACTIVE');

-- TIDAK ADA policy anon — lihat "YANG SENGAJA TIDAK DIBUKA" di kepala
-- berkas. Dibuktikan Bagian B: SET ROLE anon → 0 baris, apa pun isi tabel.
--
-- TIDAK ADA policy INSERT/UPDATE/DELETE untuk cabang — SELECT saja
-- (pc_partner_read for select). Diverifikasi negatif di §7
-- (PC_NONADMIN_WRITE wajib 0).

-- ── 5. Permukaan EXECUTE (LESSONS #26) — tidak ada yang baru ──

-- Kedua policy baru memanggil fn_is_admin() dan fn_catalog_enabled() —
-- KEDUANYA SUDAH ter-grant sejak 0001 (fn_is_admin, dipakai SETIAP policy
-- admin di seluruh skema) dan 0010 (fn_catalog_enabled, CATALOG_FN_EXEC_* =
-- 1 sejak 0010, tidak pernah dicabut CREATE OR REPLACE mana pun). Tidak ada
-- fungsi BARU di berkas ini selain fn_audit_row (§6, permukaan EXECUTE-nya
-- sudah dikelola sejak 0001 dan tidak berubah CREATE OR REPLACE ke
-- CREATE OR REPLACE). Tidak ada RPC baru.

-- ── 6. fn_audit_row: didefinisikan ULANG untuk PRODUCT_COLOR ──

-- Definisi ulang UTUH (bukan tambalan) — ATURAN BESI migrations/README.md.
-- Versi yang disalin BYTE-DEMI-BYTE adalah versi 0022_product_photos.sql §6
-- (berkas TERAKHIR yang mendefinisikan ulang fungsi ini — 0023/0024 TIDAK
-- menyentuhnya). SELURUH perilaku 0004+0005+0008+0009+0010+0012+0013+0014+
-- 0016+0018+0021+0022 dipertahankan kata demi kata.
--
-- Yang bertambah HANYA SATU baris pemetaan nama entitas, ditambahkan tepat
-- setelah baris 'product_photos':
--   'product_colors' → 'PRODUCT_COLOR'
--
-- product_colors adalah entitas top-level SEDERHANA seperti product_photos/
-- product_prices — TIDAK butuh blok pencarian partner lewat tabel lain:
-- tabel ini tidak punya partner_id/branch_id/order_id/package_id sama
-- sekali (warna adalah katalog GLOBAL, bukan milik partner atau pesanan
-- mana pun). Konsekuensinya, PERSIS seperti PRODUCT_PHOTO/PRODUCT_PRICE:
-- setiap baris audit PRODUCT_COLOR_* punya partner_id DAN branch_id NULL.
-- Siapa PELAKUNYA tetap terbaca lewat actor_user_id/actor_role — hanya
-- SANCI Admin yang bisa menulis (§4 pc_admin_all), jadi actor_role akan
-- selalu SANCI_ADMIN untuk aksi ini.
--
-- APA YANG SUNGGUH AKAN MUNCUL DI LAYAR AKTIVITAS (diperiksa terhadap kode
-- generik di bawah, bukan diasumsikan): product_colors PUNYA kolom
-- `status`, dan cabang UPDATE generik di fungsi ini SUDAH memeriksa
-- perubahan kolom status untuk SEMUA tabel (blok
-- `if (old_rec ? 'status') and (old_rec->>'status') is distinct from
-- (rec->>'status')` di bawah) — kode ini TIDAK mengenal pola
-- "_ACTIVATED"/"_SUSPENDED" untuk tabel mana pun (satu-satunya
-- pengecualian khusus per-tabel adalah 'ORDER_CANCELLED' untuk
-- partner_orders); untuk semua tabel lain, termasuk product_colors, hasil
-- perubahan status jatuh ke cabang generik `v_prefix || '_STATUS_CHANGED'`
-- — PERSIS pola PRODUCT_STATUS_CHANGED (0010) yang sudah ada. Jadi aksi
-- yang akan tercatat untuk tabel ini:
--   PRODUCT_COLOR_CREATED          (INSERT)
--   PRODUCT_COLOR_STATUS_CHANGED   (UPDATE yang mengubah kolom status)
--   PRODUCT_COLOR_UPDATED          (UPDATE lain — ganti nama/foto/urutan)
--   PRODUCT_COLOR_DELETED          (DELETE — jarang dipakai UI, LESSONS #4
--                                   menganjurkan INACTIVE bukan hapus, tapi
--                                   admin tetap BISA hard-delete lewat
--                                   pc_admin_all kalau perlu)
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
    when 'product_prices' then 'PRODUCT_PRICE'
    when 'product_photos' then 'PRODUCT_PHOTO'
    when 'product_colors' then 'PRODUCT_COLOR'
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
-- 0013/0014/0016/0018/0021/0022 SETELAH file ini: definisi ini akan tertimpa
-- dan pemetaan PRODUCT_COLOR hilang diam-diam (layar Aktivitas menampilkan
-- kode mentah 'PRODUCT_COLORS_CREATED'). Jalankan ulang 0025 untuk
-- memulihkannya. Sebaliknya, karena versi ini memuat SELURUH perilaku
-- pendahulunya, menjalankan 0025 paling akhir juga MEMULIHKAN pemetaan yang
-- sempat tertimpa berkas lama — termasuk PRODUCT_PHOTO (0022) yang
-- sebelumnya cuma dipulihkan oleh 0022.

-- ── 7. Verifikasi bagian A — STRUKTUR (hasilnya di-copy balik) ──
-- Angka yang diharapkan — cocokkan SATU PER SATU. "Run tanpa tulisan merah"
-- bukan bukti (LESSONS #7 & #16). Blok ini berjalan sebagai role `postgres`
-- (SQL Editor, melewati RLS) — cocok untuk memeriksa BENTUK skema/policy,
-- TIDAK cocok untuk membuktikan "anon benar-benar 0 baris" (Bagian B).
--
-- TABEL WARNA
--   COLOR_TABLE                    1
--   COLOR_CODE_UNIQUE              1   ← constraint product_colors_code_key
--   COLOR_CODE_CHECK               1   ← char_length(btrim(code)) between 1 and 40
--   COLOR_STATUS_CHECK             1   ← status in ('ACTIVE','INACTIVE')
--   COLOR_STATUS_DEFAULT_ACTIVE    1   ← DEFAULT 'ACTIVE'
--   COLOR_PHOTO_URL_NOT_NULL       1
--   COLOR_NO_UPDATED_AT            0   ← WAJIB 0: sengaja tanpa updated_at (§1)
--   COLOR_INDEX                    1   ← idx_product_colors_picker
-- RLS WARNA
--   COLOR_RLS                      1
--   COLOR_POLICIES                 2   ← pc_admin_all + pc_partner_read
--   COLOR_NONADMIN_WRITE           0   ← WAJIB 0 (asersi negatif inti):
--                                        tidak ada policy INSERT/UPDATE/
--                                        DELETE yang lolos tanpa fn_is_admin()
--   COLOR_PARTNER_READ_GATED       1   ← pc_partner_read menyebut
--                                        fn_catalog_enabled DAN ACTIVE
--   COLOR_ANON_POLICY_COUNT        0   ← WAJIB 0 (asersi negatif inti):
--                                        TIDAK ADA policy anon di tabel ini
-- TRIGGER WARNA
--   COLOR_TRIGGERS                 3   ← trg_set_created_by + trg_audit
--                                        + trg_normalize_color_code
-- SANCI_PRODUCTS
--   HAS_COLOR_OPTIONS_COLUMN       1
--   HAS_COLOR_OPTIONS_DEFAULT_FALSE 1  ← DEFAULT false (LESSONS #8)
--   HAS_COLOR_OPTIONS_NOT_NULL     1
--   PRODUCT_POLICIES_AFTER_0025    3   ← WAJIB TETAP 3 (sp_admin_all +
--                                        sp_partner_read + sp_anon_read,
--                                        0010+0022) — berkas ini TIDAK
--                                        menyentuh RLS sanci_products
--   PRODUCT_NO_PRICE_COLUMN        0   ← WAJIB 0: aturan 0010 diulang lagi
-- AUDIT — pemetaan BARU + SEMUA pemetaan lama yang wajib TETAP ada
--   AUDIT_PRODUCT_COLOR            1   ← fn_audit_row mengenal PRODUCT_COLOR
--   AUDIT_KEEP_0022_PHOTO          1   ← PRODUCT_PHOTO (0022) utuh
--   AUDIT_KEEP_0021_PRICE          1   ← PRODUCT_PRICE (0021) utuh
--   AUDIT_KEEP_0018_SOURCE         1   ← CUSTOMER_SOURCE (0018) utuh
--   AUDIT_KEEP_0018_SALES          1   ← SALES_STAFF (0018) utuh
--   AUDIT_KEEP_0016_DOC            1   ← ORDER_DOCUMENT (0016) utuh
--   AUDIT_KEEP_0016_DOC_ITEM       1   ← ORDER_DOCUMENT_ITEM (0016) utuh
--   AUDIT_KEEP_0014_ITEM           1   ← ORDER_ITEM (0014) utuh
--   AUDIT_KEEP_0013_OFFER          1   ← ORDER_OFFER (0013) utuh
--   AUDIT_KEEP_0012_PKG_ITEM       1   ← PACKAGE_ITEM (0012) utuh
--   AUDIT_KEEP_0010_CATALOG        1   ← CATALOG_ACCESS (0010) utuh
--   AUDIT_KEEP_0009_NOTE           1   ← ORDER_INTERNAL_NOTE (0009) utuh
--   REFS_CHECK_CUSTOMER            1   ← lubang P2 milik 0011 masih tertutup
--
-- Sebelas angka AUDIT_KEEP_*/REFS_CHECK_CUSTOMER di atas adalah PERSIS
-- sepuluh awalan yang diminta penugasan ('PRODUCT_PHOTO','PRODUCT_PRICE',
-- 'ORDER_DOCUMENT','CUSTOMER_SOURCE','SALES_STAFF','ORDER_ITEM',
-- 'ORDER_OFFER','PACKAGE_ITEM','CATALOG_ACCESS','ORDER_INTERNAL_NOTE') +
-- REFS_CHECK_CUSTOMER, ditambah AUDIT_PRODUCT_COLOR sebagai bukti fungsi ini
-- sungguh salinan UTUH 0022 plus satu pemetaan, bukan sesuatu yang lain.

select 'COLOR_TABLE' as check_type, count(*)::text as result
from information_schema.tables
where table_schema = 'public' and table_name = 'product_colors'
union all
select 'COLOR_CODE_UNIQUE', count(*)::text
from pg_constraint
where conrelid = 'public.product_colors'::regclass and contype = 'u'
  and conname = 'product_colors_code_key'
union all
select 'COLOR_CODE_CHECK', count(*)::text
from pg_constraint
where conrelid = 'public.product_colors'::regclass and contype = 'c'
  and conname = 'product_colors_code_length_check'
union all
select 'COLOR_STATUS_CHECK', count(*)::text
from pg_constraint
where conrelid = 'public.product_colors'::regclass and contype = 'c'
  and conname = 'product_colors_status_check'
union all
select 'COLOR_STATUS_DEFAULT_ACTIVE', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'product_colors'
  and column_name = 'status' and column_default like '%ACTIVE%'
union all
select 'COLOR_PHOTO_URL_NOT_NULL', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'product_colors'
  and column_name = 'photo_url' and is_nullable = 'NO'
union all
select 'COLOR_NO_UPDATED_AT', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'product_colors'
  and column_name = 'updated_at'
union all
select 'COLOR_INDEX', count(*)::text
from pg_indexes
where schemaname = 'public' and tablename = 'product_colors'
  and indexname = 'idx_product_colors_picker'
union all
select 'COLOR_RLS', count(*)::text
from pg_tables
where schemaname = 'public' and tablename = 'product_colors' and rowsecurity
union all
select 'COLOR_POLICIES', count(*)::text
from pg_policies where schemaname = 'public' and tablename = 'product_colors'
union all
select 'COLOR_NONADMIN_WRITE', count(*)::text
from pg_policies
where schemaname = 'public' and tablename = 'product_colors'
  and cmd in ('INSERT','UPDATE','DELETE','ALL')
  and coalesce(qual, '') || ' ' || coalesce(with_check, '') not like '%fn_is_admin%'
union all
select 'COLOR_PARTNER_READ_GATED', count(*)::text
from pg_policies
where schemaname = 'public' and tablename = 'product_colors'
  and policyname = 'pc_partner_read'
  and qual like '%fn_catalog_enabled%' and qual like '%ACTIVE%'
union all
select 'COLOR_ANON_POLICY_COUNT', count(*)::text
from pg_policies
where schemaname = 'public' and tablename = 'product_colors'
  and (qual like '%auth.uid() IS NULL%' or with_check like '%auth.uid() IS NULL%')
union all
select 'COLOR_TRIGGERS', count(*)::text
from pg_trigger tg join pg_class cl on cl.oid = tg.tgrelid
join pg_namespace ns on ns.oid = cl.relnamespace
where not tg.tgisinternal and ns.nspname = 'public' and cl.relname = 'product_colors'
union all
select 'HAS_COLOR_OPTIONS_COLUMN', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'sanci_products'
  and column_name = 'has_color_options'
union all
select 'HAS_COLOR_OPTIONS_DEFAULT_FALSE', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'sanci_products'
  and column_name = 'has_color_options' and column_default like '%false%'
union all
select 'HAS_COLOR_OPTIONS_NOT_NULL', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'sanci_products'
  and column_name = 'has_color_options' and is_nullable = 'NO'
union all
select 'PRODUCT_POLICIES_AFTER_0025', count(*)::text
from pg_policies where schemaname = 'public' and tablename = 'sanci_products'
union all
select 'PRODUCT_NO_PRICE_COLUMN', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'sanci_products'
  and (column_name like '%price%' or column_name like '%harga%'
       or column_name like '%discount%' or column_name like '%diskon%')
union all
select 'AUDIT_PRODUCT_COLOR', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%''PRODUCT_COLOR''%'
union all
select 'AUDIT_KEEP_0022_PHOTO', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%''PRODUCT_PHOTO''%'
union all
select 'AUDIT_KEEP_0021_PRICE', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%''PRODUCT_PRICE''%'
union all
select 'AUDIT_KEEP_0018_SOURCE', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%''CUSTOMER_SOURCE''%'
union all
select 'AUDIT_KEEP_0018_SALES', count(*)::text
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
select 'AUDIT_KEEP_0010_CATALOG', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%''CATALOG_ACCESS''%'
union all
select 'AUDIT_KEEP_0009_NOTE', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%ORDER_INTERNAL_NOTE%'
union all
select 'REFS_CHECK_CUSTOMER', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_check_order_refs' and p.prosrc like '%customers%';

-- ── 8. Verifikasi bagian B — PERILAKU SUNGGUHAN ─────────────
-- INI BAGIAN PALING PENTING. Blok Bagian A di atas berjalan sebagai role
-- `postgres` di SQL Editor, yang di Supabase MELEWATI RLS — angkanya BUKAN
-- bukti "anon benar-benar 0 baris" (LESSONS #16 sekeluarga). Blok ini
-- SUNGGUHAN berpindah ke role `anon`/menguji CHECK dengan INSERT
-- sungguhan, lalu membersihkan jejaknya sendiri.
drop table if exists v0025_behavior;
create temporary table v0025_behavior (check_type text primary key, result text);

-- (1) anon SELECT product_colors → WAJIB 0 baris, apa pun isi tabel.
do $$
declare v_cnt bigint;
begin
  begin
    set local role anon;
    select count(*) into v_cnt from public.product_colors;
    reset role;
    insert into v0025_behavior values ('ANON_COLORS_ZERO', v_cnt::text);
  exception when others then
    reset role;
    insert into v0025_behavior values ('ANON_COLORS_ZERO', 'TIDAK DIUJI: ' || sqlerrm);
  end;
end;
$$;

-- (2) status CHECK menolak nilai bukan ACTIVE/INACTIVE. INSERT yang gagal
-- TIDAK PERNAH commit apa pun (constraint dicek sebelum baris ditulis) —
-- blok EXCEPTION di plpgsql membuat savepoint implisit di awal blok BEGIN
-- dan mengembalikannya kalau exception tertangkap, jadi tabel produksi
-- TIDAK tersentuh sama sekali oleh percobaan yang GAGAL.
do $$
begin
  begin
    insert into public.product_colors (code, photo_url, status)
    values ('ZZTEST-0025-STATUS', 'https://example.invalid/colors/test-status.webp', 'BOGUS');
    insert into v0025_behavior values ('STATUS_CHECK_REJECTED', '0 (GAGAL: nilai tidak valid diterima)');
  exception when check_violation then
    insert into v0025_behavior values ('STATUS_CHECK_REJECTED', '1');
  end;
  -- Jaring pengaman: hapus kalau (seharusnya tidak mungkin) baris uji sempat
  -- ter-commit lewat jalur lain.
  delete from public.product_colors where code = 'ZZTEST-0025-STATUS';
end;
$$;

-- (3) kode duplikat ditolak 23505 (unique_violation). Insert pertama SENGAJA
-- di dalam blok EXCEPTION yang SAMA dengan insert kedua — begitu insert
-- kedua melempar unique_violation, savepoint implisit blok ini mengembalikan
-- KEDUANYA (yang pertama maupun kedua) ke keadaan sebelum blok dimulai,
-- jadi tabel produksi kembali nol baris uji tanpa perlu ROLLBACK manual.
do $$
begin
  begin
    insert into public.product_colors (code, photo_url)
    values ('ZZTEST-0025-DUP', 'https://example.invalid/colors/test-dup-1.webp');
    insert into public.product_colors (code, photo_url)
    values ('ZZTEST-0025-DUP', 'https://example.invalid/colors/test-dup-2.webp');
    insert into v0025_behavior values ('DUP_CODE_REJECTED', '0 (GAGAL: duplikat diterima)');
  exception when unique_violation then
    insert into v0025_behavior values ('DUP_CODE_REJECTED', '1');
  end;
  delete from public.product_colors where code = 'ZZTEST-0025-DUP';
end;
$$;

-- Angka yang diharapkan:
--   ANON_COLORS_ZERO         0   ← WAJIB 0: sesi tanpa login TIDAK PERNAH
--                                   melihat satu baris pun product_colors
--   STATUS_CHECK_REJECTED    1   ← status di luar ACTIVE/INACTIVE ditolak
--   DUP_CODE_REJECTED        1   ← kode warna yang sama dua kali ditolak
select check_type, result from v0025_behavior;
