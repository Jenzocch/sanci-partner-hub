/** Rangka muat /admin/orders/baru — sama bentuk dengan halaman asli. */
export default function LoadingAdminOrderBaru() {
  return (
    <div>
      <div className="skeleton" style={{ width: 200, height: 15, marginBottom: 16 }} />
      <div className="skeleton" style={{ width: 220, height: 24, marginBottom: 8 }} />
      <div className="skeleton" style={{ width: 320, height: 15, marginBottom: 20 }} />
      <div className="card">
        {[0, 1, 2].map((i) => (
          <div key={i} className="field">
            <div className="skeleton" style={{ width: 120, height: 13, marginBottom: 8 }} />
            <div className="skeleton" style={{ height: 44, borderRadius: "var(--r-md)" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
