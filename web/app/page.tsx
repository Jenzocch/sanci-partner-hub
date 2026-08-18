import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale, getMessages } from "@/lib/i18n";
import { I18nProvider } from "@/lib/i18n/provider";
import LocaleSwitcher from "@/lib/i18n/locale-switcher";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: admin } = await supabase
      .from("platform_admins")
      .select("auth_user_id")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (admin) redirect("/admin");

    const { data: pu } = await supabase
      .from("partner_users")
      .select("id")
      .maybeSingle();
    if (pu) redirect("/cabang");
  }

  const [locale, m] = await Promise.all([getLocale(), getMessages()]);

  // Pemilih bahasa ada DI HALAMAN MASUK, bukan hanya di dalam aplikasi: orang
  // yang tidak bisa membaca Bahasa Indonesia harus bisa mengganti bahasa
  // SEBELUM masuk — kalau tidak, dia tidak akan pernah sampai ke dalam.
  return (
    <I18nProvider locale={locale} messages={m}>
      <main className="authwrap">
        <div className="authcard">
          <div className="wordmark serif">SANCI</div>
          {user ? (
            <>
              {/* Login berhasil tapi belum terdaftar di sistem — bukan error DB. */}
              <h1>{m.common.accountNotLinkedTitle}</h1>
              <p className="sub">{m.common.accountNotLinkedBody}</p>
              <LoginForm signOutOnly />
            </>
          ) : (
            <>
              <h1>{m.common.loginTitle}</h1>
              <p className="sub">{m.common.loginSubtitle}</p>
              <LoginForm />
            </>
          )}
          <LocaleSwitcher />
        </div>
      </main>
    </I18nProvider>
  );
}
