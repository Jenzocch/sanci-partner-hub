-- ============================================================
-- SANCI Partner Hub — Phase 2 irisan kelima
-- Migration 0010: Katalog Produk SANCI (daftar produk + foto + status stok)
--                 dengan visibilitas yang dibuka/ditutup SANCI PER PARTNER
--                 (idempotent — aman dijalankan ulang)
-- Jalankan di: Supabase Studio → SQL Editor → paste seluruh file → Run
--
-- PRASYARAT: 0001 → 0003 → 0004 → 0005 → 0006 → 0007 → 0008 → 0009 sudah
-- dijalankan, DALAM URUTAN ITU. Blok pengaman di bawah berhenti dengan pesan
-- jelas kalau belum. Setelah file ini, rantai penuhnya menjadi
-- 0001 → 0003 → 0004 → 0005 → 0006 → 0007 → 0008 → 0009 → 0010
-- (lihat migrations/README.md — ATURAN BESI).
--
-- ============================================================
-- LATAR BELAKANG BISNIS (ditetapkan Jenzo, 2026-08-17)
-- ============================================================
--
-- SANCI ingin partner bisa MELIHAT produk apa saja yang SANCI punya, lengkap
-- dengan foto, supaya cabang tidak perlu bertanya lewat WhatsApp satu per satu.
-- Tiga keputusan owner yang membentuk seluruh berkas ini:
--
--   1. STOK HANYA STATUS, BUKAN ANGKA. Tersedia / Terbatas / Habis. Angka
--      sungguhan menunggu sinkronisasi gudang di fase depan; angka basi lebih
--      menyesatkan daripada tidak ada angka sama sekali — cabang yang membaca
--      "sisa 12" lalu menjanjikannya kepada pelanggan akan menyalahkan SANCI,
--      bukan menyalahkan datanya.
--   2. TANPA HARGA SAMA SEKALI. Tidak ada kolom harga, tidak ada diskon, tidak
--      ada aturan penetapan harga. Penawaran disampaikan SANCI secara manual —
--      batas yang sama persis dengan yang sudah ditegakkan 0009.
--   3. VISIBILITAS PER PARTNER. SANCI membuka/menutup katalog untuk SETIAP
--      partner satu per satu. Katalognya SATU untuk semua (bukan katalog
--      per-partner); yang berbeda hanya boleh-tidaknya melihat.
--
-- Nilai enum tetap Bahasa Inggris di dalam basis data; terjemahannya ke Bahasa
-- Indonesia ada di STOCK_STATUS_LABEL (web/lib/catalog-shared.ts) — keputusan
-- lama yang berlaku untuk SEMUA enum di proyek ini. Berkas ini dan berkas itu
-- WAJIB memuat daftar nilai yang sama: 'AVAILABLE','LIMITED','OUT_OF_STOCK'.
--
-- ============================================================
-- APA YANG DIBUKA IRISAN INI (dan hanya ini)
-- ============================================================
--   sanci_products        → tabel BARU. Produk MILIK SANCI. Sengaja TIDAK punya
--                           partner_id: semua partner melihat daftar yang SAMA.
--                           SANCI Admin kelola penuh; pengguna partner hanya
--                           BACA, dan hanya kalau katalognya dibuka untuknya.
--   sanci_catalog_access  → tabel BARU. Satu baris per partner = saklar
--                           buka/tutup. TIDAK ADA baris = TERTUTUP (lihat §2).
--   storage 'product-photos' → bucket BARU, PUBLIK (public = true), seperti
--                           'partner-logos' (0003). Alasan lengkap di §7.
--
-- YANG SENGAJA TIDAK DIBUKA:
--   * Tulis sanci_products dari sisi partner — apa pun caranya, termasuk UPDATE
--     status stok. Katalog adalah pernyataan SANCI, bukan papan tulis bersama.
--   * Tulis sanci_catalog_access dari sisi partner: partner TIDAK boleh membuka
--     aksesnya sendiri (itu akan membuat seluruh saklar ini hiasan).
--   * Harga, diskon, jumlah stok, pemesanan produk, keranjang belanja.
--   * Katalog khusus per partner (produk yang hanya terlihat oleh satu partner).
--     Kalau suatu hari dibutuhkan, itu tabel penghubung tersendiri — JANGAN
--     ditempelkan sebagai partner_id di sanci_products, karena artinya berbeda.
-- ============================================================

-- ── 0. Pengaman prasyarat ───────────────────────────────────
-- Pola yang sama dengan 0003/0008/0009: berhenti dengan kalimat yang bisa
-- ditindaklanjuti, bukan membiarkan Postgres memuntahkan "function
-- public.fn_is_admin() does not exist" di tengah CREATE POLICY.

do $$
begin
  if to_regprocedure('public.fn_is_admin()') is null
     or to_regprocedure('public.fn_pu_partner()') is null
     or to_regprocedure('public.fn_audit_row()') is null
     or to_regprocedure('public.fn_touch_updated_at()') is null
     or to_regprocedure('public.fn_set_created_by()') is null
     or to_regclass('public.partners') is null then
    raise exception
      'Migration 0001/0004 belum dijalankan di database ini. Jalankan 0001 → 0003 → 0004 → 0005 → 0006 → 0007 → 0008 → 0009 dulu, baru 0010.';
  end if;

  -- Penanda 0009: berkas ini mendefinisikan ULANG fn_audit_row milik 0009 dan
  -- WAJIB memuat seluruh isinya. Kalau 0009 belum pernah jalan, definisi di §9
  -- justru akan MEMASANG perilaku 0009 lebih dulu daripada berkasnya sendiri —
  -- terlihat benar, padahal trigger trg_order_arrival, kedua policy
  -- order_internal_notes, dan bucket privat order-invoices belum ada sama
  -- sekali. Lebih baik berhenti di sini daripada menyerahkan setengah jadi itu.
  if to_regclass('public.order_internal_notes') is null
     or to_regprocedure('public.fn_guard_order_arrival()') is null then
    raise exception
      'Migration 0009_fulfillment_invoice_arrival.sql belum dijalankan di database ini. Jalankan 0009 dulu, baru 0010.';
  end if;

  -- storage.buckets selalu ada di proyek Supabase. Kalau tidak ada, file ini
  -- sedang dijalankan di Postgres biasa — katakan terus terang, jangan gagal
  -- di tengah INSERT (pola yang sama dengan 0003 dan 0009).
  if to_regclass('storage.buckets') is null then
    raise exception
      'Schema storage tidak ditemukan. File ini khusus untuk database Supabase (bucket publik product-photos).';
  end if;
