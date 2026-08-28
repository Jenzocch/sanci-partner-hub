import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import ProdukPublikClient from "./produk-publik-client";
import styles from "./produk-publik.module.css";

export const dynamic = "force-dynamic";

/**
 * Halaman PUBLIK satu produk (migration 0022) — root-level route (BUKAN di
 * bawah app/cabang atau app/admin layout manapun, jadi tidak ikut gerbang
 * login/gate katalog partner apa pun), untuk staf toko membagikan link ke
 * pelanggan lewat WhatsApp. Dibaca lewat RLS BARU `sp_anon_read`/
 * `ph_anon_read` (migration 0022 §3–4) yang HANYA mengizinkan produk
 * berstatus ACTIVE — dan bahkan untuk baris yang lolos itu, kolom yang
 * benar-benar dikirim ke browser dipilih EKSPLISIT di bawah (bukan
 * `select *`): TIDAK PERNAH stock_status, client_request_id, created_by,
 * created_at/updated_at, ATAU APA PUN dari product_prices/partner_orders —
 * berkas ini SENGAJA TIDAK mengimpor lib/price-query.ts sama sekali.
 *
 * BAHASA: hardcoded Bahasa Indonesia di seluruh halaman (TIDAK lewat
 * Messages/i18n) — pola yang sama dengan halaman cetak dokumen (lihat
 * app/admin/orders/[orderId]/documents/[documentId]/print/page.tsx):
 * pengunjungnya adalah pelanggan akhir, bukan staf yang memilih bahasa
 * aplikasi.
 *
 * TIGA KEADAAN JUJUR (LESSONS #10 — error DB ≠ "produk tidak ada"):
 *   - produk tidak ditemukan ATAU berstatus INACTIVE → "Produk tidak
 *     tersedia" (BUKAN error database, kalimat ramah pelanggan).
 *   - query gagal (jaringan/DB) → pesan error jujur, BEDA kalimatnya dari
 *     "tidak tersedia" — jangan menyamarkan kegagalan server sebagai
 *     kesimpulan "produk ini memang tidak ada".
 *   - berhasil → tampil normal.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ productId: string }>;
}): Promise<Metadata> {
  const { productId } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("sanci_products").select("name").eq("id", productId).maybeSingle();
  const name = (data as { name: string } | null)?.name;
  return { title: name ? `${name} — SANCI` : "Produk — SANCI" };
}

type PublicProductRow = {
  id: string;
  name: string;
  code: string | null;
  category: string | null;
  description: string | null;
  photo_url: string | null;
};

export default async function ProdukPublikPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  const supabase = await createClient();

  // Kolom dipilih EKSPLISIT (lihat catatan kepala berkas) — TIDAK pernah
  // stock_status/harga/kolom internal apa pun.
  const { data, error } = await supabase
    .from("sanci_products")
    .select("id, name, code, category, description, photo_url")
    .eq("id", productId)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (error) {
    return (
      <main className={styles.wrap}>
        <BrandHeader />
        <div className="card">
          <div className="err">Produk gagal dimuat. Coba muat ulang halaman ini.</div>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className={styles.wrap}>
        <BrandHeader />
        <div className="card">
          <div className="banner info">Produk tidak tersedia.</div>
        </div>
      </main>
    );
  }

  const product = data as PublicProductRow;

  // Galeri: kegagalan query di sini adalah DEGRADASI KOSMETIK (foto sampul +
  // info produk tetap tampil dari query di atas) — bukan kegagalan halaman.
  const { data: photosData } = await supabase
    .from("product_photos")
    .select("photo_url")
    .eq("product_id", productId)
    .order("sort_order")
    .order("created_at")
    .order("id");
  const galleryUrls = ((photosData ?? []) as { photo_url: string }[]).map((p) => p.photo_url);
  const photos = [product.photo_url, ...galleryUrls].filter((u): u is string => !!u);

  return (
    <main className={styles.wrap}>
      <BrandHeader />

      <ProdukPublikClient name={product.name} photos={photos} />

      <h1 style={{ fontSize: "var(--fs-hero)", lineHeight: "var(--lh-tight)" }}>{product.name}</h1>
      <div className="row" style={{ marginTop: 8, marginBottom: 4 }}>
        {product.code && <span className="code">{product.code}</span>}
      </div>
      {product.category && <div className="muted small">{product.category}</div>}

      {product.description && (
        <p className="sub" style={{ whiteSpace: "pre-line", marginTop: 16 }}>
          {product.description}
        </p>
      )}
    </main>
  );
}

function BrandHeader() {
  return (
    <div className={styles.brandrow}>
      {/* eslint-disable-next-line @next/next/no-img-element -- aset statis /public, sama seperti kop cetak dokumen */}
      <img className={styles.brandlogo} src="/brand/sanci-logo.png" alt="SANCI" />
    </div>
  );
}
