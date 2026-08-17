export default function LoadingPelangganDetail() {
  return (
    <main className="pwrap">
      <div className="skeleton" style={{ width: 90, height: 15, marginBottom: 16 }} />
      <div className="card">
        <div className="skeleton" style={{ width: "55%", height: 22, marginBottom: 16 }} />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="skeleton" style={{ height: 15, marginBottom: 12, width: `${75 - i * 8}%` }} />
        ))}
      </div>
      <div className="skeleton" style={{ width: 140, height: 13, margin: "18px 0 10px" }} />
      <div className="card emptybox" />
    </main>
  );
}
