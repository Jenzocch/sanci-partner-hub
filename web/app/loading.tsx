/**
 * Rangka muat untuk rute akar `/` (audit UI 2026-09-01).
 *
 * `/` bukan halaman diam: ia menanyakan siapa yang login (auth.getUser) lalu
 * membaca platform_admins / partner_users untuk memutuskan hendak
 * mengarahkan ke mana. Tanpa berkas ini, membuka alamat aplikasi pada
 * jaringan lambat = layar kosong tanpa penjelasan sebelum redirect terjadi
 * — kesan pertama yang paling mudah dihindari.
 *
 * Sengaja SANGAT ringan (hanya satu blok): halaman ini hampir selalu berakhir
 * sebagai redirect, jadi rangka yang meniru sebuah layar penuh justru
 * berkedip lebih mengganggu daripada menenangkan. Nol teks, tanpa i18n.
 */
export default function LoadingRoot() {
  return (
    <main className="pwrap">
      <div className="skeleton" style={{ height: 56, borderRadius: "var(--r-md)" }} />
    </main>
  );
}
