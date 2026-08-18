/**
 * Perlindungan jaringan lemah (SPEC §57–63).
 *
 * Dipakai di DUA sisi, karena ada dua ruas jaringan yang bisa putus:
 *   1. Browser → Server Action  → `submitSafely()` (dipanggil komponen client)
 *   2. Server  → Supabase       → `safeWrite()` / `confirmByRequestId()`
 *      (dipanggil di dalam Server Action)
 *
 * Aturan yang tidak boleh dilanggar:
 *   - Supabase TIDAK melempar error saat gagal — hasilnya ada di field `error`.
 *     Jadi field itu WAJIB diperiksa setiap kali, bukan hanya `try/catch`.
 *   - Respons hilang ≠ gagal. Kalau jawaban tidak sampai, statusnya ditanyakan
 *     ulang ke server lewat `client_request_id`, bukan ditebak dan bukan
 *     ditulis ulang begitu saja (LESSONS #2, #3).
 *   - Tidak pernah menampilkan "berhasil" tanpa konfirmasi server.
 *   - Tidak pernah menampilkan error mentah Postgres/jaringan ke pengguna.
 */

import type { PostgrestSingleResponse } from "@supabase/supabase-js";
import type { Messages } from "./i18n/messages";

export const WRITE_TIMEOUT_MS = 15_000;
export const LOOKUP_TIMEOUT_MS = 10_000;

/**
 * Semua teks jaringan untuk pengguna, dalam bahasa yang sedang dipakai.
 *
 * DULU ini konstanta `PESAN` berbahasa Indonesia. Sekarang teksnya hidup di
 * lib/i18n/messages/common.ts (kunci `net*`) dan file ini hanya memberi nama
 * pendek yang sama seperti dulu, supaya pemanggil cukup menambah satu baris:
 *
 *   // Server Action ("use server") — boleh membaca cookie sendiri:
 *   const PESAN = pesan(await getMessages());
 *   return { error: { message: PESAN.serverSibuk } };
 *
 *   // Komponen client:
 *   const PESAN = pesan(useMessages());
 *
 * Kenapa fungsi dan bukan kunci mentah yang diterjemahkan pemanggil: Server
 * Action mengembalikan `{ error: { message } }` yang langsung ditampilkan
 * komponen. Kalau yang dikirim kunci, SETIAP komponen harus tahu cara
 * menerjemahkannya — satu yang lupa = kode mentah di layar pengguna.
 */
export function pesan(m: Messages) {
  return {
    offline: m.common.netOffline,
    belumTersimpan: m.common.netNotSaved,
    belumPastiBaru: m.common.netUnsureCreate,
    belumPastiUbah: m.common.netUnsureUpdate,
    serverSibuk: m.common.netServerBusy,
  } as const;
}

export type PesanJaringan = ReturnType<typeof pesan>;

/* ------------------------------------------------------------------ *
 * Sisi server: membungkus panggilan Supabase
 * ------------------------------------------------------------------ */

export type SafeWriteOutcome<T> =
  | { ok: true; data: T }
  /** Server menjawab dan menolak — penyebabnya pasti diketahui. */
  | { ok: false; reason: "db"; code?: string; detail: string }
  /** Jawaban tidak sampai (timeout / jaringan). Tulisan MUNGKIN sudah mendarat. */
  | { ok: false; reason: "unconfirmed" };

const TIMED_OUT = Symbol("timeout");

async function raceTimeout<T>(op: PromiseLike<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      op,
      new Promise<typeof TIMED_OUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMED_OUT), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Menjalankan satu perintah tulis Supabase dengan batas waktu, dan SELALU
 * memeriksa field `error` (Supabase tidak melempar exception saat gagal).
 */
export async function safeWrite<T>(
  op: PromiseLike<PostgrestSingleResponse<T>>,
  timeoutMs: number = WRITE_TIMEOUT_MS
): Promise<SafeWriteOutcome<NonNullable<T>>> {
  let res: PostgrestSingleResponse<T> | typeof TIMED_OUT;
  try {
    res = await raceTimeout(op, timeoutMs);
  } catch {
    // Gagal di lapisan jaringan (fetch gagal). Tulisan bisa saja sudah mendarat.
    return { ok: false, reason: "unconfirmed" };
  }
  if (res === TIMED_OUT) return { ok: false, reason: "unconfirmed" };

  if (res.error) {
    return {
      ok: false,
      reason: "db",
      code: res.error.code,
      detail: `${res.error.message ?? ""} ${res.error.details ?? ""}`,
    };
  }
  if (res.data === null || res.data === undefined) {
    // Tidak ada error tapi juga tidak ada baris — jangan dianggap berhasil.
    return { ok: false, reason: "db", code: undefined, detail: "no row returned" };
  }
  return { ok: true, data: res.data as NonNullable<T> };
}

export type ConfirmOutcome<T> =
  | { status: "found"; data: T }
  | { status: "absent" }
  | { status: "unknown" };

/**
 * Menanyakan ulang ke server apakah baris dengan `client_request_id` tertentu
 * benar-benar ada. Dipakai setelah respons hilang — bukan menulis ulang.
 */
