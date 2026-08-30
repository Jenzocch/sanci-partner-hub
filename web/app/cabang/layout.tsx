import { getLocale, getCabangMessages } from "@/lib/i18n";
import { CabangI18nProvider } from "@/lib/i18n/provider";
import CabangBottomNav from "./bottom-nav";

/**
 * Layout ini SENGAJA tidak memeriksa sesi: penjagaan sesi tetap di
 * masing-masing halaman seperti sebelumnya — memindahkannya ke sini akan
 * mengubah perilaku redirect yang sudah teruji. Dua tugasnya: meneruskan
 * bundle bahasa ke komponen client di bawah /cabang (cookie hanya bisa
 * dibaca di server), dan menggambar navigasi bawah mobile (murni UI, tanpa
 * query — aturan tampil/sembunyi ada di bottom-nav.tsx).
 *
 * Halaman server di bawah /cabang tetap memanggil `getCabangMessages()`
 * sendiri; provider ini khusus untuk `useCabangMessages()` di komponen
 * client. `CabangMessages` cuma membawa `common`+`cabang` — TIDAK PERNAH
 * kunci `admin.*` (audit 2026-08-21, lihat FEATURES.md).
 */
export const dynamic = "force-dynamic";

export default async function CabangLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [locale, messages] = await Promise.all([getLocale(), getCabangMessages()]);

  return (
    <CabangI18nProvider locale={locale} messages={messages}>
      {children}
      <CabangBottomNav />
    </CabangI18nProvider>
  );
}
