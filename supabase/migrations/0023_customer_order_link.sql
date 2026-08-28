-- ============================================================
-- SANCI Partner Hub — Phase 2 irisan kedelapan belas
-- Migration 0023: Tautan Pesanan untuk Pelanggan (halaman /lihat/<token>,
--                 tanpa login) + penanda "sudah diterima pelanggan"
--                 (idempotent — aman dijalankan ulang)
-- Jalankan di: Supabase Studio → SQL Editor → paste seluruh file → Run
--
-- PRASYARAT: 0001 → … → 0021 sudah dijalankan, DALAM URUTAN ITU. Blok
-- pengaman §0 berhenti dengan pesan jelas kalau belum.
--
-- CATATAN NOMOR 0022: berkas ini bernomor 0023 sesuai penugasan. Nomor 0022
-- dipegang irisan LAIN yang dikerjakan paralel (halaman Produk). Berkas ini
-- TIDAK bergantung pada apa pun dari 0022 — pengaman §0 sengaja hanya
-- memeriksa objek 0001..0021 (LESSONS #41: guard memeriksa KEBERADAAN objek
-- prasyarat, bukan "versi fungsi yang sedang aktif"). Urutan jalan 0022/0023
-- karena itu boleh bertukar.
--
-- ============================================================
-- LATAR BELAKANG (owner, sudah diputuskan per butir)
-- ============================================================
--
-- Pelanggan toko tidak punya akun dan tidak akan pernah punya. Yang mereka
-- tanyakan lewat WhatsApp berulang-ulang cuma satu: "pesanan saya sampai
-- mana?". Irisan ini memberi staf toko SATU tautan per pesanan yang bisa
-- dikirim ke pelanggannya; pelanggan membukanya tanpa login dan melihat
-- tahap pesanannya sendiri.
--
-- Keputusan owner yang MENGIKAT (dan yang karenanya dikodekan di sini):
--   A. Nominal uang DITAMPILKAN apa adanya (total / DP / sisa) — bukan
--      disembunyikan. Pelanggan memang tahu angkanya; ia yang membayar.
--   B. Alamat DEFAULT hanya sampai KOTA. Alamat lengkap baru muncul kalau
--      pembukanya bisa menyebutkan nomor HP yang terdaftar di pesanan itu.
--   C. Alasan pembatalan TIDAK PERNAH ditampilkan ke pelanggan.
--   D. Satu-satunya langkah MANUAL di seluruh alur ini adalah "sudah
--      diterima pelanggan" — sisanya diturunkan otomatis dari data yang
--      sudah ada (dokumen DO 0016, customer_arrived_at 0009, status 0005).
--
-- ============================================================
-- APA YANG DIBUKA IRISAN INI (dan hanya ini)
-- ============================================================
--   partner_orders.customer_view_token → kolom BARU, text NOT NULL UNIQUE,
--     DEFAULT acak per baris. Ini KUNCI tautan pelanggan. Baris lama
--     ikut terisi lewat table-rewrite ADD COLUMN (§1 — diukur, bukan
--     diasumsikan).
--   partner_orders.delivered_at / delivered_by → kolom BARU, nullable.
--     Nilainya DIPAKSA server (§3, pola fn_guard_order_arrival 0009).
--   customer_view_attempts → tabel BARU, RLS aktif TANPA satu pun policy:
--     penghitung tebakan nomor HP + kunci 15 menit. Hanya RPC §5 yang
--     menyentuhnya.
--   fn_guard_order_customer_link() → trigger BARU di partner_orders.
--   fn_customer_order_view(text)          → RPC BARU (anon + authenticated).
--   fn_customer_reveal_address(text,text) → RPC BARU (anon + authenticated).
--
-- YANG SENGAJA TIDAK DIBUKA:
--   * Policy anon apa pun di partner_orders/customers/order_items/
--     order_sanci_offers/order_documents — NOL. Pelanggan TIDAK PERNAH
--     menyentuh tabel; ia hanya memanggil dua RPC SECURITY DEFINER yang
--     mengembalikan daftar kolom yang DIPILIH SATU PER SATU (§4/§5).
--   * Nomor telepon, alamat lengkap sebelum verifikasi, alasan pembatalan,
--     catatan internal, harga beli toko, nama staf, id internal apa pun —
--     tidak ada satu pun yang bisa keluar lewat RPC §4 (lihat daftar putih).
--   * Pengiriman WhatsApp OTOMATIS (Fonnte) — di luar cakupan irisan ini.
--     Staf mengirim tautannya sendiri dari WhatsApp miliknya.
--
-- ============================================================
-- GARIS MERAH: fn_audit_row TIDAK DIDEFINISIKAN ULANG DI SINI
-- ============================================================
--
-- Berkas ini TIDAK menyentuh fn_audit_row satu baris pun (0 kemunculan
-- `create or replace function public.fn_audit_row`). Alasannya diperiksa
-- lebih dulu di SUMBER versi aktif, yaitu 0021 §7
-- (supabase/migrations/0021_partner_price_list.sql):
--
--   * baris 394–395  `rec := to_jsonb(new); old_rec := to_jsonb(old);`
--     → SELURUH baris diserialisasi apa adanya. Kolom yang baru lahir hari
--       ini ikut MASUK dengan sendirinya; tidak ada daftar kolom di mana
--       pun yang perlu ditambah.
--   * baris 417–419  cabang `else v_action := v_prefix || '_UPDATED';`
--     → UPDATE pada partner_orders yang TIDAK mengubah status, TIDAK
--       memindahkan partner/branch, dan TIDAK mengisi customer_arrived_at
--       jatuh ke cabang generik ini = 'ORDER_UPDATED'. Menandai
--       delivered_at persis begitu.
--   * baris 460–464  `insert into audit_logs (… before, after …) values
--     (… old_rec, rec …)` → kedua jsonb utuh masuk ke kolom before/after.
--
-- Artinya: menandai "sudah diterima pelanggan" tercatat sebagai
-- ORDER_UPDATED dengan diff `delivered_at: null → <waktu>` dan aktor
-- (actor_user_id/actor_role) TANPA perubahan apa pun pada fn_audit_row.
-- Bukti PERILAKUnya (bukan cuma bacaan kode) ada di
-- supabase/test-harness/95_behavior_0023.sql T7/T8.
--
-- Konsekuensi yang DISENGAJA: TIDAK ADA aksi audit khusus bernama
-- 'ORDER_DELIVERED'. Membuatnya HARUS lewat definisi ulang fn_audit_row —
-- itu garis merah penugasan ini, dan harganya (satu berkas lagi yang ikut
-- antre di ATURAN BESI) lebih mahal daripada manfaatnya: diff
-- `delivered_at` sudah menyampaikan kejadian yang sama, dan
-- web/lib/audit-format.ts diberi label + format WIB untuk kolom itu supaya
-- barisnya terbaca manusia ("Diterima pelanggan: — → 28 Agustus 2026 20.36").
--
-- ============================================================
-- LESSONS #37 — TIDAK ADA CHECK LAMA YANG BERUBAH PERILAKU
-- ============================================================
-- §3 memasang trigger BEFORE BARU di partner_orders (tabel LAMA), jadi
-- pertanyaan #37 wajib dijawab: "setiap CHECK yang sudah ada di tabel ini,
-- apakah masih menerima nilai yang dikirim pemanggil?" Fungsi §3 hanya
-- menulis TIGA kolom: customer_view_token, delivered_at, delivered_by —
-- ketiganya LAHIR DI BERKAS INI dan tidak disebut oleh satu pun CHECK yang
-- sudah ada (partner_orders_fulfillment_path_check 0009,
-- partner_orders_partner_purchase_amount_check 0009, dan CHECK bawaan
-- 0004). Ia TIDAK menyentuh status, cancellation_reason, shipping_address,
-- customer_arrived_at, atau kolom mana pun milik migrasi lain.
-- ============================================================