export async function confirmByRequestId<T>(
  op: PromiseLike<PostgrestSingleResponse<T>>,
  timeoutMs: number = LOOKUP_TIMEOUT_MS
): Promise<ConfirmOutcome<NonNullable<T>>> {
  let res: PostgrestSingleResponse<T> | typeof TIMED_OUT;
  try {
    res = await raceTimeout(op, timeoutMs);
  } catch {
    return { status: "unknown" };
  }
  if (res === TIMED_OUT) return { status: "unknown" };
  if (res.error) return { status: "unknown" };
  if (res.data === null || res.data === undefined) return { status: "absent" };
  return { status: "found", data: res.data as NonNullable<T> };
}

/**
 * Apakah pelanggaran unique berasal dari kolom idempotency, bukan dari kode
 * bisnis? Kalau ya, artinya percobaan sebelumnya SUDAH mendarat — itu berhasil,
 * bukan error kode duplikat.
 */
export function isRequestIdConflict(outcome: {
  code?: string;
  detail?: string;
}): boolean {
  return outcome.code === "23505" && (outcome.detail ?? "").includes("client_request_id");
}

/* ------------------------------------------------------------------ *
 * Sisi client: membungkus panggilan ke Server Action
 * ------------------------------------------------------------------ */

/** Hasil pencarian ulang berdasarkan nomor permintaan (dikembalikan Server Action). */
export type LookupResult = { found: true; id: string } | { found: false } | { unknown: true };

export type SafeSubmit<R> =
  /** Server menjawab. Isi jawabannya (berhasil / ditolak) ada di `result`. */
  | { status: "ok"; result: R }
  /** Respons hilang, TAPI pengecekan ulang membuktikan data sudah masuk — ini benar-benar berhasil. */
  | { status: "confirmed"; id: string }
  /** Respons hilang dan pengecekan membuktikan TIDAK ada data yang masuk. */
  | { status: "not-saved"; message: string }
  /** Respons hilang dan statusnya tidak bisa dipastikan. Jangan pernah disebut berhasil. */
  | { status: "unconfirmed"; message: string }
  /** Perangkat sedang tanpa internet — belum dicoba kirim sama sekali. */
  | { status: "offline"; message: string };

/**
 * Membungkus satu panggilan Server Action dari browser.
 *
 * `lookup` hanya diisi untuk form BUAT BARU yang punya `client_request_id`;
 * form ubah tidak butuh karena menyimpan perubahan yang sama dua kali tidak
 * menghasilkan baris ganda.
 */
/** Tanpa `lookup` (form ubah), status "confirmed"/"not-saved" tidak mungkin terjadi. */
export type SafeSubmitNoLookup<R> = Extract<
  SafeSubmit<R>,
  { status: "ok" | "unconfirmed" | "offline" }
>;

export async function submitSafely<R>(opts: {
  run: () => Promise<R>;
  lookup: () => Promise<LookupResult>;
  messages: Messages;
  kind?: "create" | "update";
  timeoutMs?: number;
}): Promise<SafeSubmit<R>>;
export async function submitSafely<R>(opts: {
  run: () => Promise<R>;
  lookup?: undefined;
  messages: Messages;
  kind?: "create" | "update";
  timeoutMs?: number;
}): Promise<SafeSubmitNoLookup<R>>;
export async function submitSafely<R>(opts: {
  run: () => Promise<R>;
  lookup?: () => Promise<LookupResult>;
  messages: Messages;
  kind?: "create" | "update";
  timeoutMs?: number;
}): Promise<SafeSubmit<R>> {
  // `messages` WAJIB (bukan opsional dengan cadangan Bahasa Indonesia):
  // pemanggil yang lupa harus ketahuan saat build, bukan muncul sebagai
  // kalimat Indonesia di tengah layar berbahasa Mandarin (LESSONS #13).
  const PESAN = pesan(opts.messages);
  const kind = opts.kind ?? (opts.lookup ? "create" : "update");
  const belumPasti = kind === "create" ? PESAN.belumPastiBaru : PESAN.belumPastiUbah;

  // Cek awal: kalau perangkat jelas-jelas offline, jangan berpura-pura mengirim.
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { status: "offline", message: PESAN.offline };
  }

  let res: R | typeof TIMED_OUT;
  try {
    res = await raceTimeout(opts.run(), opts.timeoutMs ?? WRITE_TIMEOUT_MS);
  } catch {
    res = TIMED_OUT; // koneksi putus di tengah jalan
  }
  if (res !== TIMED_OUT) return { status: "ok", result: res };

  // Respons tidak sampai. Tanyakan ke server, jangan kirim ulang buta-buta.
  if (!opts.lookup) return { status: "unconfirmed", message: belumPasti };

  let check: LookupResult;
  try {
    check = await opts.lookup();
  } catch {
    return { status: "unconfirmed", message: belumPasti };
  }
  if ("unknown" in check) return { status: "unconfirmed", message: belumPasti };
  if (check.found) return { status: "confirmed", id: check.id };
  return { status: "not-saved", message: PESAN.belumTersimpan };
}
