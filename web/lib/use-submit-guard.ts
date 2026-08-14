"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Pengaman kirim ganda (SPEC §62, §73).
 *
 * `disabled` pada tombol saja BUKAN pengaman: klik kedua bisa terjadi sebelum
 * React sempat me-render ulang, dan Enter di keyboard bisa mengirim form saat
 * tombol sudah dianggap disabled. Karena itu kunci sebenarnya ada di `useRef`
 * yang di-set SINKRON di awal handler — sebelum `await` pertama.
 *
 * Aturan pakai:
 *   - `begin()` di baris pertama handler; kalau `false`, langsung `return`.
 *   - `release()` HANYA pada jalur gagal. Pada jalur berhasil tombol dibiarkan
 *     tetap nonaktif sampai navigasi/refresh selesai, supaya tidak ada kedipan
 *     tombol yang bisa diklik lagi (sumber baris kedua di DB).
 *   - `reset()` saat modal dibuka/ditutup, supaya kunci tidak tertinggal.
 *
 * Ini lapisan pengalaman pengguna saja. Pertahanan sebenarnya tetap di server:
 * idempotency key (`client_request_id`) + unique constraint di DB.
 */
export function useSubmitGuard() {
  const locked = useRef(false);
  const [submitting, setSubmitting] = useState(false);

  const begin = useCallback(() => {
    if (locked.current) return false;
    locked.current = true; // sinkron, sebelum await pertama
    setSubmitting(true);
    return true;
  }, []);

  const release = useCallback(() => {
    locked.current = false;
    setSubmitting(false);
  }, []);

  return { submitting, begin, release, reset: release };
}
