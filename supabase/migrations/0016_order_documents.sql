-- ============================================================
-- SANCI Partner Hub — Phase 2 irisan kesepuluh
-- Migration 0016: dokumen penjualan per-pesanan — Sales Order (SO), Surat
--                  Jalan (DO), Invoice — dibangkitkan di dalam sistem,
--                  menggantikan alur salin-tab-Google-Sheet manual
--                  (idempotent — aman dijalankan ulang)
-- Jalankan di: Supabase Studio → SQL Editor → paste seluruh file → Run
--
-- PRASYARAT: 0001 → 0003 → 0004 → 0005 → 0006 → 0007 → 0008 → 0009 → 0010 →
-- 0011 → 0012 → 0013 → 0014 → 0015 sudah dijalankan, DALAM URUTAN ITU. Blok
-- pengaman di bawah berhenti dengan pesan jelas kalau belum. Setelah berkas
-- ini, rantai penuhnya menjadi 0001 → 0003 → … → 0014 → 0015 → 0016 (lihat
-- migrations/README.md — ATURAN BESI).
--
-- ============================================================
-- KOREKSI DESAIN OWNER — BUKAN TIGA TAMPILAN DARI SATU PESANAN
-- ============================================================
--
-- Desain naif (satu dokumen "cetak SO/DO/Invoice dari data order apa
-- adanya") DITOLAK owner secara eksplisit. Kata-kata asli: "每個的日期不同,
-- 內容跟件數在so,do 不同,invoice 也不同" — setiap dokumen punya TANGGAL
-- SENDIRI, dan DO/Invoice masing-masing punya PILIHAN ITEM dan KUANTITAS
-- SENDIRI (pengiriman sebagian dan penagihan sebagian itu nyata: kirim 3
-- unit hari ini lewat satu DO, 2 unit lagi minggu depan lewat DO kedua).
--
-- Konsekuensi desain: dokumen BUKAN view read-only dari partner_orders —
-- dokumen adalah ENTITAS SENDIRI dengan baris isinya sendiri
-- (order_document_items), yang MENUNJUK ke order_items (bukan menyalinnya)
-- supaya nama/kode produk tetap satu sumber kebenaran (order_items sendiri
-- sudah membekukan snapshot nama/kode dari Package — 0014), tapi kuantitas
-- SETIAP dokumen independen dan dijaga TIDAK BOLEH melebihi kuantitas
-- order_items-nya kalau dijumlahkan lintas SEMUA dokumen bertipe sama pada
-- pesanan yang sama (guard over-shipment, §5 di bawah).
-- ============================================================
--
-- ============================================================
-- APA YANG DIBUKA IRISAN INI (dan hanya ini)
-- ============================================================
--   order_documents      → tabel BARU. Satu baris = satu dokumen tercetak
--                          (SO/DO/INVOICE) untuk satu pesanan, dengan
--                          doc_number/doc_date/notes SENDIRI. Penomoran
--                          dihitung di SERVER ACTION (bukan trigger DB —
--                          lihat §3), tidak pernah dipercaya dari client.
--   order_document_items → tabel BARU. Baris isi SATU dokumen, menunjuk ke
--                          order_items + kuantitas KHUSUS dokumen ini (boleh
--                          lebih kecil dari kuantitas order_items-nya —
--                          pengiriman/penagihan sebagian).
--   RLS kedua tabel       → admin-only PENUH (`for all using
--                          fn_is_admin() with check fn_is_admin()`), SATU
--                          policy per tabel, NOL policy non-admin — ini
--                          dokumen penjualan SANCI sendiri. Visibilitas
--                          cabang adalah kemungkinan irisan LANJUTAN — kalau
--                          suatu hari dibuka, yang ditambah adalah policy
--                          SELECT baru (pola sama dengan 0013 §4 → 0014 §3),
--                          BUKAN perubahan skema.
--   RPC fn_create_order_document / fn_replace_order_document_items → admin-
--                          only, membungkus insert/replace dua-tabel dalam
--                          SATU transaksi supaya guard over-shipment (§5)
--                          dan "dokumen tanpa isi karena separuh gagal"
--                          tidak pernah terjadi bersamaan.
-- ============================================================

-- ── 0. Pengaman prasyarat ───────────────────────────────────

do $$
begin
  if to_regclass('public.order_items') is null then
    raise exception
      'Migration 0014_permissions_items_shipping.sql belum dijalankan di database ini. Jalankan 0001 → … → 0015 dulu, baru 0016.';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'order_sanci_offers'
      and column_name = 'final_amount') then
    raise exception
      'Migration 0015_order_discount_chain.sql belum dijalankan di database ini. Jalankan 0001 → … → 0015 dulu, baru 0016.';
  end if;

  if to_regprocedure('public.fn_audit_row()') is null
     or to_regprocedure('public.fn_touch_updated_at()') is null
     or to_regprocedure('public.fn_set_created_by()') is null
     or to_regprocedure('public.fn_is_admin()') is null then
    raise exception
      'Fungsi dasar (fn_audit_row / fn_touch_updated_at / fn_set_created_by / fn_is_admin) belum lengkap. Jalankan 0001 → … → 0015 dulu, baru 0016.';
  end if;
