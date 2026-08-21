"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CommonMessages } from "./i18n/messages";

/**
 * Draf lokal otomatis (SPEC §58, LESSONS #1).
 *
 * Tujuannya satu: apa pun yang terjadi pada jaringan, ketikan pengguna tidak
 * hilang. Karena itu aturannya:
 *   - Draf disimpan otomatis ke localStorage sambil mengetik (ditunda ~800ms).
 *   - Draf TIDAK PERNAH dipulihkan diam-diam. Saat form dibuka dan draf ada,
 *     pengguna diberi pilihan: Lanjutkan atau Buang.
 *   - Urutan prioritas isi form: draf (kalau pengguna pilih Lanjutkan) >
 *     nilai dari server (defaultValue) > kosong.
 *   - Kunci draf HANYA dihapus dari jalur berhasil yang sudah dikonfirmasi
 *     server (`clear()` dipanggil setelah safe-write memastikan tersimpan).
 *     Tidak pernah dihapus saat menekan Simpan — kalau penyimpanan gagal atau
 *     terputus, ketikan pengguna harus tetap ada.
 *   - Semua akses localStorage dibungkus try/catch: mode penyamaran atau
 *     penyimpanan penuh tidak boleh membuat form error.
 */

export const DRAFT_DEBOUNCE_MS = 800;

export type Draft = { savedAt: number; values: Record<string, string> };

/** `sanci:draft:<formName>:<recordId|"new">` — beda record, beda kunci. */
export function draftKey(formName: string, recordId?: string | null): string {
  return `sanci:draft:${formName}:${recordId || "new"}`;
}

/**
 * "5 menit lalu" / "5 min ago" / "5 分钟前". Teksnya dari common.ts, angkanya
 * disisipkan di {n} — jadi tiap bahasa boleh menaruh angkanya di posisi yang
 * berbeda. Tanggal panjang (lebih dari seminggu) memakai `dateLocale` supaya
 * urutan hari/bulan/tahun ikut kebiasaan pembacanya.
 */
export function waktuRelatif(m: CommonMessages, savedAt: number, now: number = Date.now()): string {
  const c = m;
  const isi = (t: string, n: number) => t.replace("{n}", String(n));
  const detik = Math.max(0, Math.round((now - savedAt) / 1000));
  if (detik < 60) return c.timeJustNow;
  const menit = Math.round(detik / 60);
  if (menit < 60) return isi(c.timeMinutesAgo, menit);
  const jam = Math.round(menit / 60);
  if (jam < 24) return isi(c.timeHoursAgo, jam);
  const hari = Math.round(jam / 24);
  const hariTeks = hari === 1 ? c.timeDayAgo : isi(c.timeDaysAgo, hari);
  if (hari <= 7) return hariTeks;
  try {
    return new Date(savedAt).toLocaleDateString(c.dateLocale, {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return hariTeks;
  }
}

function bacaDraft(key: string): Draft | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    if (!parsed || typeof parsed.savedAt !== "number" || !parsed.values) return null;
    const values: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed.values)) {
      if (typeof v === "string") values[k] = v;
    }
    if (Object.keys(values).length === 0) return null;
    return { savedAt: parsed.savedAt, values };
  } catch {
    return null; // JSON rusak / localStorage diblokir — perlakukan sebagai tidak ada draf
  }
}

function tulisDraft(key: string, draft: Draft): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // Penyimpanan penuh atau ditolak. Diamkan — form tetap harus bisa dipakai.
  }
}

function hapusDraft(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // sama seperti di atas
  }
}

type FieldElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function kumpulkan(form: HTMLFormElement): Record<string, string> {
  const values: Record<string, string> = {};
  for (const el of Array.from(form.elements)) {
    const field = el as FieldElement;
    if (!field.name || field.disabled) continue;
    if (field.tagName === "INPUT") {
      const input = field as HTMLInputElement;
      // Kata sandi dan berkas tidak pernah masuk penyimpanan lokal.
      if (["password", "file", "submit", "button", "reset", "hidden"].includes(input.type)) continue;
      if (input.type === "checkbox" || input.type === "radio") {
        if (input.checked) values[input.name] = input.value;
        continue;
      }
    } else if (field.tagName !== "TEXTAREA" && field.tagName !== "SELECT") {
      continue;
    }
    if (field.value) values[field.name] = field.value;
  }
  return values;
}

function terapkan(form: HTMLFormElement, values: Record<string, string>): void {
  for (const [name, value] of Object.entries(values)) {
    const field = form.elements.namedItem(name);
    if (!field) continue;
    if (typeof RadioNodeList !== "undefined" && field instanceof RadioNodeList) {
      field.value = value;
      continue;
    }
    const one = field as FieldElement;
    if (one.tagName === "INPUT" && (one as HTMLInputElement).type === "checkbox") {
      (one as HTMLInputElement).checked = true;
      continue;
    }
    one.value = value;
  }
}

/**
 * @param formName nama form, mis. "partner" | "branch" | "staff"
 * @param recordId id record untuk form ubah; untuk form buat baru pakai
 *                 null (kunci "new") atau `new@<parentId>` agar tidak
 *                 tercampur antar induk
 * @param enabled  true saat form/modal sedang terbuka
 */
export function useLocalDraft(formName: string, recordId: string | null, enabled: boolean) {
  const key = draftKey(formName, recordId);
  const formRef = useRef<HTMLFormElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const batal = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  // Saat form dibuka: baca draf yang tersimpan, tapi JANGAN langsung mengisi.
  useEffect(() => {
    if (!enabled) {
      setDraft(null);
      return;
    }
    setDraft(bacaDraft(key));
    return batal;
  }, [key, enabled, batal]);

  const onInput = useCallback(() => {
    if (!enabled) return;
    batal();
    timer.current = setTimeout(() => {
      timer.current = null;
      const form = formRef.current;
      if (!form) return;
      const values = kumpulkan(form);
      if (Object.keys(values).length === 0) {
        hapusDraft(key);
        return;
      }
      tulisDraft(key, { savedAt: Date.now(), values });
    }, DRAFT_DEBOUNCE_MS);
  }, [key, enabled, batal]);

  /** Pengguna menekan "Lanjutkan": isi form dengan draf (draf menang atas nilai server). */
  const restore = useCallback(() => {
    const form = formRef.current;
    if (form && draft) terapkan(form, draft.values);
    setDraft(null);
  }, [draft]);

  /** Pengguna menekan "Buang": draf dihapus atas permintaan pengguna sendiri. */
  const discard = useCallback(() => {
    batal();
    hapusDraft(key);
    setDraft(null);
  }, [key, batal]);

  /**
   * HANYA dipanggil dari jalur berhasil yang sudah dipastikan server.
   * Pembatalan timer di sini penting: tanpa itu, simpanan tertunda bisa menulis
   * draf lagi tepat setelah dihapus.
   */
  const clear = useCallback(() => {
    batal();
    hapusDraft(key);
    setDraft(null);
  }, [key, batal]);

  return { formRef, onInput, draft, restore, discard, clear, key };
}
