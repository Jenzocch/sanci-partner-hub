export default function LoadingProdukDetail() {
  return (
    <main className="pwrap">
      <div className="skeleton" style={{ width: 130, height: 15, marginBottom: 16 }} />
      <div className="skeleton" style={{ aspectRatio: "4 / 3", height: "auto", borderRadius: "var(--r-md)", marginBottom: 16 }} />
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton" style={{ width: 64, height: 64, borderRadius: "var(--r-sm)" }} />
        ))}
      </div>
      <div className="skeleton" style={{ width: "60%", height: 22, marginBottom: 10 }} />
      <div className="skeleton" style={{ width: "35%", height: 16, marginBottom: 16 }} />
      <div className="skeleton" style={{ width: "90%", height: 14, marginBottom: 8 }} />
      <div className="skeleton" style={{ width: "80%", height: 14 }} />
    </main>
  );
}
