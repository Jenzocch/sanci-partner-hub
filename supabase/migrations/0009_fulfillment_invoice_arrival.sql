-- ============================================================
-- SANCI Partner Hub — Phase 2 irisan keempat
-- Migration 0009: jalur pemenuhan pesanan (kirim langsung / kunjungan showroom)
--                 + total belanja di toko & foto invoice (bucket PRIVAT)
--                 + penanda "pelanggan tiba di SANCI" (khusus admin)
--                 + catatan internal SANCI (khusus admin, append-only)
--                 (idempotent — aman dijalankan ulang)
-- Jalankan di: Supabase Studio → SQL Editor → paste seluruh file → Run
--
-- PRASYARAT: 0001 → 0003 → 0004 → 0005 → 0006 → 0007 → 0008 sudah dijalankan,
-- DALAM URUTAN ITU. Blok pengaman di bawah berhenti dengan pesan jelas kalau
-- belum. Setelah file ini, urutan rantai penuh menjadi
-- 0001 → 0003 → 0004 → 0005 → 0006 → 0007 → 0008 → 0009 (lihat
-- migrations/README.md — ATURAN BESI).
--
-- ============================================================
-- LATAR BELAKANG BISNIS (ditetapkan Jenzo, 2026-08-17)
-- ============================================================
--
-- Saat cabang (mis. Golden Home) membuat pesanan, ada DUA jalur:
--   DIRECT_DELIVERY  pelanggan sudah membeli produk SANCI di toko cabang →
--                    SANCI mengirim langsung, pelanggan TIDAK perlu datang.
--   SHOWROOM_VISIT   pelanggan akan datang sendiri ke showroom SANCI untuk
--                    melihat / memilih produk.
--
-- Selain itu cabang boleh melaporkan BERAPA yang dibelanjakan pelanggan di
-- tokonya, dan mengunggah foto invoice-nya sebagai bukti. SANCI lalu menilai
-- SECARA MANUAL paket/diskon apa yang pantas diberikan.
--
-- BATAS YANG TEGAS — jangan dilanggar di migration mana pun berikutnya:
--   * Basis data ini TIDAK menghitung diskon.
--   * Basis data ini TIDAK menyimpan harga, tidak memvalidasi harga, tidak
--     punya aturan penetapan harga apa pun.
--   * partner_purchase_amount adalah ANGKA RUJUKAN yang dilaporkan cabang —
--     bukan dasar perhitungan otomatis, dan bukan angka yang boleh dipercaya
--     mentah-mentah (isinya klaim cabang; invoice-nya lampiran pendukung).
-- Keputusan SANCI atas sebuah pesanan ("Invoice 2,5jt → kasih diskon 10% +
-- free ongkir") hidup sebagai KALIMAT di order_internal_notes, bukan sebagai
-- angka terhitung. Itu disengaja: begitu diskon dihitung mesin, ia menjadi
-- janji sistem kepada partner — dan itu urusan Phase berikutnya, bukan ini.
--
-- ============================================================
-- APA YANG DIBUKA IRISAN INI (dan hanya ini)
-- ============================================================
--   partner_orders        → 5 kolom baru, SEMUANYA nullable. Tiga di antaranya
--                           (fulfillment_path, partner_purchase_amount,
--                           invoice_url) boleh diisi & diubah CABANG lewat Edit
--                           biasa. Dua sisanya (customer_arrived_at/by) hanya
--                           admin, dipaksa trigger.
--   order_internal_notes  → tabel BARU. HANYA admin SANCI. Cabang tidak punya
--                           satu pun policy — termasuk SELECT.
--   storage 'order-invoices' → bucket BARU, PRIVAT (public = false). Cabang
--                           boleh mengunggah & melihat invoice pesanan cabang
--                           yang boleh ia edit/lihat; admin bebas.
--
-- YANG SENGAJA TIDAK DIBUKA:
--   * DELETE order_internal_notes — untuk siapa pun, termasuk admin (append-only).
--   * UPDATE order_internal_notes — sama, termasuk admin. Salah tulis =
--     tulis catatan baru, persis semangat audit_logs (SPEC §62).
--   * Penandaan "pelanggan tiba" dari sisi cabang — apa pun caranya.
--   * Perhitungan harga/diskon apa pun.
--
-- CATATAN PENYIMPANGAN DARI SPEC: SPEC §60 & §121 menaruh "Customer Arrived"
-- di Phase 3, dan SPEC §20 menyatakan Phase 2 tidak menyentuh Invoice. Kedua
-- hal itu DIMAJUKAN ke sini atas keputusan owner (Jenzo, 2026-08-17), dengan
-- lingkup yang jauh lebih sempit daripada rencana Phase 3: hanya SATU penanda
-- waktu kedatangan dan satu berkas lampiran — tanpa check-in, tanpa pemilihan
-- furnitur, tanpa alur pembayaran. Ditulis di sini supaya pembaca SPEC tidak
-- mengira ini penyelundupan lingkup.
-- ============================================================

-- ── 0. Pengaman prasyarat ───────────────────────────────────

do $$
begin
  if to_regclass('public.partner_orders') is null
     or to_regprocedure('public.fn_can_edit_branch(uuid)') is null
     or to_regprocedure('public.fn_can_view_branch(uuid)') is null
     or to_regprocedure('public.fn_audit_row()') is null then
    raise exception
      'Migration 0001/0004/0005 belum dijalankan di database ini. Jalankan 0001 → 0003 → 0004 → 0005 → 0006 → 0007 → 0008 dulu, baru 0009.';
  end if;

  -- Penanda 0007: tanpa itu policy SELECT customers masih versi lama dan setiap
  -- "Simpan pelanggan" dari cabang gagal (P0 lama). Sama alasannya dengan blok
  -- pengaman di 0008.
  if to_regprocedure('public.fn_customer_has_visible_order(uuid)') is null then
    raise exception
      'Migration 0007_audit_fixes.sql belum dijalankan di database ini. Jalankan 0007 dulu, baru 0009.';
  end if;

  -- Penanda 0008: file ini menumpuk di atas struktur irisan ketiga
  -- (partner_packages + RPC koreksi atribusi) dan mendefinisikan ulang
  -- fn_audit_row milik 0008.
  if to_regclass('public.partner_packages') is null
     or to_regprocedure('public.fn_correct_order_attribution(uuid, uuid, text)') is null then
    raise exception
      'Migration 0008_packages_customer_edit_attribution.sql belum dijalankan di database ini. Jalankan 0008 dulu, baru 0009.';
  end if;

  -- storage.buckets selalu ada di proyek Supabase. Kalau tidak ada, file ini
  -- sedang dijalankan di Postgres biasa — katakan terus terang, jangan gagal
  -- di tengah INSERT (pola yang sama dengan 0003).
  if to_regclass('storage.buckets') is null then
    raise exception
      'Schema storage tidak ditemukan. File ini khusus untuk database Supabase (bucket privat order-invoices).';
  end if;
end;
$$;

-- ── 1. Kolom baru di partner_orders ─────────────────────────

-- SEMUANYA nullable, dan itu aman ditinjau LESSONS #8: null di sini berarti
-- "belum ditanyakan / belum terjadi", satu-satunya arti yang mungkin. Pesanan
-- LAMA (yang dibuat sebelum migration ini) tetap sah apa adanya — tidak ada
-- backfill, tidak ada DEFAULT yang diam-diam mengklaim sesuatu tentang mereka.
-- Justru sebaliknya: memberi DEFAULT 'DIRECT_DELIVERY' akan MENGARANG fakta
-- bisnis untuk ratusan pesanan lama yang jalurnya tidak pernah ditanyakan.
alter table public.partner_orders
  add column if not exists fulfillment_path        text;
alter table public.partner_orders
  add column if not exists partner_purchase_amount numeric(15,2);
alter table public.partner_orders
  add column if not exists invoice_url             text;
alter table public.partner_orders
  add column if not exists customer_arrived_at     timestamptz;
-- Tanpa foreign key ke auth.users, mengikuti pola created_by (0004) dan
-- cancelled_by (0005): jejak SIAPA yang menandai harus tetap ada walau akun
-- pengguna kelak dihapus dari Auth.
alter table public.partner_orders
  add column if not exists customer_arrived_by     uuid;

-- CHECK dipasang terpisah: ADD COLUMN IF NOT EXISTS tidak akan memasang
-- constraint kalau kolomnya sudah ada dari percobaan sebelumnya (pola yang
-- sama dengan foreign key package_id di 0008).
--
-- Nilai enum tetap Bahasa Inggris di dalam basis data; terjemahan ke Bahasa
-- Indonesia ada di FULFILLMENT_PATH_LABEL (web/lib/orders-shared.ts) — itu
-- keputusan lama yang berlaku untuk SEMUA enum di proyek ini.
do $$
begin
  if not exists (select 1 from pg_constraint
                 where conname = 'partner_orders_fulfillment_path_check'
                   and conrelid = 'public.partner_orders'::regclass) then
    alter table public.partner_orders
      add constraint partner_orders_fulfillment_path_check
      check (fulfillment_path is null
             or fulfillment_path in ('DIRECT_DELIVERY','SHOWROOM_VISIT'));
  end if;

  -- >= 0 saja, TIDAK ada batas atas dan TIDAK ada aturan bisnis lain: angka ini
  -- rujukan, bukan dasar hitungan (lihat BATAS YANG TEGAS di kepala berkas).
  -- Yang dicegah hanya hal yang jelas mustahil, yaitu belanja negatif.
  if not exists (select 1 from pg_constraint
                 where conname = 'partner_orders_partner_purchase_amount_check'
                   and conrelid = 'public.partner_orders'::regclass) then
    alter table public.partner_orders
      add constraint partner_orders_partner_purchase_amount_check
      check (partner_purchase_amount is null or partner_purchase_amount >= 0);
  end if;
end;
$$;

-- CATATAN untuk Server Action (batas yang diketahui, bukan bug):
-- numeric(15,2) memuat paling besar 9.999.999.999.999,99 (13 digit rupiah),
-- sedangkan parseIDRInput() di web/lib/orders-shared.ts masih menerima sampai
-- 99.999.999.999.999. Angka di antara keduanya akan ditolak DATABASE dengan
-- 22003 ("numeric field overflow"), bukan oleh formulir. Praktisnya mustahil
-- untuk belanja mebel satu pelanggan, tapi kalau suatu hari muncul, pesannya
-- harus diterjemahkan Server Action — jangan biarkan pengguna melihat 22003.
--
-- CATATAN penamaan invoice_url: isinya PATH di dalam bucket privat
-- ('<order_id>/<nama berkas>'), BUKAN alamat web yang bisa dibuka siapa saja.
-- Nama kolomnya sudah dipakai lapisan tampilan (web/lib/audit-format.ts) jadi
-- dipertahankan; yang tidak boleh adalah menyimpan getPublicUrl() ke sini —
-- bucket ini privat, aksesnya lewat signed URL berumur pendek. Signed URL
-- selalu membawa token+kedaluwarsa sehingga masalah cache LESSONS #22 (ganti
-- berkas, alamat sama, pengguna melihat gambar lama) tidak muncul di sini.