end;
$$;

-- ── 1. Tabel order_documents ─────────────────────────────────

-- doc_number: dihitung SERVER ACTION (web/app/admin/actions-documents.ts),
-- BUKAN trigger DB — pola prefix+suffix ("SO-<nomor order>", lalu "-2",
-- "-3", …) butuh mengetahui berapa dokumen bertipe sama yang SUDAH ADA
-- untuk order ini, dan pemeriksaan "sudah berapa" + "insert" harus bisa
-- di-RETRY dari luar transaksi tunggal kalau terjadi rebutan bersamaan
-- (23505 pada doc_number = dua admin membuat dokumen tipe sama di detik
-- yang sama → retry dengan suffix berikutnya, BEDA dari 23505 pada
-- client_request_id yang berarti "percobaan sebelumnya sudah mendarat",
-- LESSONS #21/#27). `unique` di kolom ini adalah SATU-SATUNYA penjaga
-- sungguhan — angka yang dihitung di server hanyalah PERKIRAAN yang bisa
-- salah kalau ada rebutan, constraint inilah yang tidak pernah salah.
--
-- order_id ON DELETE RESTRICT (LESSONS #4, pola sama dengan order_items/
-- order_sanci_offers 0014/0013): pesanan yang sudah punya dokumen tidak
-- boleh lenyap membawa riwayat dokumennya — pesanan TIDAK PERNAH dihapus
-- keras di sistem ini (status CANCELLED, bukan DELETE), jadi ini sebagian
-- besar teoretis, tapi semantiknya benar.
create table if not exists public.order_documents (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references public.partner_orders(id) on delete restrict,
  doc_type           text not null check (doc_type in ('SO','DO','INVOICE')),
  doc_number         text not null unique,
  doc_date           date not null,
  notes              text,
  client_request_id  text unique,
  created_by         uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_order_documents_order
  on public.order_documents (order_id);
create index if not exists idx_order_documents_type
  on public.order_documents (order_id, doc_type);

drop trigger if exists trg_audit on public.order_documents;
create trigger trg_audit after insert or update or delete on public.order_documents
  for each row execute function public.fn_audit_row();

drop trigger if exists trg_touch on public.order_documents;
create trigger trg_touch before update on public.order_documents
  for each row execute function public.fn_touch_updated_at();

drop trigger if exists trg_set_created_by on public.order_documents;
create trigger trg_set_created_by before insert on public.order_documents
  for each row execute function public.fn_set_created_by();

-- ── 2. Tabel order_document_items ────────────────────────────

-- document_id ON DELETE CASCADE: baris isi adalah BAGIAN DARI dokumennya —
-- menghapus dokumen (§8, admin-only, "mistakes happen") otomatis membersihkan
-- isinya, dan audit tetap mencatat KEDUA level (trigger AFTER DELETE tetap
-- menyala untuk baris yang ikut ter-cascade — diverifikasi perilaku ini di
-- test-harness, bukan diasumsikan).
--
-- order_item_id ON DELETE RESTRICT (LESSONS #4, pola sama dengan
-- partner_package_items 0012 / order_items→sanci_products 0014): baris
-- order_items yang sudah pernah dipakai di sebuah dokumen tidak boleh
-- lenyap membawa riwayat dokumen itu diam-diam.
--
-- unique (document_id, order_item_id): satu item pesanan paling banyak SATU
-- baris per dokumen — menambah kuantitas berarti UBAH baris itu, bukan
-- menambah baris kedua (pola sama dengan partner_package_items 0012).
create table if not exists public.order_document_items (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references public.order_documents(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  quantity      integer not null check (quantity > 0),
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (document_id, order_item_id)
);

create index if not exists idx_order_document_items_document
  on public.order_document_items (document_id);
create index if not exists idx_order_document_items_order_item
  on public.order_document_items (order_item_id);

drop trigger if exists trg_audit on public.order_document_items;
create trigger trg_audit after insert or update or delete on public.order_document_items
  for each row execute function public.fn_audit_row();

drop trigger if exists trg_touch on public.order_document_items;
create trigger trg_touch before update on public.order_document_items
  for each row execute function public.fn_touch_updated_at();

drop trigger if exists trg_set_created_by on public.order_document_items;
create trigger trg_set_created_by before insert on public.order_document_items
  for each row execute function public.fn_set_created_by();

-- ── 3. Guard: batas pengiriman/penagihan (over-shipment) ────

-- SO TIDAK diperiksa (skip total) — SO adalah snapshot SELURUH pesanan
-- (server action men-default-kan itemnya ke SEMUA order_items pada
-- kuantitas penuh kalau admin tidak memilih apa pun, §APA YANG DIBUKA di
-- atas), jadi tidak ada "sisa" yang bermakna untuk SO.
--
-- DO dan INVOICE diperiksa TERPISAH dan INDEPENDEN — menjumlahkan HANYA
-- baris bertipe SAMA dengan dokumen yang sedang ditulis (LESSONS 0009/0010
-- gaya "pesan jelas per pelanggaran"): total kuantitas SEMUA dokumen
-- bertipe DO pada order_item yang sama tidak boleh melebihi kuantitas
-- order_items-nya; aturan yang SAMA berlaku independen untuk INVOICE (3
-- unit boleh dikirim via DO dan SEMUA 3 unit itu jugaboleh ditagih penuh
-- lewat Invoice — mengirim tidak mengunci penagihan atau sebaliknya).
--
-- BEFORE INSERT OR UPDATE (bukan constraint trigger AFTER+deferrable):
-- setiap baris ditulis lewat RPC (§7) yang membungkus SEMUA baris satu
-- dokumen dalam SATU transaksi — dalam satu transaksi, pernyataan SQL
-- berikutnya SUDAH melihat efek pernyataan sebelumnya (baca-setelah-tulis
-- di sesi yang sama), jadi BEFORE + SUM query per-baris sudah cukup
-- benar untuk kasus "hapus semua baris lama, tulis ulang baris baru" (§7
-- fn_replace_order_document_items) TANPA perlu deferrable — tidak ada
-- kebutuhan "tunda pemeriksaan sampai akhir transaksi" karena urutan
-- delete-lalu-insert di dalam RPC yang sama sudah menjamin urutan yang
-- benar. `odi.id is distinct from new.id` mengecualikan BARIS INI SENDIRI
-- dari jumlah lama — aman dipakai untuk INSERT maupun UPDATE karena
-- Postgres MENGISI default kolom (termasuk gen_random_uuid() untuk id)
-- SEBELUM trigger BEFORE dijalankan, jadi new.id sudah terisi di kedua
-- kasus.
--
-- SECURITY DEFINER (LESSONS #15/#26): membaca order_documents + order_items
-- + order_document_items, tabel ber-RLS admin-only — tanpa security
-- definer, baris yang "tidak terlihat" lewat RLS pemanggil akan membuat
-- jumlah yang dihitung salah arah diam-diam. Dalam praktiknya pemanggilnya
-- SELALU admin (satu-satunya yang lolos RLS kedua tabel ini), jadi risiko
-- ini murni teoretis hari ini — tapi menulisnya sebagai definer + revoke
-- EXECUTE (§9) adalah pertahanan berlapis yang tidak bergantung pada itu
-- tetap benar selamanya.
create or replace function public.fn_guard_document_item_overship() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_doc_type   text;
  v_item_qty   integer;
  v_item_name  text;
  v_used_sum   numeric;
  v_remaining  numeric;
begin
  select doc_type into v_doc_type
  from order_documents where id = new.document_id;

  if v_doc_type is null then
    -- Seharusnya tidak mungkin (FK document_id sudah menjamin baris ada),
    -- tapi kalau entah bagaimana terjadi, jangan diam-diam meloloskan.
    raise exception 'Dokumen % tidak ditemukan.', new.document_id;
  end if;

  if v_doc_type = 'SO' then
    return new;
  end if;

  select quantity, name_snapshot into v_item_qty, v_item_name
  from order_items where id = new.order_item_id;

  if v_item_qty is null then
    raise exception 'Item pesanan % tidak ditemukan.', new.order_item_id;
  end if;

  select coalesce(sum(odi.quantity), 0) into v_used_sum
  from order_document_items odi
  join order_documents od on od.id = odi.document_id
  where od.doc_type = v_doc_type
    and odi.order_item_id = new.order_item_id
    and odi.id is distinct from new.id;

  v_remaining := v_item_qty - v_used_sum;

  if new.quantity > v_remaining then
    raise exception
      'Kuantitas % untuk "%" melebihi sisa yang boleh di%: sisa % dari total %.',
      new.quantity, v_item_name,
      case when v_doc_type = 'DO' then 'kirim' else 'tagih' end,
      greatest(v_remaining, 0), v_item_qty;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_document_item_overship on public.order_document_items;
create trigger trg_document_item_overship before insert or update on public.order_document_items
  for each row execute function public.fn_guard_document_item_overship();

-- ── 4. RLS: admin-only penuh, nol policy non-admin ──────────

-- SATU policy `for all` per tabel — mistakes happen, admin boleh hapus
-- dokumen yang salah (§8, cascade membersihkan isinya, audit mencatatnya).
-- NOL policy cabang: dokumen penjualan (harga per baris via order_items
-- sudah ada, tapi nomor SO/DO/Invoice dan kapan masing-masing dibuat adalah
-- keputusan administratif SANCI). Kalau suatu hari cabang perlu MELIHAT
-- dokumen pesanannya sendiri (mis. supaya bisa cetak ulang), itu SATU
-- policy SELECT baru di migration berikutnya — pola sama persis dengan
-- 0013 §4 ("kalau suatu hari Jenzo memutuskan...") yang benar-benar
-- ditepati oleh 0014 §3. Desain di sini SENGAJA meniru pola itu.
alter table public.order_documents enable row level security;
drop policy if exists od_admin_all on public.order_documents;
create policy od_admin_all on public.order_documents
  for all using (public.fn_is_admin()) with check (public.fn_is_admin());

alter table public.order_document_items enable row level security;
drop policy if exists odi_admin_all on public.order_document_items;
create policy odi_admin_all on public.order_document_items
  for all using (public.fn_is_admin()) with check (public.fn_is_admin());

-- ── 5. Audit: awalan ORDER_DOCUMENT / ORDER_DOCUMENT_ITEM ───

-- Definisi ulang UTUH fn_audit_row (bukan tambalan) — ATURAN BESI
-- migrations/README.md. Versi yang disalin adalah versi 0014, berkas
-- TERAKHIR yang mendefinisikan ulang fungsi ini (0015 SENGAJA tidak
-- menyentuhnya — dikonfirmasi lewat AUDIT_KEEP_0014_ITEM di blok
-- verifikasi 0015). SELURUH perilaku
-- 0004+0005+0008+0009+0010+0012+0013+0014 dipertahankan kata demi kata.
--
-- Yang bertambah hanya DUA hal:
--   1. awalan 'ORDER_DOCUMENT' untuk order_documents dan
--      'ORDER_DOCUMENT_ITEM' untuk order_document_items. Kedua tabel TIDAK
--      punya kolom `status`, jadi *_CREATED/_UPDATED/_DELETED muncul dengan
--      sendirinya lewat cabang generik yang sudah ada.
--   2. order_documents IKUT ke dalam blok pencarian partner/branch yang
--      sama dipakai order_internal_notes (0009)/order_sanci_offers (0013)/
--      order_items (0014) — order_documents punya kolom `order_id`
--      langsung, sama seperti ketiganya. order_document_items TIDAK punya
--      order_id langsung (hanya document_id) — butuh blok TERPISAH dengan
--      DUA HOP (document_id → order_documents.order_id → partner_orders),
--      dimodelkan dari blok partner_package_items (0012) yang juga mencari
--      lewat tabel induk satu tingkat, tapi di sini isinya DUA kolom
--      sekaligus (partner_id DAN branch_id), pola yang sama dengan
--      order_items (0014) — bedanya order_items cukup SATU hop karena
--      order_id ada langsung di baris itu, order_document_items perlu DUA
--      hop karena order_id-nya ada di tabel ORANGTUA (order_documents),
--      bukan di baris order_document_items itu sendiri.
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
    when 'order_documents' then 'ORDER_DOCUMENT'
    when 'order_document_items' then 'ORDER_DOCUMENT_ITEM'
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

  -- order_internal_notes, order_sanci_offers, order_items DAN order_documents
  -- semuanya punya kolom order_id langsung — satu blok SATU HOP melayani
  -- keempatnya. Aman dibaca di sini karena fungsi ini security definer (RLS
  -- partner_orders dilewati) — audit_logs hanya bisa dibaca admin
  -- (al_admin_read, 0001), satu-satunya pihak yang boleh melihat keempat
  -- tabel itu juga.
  if tg_table_name in ('order_internal_notes','order_sanci_offers','order_items','order_documents') then
    select o.partner_id, o.branch_id into v_partner, v_branch
    from partner_orders o
    where o.id = nullif(coalesce(rec->>'order_id', old_rec->>'order_id'), '')::uuid;
  end if;

  if tg_table_name = 'partner_package_items' then
    select pp.partner_id into v_partner
    from partner_packages pp
    where pp.id = nullif(coalesce(rec->>'package_id', old_rec->>'package_id'), '')::uuid;
  end if;

  -- order_document_items TIDAK punya order_id langsung (hanya document_id)
  -- — blok TERPISAH dengan DUA HOP: document_id → order_documents.order_id
  -- → partner_orders. Dimodelkan dari blok partner_package_items di atas
  -- (satu hop lewat tabel induk), diperluas satu hop lagi karena
  -- order_documents sendiri bukan sumber partner/branch, hanya perantara
  -- menuju partner_orders. Mengisi KEDUA kolom (partner_id dan branch_id)
  -- sekaligus — pola sama dengan blok order_items/order_sanci_offers di
  -- atas, bukan pola partner_package_items (yang hanya mengisi partner_id
  -- karena Package memang tidak melekat ke satu cabang).
  if tg_table_name = 'order_document_items' then
    select o.partner_id, o.branch_id into v_partner, v_branch
    from order_documents doc
    join partner_orders o on o.id = doc.order_id
    where doc.id = nullif(coalesce(rec->>'document_id', old_rec->>'document_id'), '')::uuid;
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

-- ── 6. Permukaan EXECUTE guard trigger (LESSONS #26) ────────

do $$
begin
  execute 'revoke all on function public.fn_guard_document_item_overship() from public';
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.fn_guard_document_item_overship() from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.fn_guard_document_item_overship() from authenticated';
  end if;
end;
$$;

-- ── 7. RPC: buat dokumen (header + baris) dalam satu transaksi ──

-- Penomoran (prefix+suffix) DIHITUNG DI SERVER ACTION (bukan di sini) — RPC
-- ini menerima doc_number yang SUDAH DIHITUNG dan hanya bertanggung jawab
-- atas ATOMISITAS: baris header + SEMUA baris isi berhasil BERSAMA atau
-- GAGAL BERSAMA (fungsi plpgsql sepenuhnya transaksional — exception apa
-- pun, termasuk dari trg_document_item_overship §3, membatalkan SELURUH
-- panggilan termasuk insert header yang sudah sempat terjadi). Server
-- Action men-tangkap 23505 pada doc_number secara terpisah dan meng-ULANG
-- panggilan ini dengan suffix berikutnya (§ATURAN PENOMORAN di kepala
-- berkas) — RPC ini sendiri TIDAK melakukan retry.
--
-- p_items: jsonb array [{"order_item_id": "...", "quantity": N}, …] — bentuk
-- yang sama dipilih 0015 untuk discount_pcts, alasan yang sama: gampang
-- dikirim lewat REST/JS tanpa konversi tipe khusus.
--
-- SECURITY DEFINER + fn_is_admin() di baris pertama (pola sama persis
-- dengan fn_correct_order_attribution, 0008 §3): RLS kedua tabel tetap
-- admin-only sebagai lapis kedua, tapi pemeriksaan eksplisit di sini
-- memberi PESAN JELAS ("Hanya SANCI Admin...") alih-alih error RLS mentah.
create or replace function public.fn_create_order_document(
  p_order_id          uuid,
  p_doc_type          text,
  p_doc_number        text,
  p_doc_date          date,
  p_notes             text,
  p_items             jsonb,
  p_client_request_id text
) returns table(id uuid, doc_number text)
language plpgsql security definer set search_path = public as $$
declare
  v_doc_id uuid;
  v_item   jsonb;
begin
  if not public.fn_is_admin() then
    raise exception 'Hanya SANCI Admin yang boleh membuat dokumen pesanan.'
      using errcode = '42501';
  end if;

  if p_doc_type not in ('SO','DO','INVOICE') then
    raise exception 'Jenis dokumen tidak dikenal: %', p_doc_type;
  end if;

  insert into order_documents (order_id, doc_type, doc_number, doc_date, notes, client_request_id)
  values (p_order_id, p_doc_type, p_doc_number, p_doc_date, nullif(btrim(coalesce(p_notes, '')), ''), p_client_request_id)
  returning order_documents.id into v_doc_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    insert into order_document_items (document_id, order_item_id, quantity)
    values (v_doc_id, (v_item->>'order_item_id')::uuid, (v_item->>'quantity')::integer);
  end loop;

  return query select v_doc_id, p_doc_number;
end;
$$;

-- ── 8. RPC: ganti seluruh isi dokumen (edit) dalam satu transaksi ──

-- "Replace-lines": hapus SEMUA baris lama, tulis baris baru dari p_items,
-- satu transaksi — trg_document_item_overship (§3) menghitung ulang dari
-- keadaan SETELAH penghapusan, jadi menaikkan kuantitas satu baris yang
-- sudah ada bekerja BENAR (bukan diam-diam menjumlahkan baris lama+baru).
-- Header (doc_date/notes) diupdate di RPC yang SAMA supaya "tanggal
-- berhasil diubah tapi baris gagal ditulis ulang" tidak pernah menjadi
-- keadaan yang terlihat pengguna — baik keduanya berhasil, atau keduanya
-- di-rollback.
create or replace function public.fn_replace_order_document_items(
  p_document_id uuid,
  p_doc_date    date,
  p_notes       text,
  p_items       jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_item jsonb;
begin
  if not public.fn_is_admin() then
    raise exception 'Hanya SANCI Admin yang boleh mengubah dokumen pesanan.'
      using errcode = '42501';
  end if;

  update order_documents
     set doc_date = p_doc_date,
         notes = nullif(btrim(coalesce(p_notes, '')), '')
   where id = p_document_id;

  if not found then
    raise exception 'Dokumen % tidak ditemukan.', p_document_id;
  end if;

  delete from order_document_items where document_id = p_document_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    insert into order_document_items (document_id, order_item_id, quantity)
    values (p_document_id, (v_item->>'order_item_id')::uuid, (v_item->>'quantity')::integer);
  end loop;
end;
$$;

-- ── 9. Permukaan EXECUTE kedua RPC (LESSONS #26) ────────────

do $$
begin
  execute 'revoke all on function public.fn_create_order_document(uuid, text, text, date, text, jsonb, text) from public';
  execute 'revoke all on function public.fn_replace_order_document_items(uuid, date, text, jsonb) from public';
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.fn_create_order_document(uuid, text, text, date, text, jsonb, text) from anon';
    execute 'revoke all on function public.fn_replace_order_document_items(uuid, date, text, jsonb) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.fn_create_order_document(uuid, text, text, date, text, jsonb, text) to authenticated';
    execute 'grant execute on function public.fn_replace_order_document_items(uuid, date, text, jsonb) to authenticated';
  end if;
end;
$$;

-- ── 10. Verifikasi (hasilnya di-copy balik ke Claude) ───────
-- Harapan (semua sudah diukur di Postgres 16 lokal — lihat commit report):
--   DOC_TABLE / DOC_ITEM_TABLE            1 / 1
--   DOC_TYPE_CHECK                        1   ← check (doc_type in (...)) terpasang
--   DOC_NUMBER_UNIQUE                     1   ← unique constraint pada doc_number
--   DOC_ITEM_QTY_CHECK                    1   ← check (quantity > 0) terpasang
--   DOC_ITEM_UNIQUE                       1   ← unique (document_id, order_item_id)
--   DOC_FK_ORDER_RESTRICT / _NOT_CASCADE  1 / 0
--   DOC_ITEM_FK_DOCUMENT_CASCADE          1   ← WAJIB 1: baris ikut hilang saat dokumen dihapus
--   DOC_ITEM_FK_DOCUMENT_NOT_RESTRICT     0   ← WAJIB 0: bukan RESTRICT (beda dari order_item_id)
--   DOC_ITEM_FK_ORDER_ITEM_RESTRICT       1
--   DOC_ITEM_FK_ORDER_ITEM_NOT_CASCADE    0
--   DOC_RLS / DOC_ITEM_RLS                1 / 1
--   DOC_POLICIES / DOC_ITEM_POLICIES      1 / 1
--   DOC_NONADMIN_POLICIES                 0   ← WAJIB 0: nol policy cabang
--   DOC_ITEM_NONADMIN_POLICIES            0   ← WAJIB 0: nol policy cabang
--   DOC_TRIGGERS / DOC_ITEM_TRIGGERS      3 / 4  ← item: audit+touch+set_created_by+overship_guard
--   OVERSHIP_GUARD_EXEC_PUBLIC            0   ← WAJIB 0 (LESSONS #26)
--   CREATE_RPC / REPLACE_RPC              1 / 1
--   CREATE_RPC_SECDEF / REPLACE_RPC_SECDEF 1 / 1
--   RPC_EXEC_PUBLIC                       0   ← WAJIB 0
--   RPC_EXEC_ANON                         0   ← WAJIB 0
--   RPC_EXEC_AUTHENTICATED                1   ← WAJIB 1 (pemeriksaan admin di dalam fungsi)
--   AUDIT_ORDER_DOCUMENT                  1   ← fn_audit_row mengenal awalan ORDER_DOCUMENT
--   AUDIT_ORDER_DOCUMENT_ITEM             1   ← dan ORDER_DOCUMENT_ITEM
--   AUDIT_DOC_LOOKUP_1HOP                 1   ← order_documents ikut blok satu-hop
--   AUDIT_DOC_ITEM_LOOKUP_2HOP            1   ← order_document_items dapat blok dua-hop sendiri
--   AUDIT_KEEP_0014_ITEM                  1   ← awalan ORDER_ITEM milik 0014 masih utuh
--   AUDIT_KEEP_0013_OFFER                 1
--   AUDIT_KEEP_0012_PKG_ITEM              1
--   AUDIT_KEEP_0012_PKG_LOOKUP            1
--   AUDIT_KEEP_0010_PRODUCT               1
--   AUDIT_KEEP_0010_CATALOG               1
--   AUDIT_KEEP_0009_ARRIVED               1
--   AUDIT_KEEP_0009_NOTE                  1
--   AUDIT_KEEP_0008_PKG                   1
--   AUDIT_KEEP_0008_PHONE                 1
--   AUDIT_KEEP_0008_ATTR                  1
--   AUDIT_KEEP_0005                       1
--   AUDIT_KEEP_0004                       1
--   REFS_CHECK_CUSTOMER                   1   ← WAJIB 1: lubang P2 milik 0011 masih tertutup
--
-- Empat belas angka AUDIT_KEEP_*/AUDIT_DOC*/REFS_CHECK_CUSTOMER adalah
-- REGRESI, bukan fitur baru: berkas ini mendefinisikan ulang fn_audit_row
-- secara utuh. Kalau salah satunya 0, JANGAN teruskan — berarti versi di
-- §5 bukan salinan lengkap versi 0014.
--
-- Angka blok verifikasi berkas LAMA setelah 0016 — lihat migrations/README.md
-- untuk narasi lengkap dan angka terukur (bukan perkiraan).

select 'DOC_TABLE' as check_type, count(*)::text as result
from information_schema.tables
where table_schema = 'public' and table_name = 'order_documents'
union all
select 'DOC_ITEM_TABLE', count(*)::text
from information_schema.tables
where table_schema = 'public' and table_name = 'order_document_items'
union all
select 'DOC_TYPE_CHECK', count(*)::text
from pg_constraint
where conrelid = 'public.order_documents'::regclass and contype = 'c'
  and pg_get_constraintdef(oid) like '%doc_type%'
union all
select 'DOC_NUMBER_UNIQUE', count(*)::text
from pg_constraint
where conrelid = 'public.order_documents'::regclass and contype = 'u'
  and pg_get_constraintdef(oid) like '%doc_number%'
union all
select 'DOC_ITEM_QTY_CHECK', count(*)::text
from pg_constraint
where conrelid = 'public.order_document_items'::regclass and contype = 'c'
  and pg_get_constraintdef(oid) like '%quantity%' and pg_get_constraintdef(oid) like '%> 0%'
union all
select 'DOC_ITEM_UNIQUE', count(*)::text
from pg_constraint
where conrelid = 'public.order_document_items'::regclass and contype = 'u'
  and pg_get_constraintdef(oid) like '%document_id%' and pg_get_constraintdef(oid) like '%order_item_id%'
union all
select 'DOC_FK_ORDER_RESTRICT', count(*)::text
from pg_constraint
where conrelid = 'public.order_documents'::regclass and contype = 'f'
  and confrelid = 'public.partner_orders'::regclass and confdeltype = 'r'
union all
select 'DOC_FK_ORDER_NOT_CASCADE', count(*)::text
from pg_constraint
where conrelid = 'public.order_documents'::regclass and contype = 'f'
  and confrelid = 'public.partner_orders'::regclass and confdeltype = 'c'
union all
select 'DOC_ITEM_FK_DOCUMENT_CASCADE', count(*)::text
from pg_constraint
where conrelid = 'public.order_document_items'::regclass and contype = 'f'
  and confrelid = 'public.order_documents'::regclass and confdeltype = 'c'
union all
select 'DOC_ITEM_FK_DOCUMENT_NOT_RESTRICT', count(*)::text
from pg_constraint
where conrelid = 'public.order_document_items'::regclass and contype = 'f'
  and confrelid = 'public.order_documents'::regclass and confdeltype = 'r'
union all
select 'DOC_ITEM_FK_ORDER_ITEM_RESTRICT', count(*)::text
from pg_constraint
where conrelid = 'public.order_document_items'::regclass and contype = 'f'
  and confrelid = 'public.order_items'::regclass and confdeltype = 'r'
union all
select 'DOC_ITEM_FK_ORDER_ITEM_NOT_CASCADE', count(*)::text
from pg_constraint
where conrelid = 'public.order_document_items'::regclass and contype = 'f'
  and confrelid = 'public.order_items'::regclass and confdeltype = 'c'
union all
select 'DOC_RLS', count(*)::text
from pg_tables where schemaname = 'public' and tablename = 'order_documents' and rowsecurity
union all
select 'DOC_ITEM_RLS', count(*)::text
from pg_tables where schemaname = 'public' and tablename = 'order_document_items' and rowsecurity
union all
select 'DOC_POLICIES', count(*)::text
from pg_policies where schemaname = 'public' and tablename = 'order_documents'
union all
select 'DOC_ITEM_POLICIES', count(*)::text
from pg_policies where schemaname = 'public' and tablename = 'order_document_items'
union all
select 'DOC_NONADMIN_POLICIES', count(*)::text
from pg_policies
where schemaname = 'public' and tablename = 'order_documents'
  and coalesce(qual, '') || ' ' || coalesce(with_check, '') not like '%fn_is_admin%'
union all
select 'DOC_ITEM_NONADMIN_POLICIES', count(*)::text
from pg_policies
where schemaname = 'public' and tablename = 'order_document_items'
  and coalesce(qual, '') || ' ' || coalesce(with_check, '') not like '%fn_is_admin%'
union all
select 'DOC_TRIGGERS', count(*)::text
from pg_trigger tg join pg_class cl on cl.oid = tg.tgrelid
join pg_namespace ns on ns.oid = cl.relnamespace
where not tg.tgisinternal and ns.nspname = 'public' and cl.relname = 'order_documents'
union all
select 'DOC_ITEM_TRIGGERS', count(*)::text
from pg_trigger tg join pg_class cl on cl.oid = tg.tgrelid
join pg_namespace ns on ns.oid = cl.relnamespace
where not tg.tgisinternal and ns.nspname = 'public' and cl.relname = 'order_document_items'
union all
select 'OVERSHIP_GUARD_EXEC_PUBLIC',
       (has_function_privilege('public', 'public.fn_guard_document_item_overship()', 'execute'))::int::text
union all
select 'CREATE_RPC', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_create_order_document'
union all
select 'REPLACE_RPC', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_replace_order_document_items'
union all
select 'CREATE_RPC_SECDEF', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_create_order_document' and p.prosecdef
union all
select 'REPLACE_RPC_SECDEF', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_replace_order_document_items' and p.prosecdef
union all
select 'RPC_EXEC_PUBLIC',
       (has_function_privilege('public', 'public.fn_create_order_document(uuid, text, text, date, text, jsonb, text)', 'execute'))::int::text
union all
select 'RPC_EXEC_ANON',
       coalesce((select (has_function_privilege('anon', 'public.fn_create_order_document(uuid, text, text, date, text, jsonb, text)', 'execute'))::int::text
                 where exists (select 1 from pg_roles where rolname = 'anon')), '0')
union all
select 'RPC_EXEC_AUTHENTICATED',
       coalesce((select (has_function_privilege('authenticated', 'public.fn_create_order_document(uuid, text, text, date, text, jsonb, text)', 'execute'))::int::text
                 where exists (select 1 from pg_roles where rolname = 'authenticated')), '0')
union all
select 'AUDIT_ORDER_DOCUMENT', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%''ORDER_DOCUMENT''%'
union all
select 'AUDIT_ORDER_DOCUMENT_ITEM', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%''ORDER_DOCUMENT_ITEM''%'
union all
select 'AUDIT_DOC_LOOKUP_1HOP', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row'
  and p.prosrc like '%''order_internal_notes'',''order_sanci_offers'',''order_items'',''order_documents''%'
union all
select 'AUDIT_DOC_ITEM_LOOKUP_2HOP', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row'
  and p.prosrc like '%from order_documents doc%'
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
