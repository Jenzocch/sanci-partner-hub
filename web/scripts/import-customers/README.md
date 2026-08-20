# Impor Pelanggan Lama → `customers`

Mengisi tabel `customers` dari 36 baris data pelanggan lama yang Jenzo kirim
(dari luar sistem — Excel/WhatsApp/ingatan tim sales), owner minta 2026-08-20
("客戶資料也進去") **dengan syarat keras**: pelanggan hasil impor ini **tidak
boleh terlihat cabang mana pun**.

## Yang sudah disiapkan di folder ini

- `customers.json` — 36 baris, field `{name, phone, address, email,
  customer_code, source, sales}`, disalin apa adanya dari data yang
  diverifikasi (lihat "Yang sudah diperiksa" di bawah).
- `run.mjs` — skrip yang menulis semuanya ke Supabase.

## PRASYARAT

Migration `supabase/migrations/0017_customer_code_email.sql` **wajib sudah
dijalankan** di database ini (kolom `customer_code`/`email` harus ada). Kalau
belum, setiap baris akan gagal dengan kode `42703` (kolom tidak dikenal) dan
tercatat di "Detail gagal" pada ringkasan akhir skrip.

## Syarat keras: kenapa pelanggan hasil impor TIDAK terlihat cabang

Setiap baris ditulis dengan `created_via_partner_id = NULL` **dan**
`created_via_branch_id = NULL`, dan skrip ini **tidak pernah** membuat baris
`partner_orders` apa pun untuk pelanggan-pelanggan ini.

Policy baca cabang pada `customers` (`c_partner_read`, migration 0007, **tidak
disentuh** migration 0017 — dibuktikan eksplisit di kepala berkas 0017 §3)
mengizinkan baca kalau salah satu dari tiga syarat ini benar:

1. `fn_is_admin()` — pengguna adalah SANCI Admin.
2. `fn_can_view_branch(created_via_branch_id)` — untuk baris hasil impor,
   `created_via_branch_id` adalah `NULL`, dan `fn_can_view_branch(NULL)` tidak
   pernah cocok dengan cabang mana pun → **selalu false**.
3. `fn_customer_has_visible_order(id)` — benar hanya kalau ADA baris
   `partner_orders` yang menunjuk pelanggan ini di cabang yang terlihat. Skrip
   ini tidak pernah membuat order → **selalu false** (sampai suatu hari ada
   cabang yang benar-benar membuat pesanan baru untuk pelanggan ini lewat
   aplikasi — itu perilaku yang MEMANG diinginkan, bukan celah).

Jadi (2) dan (3) selalu false untuk pelanggan hasil impor, dan (1) hanya benar
untuk SANCI Admin — mekanisme ini **sudah ada** sejak 0004/0007, bukan sesuatu
yang dibangun khusus skrip ini. Dibuktikan lewat test perilaku (bukan cuma
dibaca dari kode): `supabase/test-harness/50_behavior_0017.sql`, kasus T5a/T5b
— baris berbentuk hasil impor (`created_via_*` NULL, tanpa order) terlihat
admin, dan **nol baris** untuk pengguna cabang.

## Yang SENGAJA dilewati

