import { BUILD_ID } from "@/lib/build-id";

/**
 * Mengembalikan identitas build deployment yang SEDANG melayani permintaan.
 *
 * Dipakai submitSafely (lib/safe-write.ts): saat sebuah submit gagal tanpa
 * kepastian, client membandingkan jawaban ini dengan BUILD_ID yang dibakar
 * di bundle-nya sendiri. Beda = halaman berasal dari deployment lama, dan
 * Server Action lama akan terus 404 sampai halaman dimuat ulang — pengguna
 * diberi tahu untuk muat ulang, bukan disuruh "tekan Simpan lagi".
 *
 * `force-dynamic` + `no-store`: jawabannya tidak boleh diambil dari cache
 * mana pun — satu-satunya gunanya justru mengetahui versi server SEKARANG.
 * Rute ini juga dikecualikan dari middleware auth (lihat matcher di
 * middleware.ts) — isinya cuma id build, bukan data.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return new Response(BUILD_ID, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
