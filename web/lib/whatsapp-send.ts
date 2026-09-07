/* ==========================================================================
 * Pengiriman WhatsApp lewat Fonnte — NOMOR PERUSAHAAN
 * ==========================================================================
 *
 * Token API Fonnte disimpan di `process.env.FONNTE_TOKEN`. Disiplinnya
 * MENIRU `lib/supabase/admin.ts` (LESSONS #19), poin per poin:
 *
 *  1. Berkas ini HANYA boleh diimpor dari kode yang berjalan di server
 *     (Server Action). JANGAN PERNAH dari file ber-"use client".
 *     `assertServerOnly()` di bawah adalah jaring pengaman terakhir, bukan
 *     izin untuk lengah.
 *  2. Nama variabelnya SENGAJA tanpa awalan `NEXT_PUBLIC_`: Next.js hanya
 *     menyisipkan variabel ber-awalan itu ke bundel browser, jadi token ini
 *     secara STRUKTURAL tidak bisa ikut terkirim ke perangkat pengguna.
 *  3. Nilai tokennya tidak pernah di-log, tidak pernah dikembalikan ke
 *     pemanggil, dan tidak pernah masuk pesan error.
 *  4. Pemanggil WAJIB sudah memverifikasi identitas penggunanya SEBELUM
 *     memanggil `sendWhatsappViaFonnte` (gerbang identitas halaman itu
 *     sendiri). Urutannya tidak boleh dibalik.
 *
 * ==========================================================================
 * DELAPAN PELAJARAN DARI INSIDEN FONNTE PROYEK LAIN (owner, nyata terjadi)
 * ==========================================================================
 *
 * (1) FUNGSI INI TIDAK PERNAH MELEMPAR. Ia mengembalikan
 *     `{ok:true} | {ok:false, error}` dan pemanggil MEMERIKSA `result.ok`.
 *     Implementasi lama di proyek itu mengembalikan `void` dan menelan semua
 *     galat: lima titik pemanggilan selalu menampilkan "Terkirim ✓" padahal
 *     tidak satu pesan pun keluar. `try/catch` BUKAN cara memeriksa hasil di
 *     sini — tidak ada yang akan tertangkap.
 * (2) LIMA kegagalan yang PASTI terjadi, masing-masing dilaporkan sendiri:
 *     ① token belum diatur → `reason: "unconfigured"`
 *     ② nomor tidak sah setelah dibersihkan → `reason: "bad-phone"`, pesan
 *       memuat nilai ASLI yang ditolak supaya staf bisa membetulkannya
 *     ③ HTTP error dari Fonnte → `reason: "http"` + status + cuplikan body
 *     ④ HTTP 200 TAPI Fonnte MENOLAK → `reason: "rejected"` + `reason`
 *       asli dari Fonnte (kuota habis, device offline, nomor tujuan tidak
 *       terdaftar WhatsApp — SEMUANYA lewat jalur ini, dengan HTTP 200)
 *     ⑤ galat jaringan / timeout → `reason: "network"`
 * (3) Nomor dibersihkan lewat `normalizePhoneID()` (lib/orders-shared.ts) —
 *     satu-satunya sumber kebenaran normalisasi telepon di proyek ini, dan
 *     ia SUDAH membuang seluruh karakter non-digit. Jangan tulis ulang
 *     logikanya di sini: insiden itu bermula dari "0812-3456 7890" yang
 *     dikirim apa adanya ke Fonnte dan gagal diam-diam.
 * (4) Token diperiksa kosong SEBELUM permintaan dibuat — permintaan yang
 *     pasti gagal tidak perlu dikirim (dan tidak perlu menunggu 10 detik).
 * (5) Batas laju: 30 pengiriman per pengguna per jam (lihat catatan di
 *     `checkRateLimit` untuk untung-ruginya).
 * (6) Alamat tautan yang ikut dikirim dirakit pemanggil dari header
 *     permintaan; berkas ini tidak pernah menerima "base_url" dari client.
 * (7) Kegagalan apa pun membuat UI menawarkan jalur cadangan wa.me
 *     (keputusan owner proyek INI — berbeda dari dokumen proyek itu).
 * (8) Setiap kegagalan ditulis ke log runtime dengan awalan `[whatsapp]`.
 *
 * ==========================================================================
 * PERUBAHAN 2026-09-07 (owner: "沒有發送成功要寫出來原因") — nomor Fonnte
 * sudah aktif, jadi jalur gagal ini sekarang benar-benar bisa kena orang:
 * ==========================================================================
 *
 * (9)  Teksnya TIDAK LAGI ditulis keras dalam Bahasa Indonesia di berkas ini.
 *      Pemanggil menyodorkan `messages` (CommonMessages) dan setiap kalimat
 *      datang dari kunci `waErr*` — sebelumnya admin yang memakai layar
 *      berbahasa Mandarin mendapat satu paragraf Indonesia di tengahnya
 *      (LESSONS #13, dan satu-satunya berkas yang masih melanggarnya).
 * (10) Alasan mentah dari Fonnte ("device not connected", "quota exceeded",
 *      "token invalid") DIPETAKAN ke kalimat yang menyebut langkah
 *      berikutnya. Pegawai toko tidak bisa berbuat apa-apa dengan istilah
 *      Inggris teknis; yang ia butuh tahu cuma dua hal — terkirim atau
 *      tidak, dan sekarang harus apa. Teks aslinya TIDAK hilang: tetap
 *      masuk log, dan untuk alasan yang tak dikenal juga tetap ditampilkan
 *      (`waErrOther`) supaya tidak ada kegagalan yang berubah jadi kalimat
 *      kosong "terjadi kesalahan".
 * (11) Kegagalan yang HARUS ditangani SANCI (http / network / rejected)
 *      membawa kode laporan `SP-XXXXX` (lib/safe-write.ts) yang sama dengan
 *      kegagalan tulis lainnya, jadi owner bisa mencocokkan layar pegawai
 *      dengan baris log. Kegagalan yang bisa dibereskan pegawai sendiri
 *      (nomor salah, batas laju, belum dikonfigurasi) TIDAK diberi kode —
 *      kode yang tidak menunjuk apa-apa hanya jadi bising.
 * ========================================================================== */

