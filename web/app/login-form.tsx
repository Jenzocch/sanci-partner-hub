"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginForm({ signOutOnly }: { signOutOnly?: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function signOut() {
    setBusy(true);
    await createClient().auth.signOut();
    router.refresh();
  }

  if (signOutOnly) {
    return (
      <button className="btn" onClick={signOut} disabled={busy}>
        {busy ? "Keluar…" : "Keluar"}
      </button>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr(null);
    const { error } = await createClient().auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      // Jangan bocorkan error teknis mentah ke pengguna (SPEC §69).
      setErr(
        error.message === "Invalid login credentials"
          ? "Email atau kata sandi salah."
          : "Tidak bisa masuk sekarang. Coba lagi sebentar lagi."
      );
      setBusy(false);
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit}>
      {err && <div className="err">{err}</div>}
      <div className="field">
        <label htmlFor="email">Email</label>
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
        <label htmlFor="password">Kata sandi</label>
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
        {busy ? "Masuk…" : "Masuk"}
      </button>
    </form>
  );
}
