# Cadangan & Pemulihan

> Status paket Supabase: **Free** (dicek di Dashboard 2026-09-04 — "Free Plan
> does not include project backups"). Artinya Supabase **tidak menyimpan
> cadangan apa pun** untuk proyek ini. Alur kerja di bawah adalah satu-satunya
> cadangan yang ada sampai proyeknya naik ke Pro.

## Apa yang berjalan

`.github/workflows/backup.yml` — GitHub Actions, dua pekerjaan:

| Kapan | Isi | Disimpan |
|---|---|---|
| Setiap hari 02:10 WIB | Basis data: `full.dump` (struktur + SELURUH data skema `public`), `schema.sql`, `auth-users.csv`, `MANIFEST.txt` | artifact 90 hari |
| Setiap Minggu (atau saat dijalankan manual) | Berkas Storage: `product-photos`, `partner-logos`, `order-invoices` | artifact 90 hari |

Menjalankan sekarang juga: repo → **Actions** → **Backup** → **Run workflow**.

Setiap cadangan **diverifikasi di alur kerja yang sama**: dump-nya dipulihkan
ke Postgres 17 kosong, lalu jumlah baris tiap tabel dibandingkan dengan
sumbernya. Kalau satu angka berbeda, atau `pg_restore` melaporkan galat di
luar galat "schema public sudah ada" yang memang selalu terjadi, alur kerjanya
**GAGAL** dan GitHub mengirim surel. Cadangan yang lolos punya baris
"Verifikasi" di `MANIFEST.txt`, lengkap dengan jumlah view/policy/fungsi/index
yang ikut pulih. Cadangan tanpa baris itu belum tentu utuh.

## Yang TIDAK ikut tercadangkan

Jangan sampai dikira ikut:

- **Kata sandi pengguna.** `auth-users.csv` hanya berisi id, surel, dan waktu
  akun — bukan hash kata sandinya. Setelah pemulihan, akun dibuat ulang lewat
  Dashboard dan setiap orang menetapkan kata sandi baru.
- **Pengaturan proyek di Dashboard**: secret Edge Function, konfigurasi Auth
  (penyedia, templat surel), kebijakan bucket.
- **Point-in-time recovery.** Tidak ada riwayat WAL di paket Free — yang bisa
  dikembalikan hanyalah keadaan pada saat cadangan harian diambil. Kehilangan
  data paling lama satu hari kerja adalah risiko yang diterima sampai naik Pro.

## Cara memulihkan

1. Unduh artifact `db-<run id>` dari halaman Actions run yang mau dipakai.
   Periksa `MANIFEST.txt` lebih dulu: tanggalnya dan baris "Verifikasi".
2. Siapkan sasarannya (proyek Supabase baru, atau yang lama setelah `drop
   schema public cascade`).
3. Jalankan migrasi? **Tidak.** `full.dump` sudah membawa struktur lengkapnya.
   Jalankan langsung:

   ```
   pg_restore --dbname="<connection string>" --no-owner --no-privileges full.dump
   ```

   Galat `schema "public" already exists` normal dan boleh diabaikan; galat
   lain tidak.
4. Buat ulang akun sesuai `auth-users.csv` (Dashboard → Authentication →
   Users). Kolom `id` di berkas itu penting: `platform_admins.auth_user_id`
   dan `partner_users.auth_user_id` menunjuk ke sana, jadi setelah akunnya
   dibuat, samakan id-nya atau perbarui kedua tabel itu.
5. Unggah kembali isi bucket dari artifact `storage-<run id>` (Dashboard →
   Storage, atau API) dengan nama berkas yang sama persis — kolom foto di
   basis data menyimpan nama itu.
6. Pasang ulang variabel lingkungan di Vercel kalau URL/kunci proyeknya
   berganti.

## Secret yang dipakai

Repo → Settings → Secrets and variables → Actions:

| Nama | Isi | Dipakai untuk |
|---|---|---|
| `SUPABASE_DB_URL` | connection string **Session pooler** dengan kata sandi basis data | `pg_dump` |

| `SUPABASE_SERVICE_ROLE_KEY` | service_role key | mengunduh isi bucket |
| `SUPABASE_URL` | *opsional* — hanya kalau URL proyek tidak bisa diturunkan dari `SUPABASE_DB_URL` | Storage API |

### Bentuk `SUPABASE_DB_URL` yang benar

Salin dari Dashboard → **Connect** → **Session pooler**. Nama penggunanya
**`postgres.<project-ref>`**, bukan `postgres` saja:

```
postgresql://postgres.abcdefghijklmnop:KATASANDI@aws-0-<region>.pooler.supabase.com:5432/postgres
```

Pooler (Supavisor) memakai `.<project-ref>` untuk memilih tenant lalu
menyambung ke basis data sebagai pengguna `postgres`. Karena itu pesan
galatnya SELALU menyebut user `"postgres"` — untuk dua sebab yang berbeda:

| Pesan server | Artinya sebenarnya |
|---|---|
| `Tenant or user not found` | nama penggunanya salah (kurang `.<project-ref>`) |
| `password authentication failed for user "postgres"` | nama pengguna **sudah benar**, **kata sandinya** yang salah |

Alur kerjanya menguji sambungan lebih dulu dan menuliskan terjemahan itu,
supaya tidak ada yang memperbaiki bagian yang sudah benar. Kata sandi basis
data bukan kata sandi akun Supabase; kalau lupa, setel ulang di Dashboard →
Settings → Database → **Reset database password**.

Alur kerjanya kini memeriksa kedua hal itu lebih dulu dan menjelaskannya
dengan kalimat yang benar. Kalau kata sandi memuat karakter `@ : / ? # &`,
karakter itu harus di-*percent-encode* (mis. `@` → `%40`) — atau ganti kata
sandinya di Dashboard → Settings → Database → Reset database password dengan
yang tanpa karakter itu.

Ketiganya hanya dibaca oleh GitHub Actions. Kunci `service_role` **tidak
pernah** masuk ke kode frontend (lihat `docs/SECURITY_AUDIT.md`).

## Yang harus dilakukan sebelum mulai menerima pesanan sungguhan

Naik ke paket **Pro**. Bukan karena cadangan ini kurang — melainkan karena di
paket Free proyek yang tidak dipakai 7 hari akan **dijeda**, batas basis data
500 MB, dan tidak ada point-in-time recovery. Cadangan harian ini tetap
berguna sesudahnya sebagai salinan kedua di luar Supabase.
