"use server";

import { cookies } from "next/headers";
import { LOCALE_COOKIE, isLocale } from "./types";

/**
 * Menyimpan pilihan bahasa. Tidak menyentuh database: pilihan ini milik
 * perangkat, bukan milik akun — satu akun cabang dipakai bergantian oleh
 * beberapa staf, dan HP masing-masing boleh beda bahasa.
 */
export async function setLocale(value: string): Promise<void> {
  if (!isLocale(value)) return; // nilai asing diabaikan diam-diam, bukan error
  const store = await cookies();
  store.set(LOCALE_COOKIE, value, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