import { normalizePhoneID } from "./orders-shared";
import { catatGagal } from "./safe-write";
import type { CommonMessages } from "./i18n/messages";

/** Batas waktu satu permintaan ke Fonnte. */
const FONNTE_TIMEOUT_MS = 10_000;

/** Batas laju per pengguna. */
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

export type WhatsappSendResult =
  | { ok: true; detail: string | null }
  | {
      ok: false;
      /** Untuk percabangan UI. Teks yang ditampilkan tetap `error`. */
      reason: "unconfigured" | "bad-phone" | "http" | "rejected" | "network" | "rate-limit";
      /** SUDAH diterjemahkan ke bahasa pengguna dan layak ditampilkan apa adanya. */
      error: string;
    };

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    // Sengaja gagal keras, bukan diam-diam. Kalau baris ini pernah jalan,
    // ada file "use client" yang mengimpor modul ini — itu bug arsitektur
    // yang harus diperbaiki, bukan ditoleransi.
    throw new Error("Modul pengirim WhatsApp hanya boleh dipakai di server.");
  }
}

/**
 * Dibaca sebagai `process.env.FONNTE_TOKEN` secara HARFIAH (bukan
 * `process.env[nama]`) supaya penggantian nilai saat build tetap bekerja di
 * semua runtime Next.js — alasan yang sama dengan `serviceRoleKey()`.
 */
function fonnteToken(): string | undefined {
  const raw = process.env.FONNTE_TOKEN;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Apakah nomor perusahaan sudah bisa dipakai?
 *
 * Dipakai Server Component/Action untuk MEMILIH TAMPILAN: selama owner belum
 * membuka akun Fonnte, tombol "kirim dari nomor perusahaan" TIDAK digambar
 * sama sekali dan staf hanya melihat tombol wa.me (LESSONS #12 — kode boleh
 * naik duluan; fitur yang belum dikonfigurasi merendahkan diri, bukan
 * menampilkan tombol yang pasti gagal). Hanya mengembalikan boolean —
 * nilai tokennya tidak pernah keluar dari berkas ini.
 */
export function isFonnteConfigured(): boolean {
  assertServerOnly();
  return !!fonnteToken();
}

/* ------------------------------------------------------------------ *
 * Batas laju
 * ------------------------------------------------------------------ */

const sendLog = new Map<string, number[]>();

/**
 * 30 pengiriman per pengguna per jam.
 *
 * UNTUNG-RUGI YANG DISADARI: penghitungnya ada DI DALAM MEMORI proses. Di
 * Vercel itu berarti per-instance dan hilang saat instance dingin — jadi ini
 * POLISI TIDUR, bukan pagar. Yang ia benar-benar cegah adalah apa yang
 * memang paling mungkin terjadi: satu akun yang bocor (atau satu skrip yang
 * salah) memakai fitur ini sebagai alat spam dari satu sesi. Penyerang yang
 * sengaja memutar-mutar instance bisa melewatinya.
 *
 * Kenapa BUKAN tabel di database (yang akan benar-benar mengikat): itu
 * menuntut satu tabel + RLS + migrasi baru untuk sesuatu yang bukan permintaan
 * owner dan bukan batas keamanan inti (kuota Fonnte sendiri adalah pagar
 * terakhirnya, dan penyalahgunaan tetap terekam karena setiap pengiriman
 * berasal dari sesi staf yang teridentifikasi). Kalau kelak spam sungguh
 * terjadi, tempat menggantinya cuma fungsi ini — antarmukanya tidak berubah.
 */
function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const fresh = (sendLog.get(userId) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (fresh.length >= RATE_LIMIT_MAX) {
    sendLog.set(userId, fresh);
    return false;
  }
  fresh.push(now);
  sendLog.set(userId, fresh);
  // Menjaga peta tidak tumbuh selamanya di instance yang berumur panjang.
  if (sendLog.size > 500) {
    for (const [k, v] of sendLog) {
      if (v.every((t) => now - t >= RATE_LIMIT_WINDOW_MS)) sendLog.delete(k);
    }
  }
  return true;
}

/* ------------------------------------------------------------------ *
 * Pengiriman
 * ------------------------------------------------------------------ */

/** Cuplikan body jawaban untuk pesan galat — dipotong supaya tidak membanjiri UI. */
function snippet(s: string): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > 160 ? `${one.slice(0, 160)}…` : one;
}

