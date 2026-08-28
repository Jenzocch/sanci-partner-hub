export default function LoadingProdukDetail() {
  return (
    <main className="pwrap">
      <div className="skeleton" style={{ width: 130, height: 15, marginBottom: 16 }} />
      <div className="skeleton" style={{ aspectRatio: "4 / 3", height: "auto", borderRadius: "var(--r-md)", marginBottom: 16 }} />
      {/* Strip thumbnail SENGAJA tidak digambar: produk-detail-client hanya
          merendernya kalau fotonya LEBIH DARI SATU, dan kebanyakan produk
          cuma punya foto sampul. Menggambar tiga thumbnail di sini membuat
          isi halaman melompat ke ATAS 72 px pada kasus yang paling sering
          — lebih mengganggu daripada tidak memesan tempat sama sekali. */}
      <div className="skeleton" style={{ width: "60%", height: 22, marginBottom: 10 }} />
      <div className="skeleton" style={{ width: "35%", height: 16, marginBottom: 16 }} />
      <div className="skeleton" style={{ width: "90%", height: 14, marginBottom: 8 }} />
      <div className="skeleton" style={{ width: "80%", height: 14 }} />
    </main>
  );
}
