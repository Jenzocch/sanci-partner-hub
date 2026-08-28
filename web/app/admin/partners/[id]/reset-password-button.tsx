"use client";

import { useState } from "react";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { submitSafely } from "@/lib/safe-write";
import { useAdminMessages } from "@/lib/i18n/provider";
import { resetPartnerUserPassword } from "../../actions-users";

/**
 * "Atur Ulang Kata Sandi" untuk satu akun cabang.
 *
 * Dipakai kalau toko lupa kata sandinya. Sengaja BUKAN "lihat kata sandi":
 * kata sandi yang sudah tersimpan tidak bisa dibaca kembali oleh siapa pun,
 * termasuk SANCI — sistem login hanya menyimpan sidik jarinya, bukan kata
 * sandinya. Jadi jalan keluarnya menetapkan kata sandi baru, bukan menampilkan
 * yang lama.
 *
 * Sama seperti form pembuatan akun: TIDAK memakai draf lokal (kata sandi tidak
 * boleh menyentuh localStorage), dan modalnya tidak ditutup saat gagal supaya
 * yang sudah diketik tidak hilang (LESSONS #1).
 */

export default function ResetPasswordButton({
  userId,
  userName,
  branchName,
}: {
  userId: string;
  userName: string;
  branchName: string;
}) {
  const [open, setOpen] = useState(false);
  // Teks jaringan bawaan (offline / "belum pasti") mengikuti bahasa yang
  // sedang dipakai — submitSafely mewajibkannya, supaya pemanggil yang lupa
  // ketahuan saat build, bukan muncul sebagai kalimat Indonesia di layar
  // berbahasa lain.
  const messages = useAdminMessages();
  const { submitting, begin, release, reset } = useSubmitGuard();
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [netMsg, setNetMsg] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [ulangi, setUlangi] = useState("");

  /** Kata sandi yang BARU SAJA berhasil dipasang — ditampilkan sekali, lalu hilang. */
  const [selesai, setSelesai] = useState<string | null>(null);
  const [salinStatus, setSalinStatus] = useState<string | null>(null);

  function openModal() {
    reset();
    setErrs({});
    setNetMsg(null);
    setPassword("");
    setUlangi("");
    setSelesai(null);
    setSalinStatus(null);
    setOpen(true);
  }

  function tutup() {
    // Tidak ada yang perlu dimuat ulang: daftar akun tidak menampilkan kata
    // sandi, jadi tidak ada baris yang berubah di layar.
    setSelesai(null);
    setPassword("");
    setUlangi("");
    setOpen(false);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!begin()) return;
    setErrs({});
    setNetMsg(null);

    // Kecocokan dua kotak hanya bisa diperiksa di sini (server cuma menerima
    // satu nilai). Salah ketik di sini = toko tidak bisa masuk sama sekali,
    // jadi pemeriksaannya wajib, bukan pemanis.
    if (password !== ulangi) {
      release();
      setErrs({
        ulangi: messages.admin.resetPasswordMismatchErr,
      });
      return;
    }

    const out = await submitSafely({
      run: () => resetPartnerUserPassword(userId, password),
      messages,
      buttonLabel: messages.admin.resetPasswordSaveBtn,
      kind: "update",
    });

    if (out.status === "offline") {
      release();
      setNetMsg(out.message);
      return;
    }
    if (out.status === "unconfirmed") {
      release();
      // `stale`: halaman ini dari deployment lama — pesannya sudah menyuruh
      // muat ulang; jangan ditimpa teks "belum pasti" khusus layar ini.
      setNetMsg(out.stale ? out.message : messages.admin.resetPasswordUnconfirmedMsg);
      return;
    }

    const res = out.result;
    if ("error" in res) {
      release();
      setErrs({ [res.error.field || "_form"]: res.error.message });
      return;
    }

    // Server memastikan kata sandinya sudah berganti.
    setSelesai(password);
    setPassword("");
    setUlangi("");
  }

  async function salin() {
    if (!selesai) return;
    try {
      await navigator.clipboard.writeText(`${messages.admin.resetPasswordDoneNewLabel}: ${selesai}`);
      setSalinStatus(messages.admin.copySuccessMsg);
    } catch {
      setSalinStatus(messages.admin.copyFailMsg);
    }
  }

  if (!open) {
    return (
      <button className="btn sm" onClick={openModal}>
        {messages.admin.resetPasswordBtn}
      </button>
    );
  }

  // Kartu hasil: sengaja TIDAK bisa ditutup dengan klik di luar. Kata sandi ini
  // tidak tersimpan di mana pun dan tidak bisa dilihat lagi setelah ditutup.
  if (selesai) {
    return (
      <div className="overlay">
        <div className="modal" role="dialog" aria-modal="true">
          <h2>{messages.admin.resetPasswordDoneTitle}</h2>
          <div className="banner warn">{messages.admin.resetPasswordDoneWarning}</div>
          <dl className="kv">
            <dt>{messages.common.account}</dt>
            <dd>{userName}</dd>
            <dt>{messages.common.branch}</dt>
            <dd>{branchName || "—"}</dd>
            <dt>{messages.admin.resetPasswordDoneNewLabel}</dt>
            <dd>
              <span className="code">{selesai}</span>
            </dd>
          </dl>
          {salinStatus && <div className="banner info">{salinStatus}</div>}
          <div className="btnrow">
            <button type="button" className="btn" onClick={salin}>
              {messages.admin.resetPasswordCopyBtn}
            </button>
            <button type="button" className="btn primary" onClick={tutup}>
              {messages.admin.resetPasswordCloseBtn}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="modal" role="dialog" aria-modal="true">
        <h2>{messages.admin.resetPasswordModalTitle}</h2>
        <div className="banner warn">
          {messages.admin.resetPasswordWarningBanner
            .replace("{user}", userName)
            .replace("{branch}", branchName ? ` (${branchName})` : "")}
        </div>
        <div className="banner info">{messages.admin.resetPasswordInfoBanner}</div>
        {netMsg && <div className="banner warn">{netMsg}</div>}
        {errs._form && <div className="banner bad">{errs._form}</div>}
        <form onSubmit={onSubmit}>
          <div className={`field${errs.password ? " invalid" : ""}`}>
            <label htmlFor="rp_password">{messages.admin.resetPasswordFieldLabel}</label>
            <input
              id="rp_password"
              name="password"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="hint">{messages.admin.resetPasswordHint.replace("{min}", "10")}</div>
            {errs.password && <div className="err-text">{errs.password}</div>}
          </div>

          <div className={`field${errs.ulangi ? " invalid" : ""}`}>
            <label htmlFor="rp_ulangi">{messages.admin.resetPasswordRepeatFieldLabel}</label>
            <input
              id="rp_ulangi"
              name="ulangi"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={ulangi}
              onChange={(e) => setUlangi(e.target.value)}
            />
            <div className="hint">{messages.admin.resetPasswordRepeatHint}</div>
            {errs.ulangi && <div className="err-text">{errs.ulangi}</div>}
          </div>

          <div className="btnrow">
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              {messages.common.cancel}
            </button>
            <button type="submit" className="btn primary" disabled={submitting}>
              {submitting ? messages.common.saving : messages.admin.resetPasswordSaveBtn}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
