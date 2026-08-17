export default function LoadingPesananDetail() {
  return (
    <main className="pwrap">
      <div className="skeleton" style={{ width: 130, height: 15, marginBottom: 16 }} />
      <div className="idcard">
        <div className="skeleton" style={{ width: 100, height: 12, marginBottom: 10 }} />
        <div className="skeleton" style={{ width: "70%", height: 22, marginBottom: 10 }} />
        <div className="skeleton" style={{ width: "45%", height: 16 }} />
      </div>
      <div className="card">
        <div className="skeleton" style={{ width: 140, height: 20, marginBottom: 16 }} />
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton" style={{ height: 15, marginBottom: 12, width: `${70 - i * 8}%` }} />
        ))}
      </div>
    </main>
  );
}
