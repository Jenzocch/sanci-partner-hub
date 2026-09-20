import Link from "next/link";
import { getCabangMessages } from "@/lib/i18n";
import { formatIDR } from "@/lib/orders-shared";
import { listSavedProposals } from "../actions-saved";

/**
 * Daftar penawaran TERSIMPAN milik cabang ini (migration 0029).
 *
 * Yang dijawab halaman ini adalah pertanyaan yang dulu tidak punya jawaban
 * sama sekali: "pelanggan menelepon menyebut harga di kertas yang kemarin —
 * kertas yang mana?". Setiap baris bisa dibuka lagi dan dicetak ulang PERSIS
 * seperti saat dikirim, karena isinya salinan beku (0029: `lines`/`products`
 * jsonb, bukan foreign key ke katalog).
 *
 * Batasnya RLS, bukan halaman ini: `listSavedProposals` tidak menyaring
 * apa pun di kode — penawaran cabang lain memang tidak pernah pulang
 * (LESSONS #5).
 */
export const dynamic = "force-dynamic";

export default async function ProposalTersimpanPage() {
  const m = await getCabangMessages();
  const res = await listSavedProposals();

  return (
    <main className="pwrap">
      <div className="worktop">
        <h1>{m.cabang.proposalSavedTitle}</h1>
        <Link href="/cabang/kalkulator" className="btn sm">
          {m.common.proposalBackCta}
        </Link>
      </div>

      {"error" in res ? (
        <div className="card" style={{ margin: 0 }}>
          <div className="err">{res.error.message}</div>
          <Link href="/cabang/proposal/tersimpan" className="btn sm">
            {m.common.retry}
          </Link>
        </div>
      ) : res.data.length === 0 ? (
        <div className="card emptybox">{m.cabang.proposalSavedEmpty}</div>
      ) : (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>{m.cabang.proposalSavedColNumber}</th>
                <th>{m.cabang.proposalSavedColCustomer}</th>
                <th className="ta-right">{m.cabang.proposalSavedColTotal}</th>
                <th>{m.cabang.proposalSavedColValid}</th>
                <th>{m.cabang.proposalSavedColSaved}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {res.data.map((p) => {
                // Kedaluwarsa DIKATAKAN, tapi TIDAK memblokir cetak ulang:
                // arsipnya tetap arsip, dan staf mungkin justru butuh
                // mencetaknya untuk menjelaskan harga yang sudah lewat.
                const expired = !!p.validUntil && p.validUntil < new Date().toISOString().slice(0, 10);
                return (
                  <tr key={p.id}>
                    <td>
                      <span className="code">{p.number}</span> <span className="muted small">v{p.version}</span>
                    </td>
                    <td style={{ overflowWrap: "anywhere" }}>{p.customerName || "—"}</td>
                    <td className="ta-right num">{formatIDR(p.finalAmount)}</td>
                    <td>
                      {p.validUntil ?? "—"}
                      {expired && <span className="chip WARN"> {m.cabang.proposalSavedExpired}</span>}
                    </td>
                    <td className="small muted">{p.createdAt.slice(0, 10)}</td>
                    <td className="ta-right">
                      <Link href={`/cabang/proposal?saved=${encodeURIComponent(p.id)}`} className="btn sm">
                        {m.cabang.proposalSavedOpenCta}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
