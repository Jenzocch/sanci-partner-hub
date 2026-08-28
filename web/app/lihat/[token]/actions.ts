"use server";

/**
 * Server Action untuk halaman pelanggan (`/lihat/<token>`, migrasi 0023).
 *
 * KENAPA SERVER ACTION dan bukan `supabase.rpc()` langsung dari browser:
 * `normalizePhoneID()` (lib/orders-shared.ts) menyatakan dirinya SATU-SATUNYA
 * sumber kebenaran normalisasi telepon dan melarang menduplikasi logikanya
 * di SQL — jadi normalisasinya harus terjadi di JavaScript, dan berkas itu
 * juga menuntut normalisasi dijalankan DI SISI SERVER, bukan di perangkat
 * pengguna. Server Action memenuhi keduanya sekaligus: nomor mentah yang
 * diketik pelanggan dinormalisasi di server, lalu dibandingkan di dalam
 * database (RPC SECURITY DEFINER) — `phone_normalized` sendiri TIDAK PERNAH
 * dikirim ke browser siapa pun.
 *
 * Tidak ada gerbang identitas di sini, dan itu memang benar: pemanggilnya
 * adalah pelanggan tanpa akun. Yang menjaga adalah (a) token 244-bit yang
 * tidak bisa ditebak dan (b) rem 5-kali-salah/15-menit di dalam RPC.
 */

import { createClient } from "@/lib/supabase/server";
import { normalizePhoneID } from "@/lib/orders-shared";
import type { RevealResult } from "@/lib/customer-link";

/** Ditambah satu keadaan yang hanya ada di lapisan ini: gangguan server. */
export type RevealOutcome = RevealResult | { status: "error" };

export async function revealCustomerAddress(
  token: string,
  rawPhone: string
): Promise<RevealOutcome> {
  const normalized = normalizePhoneID(rawPhone ?? "");

  // Nomor yang jelas bukan nomor Indonesia TIDAK dikirim ke database: itu
  // menghabiskan satu dari lima percobaan pemiliknya yang sah hanya karena
  // salah ketik yang bisa dikenali di sini. Dilaporkan sebagai "invalid"
  // dengan attempts_left dari sisi database yang tidak berubah — halaman
  // menampilkannya sebagai "nomor tidak dikenali", bukan sebagai kegagalan.
  if (!normalized) {
    return { status: "invalid", attempts_left: -1 };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_customer_reveal_address", {
    p_token: token,
    p_phone: normalized,
  });

  // LESSONS #10: error DB ≠ jawaban bisnis. "Nomor salah" dan "server
  // bermasalah" tidak boleh terlihat sama bagi pembacanya.
  if (error || !data) return { status: "error" };

  return data as RevealResult;
}
