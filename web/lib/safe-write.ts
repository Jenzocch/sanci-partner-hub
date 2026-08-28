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
import type { CommonMessages } from "./i18n/messages";
import { BUILD_ID } from "./build-id";

/**
 * Dipakai dari `/cabang/**` DAN `/admin/**` sekaligus, dan cuma pernah
 * membaca `m.common.*` — jadi tipenya bentuk struktural minimal ini, bukan
 * `CabangMessages`/`AdminMessages` penuh. `CabangMessages` dan `AdminMessages`
 * keduanya punya field `common` berbentuk sama, jadi keduanya otomatis cocok
 * di sini tanpa konversi apa pun di titik panggil.
 */
type HasCommon = { common: CommonMessages };

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
 *   const PESAN = pesan(await getCabangMessages()); // atau getAdminMessages()
 *   return { error: { message: PESAN.serverSibuk } };
 *
 *   // Komponen client:
 *   const PESAN = pesan(useCabangMessages()); // atau useAdminMessages()
 *
 * Kenapa fungsi dan bukan kunci mentah yang diterjemahkan pemanggil: Server
 * Action mengembalikan `{ error: { message } }` yang langsung ditampilkan
 * komponen. Kalau yang dikirim kunci, SETIAP komponen harus tahu cara
 * menerjemahkannya — satu yang lupa = kode mentah di layar pengguna.
 *
 * `tombol` = TULISAN PERSIS di tombol yang barusan ditekan pengguna; mengisi
 * `{tombol}` di kunci `net*`. Kalimat-kalimat itu dulu menyebut "Simpan"
 * mati-matian, padahal tombolnya sering "Buat Pesanan" / "Simpan Penawaran" /
 * "Ya, sudah diterima" — pengguna disuruh menekan tombol yang tidak ada di
 * layarnya (audit teks 2026-08-28). Default `common.save` menjaga kalimat
 * lama untuk pemanggil sisi server yang memang berakhir di layar bertombol
 * Simpan; komponen client menyodorkan labelnya sendiri lewat `buttonLabel`
 * pada submitSafely.
 */
export function pesan(m: HasCommon, tombol?: string) {
  const label = tombol ?? m.common.save;
  const isi = (teks: string) => teks.replace("{tombol}", label);
  return {
    offline: isi(m.common.netOffline),
    belumTersimpan: isi(m.common.netNotSaved),
    belumPastiBaru: isi(m.common.netUnsureCreate),
    belumPastiUbah: isi(m.common.netUnsureUpdate),
    // Tidak menyebut tombol apa pun ("Coba lagi sebentar lagi") — sengaja
    // tidak ikut disulih.
    serverSibuk: m.common.netServerBusy,
    staleBelumTersimpan: isi(m.common.netStaleNotSaved),
    staleBelumPasti: isi(m.common.netStaleUnsure),
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
  /**
   * Terbukti TIDAK ada data yang masuk: pengecekan `lookup` bilang absent,
   * ATAU (`stale: true`) server menolak action-nya sebagai 404 "tidak
   * dikenal" — permintaan seperti itu tidak pernah dijalankan sama sekali.
   */
  | { status: "not-saved"; message: string; stale?: true }
  /**
   * Statusnya tidak bisa dipastikan. Jangan pernah disebut berhasil.
   * `stale: true` = halaman ini terdeteksi berasal dari deployment lama —
   * `message` sudah berisi teks "muat ulang halaman", BUKAN saran "tekan
   * Simpan lagi"; pemanggil yang biasa mengganti `message` dengan teks
   * layar sendiri harus membiarkan pesan stale ini tampil apa adanya.
   */
  | { status: "unconfirmed"; message: string; stale?: true }
  /** Perangkat sedang tanpa internet — belum dicoba kirim sama sekali. */
  | { status: "offline"; message: string };

/* ------------------------------------------------------------------ *
 * Deteksi "halaman dari deployment lama" (skew antar deployment).
 *
 * Kejadian nyata (2×, log server: 10× HTTP 404 "Failed to find Server
 * Action"): tab yang dibuka sebelum deploy men-submit setelah deploy —
 * server baru tidak mengenal id action lama, menjawab 404 TANPA menjalankan
 * apa pun, dan client melempar error. Dulu error itu jatuh ke pesan
 * "koneksi terputus… tekan Simpan lagi" — nasihat yang justru salah:
 * menekan Simpan lagi TIDAK PERNAH bisa berhasil sebelum halaman dimuat
 * ulang. Dua lapis deteksi:
 *   A. Bentuk error yang dilempar client Next saat action 404
 *      (`UnrecognizedActionError` sejak 15.5; versi lebih lama melempar
 *      Error biasa berisi teks 404 text/plain dari server).
 *   B. Kalau A tidak cocok: tanya GET /version (id build server sekarang)
 *      dan bandingkan dengan BUILD_ID yang dibakar di bundle ini. Probe
 *      gagal / sama = bukan bukti — pesan jaringan lama tetap dipakai.
 * ------------------------------------------------------------------ */

const STALE_PROBE_TIMEOUT_MS = 2_000;

/**
 * Lapisan A. Server 15.5 menjawab 404 + header `x-nextjs-action-not-found`
 * tanpa menyentuh action-nya (next/dist/server/app-render/action-handler.js,
 * `handleUnrecognizedFetchAction` — return sebelum decode/eksekusi), lalu
 * client melempar `UnrecognizedActionError` ("Server Action … was not found
 * on the server"). Server yang lebih lama memakai teks "Failed to find
 * Server Action". Cocok salah satunya = action TERBUKTI tidak dijalankan.
 */
function isStaleActionError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === "UnrecognizedActionError") return true;
  const msg = err.message || "";
  return (
    msg.includes("Failed to find Server Action") ||
    msg.includes("was not found on the server") ||
    msg.includes("failed-to-find-server-action")
  );
}

