/**
 * Alamat "Coba lagi" untuk halaman daftar yang GAGAL DIMUAT: jalur halaman
 * ini sendiri PLUS kata kunci dan filter yang sedang aktif.
 *
 * Kenapa bukan jalur kosong: pola lama di sisi cabang (mis.
 * app/cabang/produk/page.tsx) menaut ke jalur telanjang, jadi menekan "Coba
 * lagi" pada daftar yang sedang tersaring MEMBUANG saringannya — staf yang
 * sudah mengetik kata kunci dan memilih tiga filter harus menyusunnya lagi
 * dari awal, tepat pada saat sesuatu baru saja gagal. Audit 2026-09-15 minta
 * tombolnya mempertahankan keadaan, jadi tautannya dibangun dari
 * `searchParams` halaman itu apa adanya.
 *
 * Nilai kosong dibuang supaya `?q=&status=` tidak ikut terbawa — hasilnya
 * URL yang sama bersihnya dengan yang dibuat formulir GET-nya sendiri.
 */
export function retryHref(
  path: string,
  sp: Record<string, string | string[] | undefined>
): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (typeof value === "string") {
      if (value) qs.set(key, value);
    } else if (Array.isArray(value)) {
      for (const one of value) if (one) qs.append(key, one);
    }
  }
  const query = qs.toString();
  return query ? `${path}?${query}` : path;
}
