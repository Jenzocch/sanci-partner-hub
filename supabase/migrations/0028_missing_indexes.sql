-- ============================================================
-- SANCI Partner Hub — Phase 2 irisan kedua puluh tiga
-- Migration 0028: Index yang hilang di audit_logs/customers/
--                 partner_staff_assignments (idempotent — aman dijalankan
--                 ulang, dan aman dijalankan dalam urutan APA PUN relatif
--                 terhadap migrasi lain — lihat §0 kenapa)
-- Jalankan di: Supabase Studio → SQL Editor → paste seluruh file → Run
--
-- PRASYARAT: 0001 → … → 0027 sudah dijalankan, DALAM URUTAN ITU (supaya
-- tabel/kolom yang di-index di bawah benar-benar ada). Blok pengaman §0
-- berhenti dengan pesan jelas kalau belum.
--
-- BERKAS INI ATOMIK: seluruhnya DDL + query verifikasi baca-saja, tanpa
-- `commit;` di tengah. Gagal di mana pun = tidak ada yang berubah.
--
-- ============================================================
-- LATAR BELAKANG (audit kecepatan/beban 2026-09-06)
-- ============================================================
--
-- Tiga tabel dipakai lewat kolom yang TIDAK punya index sama sekali selain
-- primary key:
--
--   audit_logs — TABEL DENGAN FREKUENSI TULIS TERTINGGI DI SELURUH SISTEM
--     (fn_audit_row dipanggil trigger AFTER INSERT/UPDATE/DELETE di 15+
--     tabel). Layar Aktivitas admin membaca tabel ini difilter
--     partner_id/branch_id/entity_type+entity_id/created_at — hari ini
--     (data masih kecil) full-scan tidak terasa; begitu baris bertambah
--     jadi puluhan/ratusan ribu, setiap buka layar Aktivitas akan memindai
--     seluruh tabel.
--
--   customers.created_via_partner_id / created_via_branch_id — dipakai
--     policy RLS c_partner_read (0007) lewat fn_can_view_branch(
--     created_via_branch_id): SETIAP query daftar pelanggan dari sisi
--     cabang menyaring baris lewat kolom ini. Tanpa index, PostgreSQL harus
--     scan seluruh tabel customers untuk tiap query, walau hasilnya cuma
--     beberapa baris milik satu cabang.
--
--   partner_staff_assignments.branch_id — dipakai policy RLS a_partner_read
--     (0001) lewat fn_can_view_branch(branch_id): "siapa saja staf aktif di
--     cabang ini" scan seluruh tabel tanpa index ini.
--
-- Ketiganya BUKAN darurat sekarang (volume data masih kecil — lihat §2,
-- angka SEBELUM index dicatat di sana supaya efeknya bisa dibandingkan
-- kalau kelak diukur lagi). Menambahnya sekarang, waktu tabelnya masih
-- kecil, jauh lebih murah daripada menambahnya nanti waktu sudah besar dan
-- terasa lambat — CREATE INDEX biasa (bukan CONCURRENTLY, lihat §1) mengunci
-- tulisan ke tabel selama index dibangun; pada tabel kecil itu terasa
-- instan, pada tabel besar bisa berarti downtime tulis yang nyata.
--
-- ============================================================
-- YANG DIBUKA IRISAN INI (dan hanya ini)
-- ============================================================
--   4 index baru, NOL perubahan skema/kolom/policy/trigger/fungsi.
--
-- YANG SENGAJA TIDAK DIBUKA:
--   * TIDAK memakai CREATE INDEX CONCURRENTLY. Itu WAJIB dijalankan LUAR
--     blok transaksi (Postgres menolaknya di dalam satu), dan pola
--     "paste seluruh file ke SQL Editor → Run" di seluruh migrations/
--     folder ini berjalan sebagai satu blok. Pada volume data hari ini
--     (§2) bedanya tidak terasa; kalau berkas ini dijalankan ulang di masa
--     depan pada tabel yang sudah besar, jalankan keempat pernyataan
--     CREATE INDEX ini SATU PER SATU secara terpisah dengan CONCURRENTLY
--     sebagai gantinya — bukan tempel seluruh berkas ini.
--   * Berkas ini TIDAK bergantung pada dan TIDAK terpengaruh ATURAN BESI
--     (rantai CREATE OR REPLACE di migrations/README.md). Index bukan
--     fungsi/policy — tidak ada "definisi yang bisa tertimpa oleh urutan
--     jalan". §0 tetap memeriksa prasyarat supaya kolom yang di-index pasti
--     ada, tapi berkas ini aman dijalankan ulang dalam urutan apa pun
--     relatif terhadap migrasi lain, tidak seperti berkas yang mendefinisi
--     ulang fn_audit_row/fn_check_order_refs/dst.
-- ============================================================

-- ── 0. Pengaman prasyarat ────────────────────────────────────
do $$
begin
  if to_regprocedure('public.fn_is_admin()') is null
     or to_regprocedure('public.fn_audit_row()') is null
     or to_regclass('public.audit_logs') is null
     or to_regclass('public.customers') is null
     or to_regclass('public.partner_staff_assignments') is null then
    raise exception
      'Fondasi dasar (fn_is_admin / fn_audit_row / audit_logs / customers / partner_staff_assignments) belum lengkap. Jalankan 0001 → … → 0027 dulu, baru 0028.';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'customers'
      and column_name = 'created_via_branch_id'
  ) then
    raise exception
      'Kolom customers.created_via_branch_id belum ada. Jalankan 0004 dulu, baru 0028.';
  end if;