end;
$$;

-- ── 1. sanci_products: produk MILIK SANCI ───────────────────

-- TIDAK ADA partner_id, dan itu keputusan yang paling menentukan di tabel ini.
-- Katalognya SATU. Kalau kelak ada yang tergoda menambahkan partner_id "supaya
-- bisa disaring", ia sedang membuat benda lain (katalog per partner) dengan
-- nama lama — dan semua policy di §5 akan berubah artinya diam-diam. Penyaring
-- yang benar untuk "siapa boleh lihat" ada di §2, bukan di baris produk.
--
-- Kenapa dua kolom status yang berbeda, bukan satu:
--   status        = apakah produk ini MASIH DITAWARKAN sama sekali
--                   (ACTIVE/INACTIVE — pengganti hard delete, LESSONS #4).
--   stock_status  = ketersediaan HARI INI (AVAILABLE/LIMITED/OUT_OF_STOCK).
-- Menggabungkannya akan memaksa "habis" berarti "tidak ditawarkan lagi", padahal
-- barang habis biasanya kembali minggu depan dan fotonya tetap perlu tampil.
--
-- DEFAULT ditinjau menurut LESSONS #8 ("kalau lupa diisi, apa artinya?"):
--   status DEFAULT 'ACTIVE'         → produk yang baru dibuat memang untuk
--                                     ditawarkan. Bukan "kondisi terburuk yang
--                                     senyap"; kebalikannya (INACTIVE diam-diam)
--                                     justru membuat admin mengira gagal simpan.
--   stock_status DEFAULT 'AVAILABLE'→ ini yang perlu dijaga. Kalau formulir lupa
--                                     mengirim status stok, produk yang benar-
--                                     benar habis akan tampil "Tersedia" kepada
--                                     seluruh partner. Karena itu formulir WAJIB
--                                     selalu mengirim kolom ini secara eksplisit,
--                                     dan setelah impor massal jalankan
--                                     `select stock_status, count(*) from
--                                      sanci_products group by 1` — semua
--                                     menumpuk di AVAILABLE = tidak diisi.
create table if not exists public.sanci_products (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  -- Nomor barang SANCI sendiri, OPSIONAL. Bukan kunci teknis, hanya kode yang
  -- dipakai orang gudang; produk boleh ada tanpa kode.
  code              text,
  category          text,
  description       text,
  -- Alamat foto di bucket publik 'product-photos' (§7). Path yang disepakati
  -- '<product_id>/<nama berkas>'.
  -- WAJIB dibaca sebelum menulis kolom ini dari Server Action (LESSONS #22):
  -- satu produk = satu path tetap yang ditimpa (upsert), jadi isi berkas berubah
  -- sementara alamatnya TIDAK. Tanpa parameter versi (`?v=<waktu unggah>`) admin
  -- yang mengganti foto akan tetap melihat foto lama dari cache/CDN dan
  -- menyimpulkan "gagal simpan". Yang disimpan di sini WAJIB sudah berversi.
  photo_url         text,
  stock_status      text not null default 'AVAILABLE'
                    check (stock_status in ('AVAILABLE','LIMITED','OUT_OF_STOCK')),
  status            text not null default 'ACTIVE'
                    check (status in ('ACTIVE','INACTIVE')),
  client_request_id text unique,          -- idempotency jaringan lemah (LESSONS #3, #21)
  created_by        uuid,                 -- auth.uid(), dipaksa trigger 0004
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Kode kosong BUKAN kode. Tanpa penjaga ini, dua produk yang sama-sama disimpan
-- dengan kolom kode dibiarkan kosong (string '') akan bertabrakan di indeks unik
-- di bawah, dan pengguna melihat "kode sudah dipakai" untuk kode yang tidak
-- pernah ia isi — persis salah-baca yang dilarang LESSONS #21. Kolom OPSIONAL
-- harus berarti NULL, bukan ''. Server Action wajib mengirim null, bukan ''.
do $$
begin
  if not exists (select 1 from pg_constraint
                 where conname = 'sanci_products_code_not_blank'
                   and conrelid = 'public.sanci_products'::regclass) then
    alter table public.sanci_products
      add constraint sanci_products_code_not_blank
      check (code is null or btrim(code) <> '');
  end if;
end;
$$;

-- Unik HANYA untuk baris yang punya kode. Di Postgres, UNIQUE biasa pun
-- memperlakukan setiap NULL sebagai berbeda sehingga hasilnya sama — predikat
-- `where code is not null` ditulis supaya MAKSUDNYA tidak bisa salah dibaca,
-- dan supaya siapa pun yang kelak menambahkan NOT NULL / default '' langsung
-- melihat bahwa keunikan di sini memang bersyarat.
create unique index if not exists sanci_products_code_key
  on public.sanci_products (code) where code is not null;

-- Grid katalog partner selalu menyaring status = 'ACTIVE' (§5), jadi indeksnya
-- mengikuti bentuk kueri itu.
create index if not exists idx_sanci_products_status
  on public.sanci_products (status, name);

-- ── 2. sanci_catalog_access: saklar per partner ─────────────

-- ATURAN VISIBILITAS — inti irisan ini, dan sengaja GAGAL KE ARAH TERTUTUP:
--
--     ada baris DAN enabled = true  → partner melihat katalog
--     ada baris DAN enabled = false → tidak melihat
--     TIDAK ADA baris               → tidak melihat
--
-- Kenapa fail-CLOSED di sini padahal 0006 justru dibetulkan menjadi fail-OPEN?
-- Karena yang gagal itu dua hal yang sangat berbeda. Di 0006 yang hilang adalah
-- baris kebijakan izin, dan akibat menutupnya adalah pengguna cabang tidak bisa
-- melihat CABANGNYA SENDIRI — jalur inti aplikasi mati tanpa pesan apa pun.
-- Katalog bukan jalur inti: ia fitur PILIHAN yang SANCI berikan kepada partner
-- tertentu. Kalau saklarnya belum pernah disentuh, jawaban yang benar adalah
-- "SANCI belum membukanya", bukan "kalau ragu, buka saja". Membuka secara
-- default berarti setiap partner baru langsung melihat seluruh daftar produk
-- SANCI pada hari ia dibuat — tanpa seorang pun pernah memutuskannya.
--
-- enabled DEFAULT true ditinjau LESSONS #8: baris di tabel ini TIDAK PERNAH
-- lahir sendiri. Ia hanya ada kalau SANCI Admin menekan "buka katalog", jadi
-- default-nya adalah nilai yang memang dimaksud pada saat itu. Kasus "lupa
-- diisi" tidak jatuh ke default ini — ia jatuh ke "tidak ada baris", dan itu
-- tertutup.
--
-- ON DELETE CASCADE, bukan RESTRICT seperti master lain (LESSONS #4). Tidak
-- bertentangan: baris ini BUKAN data historis, ia saklar yang menempel pada
-- partner. Kalau partner-nya benar-benar lenyap, saklarnya tidak berarti apa-apa
-- dan tidak ada riwayat yang ikut terhapus diam-diam — jejak buka/tutupnya
-- tersimpan di audit_logs (§9), yang memang sengaja tidak punya foreign key.
-- Perlu dicatat: partners sendiri TIDAK pernah dihapus dalam pemakaian normal
-- (status ACTIVE/INACTIVE), jadi cascade ini praktisnya hanya jaring pengaman.
--
-- partner_id sebagai PRIMARY KEY: satu partner tidak mungkin punya dua saklar.
-- Bentuk ini juga membuat "buka katalog" bisa ditulis sebagai upsert idempoten
-- (`on conflict (partner_id) do update`), sehingga kiriman ulang di jaringan
-- lemah tidak pernah menghasilkan baris kedua (LESSONS #3).
create table if not exists public.sanci_catalog_access (
  partner_id uuid primary key references public.partners(id) on delete cascade,
  enabled    boolean not null default true,
  updated_at timestamptz not null default now()
);

-- SENGAJA TANPA created_by/created_at: yang menarik dari tabel ini bukan
-- "kapan dibuat" melainkan "kapan terakhir diubah dan oleh siapa" — dan itu
-- justru tersimpan lengkap di audit_logs (CATALOG_ACCESS_CREATED /
-- CATALOG_ACCESS_UPDATED, §9), bukan di kolom yang harus ikut dirawat di sini.

-- ── 3. fn_catalog_enabled(): jawaban "katalog terbuka untuk saya?" ──

-- WAJIB SECURITY DEFINER (LESSONS #15). Kalau pemeriksaan ini ditulis langsung
-- sebagai subquery di dalam policy sanci_products, subquery itu ikut disaring
-- RLS milik sanci_catalog_access — dan sejak §6 pengguna partner hanya boleh
-- melihat BARISNYA SENDIRI, hasilnya kebetulan masih benar hari ini. "Kebetulan
-- masih benar" bukan alasan yang boleh dipakai: begitu policy di §6 dipersempit
-- (misalnya kelak hanya admin yang boleh membaca tabel saklar), seluruh katalog
-- akan menghilang untuk SEMUA partner tanpa satu pun pesan error, dan gejalanya
-- ("katalognya kosong") persis sama dengan katalog yang memang belum diisi.
-- Di dalam security definer, jawabannya dihitung dari data yang SEBENARNYA ada.
--
-- Identitas tetap milik PEMANGGIL: fn_pu_partner() membaca auth.uid() dan
-- SECURITY DEFINER tidak mengubah sesi (LESSONS #6 — partner_id tidak pernah
-- datang dari client). Untuk admin dan untuk sesi tanpa identitas,
-- fn_pu_partner() bernilai null sehingga fungsi ini false — admin tidak
-- membutuhkannya (ia lewat policy admin di §5).
--
-- STABLE, bukan VOLATILE: dipanggil sekali per baris oleh policy; nilainya tidak
-- berubah di tengah satu perintah.
create or replace function public.fn_catalog_enabled() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from sanci_catalog_access a
    where a.partner_id = public.fn_pu_partner()
      and a.enabled
  );
$$;

-- ── 4. Trigger kedua tabel ──────────────────────────────────

-- Audit dipasang untuk INSERT/UPDATE/DELETE walaupun policy tulisnya hanya untuk
-- admin. Bukan sisa copy-paste: service_role (Edge Function, skrip pemeliharaan)
-- dan pemilik tabel MELEWATI RLS sepenuhnya, dan kalau suatu hari katalog atau
-- saklar akses diubah lewat jalur itu, satu-satunya yang akan tahu adalah baris
-- audit ini (alasan yang sama dengan 0009 §4).
drop trigger if exists trg_audit on public.sanci_products;
create trigger trg_audit after insert or update or delete on public.sanci_products
  for each row execute function public.fn_audit_row();

drop trigger if exists trg_touch on public.sanci_products;
create trigger trg_touch before update on public.sanci_products
  for each row execute function public.fn_touch_updated_at();

drop trigger if exists trg_set_created_by on public.sanci_products;
create trigger trg_set_created_by before insert on public.sanci_products
  for each row execute function public.fn_set_created_by();

drop trigger if exists trg_audit on public.sanci_catalog_access;
create trigger trg_audit after insert or update or delete on public.sanci_catalog_access
  for each row execute function public.fn_audit_row();

drop trigger if exists trg_touch on public.sanci_catalog_access;
create trigger trg_touch before update on public.sanci_catalog_access
  for each row execute function public.fn_touch_updated_at();

-- SENGAJA TANPA trg_set_created_by pada sanci_catalog_access: tabelnya tidak
-- punya kolom created_by (§2), dan fn_set_created_by hanya mengisi kolom itu.

-- ── 5. RLS sanci_products ───────────────────────────────────

alter table public.sanci_products enable row level security;

-- LESSONS #25: policy ini TIDAK memeriksa apa pun tentang barisnya sendiri —
-- fn_is_admin() menjawab dari platform_admins, bukan dari sanci_products. Jadi
-- `insert ... returning` (yang dipakai supabase-js `.insert().select()`) aman:
-- baris baru tidak perlu "ditemukan" untuk lolos RETURNING. Dibuktikan tes
-- perilaku, bukan diasumsikan.
drop policy if exists sp_admin_all on public.sanci_products;
create policy sp_admin_all on public.sanci_products
  for all using (public.fn_is_admin()) with check (public.fn_is_admin());

-- HANYA BACA untuk pengguna partner, dengan DUA syarat sekaligus:
--   status = 'ACTIVE'          → produk yang ditarik dari katalog HILANG dari
--                                layar partner.
--   fn_catalog_enabled()       → dan hanya kalau SANCI membuka katalog untuknya.
--
-- Kenapa INACTIVE disembunyikan di sini, padahal paket INACTIVE justru sengaja
-- TETAP terbaca di 0008? Karena keduanya menjawab pertanyaan yang berbeda.
-- partner_packages dirujuk oleh order lama, jadi layar riwayat harus tetap bisa
-- menyebut namanya — menyembunyikannya akan membuat order lama kehilangan arti.
-- Katalog produk adalah data KEADAAN SEKARANG: tidak ada satu pun baris di basis
-- data ini yang menunjuk ke sanci_products, jadi produk yang sudah ditarik tidak
-- meninggalkan lubang di mana pun. "Ditarik = hilang dari layar" justru yang
-- diharapkan penggunanya; produk yang tampak tapi tidak bisa dipesan hanya
-- memancing pertanyaan ke SANCI.
--
-- Perhatikan: syarat pertama membaca kolom pada BARIS ITU SENDIRI (bukan
-- subquery balik ke sanci_products), syarat kedua bertanya ke tabel LAIN lewat
-- security definer. Itu persis pembagian yang diminta LESSONS #25 + #15.
--
-- TIDAK ADA policy INSERT/UPDATE/DELETE untuk pengguna partner. Tanpa policy =
-- tertutup, bukan sekadar tersembunyi. Termasuk status stok: kalau cabang bisa
-- menulis "Habis", katalog berhenti menjadi pernyataan SANCI.
drop policy if exists sp_partner_read on public.sanci_products;
create policy sp_partner_read on public.sanci_products
  for select using (status = 'ACTIVE' and public.fn_catalog_enabled());

-- ── 6. RLS sanci_catalog_access ─────────────────────────────

alter table public.sanci_catalog_access enable row level security;

drop policy if exists sca_admin_all on public.sanci_catalog_access;
create policy sca_admin_all on public.sanci_catalog_access
  for all using (public.fn_is_admin()) with check (public.fn_is_admin());

-- Pengguna partner boleh membaca SATU baris: barisnya sendiri. Ini bukan
-- kenyamanan, ini yang membuat aplikasi bisa berkata jujur. Tanpa baris ini,
-- katalog yang belum dibuka dan katalog yang kebetulan masih kosong sama-sama
-- muncul sebagai "0 produk" — dan pengguna akan menyimpulkan aplikasinya rusak,
-- lalu memuat ulang berkali-kali (LESSONS #10: keadaan yang berbeda tidak boleh
-- tampil sebagai layar yang sama). Dengan baris ini, layar bisa membedakan
-- "belum dibuka SANCI" dari "sudah dibuka, produknya memang belum ada".
--
-- Bocornya apa? Satu boolean tentang dirinya sendiri. Partner lain tidak
-- disebut, dan `partner_id = fn_pu_partner()` adalah perbandingan kolom pada
-- baris itu sendiri — bukan subquery balik ke tabel ini (LESSONS #25).
--
-- TIDAK ADA policy tulis untuk partner: saklar yang bisa dinyalakan sendiri oleh
-- yang seharusnya dibatasi bukan saklar (LESSONS #5).
drop policy if exists sca_partner_read on public.sanci_catalog_access;
create policy sca_partner_read on public.sanci_catalog_access
  for select using (partner_id = public.fn_pu_partner());

-- ── 7. Bucket foto produk PUBLIK + storage RLS ──────────────

-- public = TRUE, mengikuti 'partner-logos' (0003) dan BUKAN 'order-invoices'
-- (0009, privat). Alasannya, ditulis terang-terangan supaya keputusan ini bisa
-- ditinjau ulang orang lain:
--   * Foto produk adalah MATERI PEMASARAN, bukan data rahasia. SANCI memang
--     ingin barangnya dilihat.
--   * Grid katalog memuat puluhan gambar sekaligus. Bucket privat berarti setiap
--     gambar butuh signed URL yang harus diminta lebih dulu dan kedaluwarsa —
--     lebih lambat, lebih banyak yang bisa gagal, demi kerahasiaan yang tidak
--     dibutuhkan barang yang justru ingin dipamerkan.
--   * Yang dilindungi tetap terlindungi: DAFTARNYA. Siapa boleh melihat katalog
--     ditentukan RLS di §5 — bukan oleh sulitnya menebak alamat foto.
--
-- BATAS YANG DITERIMA SECARA SADAR (bukan lubang yang terlewat): siapa pun yang
-- MEMEGANG alamat sebuah foto bisa membukanya tanpa login, selamanya. Yang tidak
-- bisa ia lakukan adalah menemukan alamat-alamat itu — nama, kode, kategori,
-- status stok, dan seluruh daftar produk tetap di balik RLS. Konsekuensinya satu
-- dan harus dipatuhi: JANGAN PERNAH mengunggah berkas yang bukan foto pemasaran
-- ke bucket ini (daftar harga internal, foto invoice, dokumen apa pun). Untuk
-- berkas seperti itu tempatnya 'order-invoices' yang privat.
--
-- Batas ukuran + daftar tipe berkas di sini adalah pertahanan SERVER;
-- pengecilan gambar di browser hanya kenyamanan (pola yang sama dengan 0003).
-- application/pdf SENGAJA tidak diizinkan: bucket ini khusus foto.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-photos', 'product-photos', true, 5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public             = true,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Path yang disepakati: '<product_id>/<nama berkas>' — sama bentuknya dengan
-- 'partner-logos' (0003) dan 'order-invoices' (0009).
--
-- SENGAJA TANPA fungsi bantu semacam fn_invoice_order_branch (0009): di sana
-- helper itu dibutuhkan karena yang mengunggah adalah pengguna CABANG dan
-- policy harus tahu berkas ini milik cabang mana. Di sini yang boleh menulis
-- hanya admin SANCI, jadi tidak ada pertanyaan kepemilikan yang perlu dijawab —
-- menambahkan pemeriksaan "product_id harus sudah ada" hanya akan menciptakan
-- kegagalan baru (unggah sebelum produk tersimpan) tanpa menutup apa pun.
--
-- RLS pada storage.objects sudah aktif bawaan Supabase — sengaja TIDAK dipanggil
-- `alter table ... enable row level security` di sini, karena tabel itu milik
-- supabase_storage_admin dan perintah tersebut bisa ditolak (catatan yang sama
-- dengan 0003 dan 0009).
--
-- Setiap policy dikunci `bucket_id = 'product-photos'` di depan supaya TIDAK ADA
-- satu pun aturan ini yang menyentuh bucket lain — 'partner-logos' (0003) dan
-- 'order-invoices' (0009) tidak berubah perilakunya, dan blok verifikasi di
-- bawah membuktikannya.

-- Baca: siapa saja (termasuk yang belum login) — bucket ini memang publik.
drop policy if exists product_photos_public_read on storage.objects;
create policy product_photos_public_read on storage.objects
  for select using (bucket_id = 'product-photos');

-- Tulis/ubah/hapus: HANYA admin platform. UI yang menyembunyikan tombol unggah
-- dari pengguna partner hanya soal tampilan (LESSONS #5).
drop policy if exists product_photos_admin_insert on storage.objects;
create policy product_photos_admin_insert on storage.objects
  for insert with check (bucket_id = 'product-photos' and public.fn_is_admin());

-- upsert ke path yang sama = UPDATE, jadi policy UPDATE wajib ada (pelajaran
-- dari 0003). USING dan WITH CHECK dua-duanya diisi supaya berkas tidak bisa
-- "dipindahkan" keluar dari bucket ini lewat rename.
drop policy if exists product_photos_admin_update on storage.objects;
create policy product_photos_admin_update on storage.objects
  for update using (bucket_id = 'product-photos' and public.fn_is_admin())
       with check (bucket_id = 'product-photos' and public.fn_is_admin());

drop policy if exists product_photos_admin_delete on storage.objects;
create policy product_photos_admin_delete on storage.objects
  for delete using (bucket_id = 'product-photos' and public.fn_is_admin());

-- ── 8. Permukaan EXECUTE (LESSONS #26) ──────────────────────

-- fn_catalog_enabled DIPAKAI POLICY, jadi WAJIB TETAP BISA DIPANGGIL anon +
-- authenticated. Ekspresi policy dievaluasi sebagai pengguna yang melakukan
-- query, sehingga hak EXECUTE-nya ikut diperiksa. Kalau dicabut, setiap SELECT
-- ke sanci_products GAGAL dengan "permission denied for function" alih-alih
-- mengembalikan 0 baris — error database yang menyamar jadi kesimpulan bisnis,
-- persis yang dilarang LESSONS #10 (dan sudah pernah terukur di 0007).
-- Diberikan ke anon juga karena pengunjung yang belum login tetap menyentuh
-- policy ini saat membuka halaman.
--
-- Tidak ada yang bocor karenanya: fungsi ini tidak menerima argumen dan hanya
-- menjawab "katalog terbuka untuk SAYA?" berdasarkan auth.uid() si penanya.
-- Untuk sesi tanpa identitas jawabannya selalu false.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'grant execute on function public.fn_catalog_enabled() to anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.fn_catalog_enabled() to authenticated';
  end if;
end;
$$;

-- ── 9. Audit: PRODUCT + CATALOG_ACCESS ──────────────────────

-- Definisi ulang UTUH sekali lagi (bukan tambalan) supaya file ini idempotent.
-- SELURUH perilaku 0004, 0005, 0008 dan 0009 dipertahankan kata demi kata:
-- awalan CUSTOMER/ORDER/PACKAGE/ORDER_INTERNAL_NOTE, pengambilan partner/branch
-- dari created_via_*, ORDER_CANCELLED beserta alasannya,
-- ORDER_ATTRIBUTION_CORRECTED beserta GUC app.audit_reason,
-- CUSTOMER_PHONE_CHANGED, ORDER_CUSTOMER_ARRIVED, dan pencarian partner/branch
-- untuk order_internal_notes. Yang bertambah hanya dua baris pemetaan:
--   'sanci_products'       → 'PRODUCT'
--   'sanci_catalog_access' → 'CATALOG_ACCESS'
-- Tanpa keduanya, cabang `else` menghasilkan 'SANCI_PRODUCTS_CREATED' dan
-- 'SANCI_CATALOG_ACCESS_UPDATED' — kode mentah yang akan tampil apa adanya di
-- layar Aktivitas karena web/lib/audit-format.ts tidak punya labelnya.
--
-- Aksi yang akan muncul, supaya lapisan tampilan tahu apa yang harus diberi
-- label (SEMUA lewat jalur generik yang sudah ada, tidak ada cabang baru):
--   PRODUCT_CREATED / PRODUCT_UPDATED / PRODUCT_DELETED
--   PRODUCT_STATUS_CHANGED   ← otomatis, karena sanci_products punya kolom
--                              `status` dan cabang status milik 0004 menangkapnya.
--                              Itu memang yang diinginkan: menarik produk dari
--                              katalog adalah peristiwa tersendiri, bukan sekadar
--                              "diubah". Perubahan stock_status TIDAK ikut ke
--                              sini — ia jatuh ke PRODUCT_UPDATED, dan nilainya
--                              terbaca di kolom before/after.
--   CATALOG_ACCESS_CREATED / CATALOG_ACCESS_UPDATED / CATALOG_ACCESS_DELETED
--
-- partner_id / branch_id pada baris audit:
--   sanci_products       → KEDUANYA null. Produk milik SANCI, bukan milik
--                          partner mana pun — sama seperti pelanggan yang dibuat
--                          admin tanpa cabang asal (0004). Jangan "diperbaiki"
--                          dengan menebak partner; null di sini BERARTI sesuatu.
--   sanci_catalog_access → partner_id terisi sendiri oleh coalesce yang sudah
--                          ada (tabelnya punya kolom partner_id), sehingga
--                          riwayat buka/tutup katalog muncul di layar Aktivitas
--                          yang disaring per partner. branch_id null (memang
--                          tidak ada urusan cabang).
--   entity_id            → sanci_catalog_access tidak punya kolom `id`; nilainya
--                          jatuh ke partner_id lewat coalesce yang sudah ada
--                          sejak 0001. Itu justru identitas barisnya (PK).
--
-- CATATAN untuk yang menjalankan ulang 0001/0004/0005/0008/0009 SETELAH file
-- ini: definisi ini akan tertimpa dan kedua pemetaan baru hilang diam-diam.
-- Jalankan ulang 0010 untuk memulihkannya (lihat migrations/README.md).
-- Sebaliknya, karena versi ini memuat SELURUH perilaku 0004+0005+0008+0009,
-- menjalankan 0010 paling akhir juga MEMULIHKAN pemetaan yang sempat tertimpa
-- berkas lama.
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

-- ── 10. Verifikasi (hasilnya di-copy balik ke Claude) ───────
-- Angka yang diharapkan — cocokkan SATU PER SATU. "Run tanpa tulisan merah"
-- bukan bukti (LESSONS #7 & #16).
--
-- KATALOG PRODUK
--   PRODUCT_TABLE                  1
--   PRODUCT_NO_PARTNER_COLUMN      0   ← WAJIB 0: sanci_products TIDAK punya
--                                        partner_id. Kalau 1, seseorang telah
--                                        mengubah artinya menjadi katalog
--                                        per-partner dan seluruh §5 salah baca.
--   PRODUCT_STOCK_CHECK            1   ← check AVAILABLE/LIMITED/OUT_OF_STOCK
--   PRODUCT_STOCK_VALUES           1   ← WAJIB 1: ketiga nilai persis sama
--                                        dengan web/lib/catalog-shared.ts
--   PRODUCT_STATUS_CHECK           1   ← check ACTIVE/INACTIVE
--   PRODUCT_CODE_UNIQUE_PARTIAL    1   ← unik hanya untuk code yang tidak null
--   PRODUCT_CODE_NOT_BLANK         1   ← code '' ditolak (agar unik tak salah)
--   PRODUCT_NO_PRICE_COLUMN        0   ← WAJIB 0: tidak ada kolom harga apa pun
--   PRODUCT_NO_STOCK_QTY_COLUMN    0   ← WAJIB 0: stok hanya STATUS, bukan angka
--   PRODUCT_IDEMPOTENCY_KEY        1   ← unique client_request_id
--   PRODUCT_RLS                    1
--   PRODUCT_POLICIES               2   ← sp_admin_all + sp_partner_read
--   PRODUCT_PARTNER_WRITE_POLICIES 0   ← WAJIB 0: pengguna partner nol tulis —
--                                        tidak ada policy INSERT/UPDATE/DELETE
--                                        yang bisa benar tanpa fn_is_admin()
--   PRODUCT_READ_GATED             1   ← policy baca partner menyebut ACTIVE
--                                        DAN fn_catalog_enabled sekaligus
--   PRODUCT_TRIGGERS               3   ← audit, touch, set_created_by
-- SAKLAR AKSES
--   ACCESS_TABLE                   1
--   ACCESS_PK_PARTNER              1   ← primary key = partner_id
--   ACCESS_FK_CASCADE              1   ← references partners ON DELETE CASCADE
--   ACCESS_RLS                     1
--   ACCESS_POLICIES                2   ← sca_admin_all + sca_partner_read
--   ACCESS_PARTNER_WRITE_POLICIES  0   ← WAJIB 0: partner tidak bisa menyalakan
--                                        saklarnya sendiri
--   ACCESS_TRIGGERS                2   ← audit + touch (tanpa set_created_by)
--   ACCESS_NO_ROW_MEANS_CLOSED     1   ← WAJIB 1: fn_catalog_enabled memakai
--                                        EXISTS(... and enabled), sehingga
--                                        "tidak ada baris" = false = tertutup
-- FUNGSI GERBANG
--   CATALOG_FN / CATALOG_FN_SECDEF          1 / 1
--   CATALOG_FN_EXEC_ANON / _AUTHENTICATED   1 / 1  ← WAJIB 1 (LESSONS #26:
--                                        kalau 0, SELECT ke katalog ERROR,
--                                        bukan sekadar 0 baris)
-- BUCKET FOTO
--   PHOTO_BUCKET                   1
--   PHOTO_BUCKET_PUBLIC            true ← WAJIB true (keputusan §7). Kalau
--                                        false, seluruh grid katalog akan
--                                        menampilkan gambar rusak sampai
--                                        signed URL dibuatkan.
--   PHOTO_BUCKET_LIMIT             5242880
--   PHOTO_BUCKET_MIME              3    ← jpeg, png, webp (TANPA pdf)
--   PHOTO_POLICIES                 4    ← read, insert, update, delete
--   PHOTO_WRITE_ADMIN_ONLY         3    ← ketiga policy tulis menyebut fn_is_admin
-- BUCKET LAMA TIDAK IKUT BERUBAH
--   LOGO_BUCKET_PUBLIC             true  ← 0003 tidak tersentuh
--   LOGO_POLICIES                  4
--   INVOICE_BUCKET_PUBLIC          false ← 0009 tidak tersentuh
--   INVOICE_POLICIES               4
-- AUDIT
--   AUDIT_PRODUCT                  1   ← fn_audit_row mengenal awalan PRODUCT
--   AUDIT_CATALOG_ACCESS           1   ← dan awalan CATALOG_ACCESS
--   AUDIT_KEEP_0004                1   ← pemetaan created_via_* milik 0004 utuh
--   AUDIT_KEEP_0005                1   ← ORDER_CANCELLED milik 0005 utuh
--   AUDIT_KEEP_0008_PKG            1   ← awalan PACKAGE milik 0008 utuh
--   AUDIT_KEEP_0008_PHONE          1   ← CUSTOMER_PHONE_CHANGED milik 0008 utuh
--   AUDIT_KEEP_0008_ATTR           1   ← ORDER_ATTRIBUTION_CORRECTED utuh
--   AUDIT_KEEP_0009_ARRIVED        1   ← ORDER_CUSTOMER_ARRIVED milik 0009 utuh
--   AUDIT_KEEP_0009_NOTE           1   ← awalan ORDER_INTERNAL_NOTE milik 0009 utuh
--
-- Angka blok verifikasi berkas LAMA yang BERUBAH setelah 0010 — ini normal,
-- daftar lengkapnya ada di migrations/README.md:
--   0001: RLS_ENABLED 14 → 16 · POLICIES 31 → 35
-- (0001 TRIGGERS tetap 23: penyaringnya `partner%`, dan kedua tabel baru tidak
--  berawalan itu. 0003 STORAGE_POLICIES tetap 4 dan 0009 INVOICE_POLICIES tetap
--  4: keduanya menyaring per nama policy.)
-- Angka "WAJIB 0" milik berkas lama TIDAK BOLEH berubah satu pun. Kalau ada yang
-- tidak cocok, JANGAN anggap beres: laporkan apa adanya.

select 'PRODUCT_TABLE' as check_type,
       count(*)::text as result
from information_schema.tables
where table_schema = 'public' and table_name = 'sanci_products'
union all
select 'PRODUCT_NO_PARTNER_COLUMN', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'sanci_products'
  and column_name = 'partner_id'
union all
select 'PRODUCT_STOCK_CHECK', count(*)::text
from pg_constraint
where conrelid = 'public.sanci_products'::regclass and contype = 'c'
  and pg_get_constraintdef(oid) like '%stock_status%'
union all
select 'PRODUCT_STOCK_VALUES', count(*)::text
from pg_constraint
where conrelid = 'public.sanci_products'::regclass and contype = 'c'
  and pg_get_constraintdef(oid) like '%AVAILABLE%'
  and pg_get_constraintdef(oid) like '%LIMITED%'
  and pg_get_constraintdef(oid) like '%OUT_OF_STOCK%'
union all
select 'PRODUCT_STATUS_CHECK', count(*)::text
from pg_constraint
where conrelid = 'public.sanci_products'::regclass and contype = 'c'
  and pg_get_constraintdef(oid) like '%ACTIVE%'
  and pg_get_constraintdef(oid) like '%INACTIVE%'
union all
select 'PRODUCT_CODE_UNIQUE_PARTIAL', count(*)::text
from pg_indexes
where schemaname = 'public' and tablename = 'sanci_products'
  and indexname = 'sanci_products_code_key'
  and indexdef like '%UNIQUE%' and indexdef like '%code IS NOT NULL%'
union all
select 'PRODUCT_CODE_NOT_BLANK', count(*)::text
from pg_constraint
where conrelid = 'public.sanci_products'::regclass and contype = 'c'
  and conname = 'sanci_products_code_not_blank'
union all
select 'PRODUCT_NO_PRICE_COLUMN', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'sanci_products'
  and (column_name like '%price%' or column_name like '%harga%'
       or column_name like '%discount%' or column_name like '%diskon%')
union all
select 'PRODUCT_NO_STOCK_QTY_COLUMN', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'sanci_products'
  and (column_name like '%qty%' or column_name like '%quantity%'
       or column_name like '%stock_count%' or column_name like '%stok_jumlah%')
union all
select 'PRODUCT_IDEMPOTENCY_KEY', count(*)::text
from pg_indexes
where schemaname = 'public' and tablename = 'sanci_products'
  and indexname = 'sanci_products_client_request_id_key'
union all
select 'PRODUCT_RLS', count(*)::text
from pg_tables
where schemaname = 'public' and tablename = 'sanci_products' and rowsecurity
union all
select 'PRODUCT_POLICIES', count(*)::text
from pg_policies where schemaname = 'public' and tablename = 'sanci_products'
union all
select 'PRODUCT_PARTNER_WRITE_POLICIES', count(*)::text
from pg_policies
where schemaname = 'public' and tablename = 'sanci_products'
  and cmd in ('INSERT','UPDATE','DELETE','ALL')
  and coalesce(qual, '') || ' ' || coalesce(with_check, '') not like '%fn_is_admin%'
union all
select 'PRODUCT_READ_GATED', count(*)::text
from pg_policies
where schemaname = 'public' and tablename = 'sanci_products'
  and policyname = 'sp_partner_read'
  and qual like '%ACTIVE%' and qual like '%fn_catalog_enabled%'
union all
select 'PRODUCT_TRIGGERS', count(*)::text
from pg_trigger tg join pg_class cl on cl.oid = tg.tgrelid
join pg_namespace ns on ns.oid = cl.relnamespace
where not tg.tgisinternal and ns.nspname = 'public' and cl.relname = 'sanci_products'
union all
select 'ACCESS_TABLE', count(*)::text
from information_schema.tables
where table_schema = 'public' and table_name = 'sanci_catalog_access'
union all
select 'ACCESS_PK_PARTNER', count(*)::text
from pg_constraint
where conrelid = 'public.sanci_catalog_access'::regclass and contype = 'p'
  and pg_get_constraintdef(oid) like '%partner_id%'
union all
select 'ACCESS_FK_CASCADE', count(*)::text
from pg_constraint
where conrelid = 'public.sanci_catalog_access'::regclass and contype = 'f'
  and confdeltype = 'c'
union all
select 'ACCESS_RLS', count(*)::text
from pg_tables
where schemaname = 'public' and tablename = 'sanci_catalog_access' and rowsecurity
union all
select 'ACCESS_POLICIES', count(*)::text
from pg_policies where schemaname = 'public' and tablename = 'sanci_catalog_access'
union all
select 'ACCESS_PARTNER_WRITE_POLICIES', count(*)::text
from pg_policies
where schemaname = 'public' and tablename = 'sanci_catalog_access'
  and cmd in ('INSERT','UPDATE','DELETE','ALL')
  and coalesce(qual, '') || ' ' || coalesce(with_check, '') not like '%fn_is_admin%'
union all
select 'ACCESS_TRIGGERS', count(*)::text
from pg_trigger tg join pg_class cl on cl.oid = tg.tgrelid
join pg_namespace ns on ns.oid = cl.relnamespace
where not tg.tgisinternal and ns.nspname = 'public' and cl.relname = 'sanci_catalog_access'
union all
select 'ACCESS_NO_ROW_MEANS_CLOSED', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_catalog_enabled'
  and p.prosrc like '%exists%' and p.prosrc like '%enabled%'
union all
select 'CATALOG_FN', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_catalog_enabled'
union all
select 'CATALOG_FN_SECDEF', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_catalog_enabled' and p.prosecdef
union all
select 'CATALOG_FN_EXEC_ANON',
       coalesce((select (has_function_privilege('anon', 'public.fn_catalog_enabled()', 'execute'))::int::text
                 from pg_roles where rolname = 'anon'), '0')
union all
select 'CATALOG_FN_EXEC_AUTHENTICATED',
       coalesce((select (has_function_privilege('authenticated', 'public.fn_catalog_enabled()', 'execute'))::int::text
                 from pg_roles where rolname = 'authenticated'), '0')
union all
select 'PHOTO_BUCKET', count(*)::text
from storage.buckets where id = 'product-photos'
union all
select 'PHOTO_BUCKET_PUBLIC',
       coalesce((select public::text from storage.buckets where id = 'product-photos'), 'TIDAK ADA')
union all
select 'PHOTO_BUCKET_LIMIT',
       coalesce((select file_size_limit::text from storage.buckets where id = 'product-photos'), 'TIDAK ADA')
union all
select 'PHOTO_BUCKET_MIME',
       coalesce((select array_length(allowed_mime_types, 1)::text
                 from storage.buckets where id = 'product-photos'), 'TIDAK ADA')
union all
select 'PHOTO_POLICIES', count(*)::text
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname like 'product_photos_%'
union all
select 'PHOTO_WRITE_ADMIN_ONLY', count(*)::text
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname like 'product_photos_admin_%'
  and coalesce(qual, '') || ' ' || coalesce(with_check, '') like '%fn_is_admin%'
union all
select 'LOGO_BUCKET_PUBLIC',
       coalesce((select public::text from storage.buckets where id = 'partner-logos'), 'TIDAK ADA')
union all
select 'LOGO_POLICIES', count(*)::text
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname like 'partner_logos_%'
union all
select 'INVOICE_BUCKET_PUBLIC',
       coalesce((select public::text from storage.buckets where id = 'order-invoices'), 'TIDAK ADA')
union all
select 'INVOICE_POLICIES', count(*)::text
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname like 'order_invoices_%'
union all
select 'AUDIT_PRODUCT', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row'
  and p.prosrc like '%sanci_products%'
union all
select 'AUDIT_CATALOG_ACCESS', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row'
  and p.prosrc like '%CATALOG_ACCESS%'
union all
select 'AUDIT_KEEP_0004', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row'
  and p.prosrc like '%created_via_partner_id%'
union all
select 'AUDIT_KEEP_0005', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row'
  and p.prosrc like '%ORDER_CANCELLED%'
union all
select 'AUDIT_KEEP_0008_PKG', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row'
  and p.prosrc like '%partner_packages%'
union all
select 'AUDIT_KEEP_0008_PHONE', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row'
  and p.prosrc like '%CUSTOMER_PHONE_CHANGED%'
union all
select 'AUDIT_KEEP_0008_ATTR', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row'
  and p.prosrc like '%ORDER_ATTRIBUTION_CORRECTED%'
union all
select 'AUDIT_KEEP_0009_ARRIVED', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row'
  and p.prosrc like '%ORDER_CUSTOMER_ARRIVED%'
union all
select 'AUDIT_KEEP_0009_NOTE', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row'
  and p.prosrc like '%order_internal_notes%';
