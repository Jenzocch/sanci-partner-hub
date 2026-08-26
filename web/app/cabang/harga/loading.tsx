export default function LoadingHarga() {
  return (
    <main className="pwrap">
      <div className="skeleton" style={{ width: 90, height: 15, marginBottom: 16 }} />
      <div className="skeleton" style={{ width: 160, height: 24, marginBottom: 16 }} />
      <div className="skeleton" style={{ height: 48, marginBottom: 18, borderRadius: "var(--r-md)" }} />
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
          <div className="skeleton" style={{ width: "60%", height: 15 }} />
          <div className="skeleton" style={{ width: "40%", height: 13 }} />
          <div className="skeleton" style={{ height: 42, borderRadius: "var(--r-md)" }} />
        </div>
      ))}
    </main>
  );
}
