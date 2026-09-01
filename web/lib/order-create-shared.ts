/**
 * Helper pembuatan pesanan yang dipakai DUA jalur sekaligus:
 *   - cabang : web/app/cabang/pesanan/actions.ts  (createCustomerAndOrder)
 *   - admin  : web/app/admin/actions-create-order.ts (createOrderForBranch)
 *
 * HANYA untuk sisi server (diimpor dari berkas "use server") — fungsi di sini
 * menerima klien Supabase server milik pemanggil dan tidak pernah membaca
 * cookie/identitas sendiri. Keduanya sengaja BEBAS teks pengguna (tidak
 * menyentuh Messages sama sekali) supaya bisa dipakai dari area cabang
 * (CabangMessages) maupun admin (AdminMessages) tanpa konversi — pemanggil
 * yang menerjemahkan hasil enum/boolean jadi kalimat.
 *
 * Diekstrak dari web/app/cabang/pesanan/actions.ts saat jalur admin dibuat
 * (fitur "admin membuat pesanan atas nama partner/cabang") — logikanya TIDAK
 * berubah sedikit pun dari versi yang sudah teruji di cabang; hanya pindah
 * berkas supaya dua jalur tidak menyimpan dua salinan yang bisa saling
 * menyimpang (pola LESSONS #27: salinan yang tertinggal adalah bug diam).
 */

import type { createClient } from "@/lib/supabase/server";
import { safeWrite } from "@/lib/safe-write";