/**
 * Lapisan B. `true` HANYA bila server menjawab dan id-nya beda dari punya
 * bundle ini. Timeout / gagal / kosong / sama semuanya `false`: tanpa bukti,
 * jangan menuduh "versi lama" — biarkan pesan jaringan yang jujur tampil.
 */
async function serverIsNewerDeployment(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), STALE_PROBE_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch("/version", { cache: "no-store", signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return false;
    const serverId = (await res.text()).trim();
    return serverId !== "" && serverId !== BUILD_ID;
  } catch {
    return false;
  }
}

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
  messages: HasCommon;
  buttonLabel?: string;
  kind?: "create" | "update";
  timeoutMs?: number;
}): Promise<SafeSubmit<R>>;
export async function submitSafely<R>(opts: {
  run: () => Promise<R>;
  lookup?: undefined;
  messages: HasCommon;
  buttonLabel?: string;
  kind?: "create" | "update";
  timeoutMs?: number;
}): Promise<SafeSubmitNoLookup<R>>;
export async function submitSafely<R>(opts: {
  run: () => Promise<R>;
  lookup?: () => Promise<LookupResult>;
  messages: HasCommon;
  /**
   * Tulisan PERSIS di tombol yang memicu penulisan ini (mis.
   * `m.cabang.createOrderCta`), untuk `{tombol}` di pesan jaringan. Jangan
   * mengarang kalimat sendiri — ambil string yang sama dengan yang dirender
   * tombolnya, supaya kutipannya selalu cocok dengan layar. Dibiarkan kosong
   * = "Simpan" (`common.save`), yang HANYA benar kalau tombolnya memang
   * Simpan.
   */
  buttonLabel?: string;
  kind?: "create" | "update";
  timeoutMs?: number;
}): Promise<SafeSubmit<R>> {
  // `messages` WAJIB (bukan opsional dengan cadangan Bahasa Indonesia):
  // pemanggil yang lupa harus ketahuan saat build, bukan muncul sebagai
  // kalimat Indonesia di tengah layar berbahasa Mandarin (LESSONS #13).
  const PESAN = pesan(opts.messages, opts.buttonLabel);
  const kind = opts.kind ?? (opts.lookup ? "create" : "update");
  const belumPasti = kind === "create" ? PESAN.belumPastiBaru : PESAN.belumPastiUbah;

  // Cek awal: kalau perangkat jelas-jelas offline, jangan berpura-pura mengirim.
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { status: "offline", message: PESAN.offline };
  }

  let res: R | typeof TIMED_OUT;
  let thrown: unknown = undefined;
  try {
    res = await raceTimeout(opts.run(), opts.timeoutMs ?? WRITE_TIMEOUT_MS);
  } catch (err) {
    thrown = err; // koneksi putus di tengah jalan — atau action ditolak 404
    res = TIMED_OUT;
  }
  if (res !== TIMED_OUT) return { status: "ok", result: res };

  // Lapisan A: action ditolak 404 "tidak dikenal" = TERBUKTI tidak pernah
  // dijalankan (server menolak sebelum menyentuh kodenya) — boleh bilang
  // "belum tersimpan" (LESSONS #7: itu bukti, bukan tebakan). `lookup` pun
  // TIDAK dipanggil: lookup juga Server Action dari bundle lama yang sama,
  // hasilnya pasti 404 juga. Pada jalur tanpa-lookup status "unconfirmed"
  // dipertahankan demi kompatibilitas tipe pemanggil (SafeSubmitNoLookup);
  // kebenaran untuk pengguna ada di `message` + penanda `stale`.
  if (isStaleActionError(thrown)) {
    return opts.lookup
      ? { status: "not-saved", message: PESAN.staleBelumTersimpan, stale: true }
      : { status: "unconfirmed", message: PESAN.staleBelumTersimpan, stale: true };
  }

  // Lapisan B untuk semua jalur "belum pasti": kalau server TERBUKTI sudah
  // deployment lain, saran "tekan Simpan lagi" salah — submit berikutnya
  // akan 404. Probe gagal/sama = tetap pesan jaringan lama yang jujur.
  const unconfirmed = async (): Promise<SafeSubmit<R>> =>
    (await serverIsNewerDeployment())
      ? { status: "unconfirmed", message: PESAN.staleBelumPasti, stale: true }
      : { status: "unconfirmed", message: belumPasti };

  // Respons tidak sampai. Tanyakan ke server, jangan kirim ulang buta-buta.
  if (!opts.lookup) return unconfirmed();

  let check: LookupResult;
  try {
    check = await opts.lookup();
  } catch (err) {
    // Lookup-nya sendiri yang ditolak 404 → deployment PASTI sudah baru,
    // tapi nasib tulisan yang tadi timeout tetap tidak terbukti (bisa saja
    // sempat mendarat di server lama sebelum pergantian) → varian "belum
    // pasti", bukan "belum tersimpan".
    if (isStaleActionError(err)) {
      return { status: "unconfirmed", message: PESAN.staleBelumPasti, stale: true };
    }
    return unconfirmed();
  }
  if ("unknown" in check) return unconfirmed();
  if (check.found) return { status: "confirmed", id: check.id };
  return { status: "not-saved", message: PESAN.belumTersimpan };
}
