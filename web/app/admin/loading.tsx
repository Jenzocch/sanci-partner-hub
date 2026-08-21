/**
 * Rangka muat untuk /admin (daftar Partner) — sekaligus jaring pengaman
 * untuk segmen admin yang belum punya loading.tsx sendiri.
 *
 * Setiap halaman admin adalah `force-dynamic` dan menunggu Supabase, jadi
 * tanpa berkas ini navigasi terasa "menggantung": nav sudah berganti tapi
 * area kerja masih halaman lama sampai server menjawab. Pola dan kelasnya
 * sama persis dengan tujuh loading.tsx di sisi cabang — hanya kelas
 * STYLE CONTRACT (.skeleton/.worktop/.tablewrap), tanpa teks apa pun
 * sehingga tidak perlu i18n.
 */
export default function LoadingAdmin() {
  return (
    <div>
      <div className="worktop">
        <div className="skeleton" style={{ width: 160, height: 24 }} />
        <div className="skeleton" style={{ width: 140, height: 36, borderRadius: "var(--r-md)" }} />
      </div>
      <div className="skeleton" style={{ height: 48, marginBottom: 18, borderRadius: "var(--r-md)" }} />
      <div className="tablewrap">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} style={{ padding: "18px 20px", borderBottom: "1px solid var(--line)" }}>
            <div className="skeleton" style={{ width: "45%", height: 16 }} />
            <div className="skeleton" style={{ width: "25%", height: 13, marginTop: 8 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
