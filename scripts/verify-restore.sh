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
  esac
  psql "$VERIFY_URL" --no-psqlrc --quiet --tuples-only --no-align -c "$q"
}

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
    echo "Objek lain yang ikut pulih: $(count_obj view) view, $(count_obj policy) policy RLS, $(count_obj func) fungsi, $(count_obj idx) index"
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
