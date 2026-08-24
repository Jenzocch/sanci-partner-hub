/**
 * Identitas build yang SAMA-SAMA dibakar ke bundle server dan client pada
 * saat build (lihat `env.NEXT_PUBLIC_BUILD_ID` di next.config.ts).
 *
 * Dipakai untuk mendeteksi "halaman versi lama vs server versi baru":
 *   - /version (app/version/route.ts) mengembalikan nilai server;
 *   - submitSafely (lib/safe-write.ts) membandingkannya dengan nilai yang
 *     dibakar di bundle client saat sebuah submit gagal tanpa kepastian.
 *
 * Sumber nilainya VERCEL_GIT_COMMIT_SHA: tersedia saat build di Vercel
 * (proyek ini deploy dari GitHub), berbeda antar deployment, dan identik
 * antara server & client dari build yang SAMA. Kalau tidak tersedia
 * (dev lokal, atau "Automatically expose System Environment Variables"
 * dimatikan), dua-duanya jatuh ke "dev" — perbandingan selalu sama, jadi
 * deteksinya diam (tidak pernah salah tuduh), bukan salah bunyi.
 */
export const BUILD_ID: string = process.env.NEXT_PUBLIC_BUILD_ID || "dev";
