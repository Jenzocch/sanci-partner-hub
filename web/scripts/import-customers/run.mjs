// Impor massal 36 pelanggan lama (dari Excel/WhatsApp/ingatan tim sales,
// DI LUAR sistem) ke tabel `customers`. Owner (Jenzo, 2026-08-20, "客戶資料也
// 進去") minta ini DENGAN SYARAT KERAS: pelanggan hasil impor ini TIDAK BOLEH
// terlihat cabang mana pun — lihat "SYARAT KERAS" di bawah untuk penjelasan
// lengkap kenapa skrip ini AMAN memenuhi itu.
//
// DIJALANKAN SEKALI, DI KOMPUTER SENDIRI, BUKAN DI SERVER — sengaja tidak jadi
// bagian dari aplikasi yang di-deploy. Skrip ini butuh kredensial admin, dan
// kredensial admin TIDAK PERNAH boleh berada di kode yang berjalan di server
// produksi kalau bukan lewat jalur service_role yang sudah ada (lib/supabase/admin.ts).
//
// PRASYARAT: migration `0017_customer_code_email.sql` SUDAH dijalankan di
// database ini (kolom customer_code/email harus ada). Skrip ini TIDAK
// memeriksa itu sendiri — kalau kolomnya belum ada, Supabase akan menolak
// setiap INSERT/UPDATE dengan kode 42703 dan skrip berhenti di baris pertama
// yang gagal (lihat "Detail gagal" di ringkasan akhir).
//
// CARA PAKAI:
//   1. cd web
//   2. Set salah satu dari dua kredensial ini (JANGAN commit, JANGAN kirim ke siapa pun):
//        a) SUPABASE_SERVICE_ROLE_KEY   (Vercel → Project Settings → Environment
//           Variables → SUPABASE_SERVICE_ROLE_KEY) — melewati RLS sepenuhnya.
//        b) SANCI_ADMIN_EMAIL + SANCI_ADMIN_PASSWORD — login sebagai akun admin
//           SANCI biasa; policy c_admin_all yang mengizinkan (tidak perlu
//           service_role sama sekali, lebih aman untuk skrip sekali-pakai).
//      NEXT_PUBLIC_SUPABASE_URL harus sudah terisi di .env.local (sudah ada).
//   3. node scripts/import-customers/run.mjs
//
// SYARAT KERAS — kenapa pelanggan hasil impor TIDAK terlihat cabang:
// setiap baris ditulis dengan created_via_partner_id = NULL DAN
// created_via_branch_id = NULL, dan skrip ini TIDAK PERNAH membuat baris
// partner_orders apa pun. Policy baca cabang (`c_partner_read`, migration
// 0007) mengizinkan baca kalau: admin, ATAU fn_can_view_branch(created_via_
// branch_id) [selalu false untuk NULL — tidak ada baris partner_branches yang
// id-nya NULL], ATAU fn_customer_has_visible_order(id) [selalu false selama
// tidak ada order yang menunjuk pelanggan ini]. Jadi baris-baris ini HANYA
// terlihat SANCI Admin — mekanisme ini sudah ada sejak 0004/0007, migration
// 0017 SENGAJA tidak menyentuhnya (lihat kepala berkas 0017 §3), dan sudah
// dibuktikan lewat test perilaku di supabase/test-harness/50_behavior_0017.sql
// (T5a/T5b: admin lihat baris ini, pengguna cabang dapat NOL baris).
//
// AMAN DIJALANKAN ULANG (idempotent): cari dulu berdasarkan phone_normalized
// (unik SECARA PRAKTIK untuk 36 baris ini, walau kolomnya sendiri SENGAJA
// tidak unique di skema — SPEC §9, "telepon bukan identitas", satu keluarga
// boleh berbagi nomor). Kalau ketemu: HANYA mengisi kolom yang masih kosong
// (customer_code/email/address) dan menambah catatan sumber kalau belum ada
// — TIDAK PERNAH menimpa nilai yang sudah diisi (mis. oleh manusia yang sudah
// mengedit baris itu lewat aplikasi). Kalau tidak ketemu: INSERT baru.
// client_request_id (`customer-import-<customer_code>`) jadi lapisan kedua
// pencegah duplikat (LESSONS #3/#21) — kalau dua kali jalan nyaris bersamaan
// gara-gara SELECT-lalu-INSERT bentrok, unique constraint di database yang
// jadi penentu akhir, bukan pengecekan di sini.
//
// YANG SENGAJA DILEWATI: 2 baris dengan phone = null (Ibu Swanny, Mina) —
// `customers.phone`/`phone_normalized` NOT NULL di skema (migration 0004),
// jadi TIDAK ADA nomor yang bisa dikarang untuk keduanya. Dicetak eksplisit
// di akhir sebagai "dilewati — tanpa nomor telepon" supaya tidak hilang
// diam-diam (LESSONS #2).

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  try {
    const txt = readFileSync(path.join(__dirname, "..", "..", ".env.local"), "utf8");
    for (const line of txt.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    // .env.local opsional di sini — variabel bisa datang dari shell juga
  }
}
loadEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = process.env.SANCI_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.SANCI_ADMIN_PASSWORD;

