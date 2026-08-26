-- ============================================================
-- SANCI Partner Hub — Phase 2 irisan keenam belas
-- Migration 0021: Daftar Harga Partner (harga dasar SANCI + override per
--                 partner) — tabel BARU `product_prices`
--                 (idempotent — aman dijalankan ulang)
-- Jalankan di: Supabase Studio → SQL Editor → paste seluruh file → Run
--
-- PRASYARAT: 0001 → … → 0020 sudah dijalankan, DALAM URUTAN ITU. Blok
-- pengaman di bawah berhenti dengan pesan jelas kalau belum. Setelah file
-- ini, rantai penuhnya menjadi 0001 → … → 0020 → 0021
-- (lihat migrations/README.md — ATURAN BESI).
--
-- ============================================================
-- LATAR BELAKANG BISNIS (owner 2026-08-26, verbatim)
-- ============================================================
--
-- 「每家店不同價格——按 Partner 設價目表，但是依照sanci為主，分店可以編輯，
--  先好好的規劃 不要把其他的搞掉」
--
-- Model harga (satu kalimat): SANCI memelihara HARGA DASAR per produk
-- ("Harga Dasar SANCI" — baris `partner_id IS NULL`); setiap Partner boleh
-- MENIMPA harga produk mana pun dengan harga jualnya sendiri ("Harga
-- Normal" — baris `partner_id` terisi). Urutan pengambilan harga di
-- aplikasi: override Partner → harga dasar SANCI → tidak ada (perilaku
-- lama: ketik manual). Harga hasil lookup ini SELALU prefill yang bisa
-- diubah di tempat — daftar harga adalah NILAI AWAL, bukan kunci.
--
-- Keputusan owner yang sudah DIPUTUSKAN (bagian "Owner 已定案" rencana):
--   A. Layar admin "lihat override semua partner": v1 TIDAK dibuat
--      (audit_logs tetap mencatat semuanya — bisa diperiksa dari sana).
--   B. Harga dasar SANCI mengikuti gerbang katalog `fn_catalog_enabled()`:
--      partner yang katalognya BELUM dibuka membaca NOL baris, termasuk
--      baris harga dasar (fail-closed, konsisten 0010).
--   C. Nama halaman sisi cabang: "Harga Normal" (harga jual normal toko ke
--      pelanggan, sebelum diskon) — GLOSSARY: Harga Normal / Normal
--      price / 标准售价. Harga dasar disebut "Harga Dasar SANCI".
--
-- ============================================================
-- HUBUNGAN DENGAN ATURAN "KATALOG TANPA HARGA" (0010) — PENTING
-- ============================================================
--
-- 0010 menetapkan `sanci_products` TANPA kolom harga (asersi negatif
-- PRODUCT_NO_PRICE_COLUMN = 0). Irisan ini TIDAK mengubah itu SATU KOLOM
-- PUN: harga hidup di tabel TERPISAH `product_prices`, dan layar
-- jelajah katalog (/cabang/produk, grid /admin/produk) TETAP tanpa harga.
-- Harga hanya muncul di KONTEKS PENETAPAN HARGA: kalkulator (prefill),
-- picker Isi Pesanan (prefill), halaman "Harga Normal" cabang, dan modal
-- Ubah Produk admin (kolom Harga Dasar SANCI). Blok verifikasi di bawah
-- MENGULANG asersi PRODUCT_NO_PRICE_COLUMN = 0 milik 0010, dengan query
-- yang PERSIS sama.
--
-- "Penawaran SANCI" (order_sanci_offers, 0013) TIDAK tersentuh — itu nilai
-- penawaran TINGKAT PESANAN yang diputus manual, bukan harga produk.
-- Rantai diskon 0015, guard harga 0014, Package, dokumen 0016: nol sentuhan.
--
-- ============================================================
-- APA YANG DIBUKA IRISAN INI (dan hanya ini)
-- ============================================================
--   product_prices → tabel BARU. Satu baris = satu harga untuk satu produk:
--     * partner_id IS NULL  = harga dasar SANCI (hanya admin yang menulis);
--     * partner_id terisi   = harga jual normal partner itu (ditulis oleh
--       pengguna partner mana pun milik partner itu — owner tidak meminta
--       flag izin baru; kalau kelak perlu dibatasi per akun, itu flag
--       tersendiri).
--   fn_price_stamp() → fungsi trigger BARU: updated_at/updated_by DIPAKSA
--     server (LESSONS #11 — jam HP tidak dipercaya; nilai kiriman client
--     untuk kedua kolom ini selalu ditimpa).
--   fn_audit_row → didefinisikan ULANG (ATURAN BESI): salinan UTUH versi
--     0018 + SATU baris pemetaan 'product_prices' → 'PRODUCT_PRICE'.
--
-- YANG SENGAJA TIDAK DIBUKA:
--   * Kolom harga di sanci_products (lihat atas — asersi 0010 diulang).
--   * Partner menulis baris harga dasar (partner_id NULL) — hanya admin;
--     ditegakkan struktur policy DAN diuji perilaku (test-harness
--     90_behavior_0021.sql).
--   * Partner melihat/menulis override partner LAIN — RLS baris.
--   * Harga di layar jelajah katalog — keputusan tampilan, dijaga dengan
--     tidak mengirim kolom harga ke layar itu sama sekali.
--   * Riwayat harga / masa berlaku / mata uang lain — di luar cakupan;
--     jejak perubahan ada di audit_logs (PRODUCT_PRICE_*).
-- ============================================================

-- ── 0. Pengaman prasyarat ───────────────────────────────────
-- Pola 0020: berhenti dengan kalimat yang bisa ditindaklanjuti, bukan error
-- Postgres di tengah jalan.

do $$
begin
  if to_regprocedure('public.fn_is_admin()') is null
     or to_regprocedure('public.fn_pu_partner()') is null
     or to_regprocedure('public.fn_catalog_enabled()') is null
     or to_regprocedure('public.fn_audit_row()') is null
     or to_regclass('public.partners') is null
     or to_regclass('public.sanci_products') is null then
    raise exception
      'Fungsi/tabel dasar (fn_is_admin / fn_pu_partner / fn_catalog_enabled / fn_audit_row / partners / sanci_products) belum lengkap. Jalankan 0001 → … → 0020 dulu, baru 0021.';
  end if;

  -- Penanda 0018/0019/0020: OBJEK ketiga berkas itu harus sudah ada —
  -- sengaja memeriksa KEBERADAAN tabel/kolom (pola 0010 §0), BUKAN "apakah
  -- fn_audit_row yang aktif masih memuat CUSTOMER_SOURCE": versi aktif itu
  -- justru yang HILANG kalau berkas lama baru saja dijalankan ulang, dan
  -- pada keadaan itu menjalankan 0021 adalah LANGKAH PEMULIHANNYA (§7
  -- memuat seluruh perilaku 0018) — guard yang memeriksa versi aktif akan
  -- mengunci pintu pemulihannya sendiri (diuji langsung sebelum diperbaiki:
  -- rerun 0001 → 0021 tertolak oleh guard versi-aktif). Kalau tabel 0018
  -- belum pernah ada sama sekali, §7 akan memasang pemetaan
  -- CUSTOMER_SOURCE/SALES_STAFF lebih dulu daripada tabelnya sendiri —
  -- terlihat benar, padahal setengah jadi. Lebih baik berhenti di sini.
  if to_regclass('public.customer_sources') is null
     or to_regclass('public.sanci_sales_staff') is null
     or to_regclass('public.partner_customer_counters') is null
     or not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'partner_orders'
         and column_name = 'customer_po') then
    raise exception
      'Migration 0018/0019/0020 belum dijalankan di database ini. Jalankan 0001 → … → 0020 dulu, baru 0021.';
  end if;
