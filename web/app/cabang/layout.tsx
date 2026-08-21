import { getLocale, getCabangMessages } from "@/lib/i18n";
import { CabangI18nProvider } from "@/lib/i18n/provider";

/**
 * Layout ini SENGAJA tidak memeriksa sesi atau menggambar apa pun: satu-satunya
 * tugasnya meneruskan bundle bahasa ke komponen client di bawah /cabang
 * (cookie hanya bisa dibaca di server). Penjagaan sesi tetap di masing-masing
 * halaman seperti sebelumnya — memindahkannya ke sini akan mengubah perilaku
 * redirect yang sudah teruji.
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
    </CabangI18nProvider>
  );
}
