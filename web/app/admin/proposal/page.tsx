import ProposalSoftGalleryLayout from "@/lib/proposal-soft-gallery-layout";
import proposalStyles from "@/lib/proposal-editorial-document.module.css";
import { COMPANY_INFO } from "@/lib/company-info";
import { loadProposalProductsAdmin } from "./actions";

/**
 * Proposal sisi ADMIN — renderer yang SAMA dengan cabang, hanya pemuat
 * produk dan tujuan tombol kembali yang berbeda. Urutan customer-facing:
 * sampul -> pilihan produk + jumlah/harga -> editorial product stories.
 */
export const dynamic = "force-dynamic";

export default async function AdminProposalPage() {
  const sanciAddress = COMPANY_INFO.letterhead.addressLines.join(" ");
  const addressCss = JSON.stringify(sanciAddress);

  return (
    <>
      {/* Owner 2026-09-07: SANCI contact + alamat must be visible on Proposal cover.
          The base cover-simplification CSS hides meta rows after the date;
          restore those rows and append the canonical letterhead address below Showroom. */}
      <style>{`
        .${proposalStyles.coverMetaGrid}>div:not(:first-child){display:block;}
        .${proposalStyles.coverMetaGrid}>div:nth-child(2) .${proposalStyles.metaValue}::after{
          content:${addressCss};
          display:block;
          margin-top:4px;
          color:var(--warm);
          font-size:9.5px;
          line-height:1.45;
          white-space:normal;
        }
      `}</style>
      <ProposalSoftGalleryLayout loadProducts={loadProposalProductsAdmin} backHref="/admin/kalkulator" />
    </>
  );
}
