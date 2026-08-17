-- ============================================================
-- SANCI Partner Hub — Pengerasan hasil audit basis data (round 3)
-- Migration 0011: tiga temuan audit yang semuanya berada di LAPISAN DATABASE
--                 (idempotent — aman dijalankan ulang)
-- Jalankan di: Supabase Studio → SQL Editor → paste seluruh file → Run
--
-- PRASYARAT: 0001 → 0003 → 0004 → 0005 → 0006 → 0007 → 0008 → 0009 → 0010
-- sudah dijalankan, DALAM URUTAN ITU. Blok pengaman di bawah berhenti dengan
-- pesan jelas kalau belum. Setelah file ini rantai penuhnya menjadi
-- 0001 → 0003 → 0004 → 0005 → 0006 → 0007 → 0008 → 0009 → 0010 → 0011
-- (lihat migrations/README.md — ATURAN BESI).
--
-- ============================================================
-- APA YANG DIPERBAIKI FILE INI (dan hanya ini)
-- ============================================================
--
--   P2 · fn_check_order_refs TIDAK PERNAH memeriksa customer_id.
--        0004 memeriksa cabang, staf sales, dan staf PIC; 0008 menambahkan
--        paket. Pelanggan — satu-satunya kolom di baris itu yang menunjuk ke
--        DATA PRIBADI ORANG — tidak pernah ikut diperiksa. Dan o_partner_insert
--        (0004) hanya memeriksa partner_id/branch_id milik si penulis sendiri,
--        tidak menyentuh isi customer_id sama sekali.
--
--        Rantai akibatnya, sudah ditelusuri sampai ujung:
--          1. Pengguna cabang Partner A mengirim INSERT partner_orders lewat
--             API (anon key, tanpa UI) dengan customer_id milik Partner B.
--          2. Tidak ada satu pun lapisan yang menolaknya: RLS hanya melihat
--             partner_id/branch_id, trigger tidak melihat customer_id.
--          3. Sejak baris itu ada, fn_customer_has_visible_order() (0007)
--             bernilai TRUE untuk pelanggan Partner B tersebut.
--          4. Cabang ketiga c_partner_read (0007) lalu membuka SELURUH baris
--             pelanggan itu — nama, telepon, alamat, catatan — kepada penyerang.
--
--        Hari ini belum bisa dipakai karena penyerang tidak punya cara
--        mendapatkan UUID pelanggan Partner B: tidak ada endpoint yang
--        mendaftarnya, dan phone_normalized SENGAJA tidak unique sehingga tidak
--        bisa dijadikan oracle keberadaan. Tapi "belum bisa dipakai" bukan
--        "tidak ada": begitu satu id pelanggan muncul di alamat halaman, di
--        berkas ekspor, atau di lampiran laporan, ini berubah menjadi kebocoran
--        data pribadi lintas Partner tanpa satu pun baris kode baru. Yang
--        diperbaiki adalah lubangnya, bukan penundaannya.
--
--   P3 · sanci_catalog_access.enabled DEFAULT true — berlawanan arah dengan
--        aturan yang dipegang aplikasinya sendiri ("tidak ada baris = tertutup").
--        Persis pola LESSONS #8. Belum pernah menyakiti siapa pun karena
--        setCatalogAccess selalu mengirim nilainya secara eksplisit; yang
--        berbahaya adalah SKRIP masa depan yang tidak (§2).
--
--   P3 · invoice_url boleh menunjuk ke invoice pesanan LAIN. Kolomnya memang
--        harus bisa ditulis cabang (SENGAJA tidak masuk daftar beku 0005), tapi
--        tidak ada satu pun aturan yang mengikat ISI-nya ke baris pemiliknya.
--        Berkasnya sendiri tetap aman (storage RLS 0009 tidak berubah); yang
--        rusak adalah kebenaran datanya — admin membuka pesanan X dan melihat
--        invoice pesanan Y (§3).
--
-- YANG SENGAJA TIDAK DISENTUH:
--   * web/** — nol perubahan. Ketiga perbaikan hidup sepenuhnya di database.
--   * Berkas migration lama — tidak satu pun diedit (ATURAN BESI: yang lebih
--     baru menang, dan yang lebih baru adalah file ini).
--   * Aturan "pelanggan boleh dipakai lintas Partner" (SPEC §12) — dipertahankan
--     apa adanya, lihat alasannya di §1.
--   * Baris sanci_catalog_access yang SUDAH ada — DEFAULT hanya berlaku untuk
--     baris yang lahir sesudahnya (§2).
-- ============================================================

-- ── 0. Pengaman prasyarat ───────────────────────────────────
-- Pola yang sama dengan 0003/0008/0009/0010: berhenti dengan kalimat yang bisa
-- ditindaklanjuti, bukan membiarkan Postgres memuntahkan "relation ... does not
-- exist" di tengah CREATE OR REPLACE.

do $$
begin
  if to_regprocedure('public.fn_is_admin()') is null
     or to_regprocedure('public.fn_check_order_refs()') is null
     or to_regclass('public.partner_orders') is null
     or to_regclass('public.customers') is null
     or to_regclass('public.partner_packages') is null then
    raise exception
      'Migration 0001/0004/0008 belum dijalankan di database ini. Jalankan 0001 → 0003 → 0004 → 0005 → 0006 → 0007 → 0008 → 0009 → 0010 dulu, baru 0011.';
  end if;

  -- Penanda 0009: kolom invoice_url adalah milik 0009 dan §3 memasang penjaga
  -- di atasnya. Kalau 0009 belum jalan, penjaga itu akan menunjuk kolom yang
  -- tidak ada dan baru meledak saat ada yang menulis pesanan.
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'partner_orders'
                   and column_name = 'invoice_url') then
    raise exception
      'Migration 0009_fulfillment_invoice_arrival.sql belum dijalankan (kolom partner_orders.invoice_url tidak ada). Jalankan 0009 lalu 0010 dulu, baru 0011.';
  end if;

  -- Penanda 0010: §2 mengubah DEFAULT kolom milik 0010.
  if to_regclass('public.sanci_catalog_access') is null
     or to_regprocedure('public.fn_catalog_enabled()') is null then
    raise exception
      'Migration 0010_sanci_product_catalog.sql belum dijalankan (tabel sanci_catalog_access / fungsi fn_catalog_enabled tidak ada). Jalankan 0010 dulu, baru 0011.';
  end if;
end;
$$;

-- ── 1. P2 — fn_check_order_refs wajib memeriksa customer_id ──

-- Definisi ulang UTUH sekali lagi (bukan tambalan) supaya file ini idempotent
-- dan supaya siapa pun yang membacanya melihat SELURUH aturan di satu tempat.
-- SELURUH perilaku 0004 dan 0008 dipertahankan kata demi kata:
--   * cabang harus milik partner order-nya            (0004)
--   * staf sales harus milik partner order-nya        (0004)
--   * staf PIC harus milik partner order-nya          (0004)
--   * paket harus milik partner order-nya             (0008)
-- Yang bertambah HANYA pemeriksaan pelanggan di bawah ini.
--
-- ATURAN YANG DIPILIH, dan kenapa bukan yang lebih ketat:
--
--     pelanggan boleh dipakai order partner X kalau
--         ia DIBUAT oleh partner X (created_via_partner_id = X)
--       ATAU
--         ia SUDAH punya order milik partner X.
--
-- Aturan yang lebih ketat ("pelanggan wajib dibuat partner X") sengaja DITOLAK:
-- SPEC §12 memisahkan Customer Identity dari Order Attribution — satu orang
-- yang sama boleh berbelanja di Partner B hari ini dan Partner A tahun depan,
-- dan identitasnya TIDAK ikut berpindah tangan setiap kali itu terjadi (aturan
-- yang sama sudah ditegakkan c_partner_update di 0008: pelanggan yang hanya
-- TERLIHAT karena punya order di cabang kita boleh dibaca, tidak boleh diubah).
-- Cabang kedua ("sudah punya order milik partner X") menjaga hubungan yang
-- SUDAH ada supaya tidak mendadak jadi ilegal — termasuk saat cabang mengedit
-- order lama yang tautannya dulu dibuat admin.
--
-- Perlu dicatat dengan jujur: pada UPDATE, baris yang sedang diubah ITU SENDIRI
-- sudah ada di tabel, jadi ia ikut memenuhi cabang kedua. Itu memang yang
-- diinginkan — kalau tidak, setiap Edit biasa (catatan, invoice, jalur pesanan)
-- pada order lintas partner yang sah akan ditolak. Dan itu tidak membuka jalan
-- apa pun: customer_id ADA di daftar kolom beku 0005, jadi pengguna cabang tidak
-- pernah bisa menggantinya lewat UPDATE.
--
-- ADMIN DIKECUALIKAN. Admin SANCI-lah satu-satunya pihak yang boleh MEMBUAT
-- tautan lintas partner yang pertama (SPEC §16, jalur koreksi atribusi
-- fn_admin_correct_order_attribution milik 0008 juga lewat sini). Konsekuensi
-- yang harus diketahui, sama persis dengan penjaga 0005/0008/0009: di SQL Editor
-- auth.uid() kosong sehingga fn_is_admin() = false — perbaikan data manual pun
-- ikut ditolak. Itu DISENGAJA (zero-trust, LESSONS #5/#6). Kalau suatu hari
-- perlu memasukkan tautan lintas partner lewat skrip, bungkus dalam satu
-- transaksi:
--   begin;
--     alter table public.partner_orders disable trigger trg_check_order_refs;
--     ... perbaikan ...
--     alter table public.partner_orders enable  trigger trg_check_order_refs;
--   commit;
--
-- TETAP SECURITY DEFINER, dan sekarang alasannya bertambah kuat: fungsi ini
-- membaca customers dan partner_orders, dua tabel yang punya RLS sendiri.
-- Kalau dibiarkan berjalan sebagai pemanggil, subquery "pelanggan ini dibuat
-- partner mana" ikut disaring c_partner_read — pelanggan Partner B akan tampak
-- TIDAK ADA, kondisinya bernilai false, dan penjaga ini justru menolak dengan
-- alasan yang benar secara kebetulan sambil menolak juga hal-hal yang sah.
-- LESSONS #15: subquery di dalam aturan keamanan harus melihat data yang
-- SEBENARNYA ada, bukan data yang kebetulan terlihat.
--
-- CATATAN untuk yang menjalankan ulang 0004 atau 0008 SETELAH file ini:
-- definisi ini akan tertimpa versi lama dan pemeriksaan pelanggan hilang
-- diam-diam. Jalankan ulang 0011 untuk memulihkannya (migrations/README.md).
create or replace function public.fn_check_order_refs() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from partner_branches
                 where id = new.branch_id and partner_id = new.partner_id) then
    raise exception 'branch % bukan milik partner %', new.branch_id, new.partner_id;
  end if;

  if new.partner_sales_staff_id is not null
     and not exists (select 1 from partner_staff
                     where id = new.partner_sales_staff_id and partner_id = new.partner_id) then
    raise exception 'staf sales bukan milik partner %', new.partner_id;
  end if;

  if new.partner_pic_staff_id is not null
     and not exists (select 1 from partner_staff
                     where id = new.partner_pic_staff_id and partner_id = new.partner_id) then
    raise exception 'staf PIC bukan milik partner %', new.partner_id;
  end if;

  -- baru di 0008
  if new.package_id is not null
     and not exists (select 1 from partner_packages
                     where id = new.package_id and partner_id = new.partner_id) then
    raise exception 'paket bukan milik partner %', new.partner_id;
  end if;

  -- baru di 0011 (P2). Bentuknya sengaja SIMETRIS dengan keempat pemeriksaan di
  -- atas: "kolom yang menunjuk ke master lain harus menunjuk ke master milik
  -- partner order ini". customer_id sudah NOT NULL sejak 0004; `is not null`
  -- ditulis tetap supaya aturannya tidak berubah arti kalau kolomnya suatu hari
  -- dilonggarkan.
  if not public.fn_is_admin()
     and new.customer_id is not null
     and not exists (select 1 from customers c
                     where c.id = new.customer_id
                       and c.created_via_partner_id = new.partner_id)
     and not exists (select 1 from partner_orders o
                     where o.customer_id = new.customer_id
                       and o.partner_id  = new.partner_id) then
    raise exception
      'Pelanggan ini bukan pelanggan partner % dan belum pernah punya pesanan di sana. Pelanggan lintas Partner hanya bisa ditautkan oleh admin SANCI.',
      new.partner_id;
  end if;

  return new;
end;
$$;

-- Trigger-nya sudah dipasang 0004 dan dipasang ulang 0005 (BEFORE INSERT OR
-- UPDATE). Dipasang ulang di sini juga sebagai jaring pengaman untuk database
-- yang pernah menjalankan versi 0004 lama yang hanya memasangnya untuk INSERT —
-- jalur UPDATE wajib ikut memvalidasi, sama alasannya dengan catatan 0005.
drop trigger if exists trg_check_order_refs on public.partner_orders;
create trigger trg_check_order_refs before insert or update on public.partner_orders
  for each row execute function public.fn_check_order_refs();

-- ── 2. P3 — DEFAULT sanci_catalog_access.enabled jadi false ──

-- LESSONS #8 apa adanya: "kalau nilai DEFAULT sebuah kolom adalah yang TERBURUK
-- secara bisnis, lupa mengisinya adalah bencana yang diam."
--
-- Catatan §2 berkas 0010 sudah meninjau DEFAULT true dan menyimpulkan aman,
-- dengan alasan yang benar untuk keadaan HARI ITU: baris di tabel ini tidak
-- pernah lahir sendiri, ia hanya muncul kalau admin menekan "buka katalog", dan
-- setCatalogAccess selalu mengirim nilainya secara eksplisit. Yang tidak ikut
-- ditimbang adalah penulis LAIN di masa depan — dan tabel ini punya bentuk yang
-- mengundangnya:
--
--     insert into sanci_catalog_access (partner_id) select id from partners
--     on conflict do nothing;
--
-- Satu baris backfill seperti itu — ditulis siapa pun yang ingin "menyiapkan
-- barisnya dulu, saklarnya belakangan" — akan MEMBUKA katalog SANCI untuk
-- SELURUH Partner sekaligus. Tanpa error, tanpa peringatan, tanpa satu pun
-- keputusan manusia. Dan gejalanya tidak akan terlihat dari sisi SANCI: yang
-- berubah ada di layar orang lain.
--
-- Dengan DEFAULT false, skrip yang sama menghasilkan keadaan yang sudah
-- dipegang seluruh aplikasi: "ada barisnya, tertutup" — sama artinya dengan
-- "tidak ada baris". Arah gagalnya jadi satu, di semua jalur.
--
-- Yang TIDAK berubah, supaya tidak ada yang panik: DEFAULT hanya dipakai saat
-- sebuah baris LAHIR tanpa menyebut kolom itu. Baris yang sudah ada TIDAK
-- disentuh — partner yang katalognya sudah dibuka tetap terbuka. Perintah ini
-- juga hanya menyentuh katalog milik pg_catalog (metadata kolom), bukan satu
-- baris data pun, jadi ia instan dan bisa dijalankan ulang berkali-kali.
alter table public.sanci_catalog_access
  alter column enabled set default false;

-- ── 3. P3 — invoice_url wajib menunjuk pesanannya sendiri ────

-- BENTUK NILAI YANG SEBENARNYA (dipastikan dari kodenya, bukan dari nama
-- kolomnya): invoice_url menyimpan PATH DI DALAM BUCKET privat 'order-invoices'
-- berbentuk `<order_id>/invoice.<ext>` — lihat unggahInvoice() di
-- web/app/cabang/pesanan/invoice-upload.ts, dan setOrderInvoicePath() di
-- web/app/cabang/pesanan/actions.ts yang sudah menolak path yang tidak berawalan
-- `<orderId>/` maupun yang mengandung '..'. Ini BUKAN alamat web lengkap
-- (catatan penamaan di §1 berkas 0009). Aturan di bawah karena itu memeriksa
-- SEGMEN PERTAMA path, bukan mem-parse URL.
--
-- KENAPA MASIH PERLU PENJAGA KALAU SERVER ACTION SUDAH MEMERIKSA: karena Server
-- Action bukan satu-satunya jalan masuk. Kolom invoice_url SENGAJA tidak masuk
-- daftar kolom beku 0005 (dan itu benar — cabang memang harus bisa mengisinya),
-- sehingga celah UPDATE o_partner_update (0005) menerima:
--     update partner_orders set invoice_url = '<id pesanan LAIN>/invoice.pdf'
--     where id = '<pesanan saya sendiri>';
-- langsung lewat anon key, tanpa menyentuh Server Action sama sekali. LESSONS
-- #5: pemeriksaan yang hanya hidup di lapisan aplikasi bukan pemeriksaan.
--
-- SEBERAPA PARAH — jujur, dan bukan lebih parah dari itu: BERKASNYA tetap tidak
-- bocor. Storage RLS 0009 (order_invoices_read + fn_invoice_order_branch) tetap
-- menghitung hak baca dari SEGMEN PERTAMA path, jadi penyerang yang menunjuk ke
-- pesanan cabang lain tetap tidak bisa membuka isinya. Yang rusak adalah
-- KEBENARAN DATA-nya: admin SANCI membuka pesanan X, menekan "Lihat invoice",
-- dan melihat invoice pesanan Y — lalu menilai partner berdasarkan angka yang
-- salah. Itu sebabnya temuan ini P3 dan bukan P0; dan tetap sebabnya ia harus
-- ditutup: seluruh gagasan invoice di irisan 0009 adalah "bukti pendukung
-- penilaian SANCI", dan bukti yang bisa ditukar bukan bukti.
--
-- KENAPA FUNGSI SENDIRI, bukan ditempelkan ke fn_guard_order_arrival: pertanyaan
-- keduanya berbeda, dan 0009 sendiri sudah menetapkan pemisahan itu. Penjaga
-- kedatangan menjawab "kolom ini HANYA BOLEH ditulis admin"; penjaga ini
-- menjawab "kolom ini boleh ditulis cabang, tapi nilainya harus konsisten
-- dengan barisnya sendiri". Digabung, namanya berbohong dan keduanya jadi sulit
-- dibaca saat fase berikutnya menambah lampiran lain.
--
-- BERLAKU UNTUK INSERT DAN UPDATE. Bukan salinan berlebihan: form Pesanan Baru
-- memang mengunggah invoice SETELAH pesanannya tersimpan (jadi jalur normalnya
-- UPDATE), tapi tidak ada yang menghalangi seseorang mengirim invoice_url palsu
-- langsung pada saat INSERT.
--
-- HANYA DIPERIKSA SAAT NILAINYA BERUBAH. Kalau diperiksa pada setiap UPDATE
-- tanpa syarat, satu baris warisan yang nilainya sudah terlanjur aneh (mis.
-- ditulis admin lewat jalur pemeliharaan) akan MENGUNCI seluruh Edit pesanan itu
-- untuk cabang — gejalanya "Simpan selalu gagal" pada pesanan yang tidak ada
-- hubungannya dengan invoice. Yang ingin dicegah adalah PENULISAN nilai yang
-- salah, dan pola `is distinct from` menangkap itu sepenuhnya (pola yang sama
-- dipakai fn_guard_order_arrival di 0009).
--
-- SECURITY INVOKER (bawaan): fungsi ini tidak membaca satu tabel pun — cukup
-- membandingkan OLD vs NEW dengan kolom id barisnya sendiri. Keputusan "siapa
-- admin" tetap datang dari fn_is_admin() milik 0001 yang memang security
-- definer. Admin dikecualikan dengan alasan yang sama seperti penjaga 0005/0009:
-- koreksi resmi hanya boleh dari jalur admin.
create or replace function public.fn_guard_order_invoice_path() returns trigger
language plpgsql set search_path = public as $$
declare
  v_old text := case when tg_op = 'UPDATE' then old.invoice_url end;
  v_new text := nullif(btrim(coalesce(new.invoice_url, '')), '');
begin
  -- Mengosongkan invoice_url selalu boleh (hapus lampiran); yang diatur hanya
  -- nilai yang TERISI. Spasi saja dihitung sebagai kosong — pola yang sama
  -- dengan alasan pembatalan di 0005 dan phone_normalized di 0008. Batasnya
  -- disebut jujur: nilai spasi memang lolos tersimpan, dan itu tidak menunjuk
  -- ke mana pun (bukan alamat pesanan lain), jadi tidak menyesatkan siapa pun.
  if v_new is null or not (new.invoice_url is distinct from v_old) then
    return new;
  end if;

  if public.fn_is_admin() then
    return new;
  end if;

  -- '..' ditolak dengan alasan yang sama seperti setOrderInvoicePath: segmen
  -- pertama boleh saja benar sementara sisanya menaiki pohon direktori.
  if split_part(v_new, '/', 1) is distinct from new.id::text
     or position('..' in v_new) > 0 then
    raise exception
      'Alamat invoice harus berada di dalam folder pesanan ini sendiri (%/…). Alamat yang menunjuk pesanan lain tidak bisa disimpan.',
      new.id;
  end if;

  return new;
end;
$$;

-- Urutan trigger BEFORE di partner_orders setelah file ini (Postgres: urut nama):
--   trg_check_order_refs     (0004/0008/0011 — cabang, staf, paket & PELANGGAN
--                             milik partner yang benar)
--   trg_order_arrival        (0009 — penanda kedatangan khusus admin)
--   trg_order_immutable_cols (0005 — kolom atribusi beku)
--   trg_order_invoice_path   (0011 — INI)
--   trg_order_status_flow    (0005 — alih status & pembatalan)
--   trg_touch                (0001 — updated_at)
-- Urutan di antara penjaga-penjaga itu tidak mengubah hasil: semuanya menolak
-- dengan exception, yang pertama menolak duluan yang menang.
drop trigger if exists trg_order_invoice_path on public.partner_orders;
create trigger trg_order_invoice_path before insert or update on public.partner_orders
  for each row execute function public.fn_guard_order_invoice_path();

-- ── 4. Permukaan EXECUTE (LESSONS #26) ──────────────────────

-- Setiap fungsi baru wajib ditentukan permukaan EXECUTE-nya SAAT LAHIR, tidak
-- boleh mengandalkan bawaan Postgres (yang memberi EXECUTE ke PUBLIC untuk
-- setiap fungsi baru, dan PostgREST mengeksposnya sebagai /rpc/).
--
-- fn_guard_order_invoice_path adalah fungsi trigger: dicabut, sama seperti
-- sembilan fungsi trigger di 0007 dan fn_guard_order_arrival di 0009.
-- Pertahanan berlapis — Postgres sendiri menolak pemanggilan langsung fungsi
-- trigger, dan mencabut EXECUTE tidak menghentikan trigger-nya (haknya diperiksa
-- saat CREATE TRIGGER, bukan saat jalan; sudah diuji di 0007).
--
-- fn_check_order_refs TIDAK perlu diurus di sini: CREATE OR REPLACE
-- mempertahankan hak akses, jadi pencabutan 0007 masih berlaku. Blok verifikasi
-- di bawah membuktikannya, bukan mengandaikannya.
do $$
begin
  execute 'revoke all on function public.fn_guard_order_invoice_path() from public';
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.fn_guard_order_invoice_path() from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.fn_guard_order_invoice_path() from authenticated';
  end if;
end;
$$;

-- ── 5. Verifikasi (hasilnya di-copy balik ke Claude) ────────
--
-- Angka yang diharapkan — cocokkan SATU PER SATU, jangan hanya melihat "tidak
-- ada tulisan merah" (LESSONS #7 & #16):
--
-- P2 — PELANGGAN IKUT DIPERIKSA
--   REFS_CHECK_CUSTOMER            1   ← fn_check_order_refs menyebut created_via_partner_id
--   REFS_CUSTOMER_ADMIN_EXEMPT     1   ← dan menyebut fn_is_admin (admin dikecualikan)
--   REFS_SECDEF                    1   ← tetap security definer (LESSONS #15)
--   REFS_ON_INSERT                 1   ← trigger-nya menyala saat INSERT
--   REFS_ON_UPDATE                 1   ← dan saat UPDATE
-- PERILAKU LAMA fn_check_order_refs UTUH
--   REFS_KEEP_BRANCH               1   ← pemeriksaan cabang milik 0004 utuh
--   REFS_KEEP_SALES                1   ← pemeriksaan staf sales milik 0004 utuh
--   REFS_KEEP_PIC                  1   ← pemeriksaan staf PIC milik 0004 utuh
--   REFS_KEEP_PACKAGE              1   ← pemeriksaan paket milik 0008 utuh
--   REFS_EXEC_PUBLIC               0   ← pencabutan 0007 selamat dari CREATE OR REPLACE
-- P3 — SAKLAR KATALOG GAGAL KE ARAH TERTUTUP
--   ACCESS_DEFAULT_FALSE           1   ← DEFAULT kolom enabled sekarang false
--   ACCESS_DEFAULT_TRUE            0   ← dan sudah tidak true lagi
--   ACCESS_NO_ROW_MEANS_CLOSED     1   ← fn_catalog_enabled 0010 tidak tersentuh
-- P3 — INVOICE TERIKAT KE PESANANNYA SENDIRI
--   INVOICE_GUARD_FN               1   ← fungsi penjaga ada
--   INVOICE_GUARD_FN_INVOKER       1   ← security INVOKER (tidak membaca tabel)
--   INVOICE_GUARD_TRIGGER          1   ← trigger terpasang di partner_orders
--   INVOICE_GUARD_ON_INSERT        1   ← menyala saat INSERT
--   INVOICE_GUARD_ON_UPDATE        1   ← dan saat UPDATE
--   INVOICE_GUARD_EXEC_PUBLIC      0   ← EXECUTE dicabut (LESSONS #26)
--   INVOICE_URL_STILL_NOT_FROZEN   1   ← invoice_url TETAP di luar daftar beku 0005
-- YANG TIDAK BOLEH IKUT BERUBAH
--   ORDER_TRIGGERS                 9   ← 8 (setelah 0009) + trg_order_invoice_path
--   ORDER_POLICIES                 4   ← 0011 tidak menambah policy apa pun
--   ORDER_DELETE_POLICY            0   ← WAJIB 0, sejak 0004
--   ARRIVAL_TRIGGER                1   ← penjaga kedatangan 0009 utuh
--   ARRIVAL_GUARD_EXEC_PUBLIC      0   ← pencabutan 0009 utuh
--   FROZEN_COLS_KEEP_CUSTOMER      1   ← customer_id TETAP kolom beku milik 0005
--   CATALOG_FN_EXEC_ANON           1   ← hak EXECUTE 0010 utuh
--   CATALOG_FN_EXEC_AUTHENTICATED  1
--   INVOICE_BUCKET_PUBLIC          false ← bucket 0009 tetap privat
--   INVOICE_POLICIES               4   ← keempat policy storage 0009 utuh
--   PHOTO_BUCKET_PUBLIC            true  ← bucket 0010 tidak tersentuh
--   LOGO_BUCKET_PUBLIC             true  ← bucket 0003 tidak tersentuh
--   AUDIT_KEEP_0009_ARRIVED        1   ← fn_audit_row tidak disentuh file ini
--   AUDIT_KEEP_0010_PRODUCT        1
--
-- Angka blok verifikasi berkas LAMA yang BERUBAH setelah 0011 — ini normal,
-- daftar lengkapnya ada di migrations/README.md. Semuanya sebab yang SATU dan
-- SAMA: bertambahnya trg_order_invoice_path pada partner_orders.
--   0001: TRIGGERS 23 → 24
--   0004: TRIGGERS 12 → 13
--   0005: ORDER_TRIGGERS 8 → 9
--   0009: ORDER_TRIGGERS 8 → 9
-- Tidak ada angka lain yang berubah. Khususnya: 0007 TRIGGER_FN_TERKUNCI tetap
-- 9 dan 0005 GUARD_FUNCTIONS tetap 2 — keduanya menyaring per NAMA fungsi, dan
-- fungsi penjaga baru sengaja tidak ditambahkan ke daftar berkas lama (berkas
-- lama tidak boleh diedit).
-- Angka "WAJIB 0" milik berkas lama TIDAK BOLEH berubah satu pun. Kalau ada yang
-- tidak cocok, JANGAN anggap beres: laporkan apa adanya.

select 'REFS_CHECK_CUSTOMER' as check_type,
       count(*)::text as result
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_check_order_refs'
  and p.prosrc like '%created_via_partner_id%'
union all
select 'REFS_CUSTOMER_ADMIN_EXEMPT', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_check_order_refs'
  and p.prosrc like '%fn_is_admin%'
union all
select 'REFS_SECDEF', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_check_order_refs' and p.prosecdef
union all
select 'REFS_ON_INSERT', count(*)::text
from pg_trigger tg join pg_class cl on cl.oid = tg.tgrelid
join pg_namespace ns on ns.oid = cl.relnamespace
where not tg.tgisinternal and ns.nspname = 'public'
  and cl.relname = 'partner_orders' and tg.tgname = 'trg_check_order_refs'
  and (tg.tgtype & 4) = 4               -- bit INSERT
union all
select 'REFS_ON_UPDATE', count(*)::text
from pg_trigger tg join pg_class cl on cl.oid = tg.tgrelid
join pg_namespace ns on ns.oid = cl.relnamespace
where not tg.tgisinternal and ns.nspname = 'public'
  and cl.relname = 'partner_orders' and tg.tgname = 'trg_check_order_refs'
  and (tg.tgtype & 16) = 16             -- bit UPDATE
union all
select 'REFS_KEEP_BRANCH', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_check_order_refs'
  and p.prosrc like '%partner_branches%'
union all
select 'REFS_KEEP_SALES', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_check_order_refs'
  and p.prosrc like '%partner_sales_staff_id%'
union all
select 'REFS_KEEP_PIC', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_check_order_refs'
  and p.prosrc like '%partner_pic_staff_id%'
union all
select 'REFS_KEEP_PACKAGE', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_check_order_refs'
  and p.prosrc like '%partner_packages%'
union all
select 'REFS_EXEC_PUBLIC',
       (has_function_privilege('public', 'public.fn_check_order_refs()', 'execute'))::int::text
union all
select 'ACCESS_DEFAULT_FALSE', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'sanci_catalog_access'
  and column_name = 'enabled' and column_default = 'false'
union all
select 'ACCESS_DEFAULT_TRUE', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'sanci_catalog_access'
  and column_name = 'enabled' and column_default = 'true'
union all
select 'ACCESS_NO_ROW_MEANS_CLOSED', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_catalog_enabled'
  and p.prosrc like '%exists%' and p.prosrc like '%enabled%'
union all
select 'INVOICE_GUARD_FN', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_guard_order_invoice_path'
union all
select 'INVOICE_GUARD_FN_INVOKER', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_guard_order_invoice_path'
  and not p.prosecdef
union all
select 'INVOICE_GUARD_TRIGGER', count(*)::text
from pg_trigger tg join pg_class cl on cl.oid = tg.tgrelid
join pg_namespace ns on ns.oid = cl.relnamespace
where not tg.tgisinternal and ns.nspname = 'public'
  and cl.relname = 'partner_orders' and tg.tgname = 'trg_order_invoice_path'
union all
select 'INVOICE_GUARD_ON_INSERT', count(*)::text
from pg_trigger tg join pg_class cl on cl.oid = tg.tgrelid
join pg_namespace ns on ns.oid = cl.relnamespace
where not tg.tgisinternal and ns.nspname = 'public'
  and cl.relname = 'partner_orders' and tg.tgname = 'trg_order_invoice_path'
  and (tg.tgtype & 4) = 4
union all
select 'INVOICE_GUARD_ON_UPDATE', count(*)::text
from pg_trigger tg join pg_class cl on cl.oid = tg.tgrelid
join pg_namespace ns on ns.oid = cl.relnamespace
where not tg.tgisinternal and ns.nspname = 'public'
  and cl.relname = 'partner_orders' and tg.tgname = 'trg_order_invoice_path'
  and (tg.tgtype & 16) = 16
union all
select 'INVOICE_GUARD_EXEC_PUBLIC',
       (has_function_privilege('public', 'public.fn_guard_order_invoice_path()', 'execute'))::int::text
union all
select 'INVOICE_URL_STILL_NOT_FROZEN', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_guard_order_immutable_cols'
  and p.prosrc not like '%invoice_url%'
union all
select 'ORDER_TRIGGERS', count(*)::text
from pg_trigger tg join pg_class cl on cl.oid = tg.tgrelid
join pg_namespace ns on ns.oid = cl.relnamespace
where not tg.tgisinternal and ns.nspname = 'public' and cl.relname = 'partner_orders'
union all
select 'ORDER_POLICIES', count(*)::text
from pg_policies where schemaname = 'public' and tablename = 'partner_orders'
union all
select 'ORDER_DELETE_POLICY', count(*)::text
from pg_policies
where schemaname = 'public' and tablename = 'partner_orders' and cmd = 'DELETE'
union all
select 'ARRIVAL_TRIGGER', count(*)::text
from pg_trigger tg join pg_class cl on cl.oid = tg.tgrelid
join pg_namespace ns on ns.oid = cl.relnamespace
where not tg.tgisinternal and ns.nspname = 'public'
  and cl.relname = 'partner_orders' and tg.tgname = 'trg_order_arrival'
union all
select 'ARRIVAL_GUARD_EXEC_PUBLIC',
       (has_function_privilege('public', 'public.fn_guard_order_arrival()', 'execute'))::int::text
union all
select 'FROZEN_COLS_KEEP_CUSTOMER', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_guard_order_immutable_cols'
  and p.prosrc like '%customer_id%'
union all
select 'CATALOG_FN_EXEC_ANON',
       coalesce((select (has_function_privilege('anon', 'public.fn_catalog_enabled()', 'execute'))::int::text
                 from pg_roles where rolname = 'anon'), '0')
union all
select 'CATALOG_FN_EXEC_AUTHENTICATED',
       coalesce((select (has_function_privilege('authenticated', 'public.fn_catalog_enabled()', 'execute'))::int::text
                 from pg_roles where rolname = 'authenticated'), '0')
union all
select 'INVOICE_BUCKET_PUBLIC',
       coalesce((select public::text from storage.buckets where id = 'order-invoices'), 'TIDAK ADA')
union all
select 'INVOICE_POLICIES', count(*)::text
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname like 'order_invoices_%'
union all
select 'PHOTO_BUCKET_PUBLIC',
       coalesce((select public::text from storage.buckets where id = 'product-photos'), 'TIDAK ADA')
union all
select 'LOGO_BUCKET_PUBLIC',
       coalesce((select public::text from storage.buckets where id = 'partner-logos'), 'TIDAK ADA')
union all
select 'AUDIT_KEEP_0009_ARRIVED', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row'
  and p.prosrc like '%ORDER_CUSTOMER_ARRIVED%'
union all
select 'AUDIT_KEEP_0010_PRODUCT', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row'
  and p.prosrc like '%sanci_products%';
