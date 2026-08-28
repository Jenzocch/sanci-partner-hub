-- ============================================================
-- 0024 — sanci_products.size (ukuran produk)
--
-- KENAPA: katalog sekarang menghadap PELANGGAN (halaman produk publik
-- `/p/[productId]` dan halaman detail cabang, irisan 0022). Ukuran adalah
-- hal PERTAMA yang ditanyakan pembeli kasur/ranjang, dan sampai sekarang ia
-- hanya hidup di dalam kalimat `description` — tidak bisa ditampilkan
-- sebagai baris spesifikasi tersendiri, tidak bisa dibandingkan antar
-- produk. Owner meminta "把 Description 跟 size 放進去" (2026-08-28).
--
-- BENTUK: SATU kolom text nullable. SENGAJA text bebas, BUKAN angka
-- terstruktur (lebar/panjang/tinggi terpisah) dan BUKAN CHECK constraint:
-- nilai nyata di data owner mencakup "180*200*30", "(1200-1550)*1200"
-- (meja yang bisa dipanjangkan), dan "60*36*9/7" (bantal dengan dua
-- ketinggian). Memaksakan skema angka akan MENOLAK data yang sah hari ini.
-- Kelas yang sama dengan `shipping_address` (0014) dan `customer_po`
-- (0020): text polos tanpa CHECK, divalidasi oleh mata manusia.
--
-- YANG TIDAK DILAKUKAN BERKAS INI (disengaja):
--   * TIDAK menyentuh RLS `sanci_products` — kolom baru otomatis ikut
--     policy yang sudah ada (sp_admin_all / sp_partner_read / sp_anon_read).
--     Konsekuensi yang DISADARI: ukuran ikut terbaca anon di halaman
--     publik — itu memang tujuannya (spesifikasi produk untuk calon
--     pembeli), dan ukuran bukan data rahasia. Harga TETAP tidak ada di
--     tabel ini sama sekali (aturan 0010, ditegaskan ulang di verifikasi).
--   * TIDAK mendefinisikan ulang `fn_audit_row` — kolom baru otomatis
--     tercakup lewat `to_jsonb(new)`/`to_jsonb(old)` di fungsi itu
--     (preseden persis sama: 0014 shipping_address, 0020 customer_po).
--     Perubahan ukuran akan muncul sebagai PRODUCT_UPDATED dengan diff
--     before/after seperti kolom produk lain.
--   * TIDAK menambah trigger/constraint apa pun (pola bahaya LESSONS
--     #35/#37 tidak mungkin terjadi di berkas ini).
--   * TIDAK mengisi datanya — pengisian dilakukan terpisah lewat skrip
--     UPDATE yang diberikan ke owner, supaya data dan skema bisa
--     diverifikasi sendiri-sendiri.
--
-- ATURAN BESI: berkas ini TIDAK mendefinisikan ulang fungsi/policy milik
-- berkas mana pun, jadi menjalankannya ulang tidak pernah mencabut hasil
-- kerja berkas lain, dan menjalankan ulang berkas lama tidak menghapus
-- kolom ini (`add column if not exists`). Pemulih `fn_audit_row` tetap
-- 0022 — 0024 tidak ikut campur.
-- ============================================================

-- ── §0. Prasyarat ──
-- Memeriksa KEBERADAAN objek berkas sebelumnya (bukan versi aktif sebuah
-- fungsi) — LESSONS #41: guard yang memeriksa versi fungsi akan mengunci
-- jalur pemulihannya sendiri.
do $$
begin
  if to_regclass('public.sanci_products') is null then
    raise exception
      'Tabel sanci_products belum ada. Jalankan 0001 → … → 0022 dulu, baru 0024.';
  end if;
end;
$$;

-- ── §1. Kolom ──
alter table public.sanci_products
  add column if not exists size text;

comment on column public.sanci_products.size is
  'Ukuran produk sebagai TEKS BEBAS, mis. "180*200*30", "(1200-1550)*1200", '
  '"60*36*9/7". Sengaja tanpa CHECK/skema angka — lihat kepala 0024.';

-- ── §2. Verifikasi ──
-- Jalankan bagian ini dan COCOKKAN angkanya satu per satu.
--
--   SIZE_COLUMN_EXISTS        1   ← kolom size ada
--   SIZE_IS_TEXT              1   ← bertipe text (bukan angka)
--   SIZE_IS_NULLABLE          1   ← nullable (produk boleh tanpa ukuran)
--   SIZE_NO_CHECK             0   ← WAJIB 0: tidak ada CHECK constraint
--                                    yang menyebut kolom size
--   PRODUCT_NO_PRICE_COLUMN   0   ← WAJIB 0: aturan 0010 diulang — tabel
--                                    ini TETAP tanpa kolom harga apa pun
--   PRODUCT_POLICIES          3   ← WAJIB TETAP 3 (sp_admin_all +
--                                    sp_partner_read + sp_anon_read dari
--                                    0022) — berkas ini tidak menyentuh RLS
--   AUDIT_UNTOUCHED_0022      1   ← WAJIB 1: fn_audit_row masih versi 0022
--                                    (masih mengenal PRODUCT_PHOTO)
--   AUDIT_UNTOUCHED_0021      1   ← WAJIB 1: pemetaan 0021 juga masih utuh

select 'SIZE_COLUMN_EXISTS' as check_type, count(*)::text as result
from information_schema.columns
where table_schema = 'public' and table_name = 'sanci_products' and column_name = 'size'
union all
select 'SIZE_IS_TEXT', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'sanci_products'
  and column_name = 'size' and data_type = 'text'
union all
select 'SIZE_IS_NULLABLE', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'sanci_products'
  and column_name = 'size' and is_nullable = 'YES'
union all
select 'SIZE_NO_CHECK', count(*)::text
from pg_constraint
where conrelid = 'public.sanci_products'::regclass and contype = 'c'
  and pg_get_constraintdef(oid) like '%size%'
union all
select 'PRODUCT_NO_PRICE_COLUMN', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'sanci_products'
  and column_name in ('price', 'harga', 'unit_price', 'price_unit')
union all
select 'PRODUCT_POLICIES', count(*)::text
from pg_policies where schemaname = 'public' and tablename = 'sanci_products'
union all
select 'AUDIT_UNTOUCHED_0022', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row'
  and p.prosrc like '%''PRODUCT_PHOTO''%'
union all
select 'AUDIT_UNTOUCHED_0021', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row'
  and p.prosrc like '%''PRODUCT_PRICE''%';
