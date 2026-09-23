import type { createClient } from "@/lib/supabase/server";

/**
 * Boleh tidaknya kolom "Invoice SANCI" tampil di laporan cabang.
 *
 * Kepala dokumen Invoice terbaca cabang sejak 0035 (od_partner_read), tapi
 * NILAINYA adalah Harga Akhir SANCI (order_sanci_offers, 0015) yang
 * digerbang can_view_offer (0014). Partner tanpa izin itu akan mendapat Rp 0
 * dari fn_sales_report — angka yang TERLIHAT seperti "belum ada Invoice"
 * padahal sebenarnya "tidak boleh dilihat" (LESSONS #10). Jadi kolomnya
 * disembunyikan untuk mereka, dan gagal membaca izin = sembunyikan juga
 * (tertutup kalau ragu).
 */
export async function canViewInvoiceAmount(supabase: Awaited<ReturnType<typeof createClient>>): Promise<boolean> {
  const { data: pu, error: puError } = await supabase.from("partner_users").select("partner_id").maybeSingle();
  if (puError || !pu?.partner_id) return false;
  const { data, error } = await supabase
    .from("partner_access_policies")
    .select("can_view_offer")
    .eq("partner_id", pu.partner_id)
    .maybeSingle();
  if (error) return false;
  return (data as { can_view_offer?: boolean } | null)?.can_view_offer === true;
}