end;
$$;

-- ── 1. Index ──────────────────────────────────────────────────
--
-- Semua `if not exists`: aman dijalankan ulang, dan tidak menimpa apa pun
-- kalau index dengan nama sama sudah pernah dibuat manual.

-- audit_logs: layar Aktivitas menyaring PERSIS empat kolom ini bersamaan
-- (partner_id/branch_id untuk ruang lingkup, entity_type+entity_id untuk
-- "riwayat satu baris ini", created_at untuk urutan waktu) — satu index
-- gabungan yang urutan kolomnya mencerminkan filter yang paling sering
-- dipakai dulu (ruang lingkup), diakhiri created_at supaya "urutkan
-- terbaru dulu" ikut terlayani index yang sama tanpa sort terpisah.
create index if not exists idx_audit_logs_scope_time
  on public.audit_logs (partner_id, branch_id, created_at desc);

create index if not exists idx_audit_logs_entity
  on public.audit_logs (entity_type, entity_id);

-- customers: satu index gabungan mencerminkan cara fn_can_view_branch
-- dipakai policy c_partner_read (0007) — branch_id adalah kolom yang
-- benar-benar disaring; partner_id ikut serta karena beberapa layar
-- (mis. daftar pelanggan per-partner admin) menyaring di tingkat partner,
-- bukan cabang.
create index if not exists idx_customers_created_via
  on public.customers (created_via_partner_id, created_via_branch_id);

-- partner_staff_assignments: dipakai policy a_partner_read/a_partner_update
-- (0001) lewat fn_can_view_branch(branch_id)/fn_can_edit_branch(branch_id).
create index if not exists idx_staff_assignments_branch
  on public.partner_staff_assignments (branch_id);

-- ── 2. Verifikasi — STRUKTUR (hasilnya di-copy balik) ────────
-- Angka yang diharapkan — cocokkan SATU PER SATU. "Run tanpa tulisan merah"
-- BUKAN bukti (LESSONS #7 & #16).
--
--   AUDIT_LOGS_SCOPE_INDEX      1   ← index gabungan partner/branch/waktu ada
--   AUDIT_LOGS_ENTITY_INDEX     1   ← index entity_type+entity_id ada
--   CUSTOMERS_CREATED_VIA_INDEX 1   ← index created_via_* ada
--   STAFF_ASSIGNMENTS_BRANCH_INDEX 1 ← index branch_id ada
--   AUDIT_LOGS_ROWCOUNT         (baris berapa SEKARANG — catat angka ini;
--                                bandingkan kalau nanti ukur ulang apakah
--                                index ini masih relevan atau perlu diganti
--                                seiring skema query berubah)
--   CUSTOMERS_ROWCOUNT          (sama, untuk customers)
--   STAFF_ASSIGNMENTS_ROWCOUNT  (sama, untuk partner_staff_assignments)
select 'AUDIT_LOGS_SCOPE_INDEX' as check_type, count(*)::text as result
from pg_indexes
where schemaname = 'public' and tablename = 'audit_logs'
  and indexname = 'idx_audit_logs_scope_time'
union all
select 'AUDIT_LOGS_ENTITY_INDEX', count(*)::text
from pg_indexes
where schemaname = 'public' and tablename = 'audit_logs'
  and indexname = 'idx_audit_logs_entity'
union all
select 'CUSTOMERS_CREATED_VIA_INDEX', count(*)::text
from pg_indexes
where schemaname = 'public' and tablename = 'customers'
  and indexname = 'idx_customers_created_via'
union all
select 'STAFF_ASSIGNMENTS_BRANCH_INDEX', count(*)::text
from pg_indexes
where schemaname = 'public' and tablename = 'partner_staff_assignments'
  and indexname = 'idx_staff_assignments_branch'
union all
select 'AUDIT_LOGS_ROWCOUNT', count(*)::text from public.audit_logs
union all
select 'CUSTOMERS_ROWCOUNT', count(*)::text from public.customers
union all
select 'STAFF_ASSIGNMENTS_ROWCOUNT', count(*)::text from public.partner_staff_assignments;

-- ── 3. Perilaku ───────────────────────────────────────────────
--
-- SENGAJA TIDAK ADA berkas test-harness untuk irisan ini: index tidak
-- mengubah HASIL query mana pun (RLS/policy/fungsi sama sekali tidak
-- disentuh), hanya kecepatannya — tidak ada perilaku baru untuk diuji
-- benar/salah, hanya struktur untuk diverifikasi ada/tidak (§2 di atas
-- sudah cukup). Kalau ingin membuktikan index ini benar-benar dipakai
-- planner pada volume data sekarang, jalankan EXPLAIN ANALYZE pada query
-- layar Aktivitas/daftar pelanggan cabang secara manual — di luar berkas
-- migrasi ini, karena hasilnya tergantung volume data saat itu, bukan
-- sesuatu yang bisa dipastikan angkanya di sini.
