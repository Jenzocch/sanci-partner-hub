import type { Metadata, Viewport } from "next";
import "./globals.css";
import SwRegister from "./sw-register";

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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
