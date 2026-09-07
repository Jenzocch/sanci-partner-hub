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

  // Identitas toko untuk blok "Toko" di sampul (owner 2026-09-07: sampul
  // tetap SANCI, ditambah kontak toko partner). Dibaca lewat sesi cabang
  // sendiri — RLS partner_users/partners/partner_branches yang membatasi
  // barisnya (LESSONS #5), bukan parameter dari client.
  const { data: pu, error } = await supabase
    .from("partner_users")
    .select("id, branch_id, partners:partner_id(name, logo_url, contact_phone)")
    .maybeSingle();
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

  const partner = pu.partners as unknown as {
    name: string;
    logo_url: string | null;
    contact_phone: string | null;
  } | null;
  // Cabang: nama + telepon kontak. Gagal baca = blok toko cukup memakai nama
  // partner (ini hiasan sampul, bukan data transaksi — tidak perlu
  // menggagalkan seluruh halaman), tapi galatnya tetap tercatat.
  const { data: branch, error: branchError } = await supabase
    .from("partner_branches")
    .select("name, contact_phone")
    .eq("id", pu.branch_id)
    .maybeSingle();
  if (branchError) console.error("[proposal] partner_branches:", branchError.code, branchError.message);

  const phone = (branch?.contact_phone || partner?.contact_phone || "").trim();
  const store = partner
    ? {
        name: partner.name,
        branchName: branch?.name ?? null,
        phone: phone || null,
        // Tanpa logo → hanya nama teks (keputusan owner 2026-09-07).
        logoUrl: partner.logo_url || null,
      }
    : null;

  return (
    <ProposalEditorialLayout
      loadProducts={loadProposalProducts}
      backHref="/cabang/kalkulator"
      store={store}
    />
  );
}