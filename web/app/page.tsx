import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale, getCommonMessages } from "@/lib/i18n";
import { CommonI18nProvider } from "@/lib/i18n/provider";
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

  const [locale, m] = await Promise.all([getLocale(), getCommonMessages()]);

  // Pemilih bahasa ada DI HALAMAN MASUK, bukan hanya di dalam aplikasi: orang
  // yang tidak bisa membaca Bahasa Indonesia harus bisa mengganti bahasa
  // SEBELUM masuk — kalau tidak, dia tidak akan pernah sampai ke dalam.
  //
  // Halaman ini HANYA pernah membaca `common` (tidak ada layar cabang/admin
  // di baliknya) — jadi cukup `CommonI18nProvider`, bukan bundel penuh.
  return (
    <CommonI18nProvider locale={locale} messages={m}>
      <main className="authwrap">
        <div className="authcard">
          {/* Wordmark ASLI dari owner (public/brand/sanci-logo.png), bukan
              teks bergaya seperti sebelumnya — bersama judul di bawahnya
              terbaca "SANCI Partner System". `<img>` biasa, BUKAN next/image:
              berkasnya 3 KB satu warna, optimasi tidak memberi apa pun dan
              pola ini sudah dipakai di halaman cetak. Warnanya dibalik jadi
              putih di tema gelap — lihat .brandlogo di globals.css. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- lihat catatan di atas */}
          <img className="brandlogo" src="/brand/sanci-logo.png" alt="SANCI" width={282} height={61} />
          {user ? (
            <>
              {/* Login berhasil tapi belum terdaftar di sistem — bukan error DB. */}
              <h1>{m.accountNotLinkedTitle}</h1>
              <p className="sub">{m.accountNotLinkedBody}</p>
              <LoginForm signOutOnly />
            </>
          ) : (
            <>
              <h1>{m.loginTitle}</h1>
              <p className="sub">{m.loginSubtitle}</p>
              <LoginForm />
            </>
          )}
          <LocaleSwitcher />
        </div>
      </main>
    </CommonI18nProvider>
  );
}
