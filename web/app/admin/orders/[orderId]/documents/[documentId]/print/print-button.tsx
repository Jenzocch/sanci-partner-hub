"use client";

/**
 * Tombol "Cetak / Simpan PDF" — client component TERKECIL yang mungkin
 * (hanya window.print(), tidak ada state lain) supaya sisa halaman cetak
 * tetap server component murni (SPEC: "server component"). Class `no-print`
 * membuat tombol ini hilang sendiri saat benar-benar dicetak/disimpan PDF —
 * tidak ada gunanya di atas kertas.
 */
export default function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="btn primary no-print"
      style={{ position: "fixed", top: 16, right: 16, zIndex: 10 }}
      onClick={() => window.print()}
    >
      {label}
    </button>
  );
}
