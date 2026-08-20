-- ============================================================
-- SANCI Partner Hub — Phase 2 irisan kedelapan
-- Migration 0014: izin per-partner atas Penawaran SANCI + DP/Kondisi
--                 Pembayaran, isi pesanan per-baris (order_items) dengan
--                 catatan per-produk, dan alamat pengiriman per-pesanan
--                 (idempotent — aman dijalankan ulang)
-- Jalankan di: Supabase Studio → SQL Editor → paste seluruh file → Run
--
-- PRASYARAT: 0001 → 0003 → 0004 → 0005 → 0006 → 0007 → 0008 → 0009 → 0010 →
-- 0011 → 0012 → 0013 sudah dijalankan, DALAM URUTAN ITU. Blok pengaman di
-- bawah berhenti dengan pesan jelas kalau belum. Setelah berkas ini, rantai
-- penuhnya menjadi 0001 → 0003 → 0004 → 0005 → 0006 → 0007 → 0008 → 0009 →
-- 0010 → 0011 → 0012 → 0013 → 0014 (lihat migrations/README.md — ATURAN BESI).
--
-- ============================================================
-- PENYIMPANGAN SADAR DARI PERMINTAAN AWAL — baca ini dulu
-- ============================================================
--
-- Permintaan awal irisan ini (dari catatan perencanaan) minta "rantai diskon
-- persentase" (mis. −8% lalu −10%, dikalikan berurutan) + markup% + potongan
-- tunai, SEMUANYA dihitung basis data lewat trigger, menghasilkan
-- `final_amount`. Berkas ini SENGAJA TIDAK membangun bagian itu.
--
-- Alasannya bukan kelalaian — ini bentrok LANGSUNG dengan dua aturan yang
-- SUDAH tertulis di commit yang sama dengan awal rantai berkas ini (0013,
-- `dc223a2`, satu hari sebelum berkas ini):
--   1. `web/lib/i18n/GLOSSARY.md` §"Penawaran SANCI bukan harga" (owner 拍板
--      2026-08-20): "同理也不叫'Diskon / Discount / 折扣':系统不计算折扣，
--      只记录人决定的那个数字" — sistem TIDAK menghitung diskon, hanya
--      mencatat angka yang SUDAH diputuskan manusia.
--   2. `FEATURES.md` §"Phase 2 irisan ketujuh", "本切片刻意不做": "系统不算
--      任何东西。不比对 partner_purchase_amount、不算折扣%、没有任何定价
--      规则(沿用 0009 订下的硬边界)" — batas TEGAS yang diwarisi dari 0009.
--
-- Kedua kalimat itu bukan komentar basa-basi lama yang sudah usang — keduanya
-- BARU ditulis di commit yang sama yang menjadi dasar (HEAD) irisan ini.
-- Membangun mesin hitung diskon persis di atasnya, tanpa konfirmasi ulang
-- dari Jenzo, berisiko membangun sesuatu yang justru baru saja ia putuskan
-- TIDAK diinginkan. Ini keputusan yang hanya boleh diambil pemilik produk,
-- bukan agen — jadi bagian itu DITAHAN, dilaporkan eksplisit ke pemanggil,
-- bukan dibangun diam-diam atau dibuang diam-diam.
--
-- Yang TETAP dibangun dari permintaan itu — karena ini murni PENCATATAN
-- (angka yang diketik manusia), bukan PERHITUNGAN, jadi tidak melanggar
-- kedua kalimat di atas:
--   * `dp_amount` (Uang Muka/DP) — angka yang diketik manusia, sama sifatnya
--     dengan `amount` yang sudah ada sejak 0013.
--   * `payment_condition` (Kondisi Pembayaran) — teks bebas, sama sifatnya
--     dengan `notes` yang sudah ada di `partner_orders` sejak 0004.
--   * `check (dp_amount <= amount)` — ini VALIDASI (menolak kombinasi yang
--     jelas tidak masuk akal), BUKAN perhitungan turunan seperti sisa bayar.
--     Sisa bayar (`amount - dp_amount`) TETAP murni matematika tampilan di
--     app + lembar, TIDAK disimpan sebagai kolom — mengikuti persis pola
--     `remaining balance` yang sudah didokumentasikan sebagai "display math"
--     di rencana asal.
-- TIDAK dibangun: `discount_pcts`, `markup_pct`, `cash_discount`,
-- `final_amount`, trigger penghitung, kolom UI "+ tambah diskon", dan kolom
-- "Diskon"/"Markup"/"Potongan Tunai" di Google Sheets. `can_discount` (flag
-- izin ketiga yang diminta) juga TIDAK dibangun — tidak ada apa pun untuk
-- diberi izin kalau tidak ada perhitungan diskon.
--
-- Konsekuensinya untuk §1 di bawah: hanya DUA flag izin yang dibangun
-- (`can_view_offer`, `can_edit_offer`), bukan tiga.
-- ============================================================
--
-- ============================================================
-- APA YANG DIBUKA IRISAN INI (dan hanya ini)
-- ============================================================
--   partner_access_policies → 2 kolom boolean baru, DEFAULT false (fail-closed):
--                             can_view_offer, can_edit_offer. Mengatur apakah
--                             pengguna cabang boleh MELIHAT / MENGISI-MENGUBAH
--                             Penawaran SANCI pada pesanan CABANG SENDIRI.
--   order_sanci_offers      → 2 kolom baru (dp_amount, payment_condition) +
--                             TIGA policy baru untuk cabang (SELECT/INSERT/
--                             UPDATE, gated flag di atas + kepemilikan
--                             pesanan). oso_admin_all TIDAK berubah.
--   order_items             → tabel BARU. Snapshot isi pesanan per baris
--                             (nama/kode produk DIBEKUKAN saat itu, seperti
--                             package_name di 0008) + catatan/warna/ukuran per
--                             baris — inti permintaan Jenzo "每個訂單下的產品
--                             或是paket都要可以備註". Diisi otomatis dari isi
--                             Package saat pesanan dibuat (best-effort, TIDAK
--                             pernah menggagalkan pesanan itu sendiri), dan
--                             bisa diedit cabang selama pesanan masih aktif.
--   partner_orders           → kolom shipping_address (nullable, SELALU bisa
--                             diedit — lihat §4, TIDAK masuk daftar beku 0005).
--
-- YANG SENGAJA TIDAK DIBUKA (selain mesin diskon di atas):
--   * DELETE order_items untuk siapa pun selain admin/cabang pemilik pesanan
--     aktif — TIDAK ada DELETE untuk pesanan yang sudah CANCELLED (baris
--     order_items ikut membeku saat pesanannya membeku).
--   * DELETE order_sanci_offers untuk cabang — tetap admin-only (mengikuti
--     oso_admin_all yang sudah ada; "SANCI memutuskan tidak jadi memberi
--     penawaran" tetap keputusan SANCI, bukan cabang).
--   * Harga di katalog produk. Batas "tanpa harga" milik 0010 tetap berlaku
--     penuh — `unit_price`/`line_discount` di order_items adalah nilai
--     REFERENSI per SATU baris SATU pesanan (sama semangatnya dengan `amount`
--     di 0013), bukan harga produk.
-- ============================================================

-- ── 0. Pengaman prasyarat ───────────────────────────────────

do $$
begin
  if to_regclass('public.order_sanci_offers') is null then
    raise exception
      'Migration 0013_order_offer_amount.sql belum dijalankan di database ini. Jalankan 0001 → … → 0013 dulu, baru 0014.';
  end if;

  if to_regclass('public.partner_package_items') is null
     or to_regclass('public.sanci_products') is null then
    raise exception
      'Migration 0010/0012 belum dijalankan di database ini. Jalankan 0001 → … → 0013 dulu, baru 0014.';
  end if;

  if to_regprocedure('public.fn_audit_row()') is null
     or to_regprocedure('public.fn_touch_updated_at()') is null
     or to_regprocedure('public.fn_set_created_by()') is null
     or to_regprocedure('public.fn_is_admin()') is null
     or to_regprocedure('public.fn_can_view_branch(uuid)') is null
     or to_regprocedure('public.fn_can_edit_branch(uuid)') is null
     or to_regprocedure('public.fn_guard_order_immutable_cols()') is null then
    raise exception
      'Fungsi dasar (fn_audit_row / fn_touch_updated_at / fn_set_created_by / fn_is_admin / fn_can_view_branch / fn_can_edit_branch / fn_guard_order_immutable_cols) belum lengkap. Jalankan 0001 → … → 0013 dulu, baru 0014.';
  end if;
end;
$$;

-- ── 1. partner_access_policies: 2 flag izin baru ────────────

-- DEFAULT false — fail-closed (LESSONS #8): partner yang belum pernah
-- disentuh admin di tab izin ini TIDAK otomatis melihat/mengisi Penawaran
-- SANCI. Ini konsisten dengan oso_admin_all (0013) yang sebelum berkas ini
-- adalah SATU-SATUNYA jalan masuk — membuka izin baru dengan DEFAULT true
-- akan diam-diam membuka nilai penawaran SEMUA partner yang sudah ada tanpa
-- satu pun keputusan sadar admin.
alter table public.partner_access_policies
  add column if not exists can_view_offer boolean not null default false;
alter table public.partner_access_policies
  add column if not exists can_edit_offer boolean not null default false;

-- ── 2. order_sanci_offers: DP + Kondisi Pembayaran ──────────

-- dp_amount: numeric(15,2), SAMA PERSIS dengan `amount` (0013) dan
-- `partner_purchase_amount` (0009) — alasan yang sama: ketiganya tampil di
-- layar yang berdekatan, diketik lewat parseIDRInput() yang sama.
-- NOT NULL DEFAULT 0: "belum ada DP" secara alami adalah nol rupiah — beda
-- dari `amount` (0013) yang justru sengaja TIDAK NULL DEFAULT karena "belum
-- ada penawaran" ada bentuknya sendiri (baris tidak ada sama sekali). DP
-- hidup DI DALAM baris penawaran yang sudah ada, jadi tidak ada ambiguitas
-- serupa untuk dijaga.
--
-- CHECK (dp_amount <= amount): validasi, bukan perhitungan turunan (lihat
-- catatan "PENYIMPANGAN SADAR" di atas) — DP tidak boleh melebihi nilai
-- penawaran itu sendiri. Sisa bayar (amount - dp_amount) TETAP murni
-- matematika tampilan di app + lembar Sheets, TIDAK pernah disimpan di sini.
alter table public.order_sanci_offers
  add column if not exists dp_amount numeric(15,2) not null default 0;
alter table public.order_sanci_offers
  add column if not exists payment_condition text;

do $$
begin
  if not exists (select 1 from pg_constraint
                 where conname = 'order_sanci_offers_dp_amount_check'
                   and conrelid = 'public.order_sanci_offers'::regclass) then
    alter table public.order_sanci_offers
      add constraint order_sanci_offers_dp_amount_check check (dp_amount >= 0);
  end if;
  if not exists (select 1 from pg_constraint
                 where conname = 'order_sanci_offers_dp_le_amount_check'
                   and conrelid = 'public.order_sanci_offers'::regclass) then
    alter table public.order_sanci_offers
      add constraint order_sanci_offers_dp_le_amount_check check (dp_amount <= amount);
  end if;
end;
$$;

-- ── 3. order_sanci_offers: RLS cabang (BARU — evolusi dari 0013) ──

-- 0013 §4 menjanjikan: "kalau suatu hari Jenzo memutuskan partner boleh
-- melihat angkanya, yang perlu ditulis hanyalah SATU policy SELECT baru di
-- tabel ini." Berkas ini adalah pemenuhan janji itu — TIDAK mengedit 0013
-- (migration yang sudah dijalankan tidak boleh diedit), hanya menambah
-- policy baru di sini. `oso_admin_all` (0013) TIDAK disentuh.
--
-- Komentar di 0013 §5 yang menyatakan "OFFER_POLICIES 1" dan
-- "OFFER_NONADMIN_POLICIES WAJIB 0" menjadi BASI setelah berkas ini —
-- lihat §6 di bawah untuk penjelasan lengkap kenapa itu perubahan yang
-- DIINGINKAN, bukan regresi.
--
-- LESSONS #25: subquery di sini membaca partner_orders (untuk kepemilikan)
-- dan partner_access_policies (untuk flag) — DUA-DUANYA tabel LAIN, bukan
-- order_sanci_offers itu sendiri. Jadi upsert...select() (dipakai
-- setOrderOffer) tetap aman: RETURNING tidak perlu "menemukan kembali" baris
-- di dalam tabel yang sama.
--
-- INNER JOIN ke partner_access_policies (BUKAN LEFT JOIN seperti
-- fn_can_view_branch/fn_can_edit_branch di 0001) — sengaja beda: LEFT JOIN di
-- sana ada supaya "cabang sendiri" tetap terlihat walau baris kebijakan belum
-- ada (bawaan OWN_BRANCH). Di sini tidak ada bawaan yang aman — TIDAK ada
-- baris kebijakan berarti flag belum pernah diaktifkan admin, dan itu HARUS
-- berarti tertutup (fail-closed, sama filosofinya dengan
-- ACCESS_NO_ROW_MEANS_CLOSED di 0010).
drop policy if exists oso_partner_read on public.order_sanci_offers;
create policy oso_partner_read on public.order_sanci_offers
  for select using (
    exists (
      select 1 from partner_orders o
      join partner_access_policies pol on pol.partner_id = o.partner_id
      where o.id = order_sanci_offers.order_id
        and public.fn_can_view_branch(o.branch_id)
        and (pol.can_view_offer or pol.can_edit_offer)
    )
  );

-- INSERT terpisah dari UPDATE (bukan `for all`) supaya DELETE tetap TIDAK
-- pernah terbuka untuk cabang — "SANCI memutuskan tidak jadi memberi
-- penawaran" (hapus baris) tetap keputusan SANCI (oso_admin_all saja).
drop policy if exists oso_partner_insert on public.order_sanci_offers;
create policy oso_partner_insert on public.order_sanci_offers
  for insert with check (
    exists (
      select 1 from partner_orders o
      join partner_access_policies pol on pol.partner_id = o.partner_id
      where o.id = order_sanci_offers.order_id
        and public.fn_can_edit_branch(o.branch_id)
        and pol.can_edit_offer
    )
  );

drop policy if exists oso_partner_update on public.order_sanci_offers;
create policy oso_partner_update on public.order_sanci_offers
  for update using (
    exists (
      select 1 from partner_orders o
      join partner_access_policies pol on pol.partner_id = o.partner_id
      where o.id = order_sanci_offers.order_id
        and public.fn_can_edit_branch(o.branch_id)
        and pol.can_edit_offer
    )
  ) with check (
    exists (
      select 1 from partner_orders o
      join partner_access_policies pol on pol.partner_id = o.partner_id
      where o.id = order_sanci_offers.order_id
        and public.fn_can_edit_branch(o.branch_id)
        and pol.can_edit_offer
    )
  );

-- TIDAK ADA policy DELETE untuk cabang — tetap admin-only (oso_admin_all).

-- ── 4. partner_orders.shipping_address ──────────────────────

-- Nullable, teks bebas multiline ("送去哪") — BEDA dari address/city/province
-- di master pelanggan (customers, 0004): itu alamat TETAP pelanggan, ini
-- alamat KHUSUS untuk SATU pengiriman pesanan ini (boleh beda dari alamat
-- rumahnya — kirim ke kantor, ke alamat orang lain, dst). Form sisi cabang
-- boleh mem-prefill dari alamat pelanggan (kemudahan), tapi kolomnya sendiri
-- SELALU independen dan SELALU bisa diedit.
--
-- SENGAJA TIDAK masuk daftar beku fn_guard_order_immutable_cols (0005): kolom
-- itu menjawab "atribusi mana yang tidak boleh berubah dari cabang"
-- (partner/cabang/pelanggan/nomor order) — alamat kirim bukan atribusi, ia
-- detail operasional pesanan yang wajar berubah (SPEC §36 turunan). Berkas
-- ini TIDAK mendefinisikan ulang fn_guard_order_immutable_cols — kalau
-- didefinisikan ulang tanpa alasan, migration jadi menumpuk perubahan yang
-- tidak berhubungan; assersi §6 ORDER_SHIPPING_NOT_FROZEN membuktikan kolom
-- ini tetap TIDAK disebut di fungsi itu.
alter table public.partner_orders
  add column if not exists shipping_address text;

-- ── 5. Tabel order_items (isi pesanan per baris + catatan) ──

-- KENAPA name_snapshot/code_snapshot, BUKAN hanya product_id: order_items
-- adalah RIWAYAT pesanan (SPEC precedent §8 milik 0008 — package_name yang
-- membekukan nama saat itu). Kalau produk diganti nama atau ditarik dari
-- katalog BESOK, pesanan MINGGU LALU harus tetap terbaca seperti saat
-- dibuat — bukan diam-diam ikut berubah. product_id tetap disimpan (untuk
-- "pesanan mana saja yang memakai produk X", pertanyaan yang sama seperti
-- 0012), tapi apa yang TAMPIL ke pengguna selalu dari kolom snapshot.
--
-- product_id NULLABLE: baris manual (pesanan tanpa Package, atau item yang
-- ditambah tangan tanpa merujuk katalog) tetap sah — name_snapshot tetap
-- wajib diisi (tidak mungkin ada baris tanpa nama).
--
-- product_id ON DELETE RESTRICT (LESSONS #4, konsisten dengan
-- partner_package_items 0012): produk yang sudah pernah dipakai di sebuah
-- pesanan tidak boleh lenyap dan membawa baris riwayat itu diam-diam.
-- order_id ON DELETE RESTRICT: pesanan yang sudah punya isi baris tidak
-- boleh lenyap membawa isinya — pesanan TIDAK PERNAH dihapus keras di sistem
-- ini (status CANCELLED, bukan DELETE), jadi ini sebagian besar teoretis,
-- tapi semantiknya benar (pola sama dengan order_sanci_offers 0013).
--
-- unit_price/line_discount NULLABLE, numeric(15,2) — nilai REFERENSI per
-- baris (bukan harga katalog, lihat batas di kepala berkas), diisi manusia,
-- dan (§7) hanya boleh diisi/diubah pengguna yang punya can_edit_offer —
-- gerbang yang sama dengan Penawaran SANCI itu sendiri, karena keduanya sama
-- sifatnya: nilai kesepakatan komersial, bukan data operasional pesanan.
create table if not exists public.order_items (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.partner_orders(id) on delete restrict,
  product_id        uuid references public.sanci_products(id) on delete restrict,
  name_snapshot     text not null,
  code_snapshot     text,
  quantity          integer not null default 1 check (quantity > 0),
  note              text,
  color_code        text,
  custom_size       text,
  unit_price        numeric(15,2) check (unit_price is null or unit_price >= 0),
  line_discount     numeric(15,2) check (line_discount is null or line_discount >= 0),
  client_request_id text unique,          -- idempotency salinan dari Package (LESSONS #3, #21)
  created_by        uuid,                 -- auth.uid(), dipaksa trigger 0004
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_order_items_order
  on public.order_items (order_id);
create index if not exists idx_order_items_product
  on public.order_items (product_id);

-- ── 6. Audit: awalan ORDER_ITEM ──────────────────────────────

-- Definisi ulang UTUH fn_audit_row (bukan tambalan) — ATURAN BESI
-- migrations/README.md. Versi yang disalin adalah versi 0013, berkas
-- TERAKHIR yang mendefinisikan ulang fungsi ini. SELURUH perilaku
-- 0004+0005+0008+0009+0010+0012+0013 dipertahankan kata demi kata.
--
-- Yang bertambah hanya DUA hal:
--   1. awalan 'ORDER_ITEM' untuk tabel order_items. Tabel ini TIDAK punya
--      kolom `status`, jadi ORDER_ITEM_CREATED/_UPDATED/_DELETED muncul
--      dengan sendirinya lewat cabang generik yang sudah ada.
--   2. order_items IKUT ke dalam blok pencarian partner/branch yang sama
--      dipakai order_internal_notes (0009) dan order_sanci_offers (0013) —
--      ketiganya mencari lewat kolom bernama SAMA (`order_id`) di tabel
--      induk yang sama (partner_orders), jadi satu blok `in (...)` melayani
--      ketiganya.
--
-- partner_id DAN branch_id, KEDUANYA diisi — sama seperti order_sanci_offers
-- (0013), beda dari partner_package_items (0012): sebuah baris isi pesanan
-- melekat pada SATU pesanan yang lahir di SATU cabang yang jelas.
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
    when 'order_items' then 'ORDER_ITEM'
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

  -- order_internal_notes, order_sanci_offers DAN order_items tidak punya
  -- kolom partner_id/branch_id sendiri; tanpa blok ini barisnya masuk audit
  -- dengan partner kosong dan hilang dari layar Aktivitas yang disaring per
  -- partner. Aman dibaca di sini karena fungsi ini security definer (RLS
  -- partner_orders dilewati) — audit_logs hanya bisa dibaca admin
  -- (al_admin_read, 0001), satu-satunya pihak yang boleh melihat ketiga
  -- tabel itu juga.
  if tg_table_name in ('order_internal_notes','order_sanci_offers','order_items') then
    select o.partner_id, o.branch_id into v_partner, v_branch
    from partner_orders o
    where o.id = nullif(coalesce(rec->>'order_id', old_rec->>'order_id'), '')::uuid;
  end if;

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

-- ── 7. Trigger order_items ───────────────────────────────────

drop trigger if exists trg_audit on public.order_items;
create trigger trg_audit after insert or update or delete on public.order_items
  for each row execute function public.fn_audit_row();

drop trigger if exists trg_touch on public.order_items;
create trigger trg_touch before update on public.order_items
  for each row execute function public.fn_touch_updated_at();

drop trigger if exists trg_set_created_by on public.order_items;
create trigger trg_set_created_by before insert on public.order_items
  for each row execute function public.fn_set_created_by();

-- Kolom yang TIDAK boleh disentuh pengguna cabang sama sekali (identitas
-- baris + snapshot). Pola SAMA PERSIS dengan fn_guard_order_immutable_cols
-- (0005) / fn_guard_customer_immutable_cols (0008): RLS hanya melihat baris
-- HASIL, tidak bisa membandingkan LAMA vs BARU — jadi perbandingan OLD/NEW
-- harus hidup di trigger. Tanpa ini, cabang bisa "mengganti" name_snapshot/
-- code_snapshot/product_id sebuah baris riwayat dan RLS UPDATE tetap lolos
-- (kepemilikan pesanan tidak berubah).
--
-- SECURITY INVOKER (bawaan): tidak membaca tabel apa pun — cukup
-- membandingkan OLD vs NEW.
create or replace function public.fn_guard_order_item_immutable_cols() returns trigger
language plpgsql set search_path = public as $$
declare v_bad text[] := array[]::text[];
begin
  if public.fn_is_admin() then
    return new;
  end if;

  if new.id                is distinct from old.id                then v_bad := v_bad || 'id'::text; end if;
  if new.order_id          is distinct from old.order_id          then v_bad := v_bad || 'order_id'::text; end if;
  if new.product_id        is distinct from old.product_id        then v_bad := v_bad || 'product_id'::text; end if;
  if new.name_snapshot     is distinct from old.name_snapshot     then v_bad := v_bad || 'name_snapshot'::text; end if;
  if new.code_snapshot     is distinct from old.code_snapshot     then v_bad := v_bad || 'code_snapshot'::text; end if;
  if new.created_by        is distinct from old.created_by        then v_bad := v_bad || 'created_by'::text; end if;
  if new.client_request_id is distinct from old.client_request_id then v_bad := v_bad || 'client_request_id'::text; end if;
  if new.created_at        is distinct from old.created_at        then v_bad := v_bad || 'created_at'::text; end if;

  if array_length(v_bad, 1) is not null then
    raise exception
      'Kolom % tidak boleh diubah dari aplikasi cabang. Baris ini adalah salinan (snapshot) isi pesanan — nama/kode/produk dibekukan saat pesanan dibuat.',
      array_to_string(v_bad, ', ');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_order_item_immutable_cols on public.order_items;
create trigger trg_order_item_immutable_cols before update on public.order_items
  for each row execute function public.fn_guard_order_item_immutable_cols();

-- Kolom harga baris (unit_price/line_discount) — HANYA boleh diisi/diubah
-- oleh admin ATAU pengguna cabang yang partner-nya punya can_edit_offer
-- (gerbang yang SAMA dengan Penawaran SANCI, §1/§3). RLS TIDAK bisa
-- menegakkan ini karena RLS bekerja per BARIS, bukan per KOLOM — seorang
-- cabang yang boleh mengubah CATATAN baris (izin standar, §8) tetap boleh
-- lewat RLS menulis UPDATE ke baris yang SAMA; yang membedakan "boleh ubah
-- catatan" dari "boleh ubah harga" adalah trigger ini.
--
-- WAJIB SECURITY DEFINER: membaca partner_orders + partner_access_policies,
-- dua tabel ber-RLS sendiri (LESSONS #15) — tanpa security definer, baris
-- yang tidak terlihat lewat RLS pemanggil akan membuat pemeriksaan ini salah
-- arah secara diam-diam.
create or replace function public.fn_guard_order_item_price_cols() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_can_edit_offer boolean;
  v_touches_price boolean;
begin
  if public.fn_is_admin() then
    return new;
  end if;

  v_touches_price := case
    when tg_op = 'INSERT' then new.unit_price is not null or new.line_discount is not null
    else new.unit_price is distinct from old.unit_price
         or new.line_discount is distinct from old.line_discount
    end;

  if not v_touches_price then
    return new;
  end if;

  select pol.can_edit_offer into v_can_edit_offer
  from partner_orders o
  join partner_access_policies pol on pol.partner_id = o.partner_id
  where o.id = new.order_id;

  if coalesce(v_can_edit_offer, false) is not true then
    raise exception
      'Kolom harga per baris (unit_price/line_discount) hanya bisa diisi atau diubah kalau partner punya izin "Lihat & atur Penawaran SANCI". Catatan/warna/ukuran/jumlah tetap bisa diubah tanpa izin itu.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_order_item_price_guard on public.order_items;
create trigger trg_order_item_price_guard before insert or update on public.order_items
  for each row execute function public.fn_guard_order_item_price_cols();

-- ── 8. RLS order_items ───────────────────────────────────────

alter table public.order_items enable row level security;

drop policy if exists oi_admin_all on public.order_items;
create policy oi_admin_all on public.order_items
  for all using (public.fn_is_admin()) with check (public.fn_is_admin());

-- BACA: siapa pun yang boleh MELIHAT pesanan induknya (fn_can_view_branch —
-- termasuk PARTNER_ALL_BRANCHES lintas cabang sendiri, sama seperti
-- kepemilikan invoice di 0009). Tidak digerbangi flag can_view_offer —
-- isi pesanan (nama/qty/catatan) BUKAN Penawaran SANCI; SPEC/owner tidak
-- pernah memintanya dirahasiakan dari cabang sendiri, beda dari
-- order_sanci_offers yang memang rahasia dagang SANCI (0013).
drop policy if exists oi_partner_read on public.order_items;
create policy oi_partner_read on public.order_items
  for select using (
    exists (
      select 1 from partner_orders o
      where o.id = order_items.order_id
        and public.fn_can_view_branch(o.branch_id)
    )
  );

-- TULIS (INSERT/UPDATE/DELETE): pesanan harus boleh DIEDIT cabang
-- (fn_can_edit_branch) DAN masih REGISTERED — pesanan yang sudah CANCELLED
-- membeku total (SPEC §42, mengikuti persis mekanisme trg_order_status_flow
-- di 0005: cabang tidak boleh mengubah pesanan CANCELLED). INSERT dibutuhkan
-- untuk DUA jalur: (a) salinan otomatis dari isi Package saat pesanan dibuat
-- — berjalan sebagai pengguna cabang yang BARU SAJA membuat pesanan itu di
-- cabangnya sendiri, jadi fn_can_edit_branch(cabang sendiri) = true secara
-- alami; (b) admin/cabang menambah baris manual sesudahnya.
--
-- LESSONS #25: EXISTS di sini membaca partner_orders (tabel LAIN), BUKAN
-- order_items itu sendiri — jadi INSERT...RETURNING (dipakai salinan
-- otomatis §di atas dan Server Action mana pun yang memakai .select()) aman:
-- SELECT policy (oi_partner_read, juga hanya membaca partner_orders) tidak
-- perlu "menemukan kembali" baris yang baru saja disisipkan di dalam order_items.
drop policy if exists oi_partner_insert on public.order_items;
create policy oi_partner_insert on public.order_items
  for insert with check (
    exists (
      select 1 from partner_orders o
      where o.id = order_items.order_id
        and public.fn_can_edit_branch(o.branch_id)
        and o.status = 'REGISTERED'
    )
  );

drop policy if exists oi_partner_update on public.order_items;
create policy oi_partner_update on public.order_items
  for update using (
    exists (
      select 1 from partner_orders o
      where o.id = order_items.order_id
        and public.fn_can_edit_branch(o.branch_id)
        and o.status = 'REGISTERED'
    )
  ) with check (
    exists (
      select 1 from partner_orders o
      where o.id = order_items.order_id
        and public.fn_can_edit_branch(o.branch_id)
        and o.status = 'REGISTERED'
    )
  );

-- DELETE dibuka untuk cabang: menghapus SATU baris dari pesanan yang masih
-- aktif adalah bentuk Edit pesanan yang wajar (SPEC §36 turunan) — bukan
-- membatalkan pesanan itu sendiri (yang tetap satu-satunya jalan resmi lewat
-- status CANCELLED, SPEC §41–43, tidak berubah oleh berkas ini).
drop policy if exists oi_partner_delete on public.order_items;
create policy oi_partner_delete on public.order_items
  for delete using (
    exists (
      select 1 from partner_orders o
      where o.id = order_items.order_id
        and public.fn_can_edit_branch(o.branch_id)
        and o.status = 'REGISTERED'
    )
  );

-- ── 9. Permukaan EXECUTE (LESSONS #26) ──────────────────────

-- Kedua fungsi trigger baru BUKAN untuk dipanggil siapa pun secara langsung
-- (hanya lewat trigger) — dicabut dari public/anon/authenticated, pola sama
-- dengan fn_guard_order_arrival (0009 §7a) dan penjaga invoice (0011).
-- Mencabut EXECUTE TIDAK menghentikan trigger-nya (hak diperiksa saat CREATE
-- TRIGGER, bukan saat baris berubah) — ini pertahanan berlapis, bukan syarat
-- fungsional.
do $$
begin
  execute 'revoke all on function public.fn_guard_order_item_immutable_cols() from public';
  execute 'revoke all on function public.fn_guard_order_item_price_cols() from public';
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.fn_guard_order_item_immutable_cols() from anon';
    execute 'revoke all on function public.fn_guard_order_item_price_cols() from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.fn_guard_order_item_immutable_cols() from authenticated';
    execute 'revoke all on function public.fn_guard_order_item_price_cols() from authenticated';
  end if;
end;
$$;

-- ── 10. Verifikasi (hasilnya di-copy balik ke Claude) ───────
-- Harapan:
--   POLICY_NEW_COLS               2   ← can_view_offer + can_edit_offer ada
--   POLICY_NEW_COLS_DEFAULT_FALSE 2   ← WAJIB 2: keduanya DEFAULT false (fail-closed)
--   OFFER_NEW_COLS                2   ← dp_amount + payment_condition ada
--   OFFER_DP_CHECK                1   ← check (dp_amount >= 0) terpasang
--   OFFER_DP_LE_AMOUNT_CHECK      1   ← check (dp_amount <= amount) terpasang
--   OFFER_POLICIES                4   ← ⚠ BERUBAH dari "1" milik 0013 (lihat §6
--                                        di bawah) — oso_admin_all + oso_partner_read
--                                        + oso_partner_insert + oso_partner_update
--   OFFER_NONADMIN_POLICIES       3   ← ⚠ BERUBAH dari "WAJIB 0" milik 0013 —
--                                        INI DISENGAJA, bukan regresi (§6)
--   OFFER_TRIGGERS                3   ← TIDAK berubah dari 0013 (audit, touch,
--                                        set_created_by) — tidak ada guard trigger
--                                        baru di tabel ini, gerbangnya murni RLS
--   ORDER_SHIPPING_COLUMN         1   ← partner_orders.shipping_address ada
--   ORDER_SHIPPING_NOT_FROZEN     1   ← WAJIB 1: TIDAK masuk daftar beku 0005
--   ORDER_ITEM_TABLE              1
--   ORDER_ITEM_QTY_CHECK          1   ← check (quantity > 0) terpasang
--   ORDER_ITEM_FK_ORDER_RESTRICT  1   ← WAJIB 1: FK ke partner_orders ON DELETE RESTRICT
--   ORDER_ITEM_FK_ORDER_NOT_CASCADE 0 ← WAJIB 0
--   ORDER_ITEM_FK_PRODUCT_RESTRICT   1 ← WAJIB 1: FK ke sanci_products ON DELETE RESTRICT
--   ORDER_ITEM_FK_PRODUCT_NOT_CASCADE 0 ← WAJIB 0
--   ORDER_ITEM_INDEXES            2   ← idx_order_items_order + _product
--   ORDER_ITEM_RLS                1
--   ORDER_ITEM_POLICIES           5   ← admin_all + partner_read/insert/update/delete
--   ORDER_ITEM_PARTNER_WRITE_POLICIES 3 ← insert+update+delete untuk cabang —
--                                          INI DISENGAJA berlawanan arah dari
--                                          partner_package_items (0012, wajib 0):
--                                          isi PESANAN memang boleh ditulis cabang,
--                                          isi PAKET (katalog) tidak.
--   ORDER_ITEM_TRIGGERS           5   ← audit, touch, set_created_by,
--                                        immutable_cols, price_guard
--   ITEM_PRICE_GUARD_EXEC_PUBLIC  0   ← WAJIB 0 (LESSONS #26)
--   ITEM_IMMUTABLE_GUARD_EXEC_PUBLIC 0 ← WAJIB 0 (LESSONS #26)
--   AUDIT_ORDER_ITEM              1   ← fn_audit_row mengenal awalan ORDER_ITEM
--   AUDIT_ITEM_OFFER_NOTE_LOOKUP  1   ← dan mencari partner/branch untuk ketiga
--                                        tabel (notes+offers+items) lewat satu blok
--   AUDIT_KEEP_0013_OFFER         1   ← awalan ORDER_OFFER milik 0013 masih utuh
--   AUDIT_KEEP_0012_PKG_ITEM      1   ← awalan PACKAGE_ITEM milik 0012 masih utuh
--   AUDIT_KEEP_0012_PKG_LOOKUP    1   ← pencarian partner lewat paket induk milik 0012 utuh
--   AUDIT_KEEP_0010_PRODUCT       1   ← awalan PRODUCT milik 0010 masih utuh
--   AUDIT_KEEP_0010_CATALOG       1   ← awalan CATALOG_ACCESS milik 0010 masih utuh
--   AUDIT_KEEP_0009_ARRIVED       1   ← ORDER_CUSTOMER_ARRIVED milik 0009 masih utuh
--   AUDIT_KEEP_0009_NOTE          1   ← ORDER_INTERNAL_NOTE milik 0009 masih utuh
--   AUDIT_KEEP_0008_PKG           1   ← awalan PACKAGE milik 0008 masih utuh
--   AUDIT_KEEP_0008_PHONE         1   ← CUSTOMER_PHONE_CHANGED milik 0008 masih utuh
--   AUDIT_KEEP_0008_ATTR          1   ← ORDER_ATTRIBUTION_CORRECTED milik 0008 masih utuh
--   AUDIT_KEEP_0005               1   ← ORDER_CANCELLED milik 0005 masih utuh
--   AUDIT_KEEP_0004               1   ← pemetaan created_via_* milik 0004 masih utuh
--   REFS_CHECK_CUSTOMER           1   ← WAJIB 1: lubang P2 milik 0011 masih tertutup
--
-- Dua belas angka AUDIT_KEEP_*/AUDIT_ITEM_OFFER_NOTE_LOOKUP dan
-- REFS_CHECK_CUSTOMER adalah REGRESI, bukan fitur baru: berkas ini
-- mendefinisikan ulang fn_audit_row secara utuh. Kalau salah satunya 0,
-- JANGAN teruskan — berarti versi di §6 bukan salinan lengkap versi 0013.
--
-- ⚠️ TENTANG OFFER_POLICIES / OFFER_NONADMIN_POLICIES BERUBAH DARI 0013:
-- Komentar verifikasi 0013 §5 menuliskan "OFFER_POLICIES 1" dan
-- "OFFER_NONADMIN_POLICIES WAJIB 0" sebagai BUKTI bahwa cabang nol akses ke
-- Penawaran SANCI. Berkas 0013 SENDIRI TIDAK BOLEH DIEDIT (migration yang
-- sudah/akan dijalankan tidak diubah retroaktif) — jadi komentar itu tetap
-- berbunyi begitu di berkas 0013 SELAMANYA. Itu bukan salah cetak: itu foto
-- keadaan PADA SAAT 0013 adalah berkas terakhir dalam rantai. Begitu 0014
-- menjadi berkas terakhir, keadaannya BERUBAH SECARA SADAR — persis seperti
-- OFFER_TABLE/OFFER_PK_ORDER_ID dkk di 0013 sendiri tidak berubah (0014 sama
-- sekali tidak menyentuh strukturnya), tapi permukaan RLS-nya SEKARANG punya
-- dua flag baru yang membuka akses TERKONTROL, bukan lagi nol mutlak.
-- Siapa pun yang mencocokkan angka 0013 pada database yang SUDAH punya 0014
-- HARUS memakai angka BARU ini (4 / 3), bukan angka lama (1 / 0) — dan kalau
-- angkanya balik ke 1/0 padahal 0014 sudah pernah dijalankan, itu tanda
-- 0013 baru saja dijalankan ULANG di atas 0014 dan menghapus policy §3 di
-- atas (CREATE OR REPLACE POLICY tidak ada di Postgres, tapi DROP POLICY IF
-- EXISTS di 0013 tidak menyentuh nama oso_partner_read/_insert/_update milik
-- 0014, jadi risiko sebenarnya adalah URUTAN — 0014 WAJIB dijalankan
-- SETELAH 0013, bukan sebelumnya; ATURAN BESI tetap "jalankan berurutan
-- sampai berkas terakhir").
--
-- Angka blok verifikasi berkas LAMA setelah 0014 — SUDAH DIUKUR di Postgres
-- 16 lokal (lihat FEATURES.md untuk narasi lengkap):
--   0001: RLS_ENABLED 18 → **19** (+order_items) ·
--         POLICIES 38 → **46** (+2 kolom baru di partner_access_policies TIDAK
--         menambah policy — hanya kolom; +3 oso_partner_* baru di
--         order_sanci_offers; +5 policy baru di order_items — 38 + 3 + 5 = 46,
--         diukur langsung, bukan dihitung di kepala) ·
--         TRIGGERS: order_items berawalan `order_`, sama seperti
--         order_internal_notes/order_sanci_offers → TIDAK ikut terhitung
--         blok 0001 (yang hanya menghitung tabel berawalan `partner%`) →
--         TRIGGERS **tetap 27**.
--   0004/0005/0008/0009/0010/0011/0012: TIDAK berubah — 0014 tidak
--         menyentuh struktur tabel mana pun yang dihitung blok-blok itu.
--   0013: strukturnya TIDAK berubah (OFFER_TABLE, OFFER_PK_ORDER_ID,
--         OFFER_AMOUNT_TYPE, dst SEMUA tetap) — HANYA OFFER_POLICIES
--         (1→4) dan OFFER_NONADMIN_POLICIES (0→3) yang berubah, dan
--         keduanya BUKAN kerusakan (lihat penjelasan panjang di atas).
-- Kalau ada angka lain yang tidak cocok, JANGAN anggap beres: laporkan apa
-- adanya (LESSONS #7 & #16).

select 'POLICY_NEW_COLS' as check_type, count(*)::text as result
from information_schema.columns
where table_schema = 'public' and table_name = 'partner_access_policies'
  and column_name in ('can_view_offer','can_edit_offer')
union all
select 'POLICY_NEW_COLS_DEFAULT_FALSE', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'partner_access_policies'
  and column_name in ('can_view_offer','can_edit_offer')
  and column_default = 'false'
union all
select 'OFFER_NEW_COLS', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'order_sanci_offers'
  and column_name in ('dp_amount','payment_condition')
union all
select 'OFFER_DP_CHECK', count(*)::text
from pg_constraint
where conrelid = 'public.order_sanci_offers'::regclass and contype = 'c'
  and conname = 'order_sanci_offers_dp_amount_check'
union all
select 'OFFER_DP_LE_AMOUNT_CHECK', count(*)::text
from pg_constraint
where conrelid = 'public.order_sanci_offers'::regclass and contype = 'c'
  and conname = 'order_sanci_offers_dp_le_amount_check'
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
select 'ORDER_SHIPPING_COLUMN', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'partner_orders' and column_name = 'shipping_address'
union all
select 'ORDER_SHIPPING_NOT_FROZEN', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_guard_order_immutable_cols'
  and p.prosrc not like '%shipping_address%'
union all
select 'ORDER_ITEM_TABLE', count(*)::text
from information_schema.tables
where table_schema = 'public' and table_name = 'order_items'
union all
select 'ORDER_ITEM_QTY_CHECK', count(*)::text
from pg_constraint
where conrelid = 'public.order_items'::regclass and contype = 'c'
  and pg_get_constraintdef(oid) like '%quantity%' and pg_get_constraintdef(oid) like '%> 0%'
union all
select 'ORDER_ITEM_FK_ORDER_RESTRICT', count(*)::text
from pg_constraint
where conrelid = 'public.order_items'::regclass and contype = 'f'
  and confrelid = 'public.partner_orders'::regclass and confdeltype = 'r'
union all
select 'ORDER_ITEM_FK_ORDER_NOT_CASCADE', count(*)::text
from pg_constraint
where conrelid = 'public.order_items'::regclass and contype = 'f'
  and confrelid = 'public.partner_orders'::regclass and confdeltype = 'c'
union all
select 'ORDER_ITEM_FK_PRODUCT_RESTRICT', count(*)::text
from pg_constraint
where conrelid = 'public.order_items'::regclass and contype = 'f'
  and confrelid = 'public.sanci_products'::regclass and confdeltype = 'r'
union all
select 'ORDER_ITEM_FK_PRODUCT_NOT_CASCADE', count(*)::text
from pg_constraint
where conrelid = 'public.order_items'::regclass and contype = 'f'
  and confrelid = 'public.sanci_products'::regclass and confdeltype = 'c'
union all
select 'ORDER_ITEM_INDEXES', count(*)::text
from pg_indexes
where schemaname = 'public' and tablename = 'order_items'
  and indexname in ('idx_order_items_order','idx_order_items_product')
union all
select 'ORDER_ITEM_RLS', count(*)::text
from pg_tables where schemaname = 'public' and tablename = 'order_items' and rowsecurity
union all
select 'ORDER_ITEM_POLICIES', count(*)::text
from pg_policies where schemaname = 'public' and tablename = 'order_items'
union all
select 'ORDER_ITEM_PARTNER_WRITE_POLICIES', count(*)::text
from pg_policies
where schemaname = 'public' and tablename = 'order_items'
  and cmd in ('INSERT','UPDATE','DELETE')
  and policyname like 'oi_partner_%'
union all
select 'ORDER_ITEM_TRIGGERS', count(*)::text
from pg_trigger tg join pg_class cl on cl.oid = tg.tgrelid
join pg_namespace ns on ns.oid = cl.relnamespace
where not tg.tgisinternal and ns.nspname = 'public' and cl.relname = 'order_items'
union all
select 'ITEM_PRICE_GUARD_EXEC_PUBLIC',
       (has_function_privilege('public', 'public.fn_guard_order_item_price_cols()', 'execute'))::int::text
union all
select 'ITEM_IMMUTABLE_GUARD_EXEC_PUBLIC',
       (has_function_privilege('public', 'public.fn_guard_order_item_immutable_cols()', 'execute'))::int::text
union all
select 'AUDIT_ORDER_ITEM', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%''ORDER_ITEM''%'
union all
select 'AUDIT_ITEM_OFFER_NOTE_LOOKUP', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row'
  and p.prosrc like '%''order_internal_notes'',''order_sanci_offers'',''order_items''%'
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
