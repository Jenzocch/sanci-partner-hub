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
export API="$SUPABASE_URL/storage/v1"
AUTH=(-H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY")
# Run 6 (2026-09-04) berhenti di tengah unduhan: Supabase menjawab 502 satu
# kali, `curl --fail` keluar dengan kode 22, dan `set -e` membatalkan SELURUH
# cadangan Storage yang sudah berjalan 1,5 menit. Ratusan berkas diunduh satu
# per satu, jadi satu gangguan sesaat tidak boleh menggagalkan semuanya.
# curl mengulang sendiri untuk galat sementara (408/429/500/502/503/504 dan
# timeout) begitu --retry diberikan.
RETRY=(--retry 5 --retry-delay 2 --retry-max-time 120 --connect-timeout 30)

BUCKETS=$(curl -sS --fail "${RETRY[@]}" "${AUTH[@]}" "$API/bucket" | python3 -c 'import sys,json; [print(b["name"]) for b in json.load(sys.stdin)]')
echo "→ bucket ditemukan: $(echo "$BUCKETS" | tr "\n" " ")"

# Menelusuri satu bucket SAMPAI KE DALAM FOLDER, lalu menuliskan setiap
# kunci berkas ke $KEYS_FILE dan mencetak jumlah foldernya.
#
# KENAPA BEGINI: `object/list` hanya mengembalikan SATU tingkat. Berkas punya
# "id", folder "id"-nya null. Versi pertama skrip ini menyaring folder lalu
# berhenti di situ — jadi setiap berkas yang tersimpan sebagai
# `product-photos/<order-id>/foto.jpg` TIDAK PERNAH ikut tercadang, dan alur
# kerjanya tetap hijau sambil melaporkan "0 berkas" (run 3 pada 2026-09-04).
# Cadangan yang diam-diam kosong lebih berbahaya daripada cadangan yang gagal.
walk_bucket() {
  BUCKET="$1" python3 - <<'PY'
import json, os, time, urllib.request

api, bucket = os.environ["API"], os.environ["BUCKET"]
key = os.environ["SERVICE_ROLE_KEY"]

def page(prefix, offset):
    body = json.dumps({"prefix": prefix, "limit": 1000, "offset": offset,
                       "sortBy": {"column": "name", "order": "asc"}}).encode()
    req = urllib.request.Request(f"{api}/object/list/{bucket}", data=body,
                                 headers={"apikey": key,
                                          "Authorization": "Bearer " + key,
                                          "Content-Type": "application/json"})
    # Sama seperti curl di atas: 502 sesaat tidak boleh menggagalkan
    # penelusuran yang sudah berjalan.
    for percobaan in range(5):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)
        except Exception:
            if percobaan == 4:
                raise
            time.sleep(2 * (percobaan + 1))

pending, seen, files, folders = [""], {""}, [], 0
while pending:
    prefix = pending.pop()
    offset = 0
    while True:
        entries = page(prefix, offset)
        if not entries:
            break
        for e in entries:
            name = prefix + e["name"]
            if e.get("id"):
                # Penanda internal Supabase untuk folder kosong, bukan berkas
                # milik pengguna.
                if not name.endswith(".emptyFolderPlaceholder"):
                    files.append(name)
            elif name + "/" not in seen:
                seen.add(name + "/")
                folders += 1
                pending.append(name + "/")
        if len(entries) < 1000:
            break
        offset += 1000

with open(os.environ["KEYS_FILE"], "w") as f:
    for k in files:
        f.write(k + "\n")
print(folders)
PY
}

TOTAL=0
TOTAL_FOLDERS=0
KEYS_FILE="$(mktemp)"
export KEYS_FILE
trap 'rm -f "$KEYS_FILE"' EXIT
: > "$OUT/MANIFEST.txt"
for b in $BUCKETS; do
  folders=$(walk_bucket "$b")
  n=0
  while IFS= read -r key; do
    [ -z "$key" ] && continue
    mkdir -p "$OUT/$b/$(dirname "$key")"
    curl -sS --fail "${RETRY[@]}" "${AUTH[@]}" -o "$OUT/$b/$key" "$API/object/$b/$key"
    n=$((n + 1))
  done < "$KEYS_FILE"
  echo "$b: $n berkas ($folders folder)" >> "$OUT/MANIFEST.txt"
  echo "   $b: $n berkas ($folders folder)"
  TOTAL=$((TOTAL + n))
  TOTAL_FOLDERS=$((TOTAL_FOLDERS + folders))
done

echo "Total: $TOTAL berkas ($(du -sh "$OUT" | cut -f1))" >> "$OUT/MANIFEST.txt"
cat "$OUT/MANIFEST.txt"

# Nol berkas BUKAN kesalahan kalau buckets-nya memang masih kosong (proyek
# baru). Tapi nol berkas TIDAK BOLEH lewat diam-diam seperti keberhasilan —
# itu persis bentuk cadangan palsu yang kita hindari. Kalau ada folder tapi
# tidak ada satu pun berkas, itu tanda penelusurannya yang rusak, bukan
# bucket yang kosong: hentikan alur kerjanya.
if [ "$TOTAL" -eq 0 ]; then
  if [ "$TOTAL_FOLDERS" -gt 0 ]; then
    echo "::error::Ada $TOTAL_FOLDERS folder di Storage tetapi NOL berkas terunduh — penelusuran bucket rusak, bukan bucket yang kosong."
    exit 1
  fi
  echo "::warning::Storage benar-benar kosong: nol berkas di seluruh bucket. Cadangan ini TIDAK berisi foto/invoice apa pun. Kalau seharusnya ada berkas, periksa nama bucket dan izin service_role."
fi
