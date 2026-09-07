import ProposalEditorialLayout from "@/lib/proposal-editorial-layout";
import proposalStyles from "@/lib/proposal-editorial-document.module.css";
import { loadProposalProductsAdmin } from "./actions";

/**
 * Proposal sisi ADMIN — renderer yang SAMA dengan cabang, hanya pemuat
 * produk dan tujuan tombol kembali yang berbeda. Urutan customer-facing:
 * sampul -> pilihan produk + jumlah/harga -> editorial product stories.
 */
export const dynamic = "force-dynamic";

export default async function AdminProposalPage() {
  return (
    <>
      {/* Owner 2026-09-07: SANCI contact must be visible on Proposal cover.
          The base cover-simplification CSS hides meta rows after the date;
          restore only those existing rows here without touching renderer data. */}
      <style>{`.${proposalStyles.coverMetaGrid}>div:not(:first-child){display:block;}`}</style>
      <ProposalEditorialLayout loadProducts={loadProposalProductsAdmin} backHref="/admin/kalkulator" />
    </>
  );
}