#!/usr/bin/env bash
# MEMBUKTIKAN cadangan tadi bisa dipulihkan: memulihkannya ke Postgres kosong
# lalu membandingkan jumlah baris tiap tabel dengan sumbernya. Kalau satu
# angka saja berbeda, alur kerja GAGAL — lebih baik tahu hari ini daripada
# pada hari data sungguhan hilang (LESSONS #7: pesan sukses bukan bukti).
set -euo pipefail

: "${VERIFY_URL:?VERIFY_URL kosong}"
OUT="out/db"

# Baris itu bukan satu-satunya isi basis data: view, policy RLS, fungsi, dan
# index juga harus ikut pulih. Angkanya dicatat ke manifes supaya "nol policy"
# tidak pernah lewat begitu saja sebagai cadangan yang tampak sehat.
count_obj() {
  case "$1" in
    view)   q="select count(*) from pg_views where schemaname='public'" ;;
    policy) q="select count(*) from pg_policies where schemaname='public'" ;;
    func)   q="select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'" ;;
    idx)    q="select count(*) from pg_indexes where schemaname='public'" ;;
    fkauth) q="select count(*) from pg_constraint where contype='f' and confrelid='auth.users'::regclass" ;;
  esac
  psql "$VERIFY_URL" --no-psqlrc --quiet --tuples-only --no-align -c "$q"
}

# Skema `public` TIDAK berdiri sendiri: ia menunjuk ke skema `auth` milik
# Supabase — kunci asing ke auth.users, dan policy RLS yang memanggil
# auth.uid(). Postgres polos tidak punya keduanya, jadi pemulihannya gagal
# dengan `schema "auth" does not exist` (run 7, 2026-09-04).
#
# Yang berbahaya bukan galatnya, melainkan bentuk kegagalannya: jumlah BARIS
# tetap cocok sempurna sementara SELURUH kunci asing dan policy RLS hilang.
# Diukur pada Postgres sungguhan: tanpa persiapan ini 0 policy dan 0 kunci
# asing ikut pulih, tetapi kedua tabel tetap melaporkan jumlah baris yang
# benar. Cadangan yang lulus dengan cara itu adalah cadangan palsu.
#
# Proyek Supabase yang baru SUDAH menyediakan skema auth, jadi pemulihan
# sungguhan tidak butuh langkah ini. Ini membuat lingkungan verifikasinya
# menyerupai sasaran pemulihan yang sebenarnya — bukan melonggarkan ujiannya.
echo "→ menyiapkan pengganti skema auth milik Supabase"
psql "$VERIFY_URL" --no-psqlrc --quiet -v ON_ERROR_STOP=1 <<'SQL'
create schema if not exists auth;
create table if not exists auth.users (
  id               uuid primary key,
  email            text,
  created_at       timestamptz,
  last_sign_in_at  timestamptz
);
create or replace function auth.uid()  returns uuid  language sql stable as $fn$ select null::uuid  $fn$;
create or replace function auth.role() returns text  language sql stable as $fn$ select null::text  $fn$;
create or replace function auth.jwt()  returns jsonb language sql stable as $fn$ select null::jsonb $fn$;
SQL

# Kunci asing ke auth.users diperiksa terhadap BARIS yang benar-benar ada,
# jadi daftar akun hasil cadangan harus dimuat lebih dulu. Kalau tidak,
# pg_restore menolak kunci asingnya — dan itu memang harus menggagalkan
# verifikasi, bukan didiamkan (diuji: auth.users kosong -> pg_restore
# melaporkan pelanggaran kunci asing dan verifikasinya berhenti).
if head -n 1 "$OUT/auth-users.csv" 2>/dev/null | grep -q '^id,email'; then
  psql "$VERIFY_URL" --no-psqlrc --quiet -v ON_ERROR_STOP=1 \
    -c "\copy auth.users(id,email,created_at,last_sign_in_at) from '$OUT/auth-users.csv' with (format csv, header true, null '')"
  echo "   $(psql "$VERIFY_URL" --no-psqlrc --quiet --tuples-only --no-align -c 'select count(*) from auth.users') akun dimuat dari cadangan"
else
  echo "::warning::auth-users.csv tidak memuat daftar akun, jadi kunci asing ke auth.users tidak bisa diverifikasi. Lihat isi berkas itu untuk alasannya."
fi

echo "→ pg_restore ke basis data kosong"
# TIDAK memakai --exit-on-error: setiap basis data Postgres baru SUDAH punya
# skema `public`, sedangkan dump-nya membawa `CREATE SCHEMA public` sendiri —
# satu galat yang memang selalu terjadi dan memang tidak berarti apa-apa.
# Membiarkan --exit-on-error di sini akan menggagalkan verifikasi setiap hari
# karena hal yang benar (terbukti saat skrip ini diuji ke Postgres sungguhan
# 2026-09-04). Tapi galat itu juga tidak boleh dipakai sebagai alasan
# mengabaikan galat LAIN: stderr disaring dari baris yang memang tak berarti,
# dan kalau masih ada sisa, verifikasinya GAGAL.
set +e
pg_restore --dbname="$VERIFY_URL" --no-owner --no-privileges "$OUT/full.dump" 2> "$OUT/restore.err"
set -e
grep -v -e 'schema "public" already exists' \
        -e 'Command was: CREATE SCHEMA public;' \
        -e '^ *$' \
        -e 'warning: errors ignored on restore: [0-9]*$' \
        "$OUT/restore.err" > "$OUT/restore-unexpected.err" || true
if [ -s "$OUT/restore-unexpected.err" ]; then
  echo "::error::pg_restore melaporkan galat yang tidak diperkirakan."
  cat "$OUT/restore-unexpected.err"
  {
    echo
    echo "## Verifikasi"
    echo "GAGAL — galat pg_restore:"
    cat "$OUT/restore-unexpected.err"
  } >> "$OUT/MANIFEST.txt"
  exit 1
fi
rm -f "$OUT/restore.err" "$OUT/restore-unexpected.err"

: > "$OUT/counts-restored.txt"
while read -r t; do
  [ -z "$t" ] && continue
  n=$(psql "$VERIFY_URL" --no-psqlrc --quiet --tuples-only --no-align -c "select count(*) from public.\"$t\"")
  printf '%s\t%s\n' "$t" "$n" >> "$OUT/counts-restored.txt"
done < "$OUT/tables.txt"

echo "→ membandingkan sumber vs hasil pemulihan"
if diff -u "$OUT/counts-source.txt" "$OUT/counts-restored.txt" > "$OUT/counts-diff.txt"; then
  {
    echo
    echo "## Verifikasi"
    echo "pg_restore ke Postgres kosong: BERHASIL"
    echo "Jumlah baris sumber vs hasil pemulihan: SAMA untuk $(grep -c . "$OUT/tables.txt") tabel"
    echo "Objek lain yang ikut pulih: $(count_obj view) view, $(count_obj policy) policy RLS, $(count_obj func) fungsi, $(count_obj idx) index, $(count_obj fkauth) kunci asing ke auth.users"
  } >> "$OUT/MANIFEST.txt"
  rm -f "$OUT/counts-diff.txt"
  echo "OK — semua jumlah baris cocok."
else
  {
    echo
    echo "## Verifikasi"
    echo "GAGAL — jumlah baris berbeda:"
    cat "$OUT/counts-diff.txt"
  } >> "$OUT/MANIFEST.txt"
  echo "::error::Cadangan tidak lolos verifikasi — jumlah baris berbeda setelah dipulihkan."
  cat "$OUT/counts-diff.txt"
  exit 1
fi