-- ── 0. Pengaman prasyarat (LESSONS #41: periksa OBJEK, bukan versi aktif) ──

do $$
begin
  if to_regprocedure('public.fn_is_admin()') is null
     or to_regprocedure('public.fn_audit_row()') is null
     or to_regclass('public.partner_orders') is null
     or to_regclass('public.customers') is null then
    raise exception
      'Fungsi/tabel dasar (fn_is_admin / fn_audit_row / partner_orders / customers) belum lengkap. Jalankan 0001 → … → 0021 dulu, baru 0023.';
  end if;

  -- Penanda 0009/0014/0015/0016: RPC §4 membaca fulfillment_path (0009),
  -- order_items (0014), order_sanci_offers.final_amount (0015) dan
  -- order_documents (0016). Kalau salah satu belum ada, RPC-nya akan lahir
  -- merujuk objek yang tidak ada dan baru meledak saat pelanggan pertama
  -- membuka tautannya — lebih baik berhenti di sini.
  if to_regclass('public.order_items') is null
     or to_regclass('public.order_sanci_offers') is null
     or to_regclass('public.order_documents') is null
     or not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'partner_orders'
         and column_name = 'fulfillment_path')
     or not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'partner_orders'
         and column_name = 'shipping_address')
     or not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'order_sanci_offers'
         and column_name = 'final_amount') then
    raise exception
      'Migration 0009/0014/0015/0016 belum lengkap di database ini. Jalankan 0001 → … → 0021 dulu, baru 0023.';
  end if;
end;
$$;

-- ── 1. partner_orders.customer_view_token ───────────────────

-- KENAPA DEFAULT VOLATILE, bukan UPDATE backfill terpisah: `ALTER TABLE …
-- ADD COLUMN … NOT NULL DEFAULT <ekspresi VOLATILE>` membuat Postgres
-- MENULIS ULANG tabel dan mengevaluasi defaultnya SEKALI PER BARIS —
-- setiap pesanan lama langsung punya token SENDIRI, dan penulisan ulang
-- tabel TIDAK MEMICU satu pun row trigger. Dua-duanya DIUKUR di Postgres 16
-- lokal sebelum berkas ini ditulis (5 baris → 5 token berbeda; tabel
-- ber-trigger AFTER INSERT/UPDATE/DELETE → 0 pemicu), bukan diasumsikan.
--
-- Kenapa itu PENTING dan bukan sekadar rapi: kalau backfillnya ditulis
-- sebagai `update partner_orders set … where … is null`, setiap pesanan
-- lama akan (a) melahirkan satu baris audit ORDER_UPDATED yang tidak
-- berarti apa-apa, dan (b) untuk pesanan berstatus CANCELLED akan DITOLAK
-- MENTAH oleh fn_guard_order_status_flow (0005 §3, baris 135–138: "Order
-- ini sudah dibatalkan dan tidak bisa diubah lagi" — di SQL Editor
-- auth.uid() kosong sehingga fn_is_admin() false). Migrasinya akan gagal
-- di tengah jalan pada database mana pun yang punya pesanan dibatalkan.
--
-- Kenapa gen_random_uuid() dan BUKAN encode(gen_random_bytes(16),'hex'):
-- gen_random_uuid() ada di pg_catalog sejak Postgres 13 — tanpa
-- ketergantungan ekstensi maupun search_path (di Supabase pgcrypto tinggal
-- di schema `extensions`, dan ekspresi DEFAULT di-resolve saat DDL). Dua
-- UUID digabung = 64 karakter heksadesimal, 244 bit acak; satu UUID saja
-- (122 bit) sudah setara seluruh primary key sistem ini. Panjang 64 masih
-- nyaman dikirim lewat WhatsApp.
alter table public.partner_orders
  add column if not exists customer_view_token text not null
  default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''));

-- Jaring pengaman untuk keadaan SETENGAH JADI (kolom sempat lahir nullable
-- di percobaan sebelumnya): isi yang kosong, lalu paku DEFAULT + NOT NULL.
-- Trigger dimatikan selama pengisian dengan alasan yang sama persis seperti
-- di atas (audit sampah + penolakan pesanan CANCELLED). Seluruh berkas
-- berjalan dalam SATU transaksi di SQL Editor, jadi kegagalan di tengah
-- mengembalikan trigger ke keadaan semula bersama sisanya.
alter table public.partner_orders
  alter column customer_view_token
  set default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''));

