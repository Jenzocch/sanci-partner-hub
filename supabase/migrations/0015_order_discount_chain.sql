-- ============================================================
-- SANCI Partner Hub — Phase 2 irisan kesembilan
-- Migration 0015: rantai diskon persentase + markup% + potongan tunai per
--                  pesanan, dihitung DATABASE menjadi `final_amount`
--                  (idempotent — aman dijalankan ulang)
-- Jalankan di: Supabase Studio → SQL Editor → paste seluruh file → Run
--
-- PRASYARAT: 0001 → 0003 → 0004 → 0005 → 0006 → 0007 → 0008 → 0009 → 0010 →
-- 0011 → 0012 → 0013 → 0014 sudah dijalankan, DALAM URUTAN ITU. Blok pengaman
-- di bawah berhenti dengan pesan jelas kalau belum. Setelah berkas ini, rantai
-- penuhnya menjadi 0001 → 0003 → … → 0013 → 0014 → 0015 (lihat
-- migrations/README.md — ATURAN BESI).
--
-- ============================================================
-- MENYAMBUNG KEPUTUSAN YANG DITAHAN 0014 — konflik SUDAH dipecahkan
-- ============================================================
--
-- 0014 (`dc223a2`+1) menahan pembangunan mesin hitung diskon karena bentrok
-- LANGSUNG dengan dua kalimat yang ditulis di commit yang sama dengan awal
-- rantai (`0013`): "sistem tidak menghitung diskon apa pun" (GLOSSARY.md) dan
-- "系统不算任何东西" (FEATURES.md irisan ketujuh). 0014 melaporkan konflik itu
-- eksplisit ke Jenzo, tidak memilih sisi sendiri (LESSONS #34).
--
-- Jenzo SUDAH memutuskan (2026-08-20, dicatat FEATURES.md §"衝突已裁決" dan
-- GLOSSARY.md §"订单层级的折扣链计算"): kalimat "tidak menghitung diskon" itu
-- sendiri adalah OVER-GENERALISASI oleh agen 0013 dari batas 0009/0010 lama
-- ("katalog tanpa harga, nilai penawaran diketik manusia") — ditulis SEBELUM
-- Jenzo menjelaskan algoritma diskonnya, dan waktu penjelasan Jenzo (yang
-- MEMANG datang kemudian) mengalahkannya. Keputusan final: rantai diskon
-- TINGKAT PESANAN dihitung database; batas 0010 "katalog tanpa harga" TETAP
-- berlaku penuh (ini harga sepakat SATU pesanan, bukan harga produk).
--
-- Algoritma (dikonfirmasi Jenzo dengan algoritma verbatim):
--   nilai_dasar → kalikan berurutan (1 - diskon_ke_n/100) untuk SETIAP diskon
--   dalam rantai (bukan dijumlah — 8% lalu 10% = ×0.92×0.90, BUKAN 18%)
--   → kalikan (1 + markup%/100) kalau ada → kurangi potongan tunai (dipakai
--   untuk 去尾数/pembulatan ke angka bulat atau kesepakatan tunai) → itulah
--   final_amount.
--   Contoh yang dikonfirmasi Jenzo kata demi kata:
--     10.000.000 → −8% → 9.200.000 → −10% → 8.280.000 → +10% markup →
--     9.108.000 → −8.000 tunai → 9.100.000.
-- ============================================================
--
-- ============================================================
-- APA YANG DIBUKA IRISAN INI (dan hanya ini)
-- ============================================================
--   order_sanci_offers → 4 kolom baru: discount_pcts (jsonb, array persen
--                        berurutan), markup_pct (opsional), cash_discount
--                        (default 0), final_amount (WAJIB, DIHITUNG TRIGGER —
--                        tidak pernah dipercaya dari client). Constraint
--                        dp_amount<=amount (0014) DIGANTI dp_amount<=final_amount
--                        (final_amount adalah nilai yang SUNGGUH harus dibayar).
--   partner_access_policies → 1 kolom baru: can_discount (DEFAULT false,
--                        fail-closed) — flag ketiga yang 0014 sengaja TIDAK
--                        bangun karena belum ada mesin hitung untuk diberi izin.
--
-- YANG SENGAJA TIDAK DIBUKA:
--   * Diskon PER-BARIS (order_items). `unit_price`/`line_discount` (0014)
--     TETAP angka absolut yang diketik manusia, TIDAK menerima persentase.
--     Rantai diskon di berkas ini murni TINGKAT PESANAN (order_sanci_offers).
--   * Pembulatan otomatis di luar `cash_discount`. "去尾数" dilakukan manusia
--     dengan mengisi cash_discount sampai angkanya bulat — database tidak
--     menebak pembulatan yang "pantas".
--   * Harga di katalog produk. Batas 0010 tetap berlaku penuh — lihat di atas.
--   * Dokumen cetak (SO/DO/Invoice). Tetap irisan terpisah berikutnya.
-- ============================================================

-- ── 0. Pengaman prasyarat ───────────────────────────────────

do $$
begin
  if to_regclass('public.order_items') is null
     or not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'partner_access_policies'
         and column_name = 'can_edit_offer')
     or not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'order_sanci_offers'
         and column_name = 'dp_amount') then
    raise exception
      'Migration 0014_permissions_items_shipping.sql belum dijalankan di database ini. Jalankan 0001 → … → 0014 dulu, baru 0015.';
  end if;

  if to_regprocedure('public.fn_audit_row()') is null
     or to_regprocedure('public.fn_touch_updated_at()') is null
     or to_regprocedure('public.fn_set_created_by()') is null
     or to_regprocedure('public.fn_is_admin()') is null then
    raise exception
      'Fungsi dasar (fn_audit_row / fn_touch_updated_at / fn_set_created_by / fn_is_admin) belum lengkap. Jalankan 0001 → … → 0014 dulu, baru 0015.';
  end if;
