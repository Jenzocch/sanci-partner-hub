import { headers } from "next/headers";

/**
 * Asal (protokol + host) permintaan yang SEDANG berjalan.
 *
 * SATU-SATUNYA sumber alamat dasar tautan pelanggan. Sengaja TIDAK ada
 * parameter dan TIDAK ada variabel lingkungan berisi domain:
 *
 *  * Client tidak boleh menyodorkan "base_url": tautan yang dikirim atas
 *    nama toko lewat WhatsApp ke pelanggannya adalah sasaran phishing yang
 *    sempurna — proyek lain sudah pernah menambal lubang persis itu. Kalau
 *    parameternya tidak ada, ia tidak bisa disuntik.
 *  * Domain juga tidak dipaku di kode: aplikasi ini hidup di beberapa alamat
 *    sekaligus (domain produksi, alamat preview Vercel, localhost saat
 *    pengembangan). Tautan yang dipaku ke satu domain akan salah di dua
 *    tempat lainnya.
 *
 * Dipakai dari Server Component MAUPUN Server Action — keduanya bisa membaca
 * header permintaan yang sama, jadi kedua jalur menghasilkan alamat yang
 * sama tanpa saling mengirim nilai.
 */
export async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto}://${host}`;
}