/**
 * Menerjemahkan alasan mentah Fonnte jadi kalimat yang menyebut langkah
 * berikutnya (pelajaran 10).
 *
 * Fonnte TIDAK menjanjikan daftar `reason` yang tetap, jadi pencocokannya
 * sengaja longgar (potongan kata, huruf kecil) dan SELALU punya jalan keluar:
 * yang tidak cocok tetap menampilkan teks aslinya lewat `waErrOther` —
 * "tidak dikenali" tidak boleh berubah jadi pesan kosong. Kalau kelak Fonnte
 * mengubah kata-katanya, yang terjadi paling buruk adalah pesan jatuh ke
 * `waErrOther`, bukan salah menuduh penyebab.
 */
function pesanAlasanFonnte(m: CommonMessages, why: string): string {
  const w = why.toLowerCase();
  // Urutan penting: "token" diperiksa sebelum yang lain karena jawaban token
  // salah kadang juga menyebut device.
  if (w.includes("token") || w.includes("unauthor") || w.includes("forbidden")) return m.waErrToken;
  if (w.includes("quota") || w.includes("kuota") || w.includes("saldo") || w.includes("expired") || w.includes("subscription"))
    return m.waErrQuota;
  if (w.includes("device") || w.includes("disconnect") || w.includes("not connect") || w.includes("offline") || w.includes("scan"))
    return m.waErrDeviceOffline;
  if (w.includes("target") || w.includes("not registered") || w.includes("bukan whatsapp") || w.includes("invalid number") || w.includes("number is not"))
    return m.waErrTargetInvalid;
  return m.waErrOther.replace("{why}", why);
}

/** Menempelkan kode laporan (pelajaran 11) pada kalimat yang sudah jadi. */
function denganKode(m: CommonMessages, teks: string, aksi: string, detail: Record<string, unknown>): string {
  return `${teks} ${m.netReportCode.replace("{kode}", catatGagal(aksi, detail))}`;
}

/**
 * Mengirim SATU pesan WhatsApp lewat Fonnte.
 *
 * TIDAK PERNAH melempar (pelajaran 1). Pemanggil memeriksa `result.ok`.
 */
