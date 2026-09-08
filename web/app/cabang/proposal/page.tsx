import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCabangMessages } from "@/lib/i18n";
import ProposalSoftGalleryLayout from "@/lib/proposal-soft-gallery-layout";
import proposalStyles from "@/lib/proposal-editorial-document.module.css";
import { COMPANY_INFO } from "@/lib/company-info";
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

  // Cabang: nama + alamat + telepon kontak. Gagal baca = blok toko cukup
  // memakai nama partner; kegagalan data dekoratif ini tidak menggagalkan
  // seluruh Proposal, tetapi tetap dicatat.
  const { data: branch, error: branchError } = await supabase
    .from("partner_branches")
    .select("name, address, contact_phone")
    .eq("id", pu.branch_id)
    .maybeSingle();
  if (branchError) console.error("[proposal] partner_branches:", branchError.code, branchError.message);

  const phone = (branch?.contact_phone || partner?.contact_phone || "").trim();
  // Address berasal dari textarea dan boleh multiline. CSS `content:` tidak
  // memahami escape JSON `\n` sebagai newline; tanpa normalisasi ia tercetak
  // sebagai huruf "n"/"rn" di Proposal. Lipat whitespace menjadi satu spasi
  // sebelum masuk ke CSS supaya dokumen pelanggan selalu terbaca benar.
  const branchAddress = (branch?.address || "").trim().replace(/\s+/g, " ");
  const store = partner
    ? {
        name: partner.name,
        branchName: branch?.name ?? null,
        phone: phone || null,
        // Tanpa logo → hanya nama teks (keputusan owner 2026-09-07).
        logoUrl: partner.logo_url || null,
      }
    : null;

  const sanciAddress = COMPANY_INFO.letterhead.addressLines.join(" ");
  const sanciAddressCss = JSON.stringify(sanciAddress);
  const branchAddressCss = JSON.stringify(branchAddress);

  return (
    <>
      {/* Owner 2026-09-07: keep SANCI contact/address visible even when a
          partner store block is present. Branch address appears only when
          partner_branches.address contains a value. */}
      <style>{`
        .${proposalStyles.coverMetaGrid}>div:not(:first-child){display:block;}
        .${proposalStyles.coverMetaGrid}>div:nth-child(2) .${proposalStyles.metaValue}::after{
          content:${sanciAddressCss};
          display:block;
          margin-top:4px;
          color:var(--warm);
          font-size:9.5px;
          line-height:1.45;
          white-space:normal;
        }
        ${branchAddress ? `
        .${proposalStyles.coverStoreName}::after{
          content:${branchAddressCss};
          display:block;
          margin-top:5px;
          color:var(--warm);
          font-family:var(--sans);
          font-size:9.5px;
          font-weight:400;
          line-height:1.45;
          white-space:normal;
        }` : ""}
      `}</style>
      <ProposalSoftGalleryLayout
        loadProducts={loadProposalProducts}
        backHref="/cabang/kalkulator"
        store={store}
      />
    </>
  );
}
