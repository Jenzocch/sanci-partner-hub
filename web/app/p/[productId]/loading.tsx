import styles from "./produk-publik.module.css";

export default function LoadingProdukPublik() {
  return (
    <main className={styles.wrap}>
      <div className={styles.brandrow}>
        <div className="skeleton" style={{ width: 90, height: 30 }} />
      </div>
      <div className="skeleton" style={{ aspectRatio: "4 / 3", height: "auto", borderRadius: "var(--r-md)", marginBottom: 16 }} />
      <div className="skeleton" style={{ width: "60%", height: 26, marginBottom: 10 }} />
      <div className="skeleton" style={{ width: "35%", height: 16, marginBottom: 16 }} />
      <div className="skeleton" style={{ width: "90%", height: 14, marginBottom: 8 }} />
      <div className="skeleton" style={{ width: "80%", height: 14 }} />
    </main>
  );
}
