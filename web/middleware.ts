import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

export async function middleware(request: NextRequest) {
  // Prefetch RSC (tautan <Link> yang masuk viewport) TIDAK butuh penyegaran
  // sesi: hasil prefetch tidak perlu menulis cookie balik ke browser, dan
  // navigasi sungguhan setelahnya tetap melewati middleware ini seperti
  // biasa. Tanpa early-return ini, SETIAP prefetch ikut memanggil
  // auth.getUser() — satu perjalanan penuh ke Supabase per tautan yang
  // kebetulan terlihat di layar; daftar 100 pesanan = sampai 100 panggilan
  // auth ekstra tanpa satu piksel pun berubah (audit kecepatan muat
  // 2026-08-22, temuan #2a/#9).
  if (
    request.headers.get("next-router-prefetch") === "1" ||
    request.headers.get("purpose") === "prefetch"
  ) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Menyegarkan token sesi bila kedaluwarsa.
  await supabase.auth.getUser();
  return response;
}

export const config = {
  // `version` dikecualikan seperti `offline`: GET /version hanya menjawab id
  // build (lihat app/version/route.ts) dan dipanggil justru saat submit
  // gagal — tidak boleh ikut membayar auth.getUser() per panggilan.
  //
  // `p/` (halaman produk PUBLIK, 0022) ikut dikecualikan dengan alasan yang
  // sama tapi motif berbeda: halaman itu memang dirancang untuk DISEBAR ke
  // banyak calon pembeli lewat WhatsApp, dan pengunjungnya anonim — tidak ada
  // sesi yang perlu disegarkan, jadi auth.getUser() per kunjungan murni biaya
  // (satu perjalanan ke Supabase untuk setiap orang yang membuka tautan).
  // Polanya SENGAJA "p/" berikut garis miring, bukan "p" telanjang: tanpa
  // garis miring ia juga akan mencocokkan rute lain yang kebetulan diawali
  // huruf p. Ini TIDAK melonggarkan keamanan — penjaganya RLS (sp_anon_read
  // hanya benar saat auth.uid() IS NULL), bukan middleware; dan pengguna yang
  // SEDANG login tetap membawa cookie sesinya seperti biasa saat membuka
  // /p/... (yang dilewati di sini cuma penyegaran token, bukan pembacaannya).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|offline|version|p/|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)",
  ],
};
