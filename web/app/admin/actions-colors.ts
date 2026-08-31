"use server";

/**
 * Server Actions untuk Katalog Warna (migrasi 0025, `product_colors`) —
 * dikelola SANCI Admin saja (RLS admin-all + partner authenticated read,
 * gated seperti product_photos' ph_partner_read — lihat migrasi 0025).
 *
 * `product_colors` adalah PALET GLOBAL (bukan per-produk): satu baris = satu
 * warna yang tersedia lintas katalog, dipilih ulang per produk lewat
 * `sanci_products.has_color_options` (Fitur B) dan `order_items.color_code`
 * (Fitur C, teks bebas — TIDAK berubah sama sekali di sini).
 *
 * Pola idempotency/safeWrite/pesan meniru actions-product-photos.ts (LESSONS
 * #21) — `product_colors` BISA belum ada di database (migrasi 0025
 * dikerjakan paralel dengan kode ini, LESSONS #12): setiap error 42P01
 * diterjemahkan ke pesan degradasi yang sama, bukan dibiarkan bocor sebagai
 * error DB mentah (LESSONS #10). Tabelnya TIDAK punya kolom
 * `client_request_id` (skema dipatok orkestrator) — `addColor` karena itu
 * TIDAK bisa memakai idiom idempotency penuh (insert → lookup by request id)
 * seperti createProduct; constraint UNIQUE pada `code` sendiri jadi
 * pertahanan duplikatnya (LESSONS #3): dua penulisan dengan kode yang sama
 * tidak akan pernah menghasilkan dua baris, dan respons yang hilang di
 * jaringan lemah dilaporkan "belum pasti" (bukan diklaim sukses) — admin
 * bisa memeriksa daftar sebelum menekan Simpan lagi.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { pesan, safeWrite } from "@/lib/safe-write";
import { getAdminMessages } from "@/lib/i18n";

type ActionError = { field?: string; message: string };
type ActionResult<T> = { data: T } | { error: ActionError };

export type ColorStatus = "ACTIVE" | "INACTIVE";
export type ColorRow = {
  id: string;
  code: string;
  name: string | null;
  photo_url: string | null;
  status: ColorStatus;
  sort_order: number;
};

const MAX_CODE_LEN = 40;
const COLOR_ORDER = ["sort_order", "code"] as const;

function isMissingTable(code: string | undefined): boolean {
  return code === "42P01";
}
function isMissingColumn(code: string | undefined): boolean {
  return code === "42703";
}

/**
 * Membuat satu warna baru. `photoUrl` dari browser TIDAK dipercaya (LESSONS
 * #6): hanya alamat publik di bucket foto, di bawah path `colors/`, yang
 * boleh masuk ke kolom `photo_url` — sama doktrinnya dengan addProductPhoto.
 */
