/** Rangka muat /admin/analisis — bentuk kartu + baris bar chart, mirip skeleton /admin/orders. */
export default function LoadingAdminAnalytics() {
  return (
    <div>
      <div className="worktop">
        <div className="skeleton" style={{ width: 200, height: 24 }} />
      </div>
      <div className="skeleton" style={{ height: 48, marginBottom: 18, borderRadius: "var(--r-md)" }} />
      <div className="card">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} style={{ padding: "14px 0", borderBottom: "1px solid var(--line)" }}>
            <div className="skeleton" style={{ width: "40%", height: 16 }} />
            <div className="skeleton" style={{ width: "100%", height: 10, marginTop: 8, borderRadius: "var(--r-pill)" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
