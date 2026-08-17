"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { submitSafely } from "@/lib/safe-write";
import { createPartnerUser } from "../../actions-users";

/**
 * Form pembuatan akun login cabang (P-07).
 *
 * Dua hal yang sengaja BERBEDA dari form "tambah" lain di layar admin:
 *
 *  1. TIDAK memakai draf lokal (`useLocalDraft`). Form ini berisi kata sandi;
 *     kata sandi tidak boleh menyentuh localStorage sama sekali, dan draf yang
 *     memulihkan nama + email tetapi tidak memulihkan kata sandinya justru
 *     menyesatkan. Isian tetap aman saat penyimpanan gagal karena modalnya
 *     tidak ditutup — yang diketik masih ada di layar (LESSONS #1).
 *  2. Pesan "tidak bisa dipastikan" ditulis khusus di sini. Tabel
 *     `partner_users` TIDAK punya kolom `client_request_id`, jadi pesan bawaan
 *     safe-write ("tekan Simpan lagi, nomor permintaannya sama") tidak berlaku
 *     dan akan menyesatkan.
 */

type BranchOption = { id: string; name: string; code: string };
type Kredensial = { name: string; branchName: string; email: string; password: string };

// Disamakan persis dengan PESAN_AKUN.buatTidakPasti di actions-users.ts. File
// "use server" tidak boleh mengekspor apa pun selain async function, jadi teks
// ini ditulis ulang di sini. Kalau salah satunya diubah, ubah keduanya.
const PESAN_TIDAK_PASTI =
  "Koneksi ke server terputus sebelum jawaban sampai, jadi belum bisa dipastikan akun login " +
  "sudah dibuat atau belum. JANGAN langsung membuat ulang. Muat ulang halaman ini dan lihat " +
  "daftar Akun: kalau akun belum muncul tetapi email tadi ditolak karena sudah dipakai, " +
  "hubungi petugas teknis dan sebutkan email tersebut.";

// Tanpa 0/O dan 1/l supaya tidak salah baca saat kata sandi dibacakan atau
// disalin manual oleh kepala toko.
const ALFABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const PANJANG_SANDI_OTOMATIS = 14;

/**
 * Kata sandi acak dari sumber acak kriptografis (`crypto.getRandomValues`),
 * bukan `Math.random()`. Sisa pembagian dibuang lewat penolakan sampel supaya
 * tidak ada karakter yang muncul lebih sering daripada yang lain.
 */
function buatKataSandi(): string {
  const batas = Math.floor(256 / ALFABET.length) * ALFABET.length;
  const buf = new Uint8Array(1);
  // Diulang sampai ada huruf besar, huruf kecil, dan angka — sebagian proyek
  // Supabase menuntut campuran itu, dan penolakannya baru terlihat setelah
  // admin menekan Buat Akun. Peluang gagal di 14 karakter sangat kecil, jadi
  // pengulangan ini praktis tidak pernah berjalan lebih dari sekali.
  let hasil = "";
  for (let percobaan = 0; percobaan < 20; percobaan++) {
    hasil = "";
    while (hasil.length < PANJANG_SANDI_OTOMATIS) {
      crypto.getRandomValues(buf);
      if (buf[0] >= batas) continue;
      hasil += ALFABET[buf[0] % ALFABET.length];
    }
    if (/[A-Z]/.test(hasil) && /[a-z]/.test(hasil) && /[0-9]/.test(hasil)) break;
  }
  // Kalaupun batas percobaan habis, yang dikembalikan tetap kata sandi acak
  // sepanjang 14 karakter — jangan pernah mengosongkan kolomnya diam-diam.
  return hasil;
}

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
      setNetMsg(PESAN_TIDAK_PASTI);
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
      setSalinStatus("Tersalin. Tempel di WhatsApp kepala toko sekarang.");
    } catch {
      setSalinStatus("Tidak bisa menyalin otomatis di perangkat ini — catat manual dari layar.");
    }
  }

  if (!open) {
    return (
      <button className="btn primary" onClick={openModal}>
        + Tambah Akun
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
          <h2>Akun login berhasil dibuat</h2>
          <div className="banner warn">
            Kata sandi di bawah hanya ditampilkan <b>SEKALI</b>. Setelah kotak ini ditutup, kata
            sandinya tidak bisa dilihat lagi oleh siapa pun. Serahkan sekarang juga ke kepala toko.
          </div>
          <dl className="kv">
            <dt>Nama</dt>
            <dd>{kredensial.name}</dd>
            <dt>Cabang</dt>
            <dd>{kredensial.branchName || "—"}</dd>
            <dt>Email untuk masuk</dt>
            <dd>
              <span className="code">{kredensial.email}</span>
            </dd>
            <dt>Kata sandi awal</dt>
            <dd>
              <span className="code">{kredensial.password}</span>
            </dd>
          </dl>
          {salinStatus && <div className="banner info">{salinStatus}</div>}
          <p className="footnote">
            Email ini tidak menerima surat — fungsinya hanya sebagai nama untuk masuk. Kalau kata
            sandinya nanti hilang, akun ini tidak bisa dipulihkan dari layar ini; buat akun baru
            atau hubungi petugas teknis.
          </p>
          <div className="btnrow">
            <button type="button" className="btn" onClick={salin}>
              Salin email &amp; kata sandi
            </button>
            <button type="button" className="btn primary" onClick={tutupSetelahSelesai}>
              Saya sudah mencatat — Tutup
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="modal" role="dialog" aria-modal="true">
        <h2>Tambah Akun Login</h2>
        <div className="banner info">
          Satu cabang memakai satu akun bersama. Nama penjual dan PIC tetap dipilih dari daftar staf
          saat membuat pesanan — bukan dari akun ini.
        </div>
        {netMsg && <div className="banner warn">{netMsg}</div>}
        {errs._form && <div className="banner bad">{errs._form}</div>}
        <form onSubmit={onSubmit}>
          <div className={`field${errs.name ? " invalid" : ""}`}>
            <label htmlFor="au_name">Nama *</label>
            <input
              id="au_name"
              name="name"
              type="text"
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="hint">Nama yang tampil di daftar akun, mis. nama toko atau cabangnya.</div>
            {errs.name && <div className="err-text">{errs.name}</div>}
          </div>

          <div className={`field${errs.branch_id ? " invalid" : ""}`}>
            <label htmlFor="au_branch">Cabang *</label>
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
            <label htmlFor="au_email">Email untuk masuk *</label>
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
            <div className="hint">
              Tidak perlu email asli — alamat ini hanya dipakai untuk masuk, tidak menerima surat.
              Usulan otomatis mengikuti kode partner dan kode cabang.
            </div>
            {errs.email && <div className="err-text">{errs.email}</div>}
          </div>

          <div className={`field${errs.password ? " invalid" : ""}`}>
            <label htmlFor="au_password">Kata sandi awal *</label>
            <input
              id="au_password"
              name="password"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="hint">
              Minimal 10 karakter. Sengaja ditampilkan supaya bisa langsung dicatat — kata sandi ini
              hanya bisa dilihat sekali, tepat setelah akunnya dibuat.
            </div>
            {errs.password && <div className="err-text">{errs.password}</div>}
            <div className="btnrow-inline">
              <button
                type="button"
                className="btn sm"
                onClick={() => setPassword(buatKataSandi())}
              >
                Buat otomatis
              </button>
            </div>
          </div>

          <div className="btnrow">
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Batal
            </button>
            <button type="submit" className="btn primary" disabled={submitting}>
              {submitting ? "Membuat…" : "Buat Akun"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
