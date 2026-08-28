"use client";

import { useState } from "react";
import { formatDateTimeWIB } from "@/lib/orders-shared";
import { revealCustomerAddress, type RevealOutcome } from "./actions";

/**
 * "Lihat alamat lengkap" — pelanggan membuktikan nomor HP-nya dulu
 * (migrasi 0023 §6).
 *
 * BAHASA: hardcoded Bahasa Indonesia, sama seperti halaman induknya.
 *
 * Tidak memakai `submitSafely`: berkas itu menarik `Messages` (tiga bahasa)
 * ke dalam bundel client, dan halaman ini dibuka pelanggan di jaringan
 * seluler — LESSONS #38 persis: satu import "kamus" menambah puluhan kB yang
 * tidak dipakai. Yang dipinjam dari pola itu adalah PERILAKUNYA: kunci kirim
 * ganda, dan tidak ada satu pun keadaan yang menyamar jadi keadaan lain
 * (LESSONS #10).
 */
export default function RevealAddress({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<RevealOutcome | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setOutcome(null);
    try {
      setOutcome(await revealCustomerAddress(token, phone));
    } catch {
      // Jaringan putus di tengah panggilan. Jangan mengaku tahu hasilnya.
      setOutcome({ status: "error" });
    } finally {
      setBusy(false);
    }
  }

  if (outcome?.status === "ok") {
    return (
      <div className="banner ok" style={{ whiteSpace: "pre-wrap" }}>
        {outcome.address ?? "—"}
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        Lihat alamat lengkap
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="field">
        <label htmlFor="reveal-phone">
          Masukkan nomor HP yang dipakai saat memesan
        </label>
        <input
          id="reveal-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0812…"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <div className="hint">
          Alamat lengkap hanya ditampilkan kepada pemilik pesanan.
        </div>
      </div>

      {outcome?.status === "invalid" && (
        <div className="banner warn">
          Nomor ini tidak cocok dengan nomor pada pesanan.
          {outcome.attempts_left >= 0 && ` Sisa ${outcome.attempts_left} percobaan.`}
        </div>
      )}
      {outcome?.status === "locked" && (
        <div className="banner bad">
          Terlalu banyak percobaan. Coba lagi setelah{" "}
          {formatDateTimeWIB(outcome.locked_until, "id-ID")} WIB, atau hubungi toko.
        </div>
      )}
      {outcome?.status === "not_found" && (
        <div className="banner bad">
          Tautan ini tidak kami kenali lagi. Silakan hubungi toko.
        </div>
      )}
      {outcome?.status === "error" && (
        <div className="banner bad">
          Sedang gangguan di sisi kami — belum bisa diperiksa. Silakan coba lagi sebentar lagi.
        </div>
      )}

      <div className="btnrow">
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? "Memeriksa…" : "Lihat alamat"}
        </button>
      </div>
    </form>
  );
}
