import ProposalEditorialDocument from "@/lib/proposal-editorial-document";
import { loadProposalProductsAdmin } from "./actions";

/**
 * Proposal sisi ADMIN — renderer yang SAMA dengan cabang, hanya pemuat
 * produk dan tujuan tombol kembali yang berbeda. Urutan customer-facing:
 * sampul -> pilihan produk + jumlah/harga -> editorial product stories.
 */
export const dynamic = "force-dynamic";

export default async function AdminProposalPage() {
  return <ProposalEditorialDocument loadProducts={loadProposalProductsAdmin} backHref="/admin/kalkulator" />;
}