do $$
declare v_null bigint;
begin
  select count(*) into v_null from public.partner_orders where customer_view_token is null;
  if v_null > 0 then
    execute 'alter table public.partner_orders disable trigger user';
    update public.partner_orders
       set customer_view_token =
             replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
     where customer_view_token is null;
    execute 'alter table public.partner_orders enable trigger user';
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'partner_orders'
               and column_name = 'customer_view_token' and is_nullable = 'YES') then
    alter table public.partner_orders alter column customer_view_token set not null;
  end if;
end;
$$;

-- UNIQUE: tautan adalah IDENTITAS pesanan bagi pelanggan. Dua pesanan
-- bertoken sama = satu pelanggan melihat pesanan orang lain. Index (bukan
-- constraint) supaya `create … if not exists` bisa dipakai apa adanya.
create unique index if not exists partner_orders_customer_view_token_key
  on public.partner_orders (customer_view_token);

-- ── 2. partner_orders.delivered_at / delivered_by ───────────

-- Nullable, dan itu aman ditinjau LESSONS #8: null di sini berarti "belum
-- ditandai diterima", satu-satunya arti yang mungkin — pesanan lama memang
-- tidak pernah ditanyai. TIDAK ADA default; memberi default apa pun akan
-- MENGARANG fakta untuk ratusan pesanan lama (alasan identik 0009 §1).
--
-- delivered_by TANPA foreign key ke auth.users — pola created_by (0004),
-- cancelled_by (0005), customer_arrived_by (0009): jejak SIAPA yang
-- menandai harus tetap ada walau akun penggunanya kelak dihapus dari Auth.
alter table public.partner_orders
  add column if not exists delivered_at timestamptz;
alter table public.partner_orders
  add column if not exists delivered_by uuid;

-- ── 3. Penjaga: token beku + delivered_* dipaksa server ─────

