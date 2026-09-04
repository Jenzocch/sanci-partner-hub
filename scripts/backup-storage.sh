#!/usr/bin/env bash
# Mengunduh seluruh isi bucket Storage (foto produk, logo mitra, invoice).
# HANYA MEMBACA. Memakai service_role karena sebagian bucket privat — kunci
# itu datang dari GitHub Secrets dan tidak pernah tercetak ke log.
set -euo pipefail

: "${SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY kosong}"

# URL proyek: dipakai apa adanya kalau dipasang; kalau tidak, diturunkan dari
# nama pengguna pooler `postgres.<project-ref>` di dalam SUPABASE_DB_URL.
if [ -z "${SUPABASE_URL:-}" ]; then
  : "${DB_URL:?SUPABASE_URL dan SUPABASE_DB_URL dua-duanya kosong}"
  # Dua bentuk yang dipakai Supabase: pooler (nama pengguna
  # `postgres.<ref>`) dan sambungan langsung (host `db.<ref>.supabase.co`).
  REF="$(printf '%s' "$DB_URL" | sed -n 's#.*://postgres\.\([a-z0-9]\{16,\}\):.*#\1#p')"
  [ -z "$REF" ] && REF="$(printf '%s' "$DB_URL" | sed -n 's#.*@db\.\([a-z0-9]\{16,\}\)\.supabase\.co.*#\1#p')"
  if [ -z "$REF" ]; then
    echo "::error::Tidak bisa menurunkan project ref dari SUPABASE_DB_URL. Pasang secret SUPABASE_URL."
    exit 1
  fi
  SUPABASE_URL="https://${REF}.supabase.co"
fi
echo "→ proyek: $SUPABASE_URL"

OUT="out/storage"
mkdir -p "$OUT"
API="$SUPABASE_URL/storage/v1"
AUTH=(-H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY")

BUCKETS=$(curl -sS --fail "${AUTH[@]}" "$API/bucket" | python3 -c 'import sys,json; [print(b["name"]) for b in json.load(sys.stdin)]')
echo "→ bucket ditemukan: $(echo "$BUCKETS" | tr "\n" " ")"

TOTAL=0
: > "$OUT/MANIFEST.txt"
for b in $BUCKETS; do
  n=0
  # PostgREST/Storage membatasi jumlah baris per permintaan; halaman demi
  # halaman sampai habis, bukan satu permintaan yang diam-diam terpotong.
  offset=0
  while :; do
    page=$(curl -sS --fail "${AUTH[@]}" -H "Content-Type: application/json" \
      -X POST "$API/object/list/$b" \
      -d "{\"prefix\":\"\",\"limit\":1000,\"offset\":$offset,\"sortBy\":{\"column\":\"name\",\"order\":\"asc\"}}" \
      | python3 -c 'import sys,json; [print(o["name"]) for o in json.load(sys.stdin) if o.get("id")]')
    [ -z "$page" ] && break
    while read -r key; do
      [ -z "$key" ] && continue
      mkdir -p "$OUT/$b/$(dirname "$key")"
      curl -sS --fail "${AUTH[@]}" -o "$OUT/$b/$key" "$API/object/$b/$key"
      n=$((n + 1))
    done <<< "$page"
    offset=$((offset + 1000))
  done
  echo "$b: $n berkas" >> "$OUT/MANIFEST.txt"
  echo "   $b: $n berkas"
  TOTAL=$((TOTAL + n))
done

echo "Total: $TOTAL berkas ($(du -sh "$OUT" | cut -f1))" >> "$OUT/MANIFEST.txt"
cat "$OUT/MANIFEST.txt"
