"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pesan, WRITE_TIMEOUT_MS, confirmByRequestId, safeWrite } from "@/lib/safe-write";
import { getMessages, type Messages } from "@/lib/i18n";

type ActionError = { field?: string; message: string };
type ActionResult<T> = { data: T } | { error: ActionError };

export async function toggleUserStatus(userId: string): Promise<ActionResult<true>> {
  const m = await getMessages();
  const supabase = await createClient();
  const { data: user } = await supabase
    .from("partner_users")
    .select("status, partner_id")
    .eq("id", userId)
    .maybeSingle();
  if (!user) return { error: { message: m.admin.userNotFound } };

  const nextStatus = user.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
  const { data: updated, error } = await supabase
    .from("partner_users")
    .update({ status: nextStatus })
    .eq("id", userId)
    .select("id")
    .maybeSingle();
  // RLS bisa menyaring update ini jadi 0 baris tanpa error — jangan anggap berhasil
  // kalau tidak ada baris yang benar-benar berubah (LESSONS #7).
  if (error || !updated) return { error: { message: m.admin.userToggleFailed } };

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

/**
 * Panjang minimum kata sandi. Kata sandinya ditentukan sendiri oleh toko
 * (biasanya dikirim ke SANCI lewat WhatsApp), jadi angka ini satu-satunya
 * saringan di sisi kami. Kalau proyek Supabase punya syarat yang lebih ketat,
 * penolakannya diterjemahkan lewat pesanAkun(m).sandiLemah — bukan ditampilkan
 * apa adanya.
 */
const MIN_PANJANG_SANDI = 10;

// Teksnya hidup di lib/i18n/messages/admin.ts (kunci `user*`) — fungsi ini
// hanya memberi nama pendek yang sama seperti konstanta lama, supaya
// pemanggilnya tidak berubah banyak. Jaga makna kata-katanya persis: ini
// menjelaskan keamanan kata sandi (sistem menyimpan sidik jari, bukan kata
// sandi itu sendiri) dan keadaan setengah-jadi yang JUJUR, bukan disamarkan.
function pesanAkun(m: Messages) {
  return {
    tidakBerwenang: m.admin.userNotAuthorized,
    cekIzinGagal: m.admin.userPermCheckFailed,
    kunciBelumDiatur: m.admin.userServiceKeyMissingCreate,
    emailDipakai: m.admin.userEmailTaken,
    sandiLemah: m.admin.userWeakPassword,
    emailDitolak: m.admin.userEmailRejected,
    gagalBuat: m.admin.userCreateFailedGeneric,
    buatTidakPasti: m.admin.userCreateUnconfirmedMsg,
    batalBersih: m.admin.userCreateCleanRollback,
  } as const;
}

/** Keadaan setengah jadi — WAJIB jujur, tidak boleh disebut berhasil (LESSONS #2/#7). */
function pesanSetengahJadi(m: Messages, email: string): string {
  return m.admin.userHalfCreated.replace("{email}", email);
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
  const m = await getMessages();
  const PESAN = pesan(m);
  const PESAN_AKUN = pesanAkun(m);
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
  if (!name) return { error: { field: "name", message: m.admin.userNameRequiredField } };

  const email = input.email.trim().toLowerCase();
  if (!email) return { error: { field: "email", message: m.admin.userEmailRequiredField } };
  if (!EMAIL_RE.test(email)) {
    return {
      error: {
        field: "email",
        message: m.admin.userEmailFormatInvalid,
      },
    };
  }

  const password = input.password;
  if (!password) {
    return { error: { field: "password", message: m.admin.userPasswordRequiredField } };
  }
  if (password.length < MIN_PANJANG_SANDI) {
    return {
      error: {
        field: "password",
        message: m.admin.userPasswordTooShort.replace("{min}", String(MIN_PANJANG_SANDI)),
      },
    };
  }

  // ── 3. Cabang: pasangan partner↔cabang dicari ulang di server ─────────
  // partner_id/branch_id dari browser tidak pernah dipercaya (LESSONS #6).
  if (!input.branchId) {
    return { error: { field: "branch_id", message: m.admin.userBranchRequiredField } };
  }
  const { data: branch, error: branchErr } = await supabase
    .from("partner_branches")
    .select("id, status")
    .eq("id", input.branchId)
    .eq("partner_id", partnerId)
    .maybeSingle();
  if (branchErr) return { error: { message: PESAN.serverSibuk } };
  if (!branch) {
    return { error: { field: "branch_id", message: m.admin.userBranchNotFoundOnPartner } };
  }
  if (branch.status !== "ACTIVE") {
    return {
      error: {
        field: "branch_id",
        message: m.admin.userBranchInactive,
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
    return { error: { message: pesanSetengahJadi(m, email) } };
  }

  // Terbukti tidak ada baris penghubung → akun auth ini yatim. Batalkan.
  const terhapus = await hapusAkunAuth(admin, authUserId);
  if (terhapus) return { error: { message: PESAN_AKUN.batalBersih } };

  // Pembatalan pun gagal. Laporkan keadaan sebenarnya — jangan pernah mengaku
  // berhasil, dan jangan pernah berpura-pura tidak terjadi apa-apa.
  return { error: { message: pesanSetengahJadi(m, email) } };
}

/* ==================================================================== *
 * Mengganti kata sandi akun cabang (P-07 lanjutan)
 *
 * Kenapa fitur ini ada, dan kenapa TIDAK ADA layar "lihat kata sandi":
 *
 * Sistem login tidak menyimpan kata sandinya, hanya sidik jarinya, jadi kata
 * sandi yang sudah tersimpan memang tidak bisa dibaca kembali oleh siapa pun —
 * termasuk SANCI. Menyimpan salinan yang bisa dibaca ulang (di tabel mana pun,
 * dengan cara apa pun) DILARANG di proyek ini: siapa saja yang bisa membuka
 * database akan melihat kata sandi SEMUA toko sekaligus, dan toko lazim memakai
 * kata sandi yang sama di tempat lain. Jadi satu-satunya jalan untuk toko yang
 * lupa kata sandi adalah menetapkan kata sandi baru di sini.
 *
 * Urutan pemakaian service_role SAMA PERSIS dengan createPartnerUser dan tidak
 * boleh dibalik (LESSONS #19):
 *
 *   1. Pastikan pemanggilnya SANCI Admin — dengan sesi pengguna sendiri, RLS
 *      masih aktif.
 *   2. Baris akun sasaran dibaca ulang di server memakai sesi biasa; yang
 *      datang dari browser hanya id baris `partner_users`, tidak pernah
 *      `auth_user_id` (LESSONS #6). Policy `u_admin_all` ikut menjaga sekali
 *      lagi di sini.
 *   3. BARU sesudah itu klien service_role dibuat, dan HANYA untuk satu
 *      panggilan Auth (`auth.admin.updateUserById`).
 *   4. Nilai kuncinya tidak pernah di-log, tidak pernah dikembalikan, dan tidak
 *      pernah masuk pesan error.
 *
 * Berbeda dengan pembuatan akun, fungsi ini TIDAK menulis dua tahap: hanya satu
 * operasi Auth, tidak ada baris tabel yang ikut berubah, jadi tidak ada keadaan
 * setengah jadi dan tidak ada yang perlu dibatalkan. Kalau jawabannya hilang,
 * mengulang dengan kata sandi baru yang sama sepenuhnya aman.
 * ==================================================================== */

// Sama pola dengan pesanAkun(m) di atas — teksnya hidup di admin.ts (kunci
// `reset*`). Jaga makna persis: menjelaskan bahwa kata sandi lama tetap
// berlaku sampai penggantian sukses, dan keadaan "belum pasti" TIDAK boleh
// disebut berhasil.
function pesanReset(m: Messages) {
  return {
    kunciBelumDiatur: m.admin.resetServiceKeyMissing,
    akunTidakAda: m.admin.resetAccountNotFound,
    akunTidakLengkap: m.admin.resetAccountIncomplete,
    gagal: m.admin.resetGenericFail,
    tidakPasti: m.admin.resetPasswordUnconfirmedMsg,
  } as const;
}

type HasilGantiSandi =
  | { status: "updated" }
  | { status: "weak-password" }
  | { status: "user-missing" }
  /** Jawaban tidak sampai. Kata sandi MUNGKIN sudah berganti — tidak boleh ditebak. */
  | { status: "unconfirmed" }
  | { status: "failed" };

/**
 * Satu-satunya operasi service_role di alur ini.
 *
 * Pesan error mentah dari Auth TIDAK PERNAH diteruskan ke pemanggil — hanya
 * dipetakan jadi salah satu status di atas.
 */
async function gantiKataSandiAuth(
  admin: SupabaseClient,
  authUserId: string,
  password: string
): Promise<HasilGantiSandi> {
  let res;
  try {
    res = await balapWaktu(
      admin.auth.admin.updateUserById(authUserId, { password }),
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
    // (5xx): kata sandi bisa saja tetap berganti. Jangan mengaku tahu.
    if (status === undefined || status === 0 || status >= 500) return { status: "unconfirmed" };
    if (code === "request_timeout") return { status: "unconfirmed" };
    if (code === "weak_password") return { status: "weak-password" };
    // GoTrue lama membalas 422 tanpa kode; teks ini hanya diperiksa, tidak pernah ditampilkan.
    if (status === 422 && /password/i.test(error.message)) return { status: "weak-password" };
    if (code === "user_not_found" || status === 404) return { status: "user-missing" };
    return { status: "failed" };
  }
  if (!data?.user?.id) {
    // Tidak ada error tapi juga tidak ada pengguna — jangan dianggap berhasil (LESSONS #7).
    return { status: "unconfirmed" };
  }
  return { status: "updated" };
}

export async function resetPartnerUserPassword(
  userId: string,
  password: string
): Promise<ActionResult<true>> {
  const m = await getMessages();
  const PESAN = pesan(m);
  const PESAN_AKUN = pesanAkun(m);
  const PESAN_RESET = pesanReset(m);
  const supabase = await createClient();

  // ── 1. Pemanggil harus SANCI Admin ────────────────────────────────────
  // Dicek dengan sesi pengguna sendiri, SEBELUM kunci service_role disentuh.
  const { data: sesi, error: sesiErr } = await supabase.auth.getUser();
  if (sesiErr || !sesi?.user) return { error: { message: PESAN_AKUN.tidakBerwenang } };

  const { data: adminRow, error: adminErr } = await supabase
    .from("platform_admins")
    .select("auth_user_id")
    .eq("auth_user_id", sesi.user.id)
    .maybeSingle();
  // Error database ≠ "bukan admin" (LESSONS #10).
  if (adminErr) return { error: { message: PESAN_AKUN.cekIzinGagal } };
  if (!adminRow) return { error: { message: PESAN_AKUN.tidakBerwenang } };

  // ── 2. Validasi isian ─────────────────────────────────────────────────
  // Kecocokan "ketik ulang" diperiksa di layar (server hanya menerima satu
  // nilai) — pemeriksaan panjangnya tetap di sini supaya tidak bisa dilewati.
  if (!password) {
    return { error: { field: "password", message: m.admin.resetPasswordRequiredField } };
  }
  if (password.length < MIN_PANJANG_SANDI) {
    return {
      error: {
        field: "password",
        message: m.admin.resetPasswordTooShortField.replace("{min}", String(MIN_PANJANG_SANDI)),
      },
    };
  }

  // ── 3. Akun sasaran dicari ulang di server, masih dengan sesi biasa ───
  // Browser hanya mengirim id baris partner_users; `auth_user_id` dibaca di
  // sini lewat RLS (LESSONS #6). Kalau suatu saat langkah 1 bisa ditembus,
  // policy `u_admin_all` membuat pembacaan ini tidak mengembalikan apa pun,
  // jadi kunci service_role di bawah tidak pernah punya sasaran.
  if (!userId) return { error: { message: PESAN_RESET.akunTidakAda } };
  const { data: target, error: targetErr } = await supabase
    .from("partner_users")
    .select("id, auth_user_id")
    .eq("id", userId)
    .maybeSingle();
  if (targetErr) return { error: { message: PESAN.serverSibuk } };
  if (!target) return { error: { message: PESAN_RESET.akunTidakAda } };
  if (!target.auth_user_id) return { error: { message: PESAN_RESET.akunTidakLengkap } };

  // ── 4. Baru sekarang kunci service_role dipakai ───────────────────────
  const admin = createAdminClient();
  // Kunci belum diatur di Vercel: turunkan fungsinya dengan penjelasan, jangan
  // rusak (LESSONS #12). Belum ada apa pun yang berubah sampai baris ini.
  if (!admin) return { error: { message: PESAN_RESET.kunciBelumDiatur } };

  // ── 5. Ganti kata sandinya ────────────────────────────────────────────
  const hasil = await gantiKataSandiAuth(admin, target.auth_user_id, password);
  if (hasil.status === "weak-password") {
    return { error: { field: "password", message: PESAN_AKUN.sandiLemah } };
  }
  if (hasil.status === "user-missing") {
    return { error: { message: PESAN_RESET.akunTidakLengkap } };
  }
  if (hasil.status === "unconfirmed") {
    return { error: { message: PESAN_RESET.tidakPasti } };
  }
  if (hasil.status !== "updated") {
    return { error: { message: PESAN_RESET.gagal } };
  }

  // Tidak ada kolom yang ditampilkan di layar ikut berubah (kata sandinya
  // memang tidak disimpan di tabel mana pun), jadi tidak ada yang perlu
  // dimuat ulang — revalidatePath sengaja tidak dipanggil di sini.
  return { data: true };
}
