"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCommonMessages } from "@/lib/i18n/provider";

export default function LoginForm({ signOutOnly }: { signOutOnly?: boolean }) {
  const m = useCommonMessages();
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
        {busy ? m.signingOut : m.signOut}
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
