-- ============================================================
-- SANCI Partner Hub — Phase 2 irisan kedua puluh lima
-- Migration 0030: Penanda "Akan dihentikan / 即將停產" pada produk
-- Jalankan di: Supabase Studio → SQL Editor → paste seluruh file → Run
--
-- PRASYARAT: 0001 → … → 0029 sudah dijalankan, DALAM URUTAN ITU.
-- BERKAS INI ATOMIK: tanpa `commit;` di tengah.
--
-- ============================================================
-- LATAR BELAKANG (owner 2026-09-22)
-- ============================================================
--
-- "備註有的東西可能停產 可以新增勾選, 有提示才能讓業務提前知道" — sebagian
-- produk akan berhenti diproduksi, dan selama ini satu-satunya tempat
-- menuliskannya adalah teks bebas di deskripsi, yang tidak dibaca siapa pun
-- saat sedang menawarkan barang ke pelanggan.
--
-- SENGAJA KOLOM TERPISAH, BUKAN nilai stock_status keempat:
--   stock_status menjawab "ADA barangnya atau tidak SEKARANG"
--   (AVAILABLE/LIMITED/OUT_OF_STOCK). "Akan dihentikan" menjawab pertanyaan
--   LAIN: "setelah yang ada habis, masih bisa dipesan lagi atau tidak".
--   Keduanya bisa benar bersamaan — produk yang akan dihentikan justru
--   sering MASIH ada stoknya (stok terakhir). Kalau digabung ke stock_status,
--   admin dipaksa memilih salah satu dan satu informasi hilang: "Tersedia"
--   menyembunyikan penghentiannya, "Dihentikan" menyembunyikan bahwa masih
--   ada barang. Yang dibutuhkan sales adalah KEDUANYA: "masih ada 2, tapi
--   jangan janjikan pesan ulang".
--
-- ============================================================
-- YANG DIBUKA IRISAN INI (dan hanya ini)
-- ============================================================
--   SATU kolom BARU `sanci_products.discontinued` boolean NOT NULL DEFAULT
--   false (LESSONS #8 — default paling aman: produk yang sudah ada TIDAK
--   tiba-tiba ditandai berhenti).
--
-- YANG SENGAJA TIDAK DIBUKA:
--   * Tidak ada kolom catatan/alasan. Teks bebas di tabel ini ikut terbaca
--     ANON lewat `sp_anon_read` (0022) — alasan penghentian ("supplier
--     tutup", "sisa 3 unit") adalah informasi internal. Boolean-nya sendiri
--     setara stock_status: status produk, bukan rahasia. Halaman publik
--     /p/[productId] tetap memilih kolomnya EKSPLISIT dan tidak menampilkan
--     penanda ini.
--   * RLS `sanci_products` TIDAK disentuh (kolom baru ikut ketiga policy
--     0010+0022 apa adanya).
--   * `fn_audit_row` TIDAK didefinisikan ulang — kolom baru otomatis ikut
--     lewat `to_jsonb` (preseden 0014/0020/0024/0026/0027).
--   * TIDAK menyentuh `sanci_products` di luar satu kolom ini; asersi 0010
--     PRODUCT_NO_PRICE_COLUMN = 0 DIULANG di §2.
-- ============================================================

-- ── 0. Pengaman prasyarat ────────────────────────────────────
do $$
begin
  if to_regclass('public.sanci_products') is null then
    raise exception 'Tabel sanci_products belum ada. Jalankan 0001 → … → 0029 dulu, baru 0030.';
  end if;
  if to_regclass('public.partner_proposals') is null then
    raise exception 'partner_proposals (0029) belum ada — rantai migrasi belum lengkap. Jalankan 0029 dulu, baru 0030.';
  end if;
end;
$$;

-- ── 1. Kolom ─────────────────────────────────────────────────
alter table public.sanci_products
  add column if not exists discontinued boolean not null default false;

-- ── 2. Verifikasi — STRUKTUR (hasilnya di-copy balik) ────────
--   DISCONTINUED_COLUMN        1   ← kolomnya ada
--   DISCONTINUED_NOT_NULL      1   ← NOT NULL (tidak ada keadaan "tidak tahu")
--   DISCONTINUED_DEFAULT_FALSE 1   ← default false
--   DISCONTINUED_TRUE_ROWS     0   ← tidak ada produk lama yang ikut tertandai
--   PRODUCT_POLICIES           3   ← RLS sanci_products tidak berubah (0010+0022)
--   PRODUCT_NO_PRICE_COLUMN    0   ← rujukan 0010, DIULANG
--   AUDIT_STILL_0025           1   ← fn_audit_row tidak disentuh
select 'DISCONTINUED_COLUMN' as check_type,
       (select count(*)::text from information_schema.columns
        where table_schema='public' and table_name='sanci_products' and column_name='discontinued') as result
union all
select 'DISCONTINUED_NOT_NULL',
       (select count(*)::text from information_schema.columns
        where table_schema='public' and table_name='sanci_products'
          and column_name='discontinued' and is_nullable='NO')
union all
select 'DISCONTINUED_DEFAULT_FALSE',
       (select count(*)::text from information_schema.columns
        where table_schema='public' and table_name='sanci_products'
          and column_name='discontinued' and column_default='false')
union all
select 'DISCONTINUED_TRUE_ROWS',
       (select count(*)::text from public.sanci_products where discontinued)
union all
select 'PRODUCT_POLICIES',
       (select count(*)::text from pg_policies where schemaname='public' and tablename='sanci_products')
union all
select 'PRODUCT_NO_PRICE_COLUMN',
       (select count(*)::text from information_schema.columns
        where table_schema='public' and table_name='sanci_products'
          and column_name in ('price','harga','unit_price','base_price'))
union all
select 'AUDIT_STILL_0025',
       (select case when count(*) > 0 then 1 else 0 end::text
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='fn_audit_row' and p.prosrc like '%PRODUCT_COLOR%');
