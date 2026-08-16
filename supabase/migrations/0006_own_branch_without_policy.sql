-- ============================================================
-- SANCI Partner Hub — 0006: cabang sendiri terlihat tanpa baris kebijakan
-- Migration 0006: perbaiki fn_can_view_branch / fn_can_edit_branch (0001)
--                 (idempotent — aman dijalankan ulang)
-- Jalankan di: Supabase Studio → SQL Editor → paste seluruh file → Run
--
-- AKAR MASALAH (ditemukan 2026-08-16, login cabang sungguhan pertama):
-- fn_can_view_branch / fn_can_edit_branch (0001) memakai INNER JOIN ke
-- partner_access_policies. Baris kebijakan baru dibuat saat SANCI Admin
-- pertama kali MENYIMPAN pengaturan izin (web/app/admin/actions-permissions.ts
-- adalah upsert) — membuat Partner saja TIDAK membuatnya. Akibatnya untuk
-- partner tanpa baris kebijakan: join kosong → semua kondisi false → pengguna
-- cabang tidak bisa melihat CABANGNYA SENDIRI, dan /cabang/pesanan/baru serta
-- /cabang/profil crash karena data cabang null.
--
-- PERBAIKAN: LEFT JOIN. Semantik baru (dan yang memang diinginkan):
--   - cabang sendiri  → selalu terlihat & bisa diedit, tidak butuh baris
--                       kebijakan sama sekali
--   - lintas cabang   → tetap WAJIB baris kebijakan eksplisit
--                       (visibility/edit PARTNER_ALL_BRANCHES); tanpa baris
--                       perilakunya persis OWN_BRANCH, yaitu nilai DEFAULT
--                       kolom di tabelnya — jadi tidak ada hak yang bertambah
--                       diam-diam
--
-- Prinsip (LESSONS): jalur inti pengguna fail-open saat konfigurasi belum ada;
-- pelonggaran lintas cabang tetap fail-closed.
--
-- KENAPA BUKAN "isi saja baris kebijakan untuk semua partner lama":
-- backfill hanya menambal partner yang ADA HARI INI. Partner yang dibuat besok
-- tetap lahir tanpa baris kebijakan dan bug yang sama muncul lagi. Perbaikan
-- harus ada di pembaca, bukan di data.
--
-- SIAPA YANG TERPENGARUH SELAIN HALAMAN CABANG: kedua fungsi ini dipakai
-- policy RLS di 0001 (partner_branches, partner_staff_assignments, dan lewat
-- fn_can_view_staff/fn_can_edit_staff juga partner_staff) serta 0004/0005
-- (partner_orders, dan lewat fn_can_view_customer juga customers). Satu
-- perbaikan di sini memulihkan semuanya sekaligus — jangan menulis ulang
-- logika ini di tempat lain.
--
-- PRASYARAT: 0001 sudah dijalankan.
--
-- ⚠ CATATAN untuk yang menjalankan ulang 0001 SETELAH file ini (sama seperti
-- catatan fn_audit_row di 0004 & 0005, tapi akibatnya JAUH lebih parah):
-- 0001 mendefinisikan ulang kedua fungsi ini dengan INNER JOIN, sehingga
-- me-paste 0001 ke SQL Editor akan MENGHIDUPKAN KEMBALI bug ini — pengguna
-- cabang dari partner tanpa baris kebijakan langsung tidak bisa melihat
-- cabangnya sendiri lagi, tanpa satu pun pesan error. URUTAN AMAN: 0001 → 0004
-- → 0005 → 0006, dan 0006 SELALU dijalankan paling akhir. Kalau ragu, jalankan
-- ulang 0006 saja — file ini idempotent dan blok verifikasi di bawah akan
-- memberi 0 kalau definisi lama sedang aktif.
-- ============================================================

-- ── 0. Pengaman prasyarat ───────────────────────────────────

do $$
begin
  if to_regprocedure('public.fn_can_view_branch(uuid)') is null
     or to_regprocedure('public.fn_can_edit_branch(uuid)') is null
     or to_regclass('public.partner_access_policies') is null then
    raise exception
      'Migration 0001_partner_foundation.sql belum dijalankan di database ini. Jalankan 0001 dulu, baru 0006.';
  end if;
end;
$$;

