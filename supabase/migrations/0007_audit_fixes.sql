-- ============================================================
-- SANCI Partner Hub — 0007: perbaikan temuan audit basis data (P0 + P1)
-- Migration 0007: policy SELECT customers & partner_staff ditulis ulang supaya
--                 INSERT ... RETURNING tidak lagi gagal, + tutup akses EXECUTE
--                 fn_next_order_seq  (idempotent — aman dijalankan ulang)
-- Jalankan di: Supabase Studio → SQL Editor → paste seluruh file → Run
--
-- PRASYARAT: 0001 → 0003 → 0004 → 0005 → 0006 sudah dijalankan, DALAM URUTAN
-- ITU. Blok pengaman di bawah berhenti dengan pesan jelas kalau belum.
--
-- ============================================================
-- P0 — "Simpan pelanggan" SELALU gagal untuk pengguna cabang
-- ============================================================
--
-- GEJALA: pengguna cabang menekan Simpan pada formulir pelanggan (atau staf),
-- database menolak dengan 42501 "new row violates row-level security policy",
-- dan SELURUH transaksi rollback — pelanggan + order sekaligus hilang. Padahal
-- policy INSERT-nya (c_partner_insert) sudah benar dan memang mengizinkan.
--
-- AKAR MASALAH (bukan dugaan — diverifikasi dengan tes perilaku):
-- supabase-js `.insert(...).select()` dikompilasi PostgREST menjadi satu
-- perintah `INSERT ... RETURNING`. Klausa RETURNING membuat Postgres ikut
-- menerapkan policy SELECT tabel itu pada baris baru. Sampai sini normal.
--
-- Yang mematikan: policy SELECT lama berbunyi `fn_can_view_customer(id)`, dan
-- fungsi itu harus MENCARI BARISNYA DI TABEL customers untuk menjawab. Di dalam
-- perintah yang sama, baris yang baru saja di-INSERT itu BELUM TERLIHAT oleh
-- query apa pun yang dijalankan dari dalam perintah tersebut (aturan visibilitas
-- command-counter Postgres: "perubahan yang dibuat sebuah perintah tidak terlihat
-- oleh perintah itu sendiri"). Jadi pencarian selalu nihil → policy false → 42501.
--
-- Yang SUDAH DIUJI dan TETAP gagal, supaya tidak ada yang mencoba lagi:
--   * fungsi diubah dari STABLE menjadi VOLATILE          → tetap gagal
--   * fungsi tetap SECURITY DEFINER (melewati RLS)        → tetap gagal
--   * policy tanpa fungsi, subquery `select 1 from customers where id = id`
--                                                          → tetap gagal
-- Ini BUKAN soal hak akses atau snapshot fungsi, melainkan soal baris itu belum
-- ada bagi perintahnya sendiri. Satu-satunya perbaikan yang mungkin: policy
-- TIDAK BOLEH mencari barisnya sendiri.
--
-- PERBAIKAN: tulis ulang kedua policy supaya cabang pertamanya membaca KOLOM
-- BARIS ITU SENDIRI (nilai kolom sudah tersedia langsung di ekspresi policy,
-- tanpa perlu dicari):
--   customers      → fn_can_view_branch(created_via_branch_id)
--   partner_staff  → partner_id = fn_pu_partner()
-- Cabang kedua (relasi ke TABEL LAIN) tetap boleh berupa subquery, dan tetap
-- WAJIB security definer (LESSONS #15) — tabel lain memang sudah ada isinya.
--
-- SEMANTIK TIDAK BERUBAH SEDIKIT PUN. Ekspresi baru adalah penulisan ulang
-- aljabar dari ekspresi lama, karena `exists (select 1 from customers c where
-- c.id = <baris ini>.id and P(c.kolom))` untuk baris yang SUDAH ada persis sama
-- dengan `P(<baris ini>.kolom)`. Yang dulu bocor tetap tidak bocor:
--   * pelanggan partner lain yang tidak punya order di cabang kita → tetap
--     tak terlihat (SPEC §91-93)
--   * pelanggan yang dibuat di cabang lain TAPI punya order di cabang kita
--     → tetap terlihat (jalur kedua)
--   * staf tanpa penugasan aktif → tetap fail-open di dalam partner sendiri,
--     dan tetap tertutup untuk partner lain
-- Ketiganya ada di matriks tes perilaku dan tidak berubah satu baris pun.
--
-- fn_can_view_customer / fn_can_view_staff SENGAJA TIDAK DIHAPUS: keduanya
-- masih berguna untuk pemeriksaan di sisi server (dan blok verifikasi 0004
-- menghitungnya). Yang berubah hanya: policy tidak lagi memakainya.
--
-- ============================================================
-- P1 — fn_next_order_seq bisa dipanggil siapa saja
-- ============================================================
--
-- Postgres memberi EXECUTE kepada PUBLIC pada SETIAP fungsi baru. Artinya
-- fn_next_order_seq — yang MENGUBAH data (menaikkan penghitung nomor order) —
-- terbuka lewat PostgREST sebagai RPC untuk anon maupun authenticated.
-- Diverifikasi dengan tes: baik anon maupun authenticated berhasil menaikkan
-- penghitung cabang milik partner LAIN, hanya bermodal id cabang.
--
-- Dampaknya bukan kebocoran data, tapi perusakan penomoran: penyerang bisa
-- melompatkan nomor order berikutnya sejauh yang ia mau (GH-CBR-260816-0013
-- tiba-tiba menjadi -9013), dan membuat baris penghitung untuk cabang yang
-- belum pernah punya order. Nomor order dibaca manusia dan dipakai sebagai
-- rujukan kerja — lompatan seperti itu terlihat seperti "ada order yang hilang".
--
-- Mencabut EXECUTE TIDAK mengganggu pengambilan nomor yang normal: pemanggilnya
-- adalah fn_set_order_number, sebuah trigger SECURITY DEFINER yang berjalan
-- sebagai PEMILIK fungsi, bukan sebagai pengguna yang login.
-- ============================================================

-- ── 0. Pengaman prasyarat ───────────────────────────────────

do $$
begin
  if to_regprocedure('public.fn_can_view_customer(uuid)') is null
     or to_regprocedure('public.fn_next_order_seq(uuid, date)') is null
     or to_regprocedure('public.fn_guard_order_status_flow()') is null then
    raise exception
      'Migration 0004_customer_order.sql / 0005_order_edit_cancel.sql belum dijalankan di database ini. Jalankan 0001 → 0003 → 0004 → 0005 → 0006 dulu, baru 0007.';
  end if;

  -- 0006 WAJIB sudah aktif. Kalau 0001 dijalankan ulang setelah 0006, kedua
  -- helper kembali ke versi INNER JOIN dan pengguna cabang buta total tanpa
  -- satu pun pesan error (lihat catatan di 0006). Karena 0007 dibangun di atas
  -- helper itu, lebih baik berhenti di sini daripada menutupi bug lama.
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'fn_can_view_branch'
      and p.prosrc like '%left join partner_access_policies%') then
    raise exception
      'fn_can_view_branch masih versi lama (INNER JOIN). Jalankan ulang 0006_own_branch_without_policy.sql dulu, baru 0007.';
  end if;
end;
$$;

-- ── 1. Helper baru: bagian "relasi ke tabel lain" saja ──────

-- Dipisah dari policy dengan sengaja. Isinya adalah cabang kedua dari aturan
-- lama, kata demi kata. Tetap SECURITY DEFINER karena membaca partner_orders,
-- tabel yang punya RLS sendiri: kalau subquery ini ditulis langsung di dalam
-- policy, ia ikut tersaring RLS partner_orders, order yang tak terlihat akan
-- tampak "tidak ada", dan aturannya salah arah tanpa suara (LESSONS #15).
--
-- STABLE aman di sini: yang dibaca adalah baris partner_orders yang memang
-- sudah ada sebelum perintah berjalan. Masalah P0 di atas SAMA SEKALI bukan
-- soal STABLE — sudah diuji dengan VOLATILE dan hasilnya identik.
create or replace function public.fn_customer_has_visible_order(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from partner_orders o
    where o.customer_id = cid and public.fn_can_view_branch(o.branch_id)
  );
$$;

-- Bagian penugasan dari fn_can_view_staff, kata demi kata:
--   ada penugasan aktif di cabang yang terlihat  → terlihat
--   TIDAK punya penugasan aktif sama sekali      → terlihat (fail-open)
-- Fail-open itu memang keputusan lama dan DIPERTAHANKAN: staf yang belum
-- ditugaskan tidak boleh menghilang dari layar orang yang baru membuatnya.
-- Batas partner TIDAK ada di sini — itu dijaga oleh `partner_id =
-- fn_pu_partner()` di policy, memakai kolom baris itu sendiri.
-- Membaca partner_staff_assignments WAJIB security definer: persis bug
-- LESSONS #15 yang dulu membocorkan nama staf cabang lain.
create or replace function public.fn_staff_assignment_visible(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
      select 1 from partner_staff_assignments a
      where a.staff_id = sid and a.end_at is null
        and public.fn_can_view_branch(a.branch_id))
    or not exists (
      select 1 from partner_staff_assignments a
      where a.staff_id = sid and a.end_at is null);
$$;

-- fn_can_view_customer didefinisikan ulang agar memakai helper yang sama —
-- perilakunya IDENTIK dengan 0004, hanya supaya aturan "punya order di cabang
-- yang terlihat" hidup di satu tempat saja. Fungsi ini TIDAK lagi dipakai
-- policy (lihat P0 di atas); ia tetap ada untuk pemeriksaan sisi server.
create or replace function public.fn_can_view_customer(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.fn_is_admin() or exists (
    select 1 from customers c
    where c.id = cid and public.fn_can_view_branch(c.created_via_branch_id)
  ) or public.fn_customer_has_visible_order(cid);
$$;

-- Sama untuk fn_can_view_staff: perilaku identik 0001, isinya dibagi dengan
-- helper baru supaya tidak ada dua salinan aturan yang bisa berbeda diam-diam.
create or replace function public.fn_can_view_staff(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.fn_is_admin() or (
    exists (select 1 from partner_staff s
            where s.id = sid and s.partner_id = public.fn_pu_partner())
    and public.fn_staff_assignment_visible(sid));
$$;

-- ── 2. Policy SELECT ditulis ulang (P0) ─────────────────────

-- customers: cabang pertama memakai KOLOM BARIS INI (created_via_branch_id),
-- jadi baris yang baru di-INSERT bisa dinilai tanpa dicari dulu → RETURNING
-- berhasil. Cabang admin dipertahankan supaya ekspresinya tetap setara persis
-- dengan aturan lama (admin sebenarnya sudah tercakup c_admin_all).
drop policy if exists c_partner_read on public.customers;
create policy c_partner_read on public.customers
  for select using (
    public.fn_is_admin()
    or public.fn_can_view_branch(created_via_branch_id)
    or public.fn_customer_has_visible_order(id)
  );

-- partner_staff: batas partner dari kolom baris ini (partner_id), aturan
-- penugasan dari helper yang membaca TABEL LAIN. Staf yang baru dibuat belum
-- punya penugasan → cabang fail-open → RETURNING berhasil, dan pembuatnya
-- langsung melihat staf yang baru ia buat (itu memang perilaku yang benar).
drop policy if exists s_partner_read on public.partner_staff;
create policy s_partner_read on public.partner_staff
  for select using (
    public.fn_is_admin()
    or (partner_id = public.fn_pu_partner()
        and public.fn_staff_assignment_visible(id))
  );

-- ── 3. Permukaan EXECUTE fungsi (P1 + audit menyeluruh) ─────

-- 3a. WAJIB DICABUT — fungsi yang MENGUBAH data dan tidak pernah dipanggil
--     langsung oleh aplikasi.
-- 3b. Fungsi trigger (returns trigger). Postgres sendiri sudah menolak
--     pemanggilan langsung ("trigger functions can only be called as triggers")
--     dan PostgREST tidak mengeksposnya, jadi ini pertahanan berlapis, bukan
--     penambalan lubang. DIUJI: mencabut EXECUTE TIDAK menghentikan trigger —
--     hak akses fungsi trigger diperiksa saat CREATE TRIGGER, bukan saat jalan.
do $$
declare
  v_fn    text;
  v_roles text := 'public';
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    v_roles := v_roles || ', anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    v_roles := v_roles || ', authenticated';
  end if;

  foreach v_fn in array array[
    -- 3a — INI temuan P1 yang sesungguhnya
    'public.fn_next_order_seq(uuid, date)',
    -- 3b — fungsi trigger
    'public.fn_audit_row()',
    'public.fn_set_order_number()',
    'public.fn_set_created_by()',
    'public.fn_touch_updated_at()',
    'public.fn_check_order_refs()',
    'public.fn_check_assignment()',
    'public.fn_check_user_branch()',
    'public.fn_guard_order_immutable_cols()',
    'public.fn_guard_order_status_flow()'
  ] loop
    if to_regprocedure(v_fn) is not null then
      execute format('revoke all on function %s from %s', v_fn, v_roles);
    end if;
  end loop;
end;
$$;

-- 3c. SENGAJA TETAP BOLEH DIPANGGIL — dan ini bukan kelalaian, melainkan
--     keharusan teknis:
--
--     Fungsi-fungsi ini dipakai DI DALAM ekspresi policy RLS. Ekspresi policy
--     dievaluasi sebagai pengguna yang melakukan query, sehingga hak EXECUTE-nya
--     ikut diperiksa. DIUJI: mencabut EXECUTE fn_can_view_branch membuat
--     `select * from partner_branches` gagal dengan "permission denied for
--     function fn_can_view_branch" — bukan mengembalikan 0 baris, tapi ERROR.
--     Mencabutnya sama dengan mematikan seluruh aplikasi.
--
--     Dan memang tidak ada yang perlu disembunyikan: masing-masing hanya
--     menjawab "APAKAH SAYA boleh?" tentang PEMANGGILNYA SENDIRI, dihitung dari
--     auth.uid(). Pemanggil tidak bisa menanyakannya atas nama orang lain, tidak
--     mendapat satu pun kolom data, dan jawabannya bisa ia peroleh juga dengan
--     cara biasa (select ke tabelnya). Semua mengembalikan boolean/uuid milik
--     dirinya sendiri.
--
--     anon ikut diberi hak dengan sengaja: pengunjung yang belum login pun
--     menyentuh policy ini saat membuka halaman. Tanpa EXECUTE, mereka dapat
--     ERROR alih-alih "tidak ada data" — dan error database yang menyamar jadi
--     kesimpulan bisnis persis yang dilarang LESSONS #10.
do $$
declare
  v_fn    text;
  v_roles text := '';
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    v_roles := 'anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    v_roles := case when v_roles = '' then 'authenticated'
                    else v_roles || ', authenticated' end;
  end if;
  if v_roles = '' then
    return;
  end if;

  foreach v_fn in array array[
    'public.fn_is_admin()',
    'public.fn_pu_partner()',
    'public.fn_pu_branch()',
    'public.fn_can_view_branch(uuid)',
    'public.fn_can_edit_branch(uuid)',
    'public.fn_can_view_staff(uuid)',
    'public.fn_can_edit_staff(uuid)',
    'public.fn_can_view_customer(uuid)',
    'public.fn_customer_has_visible_order(uuid)',
    'public.fn_staff_assignment_visible(uuid)'
  ] loop
    if to_regprocedure(v_fn) is not null then
      execute format('grant execute on function %s to %s', v_fn, v_roles);
    end if;
  end loop;
end;
$$;

-- ── 4. Verifikasi (hasilnya di-copy balik ke Claude) ────────
-- Harapan:
--   CUSTOMER_READ_NO_SELFLOOKUP  1  ← policy customers tidak lagi memanggil
--                                     fn_can_view_customer (penyebab P0)
--   STAFF_READ_NO_SELFLOOKUP     1  ← policy staf tidak lagi memanggil
--                                     fn_can_view_staff
--   NEW_HELPERS                  2  ← fn_customer_has_visible_order,
--                                     fn_staff_assignment_visible
--   SEQ_EXEC_PUBLIC              0  ← WAJIB 0 (P1 tertutup)
--   SEQ_EXEC_ANON                0  ← WAJIB 0
--   SEQ_EXEC_AUTHENTICATED       0  ← WAJIB 0
--   TRIGGER_FN_TERKUNCI          9  ← fungsi trigger tidak lagi terbuka PUBLIC
--   POLICY_HELPER_EXEC          10  ← WAJIB 10: kalau kurang, RLS akan ERROR,
--                                     bukan sekadar menyembunyikan data
--   VIEW_LEFT_JOIN               1  ← 0006 masih aktif (0001 sudah ikut disusul)
--   EDIT_LEFT_JOIN               1
--
-- Setelah ini JANGAN berhenti di "Run tanpa tulisan merah" (LESSONS #7 & #16):
-- masuk dengan akun cabang sungguhan, simpan SATU pelanggan baru, dan pastikan
-- namanya benar-benar muncul di daftar — itulah bukti P0 sudah mati.

select 'CUSTOMER_READ_NO_SELFLOOKUP' as check_type,
       count(*)::text as result
from pg_policies
where schemaname = 'public' and tablename = 'customers' and policyname = 'c_partner_read'
  and qual not like '%fn_can_view_customer%'
union all
select 'STAFF_READ_NO_SELFLOOKUP', count(*)::text
from pg_policies
where schemaname = 'public' and tablename = 'partner_staff' and policyname = 's_partner_read'
  and qual not like '%fn_can_view_staff%'
union all
select 'NEW_HELPERS', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('fn_customer_has_visible_order','fn_staff_assignment_visible')
union all
select 'SEQ_EXEC_PUBLIC',
       (has_function_privilege('public', 'public.fn_next_order_seq(uuid, date)', 'execute'))::int::text
union all
select 'SEQ_EXEC_ANON',
       coalesce((select (has_function_privilege('anon', 'public.fn_next_order_seq(uuid, date)', 'execute'))::int::text
                 from pg_roles where rolname = 'anon'), '0')
union all
select 'SEQ_EXEC_AUTHENTICATED',
       coalesce((select (has_function_privilege('authenticated', 'public.fn_next_order_seq(uuid, date)', 'execute'))::int::text
                 from pg_roles where rolname = 'authenticated'), '0')
union all
select 'TRIGGER_FN_TERKUNCI', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prorettype = 'trigger'::regtype
  and p.proname in ('fn_audit_row','fn_set_order_number','fn_set_created_by',
                    'fn_touch_updated_at','fn_check_order_refs','fn_check_assignment',
                    'fn_check_user_branch','fn_guard_order_immutable_cols',
                    'fn_guard_order_status_flow')
  and not has_function_privilege('public', p.oid, 'execute')
union all
select 'POLICY_HELPER_EXEC',
       coalesce((select count(*)::text from unnest(array[
           'public.fn_is_admin()','public.fn_pu_partner()','public.fn_pu_branch()',
           'public.fn_can_view_branch(uuid)','public.fn_can_edit_branch(uuid)',
           'public.fn_can_view_staff(uuid)','public.fn_can_edit_staff(uuid)',
           'public.fn_can_view_customer(uuid)',
           'public.fn_customer_has_visible_order(uuid)',
           'public.fn_staff_assignment_visible(uuid)']) f
         where exists (select 1 from pg_roles where rolname = 'authenticated')
           and has_function_privilege('authenticated', f, 'execute')), '0')
union all
select 'VIEW_LEFT_JOIN', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_can_view_branch'
  and p.prosrc like '%left join partner_access_policies%'
union all
select 'EDIT_LEFT_JOIN', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_can_edit_branch'
  and p.prosrc like '%left join partner_access_policies%';
