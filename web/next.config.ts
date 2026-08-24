import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Identitas deployment, dibakar SAAT BUILD ke bundle server DAN client
   * (`env` di sini memakai DefinePlugin untuk kedua sisi). Dibaca lewat
   * lib/build-id.ts; dipakai deteksi "halaman versi lama" di lib/safe-write.ts
   * + app/version/route.ts. VERCEL_GIT_COMMIT_SHA berbeda antar deployment
   * dan identik untuk server & client dari build yang sama; tanpa itu
   * (dev lokal) dua sisi sama-sama "dev" sehingga deteksi diam.
   */
  env: {
    NEXT_PUBLIC_BUILD_ID:
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.VERCEL_DEPLOYMENT_ID ||
      "dev",
  },
  experimental: {
    /**
     * Cache router sisi CLIENT untuk halaman dinamis: kembali ke halaman
     * yang baru dilihat (<=30 detik) dirender dari memori ponsel — NOL
     * perjalanan ke server (audit kecepatan muat 2026-08-22, arahan owner
     * "有些不需要來回跑"). 30 detik adalah default Next 14 yang dihilangkan
     * di Next 15; dipulihkan secara sadar di sini.
     *
     * Kenapa AMAN untuk data yang bisa berubah: setiap Server Action tulis
     * di app ini memanggil revalidatePath() (pola rumah sejak awal), dan
     * revalidasi itu ikut MEMBERSIHKAN cache router client pada respons
     * action yang sama — perubahan yang baru disimpan pengguna selalu
     * langsung terlihat. Yang mungkin basi maksimal 30 detik hanyalah
     * perubahan ORANG LAIN di sela dua kunjungan — jendela yang sama dengan
     * membuka halaman lalu membacanya selama 30 detik.
     */
    staleTimes: {
      dynamic: 30,
    },
  },
};

export default nextConfig;
