import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale, getAdminMessages } from "@/lib/i18n";
import { AdminI18nProvider } from "@/lib/i18n/provider";
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

  // Komponen client di bawah /admin membaca teksnya lewat `useAdminMessages()`;
  // bundle-nya diteruskan sekali di sini karena cookie hanya bisa dibaca di
  // server. Halaman server tetap memanggil `getAdminMessages()` sendiri.
  // `AdminMessages` cuma membawa `common`+`admin` — TIDAK PERNAH kunci
  // `cabang.*` (audit 2026-08-21, lihat FEATURES.md).
  const [locale, messages] = await Promise.all([getLocale(), getAdminMessages()]);

  return (
    <AdminI18nProvider locale={locale} messages={messages}>
      <div className="shell">
        <AdminNav />
        <main className="main">{children}</main>
      </div>
    </AdminI18nProvider>
  );
}
