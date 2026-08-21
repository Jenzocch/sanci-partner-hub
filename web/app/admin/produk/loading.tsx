/**
 * Rangka muat /admin/produk. Halaman ini memuat SELURUH katalog sekaligus
 * (169 produk dan bertambah) — halaman admin yang paling lama menunggu,
 * jadi bentuk gridnya ditiru supaya isi aslinya tidak "melompat" masuk.
 */
export default function LoadingAdminProduk() {
  return (
    <div>
      <div className="worktop">
        <div className="skeleton" style={{ width: 130, height: 24 }} />
        <div className="skeleton" style={{ width: 140, height: 36, borderRadius: "var(--r-md)" }} />
      </div>
      <div className="skeleton" style={{ height: 48, marginBottom: 18, borderRadius: "var(--r-md)" }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 18 }}>
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 0 }}>
            <div className="skeleton" style={{ width: "100%", aspectRatio: "4 / 3", borderRadius: 0 }} />
            <div style={{ padding: 16 }}>
              <div className="skeleton" style={{ width: "70%", height: 16 }} />
              <div className="skeleton" style={{ width: "40%", height: 13, marginTop: 10 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