export type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * "invalid" = baris memang tidak ada / staf tidak aktif / beda partner —
 * pesan validasi pengguna wajar. "error" = query itu sendiri GAGAL (jaringan/
 * DB) — TIDAK boleh disamarkan jadi "invalid" (LESSONS #10): dulu fungsi ini
 * membuang field `error` sepenuhnya, jadi hiccup jaringan sesaat membuat
 * pengguna melihat "Sales harus dipilih dari daftar staf aktif" walau
 * pilihannya benar — pesan yang menyuruh mengganti pilihan padahal
 * masalahnya di server, bukan di pilihan.
 *
 * `branchId`/`partnerId` yang dikirim ke sini WAJIB sudah terbukti benar oleh
 * pemanggil: cabang memakai identitas sesi sendiri (look-up-don't-trust,
 * LESSONS #6), admin memakai partner/cabang PILIHAN yang sudah divalidasi
 * saling memiliki + ACTIVE — dropdown di UI bukan batas keamanannya.
 */
export async function verifyActiveStaffInBranch(
  supabase: SupabaseServerClient,
  staffId: string,
  branchId: string,
  partnerId: string
): Promise<"ok" | "invalid" | "error"> {
  const { data, error } = await supabase
    .from("partner_staff_assignments")
    .select("staff_id, partner_staff:staff_id(id, status, partner_id)")
    .eq("staff_id", staffId)
    .eq("branch_id", branchId)
    .is("end_at", null)
    .maybeSingle();
  if (error) return "error";
  if (!data) return "invalid";
  const staff = data.partner_staff as unknown as { id: string; status: string; partner_id: string } | null;
  return !!staff && staff.status === "ACTIVE" && staff.partner_id === partnerId ? "ok" : "invalid";
}

/**
 * Menyalin isi Package (partner_package_items) ke order_items SAAT pesanan
 * dibuat — inti permintaan owner "每個訂單下的產品或是paket都要可以備註":
 * tanpa baris order_items, tidak ada apa pun untuk diberi catatan per
 * produk. Snapshot nama/kode diambil ULANG dari sanci_products saat itu
 * (bukan dipercaya dari client — LESSONS #6), lalu DIBEKUKAN di baris ini
 * (trg_order_item_immutable_cols, migrasi 0014, mengunci name_snapshot/
 * code_snapshot dari cabang selanjutnya).
 *
 * client_request_id per baris DETERMINISTIK (`{orderClientRequestId}:item:
 * {partner_package_items.id}`) — retry (respons hilang, submitSafely
 * mengulang) tidak pernah menggandakan baris (LESSONS #3/#21).
 *
 * KENAPA id BARIS PAKET, BUKAN product_id (diperbaiki 2026-09-01, LESSONS
 * #49): keduanya sama-sama stabil lintas percobaan, tapi hanya yang pertama
 * UNIK BERDASARKAN KONSTRUKSI. Versi lama memakai `:item:{product_id}` dan
 * itu benar HANYA selama `unique (package_id, product_id)` (0012) masih
 * berdiri — constraint yang isinya keputusan PRODUK ("satu produk paling
 * banyak sekali per paket; unit kedua = naikkan quantity"), bukan janji
 * teknis kepada berkas ini. Begitu paket boleh memuat produk yang sama dua
 * kali (mis. dua warna, kasus yang sudah muncul di keranjang Kalkulator),
 * baris kedua akan punya client_request_id yang SAMA dengan baris pertama
 * dan DITELAN DIAM-DIAM oleh `ignoreDuplicates: true` — pesanan kekurangan
 * satu baris tanpa satu pun error di mana pun. `partner_package_items.id`
 * adalah primary key: dua baris berbeda TIDAK PERNAH bisa berbagi nilainya,
 * apa pun yang terjadi pada constraint lain.
 *
 * KONSEKUENSI PERUBAHAN FORMAT yang disadari: sebuah percobaan tulis yang
 * responsnya hilang TEPAT saat deploy ini naik, lalu di-retry sesudahnya,
 * akan memakai kunci format BARU dan karena itu tidak mengenali baris lama
 * — jendelanya beberapa detik, dan akibat terburuknya baris ganda pada satu
 * pesanan (kelihatan, bisa dihapus), bukan baris hilang (tidak kelihatan).
 * Ditukar sadar: arah kegagalan yang lebih aman.
 *
 * WARNA: baris hasil salinan Package SELALU lahir tanpa color_code —
 * `partner_package_items` memang tidak punya konsep warna (paket adalah
 * daftar produk, bukan daftar produk-berwarna). Itu BUKAN kehilangan data:
 * staf memilih warnanya di "Ubah" pada halaman pesanan sesudah pesanan
 * berdiri, jalur yang sama untuk kedua sisi. Menambahkan warna ke tabel
 * paket adalah keputusan produk tersendiri (kolom + layar editor paket),
 * sengaja TIDAK diselundupkan lewat perbaikan kunci ini.
 *
 * SATU round trip, bukan N×(SELECT+INSERT) berurutan (audit 2026-08-21,
 * item #1 "只回報、沒有動手" di FEATURES.md): seluruh baris dibangun dulu,
 * lalu ditulis lewat SATU `.upsert(..., { onConflict: "client_request_id",
 * ignoreDuplicates: true })`. Ini mengompilasi ke Postgres
 * `INSERT ... ON CONFLICT (client_request_id) DO NOTHING` — DO NOTHING
 * dievaluasi PER BARIS di dalam satu statement, bukan all-or-nothing untuk
 * seluruh batch, jadi baris yang sudah mendarat dari percobaan sebelumnya
 * (retry setelah respons hilang) diam-diam dilewati sementara baris baru
 * tetap tertulis — jaminan idempotency yang SAMA dengan pola
 * SELECT-lalu-INSERT per baris yang lama, hanya lebih sedikit round trip.
 * Ini BUKAN pelanggaran LESSONS #3 (yang melarang SELECT→tidak ada→INSERT
 * sebagai satu-satunya pertahanan): pertahanan sesungguhnya di sini tetap
 * `client_request_id text unique` (migrasi 0014) yang membuat ON CONFLICT
 * punya target — `ignoreDuplicates` hanya memilih perilaku DO NOTHING di
 * atas constraint itu, bukan menggantikannya.
 *
 * `ignoreDuplicates: true` → header `Prefer: resolution=ignore-duplicates`
 * (bukan `merge-duplicates`) → PostgREST TIDAK menghasilkan klausa
 * `DO UPDATE`, jadi hanya kebijakan RLS INSERT yang diperiksa (cabang lewat
 * oi_partner_insert, admin lewat oi_admin_all — migrasi 0014 §RLS), bukan
 * kebijakan UPDATE — baris yang sudah ada tidak pernah disentuh sama sekali
 * oleh percobaan retry.
 *
 * RETURNING (lewat `.select("id")`) TIDAK menyertakan baris yang kena
 * ON CONFLICT DO NOTHING — jadi `data.length` boleh lebih kecil dari jumlah
 * baris yang dikirim (retry sebagian sudah mendarat) TANPA berarti gagal;
 * `safeWrite` sendiri hanya menandai gagal kalau ada error atau
 * data null/undefined (array kosong `[]` tetap `ok: true`), jadi perilaku
 * "boleh return lebih sedikit baris" ini sudah otomatis benar tanpa
 * pemeriksaan tambahan di sini.
 *
 * Trigger di order_items (trg_audit/trg_set_created_by/
 * trg_order_item_price_guard) semuanya FOR EACH ROW, bukan FOR EACH
 * STATEMENT dan tidak ada logika lintas-baris (migrasi 0014 §6–7) — batch
 * insert menjalankannya persis sama seperti N insert satu-satu.
 * trg_order_item_price_guard khususnya TIDAK pernah menyala di sini: baris
 * Package tidak pernah mengisi unit_price/line_discount, dan guard-nya
 * sendiri hanya query kalau salah satu kolom itu diisi.
 * Kebijakan INSERT (WITH CHECK) membaca partner_orders lewat order_id —
 * setiap baris di batch ini berbagi order_id yang SAMA (order yang baru
 * dibuat), jadi hasilnya identik dengan diperiksa satu-satu.
 *
 * BEST-EFFORT MURNI: kegagalan di sini TIDAK PERNAH melempar/membatalkan
 * pesanan yang sudah tersimpan (pola sama dengan lampiran invoice) — hanya
 * dilaporkan lewat return value, dan pemanggil WAJIB meneruskannya sebagai
 * peringatan (LESSONS #10: jangan diam-diam menelan kegagalan sebagian).
 */
export async function copyPackageItemsToOrder(
  supabase: SupabaseServerClient,
  orderId: string,
  packageId: string,
  orderClientRequestId: string
): Promise<{ ok: true } | { ok: false }> {
  const { data: items, error } = await supabase
    .from("partner_package_items")
    .select("id, product_id, quantity, sanci_products:product_id(name, code)")
    .eq("package_id", packageId);
  if (error || !items) return { ok: false };
  if (items.length === 0) return { ok: true };

  type Item = { id: string; product_id: string; quantity: number; sanci_products: { name: string; code: string | null } | { name: string; code: string | null }[] | null };

  // Produk yang join-nya gagal (product null) TETAP menandai anyFailed —
  // sama seperti sebelumnya — tapi TIDAK masuk batch (tidak ada nama untuk
  // disimpan, name_snapshot NOT NULL).
  let anyFailed = false;
  const rows: Record<string, unknown>[] = [];
  for (const raw of items) {
    const it = raw as unknown as Item;
    const product = Array.isArray(it.sanci_products) ? it.sanci_products[0] : it.sanci_products;
    if (!product) {
      anyFailed = true;
      continue;
    }
    rows.push({
      order_id: orderId,
      product_id: it.product_id,
      name_snapshot: product.name,
      code_snapshot: product.code,
      quantity: it.quantity,
      client_request_id: `${orderClientRequestId}:item:${it.id}`,
    });
  }
  if (rows.length === 0) return anyFailed ? { ok: false } : { ok: true };

  const written = await safeWrite(
    supabase
      .from("order_items")
      .upsert(rows, { onConflict: "client_request_id", ignoreDuplicates: true })
      .select("id")
  );
  if (!written.ok) anyFailed = true;
  return anyFailed ? { ok: false } : { ok: true };
}
