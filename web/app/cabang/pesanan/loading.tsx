export default function LoadingPesanan() {
  return (
    <main className="pwrap">
      <div className="skeleton" style={{ width: 90, height: 15, marginBottom: 16 }} />
      <div className="worktop">
        <div className="skeleton" style={{ width: 160, height: 24 }} />
        <div className="skeleton" style={{ width: 120, height: 36, borderRadius: "var(--r-md)" }} />
      </div>
      <div className="skeleton" style={{ height: 48, marginBottom: 18, borderRadius: "var(--r-md)" }} />
      <div className="cardlist">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="reccard" style={{ pointerEvents: "none" }}>
            <div className="rc-top">
              <div className="skeleton" style={{ width: 90, height: 13 }} />
              <div className="skeleton" style={{ width: 64, height: 20, borderRadius: "var(--r-pill)" }} />
            </div>
            <div className="skeleton" style={{ width: "60%", height: 17, marginTop: 10 }} />
            <div className="skeleton" style={{ width: "40%", height: 14, marginTop: 8 }} />
          </div>
        ))}
      </div>
    </main>
  );
}
