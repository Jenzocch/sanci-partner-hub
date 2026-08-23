// Impor massal Katalog Produk SANCI dari Master_data.xlsx + Master_Data2.xlsx
// (169 produk, foto sudah dikompres ke preset PRODUK yang sama dengan unggahan
// biasa: sisi terpanjang 1280px, mutu WebP 0.82 — lihat lib/compress-image.ts).
//
// DIJALANKAN SEKALI, DI KOMPUTER SENDIRI, BUKAN DI SERVER — sengaja tidak jadi
// bagian dari aplikasi yang di-deploy. Skrip ini butuh kredensial admin, dan
// kredensial admin TIDAK PERNAH boleh berada di kode yang berjalan di server
// produksi kalau bukan lewat jalur service_role yang sudah ada (lib/supabase/admin.ts).
//
// CARA PAKAI:
//   1. cd web
//   2. Set salah satu dari dua kredensial ini (JANGAN commit, JANGAN kirim ke siapa pun):
//        a) SUPABASE_SERVICE_ROLE_KEY   (Vercel → Project Settings → Environment
//           Variables → SUPABASE_SERVICE_ROLE_KEY) — melewati RLS sepenuhnya.
//        b) SANCI_ADMIN_EMAIL + SANCI_ADMIN_PASSWORD — login sebagai akun admin
//           SANCI biasa; policy sp_admin_all yang mengizinkan (tidak perlu
//           service_role sama sekali, lebih aman untuk skrip sekali-pakai).
//      NEXT_PUBLIC_SUPABASE_URL harus sudah terisi di .env.local (sudah ada).
//   3. node scripts/import-master-data/run.mjs
//
// AMAN DIJALANKAN ULANG (idempotent): upsert berdasarkan `code` (unique di DB).
// Menjalankan ulang skrip ini hanya memperbarui baris yang sudah ada, tidak
// pernah membuat duplikat.
//
// TIDAK mengisi harga — katalog SANCI sengaja TANPA HARGA SAMA SEKALI
// (migration 0010 §1, keputusan owner 2026-08-17). Kolom PRICE/HARGA LAMA di
// Excel sumber diabaikan sepenuhnya.

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

const products = JSON.parse(readFileSync(path.join(__dirname, "products.json"), "utf8"));

async function main() {
  const supabase = await buildClient();

  let created = 0;
  let updated = 0;
  let photoOk = 0;
  let photoFail = 0;
  const failures = [];

  for (const [i, p] of products.entries()) {
    const label = `[${i + 1}/${products.length}] ${p.code} — ${p.name}`;

    // Upsert data (bukan foto) dulu — code adalah kunci unik alami (migration
    // 0010 §1: `sanci_products_code_key`). Baris yang sudah ada diperbarui di
    // tempat; id-nya TIDAK berubah, jadi path foto tetap stabil antar-run.
    const { data: existing, error: findErr } = await supabase
      .from("sanci_products")
      .select("id")
      .eq("code", p.code)
      .maybeSingle();
    if (findErr) {
      console.error(`${label}: gagal cek baris lama —`, findErr.message);
      failures.push({ code: p.code, step: "find", error: findErr.message });
      continue;
    }

    let productId = existing?.id ?? null;
    if (productId) {
      const { error: updErr } = await supabase
        .from("sanci_products")
        .update({
          name: p.name,
          category: p.category,
          description: p.description,
          stock_status: p.stock_status,
        })
        .eq("id", productId);
      if (updErr) {
        console.error(`${label}: gagal update —`, updErr.message);
        failures.push({ code: p.code, step: "update", error: updErr.message });
        continue;
      }
      updated++;
    } else {
      const { data: inserted, error: insErr } = await supabase
        .from("sanci_products")
        .insert({
          name: p.name,
          code: p.code,
          category: p.category,
          description: p.description,
          stock_status: p.stock_status,
          client_request_id: `xlsx-import-${p.code}`,
        })
        .select("id")
        .single();
      if (insErr) {
        console.error(`${label}: gagal insert —`, insErr.message);
        failures.push({ code: p.code, step: "insert", error: insErr.message });
        continue;
      }
      productId = inserted.id;
      created++;
    }

    // Foto — path TETAP `<id>/foto` (mengikuti konvensi
    // app/admin/produk/upload-product-photo.ts persis), upsert:true supaya
    // tidak menumpuk berkas yatim, lalu photo_url disimpan DENGAN `?v=`
    // supaya CDN tidak menampilkan foto lama (migration 0010 §7 + LESSONS #22).
    const imgPath = path.join(__dirname, "images", p.image_file);
    let imgBytes;
    try {
      imgBytes = readFileSync(imgPath);
    } catch {
      console.error(`${label}: berkas foto tidak ditemukan —`, imgPath);
      photoFail++;
      failures.push({ code: p.code, step: "photo-read", error: "file not found" });
      continue;
    }

    const storagePath = `${productId}/foto`;
    const { error: upErr } = await supabase.storage.from("product-photos").upload(storagePath, imgBytes, {
      upsert: true,
      contentType: "image/webp",
      // Setahun: URL foto membawa ?v=<timestamp>, konten per-URL abadi
      // (audit kecepatan muat 2026-08-22 #4). Jalankan ulang skrip ini untuk
      // menimpa 169 objek lama yang masih tersimpan dengan max-age=3600.
      cacheControl: "31536000",
    });
    if (upErr) {
      console.error(`${label}: gagal unggah foto —`, upErr.message);
      photoFail++;
      failures.push({ code: p.code, step: "photo-upload", error: upErr.message });
      continue;
    }

    const { data: pub } = supabase.storage.from("product-photos").getPublicUrl(storagePath);
    const photoUrl = `${pub.publicUrl}?v=${Date.now()}`;
    const { error: photoErr } = await supabase
      .from("sanci_products")
      .update({ photo_url: photoUrl })
      .eq("id", productId);
    if (photoErr) {
      console.error(`${label}: gagal simpan alamat foto —`, photoErr.message);
      photoFail++;
      failures.push({ code: p.code, step: "photo-url", error: photoErr.message });
      continue;
    }

    photoOk++;
    console.log(`${label}: OK`);
  }

  console.log("\n=== Selesai ===");
  console.log(`Produk baru dibuat : ${created}`);
  console.log(`Produk diperbarui  : ${updated}`);
  console.log(`Foto berhasil      : ${photoOk}`);
  console.log(`Foto gagal         : ${photoFail}`);
  if (failures.length) {
    console.log(`\nDetail gagal (${failures.length}):`);
    for (const f of failures) console.log(`  - ${f.code} [${f.step}]: ${f.error}`);
    process.exitCode = 1;
  }
}

main();
