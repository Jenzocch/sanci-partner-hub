import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAdminMessages } from "@/lib/i18n";
import NewAdminOrderForm from "./new-order-form";

export const dynamic = "force-dynamic";

/**
 * Buat Pesanan atas nama partner/cabang (fitur 2026-08-22) — halaman server
 * hanya memuat daftar Partner ACTIVE; cabang/package/staf dimuat client saat
 * pilihan berubah (lewat Server Action di actions-create-order.ts, dengan
 * status error + tombol coba lagi sendiri — LESSONS #10). Gerbang admin ada
 * di layout /admin (redirect non-admin) + verifikasi ulang di setiap Server
 * Action + RLS admin_all sebagai penegak sesungguhnya (LESSONS #5).
 */
export default async function AdminOrderBaruPage() {
  const m = await getAdminMessages();
  const supabase = await createClient();

  const { data: partnerRows, error } = await supabase
    .from("partners")
    .select("id, name")
    .eq("status", "ACTIVE")
    .order("name");

  if (error) {
    return (
      <div>
        <div className="crumb">
          <Link href="/admin/orders">{m.admin.navOrders}</Link> / {m.admin.orderCreateTitle}
        </div>
        <div className="card" style={{ margin: 0 }}>
          <div className="err">{m.common.errorLoad}</div>
        </div>
      </div>
    );
  }

  const partners = (partnerRows ?? []).map((p) => ({ id: p.id, name: p.name }));

  return (
    <div>
      <div className="crumb">
        <Link href="/admin/orders">{m.admin.navOrders}</Link> / {m.admin.orderCreateTitle}
      </div>
      <div className="pagehead">
        <h1>{m.admin.orderCreateTitle}</h1>
      </div>
      <p className="footnote" style={{ marginTop: 0, marginBottom: 16 }}>
        {m.admin.orderCreateIntro}
      </p>
      <NewAdminOrderForm partners={partners} />
    </div>
  );
}
