import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCabangMessages } from "@/lib/i18n";
import ProposalEditorialLayout from "@/lib/proposal-editorial-layout";
import { loadProposalProducts } from "./actions";

/**
 * Proposal sisi CABANG — dokumen cetak untuk pelanggan.
 * Urutan customer-facing ditetapkan owner:
 * sampul -> pilihan produk + jumlah/harga -> editorial product stories.
 *
 * Halaman ini MEMANG menampilkan harga, dan justru karena itu ia hidup di
 * bawah /cabang yang wajib login staf toko. Aturan katalog publik tetap tidak
 * menampilkan harga. Proposal dirakit dari hand-off Kalkulator dan profil
 * produk yang dibaca lewat Server Action dengan gerbang katalog/RLS yang sama.
 */
export const dynamic = "force-dynamic";

export default async function ProposalPage() {
  const m = await getCabangMessages();
  const supabase = await createClient();

  const { data: pu, error } = await supabase.from("partner_users").select("id").maybeSingle();
  if (error) {
    return (
      <main className="pwrap">
        <div className="card">
          <div className="err">{m.cabang.errAccountLoad}</div>
        </div>
      </main>
    );
  }
  if (!pu) redirect("/");

  return <ProposalEditorialLayout loadProducts={loadProposalProducts} backHref="/cabang/kalkulator" />;
}