- **2 baris tanpa nomor telepon**: **Ibu Swanny** (customer_code
  `D/26-C/020`) dan **Mina** (customer_code `A/26-M/032`). `customers.phone`
  dan `customers.phone_normalized` **NOT NULL** di skema (migration 0004) —
  tidak ada nomor yang dikarang untuk keduanya, dan skrip mencetak nama
  keduanya secara eksplisit di ringkasan akhir ("Dilewati — tanpa nomor
  telepon") supaya tidak hilang diam-diam.

## Yang sudah diperiksa (dry-run logika, TANPA koneksi database)

Sandbox penyusunan skrip ini **tidak punya kredensial Supabase sungguhan**
(tidak ada `.env.local` berisi project nyata), jadi skrip **tidak bisa
benar-benar dijalankan terhadap database di sini** — verifikasinya terbatas
pada tinjauan kode + simulasi logika murni (Node, tanpa jaringan):

- **34 dari 36 baris** punya telepon yang berhasil dinormalisasi (0 baris
  gagal normalisasi selain 2 yang memang `phone: null`).
- **Catatan berkurung pada telepon** ("087875714156 (Ibu Alin-agent
  properti)", milik Bapak Mahkota) terpisah dengan benar: telepon bersih
  `087875714156` → `phone_normalized` `6287875714156`, catatan "Ibu
  Alin-agent properti" masuk ke `notes` sebagai
  "Catatan telepon: Ibu Alin-agent properti" — TIDAK hilang.
- **Ditemukan 1 duplikat asli di data sumber**: "Ibu Rosemary" muncul DUA
  KALI dengan nomor telepon yang SAMA (`08124692888`) — sekali sebagai
  `A/26-NS/017` (alamat "Osaka Residence, Kosambi (PIK 2)…", sumber "dari Tim
  Komisaris", sales "Nini San") dan sekali lagi sebagai `A/26-NS/028` (alamat
  "To be confirmed", sumber & sales SAMA). Dedup berdasarkan
  `phone_normalized` (§ "Idempoten" di bawah) menyatukan keduanya menjadi
  **SATU** baris pelanggan — baris kedua (`A/26-NS/028`) tidak menambah apa
  pun yang belum ada di baris pertama (`customer_code` sudah terisi, alamat
  sudah terisi, sumber+sales sama persis) sehingga dihitung "sudah lengkap,
  tidak diubah", **bukan bug, bukan data hilang** — ini persis perilaku yang
  diminta (§ "Idempoten"): baris kedua adalah entri yang sama, bukan pelanggan
  baru.
- Hasil simulasi lengkap (bukan tebakan): **33 baris pelanggan BARU dibuat**,
  **1 baris "sudah lengkap"** (Ibu Rosemary kedua, di atas), **2 dilewati
  tanpa telepon** = 33 + 1 + 2 = 36. **Total diproses berhasil (dibuat +
  sudah lengkap) = 34 dari 36** — cocok dengan perkiraan awal.

**Batas jujur**: simulasi di atas menguji fungsi normalisasi/pemisahan
catatan/dedup APA ADANYA, TANPA benar-benar menyentuh Supabase (tidak ada RLS,
tidak ada trigger, tidak ada unique constraint sungguhan yang diuji). Yang
BISA diverifikasi tanpa database: logika normalisasi telepon, pemisahan
catatan berkurung, dan logika dedup/patch murni JavaScript. Yang TIDAK bisa
diverifikasi dari sandbox ini: bahwa Supabase sungguhan menerima payload-nya
(nama kolom, tipe data, RLS sungguhan) — itu hanya bisa dibuktikan dengan
benar-benar menjalankan skrip ini, oleh Jenzo, di komputernya sendiri, dengan
kredensial sungguhan.

## Normalisasi telepon

`normalizePhoneID()` di skrip ini adalah **salinan kata-demi-kata** dari
`web/lib/orders-shared.ts` (bukan versi "mirip" — port murni, karena skrip
`.mjs` lepas ini tidak bisa `import` langsung dari TypeScript aplikasi tanpa
langkah build). Aturannya: buang semua karakter non-digit, `62...` dengan `0`
tambahan setelahnya (`620...`) dibuang satu nol-nya, `0...` → `62...`, `8...`
→ `62...`, selain itu ditolak; panjang akhir harus 10–15 digit. **Kalau fungsi
sumbernya pernah berubah, salinan di sini wajib disamakan lagi secara
manual** — komentar di dalam `run.mjs` mengingatkan ini.

## Cara menjalankan

Jalankan di **komputer sendiri**, bukan di server produksi — skrip ini butuh
kredensial admin sekali pakai.

```bash
cd web
# Pilih SALAH SATU cara login di bawah, lalu:
node scripts/import-customers/run.mjs
```

**Cara A — pakai SUPABASE_SERVICE_ROLE_KEY** (paling gampang, sudah ada di
Vercel → Project Settings → Environment Variables):

```bash
export SUPABASE_SERVICE_ROLE_KEY="tempel-di-sini"
node scripts/import-customers/run.mjs
```

**Cara B — login sebagai akun admin biasa** (tidak butuh service_role sama
sekali, lebih aman untuk skrip sekali-pakai karena hanya mendapat hak yang
sama seperti admin yang login lewat browser):

```bash
export SANCI_ADMIN_EMAIL="email-admin-anda"
export SANCI_ADMIN_PASSWORD="kata-sandi-admin-anda"
node scripts/import-customers/run.mjs
```

Kedua cara butuh `NEXT_PUBLIC_SUPABASE_URL` (dan untuk cara B,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`) — sudah ada di `web/.env.local` kalau sudah
pernah dipakai untuk `npm run dev`.

**JANGAN** tempel kredensial di chat atau commit ke git — hapus/unset variabel
env setelah selesai (`unset SUPABASE_SERVICE_ROLE_KEY`).

## Aman dijalankan ulang (idempoten)

Skrip cari dulu berdasarkan `phone_normalized` sebelum menulis:

- **Ketemu** → HANYA mengisi kolom yang masih KOSONG (`customer_code`,
  `email`, `address`) dan menambah catatan sumber KALAU BELUM ADA di
  `notes` — **tidak pernah menimpa** nilai yang sudah diisi (termasuk kalau
  sudah diedit manusia lewat aplikasi sejak impor pertama).
- **Tidak ketemu** → INSERT baru, dengan `client_request_id =
  "customer-import-<customer_code>"` sebagai lapisan kedua pencegah duplikat
  (kalau SELECT-lalu-INSERT bentrok karena skrip ini dijalankan dua kali
  nyaris bersamaan, unique constraint `customers_client_request_id_key` yang
  memutuskan, bukan pengecekan di sini — LESSONS #3/#21).

Menjalankan skrip ini DUA KALI berturut-turut **tidak akan** membuat baris
duplikat dan **tidak akan** menimpa data yang sudah diedit manusia — jalan
kedua akan melaporkan semuanya "sudah lengkap, tidak ada yang diubah" (kecuali
memang ada kolom kosong yang baru terisi di antara dua jalan).

## Verifikasi setelah selesai

Skrip mencetak ringkasan di akhir (pelanggan baru dibuat / diperbarui / sudah
lengkap / dilewati tanpa telepon, plus daftar nama untuk yang dilewati). Kalau
ada yang gagal, daftarnya dicetak lengkap dengan nama + alasan — skrip TIDAK
berhenti di tengah jalan kalau satu baris gagal, supaya baris lain tidak ikut
batal gara-gara satu baris bermasalah.

Angka yang diharapkan (lihat "Yang sudah diperiksa" di atas untuk kenapa
angkanya persis begini, bukan rata "36"): **pelanggan baru dibuat = 33**,
**diperbarui = 0**, **sudah lengkap = 1** (duplikat asli "Ibu Rosemary" di
data sumber — lihat penjelasan di atas), **dilewati tanpa telepon = 2**
("Ibu Swanny", "Mina"). Total diproses berhasil = 34 dari 36.

Setelah selesai jalankan di Supabase SQL Editor untuk memastikan angkanya
cocok:

```sql
-- Jumlah pelanggan hasil impor batch ini (client_request_id berpola
-- 'customer-import-%'). Harapan: 33 (satu "Ibu Rosemary" TIDAK menghasilkan
-- baris tersendiri — dedup by phone_normalized menyatukannya).
select count(*) as total_dibuat_batch_ini
from public.customers
where client_request_id like 'customer-import-%';

-- Berapa banyak di antaranya benar-benar invisible ke cabang (syarat keras
-- owner) — created_via_partner_id NULL berarti TIDAK ADA satu pun policy
-- cabang yang bisa bernilai benar untuk baris ini (lihat penjelasan mekanisme
-- di atas; SQL Editor jalan sebagai superuser jadi TIDAK bisa dipakai untuk
-- benar-benar mensimulasikan sesi login cabang — pengujian RLS yang
-- sesungguhnya sudah dilakukan lewat supabase/test-harness/50_behavior_
-- 0017.sql, bukan lewat query ini). Harapan: sama dengan total_dibuat_batch_ini.
select count(*) as invisible_ke_cabang
from public.customers
where client_request_id like 'customer-import-%'
  and created_via_partner_id is null
  and created_via_branch_id is null;

-- Spot-check: lihat beberapa baris untuk memastikan kolom terisi masuk akal.
select full_name, phone, phone_normalized, customer_code, email, address, notes
from public.customers
where client_request_id like 'customer-import-%'
order by full_name
limit 10;
```
