import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SANCI Partner Hub",
  description: "Kolaborasi SANCI dengan toko furnitur mitra",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
