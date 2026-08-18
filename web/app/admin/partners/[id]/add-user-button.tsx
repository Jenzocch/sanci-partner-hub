"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { submitSafely } from "@/lib/safe-write";
import { useMessages } from "@/lib/i18n/provider";
import { createPartnerUser } from "../../actions-users";

/**
 * Form pembuatan akun login cabang (P-07).
 *
 * Tiga hal yang sengaja BERBEDA dari form "tambah" lain di layar admin:
 *
 *  1. Kata sandinya DITENTUKAN TOKO, bukan dibuatkan sistem. Alurnya di
 *     lapangan: kepala toko mengabari SANCI lewat WhatsApp kata sandi apa yang
 *     mereka mau, admin mengetikkannya di sini. Karena itu tidak ada tombol
 *     "buat otomatis" — kalau sistem yang memilih, kata sandinya bukan lagi
 *     kata sandi pilihan toko.
 *  2. TIDAK memakai draf lokal (`useLocalDraft`). Form ini berisi kata sandi;
 *     kata sandi tidak boleh menyentuh localStorage sama sekali, dan draf yang
 *     memulihkan nama + email tetapi tidak memulihkan kata sandinya justru
 *     menyesatkan. Isian tetap aman saat penyimpanan gagal karena modalnya
 *     tidak ditutup — yang diketik masih ada di layar (LESSONS #1).
 *  3. Pesan "tidak bisa dipastikan" ditulis khusus di sini. Tabel
 *     `partner_users` TIDAK punya kolom `client_request_id`, jadi pesan bawaan
 *     safe-write ("tekan Simpan lagi, nomor permintaannya sama") tidak berlaku
 *     dan akan menyesatkan.
 */

type BranchOption = { id: string; name: string; code: string };
type Kredensial = { name: string; branchName: string; email: string; password: string };

function usulanEmail(partnerCode: string, branchCode: string): string {
  return `${partnerCode}-${branchCode}@sanci.com`.toLowerCase();
}