-- ── 1. Definisi ulang kedua helper ──────────────────────────

-- Definisi ulang UTUH (bukan tambalan) supaya file ini idempotent, mengikuti
-- pola fn_audit_row di 0004/0005. Perubahan dari 0001 hanya SATU kata di
-- masing-masing fungsi: join → left join. Sisanya sengaja dibiarkan identik,
-- termasuk urutan pemeriksaan admin dan penjaga fn_pu_partner() is null yang
-- membuat pengguna berstatus DISABLED (fn_pu_partner() null) tetap tertutup.
create or replace function public.fn_can_view_branch(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when public.fn_is_admin() then true
    when public.fn_pu_partner() is null then false
    else exists (
      select 1 from partner_branches br
      left join partner_access_policies pol on pol.partner_id = br.partner_id
      where br.id = b
        and br.partner_id = public.fn_pu_partner()
        and (br.id = public.fn_pu_branch()
             or pol.visibility_scope = 'PARTNER_ALL_BRANCHES')
    )
  end;
$$;

-- Tanpa baris kebijakan, pol.* bernilai null sehingga cabang OR yang kedua
-- menghasilkan null (bukan true) — hanya cabang sendiri yang lolos. Itulah
-- sebabnya pelonggaran lintas cabang tetap fail-closed tanpa syarat tambahan.
create or replace function public.fn_can_edit_branch(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when public.fn_is_admin() then true
    when public.fn_pu_partner() is null then false
    else exists (
      select 1 from partner_branches br
      left join partner_access_policies pol on pol.partner_id = br.partner_id
      where br.id = b
        and br.partner_id = public.fn_pu_partner()
        and (br.id = public.fn_pu_branch()
             or (pol.visibility_scope = 'PARTNER_ALL_BRANCHES'
                 and pol.edit_scope = 'PARTNER_ALL_BRANCHES'))
    )
  end;
$$;

-- ── 2. Verifikasi (hasilnya di-copy balik ke Claude) ────────
-- Harapan:
--   VIEW_LEFT_JOIN   1   ← fn_can_view_branch sudah versi 0006
--   EDIT_LEFT_JOIN   1   ← fn_can_edit_branch sudah versi 0006
--   VIEW_INNER_JOIN  0   ← WAJIB 0: kalau 1, definisi lama 0001 sedang aktif
--   EDIT_INNER_JOIN  0   ← WAJIB 0
--   PARTNER_TANPA_KEBIJAKAN  = berapa Partner yang belum punya baris izin
--   PENGGUNA_TERTOLONG       = berapa akun cabang yang tadinya buta total
--
-- Dua angka terakhir BUKAN error — itu jumlah orang yang baru saja tertolong
-- file ini. Angka 0 juga wajar (berarti semua Partner memang sudah pernah
-- disimpan pengaturan izinnya). Kalau VIEW_INNER_JOIN atau EDIT_INNER_JOIN
-- bernilai 1, ada yang menjalankan ulang 0001 setelah 0006: jalankan ulang
-- file ini, jangan diabaikan.
--
-- Setelah ini JANGAN berhenti di "Run tanpa tulisan merah" (LESSONS #7 & #16):
-- buka /cabang dengan akun cabang sungguhan dan pastikan nama cabangnya muncul.

select 'VIEW_LEFT_JOIN' as check_type,
       count(*)::text as result
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_can_view_branch'
  and p.prosrc like '%left join partner_access_policies%'
union all
select 'EDIT_LEFT_JOIN', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_can_edit_branch'
  and p.prosrc like '%left join partner_access_policies%'
union all
select 'VIEW_INNER_JOIN', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_can_view_branch'
  and p.prosrc not like '%left join partner_access_policies%'
union all
select 'EDIT_INNER_JOIN', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_can_edit_branch'
  and p.prosrc not like '%left join partner_access_policies%'
union all
select 'PARTNER_TANPA_KEBIJAKAN', count(*)::text
from public.partners pa
where not exists (select 1 from public.partner_access_policies pol
                  where pol.partner_id = pa.id)
union all
select 'PENGGUNA_TERTOLONG', count(*)::text
from public.partner_users pu
where pu.status = 'ACTIVE'
  and not exists (select 1 from public.partner_access_policies pol
                  where pol.partner_id = pu.partner_id);