-- ── 2. Penjaga penanda kedatangan (khusus admin) ────────────

-- KENAPA TRIGGER DAN BUKAN RLS: RLS hanya melihat baris HASIL; ia tidak bisa
-- membandingkan nilai LAMA vs BARU. Cabang MEMANG punya policy UPDATE atas
-- pesanannya sendiri (o_partner_update, 0005) — jadi tanpa trigger ini,
-- pengguna cabang bisa menandai pelanggannya "sudah tiba di SANCI" lewat API
-- biasa dan semua policy tetap lolos. Kolom ini adalah pengakuan SANCI bahwa
-- orangnya benar-benar muncul di showroom; hanya SANCI yang boleh menuliskannya.
--
-- KENAPA TERPISAH dari fn_guard_order_immutable_cols (0005): daftar beku 0005
-- menjawab "kolom mana yang tidak boleh disentuh SAMA SEKALI dari cabang" dan
-- kelima kolom baru TIDAK boleh masuk ke sana — tiga di antaranya justru wajib
-- bisa diedit cabang. Yang dibutuhkan di sini adalah aturan lain: "kolom ini
-- boleh berubah, tapi hanya oleh admin, dan nilainya ditentukan server". Digabung
-- ke satu fungsi, keduanya jadi sulit dibaca dan gampang salah saat Phase 3
-- menambah tahap kedatangan yang sesungguhnya.
--
-- BERLAKU JUGA UNTUK INSERT — bukan hanya UPDATE. Tanpa itu, cabang cukup
-- mengirim customer_arrived_at pada saat MEMBUAT pesanan dan penjagaannya
-- terlewat sepenuhnya. (Penjaga 0005 hanya UPDATE karena kolom pembatalan
-- memang tidak berarti apa-apa pada baris yang baru lahir; kolom ini berarti.)
--
-- SECURITY INVOKER (bawaan): fungsi ini tidak membaca tabel apa pun — cukup
-- membandingkan OLD vs NEW. Keputusan "siapa admin" tetap datang dari
-- fn_is_admin() milik 0001 yang memang security definer.
create or replace function public.fn_guard_order_arrival() returns trigger
language plpgsql set search_path = public as $$
declare
  v_admin  boolean     := public.fn_is_admin();
  v_old_at timestamptz := case when tg_op = 'UPDATE' then old.customer_arrived_at end;
  v_old_by uuid        := case when tg_op = 'UPDATE' then old.customer_arrived_by end;
