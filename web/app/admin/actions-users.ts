"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PESAN, WRITE_TIMEOUT_MS, confirmByRequestId, safeWrite } from "@/lib/safe-write";

type ActionError = { field?: string; message: string };
type ActionResult<T> = { data: T } | { error: ActionError };

export async function toggleUserStatus(userId: string): Promise<ActionResult<true>> {
  const supabase = await createClient();
  const { data: user } = await supabase
    .from("partner_users")
    .select("status, partner_id")
    .eq("id", userId)
    .maybeSingle();
  if (!user) return { error: { message: "Akun tidak ditemukan." } };

  const nextStatus = user.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
  const { data: updated, error } = await supabase
    .from("partner_users")
    .update({ status: nextStatus })
    .eq("id", userId)
    .select("id")
    .maybeSingle();
  // RLS bisa menyaring update ini jadi 0 baris tanpa error — jangan anggap berhasil
  // kalau tidak ada baris yang benar-benar berubah (LESSONS #7).
  if (error || !updated) return { error: { message: "Tidak bisa mengubah status akun sekarang." } };

  revalidatePath(`/admin/partners/${user.partner_id}`);
  return { data: true };
}

/* ==================================================================== *
 * Membuat akun login cabang (P-07)
 *
 * Membuat baris di `auth.users` hanya bisa lewat `auth.admin.createUser`,
 * dan itu menuntut kunci service_role yang MELEWATI SELURUH RLS
 * (LESSONS #19). Karena itu urutan di bawah bukan selera gaya:
 *
 *   1. Pastikan pemanggilnya SANCI Admin — pakai sesi pengguna sendiri,
 *      RLS masih aktif (LESSONS #5 "UI disembunyikan ≠ kontrol izin",
 *      LESSONS #6 "jangan percaya nilai dari browser").
 *   2. Validasi isian dan pasangan partner↔cabang, masih dengan sesi biasa.
 *   3. BARU sesudah itu klien service_role dibuat, dan HANYA untuk Auth.
 *   4. Baris penghubung `partner_users` ditulis lagi dengan sesi biasa,
 *      supaya RLS tetap menjadi lapisan terakhir: seandainya langkah 1
 *      pernah bisa ditembus, policy `u_admin_all` masih menolak.
 *
 * Bahaya khusus fungsi ini: penulisan dua tahap. Akun auth berhasil dibuat
 * tapi baris penghubung gagal = "akun yatim" — tidak terlihat di mana pun
 * (semua layar membaca `partner_users`), tapi emailnya terkunci selamanya
 * (unique di auth.users). Penanganannya ada di langkah 6/7 di bawah.
 * ==================================================================== */

/** Cukup untuk menolak salah ketik; validasi sebenarnya tetap di sisi Auth. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Panjang minimum kata sandi awal. Tombol "Buat otomatis" menghasilkan lebih panjang. */
const MIN_PANJANG_SANDI = 10;

const PESAN_AKUN = {
  tidakBerwenang: "Anda tidak berwenang membuat akun login.",
  cekIzinGagal: "Tidak bisa memastikan hak akses Anda sekarang. Muat ulang halaman lalu coba lagi.",
  kunciBelumDiatur:
    "Pembuatan akun login belum bisa dijalankan karena pengaturan server belum lengkap. " +
    "Minta petugas teknis mengisi variabel lingkungan SUPABASE_SERVICE_ROLE_KEY di Vercel, " +
    "lalu buka halaman ini lagi. Isian Anda tidak ada yang tersimpan.",
  emailDipakai:
    "Email ini sudah dipakai. Gunakan email lain. Kalau menurut Anda email ini seharusnya belum " +
    "terpakai, hubungi petugas teknis — jangan dipaksa dibuat ulang.",
  sandiLemah:
    "Kata sandi awal ditolak sistem login karena belum memenuhi syarat keamanan. Pakai kata sandi " +
    "yang lebih panjang dan mencampur huruf besar, huruf kecil, serta angka.",
  emailDitolak: "Email ini ditolak sistem login. Periksa penulisannya, lalu coba lagi.",
  gagalBuat: "Tidak bisa membuat akun login sekarang. Coba lagi sebentar lagi.",
  buatTidakPasti:
    "Koneksi ke server terputus sebelum jawaban sampai, jadi belum bisa dipastikan akun login " +
    "sudah dibuat atau belum. JANGAN langsung membuat ulang. Muat ulang halaman ini dan lihat " +
    "daftar Akun: kalau akun belum muncul tetapi email tadi ditolak karena sudah dipakai, " +
    "hubungi petugas teknis dan sebutkan email tersebut.",
  batalBersih:
    "Akun login GAGAL dibuat dan tidak ada yang tertinggal di sistem. Silakan coba lagi dengan " +
    "email yang sama.",
} as const;

