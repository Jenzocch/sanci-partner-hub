-- ============================================================
-- SANCI Partner Hub — Phase 2 irisan keempat belas
-- Migration 0019: penomoran otomatis customer_code BRANCH-created —
--                  {PartnerCode}-{BranchCode}-{StaffCode}/{YY}/{SeqNo}
--                  (idempotent — aman dijalankan ulang)
-- Jalankan di: Supabase Studio → SQL Editor → paste seluruh file → Run
--
-- PRASYARAT: 0001 → … → 0017 → 0018 sudah dijalankan, DALAM URUTAN ITU.
-- Blok pengaman di bawah berhenti dengan pesan jelas kalau belum. Setelah
-- berkas ini, rantai penuhnya menjadi 0001 → 0003 → … → 0018 → 0019 (lihat
-- migrations/README.md — ATURAN BESI).
--
-- ============================================================
-- LATAR BELAKANG BISNIS (owner, verbatim, 2026-08-21 — lihat plan file
-- lengkap di scratchpad untuk seluruh rentetan diskusinya)
-- ============================================================
--
-- "分行的編號呢" — cabang mitra juga butuh customer_code, tapi dengan aturan
-- BERBEDA dari SANCI-direct (0018 — itu skema source/sales SANCI internal,
-- khusus pelanggan yang TIDAK dibuat lewat cabang mana pun). "可以自動產生,
-- 但是可以清楚知道哪一個分行" — auto-generate, harus jelas kelihatan cabang
-- mana. "要加上業務/店員代碼" — semangatnya sama dengan "Sales" SANCI di
-- 0018, tapi memakai staf CABANG mitra sendiri (`partner_staff`), BUKAN
-- `sanci_sales_staff` (roster internal SANCI, tabel yang sudah sengaja
-- dipisah 0018 — dua "atribusi penjual" yang melacak dua organisasi
-- berbeda, tetap terpisah di sini). "gd-bsd-多這種的類似" — gaya mengikuti
-- `fn_set_order_number` (0004): `<PARTNER_CODE>-<BRANCH_CODE>-<...>`.
--
-- ⚠️ FORMAT DI BAWAH INI DIUSULKAN, BELUM DIKONFIRMASI ULANG owner setelah
-- penambahan kode staf — lihat kepala berkas plan
-- (scratchpad/plan-0019-branch-customer-code.md) yang menyatakan eksplisit
-- "dispatch should proceed with this design but flag it prominently in the
-- delivery report". Dibangun sebagai desain kerja, BUKAN dianggap final —
-- laporan penyerahan slice ini WAJIB menunjukkan contoh string yang sungguh
-- digenerate secara menonjol supaya Jenzo bisa mengoreksi kalau bentuknya
-- tidak tepat, persis seperti laporan 0018.
--
-- **`{PartnerCode}-{BranchCode}-{StaffCode}/{YY}/{SeqNo}`**
-- contoh: `GH-BSD-AS/26/001` — Golden Home, cabang BSD, staf berinisial AS,
-- 2026, pelanggan pertama yang dibuat/diatribusikan cabang itu tahun ini.
--
-- ============================================================
-- APA YANG DIBUKA IRISAN INI (dan hanya ini)
-- ============================================================
--   partner_staff.code      → kolom BARU, nullable, text. Bisa diedit dari
--                             UI staf cabang MAUPUN admin (dua tempat yang
--                             sudah ada — web/app/cabang/staff/[branchId]/**
--                             dan web/app/admin/partners/[id]/branches/
--                             [branchId]/**, keduanya sama-sama memanggil
--                             web/app/admin/actions-staff.ts). UI mengusulkan
--                             inisial dari full_name saat membuat staf baru
--                             — kenyamanan UI SAJA, TIDAK dipaksakan di
--                             database, field tetap bebas diedit dan TIDAK
--                             wajib diisi untuk menyimpan staf (staf boleh
--                             punya code IS NULL selamanya — kode diisi
--                             HANYA kalau cabang mau pelanggan yang
--                             diatribusikan ke staf itu dapat nomor
--                             otomatis).
--   customers.attributed_staff_id → kolom BARU, nullable, FK →
--                             partner_staff ON DELETE RESTRICT. "Staf
--                             partner mana yang diatribusikan sebagai
--                             pembawa/pengurus pelanggan ini" — lihat §
--                             "KEPUTUSAN DESAIN ATRIBUSI STAF" di bawah
--                             untuk bagaimana kolom ini diisi.
--   partner_customer_counters → tabel BARU. Penghitung nomor urut customer
--                             code PER (branch_id, seq_year) — mirror
--                             STRUKTUR dan DISIPLIN LOCKING
--                             partner_order_counters (0004) persis, tapi
--                             kuncinya tahun (bukan tanggal) karena format
--                             ini me-reset per tahun per cabang (lihat
--                             alasan di §4).
--   fn_next_customer_seq   → fungsi BARU security definer, mirror
--                             fn_next_order_seq (0004) persis: INSERT …
--                             ON CONFLICT DO UPDATE mengunci baris counter
--                             di transaksi yang sama, atomik, tanpa
--                             SELECT-lalu-INSERT (LESSONS #3).
--   fn_check_customer_staff_ref → trigger BARU BEFORE INSERT OR UPDATE
--                             customers: attributed_staff_id (kalau
--                             terisi) HARUS milik created_via_partner_id
--                             baris yang sama — mirror fn_check_order_refs
--                             (0004 §3) persis, supaya "atribusi staf lintas
--                             partner lewat API" tidak mungkin terjadi
--                             walau field-nya sendiri dikirim client
--                             (LESSONS #5/#6, zero-trust). Divalidasi
--                             TERPISAH dari generate kode (fn_set_customer_
--                             code di bawah) — pola yang SAMA dengan
--                             pemisahan fn_check_order_refs vs
--                             fn_set_order_number di 0004, supaya baris
--                             yang atribusinya salah selalu DITOLAK, bukan
--                             cuma "gagal generate kode secara diam-diam".
--   fn_set_customer_code   → DIDEFINISIKAN ULANG (bukan trigger baru — lihat
--                             § "SATU FUNGSI, BUKAN DUA TRIGGER" di bawah
--                             untuk alasannya). Menambahkan CABANG KEDUA
--                             (if/elsif) untuk jalur branch-created,
--                             berdampingan dengan jalur SANCI-direct 0018
--                             yang TIDAK diubah satu karakter pun.
--
-- YANG SENGAJA TIDAK DIBUKA:
--   * RLS `customers` — TIDAK disentuh sama sekali (streak sejak 0017/0018
--     berlanjut, dibuktikan CUSTOMER_POLICIES tetap 4 di blok verifikasi).
--   * RLS `partner_staff` — TIDAK disentuh. Kolom `code` otomatis ikut
--     ATURAN BARIS yang sudah ada (s_partner_insert/s_partner_update sudah
--     mengizinkan cabang menulis kolom APA PUN pada baris stafnya sendiri;
--     RLS Postgres bekerja per BARIS, bukan per kolom — argumen yang sama
--     dipakai 0017 §3 untuk customer_code/email). Dibuktikan STAFF_POLICIES
--     tetap 4.
--   * `fn_audit_row` — TIDAK didefinisikan ulang. Tidak ada tabel baru yang
--     butuh pemetaan nama entitas baru (partner_customer_counters TIDAK
--     diaudit — sama seperti partner_order_counters 0004, tabel internal
--     murni); dua kolom baru (partner_staff.code, customers.
--     attributed_staff_id) otomatis ikut lewat to_jsonb(new)/(old) karena
--     kedua tabel INDUKnya SUDAH dipetakan ke prefix STAFF/CUSTOMER sejak
--     0001/0004. Dibuktikan lewat AUDIT_STILL_0018_* di blok verifikasi:
--     prosrc fn_audit_row masih PERSIS versi 0018 (masih memuat
--     'CUSTOMER_SOURCE'/'SALES_STAFF', bukti definer AKTIF tidak berubah).
--   * Validasi format `partner_staff.code` yang lebih ketat dari CHECK
--     dasarnya, atau alat migrasi massal mengisi kode utk staf lama —
--     di luar cakupan slice ini (sama sikap "additive, not mandatory" 0018).
-- ============================================================
-- KEPUTUSAN DESAIN ATRIBUSI STAF (bagian yang genuinely open di plan file)
-- ============================================================
-- Dibaca dulu SEBELUM menulis baris ini: web/app/cabang/pesanan/actions.ts
-- (resolveOrCreateCustomer/createCustomerAndOrder/createCustomerOnly,
-- verifyActiveStaffInBranch) dan web/app/cabang/pesanan/baru/new-order-form.tsx.
--
-- Faktanya di kode SEKARANG (diverifikasi, bukan diasumsikan):
--   1. Pembuatan Order (createCustomerAndOrder) SUDAH mewajibkan
--      `sales_staff_id` dan memvalidasinya lewat verifyActiveStaffInBranch
--      SEBELUM baris order ditulis — field ini SUDAH ADA di form yang sama
--      dengan pembuatan pelanggan baru (satu <form>, satu submit).
--   2. Jalur "Simpan Pelanggan Saja" (createCustomerOnly, tombol terpisah di
--      form yang SAMA) TIDAK mengirim staf apa pun hari ini — field
--      sales_staff_id ada di DOM form yang sama (di dalam <fieldset> yang
--      sama), tapi onSubmitCustomerOnly tidak membacanya.
--   3. Halaman Pelanggan cabang (web/app/cabang/pelanggan/**) TIDAK punya
--      form BUAT pelanggan sama sekali — hanya List + Edit. Satu-satunya
--      jalur BUAT pelanggan dari sisi cabang ada di /cabang/pesanan/baru,
--      lewat dua fungsi di atas.
--
-- KEPUTUSAN: pakai jawaban (b) dari plan file — reuse field staf yang SUDAH
-- ADA di form order, bukan bikin picker staf baru terpisah:
--   - createCustomerAndOrder (jalur UMUM, pelanggan+order sekaligus): staf
--     yang SUDAH divalidasi verifyActiveStaffInBranch untuk order (sales_
--     staff_id) dipakai ULANG sebagai attributed_staff_id pelanggan BARU —
--     tidak ada validasi kedua, staf itu sudah terbukti aktif & milik
--     cabang/partner yang sama di baris kode yang sama.
--   - createCustomerOnly (jalur standalone "Simpan Pelanggan Saja"): field
--     sales_staff_id yang SAMA di form ditambahkan sebagai parameter
--     OPSIONAL — kalau staf terisi di form saat tombol ini ditekan
--     (fieldset order section sudah aktif begitu lookupState determinate),
--     divalidasi verifyActiveStaffInBranch persis pola order, lalu dipakai
--     sebagai attributed_staff_id. Kalau kosong (staf belum dipilih —
--     jalur paling umum untuk "Simpan Pelanggan Saja", karena section Order
--     biasanya belum diisi sama sekali saat pengguna memilih jalur ini),
--     attributed_staff_id ditulis null — TIDAK error, TIDAK wajib.
--   - Kalau customer sudah ADA (mode "existing" — pelanggan lama dipakai
--     ulang untuk order baru), attributed_staff_id TIDAK PERNAH ditimpa:
--     trigger fn_set_customer_code hanya jalan BEFORE INSERT, dan baris
--     lama sudah lewat titik itu — mengulang staf order yang baru tidak
--     mengubah kode pelanggan yang sudah beku (sama filosofi "kode adalah
--     teks beku" 0018).
--
-- Ini KOHEREN dengan cara pelanggan SUNGGUH dibuat di app ini hari ini
-- (dibaca dari kode, bukan diasumsikan): satu-satunya jalur BUAT pelanggan
-- cabang ada di form order, dan field staf SUDAH ada di form yang sama —
-- tidak perlu UI picker baru sama sekali, hanya perlu meneruskan nilai yang
-- sudah ada ke parameter yang sudah ada validasinya.
-- ============================================================
-- SATU FUNGSI, BUKAN DUA TRIGGER (justifikasi keputusan desain)
-- ============================================================
-- fn_set_customer_code DIDEFINISIKAN ULANG (bukan trigger kedua terpisah)
-- untuk menangani KEDUA jalur (SANCI-direct 0018 + branch-created 0019)
-- lewat if/elsif dalam SATU fungsi — mirip cara fn_audit_row sendiri
-- bercabang per tabel/kondisi. Alasannya:
--   1. Kedua jalur menulis kolom TARGET yang SAMA (customers.customer_code)
--      lewat trigger BEFORE INSERT yang SAMA jenisnya — dua trigger objek
--      terpisah pada BEFORE INSERT tabel yang sama akan berjalan berurutan
--      (diurutkan nama), dan trigger KEDUA yang jalan akan melihat
--      NEW.customer_code SUDAH TERISI trigger pertama (kalau kedua kondisi
--      pernah — walau seharusnya tidak pernah — sama-sama terpenuhi), lalu
--      TIDAK menimpanya (karena guard "customer_code sudah terisi → return
--      new" ada di kedua cabang) — AMAN kalaupun race itu terjadi, TAPI
--      menaruh logika "mana yang menang" di urutan nama trigger yang
--      implisit lebih rapuh dibaca dibanding satu if/elsif eksplisit dalam
--      satu fungsi.
--   2. Satu fungsi = satu tempat membaca "apa saja kondisi generate kode
--      customer_code sekarang" — dua trigger terpisah memaksa pembaca
--      menggabungkan dua berkas migrasi berbeda di kepalanya untuk
--      memahami perilaku PENUH kolom ini.
--   3. Precedent yang SUDAH ada di repo ini: fn_audit_row sendiri adalah
--      SATU fungsi yang menangani PULUHAN tabel/kondisi lewat CASE/IF
--      berlapis, bukan satu trigger function per tabel. Pola yang sama
--      diterapkan di sini untuk alasan yang sama (satu titik kebenaran).
--
-- INVARIAN yang WAJIB tetap benar (diuji eksplisit di test-harness, BUKAN
-- diasumsikan): satu baris INSERT customers TIDAK PERNAH memenuhi KEDUA
-- kondisi cabang sekaligus. Dibuktikan dari skema yang SUDAH ADA sejak
-- 0004/0018, bukan aturan baru:
--   - Jalur SANCI-direct (0018, createCustomerAdmin di web/app/admin/
--     actions-customers.ts): created_via_partner_id/created_via_branch_id
--     SELALU NULL (baris 8-10 kepala berkas actions-customers.ts —
--     "dari layar /admin/pelanggan (created_via_partner_id/branch_id
--     selalu NULL)").
--   - Jalur branch-created (0004, policy c_partner_insert): mensyaratkan
--     created_via_partner_id = fn_pu_partner() DAN created_via_branch_id =
--     fn_pu_branch() — keduanya WAJIB NOT NULL untuk lolos RLS INSERT
--     sesi cabang.
--   - source_id/sales_staff_id (0018) HANYA pernah ditulis dari
--     web/app/admin/actions-customers.ts (createCustomerAdmin) — form
--     cabang (resolveOrCreateCustomer di web/app/cabang/pesanan/
--     actions.ts) TIDAK PERNAH mengirim kolom itu sama sekali.
-- Jadi: created_via_* terisi ⟺ source_id/sales_staff_id kosong, dan
-- sebaliknya, by construction — bukan kebetulan yang perlu dijaga trigger
-- tambahan, tapi juga TETAP diverifikasi lewat T6/T7 di test-harness supaya
-- ini bukti, bukan keyakinan (LESSONS #7).
-- ============================================================
-- PER-BRANCH-PER-TAHUN, BUKAN GLOBAL (keputusan partisi counter)
-- ============================================================
-- Beda dari 0018 (customer_code_seq — SEQUENCE polos GLOBAL, TIDAK pernah
-- reset, karena SeqNo SANCI-direct eksplisit "GLOBAL... TUMBUH TERUS"),
-- format INI memakai counter-table PER (branch_id, seq_year) yang RESET ke
-- 1 setiap tahun BARU per cabang — mirip PERSIS fn_next_order_seq (0004)
-- yang partisi per (branch_id, seq_date). Alasannya BUKAN sekadar meniru
-- 0004 tanpa pikir: `/{YY}/` di format ini memisahkan tahun dengan '/'
-- SENDIRI (bukan digabung ke SeqNo), sama seperti order_number memisahkan
-- tanggal dengan '-' sendiri sebagai PARTISI KUNCI sungguhan, bukan
-- kosmetik — owner tidak pernah bilang SeqNo di sini harus global seperti
-- 0018 (yang eksplisit dinyatakan begitu di kepala berkas 0018), dan visual
-- pemisahan tahun yang identik dengan pola order_number adalah sinyal
-- terkuat yang tersedia bahwa perilakunya juga dimaksud identik: reset per
-- tahun per cabang. Diuji eksplisit di test-harness (simulasi 2 tahun,
-- 2 cabang) — bukan diasumsikan benar.
-- ============================================================
-- TIDAK ADA TABRAKAN FORMAT DENGAN 0018 (bukti, bukan sangkaan)
-- ============================================================
-- 0018: `{SourceCode}/{YY}-{SalesCode}/{SeqNo}` — SourceCode/SalesCode
--   HANYA huruf besar A-Z (SHORT_CODE_RE = /^[A-Z]{1,4}$/ di
--   web/app/admin/actions-customers.ts) — TIDAK PERNAH mengandung '-'.
--   Akibatnya: jumlah karakter '-' SEBELUM '/' PERTAMA pada string 0018
--   SELALU NOL (bagian sebelum '/' pertama HANYA SourceCode).
-- 0019: `{PartnerCode}-{BranchCode}-{StaffCode}/{YY}/{SeqNo}` — dua '-'
--   LITERAL sebagai pemisah (antara PartnerCode/BranchCode dan
--   BranchCode/StaffCode) SELALU ada sebelum '/' pertama, terlepas dari
--   isi PartnerCode/BranchCode itu sendiri (yang malah BOLEH mengandung
--   '-' tambahan per CHECK `code ~ '^[A-Z0-9-]{2,8}$'` di 0001 — hanya
--   menambah jumlah '-', tidak pernah menguranginya). Akibatnya: jumlah
--   karakter '-' SEBELUM '/' PERTAMA pada string 0019 SELALU >= 2.
-- Invarian: {0 '-' sebelum '/' pertama} vs {>= 2 '-' sebelum '/' pertama}
-- adalah dua himpunan yang TIDAK PERNAH beririsan — TIDAK ADA nilai valid
-- dari satu skema yang bisa dibaca sebagai valid di bawah skema lainnya,
-- untuk PANJANG SeqNo/kode berapa pun. Diverifikasi programatik (menghitung
-- '-' sungguhan pada contoh string konkret kedua skema, bukan hanya
-- dinyatakan di komentar) di blok verifikasi §11 di bawah — TIDAK memakai
-- CHECK constraint pada tabel `customers` karena akan mewajibkan memeriksa
-- ulang seluruh data historis (termasuk 36 baris impor 0017 dan pelanggan
-- produksi yang sudah ada) tanpa dasar yang sudah diverifikasi terhadap
-- data itu — dokumentasi + assertion terpisah (bukan CHECK constraint)
-- adalah pilihan sadar di sini, bukan kelalaian.
-- ============================================================

-- ── 0. Pengaman prasyarat ───────────────────────────────────

do $$
begin
  if to_regprocedure('public.fn_set_customer_code()') is null
     or to_regclass('public.customer_sources') is null
     or to_regclass('public.sanci_sales_staff') is null then
    raise exception
      'Migration 0018_customer_code_generation.sql belum dijalankan di database ini. Jalankan 0001 → … → 0018 dulu, baru 0019.';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'partner_staff') then
    raise exception
      'Tabel partner_staff tidak ditemukan — migration 0001 belum dijalankan.';
  end if;
  if to_regprocedure('public.fn_check_order_refs()') is null
     or to_regprocedure('public.fn_audit_row()') is null then
    raise exception
      'Fungsi dasar (fn_check_order_refs / fn_audit_row) belum lengkap. Jalankan 0001 → … → 0018 dulu, baru 0019.';
  end if;
end;
$$;

-- ── 1. partner_staff.code ────────────────────────────────────

-- Nullable — staf boleh selamanya tanpa kode (0018-style "additive, not
-- mandatory"). Format sederhana huruf besar/angka 1-10 karakter (regex ini
-- SEKALIGUS jadi blank-guard: string kosong '' tidak pernah cocok dengan
-- kuantifier {1,10} yang mewajibkan minimal 1 karakter — tidak perlu CHECK
-- terpisah seperti pola btrim(code)<>'' di tabel lain).
alter table public.partner_staff add column if not exists code text;

do $$
begin
  if not exists (select 1 from pg_constraint
                 where conname = 'partner_staff_code_format'
                   and conrelid = 'public.partner_staff'::regclass) then
    alter table public.partner_staff
      add constraint partner_staff_code_format
      check (code is null or code ~ '^[A-Z0-9]{1,10}$');
  end if;
end;
$$;

-- Uniqueness di-scope ke (partner_id, code) — BUKAN (branch_id, code).
-- Alasan (dibaca dari skema SEBENARNYA, bukan diasumsikan, sesuai instruksi
-- tugas): partner_staff TIDAK punya kolom branch_id langsung (0001) —
-- hubungan staf↔cabang ada di partner_staff_assignments, DAN satu staf
-- hanya boleh punya SATU penugasan aktif kapan pun (uq_active_assignment,
-- 0001), tapi penugasan itu BISA berpindah cabang (transferStaff di
-- web/app/admin/actions-staff.ts) — men-scope uniqueness ke branch_id akan
-- berarti meng-query/JOIN partner_staff_assignments di dalam sebuah UNIQUE
-- INDEX predicate, yang tidak bisa dinyatakan sebagai index biasa (perlu
-- trigger constraint terpisah, kompleksitas ekstra). partner_id scope jauh
-- lebih sederhana DAN tetap benar untuk kebutuhan sebenarnya: syarat owner
-- adalah "kode tampil di string komposit yang SUDAH memuat partner+cabang"
-- (lihat plan file) — jadi bare-code collision-freedom ANTAR CABANG milik
-- partner yang SAMA bukan syarat keras (dua kode staf sama di dua cabang
-- berbeda milik partner yang sama tidak akan pernah menghasilkan
-- customer_code kembar, karena BranchCode sudah membedakannya di string).
-- Yang TETAP dicegah: dua staf AKTIF di partner yang SAMA punya kode YANG
-- SAMA PERSIS (kekacauan murni, tidak ada alasan bisnis untuk mengizinkannya).
create unique index if not exists partner_staff_code_partner_key
  on public.partner_staff (partner_id, code) where code is not null;

-- ── 2. customers.attributed_staff_id ─────────────────────────

-- Nullable — HANYA pelanggan branch-created BISA punya nilai di sini
-- (lihat § "KEPUTUSAN DESAIN ATRIBUSI STAF" di kepala berkas). ON DELETE
-- RESTRICT (bukan CASCADE) — pola sama dengan source_id/sales_staff_id
-- (0018) dan partner_sales_staff_id (0004): staf yang sudah diatribusikan
-- ke pelanggan lama TIDAK PERNAH boleh membuat baris pelanggan itu yatim
-- diam-diam kalau staf itu suatu hari dihapus (LESSONS #4 — staf memang
-- TIDAK PERNAH hard-delete, hanya deactivateStaff/status INACTIVE, jadi
-- RESTRICT ini praktisnya jaring pengaman terhadap penghapusan manual lewat
-- SQL Editor, sama seperti alasan yang sama persis di 0018 §3).
alter table public.customers
  add column if not exists attributed_staff_id uuid references public.partner_staff(id) on delete restrict;

-- ── 3. partner_customer_counters: penghitung PER (branch_id, seq_year) ──

-- Struktur MENIRU partner_order_counters (0004 §1) persis — tabel internal
-- MURNI, tidak pernah disentuh client, hanya lewat fn_next_customer_seq
-- (security definer) di bawah. seq_year (bukan seq_date) — lihat §
-- "PER-BRANCH-PER-TAHUN, BUKAN GLOBAL" di kepala berkas untuk alasan
-- kenapa partisi tahun (bukan global seperti 0018, bukan harian seperti
-- 0004) adalah pilihan yang benar di sini.
create table if not exists public.partner_customer_counters (
  branch_id  uuid not null references public.partner_branches(id) on delete restrict,
  seq_year   integer not null,
  last_seq   integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (branch_id, seq_year)
);

-- ── 4. fn_next_customer_seq(): ambil nomor urut berikutnya, ATOMIK ──

-- Pola PERSIS fn_next_order_seq (0004 §2): INSERT … ON CONFLICT DO UPDATE
-- mengunci baris (branch_id, seq_year) di transaksi YANG SAMA dengan INSERT
-- pelanggannya — dua staf di cabang yang sama menekan Simpan di detik yang
-- sama akan diantrikan Postgres, bukan mendapat nomor kembar (LESSONS #3:
-- SELECT-lalu-INSERT pasti bentrok di bawah beban bersamaan). Transaksi
-- rollback → kenaikan counter ikut batal, tidak ada nomor yang terbuang.
create or replace function public.fn_next_customer_seq(b uuid, y integer) returns integer
language plpgsql security definer set search_path = public as $$
declare v_seq integer;
begin
  insert into partner_customer_counters as c (branch_id, seq_year, last_seq)
  values (b, y, 1)
  on conflict (branch_id, seq_year) do update
    set last_seq = c.last_seq + 1, updated_at = now()
  returning c.last_seq into v_seq;
  return v_seq;
end;
$$;

-- LESSONS #26: fungsi ini MENGUBAH data (menaikkan counter) dan HANYA
-- dipanggil dari dalam fn_set_customer_code (security definer lain, jadi
-- panggilan internalnya jalan atas privilese pemilik fungsi, bukan
-- caller — tidak butuh EXECUTE eksplisit untuk itu). Kalau EXECUTE publik
-- tetap terbuka, PostgREST akan meng-expose-nya sebagai /rpc/ dan SIAPA PUN
-- yang login (atau bahkan anon) bisa memanggilnya langsung untuk menaikkan
-- nomor urut cabang mana pun tanpa pernah membuat pelanggan sungguhan —
-- nomor lompat/DoS penomoran, persis lubang P1 yang 0007 tutup untuk
-- fn_next_order_seq. Ditutup dari AWAL di sini (tidak menunggu retrofit
-- seperti 0007), karena fungsi ini baru lahir di migrasi ini.
revoke all on function public.fn_next_customer_seq(uuid, integer) from public, anon, authenticated;

-- ── 5. fn_check_customer_staff_ref(): validasi kepemilikan staf ─────

-- Trigger TERPISAH dari fn_set_customer_code (lihat § "SATU FUNGSI, BUKAN
-- DUA TRIGGER" untuk alasan kenapa generate-kode digabung tapi VALIDASI ini
-- tetap dipisah) — mirror fn_check_order_refs (0004 §3) persis: memastikan
-- attributed_staff_id (kalau terisi) SUNGGUH milik created_via_partner_id
-- baris yang sama. Dipisah dari fn_set_customer_code supaya baris yang
-- atribusinya SALAH selalu DITOLAK (exception, INSERT gagal) — bukan cuma
-- "gagal generate kode secara diam-diam" kalau logika ini ditumpuk di
-- dalam cabang generate kode (yang punya banyak jalur early-return untuk
-- kasus normal "belum ada kode", gampang salah taruh validasi keamanan di
-- salah satu cabangnya lalu lupa cabang lain).
create or replace function public.fn_check_customer_staff_ref() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.attributed_staff_id is not null then
    if new.created_via_partner_id is null then
      raise exception 'attributed_staff_id hanya berlaku untuk pelanggan yang dibuat lewat cabang (created_via_partner_id kosong)';
    end if;
    if not exists (
      select 1 from partner_staff
      where id = new.attributed_staff_id and partner_id = new.created_via_partner_id
    ) then
      raise exception 'staf yang diatribusikan (attributed_staff_id) bukan milik partner %', new.created_via_partner_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_customer_staff_ref on public.customers;
create trigger trg_check_customer_staff_ref before insert or update on public.customers
  for each row execute function public.fn_check_customer_staff_ref();

-- ── 6. fn_set_customer_code(): DIDEFINISIKAN ULANG — tambah jalur branch ──

-- Definisi ulang UTUH (bukan tambalan) — ATURAN BESI migrations/README.md.
-- Cabang SANCI-direct (guard blank + preset + source_id/sales_staff_id)
-- DISALIN PERSIS dari 0018, byte demi byte pada logikanya — TIDAK ada satu
-- baris perilaku pun yang berubah untuk jalur itu (dibuktikan test-harness
-- 60_behavior_0018.sql tetap 20/20 PASS tanpa modifikasi terhadap berkas
-- itu). Yang BERTAMBAH murni cabang branch-created (0019) sebagai elsif
-- baru di bawahnya.
create or replace function public.fn_set_customer_code() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_source_code  text;
  v_sales_code   text;
  v_partner_code text;
  v_branch_code  text;
  v_staff_code   text;
  v_yy           text;
  v_seq          integer;
begin
  -- String kosong diperlakukan SAMA dengan NULL (0018, konsisten dengan
  -- blank-guard CHECK milik customer_code sejak 0017).
  if new.customer_code is not null and btrim(new.customer_code) = '' then
    new.customer_code := null;
  end if;

  -- customer_code SUDAH terisi (non-blank) → TIDAK PERNAH ditimpa, jalur
  -- mana pun (skrip impor 0017, override manual, ATAU sekarang kedua jalur
  -- generate di bawah baru pernah jalan sekali per baris).
  if new.customer_code is not null then
    return new;
  end if;

  -- ── Jalur A (0018): SANCI-direct — source_id + sales_staff_id keduanya
  -- terisi. Logika PERSIS 0018, tidak diubah.
  if new.source_id is not null and new.sales_staff_id is not null then
    select code into v_source_code from public.customer_sources where id = new.source_id;
    select code into v_sales_code  from public.sanci_sales_staff  where id = new.sales_staff_id;

    if v_source_code is null or v_sales_code is null then
      raise exception 'source_id/sales_staff_id pada pelanggan baru menunjuk baris yang tidak ada';
    end if;

    v_yy := to_char(now() at time zone 'Asia/Jakarta', 'YY');
    v_seq := nextval('public.customer_code_seq');

    new.customer_code := v_source_code || '/' || v_yy || '-' || v_sales_code || '/' || lpad(v_seq::text, 3, '0');
    return new;
  end if;

  -- ── Jalur B (0019): branch-created — created_via_partner_id DAN
  -- created_via_branch_id keduanya terisi (baris ini dibuat lewat cabang,
  -- lihat pembuktian invarian di kepala berkas) DAN staf yang diatribusikan
  -- punya kode. "Additive, not mandatory" (posisi 0018 yang sama): staf ada
  -- tapi belum punya kode → customer_code TETAP null, BUKAN error — cabang
  -- yang belum sempat mengisi kode staf-nya tidak boleh terhambat membuat
  -- pelanggan (task spec, sikap yang sama dijaga 0018 untuk source/sales
  -- yang setengah terisi).
  if new.created_via_partner_id is not null and new.created_via_branch_id is not null
     and new.attributed_staff_id is not null then
    select code into v_staff_code from public.partner_staff where id = new.attributed_staff_id;
    if not found then
      raise exception 'attributed_staff_id pada pelanggan baru menunjuk staf yang tidak ada';
    end if;
    if v_staff_code is null or btrim(v_staff_code) = '' then
      return new;
    end if;

    -- Kode SEKARANG partner/cabang, BUKAN cuplikan beku — keputusan sadar,
    -- konsisten dengan alasan 0018 untuk source_code/sales_code: kalau
    -- admin mengganti kode partner/cabang (mengoreksi typo) di masa depan,
    -- pelanggan yang kodenya SUDAH digenerate SEBELUM penggantian tetap
    -- memakai teks lama (customer_code adalah teks beku begitu ditulis) —
    -- hanya pelanggan yang digenerate SESUDAH penggantian memakai kode
    -- baru. security definer: dibaca tanpa bergantung pada RLS, sama pola
    -- fn_set_order_number (0004 §2).
    select code into v_partner_code from public.partners where id = new.created_via_partner_id;
    select code into v_branch_code  from public.partner_branches where id = new.created_via_branch_id;
    if v_partner_code is null or v_branch_code is null then
      raise exception 'created_via_partner_id/created_via_branch_id pada pelanggan baru menunjuk baris yang tidak ada';
    end if;

    -- Waktu server (LESSONS #11), tanggal BISNIS Indonesia — pola sama
    -- persis dengan fn_set_order_number/fn_set_customer_code (0018).
    v_yy := to_char(now() at time zone 'Asia/Jakarta', 'YY');
    v_seq := public.fn_next_customer_seq(
      new.created_via_branch_id,
      extract(year from (now() at time zone 'Asia/Jakarta'))::integer
    );

    new.customer_code := v_partner_code || '-' || v_branch_code || '-' || v_staff_code
                          || '/' || v_yy || '/' || lpad(v_seq::text, 3, '0');
    return new;
  end if;

  return new;
end;
$$;

-- CATATAN untuk yang menjalankan ulang 0018 SETELAH file ini: fn_set_
-- customer_code akan tertimpa balik ke versi 0018 (jalur branch-created di
-- atas hilang) — jalankan ulang 0019 untuk memulihkannya. trg_set_customer_
-- code sendiri (objek triggernya) TIDAK perlu dibuat ulang — CREATE OR
-- REPLACE FUNCTION mengubah ISI fungsi yang sudah dipasang trigger sejak
-- 0018, trigger-nya tetap sama.

-- ── 7. RLS: TIDAK ADA yang disentuh selain tabel BARU ────────

-- partner_customer_counters: RLS AKTIF TANPA policy sama sekali = tertutup
-- total lewat API — pola PERSIS partner_order_counters (0004 §7). Satu-
-- satunya jalan masuk adalah fn_next_customer_seq (security definer, EXECUTE
-- publik sudah dicabut di §4).
alter table public.partner_customer_counters enable row level security;

-- customers / partner_staff — TIDAK disentuh sama sekali. Dibuktikan lewat
-- CUSTOMER_POLICIES / STAFF_POLICIES di blok verifikasi §11 (kedua angka
-- HARUS tetap 4, sama seperti sebelum migrasi ini berjalan).

-- ── 8. Grants tambahan pada tabel referensi (tidak ada) ──────

-- Tidak ada grant baru yang diperlukan pada partner_staff/customers — RLS
-- + policy yang sudah ada sejak 0001/0004 sudah memberi akses baca/tulis
-- yang sesuai; kolom baru otomatis tunduk aturan BARIS yang sama.

-- ── 9. fn_audit_row — SENGAJA TIDAK didefinisikan ulang ──────

-- Lihat § "APA YANG DIBUKA IRISAN INI" di kepala berkas untuk alasan
-- lengkap. Dibuktikan lewat AUDIT_STILL_0018_* di §11: prosrc fungsi yang
-- AKTIF sekarang masih PERSIS versi 0018 (masih memuat penanda
-- 'CUSTOMER_SOURCE'/'SALES_STAFF' yang HANYA ditulis 0018, tidak ada
-- migrasi lain yang menulisnya) — pembuktian LANGSUNG bahwa definer yang
-- berlaku tidak berubah, bukan sekadar "saya tidak menulis CREATE OR
-- REPLACE di berkas ini jadi pasti aman".

-- ── 10. Bukti simbolik: tidak ada tabrakan format 0018 vs 0019 ──

-- TIDAK memakai CHECK constraint pada tabel customers (lihat alasan di
-- kepala berkas § "TIDAK ADA TABRAKAN FORMAT") — assertion berdiri sendiri
-- di sini, memakai CONTOH STRING KONKRET kedua skema (bukan tabel
-- sungguhan), menghitung literal jumlah '-' sebelum '/' pertama pada
-- masing-masing, dan membuktikan invariannya (0 vs >= 2) benar-benar
-- terpisah untuk KEDUA contoh sekaligus kasus PALING SEMPIT yang mungkin
-- (kode 2 karakter, tanpa '-' tambahan di dalam PartnerCode/BranchCode).
do $$
declare
  v_0018_example text := 'A/26-NS/003';           -- SourceCode=A, YY=26, SalesCode=NS, Seq=003
  v_0019_example text := 'AA-BB-C/26/001';         -- PartnerCode=AA, BranchCode=BB, StaffCode=C (kasus tersempit)
  v_0018_dashes integer;
  v_0019_dashes integer;
begin
  v_0018_dashes := length(split_part(v_0018_example, '/', 1)) - length(replace(split_part(v_0018_example, '/', 1), '-', ''));
  v_0019_dashes := length(split_part(v_0019_example, '/', 1)) - length(replace(split_part(v_0019_example, '/', 1), '-', ''));

  if v_0018_dashes <> 0 then
    raise exception 'FORMAT_NO_COLLISION gagal: contoh 0018 % diharapkan 0 tanda "-" sebelum "/" pertama, didapat %',
      v_0018_example, v_0018_dashes;
  end if;
  if v_0019_dashes < 2 then
    raise exception 'FORMAT_NO_COLLISION gagal: contoh 0019 % diharapkan >=2 tanda "-" sebelum "/" pertama, didapat %',
      v_0019_example, v_0019_dashes;
  end if;
  if v_0018_dashes = v_0019_dashes then
    raise exception 'FORMAT_NO_COLLISION gagal: kedua skema menghasilkan jumlah "-" yang sama (%), tidak lagi terbukti terpisah', v_0018_dashes;
  end if;
end;
$$;

-- ── 11. Verifikasi (hasilnya di-copy balik ke Claude) ────────
-- Angka yang diharapkan — cocokkan SATU PER SATU. "Run tanpa tulisan merah"
-- bukan bukti (LESSONS #7 & #16). Bukti LITERAL string yang sungguh
-- digenerate (mirror rigor T2 milik 0018) SENGAJA ditaruh di
-- supabase/test-harness/70_behavior_0019.sql, BUKAN di blok ini — beda dari
-- 0018 yang menyisipkan baris uji langsung ke tabel customers PRODUKSI
-- (aman untuk 0018 karena customer_sources/sanci_sales_staff adalah master
-- data BARU yang migrasi itu sendiri yang seed; di sini pembuktian literal
-- butuh baris partner/branch/staf UJI yang akan lolos ke daftar Partner
-- produksi Jenzo kalau ditulis di sini — polusi yang tidak perlu). Blok ini
-- HANYA memeriksa STRUKTUR skema (kolom/constraint/trigger/grant/policy
-- count) — bukti perilaku literal ada di test-harness terhadap fixture
-- lokal, bukan data produksi.
--
--   STAFF_CODE_COL                    1
--   STAFF_CODE_FORMAT_CHECK           1
--   STAFF_CODE_UNIQUE_PARTIAL         1   ← unique index (partner_id, code) where code is not null
--   STAFF_POLICIES                    4   ← WAJIB TETAP 4 sejak 0001: bukti RLS partner_staff tidak berubah
--   CUSTOMERS_ATTRIBUTED_STAFF_COL    1
--   CUSTOMERS_ATTRIBUTED_STAFF_RESTRICT 1 ← WAJIB 1: ON DELETE RESTRICT, bukan CASCADE
--   CUSTOMER_POLICIES                 4   ← WAJIB TETAP 4 sejak 0008: bukti RLS customers tidak berubah
--   COUNTER_TABLE                     1
--   COUNTER_PK_COLS                   2   ← (branch_id, seq_year)
--   COUNTER_RLS                       1
--   COUNTER_POLICIES                  0   ← WAJIB 0: tertutup total lewat API, sama pola partner_order_counters
--   NEXT_SEQ_FN / NEXT_SEQ_FN_SECDEF  1 / 1
--   NEXT_SEQ_EXEC_PUBLIC / _ANON / _AUTHENTICATED   0 / 0 / 0   ← LESSONS #26
--   CHECK_STAFF_REF_FN                1
--   CHECK_STAFF_REF_TRIGGER           1
--   TRG_SET_CUSTOMER_CODE             1   ← trigger OBJEK yang sama sejak 0018, hanya isi fungsinya berubah
--   AUDIT_STILL_0018_SOURCE           1   ← prosrc fn_audit_row MASIH memuat 'CUSTOMER_SOURCE' (definer belum berubah)
--   AUDIT_STILL_0018_SALES            1   ← dan 'SALES_STAFF'
--   REFS_CHECK_CUSTOMER               1   ← lubang P2 (0011) masih tertutup, tidak diganggu berkas ini

select 'STAFF_CODE_COL' as check_type, count(*)::text as result
from information_schema.columns
where table_schema = 'public' and table_name = 'partner_staff' and column_name = 'code'
union all
select 'STAFF_CODE_FORMAT_CHECK', count(*)::text
from pg_constraint
where conrelid = 'public.partner_staff'::regclass and contype = 'c'
  and conname = 'partner_staff_code_format'
union all
select 'STAFF_CODE_UNIQUE_PARTIAL', count(*)::text
from pg_indexes
where schemaname = 'public' and tablename = 'partner_staff'
  and indexname = 'partner_staff_code_partner_key'
  and indexdef like '%UNIQUE%' and indexdef like '%code IS NOT NULL%'
union all
select 'STAFF_POLICIES', count(*)::text
from pg_policies where schemaname = 'public' and tablename = 'partner_staff'
union all
select 'CUSTOMERS_ATTRIBUTED_STAFF_COL', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'customers' and column_name = 'attributed_staff_id'
union all
select 'CUSTOMERS_ATTRIBUTED_STAFF_RESTRICT', count(*)::text
from pg_constraint
where conrelid = 'public.customers'::regclass and contype = 'f'
  and conname like '%attributed_staff_id%' and confdeltype = 'r'
union all
select 'CUSTOMER_POLICIES', count(*)::text
from pg_policies where schemaname = 'public' and tablename = 'customers'
union all
select 'COUNTER_TABLE', count(*)::text
from information_schema.tables
where table_schema = 'public' and table_name = 'partner_customer_counters'
union all
select 'COUNTER_PK_COLS', count(*)::text
from information_schema.key_column_usage
where table_schema = 'public' and table_name = 'partner_customer_counters'
  and constraint_name = (
    select conname from pg_constraint
    where conrelid = 'public.partner_customer_counters'::regclass and contype = 'p'
  )
union all
select 'COUNTER_RLS', count(*)::text
from pg_tables where schemaname = 'public' and tablename = 'partner_customer_counters' and rowsecurity
union all
select 'COUNTER_POLICIES', count(*)::text
from pg_policies where schemaname = 'public' and tablename = 'partner_customer_counters'
union all
select 'NEXT_SEQ_FN', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_next_customer_seq'
union all
select 'NEXT_SEQ_FN_SECDEF', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_next_customer_seq' and p.prosecdef
union all
select 'NEXT_SEQ_EXEC_PUBLIC',
       (has_function_privilege('public', 'public.fn_next_customer_seq(uuid, integer)', 'execute'))::int::text
union all
select 'NEXT_SEQ_EXEC_ANON',
       coalesce((select (has_function_privilege('anon', 'public.fn_next_customer_seq(uuid, integer)', 'execute'))::int::text), '0')
union all
select 'NEXT_SEQ_EXEC_AUTHENTICATED',
       coalesce((select (has_function_privilege('authenticated', 'public.fn_next_customer_seq(uuid, integer)', 'execute'))::int::text), '0')
union all
select 'CHECK_STAFF_REF_FN', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_check_customer_staff_ref'
union all
select 'CHECK_STAFF_REF_TRIGGER', count(*)::text
from pg_trigger tg join pg_class cl on cl.oid = tg.tgrelid
join pg_namespace ns on ns.oid = cl.relnamespace
where not tg.tgisinternal and ns.nspname = 'public' and cl.relname = 'customers'
  and tg.tgname = 'trg_check_customer_staff_ref'
union all
select 'TRG_SET_CUSTOMER_CODE', count(*)::text
from pg_trigger tg join pg_class cl on cl.oid = tg.tgrelid
join pg_namespace ns on ns.oid = cl.relnamespace
where not tg.tgisinternal and ns.nspname = 'public' and cl.relname = 'customers'
  and tg.tgname = 'trg_set_customer_code'
union all
select 'AUDIT_STILL_0018_SOURCE', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%''CUSTOMER_SOURCE''%'
union all
select 'AUDIT_STILL_0018_SALES', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%''SALES_STAFF''%'
union all
select 'REFS_CHECK_CUSTOMER', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_check_order_refs' and p.prosrc like '%customers%';
