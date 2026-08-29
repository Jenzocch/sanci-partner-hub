"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCommonMessages } from "@/lib/i18n/provider";

/**
 * supabase-js diimpor DINAMIS di sini, bukan statis — pola yang sama dengan
 * sembilan titik masuk browser lain di aplikasi ini (admin-nav, sign-out,
 * unggah foto, dll.). Berkas INI adalah satu-satunya yang masih statis, dan
 * akibatnya terukur (build 992e67b): halaman `/` menjadi rute TERBERAT
 * seluruh aplikasi — First Load JS 171 kB, sedangkan rata-rata rute lain
 * ~110 kB. Selisihnya nyaris seluruhnya Supabase: 52,9 kB gzip klien inti
 * (realtime + storage + functions + rest) + 13,8 kB auth-js.
 *
 * Padahal layar ini hanya memakai `auth.signInWithPassword()` dan
 * `auth.signOut()`, dan REALTIME TIDAK DIPAKAI DI MANA PUN di produk ini
 * (`.channel(` / `.subscribe(` / `removeChannel` = 0 kemunculan di seluruh
 * app + lib). Jadi setiap orang membayar unduhan itu di layar PERTAMA yang
 * mereka buka, di ponsel, dengan data seluler Indonesia — untuk kode yang
 * tidak pernah dijalankan.
 *
 * Yang diubah hanya KAPAN modul itu diunduh, bukan apakah diunduh: modul
 * dihangatkan sekali sesudah hidrasi (useEffect di bawah), yaitu selagi
 * pengguna mengetik email dan sandi. Jadi bundel awal mengecil DAN tombol
 * Masuk tetap seketika — bukan menukar ukuran dengan jeda saat submit.
 */
type SupabaseBrowser = Awaited<ReturnType<typeof importClient>>;
async function importClient() {
  const { createClient } = await import("@/lib/supabase/client");
  return createClient();
}

export default function LoginForm({ signOutOnly }: { signOutOnly?: boolean }) {
  const m = useCommonMessages();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** Janji modul, dibagi pakai — dua penekanan tidak mengunduh dua kali. */
  const klien = useRef<Promise<SupabaseBrowser> | null>(null);

  function ambilKlien(): Promise<SupabaseBrowser> {
    if (!klien.current) klien.current = importClient();
    return klien.current;
  }

  // Hangatkan sesudah hidrasi — di luar jalur render, selagi pengguna
  // mengetik. Kegagalan di sini SENGAJA didiamkan: ini cuma pemanasan,
  // dan `ambilKlien()` di bawah akan mencoba lagi saat benar-benar dibutuhkan
  // (kalau gagal juga, pesannya keluar dari alur submit seperti biasa —
  // tidak ada jalur gagal-diam baru).
  useEffect(() => {
    ambilKlien().catch(() => {
      klien.current = null;
    });
  }, []);

  async function signOut() {
    setBusy(true);
    try {
      const supabase = await ambilKlien();
      await supabase.auth.signOut();
    } catch {
      // Modul gagal dimuat (jaringan putus). Jangan biarkan tombol mati
      // permanen: pulihkan lalu biarkan pengguna menekan lagi.
      klien.current = null;
      setBusy(false);
      return;
    }
    router.refresh();
  }

  if (signOutOnly) {
    return (
      <button className="btn" onClick={signOut} disabled={busy}>
        {busy ? m.signingOut : m.signOut}
      </button>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr(null);
    let supabase: SupabaseBrowser;
    try {
      supabase = await ambilKlien();
    } catch {
      // `import()` gagal = jaringan, bukan kredensial salah. Jangan sekali
      // pun menuduh sandinya keliru (LESSONS #10: sebab yang salah membuat
      // pengguna mengulang hal yang bukan masalahnya).
      klien.current = null;
      setErr(m.loginFailed);
      setBusy(false);
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      // Jangan bocorkan error teknis mentah ke pengguna (SPEC §69). Teks
      // Supabase selalu Inggris, jadi yang dicocokkan adalah pesan aslinya,
      // bukan hasil terjemahannya.
      setErr(error.message === "Invalid login credentials" ? m.loginWrong : m.loginFailed);
      setBusy(false);
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit}>
      {err && <div className="err">{err}</div>}
      <div className="field">
        <label htmlFor="email">{m.loginEmail}</label>
        <input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="password">{m.loginPassword}</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      <button className="btn primary" type="submit" disabled={busy}>
        {busy ? m.loginSubmitting : m.loginSubmit}
      </button>
    </form>
  );
}