end;
$$;

-- ── 1. product_prices: harga dasar SANCI + override per partner ──

-- Kenapa SATU tabel untuk dua macam baris (dasar + override), bukan dua
-- tabel: keduanya menjawab pertanyaan yang sama ("harga produk X berapa?")
-- dengan aturan pengalahan yang jelas (override menang), dan urutan
-- pengambilannya adalah SATU merge dua-query di aplikasi. Dua tabel akan
-- menggandakan RLS, trigger, audit, dan constraint tanpa menambah makna.
--
-- FK product_id ON DELETE CASCADE: baris harga menempel pada produknya —
-- produk yang benar-benar lenyap tidak menyisakan harga yatim. Ini BUKAN
-- pelanggaran LESSONS #4 (master data pakai deactivate): sanci_products
-- sendiri tidak pernah dihapus dalam pemakaian normal (status
-- ACTIVE/INACTIVE, 0010), cascade ini jaring pengaman; dan baris harga
-- BUKAN data historis — jejak historisnya justru di audit_logs (yang
-- sengaja tanpa FK). Alasan yang sama persis dengan sanci_catalog_access
-- (0010 §2), kelas benda yang sama: "pengaturan yang menempel", bukan
-- "riwayat".
--
-- FK partner_id ON DELETE CASCADE, nullable: NULL = harga dasar SANCI
-- (milik SANCI sendiri — NULL di sini BERARTI sesuatu, bukan kealpaan);
-- terisi = override milik partner itu. Cascade dengan alasan
-- sanci_catalog_access di atas.
--
-- price BIGINT rupiah bulat, CHECK >= 0 — mengikuti konvensi
-- order_items.unit_price (0014): tidak ada sen, tidak ada angka negatif.
-- Harga 0 SAH (produk gratis/promosi) dan BERBEDA dari "tidak ada baris"
-- (tidak ada harga). Aplikasi menuliskan "hapus baris" untuk "tidak ada
-- harga", bukan price = 0.
--
-- updated_at/updated_by: DIPAKSA fn_price_stamp() (§3) pada INSERT dan
-- UPDATE — nilai kiriman client selalu ditimpa (LESSONS #11). Tanpa
-- created_at/created_by: yang menarik dari baris harga adalah "terakhir
-- diubah kapan oleh siapa", dan riwayat penuhnya (termasuk pembuatan) ada
-- di audit_logs — alasan yang sama dengan sanci_catalog_access (0010 §2).
--
-- TANPA client_request_id: penulisan harga adalah UPSERT bertarget
-- (product_id, partner_id) — kunci alamiahnya SUDAH idempotent (kiriman
-- ulang jaringan lemah menimpa baris yang sama dengan nilai yang sama,
-- bukan membuat baris kedua — LESSONS #3 dipenuhi unique constraint §2).
create table if not exists public.product_prices (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.sanci_products(id) on delete cascade,
  partner_id uuid references public.partners(id) on delete cascade,
  price      bigint not null check (price >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- ── 2. Keunikan: satu harga per (produk, partner) + satu harga dasar ──

-- UNIQUE (product_id, partner_id): satu partner tidak mungkin punya dua
-- override untuk produk yang sama — dan constraint ini yang membuat upsert
-- `on_conflict=product_id,partner_id` dari PostgREST bekerja untuk baris
-- override (partner_id TERISI). Untuk baris dasar constraint ini TIDAK
-- menangkap duplikat (NULL ≠ NULL dalam unique biasa) — itu tugas index
-- parsial di bawah.
do $$
begin
  if not exists (select 1 from pg_constraint
                 where conname = 'product_prices_product_partner_key'
                   and conrelid = 'public.product_prices'::regclass) then
    alter table public.product_prices
      add constraint product_prices_product_partner_key unique (product_id, partner_id);
  end if;
end;
$$;

-- Index parsial UNIQUE (product_id) WHERE partner_id IS NULL: paku untuk
-- baris harga dasar — satu produk maksimal SATU harga dasar. Tanpa ini,
-- dua baris dasar untuk produk yang sama bisa hidup berdampingan dan
-- lookup "harga dasar produk X" jadi ambigu diam-diam.
--
-- ⚠ CATATAN UPSERT (dipelajari dari desain, bukan kejadian): PostgREST
-- `on_conflict` TIDAK bisa menyebut predikat index parsial, jadi upsert
-- baris DASAR lewat `on_conflict=product_id` GAGAL inference. Server
-- Action admin karenanya menulis baris dasar dengan UPDATE-dulu-INSERT
-- (index parsial ini tetap penjaga terakhirnya: INSERT kedua yang kalah
-- balapan mendapat 23505 dan pulih lewat UPDATE ulang — LESSONS #3:
-- constraint-nya yang jadi pertahanan, bukan urutan cek).
create unique index if not exists product_prices_base_key
  on public.product_prices (product_id) where partner_id is null;

-- Lookup halaman Harga Normal & merge efektif menyaring product_id IN (…)
-- + partner_id — keduanya tercakup constraint/index unik di atas, tidak
-- perlu index tambahan.

-- ── 3. fn_price_stamp(): updated_at/updated_by dipaksa server ──

-- BEFORE INSERT OR UPDATE — menimpa APA PUN yang dikirim client untuk
-- kedua kolom ini (LESSONS #11: server timestamp; LESSONS #6: identitas
-- dari auth.uid(), bukan dari body request). BUKAN security definer:
-- tidak membaca tabel lain sama sekali.
--
-- LESSONS #37 diperiksa: satu-satunya CHECK di tabel ini adalah
-- price >= 0, dan fungsi ini TIDAK menyentuh new.price — tidak ada CHECK
-- (di tabel ini maupun tabel lain) yang berubah perilaku karenanya.
-- Tidak ada BEFORE trigger baru di tabel LAMA mana pun.
create or replace function public.fn_price_stamp() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

-- LESSONS #26: fungsi trigger = permukaan EXECUTE tertutup sejak lahir
-- (pola fn_next_customer_seq 0019 — tidak menunggu retrofit 0007).
revoke all on function public.fn_price_stamp() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.fn_price_stamp() from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.fn_price_stamp() from authenticated';
  end if;
end;
$$;

-- ── 4. Trigger ──────────────────────────────────────────────

drop trigger if exists trg_price_stamp on public.product_prices;
create trigger trg_price_stamp before insert or update on public.product_prices
  for each row execute function public.fn_price_stamp();

-- Audit dipasang untuk ketiga operasi walau policy tulisnya sempit — jalur
-- service_role/pemilik tabel melewati RLS, dan satu-satunya yang akan tahu
-- adalah baris audit ini (alasan 0009 §4 / 0010 §4).
drop trigger if exists trg_audit on public.product_prices;
create trigger trg_audit after insert or update or delete on public.product_prices
  for each row execute function public.fn_audit_row();

-- SENGAJA TANPA trg_touch (fn_price_stamp sudah memaksa updated_at, satu
-- fungsi satu tanggung jawab lebih sedikit trigger) dan TANPA
-- trg_set_created_by (tabel ini tidak punya kolom created_by, §1).

-- ── 5. RLS ──────────────────────────────────────────────────

alter table public.product_prices enable row level security;

-- Admin: kelola penuh — termasuk satu-satunya jalur tulis baris dasar.
drop policy if exists pp_admin_all on public.product_prices;
create policy pp_admin_all on public.product_prices
  for all using (public.fn_is_admin()) with check (public.fn_is_admin());

-- Pengguna partner MEMBACA: baris dasar (partner_id IS NULL — titik awal
-- yang dibagikan SANCI, keputusan owner B) + override partnernya sendiri,
-- KEDUANYA di belakang gerbang katalog fn_catalog_enabled() — katalog
-- belum dibuka = NOL baris, harga dasar termasuk (fail-closed, 0010).
--
-- LESSONS #25 dipatuhi: syarat baris memakai KOLOM BARIS ITU SENDIRI
-- (partner_id) dibandingkan dengan security definer fn_pu_partner()
-- (membaca partner_users, BUKAN product_prices); fn_catalog_enabled()
-- membaca sanci_catalog_access (tabel LAIN, security definer, LESSONS
-- #15). TIDAK ADA subquery balik ke product_prices — INSERT…RETURNING
-- dari supabase-js aman (baris baru tidak perlu "ditemukan").
drop policy if exists pp_partner_read on public.product_prices;
create policy pp_partner_read on public.product_prices
  for select using (
    public.fn_catalog_enabled()
    and (partner_id is null or partner_id = public.fn_pu_partner())
  );

-- Pengguna partner MENULIS: HANYA baris partnernya sendiri, dan hanya
-- selagi katalognya terbuka (gerbang yang sama dengan baca — halaman
-- Harga Normal memang tidak bisa dipakai sebelum katalog dibuka).
--
-- Baris dasar otomatis TIDAK bisa ditulis partner: `partner_id =
-- fn_pu_partner()` untuk partner_id NULL bernilai NULL (bukan true) —
-- WITH CHECK menolak. Diuji perilaku di 90_behavior_0021.sql, bukan
-- cuma dibaca dari teks policy.
--
-- "分店可以編輯" = SEMUA akun partner itu boleh (owner tidak meminta
-- pemisahan per cabang/per flag — dicatat sebagai batas sadar).
drop policy if exists pp_partner_insert on public.product_prices;
create policy pp_partner_insert on public.product_prices
  for insert with check (
    partner_id = public.fn_pu_partner() and public.fn_catalog_enabled()
  );

drop policy if exists pp_partner_update on public.product_prices;
create policy pp_partner_update on public.product_prices
  for update using (
    partner_id = public.fn_pu_partner() and public.fn_catalog_enabled()
  ) with check (
    partner_id = public.fn_pu_partner() and public.fn_catalog_enabled()
  );

-- DELETE = tombol "kembali ke harga SANCI" (hapus override → lookup jatuh
-- kembali ke baris dasar). Diizinkan untuk baris sendiri.
drop policy if exists pp_partner_delete on public.product_prices;
create policy pp_partner_delete on public.product_prices
  for delete using (
    partner_id = public.fn_pu_partner() and public.fn_catalog_enabled()
  );

-- ── 6. Permukaan EXECUTE (LESSONS #26) — tidak ada yang baru dibuka ──

-- Ketiga fungsi yang dipakai policy di atas (fn_is_admin, fn_pu_partner,
-- fn_catalog_enabled) SUDAH ter-grant ke anon+authenticated sejak
-- 0001/0007/0010 (POLICY_HELPER_EXEC = 10, CATALOG_FN_EXEC_* = 1) dan
-- `CREATE OR REPLACE` tidak pernah mencabutnya. Fungsi BARU satu-satunya
-- (fn_price_stamp) adalah fungsi trigger dan justru DITUTUP di §3.
-- Tidak ada RPC baru.

-- ── 7. fn_audit_row: didefinisikan ULANG untuk PRODUCT_PRICE ──

-- Definisi ulang UTUH (bukan tambalan) — ATURAN BESI migrations/README.md.
-- Versi yang disalin adalah versi 0018, berkas TERAKHIR yang mendefinisikan
-- ulang fungsi ini (0019 dan 0020 SENGAJA tidak menyentuhnya — dikonfirmasi
-- lewat AUDIT_STILL_0018_* di blok verifikasi keduanya, dan lewat baris
-- ATURAN BESI 0019/0020 di migrations/README.md). SELURUH perilaku
-- 0004+0005+0008+0009+0010+0012+0013+0014+0016+0018 dipertahankan kata
-- demi kata.
--
-- Yang bertambah HANYA SATU baris pemetaan nama entitas:
--   'product_prices' → 'PRODUCT_PRICE'
-- (di-diff langsung terhadap 0018 §8 saat berkas ini ditulis — satu-satunya
-- perbedaan adalah baris itu.)
--
-- product_prices adalah entitas top-level SEDERHANA — TIDAK butuh blok
-- pencarian partner lewat tabel lain: kolom partner_id ada LANGSUNG di
-- barisnya, dan coalesce v_partner yang sudah ada sejak 0001 mengambilnya
-- sendiri. Konsekuensi yang DISENGAJA: baris audit harga OVERRIDE membawa
-- partner_id (tampil di layar Aktivitas yang disaring per partner — baik
-- saat pelakunya pengguna partner MAUPUN admin), sedangkan baris audit
-- harga DASAR ber-partner_id NULL (harga milik SANCI sendiri, bukan milik
-- partner mana pun — pola sanci_products 0010: jangan "diperbaiki" dengan
-- menebak partner). Siapa PELAKUNYA tetap terbaca di actor_user_id/
-- actor_role. branch_id selalu NULL (harga per partner, bukan per cabang).
-- Aksi yang akan muncul (tabel tanpa kolom status → hanya jalur generik):
--   PRODUCT_PRICE_CREATED / PRODUCT_PRICE_UPDATED / PRODUCT_PRICE_DELETED
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
-- 0013/0014/0016/0018 SETELAH file ini: definisi ini akan tertimpa dan
-- pemetaan PRODUCT_PRICE hilang diam-diam (layar Aktivitas menampilkan kode
-- mentah 'PRODUCT_PRICES_CREATED'). Jalankan ulang 0021 untuk memulihkannya
-- (lihat migrations/README.md — baris ATURAN BESI 0021). Sebaliknya, karena
-- versi ini memuat SELURUH perilaku pendahulunya, menjalankan 0021 paling
-- akhir juga MEMULIHKAN pemetaan yang sempat tertimpa berkas lama.

-- ── 8. Verifikasi (hasilnya di-copy balik ke Claude) ────────
-- Angka yang diharapkan — cocokkan SATU PER SATU. "Run tanpa tulisan merah"
-- bukan bukti (LESSONS #7 & #16).
--
-- TABEL HARGA
--   PRICE_TABLE                       1
--   PRICE_PRODUCT_FK_CASCADE          1   ← FK ke sanci_products ON DELETE CASCADE
--   PRICE_PARTNER_FK_CASCADE          1   ← FK ke partners ON DELETE CASCADE
--   PRICE_PARTNER_NULLABLE            1   ← WAJIB 1: NULL = harga dasar SANCI
--   PRICE_TYPE_BIGINT                 1   ← rupiah bulat, konvensi unit_price 0014
--   PRICE_NONNEG_CHECK                1   ← CHECK price >= 0
--   PRICE_UNIQUE_PAIR                 1   ← unique (product_id, partner_id)
--   PRICE_BASE_UNIQUE_PARTIAL         1   ← unique (product_id) where partner_id is null
--   PRICE_NO_REQUEST_ID               0   ← WAJIB 0: idempotency lewat kunci
--                                           alamiah (upsert), bukan client_request_id
-- RLS
--   PRICE_RLS                         1
--   PRICE_POLICIES                    5   ← pp_admin_all + pp_partner_read/insert/update/delete
--   PRICE_PARTNER_WRITE_SELF_GATED    3   ← WAJIB 3: ketiga policy tulis partner
--                                           menyebut fn_pu_partner DAN fn_catalog_enabled
--   PRICE_BASE_NONADMIN_WRITE         0   ← WAJIB 0 (asersi negatif inti): tidak
--                                           ada policy tulis yang bisa benar tanpa
--                                           fn_is_admin MAUPUN tanpa mengikat
--                                           partner_id = fn_pu_partner() — baris
--                                           dasar (NULL) hanya bisa ditulis admin
--   PRICE_READ_GATED                  1   ← policy baca partner menyebut
--                                           fn_catalog_enabled DAN fn_pu_partner
--                                           sekaligus (keputusan owner B)
-- TRIGGER + FUNGSI
--   PRICE_TRIGGERS                    2   ← trg_price_stamp + trg_audit
--   STAMP_FN                          1
--   STAMP_FN_EXEC_PUBLIC              0   ← LESSONS #26
--   STAMP_FN_EXEC_ANON                0
--   STAMP_FN_EXEC_AUTHENTICATED       0
-- ATURAN 0010 DIULANG (query PERSIS sama dengan blok verifikasi 0010)
--   PRODUCT_NO_PRICE_COLUMN           0   ← WAJIB 0: sanci_products TETAP tanpa
--                                           kolom harga apa pun — 0021 tidak
--                                           menyentuh tabel itu satu kolom pun
-- AUDIT
--   AUDIT_PRODUCT_PRICE               1   ← fn_audit_row mengenal awalan PRODUCT_PRICE
--   AUDIT_KEEP_0018_SOURCE            1   ← awalan CUSTOMER_SOURCE milik 0018 utuh
--   AUDIT_KEEP_0018_SALES             1   ← awalan SALES_STAFF milik 0018 utuh
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
-- Sembilan belas angka AUDIT_*/REFS_CHECK_CUSTOMER = daftar 0018 utuh
-- (18 baris) + SATU baru (AUDIT_PRODUCT_PRICE) — bukti langsung fn_audit_row
-- versi ini sungguh salinan penuh 0018 plus satu pemetaan, bukan sesuatu
-- yang lain. Bukti PERILAKU (harga tercatat dengan before/after, override
-- partner A tak terlihat partner B, baris dasar ditolak dari cabang, dst.)
-- ada di supabase/test-harness/90_behavior_0021.sql — bukan di blok ini,
-- karena butuh baris partner/produk UJI yang tidak boleh mengotori data
-- produksi (alasan yang sama dengan 0019).

select 'PRICE_TABLE' as check_type,
       count(*)::text as result
from information_schema.tables
where table_schema = 'public' and table_name = 'product_prices'
union all
select 'PRICE_PRODUCT_FK_CASCADE', count(*)::text
from pg_constraint
where conrelid = 'public.product_prices'::regclass and contype = 'f'
  and confrelid = 'public.sanci_products'::regclass and confdeltype = 'c'
union all
select 'PRICE_PARTNER_FK_CASCADE', count(*)::text
from pg_constraint
where conrelid = 'public.product_prices'::regclass and contype = 'f'
  and confrelid = 'public.partners'::regclass and confdeltype = 'c'
union all
select 'PRICE_PARTNER_NULLABLE', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'product_prices'
  and column_name = 'partner_id' and is_nullable = 'YES'
union all
select 'PRICE_TYPE_BIGINT', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'product_prices'
  and column_name = 'price' and data_type = 'bigint'
union all
select 'PRICE_NONNEG_CHECK', count(*)::text
from pg_constraint
where conrelid = 'public.product_prices'::regclass and contype = 'c'
  and pg_get_constraintdef(oid) like '%price%' and pg_get_constraintdef(oid) like '%>= 0%'
union all
select 'PRICE_UNIQUE_PAIR', count(*)::text
from pg_constraint
where conrelid = 'public.product_prices'::regclass and contype = 'u'
  and conname = 'product_prices_product_partner_key'
union all
select 'PRICE_BASE_UNIQUE_PARTIAL', count(*)::text
from pg_indexes
where schemaname = 'public' and tablename = 'product_prices'
  and indexname = 'product_prices_base_key'
  and indexdef like '%UNIQUE%' and indexdef like '%partner_id IS NULL%'
union all
select 'PRICE_NO_REQUEST_ID', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'product_prices'
  and column_name = 'client_request_id'
union all
select 'PRICE_RLS', count(*)::text
from pg_tables
where schemaname = 'public' and tablename = 'product_prices' and rowsecurity
union all
select 'PRICE_POLICIES', count(*)::text
from pg_policies where schemaname = 'public' and tablename = 'product_prices'
union all
select 'PRICE_PARTNER_WRITE_SELF_GATED', count(*)::text
from pg_policies
where schemaname = 'public' and tablename = 'product_prices'
  and cmd in ('INSERT','UPDATE','DELETE')
  and coalesce(qual, '') || ' ' || coalesce(with_check, '') like '%fn_pu_partner%'
  and coalesce(qual, '') || ' ' || coalesce(with_check, '') like '%fn_catalog_enabled%'
union all
select 'PRICE_BASE_NONADMIN_WRITE', count(*)::text
from pg_policies
where schemaname = 'public' and tablename = 'product_prices'
  and cmd in ('INSERT','UPDATE','DELETE','ALL')
  and coalesce(qual, '') || ' ' || coalesce(with_check, '') not like '%fn_is_admin%'
  and coalesce(qual, '') || ' ' || coalesce(with_check, '') not like '%fn_pu_partner%'
union all
select 'PRICE_READ_GATED', count(*)::text
from pg_policies
where schemaname = 'public' and tablename = 'product_prices'
  and policyname = 'pp_partner_read'
  and qual like '%fn_catalog_enabled%' and qual like '%fn_pu_partner%'
union all
select 'PRICE_TRIGGERS', count(*)::text
from pg_trigger tg join pg_class cl on cl.oid = tg.tgrelid
join pg_namespace ns on ns.oid = cl.relnamespace
where not tg.tgisinternal and ns.nspname = 'public' and cl.relname = 'product_prices'
union all
select 'STAMP_FN', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_price_stamp'
union all
select 'STAMP_FN_EXEC_PUBLIC',
       (has_function_privilege('public', 'public.fn_price_stamp()', 'execute'))::int::text
union all
select 'STAMP_FN_EXEC_ANON',
       coalesce((select (has_function_privilege('anon', 'public.fn_price_stamp()', 'execute'))::int::text
                 from pg_roles where rolname = 'anon'), '0')
union all
select 'STAMP_FN_EXEC_AUTHENTICATED',
       coalesce((select (has_function_privilege('authenticated', 'public.fn_price_stamp()', 'execute'))::int::text
                 from pg_roles where rolname = 'authenticated'), '0')
union all
select 'PRODUCT_NO_PRICE_COLUMN', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'sanci_products'
  and (column_name like '%price%' or column_name like '%harga%'
       or column_name like '%discount%' or column_name like '%diskon%')
union all
select 'AUDIT_PRODUCT_PRICE', count(*)::text
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
