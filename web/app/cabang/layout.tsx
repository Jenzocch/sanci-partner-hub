import { getLocale, getMessages } from "@/lib/i18n";
import { I18nProvider } from "@/lib/i18n/provider";

/**
 * Layout ini SENGAJA tidak memeriksa sesi atau menggambar apa pun: satu-satunya
 * tugasnya meneruskan bundle bahasa ke komponen client di bawah /cabang
 * (cookie hanya bisa dibaca di server). Penjagaan sesi tetap di masing-masing
 * halaman seperti sebelumnya — memindahkannya ke sini akan mengubah perilaku
 * redirect yang sudah teruji.
 *
 * Halaman server di bawah /cabang tetap memanggil `getMessages()` sendiri;
 * provider ini khusus untuk `useMessages()` di komponen client.
 */
export const dynamic = "force-dynamic";

export default async function CabangLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);

  return (
    <I18nProvider locale={locale} messages={messages}>
      {children}
    </I18nProvider>
  );
}
