export default function LoadingPelanggan() {
  return (
    <main className="pwrap">
      <div className="skeleton" style={{ width: 90, height: 15, marginBottom: 16 }} />
      <div className="worktop">
        <div className="skeleton" style={{ width: 130, height: 24 }} />
        <div className="skeleton" style={{ width: 140, height: 36, borderRadius: "var(--r-md)" }} />
      </div>
      <div className="skeleton" style={{ height: 48, marginBottom: 18, borderRadius: "var(--r-md)" }} />
      <div className="cardlist">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="reccard" style={{ pointerEvents: "none" }}>
            <div className="skeleton" style={{ width: "55%", height: 17 }} />
            <div className="skeleton" style={{ width: "35%", height: 14, marginTop: 10 }} />
            <div className="skeleton" style={{ width: "25%", height: 13, marginTop: 8 }} />
          </div>
        ))}
      </div>
    </main>
  );
}
