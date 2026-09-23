// Impor "202609_SANCI_Selling_Price_List_ADMIN.xlsx" (937 baris) ke katalog.
// Keputusan owner 2026-09-22/23 — lihat README.md di folder ini.
//
// DIJALANKAN SEKALI, DI KOMPUTER SENDIRI (pola sama dengan
// scripts/import-master-data). Kredensial TIDAK PERNAH di-commit.
//
// CARA PAKAI:
//   1. Migration 0031 SUDAH dijalankan di Supabase (skrip berhenti kalau belum).
//   2. cd web
//   3. Set SANCI_ADMIN_EMAIL + SANCI_ADMIN_PASSWORD (atau SUPABASE_SERVICE_ROLE_KEY).
//   4. node scripts/import-price-list-2026-09/run.mjs              ← UJI: hanya membaca & melaporkan
//      node scripts/import-price-list-2026-09/run.mjs --jalankan   ← benar-benar menulis
//
// AMAN DIJALANKAN ULANG: kunci = `code`. Baris yang sudah ada diperbarui di
// tempat (id tetap), tidak pernah diduplikat. Foto HANYA diunggah untuk
// produk yang BELUM punya foto — foto yang sudah ada tidak pernah ditimpa
// (foto di Excel hanya thumbnail ±100px).
//
// Harga: ditulis ke product_prices baris dasar (partner_id NULL, 0021) —
// BUKAN ke sanci_products (aturan besi 0010). Remarks + harga showroom lama
// ke product_internal_notes (0031, khusus admin).

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
    // opsional
  }
}
loadEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = process.env.SANCI_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.SANCI_ADMIN_PASSWORD;
const WRITE = process.argv.includes("--jalankan");