if (!SUPABASE_URL) {
  console.error("NEXT_PUBLIC_SUPABASE_URL tidak ditemukan. Isi web/.env.local dulu.");
  process.exit(1);
}
if (!SERVICE_ROLE_KEY && !(ADMIN_EMAIL && ADMIN_PASSWORD)) {
  console.error(
    "Butuh kredensial. Set SUPABASE_SERVICE_ROLE_KEY, ATAU SANCI_ADMIN_EMAIL + SANCI_ADMIN_PASSWORD."
  );
  process.exit(1);
}

async function buildClient() {
  if (SERVICE_ROLE_KEY) {
    console.log("Memakai SUPABASE_SERVICE_ROLE_KEY (melewati RLS).");
    return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  if (!ANON_KEY) {
    console.error("NEXT_PUBLIC_SUPABASE_ANON_KEY tidak ditemukan (dibutuhkan untuk login admin).");
    process.exit(1);
  }
  console.log(`Login sebagai ${ADMIN_EMAIL} ...`);
  const supabase = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await supabase.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });
  if (error) {
    console.error("Login gagal:", error.message);
    process.exit(1);
  }
  return supabase;
}

// ── normalizePhoneID — PORTED, BUKAN diimpor, dari web/lib/orders-shared.ts ──
// Skrip ini adalah file .mjs lepas (dijalankan lewat `node`, bukan lewat
// bundler TypeScript aplikasi), jadi tidak bisa `import` langsung dari
// orders-shared.ts. Fungsi di bawah adalah SALINAN KATA-DEMI-KATA logikanya
// (bukan versi yang "mirip" atau "disederhanakan") — kalau normalizePhoneID
// di sana pernah berubah, salinan ini WAJIB disamakan lagi secara manual.
// "0812...", "812...", "+62 812...", "62 812..." → "62812...".
// null jika input tidak bisa dianggap nomor valid (terlalu pendek/panjang).
function normalizePhoneID(raw) {
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return null;
  let d = digits;
  if (d.startsWith("62")) {
    // "620812..." = orang mengetik +62 lalu tetap menulis 0 — buang 0-nya
    if (d.startsWith("620")) d = "62" + d.slice(3);
  } else if (d.startsWith("0")) {
    d = "62" + d.slice(1);
  } else if (d.startsWith("8")) {
    d = "62" + d;
  } else {
    return null; // bukan pola nomor Indonesia yang dikenal
  }
  if (d.length < 10 || d.length > 15) return null;
  return d;
}

// Beberapa telepon sumber punya catatan berkurung di belakang, mis.
// "087875714156 (Ibu Alin-agent properti)" — ini bukan bagian nomor
// teleponnya, ini catatan yang orang kantor tulis di sel yang sama. Dipisah
// SEBELUM dinormalisasi (supaya normalizePhoneID tidak melihat huruf di
// dalam kurung), dan teks di dalam kurung dipindah ke `notes` (bukan dibuang
// — LESSONS #2, "jangan diam-diam menghilangkan data yang diketik manusia").
function splitPhoneNote(rawPhone) {
  const m = rawPhone.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  if (!m) return { phoneClean: rawPhone.trim(), note: null };
  return { phoneClean: m[1].trim(), note: m[2].trim() || null };
}

function composeNotes(row, phoneNote) {
  const parts = [`Sumber: ${row.source} · Sales: ${row.sales}`];
  if (phoneNote) parts.push(`Catatan telepon: ${phoneNote}`);
  return parts.join(" | ");
}

const customers = JSON.parse(readFileSync(path.join(__dirname, "customers.json"), "utf8"));

