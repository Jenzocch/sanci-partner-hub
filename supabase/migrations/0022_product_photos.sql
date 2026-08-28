-- ============================================================
-- SANCI Partner Hub — Phase 2 irisan ketujuh belas
-- Migration 0022: Galeri Foto Produk (multi-foto) + halaman publik produk
--                 (tabel BARU `product_photos`, TANPA login, TANPA harga)
--                 (idempotent — aman dijalankan ulang)
-- Jalankan di: Supabase Studio → SQL Editor → paste seluruh file → Run
--
-- PRASYARAT: 0001 → … → 0021 sudah dijalankan, DALAM URUTAN ITU. Blok
-- pengaman di bawah berhenti dengan pesan jelas kalau belum. Setelah file
-- ini, rantai penuhnya menjadi 0001 → … → 0021 → 0022
-- (lihat migrations/README.md — ATURAN BESI).
--
-- ============================================================
-- LATAR BELAKANG BISNIS (owner, ditugaskan lewat rencana kerja)
-- ============================================================
--
-- Tiga permukaan baru sekaligus, satu tabel yang menopang semuanya:
--   1. Admin bisa menambahkan BANYAK foto per produk (di luar satu "foto
--      sampul" yang sudah ada sejak 0010) — galeri "Foto tambahan".
--   2. Cabang punya halaman DETAIL produk sendiri (bukan cuma modal ringkas)
--      yang menampilkan galeri itu + harga efektif tokonya (0021).
--   3. Ada halaman PUBLIK (tanpa login) per produk supaya staf toko bisa
--      membagikan link ke pelanggan lewat WhatsApp — SANCI ingin pelanggan
--      lihat foto & deskripsi, BUKAN internal apa pun.
--
-- Poin 3 adalah satu-satunya alasan migrasi ini menyentuh RLS `sanci_products`
-- sama sekali: sebelum ini TIDAK ADA jalur baca tanpa login ke tabel itu
-- (sp_partner_read mensyaratkan fn_catalog_enabled(), yang SELALU false untuk
-- sesi tanpa auth.uid() — lihat 0010 §3). Halaman publik butuh jalur baca
-- baru yang genuinely terbuka, jadi ditambahkan EKSPLISIT dan SEMPIT
-- (§5 di bawah), bukan melonggarkan gerbang katalog yang sudah ada.
--
-- ============================================================
-- HUBUNGAN DENGAN ATURAN "KATALOG TANPA HARGA" (0010) DAN "0021 TIDAK
-- MENYENTUH sanci_products" — PENTING
-- ============================================================
--
-- 0010 menetapkan `sanci_products` TANPA kolom harga (asersi negatif
-- PRODUCT_NO_PRICE_COLUMN = 0). Irisan ini TIDAK mengubah itu SATU KOLOM PUN
-- — blok verifikasi di bawah MENGULANG asersi itu dengan query PERSIS sama
-- (pola yang sama seperti 0021 mengulang asersi 0010). Halaman publik (§D
-- rencana) TIDAK PERNAH mengirim `product_prices` ke browser — lihat §5 di
-- bawah: TIDAK ADA policy anon apa pun ditambahkan ke `product_prices`, dan
-- blok verifikasi membuktikannya lewat SET ROLE anon (ANON_PRICES_ZERO,
-- asersi paling penting di berkas ini).
--
-- ============================================================
-- APA YANG DIBUKA IRISAN INI (dan hanya ini)
-- ============================================================
--   product_photos    → tabel BARU. Satu baris = satu foto tambahan milik
--     satu produk (galeri, DI LUAR `sanci_products.photo_url` yang tetap
--     jadi foto sampul — kolom itu TIDAK disentuh satu bit pun, lihat §1).
--   sanci_products     → SATU policy SELECT baru untuk sesi TANPA LOGIN
--     (`sp_anon_read`, §5) — dibatasi ketat ke `auth.uid() is null` supaya
--     TIDAK melonggarkan gerbang katalog yang sudah ada untuk partner/admin
--     yang sedang login (lihat penjelasan mekanisme di §5).
--   product_photos     → JUGA dapat policy baca serupa untuk sesi tanpa
--     login, gated ke foto milik produk berstatus ACTIVE.
--   fn_audit_row       → didefinisikan ULANG (ATURAN BESI): salinan UTUH
--     versi 0021 + SATU baris pemetaan 'product_photos' → 'PRODUCT_PHOTO'.
--
-- Bucket storage 'product-photos' TIDAK dibuat ulang — dipakai APA ADANYA
-- dari 0010 (public=true, RLS storage.objects sudah admin-write/public-read,
-- disaring `bucket_id = 'product-photos'` yang tidak peduli path di
-- dalamnya). Path baru yang disepakati untuk galeri: `<product_id>/gallery/
-- <id acak>.webp` — TETAP di bawah bucket & policy storage yang sama dengan
-- foto sampul (`<product_id>/foto`), jadi TIDAK ADA perubahan storage di
-- berkas ini sama sekali. Blok verifikasi mengulang PHOTO_BUCKET_PUBLIC dari
-- 0010 untuk membuktikan bucket itu tidak tersentuh.
--
-- YANG SENGAJA TIDAK DIBUKA:
--   * Kolom harga di sanci_products (diulang lagi, sekali lagi 0).
--   * Jalur baca anon ke product_prices ATAU partner_orders — TIDAK ADA
--     policy baru di kedua tabel itu. Diverifikasi SET ROLE anon = 0 baris.
--   * Jalur TULIS anon apa pun — sp_anon_read/ph_anon_read keduanya SELECT
--     saja; tidak ada INSERT/UPDATE/DELETE untuk anon di berkas ini.
--   * Reorder/edit galeri (drag-drop dsb.) — `sort_order` ada di skema untuk
--     ruang gerak nanti, tapi UI 2026-08-28 hanya menulis 0 untuk semua
--     unggahan (urutan alami = kapan diunggah, lewat created_at/id sebagai
--     tie-break) — bukan diputuskan sepihak, keputusan produk kalau nanti
--     dibutuhkan reorder manual.
-- ============================================================

-- ── 0. Pengaman prasyarat ───────────────────────────────────
-- Pola 0021 §0: berhenti dengan kalimat yang bisa ditindaklanjuti. Guard di
-- sini memeriksa KEBERADAAN objek 0021 (bukan "apakah fn_audit_row yang
-- aktif masih memuat PRODUCT_PRICE") — persis alasan LESSONS #41 yang
-- ditulis panjang lebar di 0021 §0: guard versi-aktif akan mengunci jalur
-- pemulihannya sendiri kalau berkas lama sempat dijalankan ulang sebelum
-- 0022 ini. Kalau tabel 0021 belum pernah ada sama sekali, memasang
-- pemetaan PRODUCT_PRICE lebih dulu daripada tabelnya sendiri terlihat
-- benar padahal setengah jadi — lebih baik berhenti di sini.

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
      'Fungsi/tabel dasar (fn_is_admin / fn_pu_partner / fn_catalog_enabled / fn_audit_row / fn_set_created_by / partners / sanci_products) belum lengkap. Jalankan 0001 → … → 0021 dulu, baru 0022.';
  end if;

  -- Penanda 0021: OBJEK berkas itu harus sudah ada (pola 0010 §0 / 0021 §0
  -- — memeriksa KEBERADAAN, bukan versi aktif fn_audit_row).
  if to_regclass('public.product_prices') is null
     or to_regprocedure('public.fn_price_stamp()') is null then
    raise exception
      'Migration 0021_partner_price_list.sql belum dijalankan di database ini. Jalankan 0001 → … → 0021 dulu, baru 0022.';
  end if;

  if to_regclass('storage.buckets') is null then
    raise exception
      'Schema storage tidak ditemukan. File ini khusus untuk database Supabase (bucket publik product-photos milik 0010).';
  end if;
end;
$$;

-- ── 1. product_photos: galeri foto TAMBAHAN per produk ──────

-- DI LUAR sanci_products.photo_url (foto sampul, 0010) — kolom itu TIDAK
-- disentuh (mekanisme upload-nya "SATU KATA PUN TIDAK DIUBAH", instruksi
-- rencana kerja). Tabel ini murni tambahan: nol baris di sini = produk tetap
-- tampil normal dengan foto sampulnya saja.
--
-- FK product_id ON DELETE RESTRICT (bukan CASCADE seperti product_prices di
-- 0021) — mengikuti keluarga LESSONS #4 (master data dependen pakai
-- deactivate/restrict, bukan cascade diam-diam), sesuai instruksi rencana
-- kerja. Beda sengaja dari product_prices: baris harga di 0021 memang
-- dirancang sebagai "pengaturan yang menempel" (alasan panjang di 0021 §1);
-- foto galeri adalah ASET yang diunggah admin satu per satu — RESTRICT di
-- sini adalah jaring pengaman yang nyaris tidak pernah aktif (produk di app
-- ini tidak pernah benar-benar dihapus, hanya status ACTIVE/INACTIVE, 0010),
-- tapi menutup jalur "produk hilang diam-diam menyeret foto ikut hilang
-- tanpa siapa pun memutuskannya".
--
-- photo_url text NOT NULL, membawa `?v=<waktu unggah>` (LESSONS #22) —
-- SETIAP path storage galeri sudah unik per unggahan (`<id acak>.webp`,
-- lihat §-bucket di atas kepala berkas), jadi cache-busting di sini murni
-- konsistensi dengan konvensi 0010/0021, bukan kebutuhan teknis mendesak.
--
-- sort_order int NOT NULL DEFAULT 0 — lihat catatan "YANG SENGAJA TIDAK
-- DIBUKA" di kepala berkas: kolom ada untuk ruang gerak, UI 2026-08-28
-- selalu menulis 0.
--
-- created_at/created_by, TANPA updated_at — baris galeri tidak pernah
-- di-UPDATE oleh UI ini (ganti foto = hapus baris lama + unggah baris baru,
-- pola yang sama seperti "hapus override" di 0021 §5 pp_partner_delete):
-- menambah kolom yang tidak pernah terisi berarti dan trigger yang tidak
-- pernah punya alasan jalan hanya menambah permukaan tanpa menambah makna.
--
-- TANPA client_request_id — tidak ada kunci alamiah untuk foto (beda dari
-- product_prices yang punya (product_id, partner_id)). Risiko duplikat
-- kiriman-ulang jaringan lemah DITERIMA SADAR di sini: akibatnya paling
-- buruk adalah satu foto tampil dua kali di galeri, admin melihatnya
-- langsung di modal dan bisa hapus salah satu (§B rencana kerja — "setiap
-- foto bisa dihapus") — beda kelas risiko dari LESSONS #3 (yang bicara
-- soal data uang/otorisasi berganda), bukan pengecualian diam-diam
-- terhadapnya.
create table if not exists public.product_photos (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.sanci_products(id) on delete restrict,
  photo_url  text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid
);

-- Urutan galeri yang disepakati (rencana kerja): sort_order, created_at, id
-- — index ini mengikuti bentuk ORDER BY itu persis, dipakai baik oleh
-- query admin (kelola) maupun cabang/publik (tampil).
create index if not exists idx_product_photos_order
  on public.product_photos (product_id, sort_order, created_at, id);

-- ── 2. Trigger ──────────────────────────────────────────────

-- created_by dipaksa server (LESSONS #6) lewat fungsi yang sudah ada sejak
-- 0004 — tidak perlu fungsi baru.
drop trigger if exists trg_set_created_by on public.product_photos;
create trigger trg_set_created_by before insert on public.product_photos
  for each row execute function public.fn_set_created_by();

-- Audit dipasang untuk ketiga operasi walau policy tulisnya sempit — jalur
-- service_role/pemilik tabel melewati RLS, dan satu-satunya yang akan tahu
-- adalah baris audit ini (alasan yang sama persis dengan 0009 §4/0010 §4/
-- 0021 §4).
drop trigger if exists trg_audit on public.product_photos;
create trigger trg_audit after insert or update or delete on public.product_photos
  for each row execute function public.fn_audit_row();

-- SENGAJA TANPA trg_touch: tabel ini tidak punya kolom updated_at (§1).

-- ── 3. RLS product_photos ───────────────────────────────────

alter table public.product_photos enable row level security;

-- Admin: kelola penuh (tambah/hapus/lihat semua galeri semua produk).
-- LESSONS #25 dipatuhi: fn_is_admin() tidak membaca product_photos sama
-- sekali (membaca platform_admins) — INSERT…RETURNING aman.
drop policy if exists ph_admin_all on public.product_photos;
create policy ph_admin_all on public.product_photos
  for all using (public.fn_is_admin()) with check (public.fn_is_admin());

-- Cabang (login, partner): SAMA PERSIS gerbangnya dengan sp_partner_read
-- milik sanci_products (0010 §5) — produk berstatus ACTIVE DAN katalog
-- terbuka untuk partner ini. `exists (...)` di sini menunjuk ke TABEL LAIN
-- (sanci_products, bukan product_photos itu sendiri) — bukan pola "self
-- join" yang diperingatkan LESSONS #15; subquery-nya sendiri tunduk pada
-- RLS sanci_products milik SESI PEMANGGIL yang sama, dan karena syarat kita
-- (status ACTIVE) adalah subset dari sp_partner_read (status ACTIVE +
-- fn_catalog_enabled), hasilnya konsisten baik dipandang langsung dari
-- product_photos maupun ditelusuri lewat sanci_products.
drop policy if exists ph_partner_read on public.product_photos;
create policy ph_partner_read on public.product_photos
  for select using (
    public.fn_catalog_enabled()
    and exists (
      select 1 from public.sanci_products p
      where p.id = product_photos.product_id and p.status = 'ACTIVE'
    )
  );

-- Sesi TANPA LOGIN (halaman publik /p/[productId]): dibatasi GANDA —
-- `auth.uid() is null` MEMASTIKAN policy ini hanya pernah bernilai true
-- untuk sesi yang genuinely tanpa sesi Supabase Auth (baik dipakai lewat
-- anon key TANPA token, maupun — secara teori — role apa pun tanpa JWT).
-- Sesi partner/admin yang sedang login SELALU py auth.uid() TERISI, jadi
-- baris policy ini otomatis false untuknya dan visibilitasnya tetap
-- sepenuhnya ditentukan oleh ph_partner_read/ph_admin_all di atas —
-- TIDAK ADA pelonggaran gerbang katalog untuk sesi yang sudah login.
-- Digabung dengan syarat produk ACTIVE (sama alasannya seperti policy di
-- atas). TIDAK memeriksa fn_catalog_enabled() — halaman publik memang
-- dirancang tidak peduli katalog partner mana pun sudah dibuka atau belum
-- (dia bukan katalog partner, dia link publik per produk).
drop policy if exists ph_anon_read on public.product_photos;
create policy ph_anon_read on public.product_photos
  for select using (
    auth.uid() is null
    and exists (
      select 1 from public.sanci_products p
      where p.id = product_photos.product_id and p.status = 'ACTIVE'
    )
  );

-- ── 4. RLS TAMBAHAN sanci_products: jalur baca TANPA LOGIN ──

-- SATU-SATUNYA alasan berkas ini menyentuh RLS sanci_products: halaman
-- publik /p/[productId] (§D rencana kerja) TIDAK mengharuskan pengunjung
-- login sama sekali. Sebelum baris ini, TIDAK ADA kombinasi policy yang
-- bisa bernilai true untuk sesi tanpa auth.uid() — sp_admin_all butuh
-- fn_is_admin() (false), sp_partner_read butuh fn_catalog_enabled() yang
-- SELALU false untuk fn_pu_partner() null (0010 §3). Jadi ini genuinely
-- POLICY BARU, bukan pelebaran salah satu yang sudah ada — dan sengaja
-- dipisah jadi policy TERSENDIRI (bukan menambahkan `or auth.uid() is
-- null` ke dalam sp_partner_read) supaya kedua aturan bisa dibaca,
-- diverifikasi, dan (kalau perlu suatu hari) dicabut satu-satu tanpa
-- menyentuh yang lain.
--
-- MEKANISME KENAPA INI AMAN untuk sesi partner/admin yang sedang login:
-- kebijakan SELECT di Postgres digabung dengan OR — baris terlihat kalau
-- SALAH SATU policy bernilai true. `auth.uid() is null` di sini membuat
-- policy ini SELALU false untuk siapa pun yang punya sesi Supabase Auth
-- (partner ATAU admin — keduanya auth.uid()-nya terisi). Jadi menambahkan
-- policy ini TIDAK PERNAH menambah baris yang terlihat oleh partner yang
-- katalognya belum dibuka SANCI — gerbang fn_catalog_enabled() di
-- sp_partner_read tetap satu-satunya jalur untuk mereka, TIDAK BERUBAH.
--
-- KOLOM SANCI_PRODUCTS YANG DENGAN INI TERBUKA UNTUK ANONIM (RLS row-level,
-- BUKAN column-level — begitu satu baris lolos policy, SEMUA kolomnya
-- kebaca oleh query yang memintanya) — didaftar satu per satu, dan alasan
-- kenapa masing-masing AMAN dipublikasikan:
--   id                 → UUID acak, tidak bocorkan apa pun sendirian.
--   name               → nama produk — memang untuk ditampilkan ke publik
--                         (tujuan halaman ini).
--   code               → kode barang gudang SANCI — bukan rahasia, sudah
--                         terlihat di foto sampul katalog Iistrik ke
--                         PARTNER manapun yang katalognya terbuka; tidak
--                         ada nilai uang atau posisi internal di dalamnya.
--   category           → kategori produk — metadata tampilan, bukan data
--                         operasional.
--   description        → teks bebas admin isi untuk deskripsi PRODUK —
--                         ditulis MEMANG untuk dibaca calon pembeli.
--   photo_url          → alamat foto SUDAH publik sejak 0010 §7 (bucket
--                         product-photos public=true — siapa saja yang
--                         PEGANG alamatnya sudah bisa buka tanpa RLS apa
--                         pun); mengizinkan baris terbaca hanya membuat
--                         alamat itu bisa DITEMUKAN lewat halaman resmi,
--                         bukan membuka sesuatu yang tadinya tertutup.
--   stock_status       → AVAILABLE/LIMITED/OUT_OF_STOCK — status stok
--                         SAAT INI, bukan angka (0010 §1: "stok hanya
--                         status, bukan angka" — keputusan yang sama
--                         berlaku di sini); tidak menyingkap milik siapa
--                         atau berapa banyak.
--   status              → SELALU 'ACTIVE' untuk baris yang lolos policy ini
--                         (syarat policy itu sendiri) — tidak membocorkan
--                         daftar produk yang DITARIK (INACTIVE tetap 0
--                         baris untuk anon, diverifikasi ANON_PRODUCT_
--                         INACTIVE_ZERO di bawah).
--   client_request_id  → nilai idempotency INTERNAL (LESSONS #3/#21) —
--                         BUKAN rahasia bisnis (tidak ada nilai uang/
--                         identitas di dalamnya, cuma UUID yang dipakai
--                         mencegah baris ganda saat disimpan), tapi
--                         TETAP TIDAK PERNAH dirender frontend mana pun
--                         (bukan kontrak API — server component memilih
--                         kolom secara eksplisit, tidak pernah `select *`).
--   created_by          → UUID actor internal SANCI — TIDAK PERNAH
--                         dirender (pola SKIP audit-format.ts, LESSONS
--                         #28); halaman publik memilih kolom secara
--                         eksplisit dan TIDAK menyertakan kolom ini.
--   created_at/updated_at → timestamp housekeeping — tidak sensitif, dan
--                         TETAP TIDAK dirender halaman publik (kolom
--                         dipilih eksplisit).
--
-- TIDAK ADA kolom harga untuk dikhawatirkan — 0010 memastikan tabel ini
-- TIDAK PUNYA kolom harga sama sekali (PRODUCT_NO_PRICE_COLUMN, diulang di
-- blok verifikasi bawah). Inilah kenapa boleh membuka SELURUH baris produk
-- ACTIVE ke publik tanpa mendesain daftar kolom yang di-whitelist secara
-- terpisah — tabelnya sendiri sudah tidak punya apa pun yang perlu
-- disembunyikan dari orang luar SELAIN baris yang statusnya bukan ACTIVE
-- (dan itu tetap tertutup, gerbang policy-nya sendiri).
drop policy if exists sp_anon_read on public.sanci_products;
create policy sp_anon_read on public.sanci_products
  for select using (auth.uid() is null and status = 'ACTIVE');

-- ── 5. Permukaan EXECUTE (LESSONS #26) — tidak ada yang baru dibuka ──

-- fn_catalog_enabled dipakai ph_partner_read, SUDAH ter-grant ke anon +
-- authenticated sejak 0010 (CATALOG_FN_EXEC_* = 1) dan CREATE OR REPLACE
-- tidak pernah mencabutnya. Policy sp_anon_read/ph_anon_read TIDAK memanggil
-- fungsi apa pun (hanya `auth.uid()`, bawaan Supabase, dan perbandingan
-- kolom biasa) — tidak ada permukaan EXECUTE baru untuk dikelola sama
-- sekali. Tidak ada fungsi BARU di berkas ini, dan tidak ada RPC baru.

-- ── 6. fn_audit_row: didefinisikan ULANG untuk PRODUCT_PHOTO ──

-- Definisi ulang UTUH (bukan tambalan) — ATURAN BESI migrations/README.md.
-- Versi yang disalin adalah versi 0021, berkas TERAKHIR yang mendefinisikan
-- ulang fungsi ini. SELURUH perilaku 0004+0005+0008+0009+0010+0012+0013+
-- 0014+0016+0018+0021 dipertahankan kata demi kata.
--
-- Yang bertambah HANYA SATU baris pemetaan nama entitas:
--   'product_photos' → 'PRODUCT_PHOTO'
-- (di-diff langsung terhadap 0021 §7 saat berkas ini ditulis — satu-satunya
-- perbedaan adalah baris itu.)
--
-- product_photos adalah entitas top-level SEDERHANA seperti product_prices
-- (0021) — TIDAK butuh blok pencarian partner lewat tabel lain: tabel ini
-- tidak punya partner_id/branch_id sama sekali (foto milik PRODUK, bukan
-- milik partner mana pun — sama seperti sanci_products sendiri, 0010 §9).
-- Konsekuensinya: setiap baris audit PRODUCT_PHOTO_* punya partner_id DAN
-- branch_id NULL, sama seperti PRODUCT_CREATED/PRODUCT_UPDATED. Siapa
-- PELAKUNYA tetap terbaca lewat actor_user_id/actor_role — hanya SANCI
-- Admin yang bisa menulis (§3 ph_admin_all), jadi actor_role akan selalu
-- SANCI_ADMIN untuk aksi ini.
-- Aksi yang akan muncul (tabel tanpa kolom status → hanya jalur generik):
--   PRODUCT_PHOTO_CREATED / PRODUCT_PHOTO_UPDATED / PRODUCT_PHOTO_DELETED
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
-- 0013/0014/0016/0018/0021 SETELAH file ini: definisi ini akan tertimpa dan
-- pemetaan PRODUCT_PHOTO hilang diam-diam (layar Aktivitas menampilkan kode
-- mentah 'PRODUCT_PHOTOS_CREATED'). Jalankan ulang 0022 untuk memulihkannya
-- (lihat migrations/README.md — baris ATURAN BESI 0022). Sebaliknya, karena
-- versi ini memuat SELURUH perilaku pendahulunya, menjalankan 0022 paling
-- akhir juga MEMULIHKAN pemetaan yang sempat tertimpa berkas lama —
-- termasuk PRODUCT_PRICE (0021) yang sebelumnya cuma dipulihkan oleh 0021.

-- ── 7. Verifikasi bagian A — STRUKTUR (hasilnya di-copy balik) ──
-- Angka yang diharapkan — cocokkan SATU PER SATU. "Run tanpa tulisan merah"
-- bukan bukti (LESSONS #7 & #16). Blok ini dijalankan role BIASA (postgres
-- di SQL Editor, yang tidak dibatasi RLS) — cocok untuk memeriksa BENTUK
-- skema/policy, TIDAK cocok untuk membuktikan "anon benar-benar 0 baris"
-- (itu tugas Bagian B di bawah, yang genuinely SET ROLE anon).
--
-- TABEL GALERI FOTO
--   PHOTO_TABLE                       1
--   PHOTO_FK_PRODUCT_RESTRICT         1   ← FK ke sanci_products ON DELETE
--                                           RESTRICT (BUKAN cascade — beda
--                                           sengaja dari product_prices 0021)
--   PHOTO_FK_PRODUCT_CASCADE          0   ← WAJIB 0: TIDAK cascade
--   PHOTO_URL_NOT_NULL                1
--   PHOTO_SORT_ORDER_DEFAULT_0        1
--   PHOTO_NO_UPDATED_AT               0   ← WAJIB 0: tabel ini SENGAJA
--                                           tanpa kolom updated_at (§1)
--   PHOTO_NO_REQUEST_ID               0   ← WAJIB 0: sengaja tanpa
--                                           client_request_id (§1, risiko
--                                           duplikat diterima sadar)
-- RLS GALERI FOTO
--   PHOTO_RLS                         1
--   PHOTO_POLICIES                    3   ← ph_admin_all + ph_partner_read
--                                           + ph_anon_read
--   PHOTO_NONADMIN_WRITE              0   ← WAJIB 0 (asersi negatif inti):
--                                           tidak ada policy INSERT/UPDATE/
--                                           DELETE yang bisa benar tanpa
--                                           fn_is_admin()
--   PHOTO_PARTNER_READ_GATED          1   ← ph_partner_read menyebut
--                                           fn_catalog_enabled DAN ACTIVE
--   PHOTO_ANON_READ_GATED             1   ← ph_anon_read menyebut
--                                           "auth.uid() is null" DAN ACTIVE
-- TRIGGER GALERI FOTO
--   PHOTO_TRIGGERS                    2   ← trg_set_created_by + trg_audit
-- RLS sanci_products SETELAH 0022 (0010 tidak tersentuh SELAIN policy baru)
--   PRODUCT_POLICIES_AFTER_0022       3   ← sp_admin_all + sp_partner_read
--                                           + sp_anon_read (BARU) — WAJIB
--                                           naik dari 2 (0010) menjadi 3
--   PRODUCT_ANON_POLICY_GATED         1   ← sp_anon_read menyebut
--                                           "auth.uid() is null" DAN ACTIVE
--   PRODUCT_ANON_POLICY_NO_CATALOG_FN 1   ← WAJIB 1: sp_anon_read TIDAK
--                                           menyebut fn_catalog_enabled —
--                                           halaman publik memang tidak
--                                           peduli gerbang katalog partner
-- ATURAN 0010 DIULANG (query PERSIS sama dengan blok verifikasi 0010/0021)
--   PRODUCT_NO_PRICE_COLUMN           0   ← WAJIB 0: sanci_products TETAP
--                                           tanpa kolom harga apa pun
--   PHOTO_BUCKET_PUBLIC               true ← WAJIB true: bucket 0010 tidak
--                                           dibuat ulang atau diubah
--   PHOTO_BUCKET_STORAGE_POLICIES     4    ← WAJIB TETAP 4 (0010 §7, tidak
--                                           tersentuh — path baru tetap
--                                           lolos filter bucket_id yang sama)
-- AUDIT
--   AUDIT_PRODUCT_PHOTO               1   ← fn_audit_row mengenal awalan
--                                           PRODUCT_PHOTO
--   AUDIT_KEEP_0021_PRICE             1   ← awalan PRODUCT_PRICE milik 0021
--                                           utuh (definer sebelumnya)
--   AUDIT_KEEP_0018_SOURCE            1
--   AUDIT_KEEP_0018_SALES             1
--   AUDIT_KEEP_0016_DOC               1
--   AUDIT_KEEP_0016_DOC_ITEM          1
--   AUDIT_KEEP_0014_ITEM              1
--   AUDIT_KEEP_0013_OFFER             1
--   AUDIT_KEEP_0012_PKG_ITEM          1
--   AUDIT_KEEP_0012_PKG_LOOKUP        1
--   AUDIT_KEEP_0010_PRODUCT           1
--   AUDIT_KEEP_0010_CATALOG           1
--   AUDIT_KEEP_0009_ARRIVED           1
--   AUDIT_KEEP_0009_NOTE              1
--   AUDIT_KEEP_0008_PKG               1
--   AUDIT_KEEP_0008_PHONE             1
--   AUDIT_KEEP_0008_ATTR              1
--   AUDIT_KEEP_0005                   1
--   AUDIT_KEEP_0004                   1
--   REFS_CHECK_CUSTOMER               1   ← lubang P2 milik 0011 masih tertutup
--
-- Dua puluh angka AUDIT_*/REFS_CHECK_CUSTOMER = daftar 0021 utuh (17 baris
-- AUDIT_KEEP_00xx lama + REFS_CHECK_CUSTOMER) + SATU baru (AUDIT_KEEP_0021_
-- PRICE, membuktikan mapping 0021 selamat) + SATU baru (AUDIT_PRODUCT_PHOTO)
-- — bukti langsung fn_audit_row versi ini sungguh salinan penuh 0021 plus
-- satu pemetaan, bukan sesuatu yang lain.

select 'PHOTO_TABLE' as check_type, count(*)::text as result
from information_schema.tables
where table_schema = 'public' and table_name = 'product_photos'
union all
select 'PHOTO_FK_PRODUCT_RESTRICT', count(*)::text
from pg_constraint
where conrelid = 'public.product_photos'::regclass and contype = 'f'
  and confrelid = 'public.sanci_products'::regclass and confdeltype = 'r'
union all
select 'PHOTO_FK_PRODUCT_CASCADE', count(*)::text
from pg_constraint
where conrelid = 'public.product_photos'::regclass and contype = 'f'
  and confrelid = 'public.sanci_products'::regclass and confdeltype = 'c'
union all
select 'PHOTO_URL_NOT_NULL', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'product_photos'
  and column_name = 'photo_url' and is_nullable = 'NO'
union all
select 'PHOTO_SORT_ORDER_DEFAULT_0', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'product_photos'
  and column_name = 'sort_order' and column_default like '%0%'
union all
select 'PHOTO_NO_UPDATED_AT', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'product_photos'
  and column_name = 'updated_at'
union all
select 'PHOTO_NO_REQUEST_ID', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'product_photos'
  and column_name = 'client_request_id'
union all
select 'PHOTO_RLS', count(*)::text
from pg_tables
where schemaname = 'public' and tablename = 'product_photos' and rowsecurity
union all
select 'PHOTO_POLICIES', count(*)::text
from pg_policies where schemaname = 'public' and tablename = 'product_photos'
union all
select 'PHOTO_NONADMIN_WRITE', count(*)::text
from pg_policies
where schemaname = 'public' and tablename = 'product_photos'
  and cmd in ('INSERT','UPDATE','DELETE','ALL')
  and coalesce(qual, '') || ' ' || coalesce(with_check, '') not like '%fn_is_admin%'
union all
select 'PHOTO_PARTNER_READ_GATED', count(*)::text
from pg_policies
where schemaname = 'public' and tablename = 'product_photos'
  and policyname = 'ph_partner_read'
  and qual like '%fn_catalog_enabled%' and qual like '%ACTIVE%'
union all
select 'PHOTO_ANON_READ_GATED', count(*)::text
from pg_policies
where schemaname = 'public' and tablename = 'product_photos'
  and policyname = 'ph_anon_read'
  and qual like '%auth.uid() IS NULL%' and qual like '%ACTIVE%'
union all
select 'PHOTO_TRIGGERS', count(*)::text
from pg_trigger tg join pg_class cl on cl.oid = tg.tgrelid
join pg_namespace ns on ns.oid = cl.relnamespace
where not tg.tgisinternal and ns.nspname = 'public' and cl.relname = 'product_photos'
union all
select 'PRODUCT_POLICIES_AFTER_0022', count(*)::text
from pg_policies where schemaname = 'public' and tablename = 'sanci_products'
union all
select 'PRODUCT_ANON_POLICY_GATED', count(*)::text
from pg_policies
where schemaname = 'public' and tablename = 'sanci_products'
  and policyname = 'sp_anon_read'
  and qual like '%auth.uid() IS NULL%' and qual like '%ACTIVE%'
union all
select 'PRODUCT_ANON_POLICY_NO_CATALOG_FN', (
  case when exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sanci_products'
      and policyname = 'sp_anon_read' and qual not like '%fn_catalog_enabled%'
  ) then '1' else '0' end)
union all
select 'PRODUCT_NO_PRICE_COLUMN', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'sanci_products'
  and (column_name like '%price%' or column_name like '%harga%'
       or column_name like '%discount%' or column_name like '%diskon%')
union all
select 'PHOTO_BUCKET_PUBLIC',
       coalesce((select public::text from storage.buckets where id = 'product-photos'), 'TIDAK ADA')
union all
select 'PHOTO_BUCKET_STORAGE_POLICIES', count(*)::text
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname like 'product_photos_%'
union all
select 'AUDIT_PRODUCT_PHOTO', count(*)::text
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

-- ── 8. Verifikasi bagian B — PERILAKU ANON SESUNGGUHNYA ─────
-- INI BAGIAN PALING PENTING DI BERKAS INI. Blok di atas (Bagian A) berjalan
-- sebagai role `postgres` di SQL Editor, yang di Supabase MELEWATI RLS —
-- `select count(*) from product_prices` di sana akan selalu mengembalikan
-- jumlah TOTAL baris di tabel, BUKAN yang benar-benar terlihat anon
-- (LESSONS #16 sekeluarga: jangan percaya "tidak ada tulisan merah" sebagai
-- bukti). Blok ini SUNGGUHAN berpindah ke role `anon` (Supabase memberi
-- `postgres` keanggotaan bawaan di `anon`/`authenticated`/`service_role`
-- persis untuk keperluan ini) sebelum menghitung — angkanya adalah apa yang
-- SUNGGUHAN dilihat pengunjung tanpa login lewat PostgREST/browser.
--
-- SET LOCAL berlaku hanya untuk transaksi ini (dibungkus BEGIN/COMMIT di
-- bawah) — begitu COMMIT, sesi kembali otomatis ke role semula. Kalau
-- pesan errornya "permission denied to set role", berarti role `postgres`
-- proyek ini belum diberi keanggotaan `anon` (jarang terjadi di Supabase
-- terkelola) — laporkan apa adanya, jangan dilewati.
--
-- Angka yang diharapkan:
--   ANON_PRODUCT_ACTIVE_READ      → HARUS SAMA dengan jumlah produk ACTIVE
--                                    sungguhan (bandingkan dengan query
--                                    manual `select count(*) from
--                                    sanci_products where status='ACTIVE'`
--                                    yang dijalankan TANPA SET ROLE — kalau
--                                    lebih kecil, ada baris ACTIVE yang
--                                    tersembunyi dari publik yang seharusnya
--                                    terlihat; kalau time ini 0 padahal ada
--                                    produk ACTIVE, sp_anon_read tidak
--                                    berfungsi)
--   ANON_PRODUCT_INACTIVE_ZERO    0   ← WAJIB 0: produk yang ditarik TIDAK
--                                        PERNAH terlihat publik
--   ANON_PHOTOS_OF_ACTIVE_READ    → HARUS SAMA dengan jumlah baris
--                                    product_photos milik produk ACTIVE
--                                    (bandingkan manual tanpa SET ROLE)
--   ANON_PHOTOS_OF_INACTIVE_ZERO  0   ← WAJIB 0
--   ANON_PRICES_ZERO              0   ← WAJIB 0, PALING PENTING: harga TIDAK
--                                        PERNAH bocor ke publik, apa pun
--                                        isi product_prices
--   ANON_ORDERS_ZERO              0   ← WAJIB 0: data pesanan partner TIDAK
--                                        PERNAH terlihat publik
--   ANON_CATALOG_ACCESS_ZERO      0   ← WAJIB 0: saklar buka/tutup katalog
--                                        per partner TIDAK bocor ke publik
--                                        (bukti sp_anon_read yang BARU tidak
--                                        ikut melonggarkan tabel LAIN)
begin;
set local role anon;

select 'ANON_PRODUCT_ACTIVE_READ' as check_type, count(*)::text as result
from public.sanci_products where status = 'ACTIVE'
union all
select 'ANON_PRODUCT_INACTIVE_ZERO', count(*)::text
from public.sanci_products where status <> 'ACTIVE'
union all
select 'ANON_PHOTOS_OF_ACTIVE_READ', count(*)::text
from public.product_photos pp
join public.sanci_products p on p.id = pp.product_id
where p.status = 'ACTIVE'
union all
select 'ANON_PHOTOS_OF_INACTIVE_ZERO', count(*)::text
from public.product_photos pp
join public.sanci_products p on p.id = pp.product_id
where p.status <> 'ACTIVE'
union all
select 'ANON_PRICES_ZERO', count(*)::text
from public.product_prices
union all
select 'ANON_ORDERS_ZERO', count(*)::text
from public.partner_orders
union all
select 'ANON_CATALOG_ACCESS_ZERO', count(*)::text
from public.sanci_catalog_access;

commit;