if (!SUPABASE_URL) {
  console.error("NEXT_PUBLIC_SUPABASE_URL tidak ditemukan. Isi web/.env.local dulu.");
  process.exit(1);
}
if (!SERVICE_ROLE_KEY && !(ADMIN_EMAIL && ADMIN_PASSWORD)) {
  console.error("Butuh kredensial: SANCI_ADMIN_EMAIL + SANCI_ADMIN_PASSWORD, atau SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

async function buildClient() {
  if (SERVICE_ROLE_KEY) {
    return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  }
  const supabase = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await supabase.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  if (error) {
    console.error("Login gagal:", error.message);
    process.exit(1);
  }
  return supabase;
}

const rows = JSON.parse(readFileSync(path.join(__dirname, "data.json"), "utf8"));
const SPEC = ["material", "configuration", "packing", "cbm", "weight"];

async function setBasePrice(supabase, productId, price) {
  const { data: upd, error: updErr } = await supabase
    .from("product_prices")
    .update({ price })
    .eq("product_id", productId)
    .is("partner_id", null)
    .select("id");
  if (updErr) return updErr.message;
  if ((upd ?? []).length > 0) return null;
  const { error: insErr } = await supabase.from("product_prices").insert({ product_id: productId, partner_id: null, price });
  return insErr ? insErr.message : null;
}

async function main() {
  const supabase = await buildClient();

  // 0031 wajib sudah ada — kalau belum, kolom spesifikasi gagal ditulis di
  // tengah jalan dan setengah katalog terimpor (LESSONS: gagal di depan).
  const probe = await supabase.from("sanci_products").select("id, material").limit(1);
  const probeNotes = await supabase.from("product_internal_notes").select("id").limit(1);
  if (probe.error || probeNotes.error) {
    console.error("Migration 0031 belum dijalankan (kolom material / tabel product_internal_notes tidak ada). Jalankan 0031 dulu.");
    process.exit(1);
  }

  const { data: existingRows, error: exErr } = await supabase
    .from("sanci_products")
    .select("id, code, name, category, size, photo_url");
  if (exErr) {
    console.error("Gagal membaca katalog:", exErr.message);
    process.exit(1);
  }
  const byCode = new Map(existingRows.map((r) => [r.code, r]));

  const plan = { insert: 0, update: 0, photo: 0 };
  for (const r of rows) {
    const ex = byCode.get(r.code);
    if (ex) plan.update++;
    else plan.insert++;
    if (r.photo && !(ex && ex.photo_url)) plan.photo++;
  }
  const missingUpdates = rows.filter((r) => r.action === "update" && !byCode.has(r.code));
  console.log(`Rencana: ${plan.insert} produk baru, ${plan.update} diperbarui, ${plan.photo} foto diunggah.`);
  if (missingUpdates.length) {
    console.log(`⚠️  ${missingUpdates.length} produk yang seharusnya SUDAH ada tidak ditemukan (akan dibuat baru):`);
    for (const r of missingUpdates) console.log(`   - ${r.code}`);
  }
  if (!WRITE) {
    console.log("\nMode UJI — tidak ada yang ditulis. Jalankan dengan --jalankan untuk menulis.");
    return;
  }

  let ok = 0;
  const failures = [];
  for (const [i, r] of rows.entries()) {
    const label = `[${i + 1}/${rows.length}] ${r.code}`;
    const fail = (step, msg) => {
      console.error(`${label}: gagal ${step} — ${msg}`);
      failures.push({ code: r.code, step, error: msg });
    };

    // Kolom yang kosong di Excel TIDAK menghapus isi lama (mis. ukuran).
    const fields = { name: r.name, category: r.category };
    for (const k of ["size", "description", ...SPEC]) if (r[k]) fields[k] = r[k];

    let ex = byCode.get(r.code);
    let productId = ex?.id;
    if (productId) {
      const { error } = await supabase.from("sanci_products").update(fields).eq("id", productId);
      if (error) {
        fail("update", error.message);
        continue;
      }
    } else {
      const { data, error } = await supabase
        .from("sanci_products")
        .insert({ ...fields, code: r.code, client_request_id: `pricelist-2026-09-${r.code}` })
        .select("id")
        .single();
      if (error) {
        fail("insert", error.message);
        continue;
      }
      productId = data.id;
    }

    if (r.price != null) {
      const msg = await setBasePrice(supabase, productId, r.price);
      if (msg) fail("harga", msg);
    }

    if (r.remarks || r.old_showroom_price != null) {
      const { error } = await supabase
        .from("product_internal_notes")
        .upsert(
          { product_id: productId, remarks: r.remarks, old_showroom_price: r.old_showroom_price },
          { onConflict: "product_id" }
        );
      if (error) fail("catatan internal", error.message);
    }

    if (r.photo && !(ex && ex.photo_url)) {
      const bytes = readFileSync(path.join(__dirname, "images", r.photo));
      const storagePath = `${productId}/foto`;
      const { error: upErr } = await supabase.storage.from("product-photos").upload(storagePath, bytes, {
        upsert: true,
        contentType: r.photo.endsWith(".png") ? "image/png" : "image/jpeg",
        cacheControl: "31536000",
      });
      if (upErr) {
        fail("unggah foto", upErr.message);
      } else {
        const { data: pub } = supabase.storage.from("product-photos").getPublicUrl(storagePath);
        const { error } = await supabase
          .from("sanci_products")
          .update({ photo_url: `${pub.publicUrl}?v=${Date.now()}` })
          .eq("id", productId);
        if (error) fail("alamat foto", error.message);
      }
    }

    ok++;
    if (ok % 50 === 0) console.log(`${label}: ${ok} selesai`);
  }

  console.log("\n=== Selesai ===");
  console.log(`Berhasil diproses: ${ok}/${rows.length}`);
  if (failures.length) {
    console.log(`Gagal (${failures.length}):`);
    for (const f of failures) console.log(`  - ${f.code} [${f.step}]: ${f.error}`);
    console.log("Aman dijalankan ulang untuk mencoba yang gagal.");
    process.exitCode = 1;
  }
}

main();
