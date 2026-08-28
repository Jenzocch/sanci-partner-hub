export default function LoadingProduk() {
  return (
    <main className="pwrap">
      <div className="skeleton" style={{ width: 90, height: 15, marginBottom: 16 }} />
      <div className="skeleton" style={{ width: 160, height: 24, marginBottom: 16 }} />
      <div className="skeleton" style={{ height: 48, marginBottom: 18, borderRadius: "var(--r-md)" }} />
      {/* Baris chip kategori — SATU baris yang bisa digulir mendatar, sama
          seperti .filters di produk.module.css. Tanpa placeholder ini,
          halaman sungguhan mendorong seluruh grid ke bawah saat hidrasi.
          marginBottom 22 = padding-bottom 4 + margin-bottom 18 milik
          .filters, supaya tinggi totalnya sama persis. */}
      <div style={{ display: "flex", gap: 8, marginBottom: 22, overflow: "hidden" }}>
        {[64, 92, 78, 110].map((w) => (
          <div
            key={w}
            className="skeleton"
            style={{ width: w, height: 44, flex: "none", borderRadius: "var(--r-pill)" }}
          />
        ))}
      </div>
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
            {/* Baris harga (keputusan owner 2026-08-28) — kartu sungguhan
                punya empat baris teks, jadi rangkanya juga. */}
            <div className="skeleton" style={{ width: "55%", height: 14 }} />
          </div>
        ))}
      </div>
    </main>
  );
}
