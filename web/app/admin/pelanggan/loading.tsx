/** Rangka muat /admin/pelanggan — baris tab lalu tabel, seperti halaman asli. */
export default function LoadingAdminPelanggan() {
  return (
    <div>
      <div className="worktop">
        <div className="skeleton" style={{ width: 130, height: 24 }} />
        <div className="skeleton" style={{ width: 160, height: 36, borderRadius: "var(--r-md)" }} />
      </div>
      <div className="row" style={{ gap: 8, marginBottom: 18 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton" style={{ width: 110, height: 36, borderRadius: "var(--r-md)" }} />
        ))}
      </div>
      <div className="skeleton" style={{ height: 48, marginBottom: 18, borderRadius: "var(--r-md)" }} />
      <div className="tablewrap">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} style={{ padding: "18px 20px", borderBottom: "1px solid var(--line)" }}>
            <div className="skeleton" style={{ width: "40%", height: 16 }} />
            <div className="skeleton" style={{ width: "30%", height: 13, marginTop: 8 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
