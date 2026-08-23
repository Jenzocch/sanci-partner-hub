/**
 * Skeleton untuk /cabang (beranda) DAN sebagai fallback rute cabang yang
 * tidak punya loading.tsx sendiri (/cabang/akun, /cabang/profil,
 * /cabang/staff/[branchId]) — tanpa berkas ini, menekan "kembali ke beranda"
 * membuat layar DIAM di halaman lama sampai semua query beranda selesai,
 * yang terasa seperti "tombolnya tidak jalan" lalu ditekan lagi (audit
 * kecepatan muat 2026-08-22 #5a). Nol teks, jadi tidak butuh i18n.
 */
export default function LoadingCabang() {
  return (
    <main className="pwrap">
      <div className="skeleton" style={{ width: 140, height: 24, marginBottom: 6 }} />
      <div className="skeleton" style={{ width: 200, height: 15, marginBottom: 20 }} />
      <div className="skeleton" style={{ height: 56, marginBottom: 14, borderRadius: "var(--r-md)" }} />
      <div className="ilist">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton" style={{ height: 52, borderRadius: "var(--r-md)" }} />
        ))}
      </div>
    </main>
  );
}
