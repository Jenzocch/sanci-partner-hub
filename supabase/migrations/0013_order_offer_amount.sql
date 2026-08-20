-- ============================================================
-- SANCI Partner Hub — Phase 2 irisan ketujuh
-- Migration 0013: nilai penawaran SANCI per pesanan (khusus admin)
--                 (idempotent — aman dijalankan ulang)
-- Jalankan di: Supabase Studio → SQL Editor → paste seluruh file → Run
--
-- PRASYARAT: 0001 → 0003 → 0004 → 0005 → 0006 → 0007 → 0008 → 0009 → 0010 →
-- 0011 → 0012 sudah dijalankan, DALAM URUTAN ITU. Blok pengaman di bawah
-- berhenti dengan pesan jelas kalau belum. Setelah berkas ini, rantai penuhnya
-- menjadi 0001 → 0003 → 0004 → 0005 → 0006 → 0007 → 0008 → 0009 → 0010 →
-- 0011 → 0012 → 0013 (lihat migrations/README.md — ATURAN BESI).
--
-- ============================================================
-- LATAR BELAKANG BISNIS (ditetapkan Jenzo, 2026-08-19)
-- ============================================================
--
-- Sejak 0009, cabang melaporkan BERAPA yang dibelanjakan pelanggan di tokonya
-- (`partner_orders.partner_purchase_amount`) dan mengunggah foto invoice-nya.
-- SANCI lalu menilai SECARA MANUAL penawaran apa yang pantas diberikan kepada
-- pelanggan itu — hari ini keputusannya disampaikan lewat WhatsApp, dan kalau
-- sempat ditulis, ia hidup sebagai KALIMAT di `order_internal_notes`
-- ("Invoice 2,5jt → kasih diskon 10% + free ongkir").
--
-- Masalahnya: sebuah ANGKA yang disimpan sebagai kalimat tidak bisa dijumlah,
-- tidak bisa dibandingkan, tidak bisa dicari, dan tidak bisa dikirim ke lembar
-- Google Sheets tanpa seseorang membacanya satu per satu. Berkas ini memberi
-- angka itu tempatnya sendiri: satu kolom bertipe angka, satu baris per
-- pesanan.
--
-- KEPUTUSAN OWNER YANG MENENTUKAN BENTUKNYA: "Admin 填，先只有 SANCI 看得到" —
-- admin yang mengisi, dan untuk sekarang HANYA SANCI yang boleh melihatnya.
-- Kata "untuk sekarang" itulah yang menentukan desainnya (lihat §1).
--
-- ============================================================
-- KENAPA TABEL TERPISAH, BUKAN KOLOM DI partner_orders
-- ============================================================
--
-- Ini bagian terpenting berkas ini. Menambahkan `sanci_offer_amount` sebagai
-- kolom di `partner_orders` akan terlihat jauh lebih sederhana — dan akan
-- BOCOR, tanpa satu pun pesan error.
--
-- Alasannya: RLS Postgres bekerja pada tingkat BARIS, bukan kolom. Baris
-- `partner_orders` sudah boleh dibaca pengguna cabang lewat policy
-- `o_partner_read` (0004). Begitu sebuah kolom hidup di baris itu, siapa pun
-- yang boleh membaca barisnya boleh membaca kolomnya — cukup dengan menulis
-- `?select=*` di PostgREST, tanpa menyentuh aplikasi kita sama sekali.
-- Menyembunyikannya di layar hanya kosmetik (LESSONS #5): "buka devtools dan
-- panggil API-nya langsung" membatalkannya dalam satu langkah.
--
-- Jadi bentuknya persis meniru `order_internal_notes` (0009): tabel TERPISAH
-- yang tidak punya satu pun policy untuk pengguna cabang. "Tanpa policy" pada
-- tabel ber-RLS bukan sekadar tersembunyi — tertutup.
--
-- Bonus dari bentuk ini, dan ini yang membuat kata "untuk sekarang" di atas
-- bisa dipenuhi: kalau suatu hari Jenzo memutuskan partner BOLEH melihat
-- angkanya, yang perlu ditulis hanyalah SATU policy SELECT baru di tabel ini.
-- Tidak ada kolom yang pindah, tidak ada data yang dimigrasi, tidak ada baris
-- lama yang perlu disentuh. Itu keputusan sadar, bukan kebetulan.
--
-- ============================================================
-- APA YANG DIBUKA IRISAN INI (dan hanya ini)
-- ============================================================
--   order_sanci_offers → tabel BARU. Satu baris = nilai penawaran SANCI untuk
--                        SATU pesanan. HANYA admin SANCI, baca maupun tulis.
--                        Cabang tidak punya satu pun policy, SELECT sekalipun.
--
-- YANG SENGAJA TIDAK DIBUKA:
--   * Visibilitas partner/cabang atas angka ini — belum, dan kalau kelak
--     dibuka, caranya adalah menambah satu policy SELECT di sini (lihat §4).
--   * Harga di dalam katalog produk. Batas "tanpa harga" milik 0010 TETAP
--     berlaku penuh dan berkas ini TIDAK melanggarnya: yang disimpan di sini
--     adalah nilai kesepakatan untuk SATU pesanan konkret yang diputuskan
--     manusia, BUKAN harga sebuah produk. `sanci_products` tetap tidak punya
--     dan tidak boleh punya kolom harga.
--   * Perhitungan apa pun. Basis data ini TIDAK menghitung diskon, TIDAK
--     memvalidasi angka terhadap `partner_purchase_amount`, dan TIDAK punya
--     aturan penetapan harga (batas tegas yang sama dengan 0009). Angka ini
--     diketik manusia dan artinya diputuskan manusia.
--   * Riwayat penawaran sebagai daftar. Tabel ini menyimpan nilai YANG
--     BERLAKU, satu per pesanan (lihat §1). Riwayat perubahannya tetap ada —
--     lengkap dengan nilai lama, nilai baru, siapa, dan kapan — tapi tempatnya
--     `audit_logs` (§2), bukan baris kedua di tabel ini.
-- ============================================================

-- ── 0. Pengaman prasyarat ───────────────────────────────────

-- Berhenti dengan kalimat yang menyebutkan berkas mana yang harus dijalankan
-- lebih dulu jauh lebih baik daripada melempar "relation does not exist" milik
-- Postgres kepada orang yang menempelkan SQL ini di Supabase Studio
-- (LESSONS #16).
do $$
begin
  if to_regclass('public.partner_orders') is null then
    raise exception
      'Migration 0004_customer_order.sql belum dijalankan di database ini. Jalankan 0001 → 0003 → 0004 → 0005 → 0006 → 0007 → 0008 → 0009 → 0010 → 0011 → 0012 dulu, baru 0013.';
  end if;

  -- §2 mendefinisikan ULANG fn_audit_row dari versi 0012. Kalau 0012 belum
  -- pernah dijalankan, versi yang ditulis di sini tetap benar (ia memuat
  -- SELURUH perilaku 0004+0005+0008+0009+0010+0012), tapi tabel
  -- partner_package_items-nya sendiri belum ada — dan itu tanda rantainya
  -- memang belum lengkap, jadi lebih baik berhenti dan katakan.
  if to_regclass('public.partner_package_items') is null then
    raise exception
      'Migration 0012_package_product_components.sql belum dijalankan di database ini. Jalankan 0001 → … → 0012 dulu, baru 0013.';
  end if;

  -- Ketiga trigger di §3 memakai fungsi milik 0001/0004. Tanpa salah satunya,
  -- tabel ini akan lahir tanpa audit / tanpa created_by dan tidak ada yang tahu.
  if to_regprocedure('public.fn_audit_row()') is null
     or to_regprocedure('public.fn_touch_updated_at()') is null
     or to_regprocedure('public.fn_set_created_by()') is null then
    raise exception
      'Fungsi trigger dasar (fn_audit_row / fn_touch_updated_at / fn_set_created_by) belum ada. Jalankan 0001 → … → 0012 dulu, baru 0013.';
  end if;

  -- fn_is_admin() adalah SATU-SATUNYA yang menutup tabel ini (§4). Kalau ia
  -- tidak ada, policy di §4 gagal dibuat dan tabelnya lahir ber-RLS tanpa
  -- policy sama sekali — tertutup untuk semua orang, termasuk admin. Lebih
  -- baik berhenti di sini daripada menghasilkan fitur yang "tersimpan tapi
  -- tidak pernah terbaca".
  if to_regprocedure('public.fn_is_admin()') is null then
    raise exception
      'Fungsi public.fn_is_admin() belum ada. Jalankan 0001_partner_foundation.sql dulu.';
  end if;
end;
$$;

-- ── 1. Tabel order_sanci_offers ─────────────────────────────

-- order_id sebagai PRIMARY KEY, BUKAN kolom `id` tersendiri. Ini menyatakan
-- satu hal dengan tegas: nilai penawaran adalah SIFAT sebuah pesanan, bukan
-- catatan kejadian. Satu pesanan tidak mungkin punya dua nilai penawaran yang
-- sama-sama berlaku, jadi bentuk tabelnya jangan mengizinkannya. Bandingkan
-- dengan order_internal_notes (0009) yang justru KEBALIKANNYA: di sana setiap
-- baris adalah satu catatan pada satu momen, dan banyak baris per pesanan
-- memang yang diinginkan.
--
-- Konsekuensi langsung yang memang diincar: menuliskan nilai penawaran adalah
-- upsert idempoten (`on conflict (order_id) do update`). Kiriman ulang di
-- jaringan lemah tidak pernah menghasilkan baris kedua (LESSONS #3) — bentuk
-- tabelnyalah yang menjaminnya, bukan kehati-hatian penulis Server Action.
--
-- KARENA ITU TABEL INI SENGAJA TIDAK PUNYA client_request_id, dan itu BUKAN
-- kelalaian. Alasannya sama persis dengan sanci_catalog_access (0010 §2):
-- kolom idempotency dibutuhkan waktu "mengirim dua kali" bisa menghasilkan dua
-- BARIS. Di tabel yang di-upsert dengan kunci alami, mengirim nilai yang sama
-- dua kali menghasilkan baris yang sama persis — idempoten dengan sendirinya.
-- Menambahkan client_request_id justru akan menambah unique constraint kedua,
-- dan dengan itu menambah satu kelas kesalahan 23505 yang harus dibedakan
-- (LESSONS #21/#27) demi masalah yang tidak ada.
--
-- ON DELETE RESTRICT (LESSONS #4): pesanan yang sudah punya nilai penawaran
-- tidak boleh lenyap dan membawa angkanya diam-diam. Praktisnya ini nyaris
-- teoretis — pesanan TIDAK PERNAH dihapus keras di sistem ini (status
-- CANCELLED, bukan DELETE) — tapi RESTRICT adalah semantik yang benar dan
-- sekaligus gaya yang sudah dipakai order_internal_notes (0009).
--
-- amount numeric(15,2), SAMA PERSIS dengan partner_orders.partner_purchase_amount
-- (0009). Disamakan dengan sengaja, dan tipenya DIUKUR dari 0009 bukan ditebak:
-- kedua angka ini muncul berdampingan di layar yang sama, dibaca formatIDR()
-- yang sama, dan diketik lewat parseIDRInput() yang sama. Kalau salah satunya
-- bigint dan yang lain numeric, batas atasnya berbeda dan suatu hari akan ada
-- satu nilai yang diterima di satu kolom lalu ditolak di kolom sebelahnya
-- dengan kode mentah 22003. Batas praktisnya ikut sama: paling besar
-- Rp 9.999.999.999.999 (catatan yang sama dengan 0009 — parseIDRInput() masih
-- menerima sampai Rp 99.999.999.999.999, jadi Server Action WAJIB memeriksa
-- batas ini sendiri supaya pengguna tidak pernah melihat 22003).
--
-- CHECK (amount >= 0) saja, TANPA batas atas dan TANPA aturan bisnis lain —
-- batas tegas 0009 berlaku penuh di sini. Yang dicegah hanya hal yang jelas
-- mustahil, yaitu penawaran negatif.
--
-- amount NOT NULL, dan itu keputusan: "SANCI memutuskan tidak memberi
-- penawaran" TIDAK ditulis sebagai amount = null, dan juga BUKAN amount = 0.
-- Ia ditulis dengan MENGHAPUS barisnya. Nol adalah sebuah tawaran senilai nol
-- rupiah; tidak adanya baris berarti belum/tidak ada tawaran. Dua keadaan yang
-- berbeda harus punya bentuk yang berbeda (semangat yang sama dengan
-- `quantity > 0` di 0012: nol bukan "tidak ada").
create table if not exists public.order_sanci_offers (
  order_id   uuid primary key references public.partner_orders(id) on delete restrict,
  amount     numeric(15,2) not null check (amount >= 0),
  created_by uuid,                    -- auth.uid(), dipaksa trigger 0004
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- SENGAJA TANPA indeks tambahan: order_id adalah PRIMARY KEY, jadi pertanyaan
-- satu-satunya yang ditanyakan tabel ini ("berapa penawaran untuk pesanan
-- ini") sudah dilayani indeks unik bawaan PK. Tidak ada pertanyaan lain yang
-- perlu dilayani hari ini — dan indeks yang tidak pernah dipakai tetap harus
-- dirawat setiap kali baris ditulis.

-- ── 2. Audit: awalan ORDER_OFFER ────────────────────────────

-- Definisi ulang UTUH fn_audit_row (bukan tambalan) — ATURAN BESI
-- migrations/README.md. Versi yang disalin adalah versi 0012, yaitu berkas
-- TERAKHIR yang mendefinisikan ulang fungsi ini. SELURUH perilaku
-- 0004 + 0005 + 0008 + 0009 + 0010 + 0012 dipertahankan kata demi kata.
--
-- Yang bertambah hanya DUA hal:
--   1. awalan 'ORDER_OFFER' untuk tabel order_sanci_offers. Tabel ini TIDAK
--      punya kolom `status`, jadi cabang generik yang sudah ada menghasilkan
--      ORDER_OFFER_CREATED / _UPDATED / _DELETED dengan sendirinya — tidak ada
--      cabang CASE baru yang perlu ditulis. Tanpa pemetaan ini, cabang `else`
--      akan menghasilkan 'ORDER_SANCI_OFFERS_CREATED' — kode mentah yang akan
--      tampil apa adanya di layar Aktivitas karena web/lib/audit-format.ts
--      tidak punya labelnya.
--   2. tabel ini IKUT ke dalam blok pencarian partner/branch milik
--      order_internal_notes (blok di bawah v_branch). Keduanya mencari lewat
--      kolom yang bernama SAMA (`order_id`) di tabel induk yang sama
--      (partner_orders), jadi satu `if tg_table_name in (…)` melayani
--      keduanya — bukan blok kedua yang menyalin ekspresi yang sama.
--
-- partner_id DAN branch_id, KEDUANYA diisi — beda dari partner_package_items
-- (0012) yang sengaja membiarkan branch_id null. Alasannya: sebuah Package
-- adalah benda tingkat PARTNER, sedangkan sebuah penawaran melekat pada satu
-- PESANAN, dan setiap pesanan lahir di satu cabang yang jelas. Mengisi
-- keduanya membuat kejadian ini muncul di layar Aktivitas Partner MAUPUN
-- Aktivitas Cabang (keduanya khusus admin), yang memang tempatnya.
--
-- Yang perlu diketahui pembaca baris auditnya: `entity_id` akan NULL untuk
-- tabel ini. Fungsi ini mengambilnya dari kolom `id` lalu `partner_id`, dan
-- order_sanci_offers tidak punya keduanya (kunci barisnya adalah `order_id`).
-- Itu bukan kehilangan informasi — `before`/`after` memuat order_id lengkap —
-- tapi jangan menulis layar yang menganggap entity_id selalu terisi.
--
-- Pasangannya di lapisan tampilan (web/lib/audit-format.ts, LESSONS #28):
-- `amount` ikut ke dalam JSON `after`, dan tanpa perlakuan khusus ia akan
-- tampil sebagai angka mentah "1500000.00" kepada pembaca non-teknis. Ia HARUS
-- dirender lewat formatIDR() di sana, persis seperti partner_purchase_amount.
-- Begitu juga `order_id`: UUID relasi, WAJIB masuk daftar SKIP.
--
-- CATATAN untuk yang menjalankan ulang 0001/0004/0005/0008/0009/0010/0012
-- SETELAH berkas ini: definisi ini akan tertimpa dan awalan ORDER_OFFER hilang
-- diam-diam — layar Aktivitas akan menampilkan ORDER_SANCI_OFFERS_CREATED apa
-- adanya, DAN baris auditnya kehilangan partner_id/branch_id sehingga
-- menghilang dari layar Aktivitas yang disaring per partner/cabang (bentuk
-- kerusakan yang sama persis pernah diukur untuk order_internal_notes di 0009
-- dan partner_package_items di 0012). Jalankan ulang 0013 untuk memulihkannya
-- (migrations/README.md).
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

  -- order_internal_notes dan order_sanci_offers tidak punya kolom
  -- partner_id/branch_id sendiri; tanpa blok ini barisnya masuk audit dengan
  -- partner kosong dan hilang dari layar Aktivitas yang disaring per partner.
  -- Keduanya ditangani SATU blok karena kolom penunjuknya bernama sama
  -- (`order_id`) dan menunjuk tabel yang sama — di order_sanci_offers kolom
  -- itu kebetulan juga PRIMARY KEY-nya, tapi ekspresi pencariannya identik.
  -- Aman dibaca di sini karena fungsi ini security definer (RLS partner_orders
  -- dilewati) — dan tidak menambah kebocoran apa pun, sebab audit_logs hanya
  -- bisa dibaca admin (al_admin_read, 0001), yaitu satu-satunya pihak yang
  -- boleh melihat kedua tabel itu juga.
  if tg_table_name in ('order_internal_notes','order_sanci_offers') then
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

-- ── 3. Trigger order_sanci_offers ───────────────────────────

-- Ketiganya meniru order_internal_notes (0009 §4) dan partner_package_items
-- (0012 §3): audit setiap perubahan, updated_at yang tidak bisa dibohongi
-- client (LESSONS #11), created_by yang diisi server dari auth.uid() dan bukan
-- dari nilai kiriman (LESSONS #6).
--
-- Audit dipasang untuk INSERT/UPDATE/DELETE — dan di tabel ini ketiganya
-- memang bisa terjadi lewat UI (isi, ubah, hapus). Selain itu service_role
-- (Edge Function, skrip pemeliharaan) dan pemilik tabel MELEWATI RLS
-- sepenuhnya; kalau suatu hari angka penawaran diubah lewat jalur itu,
-- satu-satunya yang akan tahu adalah baris audit ini.
--
-- trg_touch ADA di sini (beda dari order_internal_notes yang sengaja tidak
-- punya): tabel ini memang punya updated_at, karena barisnya memang berubah —
-- itu justru inti bentuk upsert-nya.
drop trigger if exists trg_audit on public.order_sanci_offers;
create trigger trg_audit after insert or update or delete on public.order_sanci_offers
  for each row execute function public.fn_audit_row();

drop trigger if exists trg_touch on public.order_sanci_offers;
create trigger trg_touch before update on public.order_sanci_offers
  for each row execute function public.fn_touch_updated_at();

drop trigger if exists trg_set_created_by on public.order_sanci_offers;
create trigger trg_set_created_by before insert on public.order_sanci_offers
  for each row execute function public.fn_set_created_by();

-- ── 4. RLS order_sanci_offers (admin saja) ──────────────────

alter table public.order_sanci_offers enable row level security;

-- SATU policy, `for all`, dan itu DISENGAJA berbeda dari order_internal_notes
-- (0009) yang justru memecahnya menjadi dua policy sempit supaya admin pun
-- tidak bisa UPDATE/DELETE. Bedanya nyata dan bukan gaya:
--   * Catatan internal adalah CATATAN PADA SATU MOMEN. Menyuntingnya berarti
--     riwayat penilaian SANCI bisa dirapikan setelah kejadian — persis yang
--     tidak boleh terjadi pada bahan sengketa dengan partner.
--   * Nilai penawaran adalah NILAI YANG BERLAKU SEKARANG. Ia memang berubah
--     (salah ketik, negosiasi ulang), dan "SANCI akhirnya tidak memberi
--     penawaran" harus bisa dinyatakan — itu DELETE. Melarang keduanya akan
--     memaksa angka yang salah hidup selamanya.
-- Yang menjaga riwayatnya tetap utuh bukan larangan menulis, melainkan
-- audit_logs: setiap UPDATE mencatat nilai lama DAN nilai baru, setiap DELETE
-- mencatat nilai terakhirnya, keduanya beserta pelaku dan waktu server (§2).
--
-- LESSONS #25: policy ini TIDAK memeriksa apa pun tentang barisnya sendiri —
-- fn_is_admin() menjawab dari platform_admins, bukan dari order_sanci_offers.
-- Jadi `insert ... returning` dan `upsert ... returning` (yang dipakai
-- supabase-js `.upsert().select()`) aman: baris baru tidak perlu "ditemukan"
-- untuk lolos RETURNING. Dibuktikan tes perilaku, bukan diasumsikan.
drop policy if exists oso_admin_all on public.order_sanci_offers;
create policy oso_admin_all on public.order_sanci_offers
  for all using (public.fn_is_admin()) with check (public.fn_is_admin());

-- TIDAK ADA policy lain. Untuk SIAPA PUN selain admin SANCI, termasuk SELECT.
-- Inilah keseluruhan isolasi irisan ini: sebuah pengguna cabang yang membuka
-- pesanannya sendiri lewat API mendapat NOL baris dari tabel ini, bukan baris
-- yang disembunyikan layar. Kalau suatu hari Jenzo memutuskan partner boleh
-- melihat angkanya, yang ditambahkan adalah policy SELECT baru di sini
-- (kepemilikan dinilai lewat partner_orders, bukan dengan membaca ulang tabel
-- ini sendiri — LESSONS #25) dan blok verifikasi §5 di bawah harus ikut
-- diperbarui, karena OFFER_NONADMIN_POLICIES sengaja dibuat gagal kalau ada
-- policy yang bisa bernilai benar tanpa fn_is_admin().

-- ── 5. Verifikasi (hasilnya di-copy balik ke Claude) ────────
-- Harapan:
--   OFFER_TABLE                  1   ← tabel order_sanci_offers ada
--   OFFER_PK_ORDER_ID            1   ← PRIMARY KEY-nya adalah (order_id), bukan kolom id
--   OFFER_NO_ID_COLUMN           0   ← WAJIB 0: tidak ada kolom `id` tersendiri
--   OFFER_NO_CLIENT_REQUEST_ID   0   ← WAJIB 0: sengaja tanpa idempotency key (§1)
--   OFFER_FK_RESTRICT            1   ← WAJIB 1: FK ke partner_orders ber-ON DELETE RESTRICT ('r')
--   OFFER_FK_NOT_CASCADE         0   ← WAJIB 0: dan BUKAN cascade ('c')
--   OFFER_AMOUNT_CHECK           1   ← check (amount >= 0) terpasang
--   OFFER_AMOUNT_NOT_NULL        1   ← WAJIB 1: "tidak ada penawaran" = tidak ada baris,
--                                      bukan amount null (§1)
--   OFFER_AMOUNT_TYPE            numeric(15,2) ← sama persis dengan partner_purchase_amount
--   OFFER_RLS                    1   ← RLS aktif
--   OFFER_POLICIES               1   ← hanya oso_admin_all
--   OFFER_NONADMIN_POLICIES      0   ← WAJIB 0: TIDAK ADA policy yang bisa bernilai benar
--                                      tanpa fn_is_admin() → cabang nol akses, SELECT
--                                      sekalipun. INI inti irisan ini.
--   OFFER_TRIGGERS               3   ← audit, touch, set_created_by
--   AUDIT_ORDER_OFFER            1   ← fn_audit_row mengenal awalan ORDER_OFFER
--   AUDIT_ORDER_OFFER_LOOKUP     1   ← dan mencari partner/branch lewat pesanannya
--   AUDIT_KEEP_0012_PKG_ITEM     1   ← awalan PACKAGE_ITEM milik 0012 masih utuh
--   AUDIT_KEEP_0012_PKG_LOOKUP   1   ← pencarian partner lewat paket induk milik 0012 utuh
--   AUDIT_KEEP_0010_PRODUCT      1   ← awalan PRODUCT milik 0010 masih utuh
--   AUDIT_KEEP_0010_CATALOG      1   ← awalan CATALOG_ACCESS milik 0010 masih utuh
--   AUDIT_KEEP_0009_ARRIVED      1   ← ORDER_CUSTOMER_ARRIVED milik 0009 masih utuh
--   AUDIT_KEEP_0009_NOTE         1   ← ORDER_INTERNAL_NOTE milik 0009 masih utuh
--   AUDIT_KEEP_0008_PKG          1   ← awalan PACKAGE milik 0008 masih utuh
--   AUDIT_KEEP_0008_PHONE        1   ← CUSTOMER_PHONE_CHANGED milik 0008 masih utuh
--   AUDIT_KEEP_0008_ATTR         1   ← ORDER_ATTRIBUTION_CORRECTED milik 0008 masih utuh
--   AUDIT_KEEP_0005              1   ← ORDER_CANCELLED milik 0005 masih utuh
--   AUDIT_KEEP_0004              1   ← pemetaan created_via_* milik 0004 masih utuh
--   REFS_CHECK_CUSTOMER          1   ← WAJIB 1: lubang P2 milik 0011 masih tertutup
--
-- Sebelas angka AUDIT_KEEP_* dan REFS_CHECK_CUSTOMER adalah REGRESI, bukan
-- fitur baru: berkas ini mendefinisikan ulang fn_audit_row secara utuh, dan
-- proyek ini sudah pernah kehilangan awalan lama persis dengan cara itu. Kalau
-- salah satunya 0, JANGAN teruskan — berarti versi yang tertulis di §2 bukan
-- salinan lengkap versi 0012. REFS_CHECK_CUSTOMER ikut diperiksa karena ia
-- satu-satunya bukti lubang tanpa gejala milik 0011 (migrations/README.md),
-- dan berkas ini adalah berkas terakhir dalam rantai.
--
-- Angka blok verifikasi berkas LAMA setelah 0013 — SUDAH DIUKUR di Postgres 16
-- lokal dengan menjalankan ulang blok verifikasinya, bukan diperkirakan:
--   0001: RLS_ENABLED 17 → **18** · POLICIES 37 → **38** · TRIGGERS **tetap 27**
--         (`TRIGGERS` di 0001 hanya menghitung tabel berawalan `partner%`;
--          `order_sanci_offers` berawalan `order_`, jadi ketiga trigger-nya
--          TIDAK ikut terhitung — persis seperti order_internal_notes, dan
--          BEDA dari partner_package_items milik 0012 yang ikut terhitung)
--   0004: TABLES/RLS_ENABLED/POLICIES/TRIGGERS/INDEXES/FUNCTIONS/AUDIT_MAP
--         **semuanya tetap** (blok 0004 hanya menghitung customers /
--         partner_orders / partner_order_counters)
--   0005: ORDER_TRIGGERS **tetap 9** · ORDER_POLICIES **tetap 4** ·
--         ORDER_DELETE_POLICY **tetap 0**
--   0009: SELURUH angkanya **tetap**, termasuk ORDER_TRIGGERS 9,
--         NOTES_POLICIES 2, NOTES_NON_ADMIN_POLICIES 0 dan NOTES_TRIGGERS 2 —
--         0013 tidak menyentuh partner_orders maupun order_internal_notes
--   0010 / 0011 / 0012: SELURUH angkanya **tetap**
-- Kalau ada yang tidak cocok, JANGAN anggap beres: laporkan apa adanya
-- (LESSONS #7 & #16).

select 'OFFER_TABLE' as check_type,
       count(*)::text as result
from information_schema.tables
where table_schema = 'public' and table_name = 'order_sanci_offers'
union all
select 'OFFER_PK_ORDER_ID', count(*)::text
from pg_constraint
where conrelid = 'public.order_sanci_offers'::regclass and contype = 'p'
  and pg_get_constraintdef(oid) like '%(order_id)%'
union all
select 'OFFER_NO_ID_COLUMN', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'order_sanci_offers'
  and column_name = 'id'
union all
select 'OFFER_NO_CLIENT_REQUEST_ID', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'order_sanci_offers'
  and column_name = 'client_request_id'
union all
select 'OFFER_FK_RESTRICT', count(*)::text
from pg_constraint
where conrelid = 'public.order_sanci_offers'::regclass and contype = 'f'
  and confrelid = 'public.partner_orders'::regclass and confdeltype = 'r'
union all
select 'OFFER_FK_NOT_CASCADE', count(*)::text
from pg_constraint
where conrelid = 'public.order_sanci_offers'::regclass and contype = 'f'
  and confrelid = 'public.partner_orders'::regclass and confdeltype = 'c'
union all
select 'OFFER_AMOUNT_CHECK', count(*)::text
from pg_constraint
where conrelid = 'public.order_sanci_offers'::regclass and contype = 'c'
  and pg_get_constraintdef(oid) like '%amount%'
  and pg_get_constraintdef(oid) like '%>= (0)%'
union all
select 'OFFER_AMOUNT_NOT_NULL', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'order_sanci_offers'
  and column_name = 'amount' and is_nullable = 'NO'
union all
select 'OFFER_AMOUNT_TYPE',
       coalesce((select data_type || '(' || numeric_precision || ',' || numeric_scale || ')'
                 from information_schema.columns
                 where table_schema = 'public' and table_name = 'order_sanci_offers'
                   and column_name = 'amount'), 'TIDAK ADA')
union all
select 'OFFER_RLS', count(*)::text
from pg_tables
where schemaname = 'public' and tablename = 'order_sanci_offers' and rowsecurity
union all
select 'OFFER_POLICIES', count(*)::text
from pg_policies where schemaname = 'public' and tablename = 'order_sanci_offers'
union all
select 'OFFER_NONADMIN_POLICIES', count(*)::text
from pg_policies
where schemaname = 'public' and tablename = 'order_sanci_offers'
  and coalesce(qual, '') || ' ' || coalesce(with_check, '') not like '%fn_is_admin%'
union all
select 'OFFER_TRIGGERS', count(*)::text
from pg_trigger tg join pg_class cl on cl.oid = tg.tgrelid
join pg_namespace ns on ns.oid = cl.relnamespace
where not tg.tgisinternal and ns.nspname = 'public' and cl.relname = 'order_sanci_offers'
union all
select 'AUDIT_ORDER_OFFER', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%''ORDER_OFFER''%'
union all
select 'AUDIT_ORDER_OFFER_LOOKUP', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row'
  and p.prosrc like '%''order_internal_notes'',''order_sanci_offers''%'
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