export async function addColor(
  code: string,
  name: string,
  photoUrl: string
): Promise<ActionResult<{ id: string }>> {
  const m = await getAdminMessages();
  const PESAN = pesan(m);
  // upper() SEJALAN dengan trigger DB trg_normalize_color_code (0025):
  // normalisasi sesungguhnya terjadi di database (LESSONS #5), baris ini
  // hanya membuat nilai yang DIKIRIM sama dengan yang akan TERSIMPAN,
  // supaya pesan sukses/duplikat menampilkan kode persis sebagaimana ia
  // akan muncul di daftar.
  const trimmedCode = code.trim().toUpperCase();
  if (!trimmedCode) return { error: { field: "code", message: m.admin.colorCodeRequired } };
  if (trimmedCode.length > MAX_CODE_LEN) {
    return { error: { field: "code", message: m.admin.colorCodeTooLong } };
  }

  // photo_url adalah NOT NULL di skema 0025 (foto WAJIB, bukan opsional
  // seperti sampul produk) — cek kosong DULU, sebelum cek prefix, supaya
  // pesan yang tampil "foto wajib diisi", bukan "alamat foto tidak dikenali"
  // (yang salah menuduh URL-nya cacat padahal memang tidak ada).
  if (!photoUrl) return { error: { field: "photo", message: m.admin.colorPhotoRequired } };
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  const prefix = `${base}/storage/v1/object/public/product-photos/colors/`;
  if (!photoUrl.startsWith(prefix)) {
    return { error: { field: "photo", message: m.admin.photoUrlUnrecognized } };
  }

  const supabase = await createClient();
  const written = await safeWrite(
    supabase
      .from("product_colors")
      .insert({
        code: trimmedCode,
        name: name.trim() || null,
        photo_url: photoUrl,
      })
      .select("id")
      .single()
  );

  if (!written.ok) {
    if (written.reason === "db") {
      if (isMissingTable(written.code)) return { error: { message: m.admin.colorMigrationMsg } };
      // Bentrok kode (product_colors_code_key) — sama pola dengan
      // productCodeTaken di actions-products.ts: bukan "server sibuk", pesan
      // generik akan menyuruh admin mengulang percobaan yang pasti gagal lagi.
      if (written.code === "23505") {
        return { error: { field: "code", message: m.admin.colorCodeTaken } };
      }
      return { error: { message: PESAN.serverSibuk } };
    }
    // Respons hilang — tanpa client_request_id (lihat catatan kepala berkas),
    // status sebenarnya tidak bisa dipastikan dari sini. Admin diminta
    // memeriksa daftar (yang akan menyegarkan diri lewat router.refresh()
    // pemanggil) sebelum mencoba lagi.
    return { error: { message: PESAN.belumPastiBaru } };
  }

  revalidatePath("/admin/warna");
  return { data: { id: written.data.id } };
}