async function main() {
  const supabase = await buildClient();

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  const skippedNoPhone = [];
  const skippedInvalidPhone = [];
  const failures = [];

  for (const [i, row] of customers.entries()) {
    const label = `[${i + 1}/${customers.length}] ${row.name} (${row.customer_code})`;

    if (row.phone === null) {
      console.log(`${label}: DILEWATI — tanpa nomor telepon`);
      skippedNoPhone.push(row.name);
      continue;
    }

    const { phoneClean, note: phoneNote } = splitPhoneNote(row.phone);
    const phoneNormalized = normalizePhoneID(phoneClean);
    if (!phoneNormalized) {
      console.log(`${label}: DILEWATI — telepon "${row.phone}" tidak bisa dinormalisasi`);
      skippedInvalidPhone.push(`${row.name} (${row.phone})`);
      continue;
    }

    const notes = composeNotes(row, phoneNote);

    // Cari baris yang sudah ada dulu (dedup by phone_normalized — LESSONS #3
    // catatan: ini SATU-SATUNYA lapisan pertama, lapisan kedua adalah unique
    // constraint client_request_id di bawah kalau INSERT-nya bentrok).
    const { data: existingRows, error: findErr } = await supabase
      .from("customers")
      .select("id, customer_code, email, address, notes")
      .eq("phone_normalized", phoneNormalized);
    if (findErr) {
      console.error(`${label}: gagal cek baris lama —`, findErr.message);
      failures.push({ name: row.name, step: "find", error: findErr.message });
      continue;
    }

    if (existingRows.length > 1) {
      console.warn(
        `${label}: PERINGATAN — ${existingRows.length} baris sudah punya nomor telepon ini ` +
          `(wajar secara skema, SPEC §9 telepon bukan identitas). Memakai baris tertua (id=${existingRows[0].id}), sisanya TIDAK disentuh.`
      );
    }

    const existing = existingRows[0] ?? null;

    if (existing) {
      const patch = {};
      if (!existing.customer_code || !existing.customer_code.trim()) patch.customer_code = row.customer_code;
      if (row.email && (!existing.email || !existing.email.trim())) patch.email = row.email;
      if (row.address && (!existing.address || !existing.address.trim())) patch.address = row.address;
      const alreadyMentioned = (existing.notes || "").includes(`Sumber: ${row.source}`);
      if (!alreadyMentioned) {
        patch.notes = existing.notes ? `${existing.notes} | ${notes}` : notes;
      }

      if (Object.keys(patch).length === 0) {
        console.log(`${label}: sudah lengkap, tidak ada yang diubah`);
        unchanged++;
        continue;
      }

      const { error: updErr } = await supabase.from("customers").update(patch).eq("id", existing.id);
      if (updErr) {
        console.error(`${label}: gagal update —`, updErr.message);
        failures.push({ name: row.name, step: "update", error: updErr.message });
        continue;
      }
      console.log(`${label}: DIPERBARUI (${Object.keys(patch).join(", ")})`);
      updated++;
      continue;
    }

    const { error: insErr } = await supabase.from("customers").insert({
      full_name: row.name,
      phone: phoneClean,
      phone_normalized: phoneNormalized,
      address: row.address,
      email: row.email,
      customer_code: row.customer_code,
      notes,
      created_via_partner_id: null,
      created_via_branch_id: null,
      client_request_id: `customer-import-${row.customer_code}`,
    });
    if (insErr) {
      // LESSONS #21/#27: tabel ini punya DUA unique constraint yang bisa
      // memicu 23505 — lihat nama constraint-nya sebelum menyimpulkan apa pun.
      if (insErr.message.includes("customers_client_request_id_key")) {
        console.log(`${label}: sudah pernah berhasil diimpor sebelumnya (client_request_id cocok) — dilewati aman`);
        unchanged++;
        continue;
      }
      if (insErr.message.includes("customers_customer_code_key")) {
        console.error(`${label}: GAGAL — customer_code "${row.customer_code}" sudah dipakai baris lain`);
        failures.push({ name: row.name, step: "insert", error: insErr.message });
        continue;
      }
      console.error(`${label}: gagal insert —`, insErr.message);
      failures.push({ name: row.name, step: "insert", error: insErr.message });
      continue;
    }
    console.log(`${label}: DIBUAT`);
    created++;
  }

  console.log("\n=== Selesai ===");
  console.log(`Pelanggan baru dibuat     : ${created}`);
  console.log(`Pelanggan diperbarui      : ${updated}`);
  console.log(`Sudah lengkap (tak diubah): ${unchanged}`);
  console.log(`Total diproses berhasil   : ${created + updated + unchanged} dari ${customers.length}`);
  console.log(`\nDilewati — tanpa nomor telepon (${skippedNoPhone.length}):`);
  for (const n of skippedNoPhone) console.log(`  - ${n}`);
  if (skippedInvalidPhone.length) {
    console.log(`\nDilewati — telepon tidak bisa dinormalisasi (${skippedInvalidPhone.length}):`);
    for (const n of skippedInvalidPhone) console.log(`  - ${n}`);
  }
  if (failures.length) {
    console.log(`\nDetail gagal (${failures.length}):`);
    for (const f of failures) console.log(`  - ${f.name} [${f.step}]: ${f.error}`);
    process.exitCode = 1;
  }
}

main();
