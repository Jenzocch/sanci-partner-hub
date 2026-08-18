import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale, getMessages } from "@/lib/i18n";
import { I18nProvider } from "@/lib/i18n/provider";
import AdminNav from "./admin-nav";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: admin } = await supabase
    .from("platform_admins")
    .select("auth_user_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!admin) redirect("/");

  // Komponen client di bawah /admin membaca teksnya lewat `useMessages()`;
  // bundle-nya diteruskan sekali di sini karena cookie hanya bisa dibaca di
  // server. Halaman server tetap memanggil `getMessages()` sendiri.
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);

  return (
    <I18nProvider locale={locale} messages={messages}>
      <div className="shell">
        <AdminNav />
        <main className="main">{children}</main>
      </div>
    </I18nProvider>
  );
}