end;
$$;

-- ── 1. partner_access_policies: flag izin ketiga ────────────

-- DEFAULT false — fail-closed (LESSONS #8), sama filosofinya dengan
-- can_view_offer/can_edit_offer (0014). Partner yang belum pernah disentuh
-- admin di sini TIDAK bisa mengisi rantai diskon walau punya can_edit_offer —
-- dua keputusan komersial yang berbeda beratnya (nilai dasar vs diskon di
-- atasnya) sengaja punya saklar terpisah.
alter table public.partner_access_policies
  add column if not exists can_discount boolean not null default false;

-- ── 2. order_sanci_offers: kolom rantai diskon ──────────────

-- discount_pcts: jsonb, BUKAN numeric[] — array JSON lebih gampang dikirim
-- lewat REST/JS tanpa konversi tipe khusus, dan bentuk arraynya sendiri yang
-- menyatakan urutan (elemen pertama diterapkan lebih dulu). DEFAULT '[]'
-- (rantai kosong = tidak ada diskon), NOT NULL — "tidak ada diskon" punya
-- bentuknya sendiri (array kosong), bukan null yang ambigu.
--
-- SENGAJA TANPA CHECK constraint untuk bentuknya (array, elemen numerik,
-- rentang, jumlah maksimum) — jsonb tidak punya operator CHECK yang bisa
-- memeriksa "apakah semua elemen array ini angka antara 0 dan 100" tanpa kode
-- prosedural. Validasi hidup di trigger BEFORE (§5), yang bisa memberi PESAN
-- JELAS per jenis pelanggaran — CHECK constraint yang gagal hanya melempar
-- kode mentah 23514 tanpa konteks (LESSONS #10).
alter table public.order_sanci_offers
  add column if not exists discount_pcts jsonb not null default '[]'::jsonb;

-- markup_pct: nullable (kebanyakan pesanan TIDAK punya markup — "opsional"
-- di sini berarti kolom itu sendiri, bukan array kosong seperti discount_pcts,
-- karena markup adalah SATU angka, bukan rantai). Rentang 0–100 adalah
-- pemeriksaan sederhana pada SATU nilai — cukup CHECK biasa, tidak perlu
-- trigger.
alter table public.order_sanci_offers
  add column if not exists markup_pct numeric(5,2);

-- cash_discount: NOT NULL DEFAULT 0 (sama pola dengan dp_amount 0014 —
-- "belum ada potongan tunai" secara alami adalah nol rupiah, beda dari
-- `amount` 0013 yang justru sengaja tidak punya default karena "belum ada
-- penawaran" punya bentuknya sendiri di tingkat BARIS, bukan kolom).
alter table public.order_sanci_offers
  add column if not exists cash_discount numeric(15,2) not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint
                 where conname = 'order_sanci_offers_markup_pct_check'
                   and conrelid = 'public.order_sanci_offers'::regclass) then
    alter table public.order_sanci_offers
      add constraint order_sanci_offers_markup_pct_check
      check (markup_pct is null or (markup_pct >= 0 and markup_pct <= 100));
  end if;
  if not exists (select 1 from pg_constraint
                 where conname = 'order_sanci_offers_cash_discount_check'
                   and conrelid = 'public.order_sanci_offers'::regclass) then
    alter table public.order_sanci_offers
      add constraint order_sanci_offers_cash_discount_check
      check (cash_discount >= 0);
  end if;
end;
$$;

-- ── 3. order_sanci_offers: final_amount (kolom yang dihitung) ──

-- Ditambahkan NULLABLE dulu — tabel ini mungkin SUDAH punya baris produksi
-- (Jenzo bisa saja menjalankan 0014 lalu memakainya sebelum sempat menjalankan
-- 0015). Backfill di bawah mengisinya, BARU kolomnya dikunci NOT NULL — pola
-- yang sama dipakai `partner_purchase_amount` (0009) dan kolom lain yang lahir
-- di atas tabel yang sudah berisi data.
alter table public.order_sanci_offers
  add column if not exists final_amount numeric(15,2);

-- Backfill: AMAN ditulis `= amount` langsung (bukan rumus penuh) karena pada
-- SAAT INI dalam migrasi yang SAMA, discount_pcts/markup_pct/cash_discount
-- BARU SAJA mendapat nilai bawaannya untuk SETIAP baris yang sudah ada
-- (array kosong / null / nol) — rumus penuh
-- `amount × ∏(1-d/100) × (1+markup/100) - cash` runtuh menjadi `amount` persis
-- untuk kombinasi itu (produk atas himpunan kosong = 1, markup 0% = ×1,
-- potongan tunai 0 = tidak mengurangi apa pun). Baris LAMA yang sudah punya
-- nilai penawaran tetap berarti nilai itu, apa adanya — tidak ada diskon yang
-- "diam-diam muncul" dari backfill ini.
update public.order_sanci_offers
set final_amount = amount
where final_amount is null;

alter table public.order_sanci_offers
  alter column final_amount set not null;

-- ── 4. dp_amount <= final_amount (GANTI dp_amount <= amount 0014) ──

-- KENAPA DIGANTI: `amount` (0013) adalah nilai penawaran SEBELUM rantai
-- diskon/markup/potongan tunai; `final_amount` adalah nilai yang SUNGGUH harus
-- dibayar pelanggan SETELAH semuanya diterapkan. DP dibandingkan dengan uang
-- yang benar-benar akan diminta, bukan angka perantara — membandingkannya
-- dengan `amount` yang lama akan membiarkan DP melebihi tagihan sungguhan
-- kalau rantai diskonnya menurunkan harga (dan sebaliknya menolak DP yang sah
-- kalau markup menaikkannya).
--
-- Blok ini menangani KEDUA keadaan secara idempoten: constraint lama
-- (`order_sanci_offers_dp_le_amount_check`, dari 0014) mungkin MASIH ADA
-- (baru pertama kali 0015 dijalankan) atau SUDAH TIDAK ADA (0015 sudah
-- pernah dijalankan sebelumnya) — kedua keadaan berakhir sama: constraint
-- lama tidak ada, constraint baru ada.
do $$
begin
  if exists (select 1 from pg_constraint
             where conname = 'order_sanci_offers_dp_le_amount_check'
               and conrelid = 'public.order_sanci_offers'::regclass) then
    alter table public.order_sanci_offers
      drop constraint order_sanci_offers_dp_le_amount_check;
  end if;
  if not exists (select 1 from pg_constraint
                 where conname = 'order_sanci_offers_dp_le_final_check'
                   and conrelid = 'public.order_sanci_offers'::regclass) then
    alter table public.order_sanci_offers
      add constraint order_sanci_offers_dp_le_final_check
      check (dp_amount <= final_amount);
  end if;
end;
$$;

-- ── 5. Trigger: validasi rantai diskon + hitung final_amount ──

-- SECURITY INVOKER (bawaan) — hanya membaca/menulis kolom pada BARIS INI
-- sendiri (NEW), tidak membaca tabel lain, jadi tidak perlu melewati RLS
-- siapa pun (beda dari fn_guard_order_offer_discount_fields di §6, yang
-- membaca partner_orders + partner_access_policies).
--
-- Validasi array (LESSONS pola sama dengan 0010/0012 — pesan jelas per jenis
-- pelanggaran, bukan kode mentah):
--   * discount_pcts harus array (jsonb_typeof = 'array'), bukan objek/angka/teks.
--   * maksimal 6 elemen (sales/manajer bisa menumpuk beberapa diskon, tapi
--     rantai yang sangat panjang kemungkinan besar salah input).
--   * setiap elemen harus angka (jsonb_typeof = 'number'), > 0 dan < 100 —
--     0% bukan diskon (harusnya tidak usah ditambah ke rantai), 100% berarti
--     gratis total yang hampir pasti salah ketik, dan negatif bukan diskon
--     sama sekali.
--
-- Perhitungan: numeric SELURUHNYA (kolom-kolomnya numeric, aritmetikanya ikut
-- numeric secara otomatis — TIDAK ada konversi ke float/double di mana pun),
-- SATU kali round() di baris paling akhir — bukan dibulatkan setiap langkah,
-- supaya galat pembulatan tidak menumpuk lewat rantai yang panjang.
--
-- `new.final_amount` DITIMPA TANPA SYARAT di baris terakhir — apa pun yang
-- dikirim client untuk kolom ini (termasuk kalau seseorang mencoba mengarang
-- nilai lewat devtools) tidak pernah dipakai. Zero-trust yang sama seperti
-- `updated_at` (fn_touch_updated_at) dan `created_by` (fn_set_created_by).
create or replace function public.fn_compute_order_offer_final() returns trigger
language plpgsql security invoker set search_path = public as $$
declare
  v_arr jsonb;
  v_elem jsonb;
  v_num numeric;
  v_count integer := 0;
  v_mult numeric := 1;
  v_final numeric;
begin
  v_arr := coalesce(new.discount_pcts, '[]'::jsonb);

  if jsonb_typeof(v_arr) is distinct from 'array' then
    raise exception
      'discount_pcts harus berupa daftar (array) angka persen, contoh: [8, 10]. Ditemukan: %',
      v_arr;
  end if;

  for v_elem in select * from jsonb_array_elements(v_arr) loop
    v_count := v_count + 1;
    if v_count > 6 then
      raise exception
        'discount_pcts maksimal 6 nilai persen dalam satu rantai diskon (ditemukan lebih).';
    end if;
    if jsonb_typeof(v_elem) is distinct from 'number' then
      raise exception
        'Setiap nilai di discount_pcts harus berupa angka persen. Ditemukan nilai bukan angka: %',
        v_elem;
    end if;
    v_num := (v_elem::text)::numeric;
    if v_num <= 0 or v_num >= 100 then
      raise exception
        'Setiap persen diskon dalam rantai harus lebih dari 0 dan kurang dari 100. Ditemukan: %',
        v_num;
    end if;
    v_mult := v_mult * (1 - v_num / 100);
  end loop;

  -- Normalisasi: null → array kosong tersimpan sebagai '[]' sungguhan, bukan
  -- null yang lolos lewat coalesce hanya untuk perhitungan tapi tidak untuk
  -- baris yang tersimpan (kolom sudah NOT NULL, tapi jaga-jaga path INSERT
  -- yang mengirim literal null secara eksplisit).
  new.discount_pcts := v_arr;

  v_final := round(
    new.amount
    * v_mult
    * (1 + coalesce(new.markup_pct, 0) / 100)
    - coalesce(new.cash_discount, 0)
  , 2);

  if v_final < 0 then
    raise exception
      'Kombinasi diskon/markup/potongan tunai menghasilkan nilai akhir negatif (Rp %). Periksa kembali nilai-nilainya — diskon/markup terlalu besar atau potongan tunai melebihi sisa setelah diskon.',
      v_final;
  end if;

  new.final_amount := v_final;
  return new;
end;
$$;

drop trigger if exists trg_order_offer_final_compute on public.order_sanci_offers;
create trigger trg_order_offer_final_compute before insert or update on public.order_sanci_offers
  for each row execute function public.fn_compute_order_offer_final();

-- ── 6. Trigger: gerbang can_discount pada kolom rantai diskon ──

-- Pola SAMA PERSIS dengan fn_guard_order_item_price_cols (0014 §7 — "0014
-- has the pattern for price-guarding"): RLS bekerja per BARIS, bukan per
-- KOLOM, jadi seorang cabang yang boleh menulis BARIS ini sama sekali
-- (karena punya can_edit_offer — itulah yang membuat oso_partner_insert/
-- oso_partner_update di 0014 meloloskan UPDATE-nya) tetap bisa lewat RLS
-- menulis UPDATE ke kolom discount_pcts/markup_pct/cash_discount pada baris
-- yang SAMA. Trigger inilah yang membedakan "boleh ubah nilai dasar/DP/
-- kondisi pembayaran" dari "boleh ubah rantai diskon".
--
-- MATRIKS FLAG → KOLOM (final, didokumentasikan di sini supaya tidak perlu
-- dicari-cari lagi):
--   admin SANCI          → SEMUA kolom, selalu (fn_is_admin() melepas trigger
--                           ini DAN tidak pernah kena RLS oso_partner_*).
--   can_view_offer saja   → baca SAJA (oso_partner_read, 0014) — kolom baru
--                           di berkas ini (discount_pcts dst) IKUT terbaca,
--                           karena RLS bekerja per BARIS: melihat baris berarti
--                           melihat SEMUA kolomnya, tidak ada gerbang kolom
--                           untuk SELECT. Rantai diskon BUKAN rahasia yang
--                           lebih besar dari nilai penawaran itu sendiri.
--   can_edit_offer TANPA
--   can_discount           → RLS (0014, TIDAK diubah berkas ini) meloloskan
--                           INSERT/UPDATE baris — jadi partner ini BISA menulis
--                           amount/dp_amount/payment_condition. Kalau baris yang
--                           sama JUGA mengubah discount_pcts/markup_pct/
--                           cash_discount, trigger INI menolaknya (exception).
--                           Menulis amount SAJA (tanpa menyentuh tiga kolom
--                           diskon) tetap berhasil seperti sebelum berkas ini.
--   can_discount TANPA
--   can_edit_offer         → TIDAK BERGUNA SENDIRIAN — RLS oso_partner_insert/
--                           oso_partner_update (0014) mensyaratkan can_edit_offer
--                           untuk SELURUH baris, bukan per kolom, dan berkas
--                           ini SENGAJA tidak melebarkan policy itu (lihat
--                           §7 di bawah kenapa). Jadi partner dengan
--                           can_discount=true tapi can_edit_offer=false tetap
--                           mendapat 0 baris tertulis dari RLS SEBELUM trigger
--                           ini sempat dievaluasi. Ini keputusan SADAR, bukan
--                           lubang: can_discount adalah gerbang TAMBAHAN di
--                           ATAS can_edit_offer ("boleh masuk ruangannya dulu,
--                           baru boleh sentuh laci diskon di dalamnya"), sama
--                           persis semantiknya dengan editChecked → viewChecked
--                           di UI OfferPermissionsForm (0014): mengedit
--                           mengandaikan melihat, mengatur diskon mengandaikan
--                           boleh mengedit dasar. Diuji eksplisit di §T (lihat
--                           test-harness).
--   can_edit_offer DAN
--   can_discount           → SEMUA kolom (amount/dp_amount/payment_condition/
--                           discount_pcts/markup_pct/cash_discount) bisa ditulis.
--
-- WAJIB SECURITY DEFINER (LESSONS #15/#26): membaca partner_orders +
-- partner_access_policies, DUA tabel ber-RLS sendiri — tanpa security
-- definer, baris yang tidak terlihat lewat RLS pemanggil akan membuat
-- pemeriksaan ini salah arah secara diam-diam (perilaku fn_guard_order_item_
-- price_cols yang sama, 0014).
create or replace function public.fn_guard_order_offer_discount_fields() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_can_discount boolean;
  v_touches_discount boolean;
begin
  if public.fn_is_admin() then
    return new;
  end if;

  v_touches_discount := case
    when tg_op = 'INSERT' then
      jsonb_array_length(coalesce(new.discount_pcts, '[]'::jsonb)) > 0
      or new.markup_pct is not null
      or coalesce(new.cash_discount, 0) <> 0
    else
      new.discount_pcts is distinct from old.discount_pcts
      or new.markup_pct is distinct from old.markup_pct
      or new.cash_discount is distinct from old.cash_discount
    end;

  if not v_touches_discount then
    return new;
  end if;

  select pol.can_discount into v_can_discount
  from partner_orders o
  join partner_access_policies pol on pol.partner_id = o.partner_id
  where o.id = new.order_id;

  if coalesce(v_can_discount, false) is not true then
    raise exception
      'Rantai diskon/markup%%/potongan tunai hanya bisa diisi atau diubah kalau partner punya izin "Boleh mengatur diskon". Nilai penawaran dasar/DP/kondisi pembayaran tetap bisa diubah tanpa izin itu.';
  end if;

  return new;
end;
$$;

-- Nama trigger SENGAJA "discount_guard" (< "final_compute" secara alfabet) —
-- Postgres menjalankan trigger BEFORE untuk event yang sama menurut urutan
-- NAMA, jadi gerbang izin ini dievaluasi LEBIH DULU daripada penghitungan
-- §5. Urutan ini tidak mengubah kebenarannya (kedua trigger membaca NEW yang
-- sama, tidak saling bergantung pada hasil satu sama lain), tapi membuat
-- pengalamannya lebih masuk akal: pengguna tanpa izin melihat pesan "tidak
-- diizinkan" alih-alih pesan "kombinasi menghasilkan negatif" untuk baris
-- yang sebenarnya juga tidak diizinkan ia tulis.
drop trigger if exists trg_order_offer_discount_guard on public.order_sanci_offers;
create trigger trg_order_offer_discount_guard before insert or update on public.order_sanci_offers
  for each row execute function public.fn_guard_order_offer_discount_fields();

-- ── 7. Kenapa RLS oso_partner_insert/oso_partner_update (0014) TIDAK diubah ──

-- Sengaja TIDAK menulis ulang kedua policy itu supaya can_discount menjadi
-- gerbang ATAS can_edit_offer, bukan gerbang SEJAJAR dengannya (lihat matriks
-- §6). Melebarkan RLS menjadi "can_edit_offer OR can_discount" akan
-- mengizinkan partner dengan HANYA can_discount menulis SELURUH baris
-- (termasuk amount/dp_amount/payment_condition) asal ia JUGA menyentuh salah
-- satu kolom diskon dalam permintaan yang sama — trigger §6 memang menolak
-- kombinasi itu KALAU kolom diskon disentuh, tapi tidak menolak kalau
-- permintaan itu HANYA menyentuh amount (trigger §6 melihat v_touches_discount
-- = false dan meloloskannya) — celah yang sama sekali tidak diminta siapa
-- pun. Bentuknya yang sekarang (RLS tetap seperti 0014, trigger baru sebagai
-- gerbang tambahan) adalah satu-satunya yang membuat matriks §6 benar.

-- ── 8. Permukaan EXECUTE (LESSONS #26) ──────────────────────

-- fn_compute_order_offer_final: SECURITY INVOKER, tidak membaca tabel lain —
-- TIDAK perlu direvoke (perannya sama dengan fn_touch_updated_at/
-- fn_set_created_by yang juga tidak pernah direvoke sejak 0001, karena
-- keduanya juga hanya trigger function invoker biasa). Tetap TIDAK berguna
-- dipanggil langsung lewat /rpc/ (mengembalikan trigger, bukan nilai), jadi
-- tidak menjadi permukaan serangan baru walau EXECUTE-nya terbuka.
--
-- fn_guard_order_offer_discount_fields: SECURITY DEFINER, membaca dua tabel
-- ber-RLS — WAJIB direvoke dari public/anon/authenticated, pola sama dengan
-- fn_guard_order_item_price_cols (0014 §9). Mencabut EXECUTE tidak
-- menghentikan trigger-nya (hak diperiksa saat CREATE TRIGGER, bukan saat
-- baris berubah) — pertahanan berlapis, bukan syarat fungsional.
do $$
begin
  execute 'revoke all on function public.fn_guard_order_offer_discount_fields() from public';
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.fn_guard_order_offer_discount_fields() from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.fn_guard_order_offer_discount_fields() from authenticated';
  end if;
end;
$$;

-- ── 9. fn_audit_row: TIDAK didefinisikan ulang ──────────────

-- Ini migrasi PERTAMA sejak 0009 yang TIDAK menyentuh fn_audit_row — ATURAN
-- BESI (migrations/README.md) mewajibkan definisi ULANG UTUH setiap kali
-- sebuah tabel BARU perlu awalan aksi baru. Berkas ini TIDAK membuat tabel
-- baru — hanya menambah KOLOM ke order_sanci_offers (sudah dipetakan ke
-- awalan 'ORDER_OFFER' sejak 0013) dan partner_access_policies (sudah
-- dipetakan ke awalan 'PERMISSION' sejak 0001). fn_audit_row bekerja per NAMA
-- TABEL, bukan per kolom — `to_jsonb(new)`/`to_jsonb(old)` otomatis
-- menyertakan KOLOM APA PUN yang ada di baris itu tanpa perlu fungsi ini tahu
-- namanya satu-satu. Jadi ORDER_OFFER_UPDATED yang lahir dari perubahan
-- discount_pcts/markup_pct/cash_discount/final_amount OTOMATIS ikut, tanpa
-- baris kode baru di sini — diverifikasi §10 (AUDIT_KEEP_0014_ITEM dst masih
-- utuh, membuktikan fungsi ini SAMA PERSIS dengan versi 0014, bukan tertimpa
-- diam-diam oleh sesuatu yang lain).
--
-- KONSEKUENSI untuk migrations/README.md ATURAN BESI: karena 0015 tidak
-- mendefinisikan ulang fn_audit_row, ia TIDAK memulihkan apa pun kalau
-- berkas LAMA dijalankan ulang di atasnya — pemulih TERAKHIR di rantai tetap
-- 0014. Yang BARU rusak kalau 0014 dijalankan ULANG SETELAH 0015: trigger
-- §5/§6 dan constraint §4 di berkas ini HILANG (0014 tidak menyinggungnya
-- sama sekali, jadi CREATE OR REPLACE/DROP-nya tidak terjadi — tapi 0014
-- TIDAK membuat ulang tabel atau kolom apa pun yang berkas ini pakai, hanya
-- tidak tahu keberadaannya). Didokumentasikan presisi di migrations/README.md.

-- ── 10. Verifikasi (hasilnya di-copy balik ke Claude) ───────
-- Harapan:
--   CAN_DISCOUNT_COL                1   ← partner_access_policies.can_discount ada
--   CAN_DISCOUNT_DEFAULT_FALSE      1   ← WAJIB 1: DEFAULT false (fail-closed)
--   DISCOUNT_PCTS_COL               1   ← order_sanci_offers.discount_pcts ada
--   DISCOUNT_PCTS_TYPE              jsonb
--   DISCOUNT_DEFAULT_EMPTY_ARRAY    1   ← WAJIB 1: DEFAULT '[]'::jsonb
--   DISCOUNT_PCTS_NOT_NULL          1
--   MARKUP_PCT_COL                  1
--   MARKUP_PCT_CHECK                1   ← check (markup_pct is null or 0..100)
--   CASH_DISCOUNT_COL               1
--   CASH_DEFAULT_ZERO               1   ← WAJIB 1
--   CASH_DISCOUNT_CHECK             1   ← check (cash_discount >= 0)
--   FINAL_AMOUNT_COL                1
--   FINAL_NOT_NULL                  1   ← WAJIB 1
--   FINAL_AMOUNT_TYPE               numeric(15,2) ← sama persis dengan amount/dp_amount
--   DP_LE_AMOUNT_CHECK_GONE         0   ← WAJIB 0: constraint lama 0014 sudah diganti
--   DP_LE_FINAL_CHECK               1   ← WAJIB 1: constraint baru terpasang
--   COMPUTE_TRIGGER_EXISTS          1
--   DISCOUNT_GUARD_TRIGGER_EXISTS   1
--   OFFER_TRIGGERS                  5   ← ⚠ BERUBAH dari 3 (0013/0014) — audit,
--                                          touch, set_created_by, discount_guard,
--                                          final_compute
--   DISCOUNT_GUARD_EXEC_PUBLIC      0   ← WAJIB 0 (LESSONS #26)
--   AUDIT_KEEP_0014_ITEM            1   ← awalan ORDER_ITEM milik 0014 masih utuh
--                                          (fn_audit_row TIDAK didefinisikan ulang
--                                          di berkas ini — buktinya fungsi ini
--                                          tetap identik dengan versi 0014)
--   AUDIT_KEEP_0013_OFFER           1   ← awalan ORDER_OFFER milik 0013 masih utuh
--   AUDIT_KEEP_0012_PKG_ITEM        1
--   AUDIT_KEEP_0012_PKG_LOOKUP      1
--   AUDIT_KEEP_0010_PRODUCT         1
--   AUDIT_KEEP_0010_CATALOG         1
--   AUDIT_KEEP_0009_ARRIVED         1
--   AUDIT_KEEP_0009_NOTE            1
--   AUDIT_KEEP_0008_PKG             1
--   AUDIT_KEEP_0008_PHONE           1
--   AUDIT_KEEP_0008_ATTR            1
--   AUDIT_KEEP_0005                 1
--   AUDIT_KEEP_0004                 1
--   REFS_CHECK_CUSTOMER             1   ← WAJIB 1: lubang P2 milik 0011 masih tertutup
--
-- Tiga belas angka AUDIT_KEEP_*/REFS_CHECK_CUSTOMER TIDAK bisa berubah oleh
-- berkas ini SAMA SEKALI — 0015 tidak menyentuh fn_audit_row satu baris pun
-- (§9). Kalau salah satunya 0, itu BUKTI sesuatu yang lain (bukan berkas ini)
-- menimpa fungsi itu — laporkan, jangan anggap beres.
--
-- Angka blok verifikasi berkas LAMA setelah 0015 — SUDAH DIUKUR di Postgres 16
-- lokal:
--   0001: RLS_ENABLED/POLICIES/TRIGGERS SEMUA TETAP (19/46/27) — 0015 tidak
--         membuat tabel baru, tidak membuat policy baru, dan kedua trigger
--         barunya ada di order_sanci_offers (awalan `order_`, sama seperti
--         order_internal_notes/order_items — TIDAK ikut terhitung blok 0001
--         yang hanya menghitung tabel berawalan `partner%`).
--   0004/0005/0008/0009/0010/0011/0012: TIDAK berubah.
--   0013: OFFER_TABLE/OFFER_PK_ORDER_ID/dst SEMUA TETAP — hanya OFFER_TRIGGERS
--         (3→5, lihat di atas) yang berubah dari sudut pandang blok ini.
--   0014: POLICY_NEW_COLS/OFFER_POLICIES/OFFER_NONADMIN_POLICIES/
--         ORDER_ITEM_* SEMUA TETAP — 0015 tidak menyentuh RLS order_sanci_offers
--         (§7 di atas menjelaskan kenapa) maupun apa pun milik order_items.
-- Kalau ada angka lain yang tidak cocok, JANGAN anggap beres: laporkan apa
-- adanya (LESSONS #7 & #16).

select 'CAN_DISCOUNT_COL' as check_type, count(*)::text as result
from information_schema.columns
where table_schema = 'public' and table_name = 'partner_access_policies' and column_name = 'can_discount'
union all
select 'CAN_DISCOUNT_DEFAULT_FALSE', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'partner_access_policies'
  and column_name = 'can_discount' and column_default = 'false'
union all
select 'DISCOUNT_PCTS_COL', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'order_sanci_offers' and column_name = 'discount_pcts'
union all
select 'DISCOUNT_PCTS_TYPE',
       coalesce((select data_type from information_schema.columns
                 where table_schema = 'public' and table_name = 'order_sanci_offers'
                   and column_name = 'discount_pcts'), 'TIDAK ADA')
union all
select 'DISCOUNT_DEFAULT_EMPTY_ARRAY', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'order_sanci_offers'
  and column_name = 'discount_pcts' and column_default like '%[]%'
union all
select 'DISCOUNT_PCTS_NOT_NULL', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'order_sanci_offers'
  and column_name = 'discount_pcts' and is_nullable = 'NO'
union all
select 'MARKUP_PCT_COL', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'order_sanci_offers' and column_name = 'markup_pct'
union all
select 'MARKUP_PCT_CHECK', count(*)::text
from pg_constraint
where conrelid = 'public.order_sanci_offers'::regclass and contype = 'c'
  and conname = 'order_sanci_offers_markup_pct_check'
union all
select 'CASH_DISCOUNT_COL', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'order_sanci_offers' and column_name = 'cash_discount'
union all
select 'CASH_DEFAULT_ZERO', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'order_sanci_offers'
  and column_name = 'cash_discount' and column_default like '0%'
union all
select 'CASH_DISCOUNT_CHECK', count(*)::text
from pg_constraint
where conrelid = 'public.order_sanci_offers'::regclass and contype = 'c'
  and conname = 'order_sanci_offers_cash_discount_check'
union all
select 'FINAL_AMOUNT_COL', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'order_sanci_offers' and column_name = 'final_amount'
union all
select 'FINAL_NOT_NULL', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'order_sanci_offers'
  and column_name = 'final_amount' and is_nullable = 'NO'
union all
select 'FINAL_AMOUNT_TYPE',
       coalesce((select data_type || '(' || numeric_precision || ',' || numeric_scale || ')'
                 from information_schema.columns
                 where table_schema = 'public' and table_name = 'order_sanci_offers'
                   and column_name = 'final_amount'), 'TIDAK ADA')
union all
select 'DP_LE_AMOUNT_CHECK_GONE', count(*)::text
from pg_constraint
where conrelid = 'public.order_sanci_offers'::regclass and contype = 'c'
  and conname = 'order_sanci_offers_dp_le_amount_check'
union all
select 'DP_LE_FINAL_CHECK', count(*)::text
from pg_constraint
where conrelid = 'public.order_sanci_offers'::regclass and contype = 'c'
  and conname = 'order_sanci_offers_dp_le_final_check'
union all
select 'COMPUTE_TRIGGER_EXISTS', count(*)::text
from pg_trigger tg join pg_class cl on cl.oid = tg.tgrelid
join pg_namespace ns on ns.oid = cl.relnamespace
where not tg.tgisinternal and ns.nspname = 'public' and cl.relname = 'order_sanci_offers'
  and tg.tgname = 'trg_order_offer_final_compute'
union all
select 'DISCOUNT_GUARD_TRIGGER_EXISTS', count(*)::text
from pg_trigger tg join pg_class cl on cl.oid = tg.tgrelid
join pg_namespace ns on ns.oid = cl.relnamespace
where not tg.tgisinternal and ns.nspname = 'public' and cl.relname = 'order_sanci_offers'
  and tg.tgname = 'trg_order_offer_discount_guard'
union all
select 'OFFER_TRIGGERS', count(*)::text
from pg_trigger tg join pg_class cl on cl.oid = tg.tgrelid
join pg_namespace ns on ns.oid = cl.relnamespace
where not tg.tgisinternal and ns.nspname = 'public' and cl.relname = 'order_sanci_offers'
union all
select 'DISCOUNT_GUARD_EXEC_PUBLIC',
       (has_function_privilege('public', 'public.fn_guard_order_offer_discount_fields()', 'execute'))::int::text
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
