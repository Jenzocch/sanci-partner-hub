/**
 * Kontrak bersama PROPOSAL (buku penawaran untuk pelanggan).
 *
 * Apa ini: dokumen yang dibawa PULANG oleh pelanggan — halaman pertama
 * ringkasan pilihan + harga + rantai diskon, halaman berikutnya profil tiap
 * produk dengan foto besar. Bukan "surat penawaran" formal (SO/DO/Invoice
 * punya jalurnya sendiri di 0016) dan bukan dokumen yang disimpan ke
 * database: ini cetakan sekali pakai yang dirakit dari keranjang Kalkulator.
 *
 * Karena itu jalurnya SAMA sekali tidak menyentuh database untuk menulis —
 * persis seperti Kalkulator itu sendiri (lihat calculator-shared.ts). Yang
 * dibaca dari database cuma detail produk (deskripsi, ukuran, galeri foto)
 * lewat Server Action, tetap di bawah RLS + gerbang sanci_catalog_access
 * yang sama dengan halaman katalog.
 *
 * BEDA PENTING dari hand-off Kalkulator → Pesanan Baru: hand-off itu SEKALI
 * PAKAI (dihapus saat dibaca) supaya angka penawaran tidak diam-diam
 * terpakai untuk pesanan berikutnya. Hand-off proposal SENGAJA TIDAK
 * dihapus saat dibaca: halaman proposal adalah dokumen yang dicetak, dan
 * pengguna WAJIB bisa menekan Ctrl+P, kembali, memuat ulang, atau membuka
 * dialog cetak dua kali tanpa dokumennya menghilang di bawah tangannya.
 * Isinya tertimpa setiap kali tombol "Buat Proposal" ditekan lagi, jadi
 * tidak ada risiko angka basi ikut tercetak diam-diam.
 *
 * Harga MEMANG tampil di dokumen ini — itu inti gunanya. Karena itu
 * halamannya ada di bawah /cabang (wajib login staf toko), BUKAN di bawah
 * rute publik /p/[productId] yang aturannya tetap: katalog publik tidak
 * pernah menampilkan harga.
 */

/** Satu baris pilihan pelanggan — bentuknya sengaja sama dengan CalcHandoffLine. */
export type ProposalLine = {
  productId: string;
  name: string;
  code: string | null;
  unitPrice: number;
  qty: number;
};

export type ProposalHandoff = {
  savedAt: number;
  /** Nama pelanggan/proyek, diketik staf sebelum mencetak. Kosong = tidak dicetak. */
  customerName: string;
  lines: ProposalLine[];
  subtotal: number;
  discountPcts: number[];
  /**
   * Rupiah total seluruh langkah diskon, DIHITUNG DI KALKULATOR dan dibawa
   * ke sini apa adanya. Dokumen ini sengaja tidak menghitungnya sendiri:
   * rantai diskon punya satu rumus sah (computeChainFinal — kalikan
   * berurutan, SATU kali round di akhir, calculator-shared.ts) dan versi
   * kedua dari rumus itu adalah cara paling mudah membuat kertas yang
   * dipegang pelanggan berbeda beberapa rupiah dari layar staf.
   */
  totalDiscountAmount: number;
  markupPct: number | null;
  cashDiscount: number;
  finalAmount: number;
};

const PROPOSAL_HANDOFF_KEY = "sanci:proposal:handoff";

function isValidLine(v: unknown): v is ProposalLine {
  if (!v || typeof v !== "object") return false;
  const l = v as Record<string, unknown>;
  return (
    typeof l.productId === "string" &&
    typeof l.name === "string" &&
    (l.code === null || typeof l.code === "string") &&
    typeof l.unitPrice === "number" &&
    typeof l.qty === "number"
  );
}

/**
 * MENGEMBALIKAN keberhasilan — beda dari writeCalcDraft yang menelan
 * kegagalan diam-diam. Di sana penulisan adalah auto-save tertunda yang
 * pengguna tidak minta; di sini penulisan ADALAH aksi pengguna ("Buat
 * Proposal"), jadi tombol yang gagal harus mengatakannya, bukan berpindah
 * halaman ke dokumen kosong (LESSONS #10).
 */
export function writeProposalHandoff(h: Omit<ProposalHandoff, "savedAt">): boolean {
  try {
    window.localStorage.setItem(PROPOSAL_HANDOFF_KEY, JSON.stringify({ ...h, savedAt: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

export function readProposalHandoff(): ProposalHandoff | null {
  try {
    const raw = window.localStorage.getItem(PROPOSAL_HANDOFF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ProposalHandoff>;
    if (!parsed || typeof parsed.savedAt !== "number" || !Array.isArray(parsed.lines)) return null;
    const lines = parsed.lines.filter(isValidLine);
    if (lines.length === 0) return null;
    return {
      savedAt: parsed.savedAt,
      customerName: typeof parsed.customerName === "string" ? parsed.customerName : "",
      lines,
      subtotal: typeof parsed.subtotal === "number" ? parsed.subtotal : 0,
      discountPcts: Array.isArray(parsed.discountPcts)
        ? parsed.discountPcts.filter((n): n is number => typeof n === "number")
        : [],
      totalDiscountAmount:
        typeof parsed.totalDiscountAmount === "number" ? parsed.totalDiscountAmount : 0,
      markupPct: typeof parsed.markupPct === "number" ? parsed.markupPct : null,
      cashDiscount: typeof parsed.cashDiscount === "number" ? parsed.cashDiscount : 0,
      finalAmount: typeof parsed.finalAmount === "number" ? parsed.finalAmount : 0,
    };
  } catch {
    return null;
  }
}

/**
 * Profil produk untuk halaman isi — diambil SEGAR dari database saat
 * proposal dibuka (bukan dari localStorage): deskripsi/ukuran/galeri adalah
 * data katalog milik SANCI yang boleh berubah, dan dokumen yang dibawa
 * pelanggan tidak boleh mencetak deskripsi basi dari beberapa hari lalu
 * (LESSONS #6 — snapshot client tidak pernah jadi sumber kebenaran untuk
 * isi yang punya sumber otoritatif).
 */
export type ProposalProduct = {
  id: string;
  name: string;
  code: string | null;
  category: string | null;
  description: string | null;
  size: string | null;
  /** Foto sampul + galeri (0022), sudah berurutan, sampul selalu pertama. */
  photos: string[];
};