begin
  if not v_admin
     and (new.customer_arrived_at is distinct from v_old_at
          or new.customer_arrived_by is distinct from v_old_by) then
    raise exception
      'Penanda "pelanggan tiba di SANCI" hanya boleh diisi admin SANCI, bukan dari aplikasi cabang.';
  end if;

  if new.customer_arrived_at is not null and v_old_at is null then
    -- Waktu server, bukan jam HP (LESSONS #11); pelakunya dari sesi login,
    -- bukan kiriman client (LESSONS #6) — persis pola cancelled_at/by di 0005.
    -- Tanpa sesi (SQL Editor / seed / perbaikan manual) customer_arrived_by
    -- dibiarkan apa adanya supaya perbaikan data tidak ikut gagal.
    new.customer_arrived_at := now();
    if auth.uid() is not null then
      new.customer_arrived_by := auth.uid();
    end if;

  elsif new.customer_arrived_at is null and v_old_at is not null then
    -- Batal-tandai (hanya bisa sampai sini kalau admin): pelakunya ikut
    -- dikosongkan supaya tidak ada pesanan tanpa waktu kedatangan yang masih
    -- membawa nama penanda lama. Riwayat lengkapnya tetap di audit_logs.
    new.customer_arrived_by := null;
  end if;

  return new;
end;
$$;

-- Urutan trigger BEFORE di partner_orders setelah file ini (Postgres: urut nama):
--   trg_check_order_refs     (0004/0008 — cabang, staf, & paket milik partner benar)
--   trg_order_arrival        (0009 — INI)
--   trg_order_immutable_cols (0005 — kolom atribusi beku)
--   trg_order_status_flow    (0005 — alih status & pembatalan)
--   trg_touch                (0001 — updated_at)
-- Urutan di antara ketiga penjaga tidak mengubah hasil: semuanya menolak dengan
-- exception, yang pertama menolak duluan yang menang.
drop trigger if exists trg_order_arrival on public.partner_orders;
create trigger trg_order_arrival before insert or update on public.partner_orders
  for each row execute function public.fn_guard_order_arrival();

-- ── 3. order_internal_notes: penilaian internal SANCI ───────

-- INI INTI ISOLASI DATA IRISAN INI. Isinya kalimat seperti "Invoice 2,5jt →
-- kasih diskon 10% + free ongkir": pertimbangan komersial SANCI atas SATU
-- partner. Kalau Golden Home bisa membacanya — apalagi membaca milik partner
-- lain — yang bocor bukan sekadar data pesanan, melainkan cara SANCI menilai
-- mitranya. Karena itu cabang TIDAK diberi satu pun policy, termasuk SELECT.
-- "Tanpa policy" pada tabel ber-RLS bukan sekadar tersembunyi: tertutup.
--
-- order_id ON DELETE RESTRICT (LESSONS #4): pesanan yang sudah punya catatan
-- penilaian tidak boleh lenyap dan membawa catatannya diam-diam.
--
-- TIDAK ada updated_at, dan itu disengaja: tabel ini append-only (lihat §5),
-- jadi kolom "kapan terakhir diubah" akan selamanya sama dengan created_at dan
-- hanya menipu pembacanya.
create table if not exists public.order_internal_notes (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.partner_orders(id) on delete restrict,
  -- Spasi saja bukan catatan. Pola yang sama dengan alasan pembatalan (0005)
  -- dan alasan koreksi atribusi (0008), hanya saja di sini ditegakkan
  -- constraint karena tabelnya memang cuma punya satu isi bermakna.
  note       text not null check (btrim(note) <> ''),
  created_by uuid,                    -- auth.uid(), dipaksa trigger 0004
  created_at timestamptz not null default now()
);

create index if not exists idx_order_internal_notes_order
  on public.order_internal_notes (order_id, created_at desc);

-- Idempotency untuk jaringan lemah: tabel append-only tidak bisa dikoreksi,
-- jadi kiriman ulang buta setelah respons hilang akan menggandakan catatan.
-- client_request_id unik (null dibiarkan — sisipan manual SQL tak wajib pakai)
-- membiarkan front-end memakai pola confirmByRequestId yang sudah ada.
alter table public.order_internal_notes
  add column if not exists client_request_id text;
create unique index if not exists order_internal_notes_client_request_id_key
  on public.order_internal_notes (client_request_id);

-- ── 4. Trigger order_internal_notes ─────────────────────────

-- Audit dipasang untuk INSERT/UPDATE/DELETE walaupun policy-nya hanya INSERT.
-- Bukan sisa copy-paste: service_role (Edge Function, skrip pemeliharaan) dan
-- pemilik tabel MELEWATI RLS sepenuhnya. Kalau suatu hari ada yang menghapus
-- atau menyunting catatan lewat jalur itu, satu-satunya yang akan tahu adalah
-- baris audit ini.
drop trigger if exists trg_audit on public.order_internal_notes;
create trigger trg_audit after insert or update or delete on public.order_internal_notes
  for each row execute function public.fn_audit_row();

drop trigger if exists trg_set_created_by on public.order_internal_notes;
create trigger trg_set_created_by before insert on public.order_internal_notes
  for each row execute function public.fn_set_created_by();

-- SENGAJA TANPA trg_touch: tidak ada kolom updated_at (lihat §3).

-- ── 5. RLS order_internal_notes (admin saja, append-only) ───

alter table public.order_internal_notes enable row level security;

-- SENGAJA BUKAN "for all": `for all` akan sekaligus memberi admin hak UPDATE
-- dan DELETE, dan justru itu yang tidak boleh ada. Dipisah dua policy sempit.
drop policy if exists oin_admin_read on public.order_internal_notes;
create policy oin_admin_read on public.order_internal_notes
  for select using (public.fn_is_admin());

-- LESSONS #25: policy SELECT ini TIDAK memeriksa apa pun tentang barisnya
-- sendiri — fn_is_admin() menjawab dari platform_admins, bukan dari
-- order_internal_notes. Jadi `insert ... returning` (yang dipakai supabase-js
-- `.insert().select()`) aman: baris baru tidak perlu "ditemukan" untuk lolos
-- RETURNING. Ini dibuktikan tes perilaku, bukan diasumsikan.
drop policy if exists oin_admin_insert on public.order_internal_notes;
create policy oin_admin_insert on public.order_internal_notes
  for insert with check (public.fn_is_admin());

-- TIDAK ADA policy UPDATE. TIDAK ADA policy DELETE. Untuk SIAPA PUN, admin
-- termasuk. Catatan penilaian adalah catatan pada satu momen; kalau salah,
-- tulis catatan baru yang mengoreksinya. Menyunting di tempat akan membuat
-- riwayat penilaian SANCI bisa dirapikan setelah kejadian — persis yang tidak
-- boleh terjadi pada bahan sengketa dengan partner (semangat yang sama dengan
-- audit_logs di 0001).

-- ── 6. Bucket invoice PRIVAT + storage RLS ──────────────────

-- public = FALSE. Ini perbedaan terpenting dari 'partner-logos' (0003) dan
-- alasannya sederhana: logo memang untuk dilihat siapa saja, invoice belanja
-- pelanggan tidak. Bucket publik di Supabase berarti SIAPA PUN yang menebak
-- (atau pernah melihat) path-nya bisa membukanya selamanya tanpa login —
-- storage RLS TIDAK menolongnya. Jadi privasi invoice bergantung pada baris
-- ini, bukan pada policy di bawahnya.
--
-- Batas ukuran + daftar tipe berkas adalah pertahanan SERVER; pengecilan
-- gambar di browser hanya kenyamanan (pola yang sama dengan 0003).
-- application/pdf ikut diizinkan karena invoice toko sering sudah berupa PDF.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('order-invoices', 'order-invoices', false, 5242880,
        array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Path yang disepakati: '<order_id>/<nama berkas>'. Seluruh keamanan storage
-- di bawah berdiri di atas kesepakatan itu — segmen pertama path adalah id
-- pesanan, dan dari situ ketahuan cabang mana pemiliknya.
--
-- WAJIB SECURITY DEFINER (LESSONS #15): fungsi ini membaca partner_orders,
-- tabel yang punya RLS sendiri. Kalau subquery ini ditulis langsung di dalam
-- policy storage, ia ikut tersaring RLS partner_orders — pesanan yang tidak
-- terlihat akan tampak "tidak ada", branch_id menjadi null, dan aturannya salah
-- arah tanpa suara. Di dalam security definer ia membaca data yang SEBENARNYA
-- ada, lalu jawaban "boleh atau tidak" tetap dihitung fn_can_view/edit_branch
-- dari identitas PEMANGGIL.
--
-- Path yang tidak sesuai kesepakatan (segmen pertama bukan uuid, atau uuid
-- pesanan yang tidak ada) mengembalikan NULL → fn_can_view_branch(null) /
-- fn_can_edit_branch(null) bernilai false untuk pengguna cabang → tertutup.
-- Gagal ke arah TERTUTUP itu memang yang diinginkan: berkas yang tidak bisa
-- dipertanggungjawabkan kepemilikannya tidak boleh bisa diunggah.
create or replace function public.fn_invoice_order_branch(p_name text) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  v_order_id uuid;
  v_branch   uuid;
begin
  begin
    v_order_id := split_part(coalesce(p_name, ''), '/', 1)::uuid;
  exception when others then
    return null;      -- bukan uuid → bukan path yang kita akui
  end;

  select o.branch_id into v_branch from partner_orders o where o.id = v_order_id;
  return v_branch;    -- null kalau pesanannya tidak ada
end;
$$;

-- RLS pada storage.objects sudah aktif bawaan Supabase — sengaja TIDAK
-- dipanggil `alter table ... enable row level security` di sini, karena tabel
-- itu milik supabase_storage_admin dan perintah tersebut bisa ditolak (catatan
-- yang sama dengan 0003).
--
-- Setiap policy dikunci `bucket_id = 'order-invoices'` di depan supaya TIDAK
-- ADA satu pun dari aturan ini yang menyentuh bucket lain — 'partner-logos'
-- (0003) sama sekali tidak berubah perilakunya, dan blok verifikasi di bawah
-- membuktikannya.

-- BACA: admin, atau siapa pun yang boleh MELIHAT cabang pemilik pesanan.
-- Sengaja memakai fn_can_view_branch (bukan edit): cabang yang boleh melihat
-- pesanan cabang lain (visibility PARTNER_ALL_BRANCHES) juga boleh melihat
-- invoice-nya — invoice adalah bagian dari pesanan itu, bukan data terpisah.
drop policy if exists order_invoices_read on storage.objects;
create policy order_invoices_read on storage.objects
  for select using (
    bucket_id = 'order-invoices'
    and (public.fn_is_admin()
         or public.fn_can_view_branch(public.fn_invoice_order_branch(name)))
  );

-- TULIS: admin, atau yang boleh MENGEDIT cabang pemilik pesanan — sama persis
-- dengan siapa yang boleh mengubah kolom invoice_url pada pesanannya
-- (o_partner_update + fn_can_edit_branch). Dua hak ini harus bergerak
-- bersama-sama; kalau tidak, akan ada pengguna yang bisa mengunggah berkas
-- tapi tidak bisa mencatatkannya, atau sebaliknya.
drop policy if exists order_invoices_insert on storage.objects;
create policy order_invoices_insert on storage.objects
  for insert with check (
    bucket_id = 'order-invoices'
    and (public.fn_is_admin()
         or public.fn_can_edit_branch(public.fn_invoice_order_branch(name)))
  );

-- upsert ke path yang sama = UPDATE, jadi policy UPDATE wajib ada (pelajaran
-- dari 0003). USING dan WITH CHECK dua-duanya diisi: USING menentukan berkas
-- lama mana yang boleh disentuh, WITH CHECK menentukan berkas hasil tetap
-- berada di pesanan yang boleh diedit — tanpa WITH CHECK, sebuah berkas bisa
-- "dipindahkan" ke folder pesanan cabang lain lewat rename.
drop policy if exists order_invoices_update on storage.objects;
create policy order_invoices_update on storage.objects
  for update using (
    bucket_id = 'order-invoices'
    and (public.fn_is_admin()
         or public.fn_can_edit_branch(public.fn_invoice_order_branch(name)))
  ) with check (
    bucket_id = 'order-invoices'
    and (public.fn_is_admin()
         or public.fn_can_edit_branch(public.fn_invoice_order_branch(name)))
  );

-- HAPUS: admin saja — sama seperti 'partner-logos' (0003). Cabang mengganti
-- invoice lewat upsert (UPDATE di atas), jadi tidak ada alur cabang yang
-- membutuhkan DELETE; dan invoice adalah bukti pendukung penilaian SANCI, yang
-- tidak boleh bisa dilenyapkan pihak yang mengunggahnya (LESSONS #4).
drop policy if exists order_invoices_delete on storage.objects;
create policy order_invoices_delete on storage.objects
  for delete using (bucket_id = 'order-invoices' and public.fn_is_admin());

-- ── 7. Permukaan EXECUTE (LESSONS #26) ──────────────────────

-- Setiap fungsi security definer baru wajib ditentukan permukaan EXECUTE-nya
-- SAAT LAHIR, tidak boleh mengandalkan bawaan Postgres (yang memberi EXECUTE
-- ke PUBLIC untuk setiap fungsi baru).
--
-- 7a. fn_guard_order_arrival — fungsi trigger. Dicabut, seperti sembilan
--     fungsi trigger lain di 0007. Ini pertahanan berlapis: Postgres sendiri
--     menolak pemanggilan langsung fungsi trigger, dan mencabut EXECUTE tidak
--     menghentikan trigger-nya (hak diperiksa saat CREATE TRIGGER).
--
-- 7b. fn_invoice_order_branch — WAJIB TETAP BISA DIPANGGIL anon +
--     authenticated. Ekspresi policy dievaluasi sebagai pengguna yang melakukan
--     query, jadi hak EXECUTE-nya ikut diperiksa. Kalau dicabut, setiap operasi
--     storage pada bucket ini GAGAL dengan "permission denied for function"
--     alih-alih menyembunyikan berkas — error database yang menyamar jadi
--     kesimpulan bisnis, persis yang dilarang LESSONS #10. Diberikan ke anon
--     juga karena permintaan storage dari pengunjung yang belum login tetap
--     menyentuh policy ini.
--
--     Dan memang tidak ada yang bocor karenanya: fungsi ini mengembalikan
--     branch_id dari sebuah path. Untuk mendapat jawaban, penanya harus SUDAH
--     memegang id pesanannya; jawabannya adalah id cabang, bukan satu pun
--     kolom data pesanan. Itu setara dengan yang bisa ia peroleh lewat
--     `select branch_id from partner_orders` biasa — kecuali RLS di sana masih
--     menyaring, sementara di sini tidak. Batas itu diterima secara sadar:
--     tanpa security definer, policy storage-nya justru SALAH (LESSONS #15).
do $$
begin
  execute 'revoke all on function public.fn_guard_order_arrival() from public';
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.fn_guard_order_arrival() from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.fn_guard_order_arrival() from authenticated';
  end if;

  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'grant execute on function public.fn_invoice_order_branch(text) to anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.fn_invoice_order_branch(text) to authenticated';
  end if;
end;
$$;

-- ── 8. Audit: ORDER_CUSTOMER_ARRIVED + ORDER_INTERNAL_NOTE ──

-- Definisi ulang UTUH sekali lagi (bukan tambalan) supaya file ini idempotent.
-- SELURUH perilaku 0004, 0005 dan 0008 dipertahankan kata demi kata: awalan
-- CUSTOMER/ORDER/PACKAGE, pengambilan partner/branch dari created_via_*,
-- ORDER_CANCELLED beserta alasannya, ORDER_ATTRIBUTION_CORRECTED beserta GUC
-- app.audit_reason, dan CUSTOMER_PHONE_CHANGED. Yang bertambah hanya dua:
--   1. awalan 'ORDER_INTERNAL_NOTE' untuk tabel order_internal_notes, sehingga
--      INSERT tercatat sebagai ORDER_INTERNAL_NOTE_CREATED (label sudah ada di
--      web/lib/audit-format.ts). Tanpa pemetaan ini, cabang `else` akan
--      menghasilkan 'ORDER_INTERNAL_NOTES_CREATED' — beda satu huruf, dan
--      halaman Aktivitas akan menampilkan kode mentah kepada Jenzo.
--   2. customer_arrived_at yang berubah dari null menjadi terisi →
--      ORDER_CUSTOMER_ARRIVED, bukan ORDER_UPDATED yang generik.
--
-- Urutan pemeriksaan pada UPDATE (yang di atas menang):
--   status berubah → attribution berubah → kedatangan → telepon → izin → generik.
-- Kedatangan sengaja DI BAWAH atribusi: kalau satu perintah melakukan keduanya
-- sekaligus, yang lebih penting dicatat adalah berpindahnya atribusi (SPEC §64).
-- Perubahan fulfillment_path / partner_purchase_amount / invoice_url TIDAK
-- diberi aksi khusus — semuanya jatuh ke ORDER_UPDATED, dan kolom before/after
-- sudah memuat nilainya (audit-format.ts sudah punya label ketiganya).
--
-- CATATAN untuk yang menjalankan ulang 0001/0004/0005/0008 SETELAH file ini:
-- definisi ini akan tertimpa dan kedua aksi baru hilang diam-diam. Jalankan
-- ulang 0009 untuk memulihkannya (lihat migrations/README.md). Sebaliknya,
-- karena versi ini memuat SELURUH perilaku 0004+0005+0008, menjalankan 0009
-- paling akhir juga MEMULIHKAN pemetaan yang sempat tertimpa berkas lama.
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
    when 'order_internal_notes' then 'ORDER_INTERNAL_NOTE'
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

  -- order_internal_notes tidak punya kolom partner_id/branch_id sendiri; tanpa
  -- blok ini barisnya masuk audit dengan partner kosong dan hilang dari layar
  -- Aktivitas yang disaring per partner. Aman dibaca di sini karena fungsi ini
  -- security definer (RLS partner_orders dilewati) — dan tidak menambah
  -- kebocoran apa pun, sebab audit_logs hanya bisa dibaca admin (al_admin_read,
  -- 0001), yaitu satu-satunya pihak yang boleh melihat tabel catatannya juga.
  if tg_table_name = 'order_internal_notes' then
    select o.partner_id, o.branch_id into v_partner, v_branch
    from partner_orders o
    where o.id = nullif(coalesce(rec->>'order_id', old_rec->>'order_id'), '')::uuid;
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

-- ── 9. Verifikasi (hasilnya di-copy balik ke Claude) ────────
-- Angka yang diharapkan — cocokkan SATU PER SATU. "Run tanpa tulisan merah"
-- bukan bukti (LESSONS #7 & #16).
--
-- KOLOM BARU
--   ORDER_NEW_COLUMNS          5   ← kelima kolom ada
--   ORDER_NEW_COLS_NULLABLE    5   ← WAJIB 5: semuanya nullable, data lama aman
--   ORDER_NEW_CHECKS           2   ← check fulfillment_path & purchase_amount
--   ORDER_NEW_COLS_NOT_FROZEN  1   ← WAJIB 1: TIDAK satu pun kolom baru masuk
--                                     daftar beku 0005 (kalau 0, cabang tidak
--                                     akan bisa mengisi jalur & nilai belanja)
-- PENANDA KEDATANGAN
--   ARRIVAL_GUARD_FN           1
--   ARRIVAL_TRIGGER            1
--   ARRIVAL_TRIGGER_ON_INSERT  1   ← WAJIB 1: penjaga juga jalan saat INSERT
--   ORDER_TRIGGERS             8   ← 7 (0005) + trg_order_arrival
-- CATATAN INTERNAL
--   NOTES_TABLE                1
--   NOTES_FK_RESTRICT          1   ← order_id ON DELETE RESTRICT
--   NOTES_RLS                  1
--   NOTES_POLICIES             2   ← oin_admin_read + oin_admin_insert
--   NOTES_UPDATE_DELETE_POLICIES 0 ← WAJIB 0: append-only, admin pun tidak
--   NOTES_NON_ADMIN_POLICIES   0   ← WAJIB 0: TIDAK ADA policy yang bisa benar
--                                     tanpa fn_is_admin() → cabang nol akses,
--                                     SELECT sekalipun. INI inti irisan ini.
--   NOTES_TRIGGERS             2   ← audit + set_created_by
--   NOTES_IDEMPOTENCY_KEY      1   ← unique client_request_id (anti catatan ganda)
-- BUCKET INVOICE
--   INVOICE_BUCKET             1
--   INVOICE_BUCKET_PUBLIC      false ← WAJIB false. Kalau true, seluruh isinya
--                                      bisa dibuka tanpa login dan storage RLS
--                                      di bawahnya tidak berarti apa-apa.
--   INVOICE_BUCKET_LIMIT       5242880
--   INVOICE_BUCKET_MIME        4     ← jpeg, png, webp, pdf
--   INVOICE_POLICIES           4     ← read, insert, update, delete
--   INVOICE_DELETE_ADMIN_ONLY  1     ← policy DELETE tidak menyebut can_edit
--   INVOICE_HELPER / _SECDEF   1 / 1
--   INVOICE_HELPER_EXEC_ANON / _AUTHENTICATED  1 / 1  ← WAJIB 1 (LESSONS #26:
--                                      kalau 0, operasi storage ERROR, bukan
--                                      sekadar menyembunyikan berkas)
--   ARRIVAL_GUARD_EXEC_PUBLIC  0     ← WAJIB 0
-- BUCKET LOGO TIDAK IKUT BERUBAH
--   LOGO_BUCKET_PUBLIC         true  ← 0003 tidak tersentuh
--   LOGO_POLICIES              4
-- AUDIT
--   AUDIT_CUSTOMER_ARRIVED     1
--   AUDIT_INTERNAL_NOTE        1
--   AUDIT_KEEP_0004            1   ← pemetaan created_via_* milik 0004 utuh
--   AUDIT_KEEP_0005            1   ← ORDER_CANCELLED milik 0005 utuh
--   AUDIT_KEEP_0008_PKG        1   ← awalan PACKAGE milik 0008 utuh
--   AUDIT_KEEP_0008_PHONE      1   ← CUSTOMER_PHONE_CHANGED milik 0008 utuh
--   AUDIT_KEEP_0008_ATTR       1   ← ORDER_ATTRIBUTION_CORRECTED milik 0008 utuh
--
-- Angka blok verifikasi berkas LAMA yang BERUBAH setelah 0009 — ini normal,
-- daftar lengkapnya ada di migrations/README.md:
--   0001: RLS_ENABLED 13 → 14 · POLICIES 29 → 31 · TRIGGERS 22 → 23
--   0004: TRIGGERS 11 → 12
--   0005: ORDER_TRIGGERS 7 → 8
-- Angka "WAJIB 0" milik berkas lama TIDAK BOLEH berubah satu pun. Kalau ada
-- yang tidak cocok, JANGAN anggap beres: laporkan apa adanya.

select 'ORDER_NEW_COLUMNS' as check_type,
       count(*)::text as result
from information_schema.columns
where table_schema = 'public' and table_name = 'partner_orders'
  and column_name in ('fulfillment_path','partner_purchase_amount','invoice_url',
                      'customer_arrived_at','customer_arrived_by')
union all
select 'ORDER_NEW_COLS_NULLABLE', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'partner_orders'
  and column_name in ('fulfillment_path','partner_purchase_amount','invoice_url',
                      'customer_arrived_at','customer_arrived_by')
  and is_nullable = 'YES'
union all
select 'ORDER_NEW_CHECKS', count(*)::text
from pg_constraint
where conrelid = 'public.partner_orders'::regclass and contype = 'c'
  and conname in ('partner_orders_fulfillment_path_check',
                  'partner_orders_partner_purchase_amount_check')
union all
select 'ORDER_NEW_COLS_NOT_FROZEN', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_guard_order_immutable_cols'
  and p.prosrc not like '%fulfillment_path%'
  and p.prosrc not like '%partner_purchase_amount%'
  and p.prosrc not like '%invoice_url%'
  and p.prosrc not like '%customer_arrived%'
union all
select 'ARRIVAL_GUARD_FN', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_guard_order_arrival'
union all
select 'ARRIVAL_TRIGGER', count(*)::text
from pg_trigger tg join pg_class cl on cl.oid = tg.tgrelid
join pg_namespace ns on ns.oid = cl.relnamespace
where not tg.tgisinternal and ns.nspname = 'public'
  and cl.relname = 'partner_orders' and tg.tgname = 'trg_order_arrival'
union all
select 'ARRIVAL_TRIGGER_ON_INSERT', count(*)::text
from pg_trigger tg join pg_class cl on cl.oid = tg.tgrelid
join pg_namespace ns on ns.oid = cl.relnamespace
where not tg.tgisinternal and ns.nspname = 'public'
  and cl.relname = 'partner_orders' and tg.tgname = 'trg_order_arrival'
  and (tg.tgtype & 4) = 4              -- bit INSERT
union all
select 'ORDER_TRIGGERS', count(*)::text
from pg_trigger tg join pg_class cl on cl.oid = tg.tgrelid
join pg_namespace ns on ns.oid = cl.relnamespace
where not tg.tgisinternal and ns.nspname = 'public' and cl.relname = 'partner_orders'
union all
select 'NOTES_TABLE', count(*)::text
from information_schema.tables
where table_schema = 'public' and table_name = 'order_internal_notes'
union all
select 'NOTES_FK_RESTRICT', count(*)::text
from pg_constraint
where conrelid = 'public.order_internal_notes'::regclass and contype = 'f'
  and confdeltype = 'r'
union all
select 'NOTES_RLS', count(*)::text
from pg_tables
where schemaname = 'public' and tablename = 'order_internal_notes' and rowsecurity
union all
select 'NOTES_POLICIES', count(*)::text
from pg_policies where schemaname = 'public' and tablename = 'order_internal_notes'
union all
select 'NOTES_UPDATE_DELETE_POLICIES', count(*)::text
from pg_policies
where schemaname = 'public' and tablename = 'order_internal_notes'
  and cmd in ('UPDATE','DELETE')
union all
select 'NOTES_NON_ADMIN_POLICIES', count(*)::text
from pg_policies
where schemaname = 'public' and tablename = 'order_internal_notes'
  and coalesce(qual, '') || ' ' || coalesce(with_check, '') not like '%fn_is_admin%'
union all
select 'NOTES_TRIGGERS', count(*)::text
from pg_trigger tg join pg_class cl on cl.oid = tg.tgrelid
join pg_namespace ns on ns.oid = cl.relnamespace
where not tg.tgisinternal and ns.nspname = 'public' and cl.relname = 'order_internal_notes'
union all
select 'NOTES_IDEMPOTENCY_KEY', count(*)::text
from pg_indexes
where schemaname = 'public' and tablename = 'order_internal_notes'
  and indexname = 'order_internal_notes_client_request_id_key'
union all
select 'INVOICE_BUCKET', count(*)::text
from storage.buckets where id = 'order-invoices'
union all
select 'INVOICE_BUCKET_PUBLIC',
       coalesce((select public::text from storage.buckets where id = 'order-invoices'), 'TIDAK ADA')
union all
select 'INVOICE_BUCKET_LIMIT',
       coalesce((select file_size_limit::text from storage.buckets where id = 'order-invoices'), 'TIDAK ADA')
union all
select 'INVOICE_BUCKET_MIME',
       coalesce((select array_length(allowed_mime_types, 1)::text
                 from storage.buckets where id = 'order-invoices'), 'TIDAK ADA')
union all
select 'INVOICE_POLICIES', count(*)::text
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname like 'order_invoices_%'
union all
select 'INVOICE_DELETE_ADMIN_ONLY', count(*)::text
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname = 'order_invoices_delete'
  and qual like '%fn_is_admin%' and qual not like '%fn_can_edit_branch%'
union all
select 'INVOICE_HELPER', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_invoice_order_branch'
union all
select 'INVOICE_HELPER_SECDEF', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_invoice_order_branch' and p.prosecdef
union all
select 'INVOICE_HELPER_EXEC_ANON',
       coalesce((select (has_function_privilege('anon', 'public.fn_invoice_order_branch(text)', 'execute'))::int::text
                 from pg_roles where rolname = 'anon'), '0')
union all
select 'INVOICE_HELPER_EXEC_AUTHENTICATED',
       coalesce((select (has_function_privilege('authenticated', 'public.fn_invoice_order_branch(text)', 'execute'))::int::text
                 from pg_roles where rolname = 'authenticated'), '0')
union all
select 'ARRIVAL_GUARD_EXEC_PUBLIC',
       (has_function_privilege('public', 'public.fn_guard_order_arrival()', 'execute'))::int::text
union all
select 'LOGO_BUCKET_PUBLIC',
       coalesce((select public::text from storage.buckets where id = 'partner-logos'), 'TIDAK ADA')
union all
select 'LOGO_POLICIES', count(*)::text
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname like 'partner_logos_%'
union all
select 'AUDIT_CUSTOMER_ARRIVED', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row'
  and p.prosrc like '%ORDER_CUSTOMER_ARRIVED%'
union all
select 'AUDIT_INTERNAL_NOTE', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row'
  and p.prosrc like '%order_internal_notes%'
union all
select 'AUDIT_KEEP_0004', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row'
  and p.prosrc like '%created_via_partner_id%'
union all
select 'AUDIT_KEEP_0005', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row'
  and p.prosrc like '%ORDER_CANCELLED%'
union all
select 'AUDIT_KEEP_0008_PKG', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row'
  and p.prosrc like '%partner_packages%'
union all
select 'AUDIT_KEEP_0008_PHONE', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row'
  and p.prosrc like '%CUSTOMER_PHONE_CHANGED%'
union all
select 'AUDIT_KEEP_0008_ATTR', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row'
  and p.prosrc like '%ORDER_ATTRIBUTION_CORRECTED%';
