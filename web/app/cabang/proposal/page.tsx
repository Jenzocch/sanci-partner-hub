import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCabangMessages } from "@/lib/i18n";
import ProposalClient from "./proposal-client";

/**
 * Halaman Proposal — dokumen cetak untuk pelanggan (halaman 1 ringkasan
 * pilihan + harga, halaman berikutnya profil tiap produk).
 *
 * Halaman ini MEMANG menampilkan harga, dan justru karena itu ia hidup di
 * bawah /cabang yang wajib login staf toko. Aturan "katalog publik tidak
 * pernah menampilkan harga" berlaku untuk rute publik /p/[productId] dan
 * TIDAK berubah sedikit pun oleh slice ini — tidak ada rute bertoken atau
 * tautan publik apa pun yang dibuat di sini. Staf mencetak/menyimpan PDF-nya
 * lalu mengirim berkasnya sendiri.
 *
 * Gerbang di server ini sengaja MINIMAL (cuma "akun toko ada?"): isi
 * dokumennya dirakit di client dari keranjang Kalkulator di localStorage,
 * dan detail produknya diambil lewat Server Action yang menjalankan gerbang
 * katalog lengkap (sanci_catalog_access) di sisinya sendiri. Menaruh
 * gerbang katalog di sini juga berarti staf yang katalognya belum dibuka
 * mendapat 2 pesan berbeda untuk 1 sebab.
 */
export const dynamic = "force-dynamic";

export default async function ProposalPage() {
  const m = await getCabangMessages();
  const supabase = await createClient();

  // Pola sama dengan halaman cabang lain: tanpa auth.getUser() terpisah (RLS
  // adalah batasnya, LESSONS #5); error DB ≠ hasil kosong (LESSONS #10).
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

  return <ProposalClient />;
}
