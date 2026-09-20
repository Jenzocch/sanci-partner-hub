"use client";

/**
 * Satu deret filter berbentuk tombol (.segmented/.seg) di dalam form GET
 * daftar pesanan.
 *
 * LATAR: audit 2026-09-08 (P2-6) menukar <select> di halaman ini menjadi
 * tombol supaya tampilannya sama dengan filter sisi cabang, TAPI
 * mempertahankan "harus tekan Cari dulu". Itu justru memperburuk
 * kesenjangannya: sebuah <select> yang belum berlaku masih terbaca sebagai
 * kolom formulir, sedangkan TOMBOL terbaca sebagai "diklik = langsung
 * berlaku". Staf mengklik, daftarnya tidak berubah, dan layar terlihat sudah
 * berganti kondisi padahal isinya masih hasil filter sebelumnya
 * (audit 2026-09-15).
 *
 * Perbaikannya TIDAK mengubah mekanisme: begitu sebuah pilihan dipilih,
 * formulir GET yang sama disubmit lewat requestSubmit() — persis seperti
 * menekan "Cari", jadi kata kunci dan rentang tanggal yang sedang diisi ikut
 * terbawa (tidak hilang) dan URL-nya tetap bisa dibagikan/di-bookmark.
 * Tombol "Cari" tetap ada karena kolom teks dan tanggal memang perlu diisi
 * dulu sebelum diterapkan; tanpa JavaScript, tombol itu jalur cadangannya.
 */
export default function FilterSegment<T extends string>({
  name,
  options,
  current,
}: {
  name: string;
  options: { value: T; label: string }[];
  current: T;
}) {
  return (
    <div
      className="segmented"
      onChange={(e) => {
        const target = e.target;
        if (target instanceof HTMLInputElement && target.checked) target.form?.requestSubmit();
      }}
    >
      {options.map((o) => (
        <label key={o.value} className="seg radio">
          <input type="radio" name={name} value={o.value} defaultChecked={current === o.value} />
          {o.label}
        </label>
      ))}
    </div>
  );
}
