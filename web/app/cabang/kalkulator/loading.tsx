export default function LoadingKalkulator() {
  return (
    <main className="pwrap">
      <div className="skeleton" style={{ width: 90, height: 15, marginBottom: 16 }} />
      <div className="skeleton" style={{ width: 200, height: 24, marginBottom: 16 }} />
      <div className="skeleton" style={{ height: 48, marginBottom: 18, borderRadius: "var(--r-md)" }} />
      <div className="skeleton" style={{ height: 44, marginBottom: 18, borderRadius: "var(--r-md)" }} />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 12,
        }}
      >
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="skeleton" style={{ aspectRatio: "1 / 1", height: "auto", borderRadius: "var(--r-lg)" }} />
            <div className="skeleton" style={{ width: "70%", height: 14 }} />
            <div className="skeleton" style={{ width: "40%", height: 13 }} />
          </div>
        ))}
      </div>
    </main>
  );
}
