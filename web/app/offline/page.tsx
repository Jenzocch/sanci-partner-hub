export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main className="authwrap">
      <div className="authcard" style={{ textAlign: "center" }}>
        <div className="serif" style={{ fontSize: 15, letterSpacing: ".06em" }}>
          SANCI
        </div>
        <h1>Tidak ada koneksi</h1>
        <p className="sub">
          Halaman ini belum pernah dibuka sebelumnya, jadi tidak tersedia
          secara offline. Sambungkan kembali ke internet lalu coba lagi.
        </p>
        <a className="btn primary" href="/">
          Coba lagi
        </a>
      </div>
    </main>
  );
}
