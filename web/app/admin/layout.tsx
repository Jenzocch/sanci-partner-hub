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
  // Tanpa auth.getUser(): batas keamanannya RLS, bukan cek halaman (LESSONS
  // #5) — pa_read (0001:413) hanya meloloskan baris ke admin (fn_is_admin →
  // SEMUA baris) atau baris milik sendiri; non-admin & pengunjung belum login
  // pasti 0 baris. `.limit(1)` WAJIB: dengan 3+ admin di produksi,
  // maybeSingle tanpa limit akan error karena admin melihat banyak baris.
  // Middleware sudah menyegarkan sesi tiap navigasi. Perilaku error DB
  // SENGAJA sama dengan sebelumnya (error diabaikan → dianggap bukan admin →
  // redirect); layout ini tidak punya kartu error, jangan diubah di slice ini.
  const { data: admin } = await supabase
    .from("platform_admins")
    .select("auth_user_id")
    .limit(1)
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
