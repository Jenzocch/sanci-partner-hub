-- ============================================================
-- SANCI Partner Hub — Phase 2 irisan kedua puluh dua
-- Migration 0027: Tanggal Lunas SUNGGUHAN (isi tangan), berdampingan
--                 dengan cap sistem (idempotent — aman dijalankan ulang)
-- Jalankan di: Supabase Studio → SQL Editor → paste seluruh file → Run
--
-- PRASYARAT: 0001 → … → 0026 sudah dijalankan, DALAM URUTAN ITU. Blok
-- pengaman §0 berhenti dengan pesan jelas kalau belum. Setelah file ini,
-- rantai penuhnya menjadi 0001 → … → 0025 → 0026 → 0027.
--
-- BERKAS INI ATOMIK (berbeda dari 0026): seluruhnya DDL + query verifikasi
-- baca-saja, tanpa `commit;` di tengah. Gagal di mana pun = tidak ada yang
-- berubah.
--
-- ============================================================
-- LATAR BELAKANG BISNIS (owner, keputusan 2026-09-01)
-- ============================================================
--
-- 0026 memasang `customer_settled_at`: cap waktu LUNAS yang DIPAKSA SERVER,
-- dihitung ulang trigger pada SETIAP tulisan (LESSONS #11). Itu benar untuk
-- pesanan yang lahir DI DALAM sistem — capnya jujur menjawab "kapan sistem
-- ini melihat pesanan itu lunas".
--
-- Tapi kantor sedang MEMINDAHKAN pesanan LAMA ke sistem. Untuk baris-baris
-- itu, cap sistem menjawab pertanyaan yang SALAH: ia akan berkata "lunas
-- hari ini" (hari data itu diketik), padahal pelanggannya melunasi berbulan
-- sebelum sistem ini ada. Angkanya benar, tanggalnya bohong.
--
-- DUA JALAN yang dipertimbangkan, dan yang DITOLAK:
--   (A) Biarkan cap sistem bisa ditulis tangan untuk kasus ini. DITOLAK —
--       itu membongkar seluruh jaminan 0026 §2 (kolom yang TIDAK PERNAH
--       dipercaya dari client) demi kasus pindahan yang akan selesai;
--       sesudahnya sistem selamanya punya kolom tanggal yang bisa dikarang.
--   (B) DIPILIH OWNER: cap sistem TETAP dipasang apa adanya, dan tanggal
--       sungguhannya dicatat di kolom KEDUA yang memang isi tangan.
--       Dua kolom, dua pertanyaan berbeda, tidak ada yang berbohong:
--         customer_settled_at (0026) = kapan SISTEM melihatnya lunas
--                                      → dipaksa server, tidak bisa diketik
--         customer_settled_on (INI)  = kapan pelanggan SUNGGUH melunasi
--                                      → diketik kantor, seperti tanggal DP
--
-- Polanya PERSIS `customer_dp_paid_at` (0026 §1) yang sudah ada dan sudah
-- terbukti: tanggal dunia-nyata yang diisi kantor, `date` MURNI (bukan
-- `timestamptz`), tanpa default, tidak disentuh trigger mana pun.
--
-- ============================================================
-- YANG DIBUKA IRISAN INI (dan hanya ini)
-- ============================================================
--   partner_orders → SATU kolom BARU: customer_settled_on (date, nullable).
--
-- YANG SENGAJA TIDAK DIBUKA — masing-masing ada alasannya:
--
--   * TIDAK ADA CHECK "hanya boleh diisi kalau pesanannya lunas".
--     Menggodanya jelas, dan justru itu yang akan MEMBUNUH satu-satunya
--     alasan kolom ini ada. Pesanan lama yang sedang dipindahkan sering
--     TIDAK punya angka `customer_total_amount`/`customer_paid_amount`
--     sama sekali (yang tercatat di kertas cuma "sudah lunas 12 Maret") —
--     jadi menurut sistem statusnya UNKNOWN, dan CHECK semacam itu akan
--     menolak persis baris yang paling butuh kolom ini. Kalau kelak
--     kantor mau menegakkan konsistensi, tempatnya laporan pemeriksaan,
--     BUKAN constraint yang memblokir pengetikan.
--
--   * TIDAK ADA CHECK "tidak boleh tanggal masa depan". `date` sudah
--     menjamin BENTUKNYA; salah ketik tahun (2027 → 2072) adalah kesalahan
--     mata manusia yang sama kelasnya dengan salah ketik nama — sejajar
--     dengan customer_dp_paid_at yang juga tidak dibatasi begitu. Menambah
--     satu di sini tapi tidak di saudaranya hanya menciptakan dua aturan
--     berbeda untuk dua kolom yang sama sifatnya.
--
--   * TRIGGER fn_guard_customer_payment (0026 §2) TIDAK DIDEFINISIKAN
--     ULANG dan TIDAK diperluas. Kolom ini BUKAN nilai turunan — ia justru
--     kebalikannya, satu-satunya tanggal lunas yang MEMANG diketik
--     manusia. §2 di bawah MEMBUKTIKAN trigger itu tidak menyebutnya.
--
--   * TIDAK ADA policy RLS baru. Kolom baru pada tabel yang sudah ber-RLS
--     otomatis ikut policy yang ada (`o_partner_update` 0005 — jalur yang
--     SAMA dengan lima kolom 0026 yang ditulis cabang). §3 MEMVERIFIKASI
--     itu, bukan mengasumsikannya.
--
--   * `fn_audit_row` TIDAK didefinisikan ulang — kolom baru otomatis ikut
--     lewat `to_jsonb` (preseden 0014 `shipping_address`, 0020
--     `customer_po`, 0024 `size`, dan keenam kolom 0026). Yang WAJIB
--     dikerjakan APLIKASI: mendaftarkan kolom ini di
--     `web/lib/audit-format.ts` (LABELS + cabang format tanggal polos,
--     PERSIS seperti customer_dp_paid_at) — tanpa itu layar Aktivitas
--     membocorkan nama kolom mentah bahasa Inggris (LESSONS #13/#28).
--     Itu pekerjaan aplikasi, bukan SQL; dikerjakan di commit yang sama.
-- ============================================================
--
-- CAKUPAN README: migrations/README.md (baris ATURAN BESI + tabel
-- per-berkas) diperbarui bersamaan dengan berkas ini.
-- ============================================================

-- ── 0. Pengaman prasyarat (LESSONS #41: periksa OBJEK, bukan versi aktif) ──
--
-- Diperiksa: fondasi umum (fn_is_admin/fn_audit_row/partner_orders) DAN dua
-- objek milik 0026 secara spesifik — kolom `customer_settled_at` dan fungsi
-- trigger `fn_guard_customer_payment`. Memeriksa kolomnya saja tidak cukup:
-- seluruh arti kolom yang ditambahkan berkas ini adalah "pasangan isi-tangan
-- dari cap yang dipaksa server", jadi kalau capnya ada tapi triggernya
-- tidak, yang terpasang bukan yang dimaksud file ini.
do $$
begin
  if to_regprocedure('public.fn_is_admin()') is null
     or to_regprocedure('public.fn_audit_row()') is null
     or to_regclass('public.partner_orders') is null then
    raise exception
      'Fungsi/tabel dasar (fn_is_admin / fn_audit_row / partner_orders) belum lengkap. Jalankan 0001 → … → 0026 dulu, baru 0027.';
  end if;

  if to_regprocedure('public.fn_guard_customer_payment()') is null
     or not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'partner_orders'
         and column_name = 'customer_settled_at'
     ) then
    raise exception
      'Objek migrasi 0026 (fn_guard_customer_payment / partner_orders.customer_settled_at) belum ada. Jalankan 0026 dulu, baru 0027.';
  end if;
end;
$$;

-- ── 1. Kolom tanggal lunas SUNGGUHAN ────────────────────────
--
-- customer_settled_on: NULLABLE, TANPA DEFAULT, `date` MURNI, DIISI TANGAN.
--
-- Namanya sengaja `_on` (bukan `_at`) dan itu BUKAN kosmetik: di seluruh
-- basis data ini `_at` berarti timestamptz yang dipasang mesin
-- (created_at, delivered_at, customer_settled_at), sedangkan tanggal
-- kalender yang diketik manusia memakai bentuk lain (customer_dp_paid_at
-- adalah pengecualian penamaan yang SUDAH terlanjur ada, doc_date tidak).
-- Dua kolom yang duduk BERSEBELAHAN di layar yang sama dan hanya berbeda
-- satu huruf akan tertukar cepat atau lambat — sufiks yang berbeda membuat
-- `customer_settled_at` vs `customer_settled_on` terbaca sebagai dua hal
-- berbeda pada pandangan pertama, di SQL maupun di kode aplikasi.
--
-- `date`, BUKAN `timestamptz` (alasan yang sama dengan customer_dp_paid_at
-- dan order_documents.doc_date): yang dicatat kantor adalah HARI KALENDER
-- dari kertas lama — "12 Maret", bukan sebuah titik waktu. Menyimpannya
-- sebagai timestamptz akan membuat tanggalnya bergeser sehari tergantung
-- zona waktu server saat dirender.
--
-- LESSONS #44 dipatuhi: nullable, TANPA default, jadi ADD COLUMN ini murni
-- operasi metadata (tidak menulis ulang tabel, tidak mengevaluasi per
-- baris, tidak memicu SATU PUN row trigger). TIDAK ada backfill di berkas
-- ini — nilai lama TIDAK bisa ditebak dari kolom mana pun, dan menebaknya
-- (mis. menyalin customer_settled_at) akan mengisi kolom "tanggal
-- sungguhan" dengan tanggal yang justru BUKAN sungguhan, yaitu tepat
-- kebohongan yang berkas ini dibuat untuk menghindari.
alter table public.partner_orders
  add column if not exists customer_settled_on date;

-- Tanpa CHECK sama sekali — lihat "YANG SENGAJA TIDAK DIBUKA" di kepala
-- berkas. Karena itu tidak ada blok conname-guard di sini; house rule
-- "CHECK ditambahkan TERPISAH dari ADD COLUMN IF NOT EXISTS" tidak punya
-- yang perlu dikerjakan pada berkas ini.

-- ── 2. Trigger 0026 TIDAK disentuh (dibuktikan, bukan dijanjikan) ──
--
-- Berkas ini TIDAK memuat satu pun `create or replace function
-- fn_guard_customer_payment` — jadi cap sistem tetap berperilaku persis
-- seperti 0026 dan kolom baru di atas lewat begitu saja tanpa disentuh
-- siapa pun. Klaim itu diverifikasi di §5 lewat DUA angka:
--   GUARD_FN_STILL_PRESENT           1  ← fungsinya masih ada
--   GUARD_FN_IGNORES_SETTLED_ON      0  ← prosrc-nya TIDAK menyebut
--                                        customer_settled_on
-- Angka kedua itu penting justru karena "0": ia menangkap kesalahan yang
-- paling mungkin terjadi di masa depan — seseorang menambahkan logika
-- turunan ke kolom yang seharusnya murni isi tangan.

-- ── 3. RLS: TIDAK ADA yang ditambahkan (diverifikasi, bukan diasumsikan) ──
--
-- Kolom baru pada tabel ber-RLS otomatis tunduk pada policy yang sudah ada;
-- cabang menulisnya lewat `o_partner_update` (0005), jalur yang SAMA dengan
-- customer_dp_paid_at dan empat kolom 0026 lain. Berkas ini NOL
-- create/drop policy — §5 menghitung ulang policy `partner_orders` dan
-- mengharuskan angkanya TETAP 4.

-- ── 4. fn_audit_row TIDAK didefinisikan ulang ────────────────
--
-- Alasan lengkap di kepala berkas. §5 memverifikasinya lewat penanda versi
-- TERBARU yang ada, sama seperti 0026: fungsi aktif harus MASIH memuat
-- pemetaan 'PRODUCT_COLOR' (dipasang 0025 — berkas bernomor TERBESAR yang
-- mendefinisikan ulang fungsi ini; 0026 dan 0027 tidak menyentuhnya).
-- Memeriksa penanda yang lebih tua tidak membuktikan apa-apa: ia lolos di
-- versi mana pun sejak 0021, termasuk versi yang sudah kehilangan 0025.

-- ── 5. Verifikasi bagian A — STRUKTUR (hasilnya di-copy balik) ──
-- Angka yang diharapkan — cocokkan SATU PER SATU. "Run tanpa tulisan merah"
-- BUKAN bukti (LESSONS #7 & #16).
--
-- KOLOM
--   SETTLED_ON_COLUMN                1   ← ada
--   SETTLED_ON_IS_DATE               1   ← type `date` (BUKAN timestamptz)
--   SETTLED_ON_NULLABLE              1
--   SETTLED_ON_NO_DEFAULT            0   ← WAJIB 0: TIDAK ada DEFAULT
--   SETTLED_ON_NO_CHECK              0   ← WAJIB 0: TIDAK ada CHECK yang
--                                        menyebut kolom ini (disengaja)
-- PASANGANNYA DARI 0026 MASIH UTUH
--   SETTLED_AT_STILL_TIMESTAMPTZ     1   ← cap sistem tidak berubah tipe
--   DP_PAID_AT_STILL_DATE            1   ← saudara sepolanya masih ada
-- TRIGGER 0026 (§2)
--   GUARD_FN_STILL_PRESENT           1
--   GUARD_TRIGGER_STILL_PRESENT      1   ← trg_order_customer_payment
--   GUARD_FN_IGNORES_SETTLED_ON      0   ← WAJIB 0, lihat §2
-- RLS (§3)
--   ORDER_POLICIES_UNCHANGED         4   ← WAJIB TETAP 4: o_admin_all,
--                                        o_partner_read, o_partner_insert,
--                                        o_partner_update
-- AUDIT (§4)
--   AUDIT_ROW_UNTOUCHED_MARKER       1   ← fn_audit_row aktif MASIH memuat
--                                        pemetaan PRODUCT_COLOR (0025)
select 'SETTLED_ON_COLUMN' as check_type, count(*)::text as result
from information_schema.columns
where table_schema = 'public' and table_name = 'partner_orders'
  and column_name = 'customer_settled_on'
union all
select 'SETTLED_ON_IS_DATE', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'partner_orders'
  and column_name = 'customer_settled_on' and data_type = 'date'
union all
select 'SETTLED_ON_NULLABLE', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'partner_orders'
  and column_name = 'customer_settled_on' and is_nullable = 'YES'
union all
select 'SETTLED_ON_NO_DEFAULT', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'partner_orders'
  and column_name = 'customer_settled_on' and column_default is not null
union all
select 'SETTLED_ON_NO_CHECK', count(*)::text
from pg_constraint
where conrelid = 'public.partner_orders'::regclass and contype = 'c'
  and pg_get_constraintdef(oid) like '%customer_settled_on%'
union all
select 'SETTLED_AT_STILL_TIMESTAMPTZ', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'partner_orders'
  and column_name = 'customer_settled_at' and data_type = 'timestamp with time zone'
union all
select 'DP_PAID_AT_STILL_DATE', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'partner_orders'
  and column_name = 'customer_dp_paid_at' and data_type = 'date'
union all
select 'GUARD_FN_STILL_PRESENT', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_guard_customer_payment'
union all
select 'GUARD_TRIGGER_STILL_PRESENT', count(*)::text
from pg_trigger
where tgrelid = 'public.partner_orders'::regclass
  and tgname = 'trg_order_customer_payment' and not tgisinternal
union all
select 'GUARD_FN_IGNORES_SETTLED_ON', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_guard_customer_payment'
  and p.prosrc like '%customer_settled_on%'
union all
select 'ORDER_POLICIES_UNCHANGED', count(*)::text
from pg_policies
where schemaname = 'public' and tablename = 'partner_orders'
union all
select 'AUDIT_ROW_UNTOUCHED_MARKER', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%''PRODUCT_COLOR''%';

-- ── 6. Verifikasi bagian B — PERILAKU ────────────────────────
--
-- SENGAJA TIDAK ADA di berkas ini, dan itu keputusan yang dikoreksi dari
-- pengalaman: versi awal 0026 sempat menguji perilaku dengan meng-UPDATE
-- baris pesanan SUNGGUHAN di database produksi, memakai constraint yang
-- sedang diuji itu sendiri sebagai jaring pengaman. Uji perilaku yang
-- MENULIS baris tinggal di `supabase/test-harness/`, dibungkus transaksi
-- yang SELALU rollback — bukan di berkas migrasi yang di-paste owner ke
-- SQL Editor produksi.
--
-- Uji perilaku kolom ini ada di `supabase/test-harness/120_behavior_0027.sql`:
--   - kolom menerima tanggal isi tangan, dan trigger 0026 TIDAK menghapusnya
--   - mengisi kolom ini TIDAK mengubah customer_settled_at sedikit pun
--   - cap sistem tetap dipaksa server walau kolom ini diisi bersamaan
--   - kolom ini boleh diisi pada pesanan yang statusnya BUKAN lunas
--     (justru kasus pindahan data lama — lihat kepala berkas)
