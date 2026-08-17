import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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

    // Login berhasil tapi belum terdaftar di sistem — bukan error DB.
    return (
      <main className="authwrap">
        <div className="authcard">
          <div className="wordmark serif">SANCI</div>
          <h1>Akun belum terdaftar</h1>
          <p className="sub">
            Akun Anda berhasil masuk tetapi belum dihubungkan ke partner mana
            pun. Hubungi SANCI Admin.
          </p>
          <LoginForm signOutOnly />
        </div>
      </main>
    );
  }

  return (
    <main className="authwrap">
      <div className="authcard">
        <div className="wordmark serif">SANCI</div>
        <h1>Partner Hub</h1>
        <p className="sub">Masuk dengan akun yang dibuat oleh SANCI Admin.</p>
        <LoginForm />
      </div>
    </main>
  );
}
