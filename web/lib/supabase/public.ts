import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Client Supabase TANPA cookies — khusus rute publik/anon SEJATI seperti
 * `/p/[productId]` (migration 0022 §3–4: `sp_anon_read`/`ph_anon_read`,
 * dirancang lepas dari gerbang katalog partner mana pun).
 *
 * `lib/supabase/server.ts` (dipakai HAMPIR semua rute lain) membaca
 * `cookies()` dari `next/headers` — itu API "dinamis" Next.js: begitu
 * dipanggil, SELURUH render halaman dipaksa jalan ulang di server pada
 * SETIAP request (Full Route Cache dimatikan), membuat `export const
 * revalidate` di halaman manapun yang memakainya menjadi TIDAK BEROPERASI
 * (diverifikasi lewat dokumentasi Next.js — Dynamic APIs mengesampingkan
 * ISR, bukan cuma "kurang optimal"). Untuk halaman yang benar-benar tidak
 * butuh identitas siapa yang membuka (customer tanpa login, dibagikan lewat
 * WhatsApp), client di sini sengaja TIDAK menyentuh cookies sama sekali,
 * supaya `revalidate` di pemanggilnya sungguhan berlaku.
 *
 * KONSEKUENSI PERILAKU (disengaja, bukan efek samping tersembunyi): kalau
 * staf cabang/admin yang SEDANG LOGIN membuka link ini, sebelumnya mereka
 * lewat RLS `sp_partner_read`/`ph_partner_read` (digerbangi
 * `fn_catalog_enabled()` milik partner mereka — katalog tertutup = 0 baris,
 * padahal pelanggan anonim di link yang SAMA tetap melihatnya). Client ini
 * membuatnya SELALU lewat `sp_anon_read`/`ph_anon_read` — sama seperti
 * pelanggan anonim, terlepas dari status login pembukanya. Ini justru
 * MENYAMAKAN perilaku dengan niat yang ditulis di kepala migration 0022:
 * halaman ini "tanpa gerbang katalog partner apa pun".
 *
 * JANGAN dipakai untuk apa pun yang butuh identitas pengguna (RLS yang
 * bergantung `auth.uid()` bukan `is null`) — di luar itu selalu `anon`.
 */
export function createPublicClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
