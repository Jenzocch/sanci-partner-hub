/**
 * Rangka muat untuk /lihat/[token] — halaman yang dibuka PELANGGAN dari
 * tautan WhatsApp (audit UI 2026-09-01).
 *
 * Kenapa halaman ini yang paling butuh: pembacanya bukan staf yang tahu
 * sistemnya sedang berpikir, melainkan orang yang baru menekan sebuah tautan
 * di ponselnya. Halaman ini menunggu satu RPC (fn_customer_order_view)
 * sebelum ada apa pun untuk digambar, jadi tanpa berkas ini jaringan lambat
 * = LAYAR PUTIH TOTAL sampai database menjawab — dan reaksi wajar terhadap
 * layar putih adalah "tautannya rusak", lalu menutup tab atau menekan ulang
 * berkali-kali.
 *
 * Segmen ini di LUAR /admin dan /cabang, jadi ia tidak kebagian loading.tsx
 * fallback milik keduanya — itulah sebabnya berkas ini harus ada sendiri.
 * Nol teks, jadi tidak butuh i18n dan tidak pernah salah bahasa.
 */
export default function LoadingLihat() {
  return (
    <main className="pwrap">
      <div className="skeleton" style={{ width: 150, height: 22, marginBottom: 18 }} />
      <div className="card">
        <div className="skeleton" style={{ width: "60%", height: 26, marginBottom: 10 }} />
        <div className="skeleton" style={{ width: "40%", height: 15, marginBottom: 22 }} />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ display: "flex", gap: 12, marginBottom: 14 }}>
            <div className="skeleton" style={{ width: 54, height: 54, borderRadius: "var(--r-md)", flex: "none" }} />
            <div style={{ flex: 1 }}>
              <div className="skeleton" style={{ width: "70%", height: 15, marginBottom: 7 }} />
              <div className="skeleton" style={{ width: "45%", height: 13 }} />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