-- KENAPA TRIGGER DAN BUKAN RLS (alasan 0009 §2, masih berlaku persis): RLS
-- hanya melihat baris HASIL; ia tidak bisa membandingkan nilai LAMA vs
-- BARU. Cabang MEMANG punya policy UPDATE atas pesanannya sendiri
-- (o_partner_update, 0005 §4 baris 221–224) — itu justru YANG DIINGINKAN
-- untuk delivered_at (owner: staf toko yang menandainya), tapi berarti
-- tanpa trigger ini cabang juga bisa mengirim JAM BUATANNYA SENDIRI, bisa
-- membatalkan penandaan, dan bisa MENGGANTI token tautan pelanggan lewat
-- API biasa — semua policy tetap lolos.
--
-- Tiga aturan yang ditegakkan di sini:
--   1. customer_view_token TIDAK BOLEH berubah dari aplikasi (non-admin).
--      Tidak ada satu layar pun yang menulisnya; ia lahir dari DEFAULT §1.
--      Token yang bisa diganti dari luar = tautan yang bisa dibuat mudah
--      ditebak, atau tautan pelanggan yang mati diam-diam.
--   2. delivered_at DIPAKSA now() dan delivered_by DIPAKSA auth.uid() pada
--      transisi null → terisi (LESSONS #11: jam HP/kiriman client tidak
--      dipercaya; LESSONS #6: identitas dari sesi, bukan dari body).
--   3. Menandai ULANG pesanan yang SUDAH ditandai = tidak melakukan apa-apa
--      (nilai lama menang), BUKAN error — dua staf yang menekan tombol yang
--      sama tidak boleh saling menyalahkan. Membatalkan penandaan hanya
--      admin (pola un-cancel 0005 §3).
--
-- BERLAKU JUGA UNTUK INSERT, bukan hanya UPDATE: tanpa itu cabang cukup
-- mengirim delivered_at saat MEMBUAT pesanan dan seluruh penjagaan
-- terlewat (pelajaran eksplisit 0009 §2).
--
-- SECURITY INVOKER (bawaan): fungsi ini tidak membaca tabel apa pun.
-- Keputusan "siapa admin" tetap datang dari fn_is_admin() milik 0001.
create or replace function public.fn_guard_order_customer_link() returns trigger
language plpgsql set search_path = public as $$
declare
  v_admin  boolean     := public.fn_is_admin();
  v_old_at timestamptz := case when tg_op = 'UPDATE' then old.delivered_at end;
  v_old_by uuid        := case when tg_op = 'UPDATE' then old.delivered_by end;
begin
  -- (1) Token tautan pelanggan
  if tg_op = 'UPDATE'
     and not v_admin
     and new.customer_view_token is distinct from old.customer_view_token then
    raise exception
      'Tautan pesanan untuk pelanggan tidak bisa diubah dari aplikasi cabang.';
  end if;

  -- (2) INSERT: pesanan yang baru lahir belum pernah diterima pelanggan.
  if tg_op = 'INSERT' then
    if new.delivered_at is not null and not v_admin then
      raise exception
        'Penanda "pesanan sudah diterima pelanggan" tidak boleh diisi saat membuat pesanan.';
    end if;
    if new.delivered_at is not null then
      new.delivered_at := now();
      if auth.uid() is not null then
        new.delivered_by := auth.uid();
      end if;
    else
      new.delivered_by := null;
    end if;
    return new;
  end if;

  -- (3) UPDATE
  if new.delivered_at is null then
    if v_old_at is not null and not v_admin then
      raise exception
        'Penanda "pesanan sudah diterima pelanggan" tidak bisa dibatalkan dari aplikasi cabang. Hubungi admin SANCI.';
    end if;
    -- Batal-tandai (admin): pelakunya ikut dikosongkan supaya tidak ada
    -- pesanan tanpa waktu penerimaan yang masih membawa nama penanda lama.
    -- Riwayat lengkapnya tetap di audit_logs.
    new.delivered_by := null;

  elsif v_old_at is null then
    -- Transisi null → terisi: NILAI SERVER, apa pun yang dikirim client.
    -- Tanpa sesi (SQL Editor / seed / perbaikan manual) delivered_by
    -- dibiarkan apa adanya supaya perbaikan data tidak ikut gagal — pola
    -- fn_guard_order_arrival (0009 §2) dan fn_set_created_by (0004).
    new.delivered_at := now();
    if auth.uid() is not null then
      new.delivered_by := auth.uid();
    end if;

  elsif not v_admin then
    -- Sudah pernah ditandai dan bukan admin: nilai lama MENANG (idempotent,
    -- aturan 3 di kepala fungsi). Sengaja TIDAK raise: tombol yang ditekan
    -- dua kali harus berperilaku seperti sekali, dan Server Action tetap
    -- membaca ulang nilai sesungguhnya sebelum melapor (LESSONS #7).
    new.delivered_at := v_old_at;
    new.delivered_by := v_old_by;
  end if;

  return new;
end;
$$;

-- LESSONS #26: fungsi trigger = permukaan EXECUTE tertutup sejak lahir.
revoke all on function public.fn_guard_order_customer_link() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.fn_guard_order_customer_link() from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.fn_guard_order_customer_link() from authenticated';
  end if;
end;
$$;

-- Urutan trigger BEFORE di partner_orders setelah berkas ini (Postgres:
-- urut nama):
--   trg_check_order_refs      (0004/0008)
--   trg_order_arrival         (0009)
--   trg_order_customer_link   (0023 — INI)
--   trg_order_immutable_cols  (0005)
--   trg_order_status_flow     (0005)
--   trg_touch                 (0001)
-- Urutan di antara para penjaga tidak mengubah hasil: yang menolak duluan
-- yang menang, dan tidak ada dua penjaga yang menulis kolom yang sama.
drop trigger if exists trg_order_customer_link on public.partner_orders;
create trigger trg_order_customer_link before insert or update on public.partner_orders
  for each row execute function public.fn_guard_order_customer_link();

-- ── 4. customer_view_attempts: rem penebak nomor HP ─────────

-- KENAPA TABEL SENDIRI dan BUKAN dua kolom di partner_orders (penyimpangan
-- SADAR dari usulan awal penugasan — diukur, bukan selera):
--   1. Setiap tebakan SALAH adalah satu UPDATE. Kalau penghitungnya tinggal
--      di partner_orders, setiap tebakan salah melahirkan satu baris audit
--      ORDER_UPDATED (trg_audit, AFTER UPDATE) — layar Aktivitas pesanan
--      banjir oleh percobaan orang asing, dan itu justru MENGUBUR jejak
--      yang penting.
--   2. Pesanan berstatus CANCELLED adalah read-only total bagi non-admin —
--      fn_guard_order_status_flow (0005 §3 baris 135–138) MELEMPAR EXCEPTION
--      untuk UPDATE apa pun. RPC §6 berjalan SECURITY DEFINER tanpa sesi
--      (auth.uid() null → fn_is_admin() false), jadi satu tebakan salah
--      pada pesanan yang dibatalkan akan menggagalkan seluruh panggilan —
--      halaman pelanggan akan menampilkan "sedang gangguan" padahal yang
--      terjadi cuma salah ketik nomor.
--   3. Ia bukan data pesanan; ia keadaan sementara sebuah rem. Menempel di
--      partner_orders berarti ia ikut ke setiap SELECT, setiap to_jsonb()
--      audit, dan ke daftar SKIP web/lib/audit-format.ts (LESSONS #28).
--
-- ON DELETE CASCADE (bukan RESTRICT): baris ini keadaan sementara, BUKAN
-- riwayat — alasan yang sama persis dengan sanci_catalog_access (0010 §2)
-- dan product_prices (0021 §1).
--
-- RLS aktif TANPA SATU PUN POLICY. "Tanpa policy pada tabel ber-RLS bukan
-- sekadar tersembunyi: tertutup" (0009 §3). Satu-satunya yang menyentuhnya
-- adalah fn_customer_reveal_address (§6, SECURITY DEFINER milik pemilik
-- tabel). Admin pun tidak membacanya — tidak ada layar yang memerlukannya.
--
-- SENGAJA TANPA trg_audit: lihat alasan 1 di atas. Nilai forensiknya nol
-- (penebaknya anonim menurut definisi) dan ia akan menghasilkan kode aksi
-- mentah 'CUSTOMER_VIEW_ATTEMPTS_CREATED' di layar Aktivitas, karena
-- memberinya nama yang benar HARUS lewat definisi ulang fn_audit_row —
-- garis merah berkas ini.
create table if not exists public.customer_view_attempts (
  order_id     uuid primary key references public.partner_orders(id) on delete cascade,
  failed_count integer not null default 0 check (failed_count >= 0),
  locked_until timestamptz,
  updated_at   timestamptz not null default now()
);

alter table public.customer_view_attempts enable row level security;

-- ── 5. RPC: tampilan pesanan untuk pelanggan (tanpa login) ──

-- DAFTAR PUTIH, BUKAN DAFTAR HITAM. Fungsi ini MENYUSUN objek jsonb-nya
-- kolom demi kolom. Tidak ada `to_jsonb(o)`, tidak ada `select *`, tidak
-- ada satu pun jalur di mana kolom yang ditambahkan migrasi berikutnya
-- ikut bocor dengan sendirinya. Kolom yang keluar HANYA:
--
--   order_number         nomor pesanan (tercetak di SO yang pelanggan
--                        tanda tangani — bukan rahasia baginya)
--   stage                tahap, DITURUNKAN (lihat di bawah), bukan kolom
--   cancelled            boolean saja — TANPA cancellation_reason
--                        (keputusan owner C)
--   customer_first_name  HANYA kata pertama full_name (sapaan). Nama
--                        belakang tidak menambah apa pun bagi pembacanya
--                        dan menambah data yang bocor kalau tautan salah
--                        kirim.
--   city                 customers.city saja — lihat catatan KOTA
--   fulfillment_path     DIRECT_DELIVERY / SHOWROOM_VISIT (menentukan
--                        gambar linimasa di halaman)
--   do_date              tanggal surat jalan (order_documents doc_type='DO')
--   delivered_at         waktu penandaan "sudah diterima"
--   items[]              name / code / qty / photo_url
--   amounts{}            final / dp / sisa — atau NULL kalau tidak ada
--                        baris penawaran (keputusan owner A)
--   has_address          boolean: apakah ADA alamat untuk dibuka; bukan
--                        alamatnya
--
-- YANG TIDAK PERNAH KELUAR: phone/phone_normalized, alamat lengkap,
-- cancellation_reason, partner_purchase_amount, catatan internal, notes,
-- nama staf sales/PIC, invoice, unit_price/line_discount per baris, dan
-- SEMUA uuid (termasuk id pesanan sendiri).
--
-- CATATAN KOTA (batas yang DISADARI, bukan kelalaian): kota diambil dari
-- customers.city — kolom terstruktur — dan TIDAK pernah dari mengurai
-- shipping_address. shipping_address adalah teks bebas multiline (0014 §4);
-- menebak "segmen kota"-nya dengan pemotongan koma akan salah pada alamat
-- yang tidak berkoma dan justru MENAMPILKAN potongan nama jalan — persis
-- kebocoran yang keputusan owner B dibuat untuk mencegah. Kalau
-- customers.city kosong, baris kota DIHILANGKAN seluruhnya ("擷取不到就
-- 省略") dan tombol "Lihat alamat lengkap" tetap ada.
--
-- Token tidak punya rem penebak seperti nomor HP (§6): 244 bit acak
-- (§1) tidak bisa ditebak; yang berukuran kecil dan karenanya butuh rem
-- adalah nomor HP.
--
-- SECURITY DEFINER: pemanggilnya adalah anon TANPA satu pun policy di
-- tabel mana pun. STABLE: hanya membaca.
create or replace function public.fn_customer_order_view(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_o        record;
  v_stage    text;
  v_do_date  date;
  v_items    jsonb;
  v_amounts  jsonb;
  v_final    numeric;
  v_dp       numeric;
begin
  if p_token is null or btrim(p_token) = '' then
    return null;
  end if;

  select o.id,
         o.order_number,
         o.status,
         o.fulfillment_path,
         o.customer_arrived_at,
         o.delivered_at,
         o.shipping_address,
         c.full_name  as customer_full_name,
         c.city       as customer_city,
         c.address    as customer_address
    into v_o
  from partner_orders o
  join customers c on c.id = o.customer_id
  where o.customer_view_token = p_token;

  -- Token tidak dikenal → NULL. Halaman WAJIB membedakan ini dari "RPC
  -- gagal" (LESSONS #10): NULL adalah JAWABAN, error adalah error.
  if not found then
    return null;
  end if;

  -- Dibatalkan: halaman berubah total. Tidak ada isi, tidak ada uang,
  -- tidak ada alasan (keputusan owner C). Nomor pesanan tetap dikirim
  -- supaya pelanggan bisa menyebutnya saat menghubungi toko.
  if v_o.status = 'CANCELLED' then
    return jsonb_build_object(
      'order_number',        v_o.order_number,
      'customer_first_name', split_part(btrim(v_o.customer_full_name), ' ', 1),
      'cancelled',           true,
      'stage',               'CANCELLED');
  end if;

  -- Surat jalan TERBARU (doc_date terbesar): kalau sebuah pesanan dikirim
  -- bertahap, yang menjawab "sampai mana" adalah pengiriman paling akhir.
  select max(d.doc_date) into v_do_date
  from order_documents d
  where d.order_id = v_o.id and d.doc_type = 'DO';

  -- TAHAP — seluruhnya diturunkan; satu-satunya masukan manual adalah
  -- delivered_at (keputusan owner D).
  if v_o.fulfillment_path = 'SHOWROOM_VISIT' then
    v_stage := case when v_o.customer_arrived_at is not null
                    then 'PICKED_UP' else 'READY_FOR_PICKUP' end;
  else
    -- DIRECT_DELIVERY, DAN pesanan lama yang fulfillment_path-nya NULL
    -- (0009 sengaja tidak mem-backfill jalur pesanan lama). Untuk pesanan
    -- tanpa jalur, tangga ini tidak MENGARANG apa pun: adanya surat jalan
    -- adalah fakta, dan penandaan diterima adalah fakta.
    if v_o.delivered_at is not null then v_stage := 'DELIVERED';
    elsif v_do_date is not null      then v_stage := 'SHIPPING';
    else                                  v_stage := 'ORDER_RECEIVED';
    end if;
  end if;

  select coalesce(
           jsonb_agg(jsonb_build_object(
             'name',      i.name_snapshot,
             'code',      i.code_snapshot,
             'qty',       i.quantity,
             'photo_url', p.photo_url
           ) order by i.created_at),
           '[]'::jsonb)
    into v_items
  from order_items i
  left join sanci_products p on p.id = i.product_id
  where i.order_id = v_o.id;

  -- Tidak ada baris penawaran → seluruh bagian uang DIHILANGKAN (bukan
  -- ditampilkan sebagai nol — nol adalah angka, "belum ada" bukan).
  select s.final_amount, s.dp_amount into v_final, v_dp
  from order_sanci_offers s
  where s.order_id = v_o.id;

  if v_final is not null then
    v_amounts := jsonb_build_object(
      'final', v_final,
      'dp',    coalesce(v_dp, 0),
      'sisa',  greatest(v_final - coalesce(v_dp, 0), 0));
  end if;

  return jsonb_build_object(
    'order_number',        v_o.order_number,
    'customer_first_name', split_part(btrim(v_o.customer_full_name), ' ', 1),
    'cancelled',           false,
    'stage',               v_stage,
    'city',                nullif(btrim(coalesce(v_o.customer_city, '')), ''),
    'fulfillment_path',    v_o.fulfillment_path,
    'do_date',             v_do_date,
    'delivered_at',        v_o.delivered_at,
    'items',               v_items,
    'amounts',             v_amounts,
    'has_address',         coalesce(nullif(btrim(coalesce(v_o.shipping_address, '')), ''),
                                    nullif(btrim(coalesce(v_o.customer_address, '')), '')) is not null);
end;
$$;

-- ── 6. RPC: buka alamat lengkap dengan nomor HP ─────────────

-- Pemanggil mengirim nomor yang SUDAH dinormalisasi oleh
-- normalizePhoneID() (web/lib/orders-shared.ts) di sisi SERVER — berkas itu
-- menyatakan dirinya satu-satunya sumber kebenaran normalisasi telepon dan
-- MELARANG menduplikasi logikanya di SQL (baris 1–4). Karena itu fungsi ini
-- TIDAK menormalisasi; ia hanya membuang karakter non-digit (perlindungan
-- terhadap spasi/tanda hubung yang tersisa) lalu MEMBANDINGKAN. Yang
-- penting secara keamanan bukan di mana normalisasi terjadi, melainkan
-- bahwa PERBANDINGANNYA di server dan phone_normalized TIDAK PERNAH
-- dikirim keluar.
--
-- REM PENEBAK: 5 kali salah berturut-turut → terkunci 15 menit. Setelah
-- terkunci, penghitung direset ke 0 supaya sesudah masa kunci habis
-- pemiliknya yang sah mendapat lima percobaan penuh lagi, bukan langsung
-- terkunci pada kesalahan pertama.
--
-- Status yang dikembalikan (halaman WAJIB menampilkan ketiganya secara
-- jujur, LESSONS #10 — tidak boleh ada yang disamarkan jadi yang lain):
--   {"status":"ok",        "address": "<alamat lengkap>"}
--   {"status":"invalid",   "attempts_left": N}
--   {"status":"locked",    "locked_until": "<waktu>"}
--   {"status":"not_found"}                  ← token tidak dikenal
--
-- Alamat yang dikembalikan: shipping_address pesanan ini kalau terisi,
-- kalau tidak alamat master pelanggan. Keduanya adalah alamat MILIK
-- pembuka yang sudah membuktikan nomor HP-nya sendiri.
--
-- SECURITY DEFINER, VOLATILE (ia menulis penghitung).
create or replace function public.fn_customer_reveal_address(p_token text, p_phone text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id      uuid;
  v_addr    text;
  v_norm    text;
  v_digits  text;
  v_failed  integer;
  v_locked  timestamptz;
begin
  if p_token is null or btrim(p_token) = '' then
    return jsonb_build_object('status', 'not_found');
  end if;

  select o.id,
         coalesce(nullif(btrim(coalesce(o.shipping_address, '')), ''),
                  nullif(btrim(coalesce(c.address, '')), '')),
         c.phone_normalized
    into v_id, v_addr, v_norm
  from partner_orders o
  join customers c on c.id = o.customer_id
  where o.customer_view_token = p_token;

  if v_id is null then
    return jsonb_build_object('status', 'not_found');
  end if;

  select a.failed_count, a.locked_until into v_failed, v_locked
  from customer_view_attempts a
  where a.order_id = v_id;

  if v_locked is not null and v_locked > now() then
    return jsonb_build_object('status', 'locked', 'locked_until', v_locked);
  end if;

  v_digits := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');

  if v_digits <> '' and v_norm is not null and v_digits = v_norm then
    -- Berhasil: rem dilepas seluruhnya.
    delete from customer_view_attempts where order_id = v_id;
    return jsonb_build_object('status', 'ok', 'address', v_addr);
  end if;

  v_failed := coalesce(v_failed, 0) + 1;

  if v_failed >= 5 then
    v_locked := now() + interval '15 minutes';
    insert into customer_view_attempts (order_id, failed_count, locked_until, updated_at)
    values (v_id, 0, v_locked, now())
    on conflict (order_id) do update
      set failed_count = 0, locked_until = excluded.locked_until, updated_at = now();
    return jsonb_build_object('status', 'locked', 'locked_until', v_locked);
  end if;

  insert into customer_view_attempts (order_id, failed_count, locked_until, updated_at)
  values (v_id, v_failed, null, now())
  on conflict (order_id) do update
    set failed_count = excluded.failed_count, locked_until = null, updated_at = now();

  return jsonb_build_object('status', 'invalid', 'attempts_left', 5 - v_failed);
end;
$$;

-- ── 7. Permukaan EXECUTE (LESSONS #26) ──────────────────────

-- Kedua RPC adalah PINTU MASUK pelanggan yang belum login: anon WAJIB
-- boleh memanggilnya (tanpa ini halaman /lihat mati), authenticated ikut
-- (staf yang membuka tautan pelanggannya sendiri dari HP yang sedang
-- login). public DICABUT supaya tidak ada peran lain yang ikut kebagian
-- lewat pewarisan.
do $$
begin
  execute 'revoke all on function public.fn_customer_order_view(text) from public';
  execute 'revoke all on function public.fn_customer_reveal_address(text, text) from public';
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'grant execute on function public.fn_customer_order_view(text) to anon';
    execute 'grant execute on function public.fn_customer_reveal_address(text, text) to anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.fn_customer_order_view(text) to authenticated';
    execute 'grant execute on function public.fn_customer_reveal_address(text, text) to authenticated';
  end if;
end;
$$;

-- ── 8. Pemeriksaan PERILAKU (dijalankan di dalam berkas ini) ──

-- Tiga asersi di bawah TIDAK bisa dijawab dengan membaca katalog sistem —
-- keduanya soal APA YANG SUNGGUH TERJADI. Hasilnya ditulis ke tabel
-- sementara supaya bisa ikut di blok verifikasi §9 sebagai angka biasa,
-- sejajar dengan asersi struktural (LESSONS #7: yang dicocokkan adalah
-- angka, bukan "Run tanpa tulisan merah").
drop table if exists v0023_behavior;
create temporary table v0023_behavior (check_type text primary key, result text);

do $$
declare
  v_cnt  bigint;
  v_json jsonb;
begin
  -- (1) anon membaca partner_orders LANGSUNG → WAJIB 0 baris.
  begin
    set local role anon;
    select count(*) into v_cnt from public.partner_orders;
    reset role;
    insert into v0023_behavior values ('ANON_ORDERS_ROWS', v_cnt::text);
  exception when others then
    reset role;
    -- Peran anon tidak ada / tidak bisa di-SET (Postgres polos) — katakan
    -- terus terang, jangan mengarang angka 0 yang terlihat seperti lulus.
    insert into v0023_behavior values ('ANON_ORDERS_ROWS', 'TIDAK DIUJI: ' || sqlerrm);
  end;

  -- (2) Token palsu → RPC tampilan mengembalikan NULL (bukan error, bukan
  --     objek kosong).
  select public.fn_customer_order_view('token-palsu-0023-tidak-mungkin-ada') into v_json;
  insert into v0023_behavior
  values ('RPC_FAKE_TOKEN_NULL', case when v_json is null then '1' else '0' end);

  -- (3) Token palsu → RPC alamat menjawab not_found (dan TIDAK menulis
  --     apa pun ke customer_view_attempts).
  select public.fn_customer_reveal_address('token-palsu-0023-tidak-mungkin-ada', '628123456789')
    into v_json;
  insert into v0023_behavior
  values ('RPC_REVEAL_FAKE_TOKEN', coalesce(v_json->>'status', '(null)'));
end;
$$;

-- ── 9. Verifikasi (hasilnya di-copy balik ke Claude) ────────
-- Angka yang diharapkan — cocokkan SATU PER SATU. "Run tanpa tulisan merah"
-- bukan bukti (LESSONS #7 & #16). Total 35 asersi (32 struktural + 3
-- perilaku §8) — semuanya sudah diukur di Postgres 16 lokal pada rantai
-- penuh 0001→…→0021→0023, dan berkas ini dijalankan ulang 3x dengan
-- `pg_dump -s` nol beda (penyaring `\restrict` LESSONS #33 dipakai).
--
-- TOKEN TAUTAN PELANGGAN
--   TOKEN_COLUMN                    1
--   TOKEN_NOT_NULL                  1   ← WAJIB 1
--   TOKEN_HAS_DEFAULT               1   ← DEFAULT acak terpasang (pesanan
--                                         BARU dapat token sendiri)
--   TOKEN_UNIQUE                    1   ← unique index terpasang
--   TOKEN_BACKFILL_COMPLETE         1   ← WAJIB 1: NOL baris ber-token NULL
--   TOKEN_ALL_DISTINCT              1   ← WAJIB 1: jumlah token unik =
--                                         jumlah pesanan (bukti table-rewrite
--                                         mengevaluasi DEFAULT per baris)
--   TOKEN_MIN_LENGTH               64   ← token terpendek di tabel; pada
--                                         database kosong hasilnya 0 dan itu
--                                         benar (tidak ada baris)
-- PENANDA DITERIMA PELANGGAN
--   DELIVERED_AT_COLUMN             1
--   DELIVERED_BY_COLUMN             1
--   DELIVERED_AT_NULLABLE           1   ← WAJIB 1 (LESSONS #8: tidak ada
--                                         default yang mengarang fakta)
--   DELIVERED_NO_DEFAULT            0   ← WAJIB 0: tidak ada DEFAULT di
--                                         kedua kolom
--   DELIVERED_NOT_FROZEN            0   ← WAJIB 0: delivered_at TIDAK
--                                         disebut fn_guard_order_immutable_cols
--                                         (0005) — kalau 1, cabang tidak akan
--                                         pernah bisa menandai
-- PENJAGA
--   LINK_GUARD_FN                   1
--   LINK_GUARD_TRIGGER              1   ← trg_order_customer_link terpasang
--   LINK_GUARD_INSERT_AND_UPDATE    1   ← WAJIB 1: berlaku untuk INSERT DAN
--                                         UPDATE (alasan 0009 §2)
--   LINK_GUARD_EXEC_PUBLIC          0   ← LESSONS #26
--   LINK_GUARD_EXEC_ANON            0
--   LINK_GUARD_EXEC_AUTHENTICATED   0
-- REM PENEBAK
--   ATTEMPTS_TABLE                  1
--   ATTEMPTS_RLS                    1
--   ATTEMPTS_POLICIES               0   ← WAJIB 0 (asersi negatif inti):
--                                         tabel ber-RLS tanpa policy =
--                                         tertutup untuk SEMUA peran
--                                         PostgREST (pola 0009 §3)
--   ATTEMPTS_FK_CASCADE             1
-- RPC PELANGGAN
--   VIEW_RPC / REVEAL_RPC           1 / 1
--   VIEW_RPC_SECDEF / REVEAL_RPC_SECDEF   1 / 1
--   RPC_EXEC_PUBLIC                 0   ← WAJIB 0
--   RPC_EXEC_ANON                   2   ← WAJIB 2: kedua RPC terbuka untuk
--                                         anon (tanpa ini halaman /lihat mati)
--   RPC_EXEC_AUTHENTICATED          2
--   VIEW_RPC_NO_SELECT_STAR         1   ← WAJIB 1: badan fungsi tidak memuat
--                                         to_jsonb(o)/select * (daftar putih
--                                         disusun kolom demi kolom)
-- GARIS MERAH
--   AUDIT_ROW_UNTOUCHED             1   ← WAJIB 1: berkas ini tidak mengubah
--                                         fn_audit_row — versi aktif MASIH
--                                         memuat pemetaan PRODUCT_PRICE milik
--                                         0021 (kalau 0022 mendefinisikannya
--                                         ulang lebih dulu, angka ini tetap 1
--                                         karena 0022 pun menyalin utuh)
--   AUDIT_ORDER_UPDATED_GENERIC     1   ← WAJIB 1: cabang generik
--                                         v_prefix || '_UPDATED' masih ada —
--                                         itulah yang mencatat delivered_at
-- PERILAKU (§8)
--   ANON_ORDERS_ROWS                0   ← WAJIB 0: anon TIDAK melihat satu
--                                         baris pun partner_orders langsung
--   RPC_FAKE_TOKEN_NULL             1   ← token palsu → NULL
--   RPC_REVEAL_FAKE_TOKEN   not_found
--
-- Bukti perilaku selengkapnya (tahap linimasa, kunci 15 menit, daftar putih
-- yang benar-benar tidak membocorkan telepon/alasan, audit ORDER_UPDATED
-- untuk delivered_at) ada di supabase/test-harness/95_behavior_0023.sql —
-- bukan di blok ini, karena butuh baris pesanan UJI yang tidak boleh
-- mengotori data produksi (alasan yang sama dengan 0019/0021).

select 'TOKEN_COLUMN' as check_type, count(*)::text as result
from information_schema.columns
where table_schema = 'public' and table_name = 'partner_orders'
  and column_name = 'customer_view_token'
union all
select 'TOKEN_NOT_NULL', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'partner_orders'
  and column_name = 'customer_view_token' and is_nullable = 'NO'
union all
select 'TOKEN_HAS_DEFAULT', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'partner_orders'
  and column_name = 'customer_view_token' and column_default is not null
union all
select 'TOKEN_UNIQUE', count(*)::text
from pg_indexes
where schemaname = 'public' and tablename = 'partner_orders'
  and indexname = 'partner_orders_customer_view_token_key'
  and indexdef like '%UNIQUE%'
union all
select 'TOKEN_BACKFILL_COMPLETE',
       (not exists (select 1 from public.partner_orders where customer_view_token is null))::int::text
union all
select 'TOKEN_ALL_DISTINCT',
       (select (count(*) = count(distinct customer_view_token))::int::text from public.partner_orders)
union all
select 'TOKEN_MIN_LENGTH',
       coalesce((select min(length(customer_view_token))::text from public.partner_orders), '0')
union all
select 'DELIVERED_AT_COLUMN', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'partner_orders'
  and column_name = 'delivered_at' and data_type = 'timestamp with time zone'
union all
select 'DELIVERED_BY_COLUMN', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'partner_orders'
  and column_name = 'delivered_by' and data_type = 'uuid'
union all
select 'DELIVERED_AT_NULLABLE', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'partner_orders'
  and column_name = 'delivered_at' and is_nullable = 'YES'
union all
select 'DELIVERED_NO_DEFAULT', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'partner_orders'
  and column_name in ('delivered_at', 'delivered_by') and column_default is not null
union all
select 'DELIVERED_NOT_FROZEN', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_guard_order_immutable_cols'
  and p.prosrc like '%delivered_at%'
union all
select 'LINK_GUARD_FN', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_guard_order_customer_link'
union all
select 'LINK_GUARD_TRIGGER', count(*)::text
from pg_trigger tg join pg_class cl on cl.oid = tg.tgrelid
join pg_namespace ns on ns.oid = cl.relnamespace
where not tg.tgisinternal and ns.nspname = 'public'
  and cl.relname = 'partner_orders' and tg.tgname = 'trg_order_customer_link'
union all
select 'LINK_GUARD_INSERT_AND_UPDATE', count(*)::text
from pg_trigger tg join pg_class cl on cl.oid = tg.tgrelid
join pg_namespace ns on ns.oid = cl.relnamespace
where not tg.tgisinternal and ns.nspname = 'public'
  and cl.relname = 'partner_orders' and tg.tgname = 'trg_order_customer_link'
  and (tg.tgtype & 4) > 0 and (tg.tgtype & 16) > 0 and (tg.tgtype & 2) > 0
union all
select 'LINK_GUARD_EXEC_PUBLIC',
       (has_function_privilege('public', 'public.fn_guard_order_customer_link()', 'execute'))::int::text
union all
select 'LINK_GUARD_EXEC_ANON',
       coalesce((select (has_function_privilege('anon', 'public.fn_guard_order_customer_link()', 'execute'))::int::text
                 from pg_roles where rolname = 'anon'), '0')
union all
select 'LINK_GUARD_EXEC_AUTHENTICATED',
       coalesce((select (has_function_privilege('authenticated', 'public.fn_guard_order_customer_link()', 'execute'))::int::text
                 from pg_roles where rolname = 'authenticated'), '0')
union all
select 'ATTEMPTS_TABLE', count(*)::text
from information_schema.tables
where table_schema = 'public' and table_name = 'customer_view_attempts'
union all
select 'ATTEMPTS_RLS', count(*)::text
from pg_tables
where schemaname = 'public' and tablename = 'customer_view_attempts' and rowsecurity
union all
select 'ATTEMPTS_POLICIES', count(*)::text
from pg_policies where schemaname = 'public' and tablename = 'customer_view_attempts'
union all
select 'ATTEMPTS_FK_CASCADE', count(*)::text
from pg_constraint
where conrelid = 'public.customer_view_attempts'::regclass and contype = 'f'
  and confrelid = 'public.partner_orders'::regclass and confdeltype = 'c'
union all
select 'VIEW_RPC', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_customer_order_view'
union all
select 'REVEAL_RPC', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_customer_reveal_address'
union all
select 'VIEW_RPC_SECDEF', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_customer_order_view' and p.prosecdef
union all
select 'REVEAL_RPC_SECDEF', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_customer_reveal_address' and p.prosecdef
union all
select 'RPC_EXEC_PUBLIC',
       ((has_function_privilege('public', 'public.fn_customer_order_view(text)', 'execute'))::int
        + (has_function_privilege('public', 'public.fn_customer_reveal_address(text, text)', 'execute'))::int)::text
union all
select 'RPC_EXEC_ANON',
       coalesce((select ((has_function_privilege('anon', 'public.fn_customer_order_view(text)', 'execute'))::int
                         + (has_function_privilege('anon', 'public.fn_customer_reveal_address(text, text)', 'execute'))::int)::text
                 from pg_roles where rolname = 'anon'), '0')
union all
select 'RPC_EXEC_AUTHENTICATED',
       coalesce((select ((has_function_privilege('authenticated', 'public.fn_customer_order_view(text)', 'execute'))::int
                         + (has_function_privilege('authenticated', 'public.fn_customer_reveal_address(text, text)', 'execute'))::int)::text
                 from pg_roles where rolname = 'authenticated'), '0')
union all
select 'VIEW_RPC_NO_SELECT_STAR', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_customer_order_view'
  and p.prosrc not like '%to_jsonb(o)%' and p.prosrc not like '%select *%'
union all
select 'AUDIT_ROW_UNTOUCHED', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%''PRODUCT_PRICE''%'
union all
select 'AUDIT_ORDER_UPDATED_GENERIC', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row'
  and p.prosrc like '%v_prefix || ''_UPDATED''%'
union all
select check_type, result from v0023_behavior;