/** Keadaan setengah jadi — WAJIB jujur, tidak boleh disebut berhasil (LESSONS #2/#7). */
function pesanSetengahJadi(email: string): string {
  return (
    `Akun login untuk ${email} sudah dibuat di sistem login, TETAPI belum terhubung ke partner ` +
    `ini, jadi belum bisa dipakai untuk masuk. Jangan membuat ulang dengan email yang sama. ` +
    `Catat email ini dan hubungi petugas teknis.`
  );
}

const HABIS_WAKTU = Symbol("timeout");

/** Sama seperti pembungkus di safe-write.ts, tapi untuk panggilan Auth (bukan PostgREST). */
async function balapWaktu<T>(op: PromiseLike<T>, ms: number): Promise<T | typeof HABIS_WAKTU> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      op,
      new Promise<typeof HABIS_WAKTU>((resolve) => {
        timer = setTimeout(() => resolve(HABIS_WAKTU), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

type HasilBuatAuth =
  | { status: "created"; id: string }
  | { status: "email-taken" }
  | { status: "weak-password" }
  | { status: "bad-email" }
  /** Jawaban tidak sampai. Akun MUNGKIN sudah terbentuk — tidak boleh ditebak. */
  | { status: "unconfirmed" }
  | { status: "failed" };

/**
 * Membuat baris di `auth.users`.
 *
 * `email_confirm: true` disengaja: toko memakai alamat internal (mis.
 * gh-bsd@sanci.com) yang tidak menerima surat, jadi tidak boleh ada email
 * konfirmasi yang harus diklik.
 *
 * Pesan error mentah dari Auth TIDAK PERNAH diteruskan ke pemanggil — hanya
 * dipetakan jadi salah satu status di atas.
 */
async function buatAkunAuth(
  admin: SupabaseClient,
  email: string,
  password: string
): Promise<HasilBuatAuth> {
  let res;
  try {
    res = await balapWaktu(
      admin.auth.admin.createUser({ email, password, email_confirm: true }),
      WRITE_TIMEOUT_MS
    );
  } catch {
    return { status: "unconfirmed" };
  }
  if (res === HABIS_WAKTU) return { status: "unconfirmed" };

  const { data, error } = res;
  if (error) {
    const code = error.code ?? "";
    const status = error.status;
    // Gagal di lapisan jaringan (status tidak ada / 0) atau server bermasalah
    // (5xx): akun bisa saja tetap terbentuk. Jangan mengaku tahu.
    if (status === undefined || status === 0 || status >= 500) return { status: "unconfirmed" };
    if (code === "request_timeout") return { status: "unconfirmed" };
    if (code === "email_exists" || code === "user_already_exists") return { status: "email-taken" };
    // GoTrue lama membalas 422 tanpa kode; teks ini hanya diperiksa, tidak pernah ditampilkan.
    if (status === 422 && /already\s+(been\s+)?registered|already\s+exists/i.test(error.message)) {
      return { status: "email-taken" };
    }
    if (code === "weak_password") return { status: "weak-password" };
    if (code === "email_address_invalid" || code === "validation_failed") {
      return { status: "bad-email" };
    }
    return { status: "failed" };
  }
  if (!data?.user?.id) {
    // Tidak ada error tapi juga tidak ada pengguna — jangan dianggap berhasil (LESSONS #7).
    return { status: "unconfirmed" };
  }
  return { status: "created", id: data.user.id };
}

/**
 * Kompensasi: menghapus akun auth yang BARU SAJA dibuat pemanggil ini, ketika
 * baris penghubungnya terbukti tidak mendarat.
 *
 * Hanya boleh dipanggil dengan id yang benar-benar dikembalikan `createUser`
 * di dalam pemanggilan yang sama — jangan pernah menghapus akun yang cuma
 * "ditemukan" lewat pencarian email, karena itu bisa saja akun milik orang
 * lain (termasuk akun SANCI Admin sendiri, yang memang tidak punya baris
 * `partner_users`).
 *
 * Jaring pengaman tambahan ada di database: `partner_users.auth_user_id`
 * memakai `on delete restrict`, jadi kalau ternyata barisnya SUDAH ada,
 * penghapusan ini ditolak Postgres dan kita jatuh ke jalur "setengah jadi"
 * yang jujur, bukan menghapus akun yang sebenarnya sudah berfungsi.
 *
 * @returns true hanya kalau server benar-benar memastikan akunnya terhapus.
 */
async function hapusAkunAuth(admin: SupabaseClient, authUserId: string): Promise<boolean> {
  try {
    const res = await balapWaktu(admin.auth.admin.deleteUser(authUserId), WRITE_TIMEOUT_MS);
    if (res === HABIS_WAKTU) return false;
    return !res.error;
  } catch {
    return false;
  }
}

export async function createPartnerUser(
  partnerId: string,
  input: { name: string; branchId: string; email: string; password: string }
): Promise<ActionResult<{ id: string; email: string }>> {
  const supabase = await createClient();

  // ── 1. Pemanggil harus SANCI Admin ────────────────────────────────────
  // Dicek dengan sesi pengguna sendiri, SEBELUM kunci service_role disentuh.
  // Urutan ini tidak boleh dibalik: sesudah klien service_role hidup, tidak
  // ada lagi RLS yang menahan apa pun (LESSONS #5).
  const { data: sesi, error: sesiErr } = await supabase.auth.getUser();
  if (sesiErr || !sesi?.user) return { error: { message: PESAN_AKUN.tidakBerwenang } };

  const { data: adminRow, error: adminErr } = await supabase
    .from("platform_admins")
    .select("auth_user_id")
    .eq("auth_user_id", sesi.user.id)
    .maybeSingle();
  // Error database ≠ "bukan admin" (LESSONS #10) — kegagalan teknis tidak boleh
  // menyamar jadi kesimpulan bisnis.
  if (adminErr) return { error: { message: PESAN_AKUN.cekIzinGagal } };
  if (!adminRow) return { error: { message: PESAN_AKUN.tidakBerwenang } };

  // ── 2. Validasi isian ─────────────────────────────────────────────────
  const name = input.name.trim();
  if (!name) return { error: { field: "name", message: "Nama wajib diisi." } };

  const email = input.email.trim().toLowerCase();
  if (!email) return { error: { field: "email", message: "Email wajib diisi." } };
  if (!EMAIL_RE.test(email)) {
    return {
      error: {
        field: "email",
        message: "Format email belum benar. Contoh: gh-bsd@sanci.com",
      },
    };
  }

  const password = input.password;
  if (!password) return { error: { field: "password", message: "Kata sandi awal wajib diisi." } };
  if (password.length < MIN_PANJANG_SANDI) {
    return {
      error: {
        field: "password",
        message: `Kata sandi awal minimal ${MIN_PANJANG_SANDI} karakter. Tekan "Buat otomatis" kalau ingin dibuatkan sistem.`,
      },
    };
  }

  // ── 3. Cabang: pasangan partner↔cabang dicari ulang di server ─────────
  // partner_id/branch_id dari browser tidak pernah dipercaya (LESSONS #6).
  if (!input.branchId) {
    return { error: { field: "branch_id", message: "Cabang wajib dipilih." } };
  }
  const { data: branch, error: branchErr } = await supabase
    .from("partner_branches")
    .select("id, status")
    .eq("id", input.branchId)
    .eq("partner_id", partnerId)
    .maybeSingle();
  if (branchErr) return { error: { message: PESAN.serverSibuk } };
  if (!branch) {
    return { error: { field: "branch_id", message: "Cabang tidak ditemukan pada partner ini." } };
  }
  if (branch.status !== "ACTIVE") {
    return {
      error: {
        field: "branch_id",
        message: "Cabang itu sedang tidak aktif. Aktifkan cabangnya dulu, baru buat akunnya.",
      },
    };
  }

  // ── 4. Baru sekarang kunci service_role dipakai ───────────────────────
  const admin = createAdminClient();
  // Kunci belum diatur di Vercel: turunkan fungsinya dengan penjelasan, jangan
  // rusak (LESSONS #12). Tidak ada satu pun tulisan yang sudah terjadi di atas.
  if (!admin) return { error: { message: PESAN_AKUN.kunciBelumDiatur } };

  // ── 5. Akun login ─────────────────────────────────────────────────────
  const dibuat = await buatAkunAuth(admin, email, password);
  if (dibuat.status === "email-taken") {
    return { error: { field: "email", message: PESAN_AKUN.emailDipakai } };
  }
  if (dibuat.status === "weak-password") {
    return { error: { field: "password", message: PESAN_AKUN.sandiLemah } };
  }
  if (dibuat.status === "bad-email") {
    return { error: { field: "email", message: PESAN_AKUN.emailDitolak } };
  }
  if (dibuat.status === "unconfirmed") {
    // Akun MUNGKIN terbentuk tapi idnya tidak kita pegang. Menghapus "akun
    // dengan email itu" yang ditemukan lewat pencarian terlalu berbahaya
    // (bisa mengenai akun orang lain), jadi keadaannya dilaporkan apa adanya.
    return { error: { message: PESAN_AKUN.buatTidakPasti } };
  }
  if (dibuat.status !== "created") {
    return { error: { message: PESAN_AKUN.gagalBuat } };
  }
  const authUserId = dibuat.id;

  // ── 6. Baris penghubung — SENGAJA dengan sesi biasa, bukan service_role ──
  // Dengan begitu policy `u_admin_all` ikut memeriksa sekali lagi: seandainya
  // pemeriksaan admin di langkah 1 pernah bisa ditembus, RLS masih menolak.
  const terhubung = await safeWrite(
    supabase
      .from("partner_users")
      .insert({
        auth_user_id: authUserId,
        name,
        partner_id: partnerId,
        branch_id: branch.id,
        role: "BRANCH_USER",
      })
      .select("id")
      .single()
  );
  if (terhubung.ok) {
    revalidatePath(`/admin/partners/${partnerId}`);
    return { data: { id: terhubung.data.id, email } };
  }

  // ── 7. Gagal di tengah jalan ──────────────────────────────────────────
  // Sebelum membatalkan apa pun: TANYA server barisnya benar-benar ada atau
  // tidak. `safeWrite` bisa gagal karena jawaban hilang (baris mungkin sudah
  // mendarat) atau karena unique `auth_user_id` — dan bentrok unique di kolom
  // itu justru berarti percobaan sebelumnya SUDAH berhasil (LESSONS #21).
  const cek = await confirmByRequestId(
    supabase.from("partner_users").select("id").eq("auth_user_id", authUserId).maybeSingle()
  );
  if (cek.status === "found") {
    revalidatePath(`/admin/partners/${partnerId}`);
    return { data: { id: cek.data.id, email } };
  }
  if (cek.status === "unknown") {
    // Tidak tahu barisnya ada atau tidak → JANGAN hapus akun auth-nya; kalau
    // ternyata sudah terhubung, penghapusan itu merusak akun yang berfungsi.
    return { error: { message: pesanSetengahJadi(email) } };
  }

  // Terbukti tidak ada baris penghubung → akun auth ini yatim. Batalkan.
  const terhapus = await hapusAkunAuth(admin, authUserId);
  if (terhapus) return { error: { message: PESAN_AKUN.batalBersih } };

  // Pembatalan pun gagal. Laporkan keadaan sebenarnya — jangan pernah mengaku
  // berhasil, dan jangan pernah berpura-pura tidak terjadi apa-apa.
  return { error: { message: pesanSetengahJadi(email) } };
}
