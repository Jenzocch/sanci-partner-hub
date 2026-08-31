/** Rangka muat /admin/warna — mirror loading.tsx /admin/produk, bentuk tabel. */
export default function LoadingWarna() {
  return (
    <div>
      <div className="worktop">
        <div className="skeleton" style={{ width: 100, height: 24 }} />
        <div className="skeleton" style={{ width: 140, height: 36, borderRadius: "var(--r-md)" }} />
      </div>
      <div className="skeleton" style={{ height: 220, borderRadius: "var(--r-md)" }} />
    </div>
  );
}
