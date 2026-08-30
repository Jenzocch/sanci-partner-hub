import ProposalDocument from "@/lib/proposal-document";
import { loadProposalProductsAdmin } from "./actions";

/**
 * Proposal sisi ADMIN — komponen dokumen yang SAMA dengan sisi cabang
 * (lib/proposal-document.tsx), cuma dengan pemuat produk dan tujuan tombol
 * kembali miliknya sendiri.
 *
 * Tanpa gerbang tambahan di sini: seluruh /admin/** memang bersandar pada
 * RLS admin seperti halaman admin lainnya (pola sama dengan admin/produk).
 */
export const dynamic = "force-dynamic";

export default async function AdminProposalPage() {
  return <ProposalDocument loadProducts={loadProposalProductsAdmin} backHref="/admin/kalkulator" />;
}
