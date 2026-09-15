-- ============================================================
-- SANCI Partner Hub — Phase 2 irisan kedua puluh empat
-- Migration 0029: Penawaran (Proposal) TERSIMPAN — nomor, versi,
--                 masa berlaku, dan salinan beku isinya
-- Jalankan di: Supabase Studio → SQL Editor → paste seluruh file → Run
--
-- PRASYARAT: 0001 → … → 0028 sudah dijalankan, DALAM URUTAN ITU. Blok §0
-- berhenti dengan pesan jelas kalau belum.
--
-- BERKAS INI ATOMIK: tanpa `commit;` di tengah. Gagal di mana pun = tidak
-- ada yang berubah.
--
-- ============================================================
-- LATAR BELAKANG
-- ============================================================
--
-- Sampai sekarang Proposal TIDAK PERNAH masuk database: ia dirakit dari
-- hand-off Kalkulator yang hidup di localStorage browser (lihat kepala
-- web/lib/proposal-shared.ts). Konsekuensinya, yang diminta audit
-- 2026-09-15 dan diputuskan owner hari itu:
--
--   * Pelanggan menelepon minta "harga di kertas yang kemarin" — tidak ada
--     tempat untuk mencarinya. Kertasnya sendiri satu-satunya catatan.
--   * "Tolong revisi jadi versi ketiga" — tidak ada versi kedua untuk
--     dibandingkan; yang lama sudah tertimpa atau sudah kedaluwarsa dari
--     browser.
--   * Tidak ada nomor yang bisa disebut di telepon.
--
-- KEPUTUSAN OWNER 2026-09-15 (ketiganya):
--   1. Nomor per CABANG: `PR-{PartnerCode}-{BranchCode}/{YY}/{SeqNo}`,
--      mis. `PR-GH-BSD/26/001` — logika yang sama dengan customer_code
--      0019, jadi dari nomornya langsung terbaca toko mana yang membuatnya.
--   2. Revisi = NOMOR SAMA, VERSI BARU. v1/v2/v3 masing-masing satu baris
--      dan versi lama TIDAK PERNAH hilang, supaya "yang versi dua itu"
--      benar-benar bisa dibuka lagi.
--   3. Masa berlaku 14 hari, DIHITUNG SERVER saat disimpan.
--
-- ============================================================
-- YANG DIBUKA IRISAN INI (dan hanya ini)
-- ============================================================
--   * 1 tabel BARU `partner_proposals` (satu baris = satu VERSI penawaran).
--   * 1 tabel BARU `partner_proposal_counters` — cermin
--     `partner_customer_counters` (0019): partisi per (cabang, tahun).
--   * 1 fungsi penomoran `fn_next_proposal_seq` (security definer, EXECUTE
--     dicabut sejak lahir — LESSONS #26).
--   * 1 trigger `fn_set_proposal_fields` (BEFORE INSERT): nomor, versi, dan
--     masa berlaku DIPAKSA SERVER, tidak pernah dipercaya dari client
--     (LESSONS #11).
--   * RLS: admin penuh; cabang BACA miliknya sendiri + TULIS (insert) atas
--     namanya sendiri. NOL policy UPDATE/DELETE untuk cabang.
--
-- YANG SENGAJA TIDAK DIBUKA:
--   * `fn_audit_row` TIDAK didefinisikan ulang, jadi tabel ini BELUM
--     ber-audit-trail. Alasannya prosedural, bukan malas: ATURAN BESI
--     (migrations/README.md) mewajibkan penambahan awalan aksi dilakukan
--     dengan MENYALIN UTUH definisi terakhir (0025, yang memuat
--     PRODUCT_COLOR) lalu menambah satu baris, diverifikasi diff baris demi
--     baris. Menggabungkan salinan utuh itu ke dalam migrasi yang juga
--     membuat dua tabel + RLS + trigger membuat keduanya tidak bisa
--     ditinjau dengan benar. Awalan `PROPOSAL` menyusul di migrasi
--     TERSENDIRI yang isinya HANYA salinan fn_audit_row + satu baris —
--     preseden 0023 yang juga sengaja tidak menyentuhnya.
--   * `final_amount` TIDAK dihitung ulang trigger — beda sengaja dari
--     `order_sanci_offers.final_amount` (0015) yang memang dipaksa server.
--     Alasannya: baris di sini adalah SALINAN BEKU dari kertas yang SUDAH
--     dipegang pelanggan. Kalau trigger menghitung ulang dengan rumus yang
--     kelak berubah, catatan ini akan berbeda dari kertasnya — dan kertasnya
--     yang benar. Angka pesanan sungguhan tetap dijaga 0015; ini bukan
--     pesanan, ini arsip penawaran.
--   * Tidak ada `on delete cascade` ke `sanci_products`: isi penawaran
--     disimpan sebagai SALINAN jsonb (`lines`/`products`), bukan foreign key
--     ke katalog. Produk yang kelak ditarik/diganti nama TIDAK BOLEH
--     mengubah penawaran lama (keputusan owner "凍結，不要跟著變").
-- ============================================================

-- ── 0. Pengaman prasyarat ────────────────────────────────────
do $$
begin
  if to_regprocedure('public.fn_is_admin()') is null
     or to_regprocedure('public.fn_pu_partner()') is null
     or to_regprocedure('public.fn_pu_branch()') is null
     or to_regprocedure('public.fn_can_view_branch(uuid)') is null
     or to_regclass('public.partners') is null
     or to_regclass('public.partner_branches') is null then
    raise exception
      'Fondasi partner/izin (fn_is_admin / fn_pu_partner / fn_pu_branch / fn_can_view_branch / partners / partner_branches) belum lengkap. Jalankan 0001 → … → 0028 dulu, baru 0029.';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'partners' and column_name = 'code'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'partner_branches' and column_name = 'code'
  ) then
    raise exception
      'partners.code / partner_branches.code belum ada — keduanya dipakai menyusun nomor penawaran.';
  end if;
end;
$$;

-- ── 1. Tabel penawaran ───────────────────────────────────────
--
-- SATU BARIS = SATU VERSI. `(proposal_number, version)` unik; keluarga
-- revisinya diikat oleh `proposal_number` yang sama.
create table if not exists public.partner_proposals (
  id                    uuid primary key default gen_random_uuid(),

  partner_id            uuid not null references public.partners(id) on delete restrict,
  branch_id             uuid not null references public.partner_branches(id) on delete restrict,

  -- Dipaksa trigger. Nullable di DDL HANYA supaya client bisa mengirim
  -- baris tanpa menebak nomor; §3 menjamin ia terisi sebelum tersimpan.
  proposal_number       text,
  version               integer not null default 1,

  -- Label yang dipakai orang mencari ("penawaran Pak Budi").
  customer_name         text,

  -- Uang: BIGINT rupiah bulat, pola sama dengan product_prices (0021) dan
  -- order_sanci_offers (0015). Semua NON-NULL dengan default aman supaya
  -- tidak ada penawaran tersimpan yang angkanya "tidak diketahui".
  subtotal              bigint  not null default 0 check (subtotal >= 0),
  discount_pcts         jsonb   not null default '[]'::jsonb,
  total_discount_amount bigint  not null default 0 check (total_discount_amount >= 0),
  markup_pct            numeric(5,2) check (markup_pct is null or (markup_pct >= 0 and markup_pct <= 100)),
  cash_discount         bigint  not null default 0 check (cash_discount >= 0),
  extra_fee_label       text,
  extra_fee_amount      bigint  not null default 0 check (extra_fee_amount >= 0),
  final_amount          bigint  not null check (final_amount >= 0),

  -- SALINAN BEKU. `lines` = baris pilihan pelanggan (nama/kode/harga
  -- satuan/qty/warna saat itu). `products` = profil produk (deskripsi,
  -- ukuran, kategori, alamat foto) saat itu. Keduanya jsonb, BUKAN foreign
  -- key: katalog boleh berubah, kertas pelanggan tidak.
  lines                 jsonb   not null,
  products              jsonb,

  -- Dipaksa trigger (LESSONS #11): tanggal bisnis Indonesia + 14 hari.
  valid_until           date,

  created_at            timestamptz not null default now(),
  created_by            uuid default auth.uid(),

  constraint partner_proposals_number_version_unique unique (proposal_number, version),
  constraint partner_proposals_version_positive check (version >= 1),
  constraint partner_proposals_lines_is_array check (jsonb_typeof(lines) = 'array'),
  constraint partner_proposals_lines_not_empty check (jsonb_array_length(lines) > 0),
  constraint partner_proposals_discounts_is_array check (jsonb_typeof(discount_pcts) = 'array'),
  constraint partner_proposals_products_is_array check (products is null or jsonb_typeof(products) = 'array')
);

-- Daftar "penawaran cabang ini, terbaru dulu" — pertanyaan yang akan
-- ditanyakan setiap kali layar penawaran dibuka.
create index if not exists idx_partner_proposals_branch_time
  on public.partner_proposals (branch_id, created_at desc);

-- "Semua versi dari nomor ini" — dipakai saat membuka riwayat revisi.
create index if not exists idx_partner_proposals_number
  on public.partner_proposals (proposal_number, version);

-- ── 2. Counter penomoran per (cabang, tahun) ─────────────────
--
-- Cermin `partner_customer_counters` (0019) PERSIS: partisi per tahun, reset
-- ke 1 setiap tahun baru per cabang.
create table if not exists public.partner_proposal_counters (
  branch_id  uuid not null references public.partner_branches(id) on delete restrict,
  seq_year   integer not null,
  last_seq   integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (branch_id, seq_year)
);

-- Pola PERSIS fn_next_customer_seq (0019 §4) / fn_next_order_seq (0004 §2):
-- INSERT … ON CONFLICT DO UPDATE mengunci baris (branch_id, seq_year) di
-- transaksi YANG SAMA dengan INSERT penawarannya — dua staf menekan Simpan
-- di detik yang sama diantrikan Postgres, bukan mendapat nomor kembar
-- (LESSONS #3). Transaksi rollback → kenaikan counter ikut batal.
create or replace function public.fn_next_proposal_seq(b uuid, y integer) returns integer
language plpgsql security definer set search_path = public as $$
declare v_seq integer;
begin
  insert into partner_proposal_counters as c (branch_id, seq_year, last_seq)
  values (b, y, 1)
  on conflict (branch_id, seq_year) do update
    set last_seq = c.last_seq + 1, updated_at = now()
  returning c.last_seq into v_seq;
  return v_seq;
end;
$$;

-- LESSONS #26: fungsi ini MENGUBAH data (menaikkan counter) dan hanya
-- dipanggil dari dalam trigger security definer di §3. Kalau EXECUTE publik
-- dibiarkan, PostgREST meng-expose-nya sebagai /rpc/ dan siapa pun yang
-- login bisa menaikkan nomor cabang mana pun tanpa pernah menyimpan
-- penawaran — nomor lompat / DoS penomoran. Ditutup sejak lahir.
revoke all on function public.fn_next_proposal_seq(uuid, integer) from public, anon, authenticated;

-- ── 3. Trigger: nomor, versi, masa berlaku DIPAKSA SERVER ────
--
-- Nilai dari client TIDAK dipercaya untuk ketiganya (LESSONS #11):
--   * `proposal_number` kosong  → keluarga BARU, nomor digenerate.
--   * `proposal_number` terisi  → REVISI keluarga itu; `version` dihitung
--     dari max(version)+1 yang SUDAH ADA, bukan dari angka kiriman client.
--     Dua staf merevisi nomor yang sama bersamaan: yang kalah balapan
--     mendapat 23505 pada unique (proposal_number, version) dan boleh
--     dicoba ulang oleh pemanggil — pola yang sama dengan penomoran
--     dokumen 0016.
--   * `valid_until` SELALU dihitung ulang di sini; nilai kiriman dibuang.
create or replace function public.fn_set_proposal_fields() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_partner_code text;
  v_branch_code  text;
  v_yy           text;
  v_seq          integer;
  v_max_version  integer;
begin
  -- Masa berlaku: tanggal BISNIS Indonesia, bukan UTC — pola sama dengan
  -- fn_set_order_number/fn_set_customer_code.
  new.valid_until := (now() at time zone 'Asia/Jakarta')::date + 14;

  if new.proposal_number is null or btrim(new.proposal_number) = '' then
    -- Keluarga baru → versi selalu 1, apa pun yang dikirim client.
    new.version := 1;

    -- security definer: dibaca tanpa bergantung RLS, pola fn_set_customer_code.
    select code into v_partner_code from public.partners where id = new.partner_id;
    select code into v_branch_code  from public.partner_branches where id = new.branch_id;
    if v_partner_code is null or v_branch_code is null then
      raise exception 'partner_id/branch_id pada penawaran baru menunjuk baris yang tidak ada';
    end if;

    v_yy := to_char(now() at time zone 'Asia/Jakarta', 'YY');
    v_seq := public.fn_next_proposal_seq(
      new.branch_id,
      extract(year from (now() at time zone 'Asia/Jakarta'))::integer
    );

    new.proposal_number := 'PR-' || v_partner_code || '-' || v_branch_code
                            || '/' || v_yy || '/' || lpad(v_seq::text, 3, '0');
    return new;
  end if;

  -- Revisi: versi berikutnya dihitung dari yang sudah tersimpan.
  new.proposal_number := btrim(new.proposal_number);
  select max(version) into v_max_version
  from public.partner_proposals
  where proposal_number = new.proposal_number;

  if v_max_version is null then
    raise exception 'proposal_number % tidak ditemukan — revisi hanya boleh menunjuk penawaran yang sudah ada', new.proposal_number;
  end if;

  new.version := v_max_version + 1;
  return new;
end;
$$;

drop trigger if exists trg_set_proposal_fields on public.partner_proposals;
create trigger trg_set_proposal_fields
  before insert on public.partner_proposals
  for each row execute function public.fn_set_proposal_fields();

-- ── 4. RLS ───────────────────────────────────────────────────
--
-- Bentuknya MENGIKUTI partner_orders (0004 §RLS): admin penuh; cabang baca
-- lewat fn_can_view_branch (yang sudah menangani OWN_BRANCH vs
-- PARTNER_ALL_BRANCHES, 0001) dan menulis HANYA atas nama partner/cabangnya
-- sendiri — atribusi adalah identitas, bukan pilihan form.
alter table public.partner_proposals enable row level security;
alter table public.partner_proposal_counters enable row level security;

drop policy if exists pp_admin_all on public.partner_proposals;
create policy pp_admin_all on public.partner_proposals
  for all using (public.fn_is_admin()) with check (public.fn_is_admin());

drop policy if exists pp_partner_read on public.partner_proposals;
create policy pp_partner_read on public.partner_proposals
  for select using (public.fn_is_admin() or public.fn_can_view_branch(branch_id));

drop policy if exists pp_partner_insert on public.partner_proposals;
create policy pp_partner_insert on public.partner_proposals
  for insert with check (
    public.fn_is_admin()
    or (partner_id = public.fn_pu_partner() and branch_id = public.fn_pu_branch())
  );

-- SENGAJA TANPA policy UPDATE/DELETE untuk cabang: penawaran yang sudah
-- disimpan adalah CATATAN dari kertas yang sudah dipegang pelanggan.
-- Perubahan dilakukan dengan menyimpan VERSI BARU, bukan menimpa yang lama
-- (keputusan owner 2026-09-15; pendirian yang sama dengan 0004 untuk
-- partner_orders dan LESSONS #4 deactivate-don't-delete).

-- Counter: RLS AKTIF dengan NOL policy — tertutup untuk semua peran
-- PostgREST, hanya fungsi security definer §2 yang menyentuhnya (pola 0009
-- §3 / customer_view_attempts 0023).

-- ── 5. Verifikasi — STRUKTUR (hasilnya di-copy balik) ────────
-- Angka yang diharapkan — cocokkan SATU PER SATU. "Run tanpa tulisan merah"
-- BUKAN bukti (LESSONS #7 & #16).
--
--   PROPOSALS_TABLE                1
--   COUNTERS_TABLE                 1
--   PROPOSALS_POLICIES             3   ← admin_all + partner_read + partner_insert
--   PROPOSALS_UPDATE_DELETE_POLICIES 0 ← cabang tidak boleh menimpa/menghapus
--   COUNTERS_POLICIES              0   ← RLS aktif, nol policy (hanya definer)
--   COUNTERS_RLS_ENABLED           1
--   SEQ_FN                         1
--   SEQ_FN_EXEC_PUBLIC             0   ← EXECUTE sudah dicabut (LESSONS #26)
--   SET_FIELDS_TRIGGER             1
--   PROPOSALS_INDEXES              2
--   PRODUCT_NO_PRICE_COLUMN        0   ← rujukan 0010, DIULANG di sini
--   AUDIT_STILL_0025               1   ← fn_audit_row TIDAK disentuh migrasi ini
select 'PROPOSALS_TABLE' as check_type,
       (select count(*)::text from pg_tables where schemaname='public' and tablename='partner_proposals') as result
union all
select 'COUNTERS_TABLE',
       (select count(*)::text from pg_tables where schemaname='public' and tablename='partner_proposal_counters')
union all
select 'PROPOSALS_POLICIES',
       (select count(*)::text from pg_policies where schemaname='public' and tablename='partner_proposals')
union all
select 'PROPOSALS_UPDATE_DELETE_POLICIES',
       (select count(*)::text from pg_policies
        where schemaname='public' and tablename='partner_proposals' and cmd in ('UPDATE','DELETE'))
union all
select 'COUNTERS_POLICIES',
       (select count(*)::text from pg_policies where schemaname='public' and tablename='partner_proposal_counters')
union all
select 'COUNTERS_RLS_ENABLED',
       (select case when relrowsecurity then 1 else 0 end::text
        from pg_class where oid = 'public.partner_proposal_counters'::regclass)
union all
select 'SEQ_FN',
       (select count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='fn_next_proposal_seq')
union all
select 'SEQ_FN_EXEC_PUBLIC',
       (select count(*)::text from information_schema.routine_privileges
        where specific_schema='public' and routine_name='fn_next_proposal_seq'
          and grantee in ('PUBLIC','anon','authenticated') and privilege_type='EXECUTE')
union all
select 'SET_FIELDS_TRIGGER',
       (select count(*)::text from pg_trigger
        where tgrelid='public.partner_proposals'::regclass and tgname='trg_set_proposal_fields' and not tgisinternal)
union all
select 'PROPOSALS_INDEXES',
       (select count(*)::text from pg_indexes
        where schemaname='public' and tablename='partner_proposals'
          and indexname in ('idx_partner_proposals_branch_time','idx_partner_proposals_number'))
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

-- ── 6. Perilaku ──────────────────────────────────────────────
--
-- Uji perilaku yang MENULIS (nomor urut naik per cabang/tahun, revisi
-- menaikkan versi, valid_until = hari ini + 14, cabang lain nol baris)
-- TIDAK dijalankan di sini — berkas migrasi tidak menulis data produksi.
-- Tempatnya `supabase/test-harness/130_behavior_0029.sql`, mengikuti pola
-- 0027 (yang juga memindahkan uji tulisnya ke harness).
