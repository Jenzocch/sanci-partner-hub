#!/usr/bin/env bash
# Mengambil cadangan basis data Supabase. HANYA MEMBACA — tidak pernah
# menulis apa pun ke server sumber. Dipanggil .github/workflows/backup.yml.
#
# Kenapa hanya skema `public`: itu tempat SELURUH data aplikasi (lihat
# supabase/migrations/). Skema `auth`/`storage` milik Supabase dan dibuat
# ulang oleh platform saat proyek baru dibuat — men-dump-nya utuh justru
# menghasilkan berkas yang tidak bisa dipulihkan ke proyek lain. Yang tetap
# diambil dari `auth` cuma DAFTAR akun (tanpa hash kata sandi) supaya saat
# pemulihan kita tahu akun apa saja yang harus dibuat ulang.
set -euo pipefail

: "${DB_URL:?SUPABASE_DB_URL kosong}"
OUT="out/db"
mkdir -p "$OUT"
STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "→ pg_dump (format custom, skema public)"
pg_dump "$DB_URL" \
  --format=custom \
  --schema=public \
  --no-owner --no-privileges \
  --file="$OUT/full.dump"

echo "→ pg_dump (struktur saja, teks — untuk dibaca manusia)"
pg_dump "$DB_URL" \
  --schema-only \
  --schema=public \
  --no-owner --no-privileges \
  --file="$OUT/schema.sql"

# Daftar akun. Kalau peran yang dipakai tidak boleh membaca auth.users, ini
# TIDAK boleh menggagalkan cadangan basis datanya — tapi juga tidak boleh
# diam-diam menghasilkan berkas kosong yang terlihat seperti data (LESSONS
# #10): kegagalannya ditulis apa adanya ke dalam berkasnya.
echo "→ daftar akun (tanpa kata sandi)"
if ! psql "$DB_URL" --no-psqlrc --quiet \
  -c "\copy (select id, email, created_at, last_sign_in_at from auth.users order by created_at) to '$OUT/auth-users.csv' with (format csv, header true)" 2>"$OUT/auth-users.err"; then
  echo "TIDAK TERAMBIL: $(tr '\n' ' ' < "$OUT/auth-users.err")" > "$OUT/auth-users.csv"
fi
rm -f "$OUT/auth-users.err"

echo "→ menghitung baris per tabel (dipakai untuk verifikasi restore)"
psql "$DB_URL" --no-psqlrc --quiet --tuples-only --no-align \
  -c "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name" \
  > "$OUT/tables.txt"

: > "$OUT/counts-source.txt"
while read -r t; do
  [ -z "$t" ] && continue
  n=$(psql "$DB_URL" --no-psqlrc --quiet --tuples-only --no-align -c "select count(*) from public.\"$t\"")
  printf '%s\t%s\n' "$t" "$n" >> "$OUT/counts-source.txt"
done < "$OUT/tables.txt"

{
  echo "# Cadangan SANCI Partner Hub"
  echo "Waktu (UTC)      : $STAMP"
  echo "pg_dump          : $(pg_dump --version)"
  echo "Server           : $(psql "$DB_URL" --no-psqlrc --quiet --tuples-only --no-align -c 'select version()' | cut -c1-60)"
  echo "Ukuran full.dump : $(du -h "$OUT/full.dump" | cut -f1)"
  echo "Jumlah tabel     : $(grep -c . "$OUT/tables.txt")"
  echo
  echo "## Jumlah baris di SUMBER"
  cat "$OUT/counts-source.txt"
} > "$OUT/MANIFEST.txt"

cat "$OUT/MANIFEST.txt"