export default function AddUserButton({
  partnerId,
  partnerCode,
  branches,
}: {
  partnerId: string;
  partnerCode: string;
  branches: BranchOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Teks jaringan bawaan (offline / "belum pasti") mengikuti bahasa yang
  // sedang dipakai — submitSafely mewajibkannya, supaya pemanggil yang lupa
  // ketahuan saat build, bukan muncul sebagai kalimat Indonesia di layar
  // berbahasa lain.
  const messages = useMessages();
  const { submitting, begin, release, reset } = useSubmitGuard();
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [netMsg, setNetMsg] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [email, setEmail] = useState(
    branches[0] ? usulanEmail(partnerCode, branches[0].code) : ""
  );
  // Sekali admin mengetik emailnya sendiri, usulan otomatis berhenti menimpa.
  const [emailDiubahSendiri, setEmailDiubahSendiri] = useState(false);
  const [password, setPassword] = useState("");

  const [kredensial, setKredensial] = useState<Kredensial | null>(null);
  const [salinStatus, setSalinStatus] = useState<string | null>(null);

  function openModal() {
    reset();
    setErrs({});
    setNetMsg(null);
    setKredensial(null);
    setSalinStatus(null);
    setName("");
    setBranchId(branches[0]?.id ?? "");
    setEmail(branches[0] ? usulanEmail(partnerCode, branches[0].code) : "");
    setEmailDiubahSendiri(false);
    setPassword("");
    setOpen(true);
  }

  function gantiCabang(nextId: string) {
    setBranchId(nextId);
    if (emailDiubahSendiri) return;
    const b = branches.find((x) => x.id === nextId);
    if (b) setEmail(usulanEmail(partnerCode, b.code));
  }

  function tutupSetelahSelesai() {
    setKredensial(null);
    setOpen(false);
    router.refresh();
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!begin()) return;
    setErrs({});
    setNetMsg(null);

    const branchName = branches.find((b) => b.id === branchId)?.name ?? "";
    const out = await submitSafely({
      run: () => createPartnerUser(partnerId, { name, branchId, email, password }),
      messages,
    });

    if (out.status === "offline") {
      release();
      setNetMsg(out.message);
      return;
    }
    if (out.status === "unconfirmed") {
      // Jangan tawarkan "tekan Simpan lagi": tanpa nomor permintaan, menekan
      // ulang bukan tindakan yang aman di sini.
      release();
      setNetMsg(messages.admin.userCreateUnconfirmedMsg);
      return;
    }

    const res = out.result;
    if ("error" in res) {
      release();
      setErrs({ [res.error.field || "_form"]: res.error.message });
      return;
    }

    // Server memastikan akun DAN baris penghubungnya tersimpan. Kata sandi
    // ditampilkan sekali di sini — sesudahnya tidak bisa dilihat lagi.
    setKredensial({ name: name.trim(), branchName, email: res.data.email, password });
    setPassword("");
  }

  async function salin() {
    if (!kredensial) return;
    const teks = `Email: ${kredensial.email}\nKata sandi: ${kredensial.password}`;
    try {
      await navigator.clipboard.writeText(teks);
      setSalinStatus(messages.admin.copySuccessMsg);
    } catch {
      setSalinStatus(messages.admin.copyFailMsg);
    }
  }

  if (!open) {
    return (
      <button className="btn primary" onClick={openModal}>
        {messages.admin.userAddBtn}
      </button>
    );
  }

  // Kartu kredensial: sengaja TIDAK bisa ditutup dengan klik di luar atau
  // tombol Batal. Kata sandi ini tidak tersimpan di mana pun dan tidak bisa
  // dilihat lagi, jadi menutupnya harus disengaja.
  if (kredensial) {
    return (
      <div className="overlay">
        <div className="modal" role="dialog" aria-modal="true">
          <h2>{messages.admin.userCredentialTitle}</h2>
          <div className="banner warn">{messages.admin.userCredentialWarning}</div>
          <dl className="kv">
            <dt>{messages.common.name}</dt>
            <dd>{kredensial.name}</dd>
            <dt>{messages.common.branch}</dt>
            <dd>{kredensial.branchName || "—"}</dd>
            <dt>{messages.admin.userCredentialEmailLabel}</dt>
            <dd>
              <span className="code">{kredensial.email}</span>
            </dd>
            <dt>{messages.admin.userCredentialPasswordLabel}</dt>
            <dd>
              <span className="code">{kredensial.password}</span>
            </dd>
          </dl>
          {salinStatus && <div className="banner info">{salinStatus}</div>}
          <p className="footnote">{messages.admin.userCredentialFootnote}</p>
          <div className="btnrow">
            <button type="button" className="btn" onClick={salin}>
              {messages.admin.copyCredentialsBtn}
            </button>
            <button type="button" className="btn primary" onClick={tutupSetelahSelesai}>
              {messages.admin.copyDoneBtn}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="modal" role="dialog" aria-modal="true">
        <h2>{messages.admin.userAddModalTitle}</h2>
        <div className="banner info">{messages.admin.userAddInfoBanner}</div>
        {netMsg && <div className="banner warn">{netMsg}</div>}
        {errs._form && <div className="banner bad">{errs._form}</div>}
        <form onSubmit={onSubmit}>
          <div className={`field${errs.name ? " invalid" : ""}`}>
            <label htmlFor="au_name">{messages.admin.userNameFieldLabel}</label>
            <input
              id="au_name"
              name="name"
              type="text"
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="hint">{messages.admin.userNameHint}</div>
            {errs.name && <div className="err-text">{errs.name}</div>}
          </div>

          <div className={`field${errs.branch_id ? " invalid" : ""}`}>
            <label htmlFor="au_branch">{messages.admin.userBranchFieldLabel}</label>
            <select
              id="au_branch"
              name="branch_id"
              value={branchId}
              onChange={(e) => gantiCabang(e.target.value)}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
            {errs.branch_id && <div className="err-text">{errs.branch_id}</div>}
          </div>

          <div className={`field${errs.email ? " invalid" : ""}`}>
            <label htmlFor="au_email">{messages.admin.userEmailFieldLabel}</label>
            <input
              id="au_email"
              name="email"
              type="email"
              autoComplete="off"
              inputMode="email"
              value={email}
              onChange={(e) => {
                setEmailDiubahSendiri(true);
                setEmail(e.target.value);
              }}
            />
            <div className="hint">{messages.admin.userEmailHint}</div>
            {errs.email && <div className="err-text">{errs.email}</div>}
          </div>

          <div className={`field${errs.password ? " invalid" : ""}`}>
            <label htmlFor="au_password">{messages.admin.userPasswordFieldLabel}</label>
            <input
              id="au_password"
              name="password"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="hint">{messages.admin.userPasswordHint.replace("{min}", "10")}</div>
            {errs.password && <div className="err-text">{errs.password}</div>}
          </div>

          <div className="btnrow">
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              {messages.common.cancel}
            </button>
            <button type="submit" className="btn primary" disabled={submitting}>
              {submitting ? messages.admin.userCreatingBtn : messages.admin.userCreateBtn}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
