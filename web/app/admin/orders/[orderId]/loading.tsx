/**
 * Rangka muat detail pesanan admin. Halaman ini yang paling banyak
 * menunggu (satu gelombang berisi belasan pembacaan), jadi justru di sini
 * layar kosong paling terasa.
 */
export default function LoadingAdminOrderDetail() {
  return (
    <div>
      <div className="skeleton" style={{ width: 220, height: 13, marginBottom: 12 }} />
      <div className="worktop">
        <div className="skeleton" style={{ width: 200, height: 28 }} />
        <div className="skeleton" style={{ width: 100, height: 26, borderRadius: "var(--r-pill)" }} />
      </div>
      <div className="card">
        <div className="skeleton" style={{ width: 120, height: 13, marginBottom: 10 }} />
        <div className="skeleton" style={{ width: "55%", height: 22, marginBottom: 10 }} />
        <div className="skeleton" style={{ width: "35%", height: 16 }} />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="card">
          <div className="skeleton" style={{ width: 140, height: 20, marginBottom: 16 }} />
          <div className="skeleton" style={{ width: "70%", height: 14 }} />
          <div className="skeleton" style={{ width: "40%", height: 14, marginTop: 10 }} />
        </div>
      ))}
    </div>
  );
}