export async function setColorStatus(id: string, status: ColorStatus): Promise<ActionResult<true>> {
  const m = await getAdminMessages();
  if (status !== "ACTIVE" && status !== "INACTIVE") {
    return { error: { message: m.admin.colorStatusInvalid } };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_colors")
    .update({ status })
    .eq("id", id)
    .select("id")
    .single();
  if (error || !data) {
    if (isMissingTable(error?.code)) return { error: { message: m.admin.colorMigrationMsg } };
    return { error: { message: m.admin.colorStatusChangeFailed } };
  }

  revalidatePath("/admin/warna");
  return { data: true };
}

/**
 * Menggeser satu warna satu langkah ke atas/bawah dalam urutan tampil
 * (`sort_order, code` — kontrak yang sama dipakai listActiveColors di bawah
 * dan picker Fitur C). Pola SATU upsert atomik untuk seluruh urutan baru,
 * diikuti verifikasi baca-ulang, meniru PERSIS moveProductPhoto di
 * actions-product-photos.ts — lihat catatan panjang di sana untuk alasan
 * kenapa loop UPDATE per-baris ditolak (LESSONS #7).
 */
export async function moveColor(id: string, direction: "up" | "down"): Promise<ActionResult<ColorRow[]>> {
  const m = await getAdminMessages();
  const PESAN = pesan(m);
  if (direction !== "up" && direction !== "down") {
    return { error: { message: m.admin.colorMoveFailed } };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_colors")
    .select("id, code, name, photo_url, status, sort_order")
    .order(COLOR_ORDER[0])
    .order(COLOR_ORDER[1]);
  if (error) {
    if (isMissingTable(error.code)) return { error: { message: m.admin.colorMigrationMsg } };
    return { error: { message: m.common.errorLoad } };
  }

  const colors = (data ?? []) as ColorRow[];
  const from = colors.findIndex((c) => c.id === id);
  if (from === -1) return { error: { message: m.admin.colorMoveFailed } };

  const to = direction === "up" ? from - 1 : from + 1;
  if (to < 0 || to >= colors.length) return { data: colors };

  const target = colors.slice();
  [target[from], target[to]] = [target[to], target[from]];

  // Verifikasi keberadaan tepat sebelum menulis — mempersempit jendela
  // balapan dengan admin lain yang menghapus/menonaktifkan warna yang sama
  // (pola sama dengan moveProductPhoto).
  const { data: masihAda, error: cekError } = await supabase
    .from("product_colors")
    .select("id")
    .in(
      "id",
      target.map((c) => c.id)
    );
  if (cekError) {
    if (isMissingTable(cekError.code)) return { error: { message: m.admin.colorMigrationMsg } };
    return { error: { message: m.common.errorLoad } };
  }
  if ((masihAda ?? []).length !== target.length) {
    return { error: { message: m.admin.colorMoveFailed } };
  }

  const written = await safeWrite(
    supabase
      .from("product_colors")
      .upsert(
        target.map((c, i) => ({
          id: c.id,
          code: c.code,
          name: c.name,
          photo_url: c.photo_url,
          status: c.status,
          sort_order: i,
        })),
        { onConflict: "id" }
      )
      .select("id")
  );
  if (!written.ok) {
    if (written.reason === "db" && isMissingTable(written.code)) {
      return { error: { message: m.admin.colorMigrationMsg } };
    }
    return { error: { message: written.reason === "db" ? PESAN.serverSibuk : PESAN.belumPastiUbah } };
  }

  const { data: after, error: afterError } = await supabase
    .from("product_colors")
    .select("id, code, name, photo_url, status, sort_order")
    .order(COLOR_ORDER[0])
    .order(COLOR_ORDER[1]);
  if (afterError) {
    if (isMissingTable(afterError.code)) return { error: { message: m.admin.colorMigrationMsg } };
    return { error: { message: m.admin.colorMoveFailed } };
  }

  const tersimpan = (after ?? []) as ColorRow[];
  const samaUrutannya =
    tersimpan.length === target.length && tersimpan.every((c, i) => c.id === target[i].id);
  if (!samaUrutannya) return { error: { message: m.admin.colorMoveFailed } };

  revalidatePath("/admin/warna");
  return { data: tersimpan };
}

/* ------------------------------------------------------------------ *
 * Fitur C (admin) — pemilih warna di modal Isi Pesanan.
 *
 * SENGAJA action TERSENDIRI dari kembarannya di app/cabang/pesanan/
 * actions.ts (listActiveColorsCabang), BUKAN satu fungsi ber-parameter area
 * — lihat doktrin di kepala app/admin/proposal/actions.ts: satu fungsi yang
 * memilih gerbang dari argumen pemanggil adalah persis bentuk yang bisa
 * dilewati dengan mengarang argumen. Sisi admin di sini tidak punya gerbang
 * tambahan (RLS admin-all/`fn_is_admin` seperti seluruh /admin/** lain);
 * sisi cabang punya RLS partner-read sendiri.
 * ------------------------------------------------------------------ */

export type ListActiveColorsOutcome =
  | { status: "ok"; hasColorOptions: boolean; colors: ColorRow[] }
  /** Migrasi 0025 (tabel) ATAU has_color_options (0025 juga) belum jalan —
   *  keadaan transisi wajar (LESSONS #12): pemanggil turun diam-diam ke
   *  input teks bebas, TANPA catatan — ini bukan kegagalan. */
  | { status: "unavailable" }
  /** Kolom/tabel ADA tapi query gagal (RLS berubah, timeout, dll) — beda
   *  dari "unavailable" (LESSONS #10): pemanggil menampilkan catatan kecil
   *  "gagal memuat warna", bukan berpura-pura produk ini tidak punya warna. */
  | { status: "error" };

export async function listActiveColors(productId: string): Promise<ListActiveColorsOutcome> {
  const supabase = await createClient();

  const { data: product, error: productError } = await supabase
    .from("sanci_products")
    .select("has_color_options")
    .eq("id", productId)
    .maybeSingle();
  if (productError) {
    return isMissingColumn(productError.code) ? { status: "unavailable" } : { status: "error" };
  }
  const hasColorOptions = (product as { has_color_options: boolean | null } | null)?.has_color_options ?? false;
  if (!hasColorOptions) return { status: "ok", hasColorOptions: false, colors: [] };

  const { data: colors, error: colorsError } = await supabase
    .from("product_colors")
    .select("id, code, name, photo_url, status, sort_order")
    .eq("status", "ACTIVE")
    .order(COLOR_ORDER[0])
    .order(COLOR_ORDER[1]);
  if (colorsError) {
    return isMissingTable(colorsError.code) ? { status: "unavailable" } : { status: "error" };
  }

  return { status: "ok", hasColorOptions: true, colors: (colors ?? []) as ColorRow[] };
}
