-- ============================================================
-- SANCI Partner Hub — Phase 2 irisan kedua puluh
-- Migration 0026: Pembayaran Pelanggan (customer → cabang) + Ekspedisi
--                 (idempotent — aman dijalankan ulang)
-- Jalankan di: Supabase Studio → SQL Editor → paste seluruh file → Run
--
-- PRASYARAT: 0001 → … → 0025 sudah dijalankan, DALAM URUTAN ITU. Blok
-- pengaman §0 berhenti dengan pesan jelas kalau belum. Setelah file ini,
-- rantai penuhnya menjadi 0001 → … → 0024 → 0025 → 0026 (lihat
-- migrations/README.md — ATURAN BESI; baris ATURAN BESI itu sendiri BELUM
-- diperbarui oleh berkas ini, lihat catatan "CAKUPAN README" di bawah).
--
-- ============================================================
-- LATAR BELAKANG BISNIS (owner, keputusan 2026-08-31)
-- ============================================================
--
-- Lembar kerja manual kantor mencatat, PER PESANAN, apa yang sudah dibayar
-- PELANGGAN AKHIR ke TOKO (cabang): total setelah diskon, tanggal DP, jumlah
-- yang sudah dibayar, tanggal lunas, dan ekspedisi (kurir pengiriman).
-- Sistem sampai sekarang tidak menyimpan satu pun dari angka ini — dan
-- lembar manualnya SENDIRI terbukti mengandung kontradiksi (baris ditandai
-- "Lunas" padahal separuh masih terutang), jadi status lunas WAJIB
-- DITURUNKAN dari angka, TIDAK PERNAH diketik manual.
--
-- Keputusan owner yang MENGIKAT (2026-08-31, diperbarui hari yang sama):
--   * Uang ini adalah PELANGGAN → CABANG. BUKAN cabang → SANCI — itu SENGAJA
--     ditunda, di luar cakupan irisan ini sama sekali.
--   * Hidup di `partner_orders`, dikelola CABANG (bukan admin-only).
--   * "Lunas" DIHITUNG OTOMATIS oleh database — tidak pernah kolom yang
--     diketik.
--   * "Status Confirm" pada lembar kerja manual TERMASUK — kolom
--     `confirm_status` (§1), teks bebas isi tangan kantor (mis. "Menunggu
--     Tanggal dari Sanci"), BUKAN status yang diturunkan sistem.
--   * "Nama Admin" pada lembar kerja manual TETAP TIDAK dimasukkan —
--     `partner_orders.partner_pic_staff_id` (0004) SUDAH menjalankan peran
--     itu (staf PIC internal SANCI yang menangani pesanan); menambah kolom
--     kedua untuk hal yang sama akan menciptakan DUA sumber kebenaran yang
--     bisa berbeda isinya. Dicatat di sini SUPAYA TIDAK ADA yang menambah
--     kolom duplikat untuk ini di kemudian hari.
--
-- ============================================================
-- BEDA DENGAN DUA ANGKA UANG LAIN YANG SUDAH ADA DI SISTEM — PENTING
-- ============================================================
--
-- Sistem ini SUDAH punya dua angka uang lain di sekitar sebuah pesanan, dan
-- KEDUANYA BUKAN angka yang dibuka irisan ini:
--   1. `partner_orders.partner_purchase_amount` (0009) — klaim CABANG
--      tentang berapa yang dibelanjakan pelanggannya DI TOKO CABANG,
--      dilaporkan MANUAL, dan menurut 0009 §-latar belakang SENGAJA "bukan
--      angka yang boleh dipercaya mentah-mentah" (invoice-nya lampiran
--      pendukung, bukan sumber kebenaran).
--   2. `order_sanci_offers` (0013/0015) — harga SANCI → CABANG (apa yang
--      SANCI tagih ke toko untuk produknya, lengkap dengan rantai
--      diskon/markup/potongan tunai, `final_amount`).
--
-- `customer_total_amount`/`customer_paid_amount` di berkas ini adalah ANGKA
-- KETIGA yang BERBEDA dari keduanya: harga yang PELANGGAN AKHIR bayar ke
-- TOKO CABANG. Tiga angka, tiga arah uang, tiga tabel/kolom yang TIDAK
-- SALING MENGGANTIKAN:
--   SANCI → cabang         : order_sanci_offers.final_amount (0015)
--   pelanggan → cabang     : partner_orders.customer_total_amount (INI)
--   cabang → SANCI (klaim) : partner_orders.partner_purchase_amount (0009)
--
-- ============================================================
-- YANG DIBUKA IRISAN INI (dan hanya ini)
-- ============================================================
--   partner_orders → 6 kolom BARU, semuanya nullable/default aman:
--     customer_total_amount, customer_paid_amount, customer_dp_paid_at,
--     customer_settled_at, expedition, confirm_status.
--   fn_guard_customer_payment() → trigger BARU di partner_orders:
--     menghitung ULANG customer_settled_at pada SETIAP tulisan — nilai dari
--     client TIDAK PERNAH dipercaya untuk kolom ini (LESSONS #11).
--     confirm_status TIDAK disentuh trigger ini — teks bebas isi tangan,
--     BUKAN nilai turunan (§1).
--
-- YANG SENGAJA TIDAK DIBUKA:
--   * TIDAK ADA kolom status pembayaran yang DISIMPAN ("Lunas"/"DP"/dst.) —
--     status adalah MATEMATIKA TAMPILAN, diturunkan dari
--     customer_total_amount/customer_paid_amount saat dibaca. Rumus KANONIK
--     ini SUDAH dirilis di dua tempat lain (web/lib/payment-shared.ts dan
--     sinkronisasi Google Sheets) SEBELUM berkas ini ditulis — §2
--     menyelaraskan syarat stamping trigger dengan rumus yang SAMA, bukan
--     mengarang rumus baru:
--       total IS NULL          → status TIDAK DIKETAHUI/kosong (LESSONS #10:
--                                 TIDAK PERNAH ditampilkan sebagai Rp 0)
--       paid >= total            → LUNAS (total=0 eksplisit TERMASUK — lihat
--                                   §2 "KASUS BATAS total=0, DISELESAIKAN")
--       paid > 0                 → DP
--       selain itu (paid <= 0)   → BELUM (BAYAR)
--   * TIDAK ADA "Nama Admin" — `partner_pic_staff_id` (0004) sudah menjalankan
--     peran itu (keputusan owner, di atas).
--   * TIDAK ADA policy RLS baru — §3 memverifikasi (bukan mengasumsikan)
--     bahwa `o_partner_update` (0005) sudah cukup (kini termasuk
--     confirm_status juga).
--   * `fn_audit_row` TIDAK didefinisikan ulang — §4.
-- ============================================================
--
-- CAKUPAN README: migrations/README.md (baris ATURAN BESI, tabel
-- per-berkas 0024/0025/0026, dan angka verifikasi) DIPERBARUI bersamaan
-- dengan berkas ini. Penulisannya menyusul SETELAH replay lokal penuh
-- 0001→…→0026 supaya angka yang dicatat di README adalah angka yang
-- SUNGGUH terukur (LESSONS #7), bukan diperkirakan dari membaca SQL saja.
-- ============================================================

-- ── 0. Pengaman prasyarat (LESSONS #41: periksa OBJEK, bukan versi aktif) ──
do $$
begin
  if to_regprocedure('public.fn_is_admin()') is null
     or to_regprocedure('public.fn_audit_row()') is null
     or to_regclass('public.partner_orders') is null
     or to_regclass('public.customers') is null then
    raise exception
      'Fungsi/tabel dasar (fn_is_admin / fn_audit_row / partner_orders / customers) belum lengkap. Jalankan 0001 → … → 0025 dulu, baru 0026.';
  end if;
end;
$$;

-- ── 1. Kolom pembayaran pelanggan + ekspedisi ───────────────

-- customer_total_amount: NULLABLE, TANPA DEFAULT. NULL berarti "belum
-- dicatat" — dan itu WAJIB TIDAK PERNAH ditampilkan sebagai Rp 0 (LESSONS
-- #10: DB error/kosong ≠ kesimpulan bisnis "nol"). Layar WAJIB membedakan
-- "belum ada angka" dari "angkanya nol rupiah" (pesanan gratis, kalau ada).
alter table public.partner_orders
  add column if not exists customer_total_amount numeric(15,2);

-- customer_paid_amount: NOT NULL DEFAULT 0 — BEDA SENGAJA dari
-- customer_total_amount. LESSONS #8 minta setiap DEFAULT diuji "apa arti
-- bisnisnya" sebelum dipasang: di sini nol rupiah SUDAH DIBAYAR adalah
-- kebenaran yang benar secara alami untuk pesanan yang baru dibuat — belum
-- ada pembayaran itu SENDIRI adalah fakta yang tepat direpresentasikan nol,
-- BUKAN "tidak diketahui" (beda dengan customer_total_amount: total belum
-- tercatat memang benar-benar tidak diketahui, karena bisa jadi belum ada
-- yang menegosiasikan harga akhir). SYARAT WAJIB yang mengikuti keputusan
-- ini: layar TETAP harus memperlakukan (total IS NULL) sebagai status TIDAK
-- DIKETAHUI apa pun isi customer_paid_amount — paid=0 pada total=NULL BUKAN
-- bukti "belum bayar", karena totalnya sendiri belum pasti.
alter table public.partner_orders
  add column if not exists customer_paid_amount numeric(15,2) not null default 0;

-- customer_dp_paid_at: NULLABLE, TANPA DEFAULT, DIISI TANGAN oleh cabang —
-- kantor mencatat tanggal DP dunia-nyata (kadang berbeda dari kapan baris
-- ini diketik ke sistem), jadi ini SENGAJA BUKAN kolom yang di-stamp server
-- (beda dari customer_settled_at, §2) — nilai TANGGAL murni, `date`, bukan
-- `timestamptz` (sejajar `order_documents.doc_date`, bukan sejajar
-- `created_at`).
alter table public.partner_orders
  add column if not exists customer_dp_paid_at date;

-- customer_settled_at: NULLABLE, TANPA DEFAULT. DIPAKSA SERVER lewat
-- trigger §2 — TIDAK PERNAH diterima dari client (LESSONS #11: jam HP tidak
-- dipercaya; di sini malah lebih ketat — bahkan NILAI-nya, bukan cuma
-- sumber jamnya, dihitung ulang dari nol pada SETIAP tulisan, lihat §2).
alter table public.partner_orders
  add column if not exists customer_settled_at timestamptz;

-- expedition: NULLABLE, teks bebas, TANPA DEFAULT — kelas yang SAMA dengan
-- `shipping_address` (0014 §4) dan `customer_po` (0020): nama kurir
-- ("JNE","Sicepat","armada sendiri", dst.) tidak punya himpunan nilai yang
-- tertutup, memaksakan enum akan menolak nama kurir yang sah hari ini.
alter table public.partner_orders
  add column if not exists expedition text;

-- confirm_status: NULLABLE, teks bebas, TANPA DEFAULT — "Status Confirm" di
-- lembar kerja manual kantor, isi TANGAN (mis. "Menunggu Tanggal dari
-- Sanci"). BUKAN nilai turunan (beda dari customer_settled_at, §2) dan
-- TIDAK disentuh fn_guard_customer_payment sama sekali — kelas yang SAMA
-- dengan `expedition` di atas dan `shipping_address` (0014)/`customer_po`
-- (0020): teks bebas tanpa himpunan nilai tertutup, divalidasi mata
-- manusia. "Nama Admin" pada lembar yang SAMA TIDAK mendapat kolom di sini
-- — `partner_orders.partner_pic_staff_id` (0004) sudah menjalankan peran
-- itu (lihat kepala berkas).
alter table public.partner_orders
  add column if not exists confirm_status text;

-- Keempat CHECK di bawah ditambahkan TERPISAH dari ADD COLUMN IF NOT EXISTS
-- (HOUSE RULE non-negotiable proyek ini): kalau salah satu kolom di atas
-- SUDAH ada dari percobaan migrasi sebelumnya yang gagal separuh jalan,
-- `add column if not exists` di atas akan NO-OP TOTAL untuk kolom itu —
-- termasuk TIDAK memasang CHECK-nya kalau CHECK-nya ditulis inline di sana.
-- Pola conname-guard PERSIS 0015 §2/§4 dipakai di ketiganya supaya
-- menjalankan ulang berkas ini di database mana pun (kolom baru murni,
-- ATAU kolom yang sudah pernah setengah jadi) berakhir pada hasil yang
-- SAMA: ketiga constraint terpasang, tidak digandakan.
do $$
begin
  if not exists (select 1 from pg_constraint
                 where conname = 'partner_orders_customer_total_amount_check'
                   and conrelid = 'public.partner_orders'::regclass) then
    alter table public.partner_orders
      add constraint partner_orders_customer_total_amount_check
      check (customer_total_amount is null or customer_total_amount >= 0);
  end if;

  if not exists (select 1 from pg_constraint
                 where conname = 'partner_orders_customer_paid_amount_check'
                   and conrelid = 'public.partner_orders'::regclass) then
    alter table public.partner_orders
      add constraint partner_orders_customer_paid_amount_check
      check (customer_paid_amount >= 0);
  end if;

  if not exists (select 1 from pg_constraint
                 where conname = 'partner_orders_expedition_check'
                   and conrelid = 'public.partner_orders'::regclass) then
    alter table public.partner_orders
      add constraint partner_orders_expedition_check
      check (expedition is null or char_length(expedition) <= 120);
  end if;

  if not exists (select 1 from pg_constraint
                 where conname = 'partner_orders_confirm_status_check'
                   and conrelid = 'public.partner_orders'::regclass) then
    alter table public.partner_orders
      add constraint partner_orders_confirm_status_check
      check (confirm_status is null or char_length(confirm_status) <= 200);
  end if;
end;
$$;

-- TANPA BACKFILL (LESSONS #44 dipatuhi secara harfiah): kelima kolom di
-- atas nullable ATAU ber-default KONSTAN (`0`, bukan ekspresi VOLATILE
-- seperti gen_random_uuid() milik 0023) — `ADD COLUMN ... NOT NULL DEFAULT
-- 0` dengan default KONSTAN adalah operasi metadata-only sejak Postgres 11
-- (TIDAK menulis ulang tabel, TIDAK mengevaluasi per baris, TIDAK memicu
-- SATU PUN row trigger) — beda dari 0023 §1 yang defaultnya VOLATILE dan
-- karena itu MEMANG butuh table-rewrite. Tidak ada UPDATE ... WHERE ... IS
-- NULL di berkas ini sama sekali, jadi risiko LESSONS #44 (BEFORE guard
-- fn_guard_order_status_flow 0005 menolak UPDATE pada pesanan CANCELLED)
-- tidak pernah muncul.

-- ── 2. fn_guard_customer_payment: hitung ulang status lunas ──

-- KENAPA TRIGGER DAN BUKAN RLS (alasan identik 0009 §2/0023 §3): RLS hanya
-- melihat baris HASIL, tidak bisa membandingkan LAMA vs BARU, dan tidak
-- bisa MENGHITUNG ULANG sebuah nilai. Cabang MEMANG punya policy UPDATE
-- atas pesanannya sendiri (o_partner_update, 0005 — diverifikasi ulang di
-- §3), jadi tanpa trigger ini cabang bisa mengirim customer_settled_at
-- BUATANNYA SENDIRI lewat API biasa dan lolos begitu saja.
--
-- ATURAN YANG DITEGAKKAN: customer_settled_at TIDAK PERNAH diterima dari
-- client — nilainya DIHITUNG ULANG DARI NOL pada SETIAP INSERT/UPDATE,
-- mengabaikan apa pun yang dikirim NEW.customer_settled_at oleh pemanggil.
-- Syarat SEJAJAR PERSIS dengan cabang LUNAS pada rumus tampilan kanonik
-- (kepala berkas — web/lib/payment-shared.ts & sinkronisasi Sheets):
--   customer_total_amount IS NOT NULL
--     DAN customer_paid_amount >= customer_total_amount
--   → SUDAH LUNAS (TERMASUK total=0, paid=0 — lihat "KASUS BATAS total=0"
--     di bawah). Kalau SEBELUMNYA sudah pernah tercap (baris lama sudah
--     punya customer_settled_at), pertahankan NILAI LAMA itu — TIDAK
--     di-cap ulang dengan now() yang baru (IDEMPOTEN: menyimpan ulang
--     pesanan yang sudah lunas, tanpa mengubah angka pembayarannya, tidak
--     menggeser tanggal lunasnya). Kalau BELUM pernah tercap, cap now().
--   Selain kombinasi itu (total NULL, atau paid < total)
--   → customer_settled_at DIPAKSA NULL, apa pun nilainya sebelumnya
--     (SELF-REVOKING: cabang mengoreksi paid yang tadinya salah ketik
--     kelewat besar, turun lagi di bawah total → tanggal lunas yang salah
--     ikut tercabut otomatis, tidak tertinggal sebagai jejak yang keliru).
--
-- BERLAKU JUGA UNTUK INSERT, bukan hanya UPDATE (pola 0009 §2/0023 §3): CASE
-- di bawah membaca OLD hanya kalau tg_op = 'UPDATE', jadi jalur INSERT
-- otomatis memperlakukan "belum pernah tercap" sebagai keadaan awal.
--
-- KASUS BATAS total=0, DISELESAIKAN (bukan lagi celah terbuka): draf
-- pertama berkas ini memakai syarat `customer_total_amount > 0` di sini,
-- yang membuat trigger stamping TIDAK SEJALAN dengan rumus tampilan
-- kanonik pada satu titik (total literal 0, paid 0 — rumus tampilan
-- menghitungnya LUNAS lewat cabang `paid>=total`, versi awal trigger ini
-- TIDAK men-stamp). Per LESSONS #34, kontradiksi itu SENGAJA tidak
-- diselesaikan sepihak saat pertama ditemukan — didokumentasikan dan
-- diserahkan ke pemilik keputusan. Owner mengonfirmasi rumus KANONIK (di
-- atas, TANPA `>0`) SUDAH BERJALAN di web/lib/payment-shared.ts dan
-- sinkronisasi Sheets; syarat `> 0` di sini karena itu DIHAPUS supaya
-- trigger ini sejalan dengan sumber kebenaran yang sudah dirilis, bukan
-- sebaliknya. Diuji di §7 Bagian B (SHADOW_T_ZERO_TOTAL_STAMPED, sekarang
-- WAJIB true).
--
-- SECURITY INVOKER (bawaan): fungsi ini tidak membaca tabel apa pun.
create or replace function public.fn_guard_customer_payment() returns trigger
language plpgsql set search_path = public as $$
declare
  v_old_settled timestamptz := case when tg_op = 'UPDATE' then old.customer_settled_at end;
begin
  if new.customer_total_amount is not null
     and new.customer_paid_amount >= new.customer_total_amount then
    new.customer_settled_at := coalesce(v_old_settled, now());
  else
    new.customer_settled_at := null;
  end if;

  return new;
end;
$$;

-- LESSONS #26: fungsi trigger = permukaan EXECUTE tertutup sejak lahir.
revoke all on function public.fn_guard_customer_payment() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.fn_guard_customer_payment() from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.fn_guard_customer_payment() from authenticated';
  end if;
end;
$$;

-- Urutan trigger BEFORE di partner_orders setelah berkas ini (Postgres:
-- urut nama — trg_order_customer_payment jatuh di antara trg_order_arrival
-- dan trg_order_customer_link secara alfabet):
--   trg_check_order_refs        (0004/0008)
--   trg_order_arrival           (0009)
--   trg_order_customer_link     (0023)
--   trg_order_customer_payment  (0026 — INI)
--   trg_order_immutable_cols    (0005)
--   trg_order_status_flow       (0005)
--   trg_touch                   (0001)
-- Urutan di antara para penjaga tidak mengubah hasil: fungsi ini TIDAK
-- PERNAH raise exception (tidak seperti trg_order_status_flow/
-- trg_order_customer_link) — ia hanya menulis ulang satu kolom turunan,
-- jadi tidak ada perlombaan "siapa menolak duluan" untuk dipedulikan di sini.
drop trigger if exists trg_order_customer_payment on public.partner_orders;
create trigger trg_order_customer_payment before insert or update on public.partner_orders
  for each row execute function public.fn_guard_customer_payment();

-- ── 3. RLS: TIDAK ADA policy baru (diverifikasi, bukan diasumsikan) ──

-- `o_partner_update` (0005 §4, `create policy o_partner_update on
-- partner_orders for update using (fn_can_edit_branch(branch_id)) with
-- check (fn_can_edit_branch(branch_id))`) SUDAH membiarkan cabang meng-UPDATE
-- baris pesanannya sendiri TANPA daftar kolom yang dibatasi — kelima kolom
-- baru di §1 OTOMATIS ikut tercakup begitu kolomnya ada, PERSIS pola
-- `shipping_address` (0014)/`customer_po` (0020)/`size` produk (0024, tabel
-- lain tapi doktrin sama). Diverifikasi ulang di §7
-- (O_PARTNER_UPDATE_EXISTS), bukan diasumsikan dari membaca kepala berkas
-- 0005 saja.
--
-- KENAPA INI AMAN — KONTRAS SADAR dengan 0013 §-kepala (yang MEMPERINGATKAN
-- pola "menumpang policy lama" justru BERBAHAYA untuk order_sanci_offers):
-- 0013 menolak menumpang RLS lama karena nilai penawaran SANCI→cabang
-- adalah RAHASIA DAGANG SANCI yang TIDAK BOLEH terlihat cabang sama sekali
-- sampai flag `can_view_offer` (0014) membukanya secara EKSPLISIT. Kelima
-- kolom di berkas ini BUKAN rahasia dari cabang dengan cara yang sama:
-- angka-angka ini adalah PENCATATAN CABANG SENDIRI tentang pelanggannya
-- sendiri (uang yang MASUK KE CABANG, bukan harga yang SANCI tetapkan
-- untuk cabang) — cabang MEMANG SUDAH tahu semua angka ini dari
-- transaksinya sendiri dengan pelanggannya, sistem cuma mencatatnya. Tidak
-- ada informasi baru yang "bocor" ke cabang lewat celah UPDATE yang sudah
-- ada — beda kelas masalah dari 0013, bukan pengecualian diam-diam
-- terhadap kehati-hatian yang sama.
--
-- TIDAK ADA policy admin BARU juga — `o_admin_all` (0004) sudah mencakup
-- SEMUA kolom tabel ini untuk admin, termasuk kelima yang baru.

-- ── 4. fn_audit_row: TIDAK didefinisikan ulang ──────────────

-- Berkas ini TIDAK menyentuh fn_audit_row SATU BARIS PUN (0 kemunculan
-- `create or replace function public.fn_audit_row`). Alasannya sama persis
-- dengan 0015/0017/0019/0020/0024 (garis merah yang SAMA, bukan kebetulan
-- berulang): `partner_orders` SUDAH diaudit sejak 0004 (awalan 'ORDER'),
-- dan versi fn_audit_row yang aktif SIAPA PUN itu (§0021+, sekarang 0022
-- atau 0025 tergantung urutan jalan) men-serialize SELURUH baris lewat
-- `to_jsonb(new)`/`to_jsonb(old)` — kelima kolom baru OTOMATIS ikut masuk
-- ke before/after tanpa satu baris kode tambahan. Perubahan angka
-- pembayaran pelanggan akan tercatat sebagai `ORDER_UPDATED` biasa (cabang
-- generik `v_prefix || '_UPDATED'`), bukan aksi bernama khusus — membuat
-- aksi bernama ('ORDER_PAYMENT_UPDATED' misalnya) HARUS lewat definisi
-- ulang fn_audit_row, dan itu antrean ATURAN BESI satu berkas lagi yang
-- tidak sepadan manfaatnya di sini (diff before/after sudah cukup bicara:
-- `customer_paid_amount: 500000 → 1000000`).
--
-- SUSULAN SISI APLIKASI (LESSONS #28, DI LUAR CAKUPAN BERKAS SQL INI):
-- `web/lib/audit-format.ts` (SKIP/LABELS/VALUE_LABELS) HARUS diajari
-- kelima kolom baru begitu ada agen yang menyentuh sisi aplikasi:
--   customer_total_amount / customer_paid_amount → LABELS (format rupiah,
--     BUKAN string mentah)
--   customer_dp_paid_at   → LABELS (format tanggal, kolom `date` polos,
--     BUKAN WIB — pola formatCalendarDate 0043, tidak seperti kolom
--     timestamptz lain)
--   customer_settled_at   → LABELS (format tanggal-waktu WIB, pola
--     `delivered_at` 0023 yang sudah lebih dulu diberi label serupa)
--   expedition             → LABELS (label biasa, teks bebas)
-- Sampai itu dikerjakan, layar Aktivitas akan menampilkan kelima kolom ini
-- sebagai key JSON mentah dalam diff — BUKAN kebocoran data (hanya admin
-- yang melihat layar Aktivitas order), tapi TIDAK RAMAH DIBACA. Ini
-- pekerjaan APLIKASI, bukan SQL — sengaja tidak dikerjakan di berkas ini.

-- ── 5. Verifikasi bagian A — STRUKTUR (hasilnya di-copy balik) ──
-- Angka yang diharapkan — cocokkan SATU PER SATU. "Run tanpa tulisan merah"
-- bukan bukti (LESSONS #7 & #16).
--
-- KOLOM
--   TOTAL_COLUMN                    1
--   TOTAL_IS_NUMERIC_NULLABLE       1   ← nullable, TANPA default
--   TOTAL_NO_DEFAULT                0   ← WAJIB 0: TIDAK ada DEFAULT
--   PAID_COLUMN                     1
--   PAID_NOT_NULL_DEFAULT_0         1   ← NOT NULL, DEFAULT 0
--   DP_PAID_AT_COLUMN               1   ← type date
--   DP_PAID_AT_NULLABLE             1
--   SETTLED_AT_COLUMN               1   ← type timestamptz
--   SETTLED_AT_NULLABLE_NO_DEFAULT  1   ← nullable DAN tanpa DEFAULT
--                                        (dipaksa TRIGGER, bukan DEFAULT)
--   EXPEDITION_COLUMN               1   ← type text, nullable
--   CONFIRM_STATUS_COLUMN           1   ← type text, nullable ("Status
--                                        Confirm" lembar manual — TERMASUK
--                                        sekarang, lihat kepala berkas)
-- CHECK (empat, ditambahkan TERPISAH — §1)
--   CHECK_TOTAL_NONNEGATIVE         1
--   CHECK_PAID_NONNEGATIVE          1
--   CHECK_EXPEDITION_LENGTH         1
--   CHECK_CONFIRM_STATUS_LENGTH     1
-- TRIGGER
--   GUARD_FN                        1
--   GUARD_TRIGGER                   1   ← trg_order_customer_payment
--   GUARD_INSERT_AND_UPDATE         1   ← WAJIB 1: berlaku INSERT DAN UPDATE
--   GUARD_RECOMPUTES_SETTLED        1   ← prosrc menyebut customer_settled_at
--                                        DAN coalesce (bukti logika
--                                        idempoten/self-revoking ada di sana)
--   GUARD_EXEC_PUBLIC               0   ← LESSONS #26
--   GUARD_EXEC_ANON                 0
--   GUARD_EXEC_AUTHENTICATED        0
-- RLS (diverifikasi, bukan diasumsikan — §3)
--   O_PARTNER_UPDATE_EXISTS         1   ← policy 0005 masih ada apa adanya
--   ORDER_POLICIES_UNCHANGED        4   ← WAJIB TETAP 4: o_admin_all,
--                                        o_partner_read, o_partner_insert,
--                                        o_partner_update — berkas ini NOL
--                                        create/drop policy
-- AUDIT (garis merah §4)
--   AUDIT_ROW_UNTOUCHED_MARKER      1   ← fn_audit_row versi aktif MASIH
--                                        memuat pemetaan PRODUCT_PRICE
--                                        (0021) — bukti fungsi ini tidak
--                                        ikut disentuh berkas ini
select 'TOTAL_COLUMN' as check_type, count(*)::text as result
from information_schema.columns
where table_schema = 'public' and table_name = 'partner_orders'
  and column_name = 'customer_total_amount'
union all
select 'TOTAL_IS_NUMERIC_NULLABLE', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'partner_orders'
  and column_name = 'customer_total_amount' and data_type = 'numeric' and is_nullable = 'YES'
union all
select 'TOTAL_NO_DEFAULT', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'partner_orders'
  and column_name = 'customer_total_amount' and column_default is not null
union all
select 'PAID_COLUMN', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'partner_orders'
  and column_name = 'customer_paid_amount'
union all
select 'PAID_NOT_NULL_DEFAULT_0', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'partner_orders'
  and column_name = 'customer_paid_amount' and is_nullable = 'NO'
  and column_default like '%0%'
union all
select 'DP_PAID_AT_COLUMN', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'partner_orders'
  and column_name = 'customer_dp_paid_at' and data_type = 'date'
union all
select 'DP_PAID_AT_NULLABLE', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'partner_orders'
  and column_name = 'customer_dp_paid_at' and is_nullable = 'YES'
union all
select 'SETTLED_AT_COLUMN', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'partner_orders'
  and column_name = 'customer_settled_at' and data_type = 'timestamp with time zone'
union all
select 'SETTLED_AT_NULLABLE_NO_DEFAULT', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'partner_orders'
  and column_name = 'customer_settled_at' and is_nullable = 'YES' and column_default is null
union all
select 'EXPEDITION_COLUMN', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'partner_orders'
  and column_name = 'expedition' and data_type = 'text' and is_nullable = 'YES'
union all
select 'CONFIRM_STATUS_COLUMN', count(*)::text
from information_schema.columns
where table_schema = 'public' and table_name = 'partner_orders'
  and column_name = 'confirm_status' and data_type = 'text' and is_nullable = 'YES'
union all
select 'CHECK_TOTAL_NONNEGATIVE', count(*)::text
from pg_constraint
where conrelid = 'public.partner_orders'::regclass and contype = 'c'
  and conname = 'partner_orders_customer_total_amount_check'
union all
select 'CHECK_PAID_NONNEGATIVE', count(*)::text
from pg_constraint
where conrelid = 'public.partner_orders'::regclass and contype = 'c'
  and conname = 'partner_orders_customer_paid_amount_check'
union all
select 'CHECK_EXPEDITION_LENGTH', count(*)::text
from pg_constraint
where conrelid = 'public.partner_orders'::regclass and contype = 'c'
  and conname = 'partner_orders_expedition_check'
union all
select 'CHECK_CONFIRM_STATUS_LENGTH', count(*)::text
from pg_constraint
where conrelid = 'public.partner_orders'::regclass and contype = 'c'
  and conname = 'partner_orders_confirm_status_check'
union all
select 'GUARD_FN', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_guard_customer_payment'
union all
select 'GUARD_TRIGGER', count(*)::text
from pg_trigger tg join pg_class cl on cl.oid = tg.tgrelid
join pg_namespace ns on ns.oid = cl.relnamespace
where not tg.tgisinternal and ns.nspname = 'public'
  and cl.relname = 'partner_orders' and tg.tgname = 'trg_order_customer_payment'
union all
select 'GUARD_INSERT_AND_UPDATE', count(*)::text
from pg_trigger tg join pg_class cl on cl.oid = tg.tgrelid
join pg_namespace ns on ns.oid = cl.relnamespace
where not tg.tgisinternal and ns.nspname = 'public'
  and cl.relname = 'partner_orders' and tg.tgname = 'trg_order_customer_payment'
  and (tg.tgtype & 4) > 0 and (tg.tgtype & 16) > 0 and (tg.tgtype & 2) > 0
union all
select 'GUARD_RECOMPUTES_SETTLED', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_guard_customer_payment'
  and p.prosrc like '%customer_settled_at%' and p.prosrc like '%coalesce%'
union all
select 'GUARD_EXEC_PUBLIC',
       (has_function_privilege('public', 'public.fn_guard_customer_payment()', 'execute'))::int::text
union all
select 'GUARD_EXEC_ANON',
       coalesce((select (has_function_privilege('anon', 'public.fn_guard_customer_payment()', 'execute'))::int::text
                 from pg_roles where rolname = 'anon'), '0')
union all
select 'GUARD_EXEC_AUTHENTICATED',
       coalesce((select (has_function_privilege('authenticated', 'public.fn_guard_customer_payment()', 'execute'))::int::text
                 from pg_roles where rolname = 'authenticated'), '0')
union all
select 'O_PARTNER_UPDATE_EXISTS', count(*)::text
from pg_policies
where schemaname = 'public' and tablename = 'partner_orders' and policyname = 'o_partner_update'
union all
select 'ORDER_POLICIES_UNCHANGED', count(*)::text
from pg_policies where schemaname = 'public' and tablename = 'partner_orders'
union all
select 'AUDIT_ROW_UNTOUCHED_MARKER', count(*)::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_audit_row' and p.prosrc like '%''PRODUCT_PRICE''%';

-- ── 6. Kenapa Bagian B TIDAK memakai baris partner_orders sungguhan ──
--
-- Menyisipkan baris partner_orders UJI COBA butuh fixture LENGKAP
-- (customer_id, partner_id, branch_id, order_number unik, dan lolos
-- trg_check_order_refs) — persis alasan yang sama kenapa 0019/0021/0023
-- meletakkan pengujian PERILAKU yang butuh fixture ke
-- `supabase/test-harness/`, BUKAN ke dalam berkas migration itu sendiri
-- (supaya tidak mengotori data produksi dengan baris uji, LESSONS #39).
-- Penugasan irisan ini SQL-ONLY (dua berkas migration, tidak menambah
-- berkas test-harness baru) — jadi Bagian B di bawah membuktikan PERILAKU
-- SUNGGUHAN fungsi trigger `fn_guard_customer_payment()` lewat DUA cara
-- yang TIDAK butuh fixture pesanan:
--
--   (A) TABEL BAYANGAN sementara (`v0026_payment_shadow`) yang HANYA
--       punya tiga kolom bernama SAMA (customer_total_amount,
--       customer_paid_amount, customer_settled_at) dan memasang
--       `fn_guard_customer_payment()` — fungsi OBJEK YANG SAMA, bukan
--       salinan — sebagai trigger BEFORE-nya. Trigger PL/pgSQL ini hanya
--       membaca NEW.*/OLD.* berdasarkan NAMA KOLOM, tidak pernah menyebut
--       nama tabel `partner_orders` di badannya — jadi menempelkannya ke
--       tabel lain yang kolomnya bernama sama adalah pengujian PERILAKU
--       SUNGGUHAN atas fungsi produksi yang SAMA, bukan tiruan logika yang
--       terpisah. NOL baris partner_orders tersentuh, NOL risiko mengotori
--       audit_logs pesanan sungguhan (kontras sadar dengan bahaya yang
--       diperingatkan 0023 §-latar kalau backfill dipaksakan lewat UPDATE
--       pada tabel bertrigger).
--
--       Idempotensi/self-revoking BUTUH transaksi TERPISAH (BEGIN/COMMIT
--       eksplisit, dengan `pg_sleep` di antaranya) — BUKAN satu blok
--       DO $$ ... $$: `now()` di PL/pgSQL adalah TIMESTAMP AWAL TRANSAKSI,
--       konstan sepanjang SATU transaksi, apa pun `pg_sleep` yang dilewati
--       di tengahnya. Kalau seluruh pengujian dibungkus satu transaksi,
--       bug "selalu cap ulang now()" dan perilaku BENAR "pertahankan nilai
--       lama" akan menghasilkan ANGKA YANG SAMA PERSIS — pengujiannya
--       tidak akan pernah bisa membedakan keduanya. Diverifikasi dengan
--       COMMIT eksplisit di antara langkah T3 dan T4 di bawah supaya kedua
--       transaksi punya `now()` yang SUNGGUH berbeda.
--
--   (B) CHECK constraint di partner_orders sungguhan diuji lewat "bogus
--       update" pada baris YANG SUDAH ADA (kalau ada) di dalam blok
--       plpgsql BEGIN…EXCEPTION: begitu CHECK menolak, PL/pgSQL membuat
--       savepoint implisit di awal blok dan mengembalikannya — TIDAK ADA
--       satu pun tulisan yang pernah ter-commit ke baris asli, apa pun
--       hasilnya. Kalau database ini tidak punya baris partner_orders sama
--       sekali (instalasi baru/kosong), dilaporkan APA ADANYA sebagai
--       "TIDAK DIUJI" (pola 0023 §8 ANON_ORDERS_ROWS) — BUKAN angka yang
--       dikarang supaya terlihat lulus.
--
-- QA MANUAL yang TETAP disarankan untuk Jenzo di staging (di luar cakupan
-- blok otomatis ini, karena butuh pesanan sungguhan lewat UI):
--   1. Buat pesanan, isi Total & DP < Total → pastikan status tampil "DP".
--   2. Naikkan Bayar hingga >= Total → status berubah "Lunas", cek layar
--      Aktivitas order menunjukkan ORDER_UPDATED dengan customer_settled_at
--      terisi.
--   3. Simpan lagi TANPA mengubah angka pembayaran (mis. hanya ganti
--      ekspedisi) → customer_settled_at TIDAK berubah nilainya (idempoten).
--   4. Turunkan Bayar di bawah Total lagi → status kembali "DP",
--      customer_settled_at kembali kosong.

-- ── 7. Verifikasi bagian B — PERILAKU SUNGGUHAN ─────────────
drop table if exists v0026_behavior;
create temporary table v0026_behavior (check_type text primary key, result text);

-- (A) Tabel bayangan + trigger fungsi PRODUKSI yang SAMA (lihat §6-A).
drop table if exists v0026_payment_shadow;
create temporary table v0026_payment_shadow (
  id                     int primary key,
  customer_total_amount  numeric(15,2),
  customer_paid_amount   numeric(15,2) not null default 0,
  customer_settled_at    timestamptz
);
drop trigger if exists trg_shadow_payment on v0026_payment_shadow;
create trigger trg_shadow_payment before insert or update on v0026_payment_shadow
  for each row execute function public.fn_guard_customer_payment();

begin;
insert into v0026_payment_shadow (id, customer_total_amount, customer_paid_amount)
values (1, 1000000, 0);
insert into v0026_behavior
  select 'SHADOW_T1_UNPAID_NULL', (customer_settled_at is null)::text
  from v0026_payment_shadow where id = 1;

update v0026_payment_shadow set customer_paid_amount = 500000 where id = 1;
insert into v0026_behavior
  select 'SHADOW_T2_DP_NULL', (customer_settled_at is null)::text
  from v0026_payment_shadow where id = 1;

update v0026_payment_shadow set customer_paid_amount = 1000000 where id = 1;
insert into v0026_behavior
  select 'SHADOW_T3_LUNAS_STAMPED', (customer_settled_at is not null)::text
  from v0026_payment_shadow where id = 1;
insert into v0026_behavior
  select 'SHADOW_T3_STAMP_VALUE', customer_settled_at::text
  from v0026_payment_shadow where id = 1;
commit;

select pg_sleep(1);

begin;
-- T4: SAMA sekali tidak mengubah angka pembayaran (masih 1000000/1000000)
-- tapi tetap sebuah UPDATE sungguhan pada baris ini — kalau trigger BUG
-- selalu men-cap now() ulang, transaksi baru ini akan punya now() yang
-- BERBEDA (dibuktikan pg_sleep di atas), dan SHADOW_T4 akan FALSE.
update v0026_payment_shadow set customer_paid_amount = 1000000 where id = 1;
insert into v0026_behavior
  select 'SHADOW_T4_STAMP_UNCHANGED_IDEMPOTENT',
    ((select result from v0026_behavior where check_type = 'SHADOW_T3_STAMP_VALUE')
     = customer_settled_at::text)::text
  from v0026_payment_shadow where id = 1;

update v0026_payment_shadow set customer_paid_amount = 400000 where id = 1;
insert into v0026_behavior
  select 'SHADOW_T5_REVOKED_NULL', (customer_settled_at is null)::text
  from v0026_payment_shadow where id = 1;

update v0026_payment_shadow set customer_total_amount = null where id = 1;
insert into v0026_behavior
  select 'SHADOW_T6_NULL_TOTAL_UNSETTLED', (customer_settled_at is null)::text
  from v0026_payment_shadow where id = 1;

-- Kasus batas yang DISELESAIKAN di §2 "KASUS BATAS total=0": total literal
-- 0 (bukan NULL), paid 0 → trigger SEKARANG men-stamp (syarat `>0` sudah
-- dihapus), sejalan dengan rumus TAMPILAN kanonik yang menghitung ini
-- "LUNAS" lewat cabang paid>=total.
update v0026_payment_shadow set customer_total_amount = 0, customer_paid_amount = 0 where id = 1;
insert into v0026_behavior
  select 'SHADOW_T_ZERO_TOTAL_STAMPED', (customer_settled_at is not null)::text
  from v0026_payment_shadow where id = 1;
commit;

-- (B) CHECK constraint pada partner_orders SUNGGUHAN, lewat "bogus update"
-- yang TIDAK PERNAH ter-commit (lihat §6-B).
do $$
declare
  v_id  uuid;
  v_old numeric;
begin
  select id, customer_paid_amount into v_id, v_old
  from public.partner_orders where status <> 'CANCELLED' limit 1;

  if v_id is null then
    insert into v0026_behavior values
      ('CHECK_PAID_REJECTS_NEGATIVE', 'TIDAK DIUJI: tidak ada baris partner_orders non-CANCELLED untuk diuji');
  else
    begin
      update public.partner_orders set customer_paid_amount = -1 where id = v_id;
      insert into v0026_behavior values ('CHECK_PAID_REJECTS_NEGATIVE', '0 (GAGAL: nilai negatif diterima)');
    exception when check_violation then
      insert into v0026_behavior values ('CHECK_PAID_REJECTS_NEGATIVE', '1');
    end;
  end if;
end;
$$;

do $$
declare
  v_id uuid;
begin
  select id into v_id from public.partner_orders where status <> 'CANCELLED' limit 1;

  if v_id is null then
    insert into v0026_behavior values
      ('CHECK_EXPEDITION_REJECTS_TOOLONG', 'TIDAK DIUJI: tidak ada baris partner_orders non-CANCELLED untuk diuji');
  else
    begin
      update public.partner_orders set expedition = repeat('X', 121) where id = v_id;
      insert into v0026_behavior values ('CHECK_EXPEDITION_REJECTS_TOOLONG', '0 (GAGAL: teks >120 karakter diterima)');
    exception when check_violation then
      insert into v0026_behavior values ('CHECK_EXPEDITION_REJECTS_TOOLONG', '1');
    end;
  end if;
end;
$$;

-- Angka yang diharapkan:
--   SHADOW_T1_UNPAID_NULL                  1   ← total=1jt, paid=0 → BELUM
--   SHADOW_T2_DP_NULL                      1   ← paid=500rb < total → DP
--   SHADOW_T3_LUNAS_STAMPED                1   ← paid=total → di-cap
--   SHADOW_T4_STAMP_UNCHANGED_IDEMPOTENT   1   ← simpan ulang nilai SAMA,
--                                                transaksi BEDA (pg_sleep
--                                                1 detik) → cap TIDAK
--                                                berubah (IDEMPOTEN)
--   SHADOW_T5_REVOKED_NULL                 1   ← paid diturunkan di bawah
--                                                total → cap TERCABUT
--                                                (SELF-REVOKING)
--   SHADOW_T6_NULL_TOTAL_UNSETTLED         1   ← total NULL → tidak pernah
--                                                lunas apa pun paid-nya
--   SHADOW_T_ZERO_TOTAL_STAMPED            1   ← kasus batas total=0,
--                                                DISELESAIKAN di §2 —
--                                                sejalan dengan rumus
--                                                tampilan kanonik
--   CHECK_PAID_REJECTS_NEGATIVE            1   ← atau "TIDAK DIUJI: ..."
--                                                kalau database kosong
--   CHECK_EXPEDITION_REJECTS_TOOLONG       1   ← atau "TIDAK DIUJI: ..."
select check_type, result from v0026_behavior order by check_type;
