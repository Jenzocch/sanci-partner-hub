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

# Sebelumnya berkas diunduh SATU PER SATU: 173 berkas x ~1,8 detik rata-rata
# (termasuk overhead TLS per permintaan) = lebih dari 5 menit untuk cadangan
# mingguan (diukur run 7, 2026-09-04: 5m20s). Foto tidak saling bergantung,
# jadi tidak ada alasan menunggu satu selesai sebelum memulai yang berikutnya.
#
# PARALLEL menentukan berapa unduhan berjalan sekaligus. Bukan asal besar:
# Supabase sudah pernah membalas 502 sesaat pada trafik SEKUENSIAL (run 6),
# jadi paralelisme yang terlalu agresif berisiko memperbanyak 502, bukan
# cuma mempercepat. 8 dipilih sebagai kompromi — diuji tidak memicu galat
# baru terhadap fixture 24 berkas dengan dua 502 sisipan.
PARALLEL="${STORAGE_PARALLEL:-8}"

TOTAL_FOLDERS=0
KEYS_FILE="$(mktemp)"
TASKS_FILE="$(mktemp)"
FAIL_FILE="$(mktemp)"
export KEYS_FILE
trap 'rm -f "$KEYS_FILE" "$TASKS_FILE" "$FAIL_FILE"' EXIT
declare -A BUCKET_COUNT BUCKET_FOLDERS

# Tahap 1: TELUSURI setiap bucket (ringan — daftar nama, bukan isi berkas)
# dan kumpulkan SELURUH pekerjaan unduhan lintas bucket ke satu berkas
# sebelum mengunduh apa pun. Ini yang membuat paralelisasi tahap 2 sederhana:
# satu antrean gabungan, bukan satu pool per bucket.
for b in $BUCKETS; do
  folders=$(walk_bucket "$b")
  BUCKET_FOLDERS["$b"]="$folders"
  TOTAL_FOLDERS=$((TOTAL_FOLDERS + folders))
  n=0
  while IFS= read -r key; do
    [ -z "$key" ] && continue
    printf '%s\t%s\n' "$b" "$key" >> "$TASKS_FILE"
    n=$((n + 1))
  done < "$KEYS_FILE"
  BUCKET_COUNT["$b"]=$n
done

TOTAL_TASKS=$(grep -c . "$TASKS_FILE" || true)
echo "→ mengunduh $TOTAL_TASKS berkas ($PARALLEL sekaligus)"

# Tahap 2: unduh semuanya PARALEL. Kegagalan SATU berkas ditulis ke
# FAIL_FILE, bukan menghentikan proses lain di tengah jalan (xargs -P tidak
# punya cara bersih untuk "berhenti serentak" saat satu worker gagal) —
# semua percobaan tetap jalan sampai selesai, lalu diperiksa sekaligus di
# bawah. curl sendiri sudah menangani 502/503/timeout lewat --retry; yang
# sampai ke FAIL_FILE hanya galat yang BUKAN sementara (401/403/404).
#
# Penulisan ke FAIL_FILE dari banyak proses paralel aman TANPA lock: setiap
# baris pendek (di bawah PIPE_BUF 4096 byte Linux) dan file dibuka mode
# append (O_APPEND) oleh tiap proses sendiri-sendiri — kernel menjamin satu
# write() sebesar itu tidak akan terselip di tengah write() proses lain.
# SENGAJA selalu keluar dengan status 0, apa pun hasil curl-nya — gagal
# ditulis ke FAIL_FILE, bukan lewat exit code. Dua alasan: (1) proses ini
# dipanggil lewat `bash -c` baru oleh xargs, yang TIDAK mewarisi
# `set -euo pipefail` milik skrip induk, jadi tidak ada jaminan otomatis di
# sini; (2) walau ada jaminan itu, `xargs -P` yang menerima satu saja exit
# code bukan-nol akan membuat XARGS ITU SENDIRI keluar bukan-nol, dan baris
# panggilannya (di luar konstruksi if) akan langsung menghentikan skrip lewat
# `set -e` SEBELUM sempat memeriksa FAIL_FILE — persis kegagalan senyap yang
# ingin dihindari. Diperiksa dan diuji: FAIL_FILE tetap diperiksa eksplisit
# tepat sesudah xargs selesai.
download_one() {
  local line="$1" b key
  b="${line%%$'\t'*}"
  key="${line#*$'\t'}"
  mkdir -p "$OUT/$b/$(dirname "$key")"
  if ! curl -sS --fail --retry 5 --retry-delay 2 --retry-max-time 120 --connect-timeout 30 \
       -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
       -o "$OUT/$b/$key" "$API/object/$b/$key"; then
    printf '%s\t%s\n' "$b" "$key" >> "$FAIL_FILE"
  fi
  return 0
}
export -f download_one
export OUT API SERVICE_ROLE_KEY FAIL_FILE

if [ "$TOTAL_TASKS" -gt 0 ]; then
  xargs -a "$TASKS_FILE" -d '\n' -P "$PARALLEL" -I{} bash -c 'download_one "$@"' _ {}
fi

if [ -s "$FAIL_FILE" ]; then
  echo "::error::$(grep -c . "$FAIL_FILE") berkas gagal diunduh sesudah percobaan ulang (galat bukan sementara — cek izin service_role atau berkas yang mungkin sudah terhapus dari Storage):"
  cat "$FAIL_FILE"
  exit 1
fi

TOTAL=0
: > "$OUT/MANIFEST.txt"
for b in $BUCKETS; do
  n="${BUCKET_COUNT[$b]:-0}"
  f="${BUCKET_FOLDERS[$b]:-0}"
  echo "$b: $n berkas ($f folder)" >> "$OUT/MANIFEST.txt"
  echo "   $b: $n berkas ($f folder)"
  TOTAL=$((TOTAL + n))
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
