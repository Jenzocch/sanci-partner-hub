# Impor Master Data → Katalog Produk SANCI

Mengisi `sanci_products` (Admin → Produk) dari dua berkas Excel yang dikirim
Jenzo: `Master_data.xlsx` (104 produk) + `Master_Data2.xlsx` (65 produk) = **169
produk**, lengkap dengan foto.

## Yang sudah disiapkan di folder ini

- `products.json` — 169 baris, sudah dipetakan ke kolom `sanci_products`:
  `name`, `code`, `category`, `description`, `stock_status`.
- `images/` — 169 foto, sudah dikompres persis seperti unggahan biasa lewat
  Admin → Produk (preset PRODUK: sisi terpanjang 1280px, WebP mutu 0.82, dari
  total 46 MB sumber menjadi ±4.6 MB).
- `run.mjs` — skrip yang menulis semuanya ke Supabase.

## Yang SENGAJA tidak ikut

- **Harga** (kolom PRICE/UNIT, HARGA LAMA di Excel) — katalog SANCI sengaja
  TANPA HARGA SAMA SEKALI (migration 0010, keputusan owner 2026-08-17).
  Penawaran harga tetap manual lewat SANCI.
- Kolom internal produksi Mandarin (材料/硬度/生产要求/包装规格) — itu untuk
  pabrik, bukan untuk cabang.

## Status stok

Kolom "Stock di Easy" di Excel dipetakan: **0 → Habis (OUT_OF_STOCK)**,
selain itu → **Tersedia (AVAILABLE)**. Excel tidak punya kategori "Terbatas",
jadi tidak ada baris yang diimpor sebagai LIMITED — silakan sesuaikan manual
lewat Admin → Produk untuk barang yang stoknya menipis.

## Kategori yang dirapikan

File kedua menulis "Mattress"/"Pillow" (tanpa awalan), file pertama menulis
"SANCI Mattress"/"SANCI Pillow". Disatukan ke bentuk file pertama supaya
filter kategori di halaman katalog cabang (`produk-list-client.tsx`, yang
mengelompokkan berdasarkan kecocokan string persis) tidak pecah jadi dua
grup untuk barang yang sama.

## Cara menjalankan

Jalankan di **komputer sendiri**, bukan di server produksi — skrip ini butuh
kredensial admin sekali pakai.

```bash
cd web
# Pilih SALAH SATU cara login di bawah, lalu:
node scripts/import-master-data/run.mjs
```

**Cara A — pakai SUPABASE_SERVICE_ROLE_KEY** (paling gampang, sudah ada di
Vercel → Project Settings → Environment Variables dari fitur akun cabang):

```bash
export SUPABASE_SERVICE_ROLE_KEY="tempel-di-sini"
node scripts/import-master-data/run.mjs
```

**Cara B — login sebagai akun admin biasa** (tidak butuh service_role sama
sekali, lebih aman untuk skrip sekali-pakai karena hanya mendapat hak yang
sama seperti admin yang login lewat browser):

```bash
export SANCI_ADMIN_EMAIL="email-admin-anda"
export SANCI_ADMIN_PASSWORD="kata-sandi-admin-anda"
node scripts/import-master-data/run.mjs
```

Kedua cara butuh `NEXT_PUBLIC_SUPABASE_URL` (dan untuk cara B,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`) — sudah ada di `web/.env.local` kalau sudah
pernah dipakai untuk `npm run dev`.

**JANGAN** tempel kredensial di chat atau commit ke git — hapus/unset variabel
env setelah selesai (`unset SUPABASE_SERVICE_ROLE_KEY`).

## Menjalankan ulang — BACA INI DULU (aturan berubah 2026-08-24)

**Mode bawaan sekarang hanya MENAMBAH produk yang belum ada.** Baris yang
sudah ada dilewati sepenuhnya — data maupun fotonya TIDAK disentuh.

Kenapa: 2026-08-22 owner mengganti foto 15 produk lewat Admin → Produk;
2026-08-24 skrip ini dijalankan ulang (untuk memperbarui header cache) dan
MENIMPA semua foto itu dengan gambar Excel asli — hilang permanen, harus
diunggah ulang manual. "Idempotent" hanya berarti "tidak membuat duplikat",
BUKAN "tidak merusak suntingan manual".

Untuk sengaja menimpa semuanya (perilaku lama): `node run.mjs --timpa` —
skrip menunggu 8 detik dengan peringatan sebelum mulai. Sebelum memakainya,
periksa dulu suntingan manual sejak impor:

```sql
select distinct after->>'name', after->>'code' from audit_logs
where entity_type='sanci_products' and action='PRODUCT_UPDATED'
order by 1;
```

## Verifikasi setelah selesai

Skrip mencetak ringkasan di akhir (`Produk baru dibuat`, `Produk diperbarui`,
`Foto berhasil`, `Foto gagal`). Kalau ada yang gagal, daftarnya dicetak
lengkap dengan kode produk + alasan — skrip TIDAK berhenti di tengah jalan
kalau satu baris gagal, supaya 168 produk lain tidak ikut batal gara-gara
satu baris bermasalah.

Setelah selesai jalankan di Supabase SQL Editor untuk memastikan angkanya
cocok:

```sql
select count(*) as total,
       count(*) filter (where photo_url is not null) as ada_foto,
       count(*) filter (where stock_status = 'OUT_OF_STOCK') as habis
from public.sanci_products
where client_request_id like 'xlsx-import-%'
   or code in (select code from (values ('WMRC611-180'),('CE-SF7001')) v(code));
```

Angka yang diharapkan: `total = 169`, `ada_foto = 169`, `habis = 56`.
