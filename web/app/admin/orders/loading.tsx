/** Rangka muat /admin/orders — tabel lebar, sama bentuk dengan halaman asli. */
export default function LoadingAdminOrders() {
  return (
    <div>
      <div className="worktop">
        <div className="skeleton" style={{ width: 200, height: 24 }} />
      </div>
      <div className="skeleton" style={{ height: 48, marginBottom: 18, borderRadius: "var(--r-md)" }} />
      <div className="tablewrap">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} style={{ padding: "18px 20px", borderBottom: "1px solid var(--line)" }}>
            <div className="skeleton" style={{ width: "35%", height: 16 }} />
            <div className="skeleton" style={{ width: "55%", height: 13, marginTop: 8 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
