/**
 * Rangka muat /admin/kalkulator — mengikuti pola skeleton admin (audit
 * 2026-08-21): worktop + bentuk isi ditiru (tab, kolom cari, grid produk
 * seperti rangka /cabang/kalkulator) supaya isi aslinya tidak "melompat".
 */
export default function LoadingAdminKalkulator() {
  return (
    <div>
      <div className="worktop">
        <div className="skeleton" style={{ width: 240, height: 24 }} />
      </div>
      <div className="skeleton" style={{ height: 52, marginBottom: 18, borderRadius: "var(--r-md)" }} />
      <div className="skeleton" style={{ height: 48, marginBottom: 18, borderRadius: "var(--r-md)" }} />
      <div className="skeleton" style={{ height: 44, marginBottom: 18, borderRadius: "var(--r-md)" }} />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          gap: 14,
        }}
      >
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="skeleton" style={{ aspectRatio: "1 / 1", height: "auto", borderRadius: "var(--r-lg)" }} />
            <div className="skeleton" style={{ width: "70%", height: 14 }} />
            <div className="skeleton" style={{ width: "40%", height: 13 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