export async function sendWhatsappViaFonnte(opts: {
  /** Nomor apa adanya dari database/form — dibersihkan di dalam. */
  rawPhone: string | null | undefined;
  message: string;
  /** auth.uid() pemanggil — kunci batas laju. */
  actorUserId: string;
  /**
   * Teks untuk pengguna, dalam bahasa yang sedang dipakai (pelajaran 9).
   * WAJIB — bukan opsional dengan cadangan Bahasa Indonesia, supaya pemanggil
   * yang lupa ketahuan saat build, bukan muncul sebagai kalimat Indonesia di
   * layar berbahasa lain (pola yang sama dengan `submitSafely`).
   */
  messages: CommonMessages;
  /**
   * Keterangan untuk log — mis. { orderNumber }. TANPA nomor telepon/nama
   * pelanggan (log bukan tempat menyimpan data pribadi). Dipakai di baris
   * log SUKSES maupun gagal supaya owner bisa menghitung "nomor perusahaan
   * sudah mengirim ke pesanan mana saja" langsung dari log Vercel, tanpa
   * bertanya ke pegawai (permintaan owner 2026-09-07: "成功也寫 log").
   */
  context?: Record<string, unknown>;
}): Promise<WhatsappSendResult> {
  assertServerOnly();
  const m = opts.messages;
  const ctx = opts.context ?? {};

  // (4) Token diperiksa DULU: permintaan yang pasti gagal tidak dikirim.
  const token = fonnteToken();
  if (!token) {
    return { ok: false, reason: "unconfigured", error: m.waErrUnconfigured };
  }

  // (3) Pembersihan nomor lewat SATU sumber kebenaran.
  const target = normalizePhoneID(opts.rawPhone ?? "");
  if (!target) {
    return {
      ok: false,
      reason: "bad-phone",
      // Nilai ASLI yang ditolak ikut ditampilkan (pelajaran 2-②): tanpa itu
      // pegawai tidak tahu bagian mana dari nomornya yang harus dibetulkan.
      error: m.waErrBadPhone.replace("{phone}", opts.rawPhone ?? ""),
    };
  }

  if (!checkRateLimit(opts.actorUserId)) {
    return {
      ok: false,
      reason: "rate-limit",
      error: m.waErrRateLimit.replace("{max}", String(RATE_LIMIT_MAX)),
    };
  }

  const body = new URLSearchParams({ target, message: opts.message });

  let res: Response;
  try {
    res = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: {
        Authorization: token,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: AbortSignal.timeout(FONNTE_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    // (5) Jaringan putus / timeout. Pesannya JUJUR: kita tidak tahu apakah
    // pesannya terkirim atau tidak (LESSONS #2 — jangan mengaku sukses,
    // jangan pula mengaku pasti gagal).
    console.error("[whatsapp] network error calling Fonnte:", err);
    return {
      ok: false,
      reason: "network",
      error: denganKode(m, m.waErrNetwork, "whatsapp/network", { ...ctx, err }),
    };
  }

  const text = await res.text().catch(() => "");

  // (3-⑨) HTTP error.
  if (!res.ok) {
    console.error(`[whatsapp] HTTP error from Fonnte: ${res.status} ${snippet(text)}`);
    return {
      ok: false,
      reason: "http",
      // Cuplikan body TIDAK lagi ikut ke layar — bagi pegawai toko itu tidak
      // bisa ditindaklanjuti; ia tetap ada di log, ditunjuk oleh kode laporan.
      error: denganKode(m, m.waErrHttp.replace("{status}", String(res.status)), "whatsapp/http", {
        ...ctx,
        status: res.status,
        body: snippet(text),
      }),
    };
  }

  // (4-⑩) HTTP 200 TAPI Fonnte menolak. INI jalur yang paling sering
  // terjadi di lapangan (kuota habis, device offline, nomor tujuan belum
  // terdaftar WhatsApp) dan justru yang paling mudah terlewat kalau hanya
  // kode HTTP yang diperiksa.
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.error(`[whatsapp] Fonnte replied with non-JSON body: ${snippet(text)}`);
    return {
      ok: false,
      reason: "rejected",
      error: denganKode(m, m.waErrOther.replace("{why}", snippet(text)), "whatsapp/non-json", {
        ...ctx,
        body: snippet(text),
      }),
    };
  }

  const obj = (parsed ?? {}) as { status?: unknown; reason?: unknown; detail?: unknown };
  // Fonnte mengirim `status` sebagai boolean; sebagian akun lama mengirim
  // string "true"/"false". Keduanya diterima, apa pun SELAIN itu = ditolak.
  const okFlag = obj.status === true || obj.status === "true";

  if (!okFlag) {
    const why =
      (typeof obj.reason === "string" && obj.reason) ||
      (typeof obj.detail === "string" && obj.detail) ||
      snippet(text);
    console.error(`[whatsapp] Fonnte rejected the message: ${why}`);
    return {
      ok: false,
      reason: "rejected",
      error: denganKode(m, pesanAlasanFonnte(m, why), "whatsapp/rejected", { ...ctx, why }),
    };
  }

  const detail = typeof obj.detail === "string" ? obj.detail : null;
  // Sukses JUGA dicatat (dulu hanya kegagalan): tanpa baris ini owner tidak
  // bisa membedakan "belum ada yang menekan tombol" dari "sudah terkirim"
  // di log. `detail` adalah jawaban Fonnte apa adanya ("success! message in
  // queue") — antrean, bukan bukti sampai (LESSONS #7); jangan ditulis ulang
  // jadi "delivered".
  console.log(
    `[whatsapp] terkirim ${JSON.stringify({ ...ctx, detail, waktu: new Date().toISOString() })}`
  );
  return { ok: true, detail };
}
