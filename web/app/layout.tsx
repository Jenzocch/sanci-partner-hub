import type { Metadata, Viewport } from "next";
import "./globals.css";
import SwRegister from "./sw-register";
import { getLocale } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "SANCI Partner Hub",
  description: "Kolaborasi SANCI dengan toko furnitur mitra",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SANCI Partner Hub",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  // Warna bilah browser mengikuti kanvas halaman, bukan warna merek — supaya
  // batas antara aplikasi dan sistem tidak terlihat.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
  width: "device-width",
  initialScale: 1,
  // Halaman menggambar sampai tepi layar; padding aman diatur lewat
  // env(safe-area-inset-*) di globals.css.
  viewportFit: "cover",
};

/**
 * `lang` mengikuti bahasa yang dipilih pengguna, bukan dipaku "id": pembaca
 * layar melafalkan halaman dengan bahasa ini, dan tawaran terjemahan otomatis
 * browser juga berpegang padanya. Halaman offline dirender statis, jadi
 * cookie-nya kosong dan nilainya jatuh ke bahasa bawaan (id) — itu benar:
 * berkasnya memang satu untuk semua orang.
 */
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <body>
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
