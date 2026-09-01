"use client";

/**
 * "Buat Proposal" di halaman PESANAN — membawa daftar produk pesanan ini
 * kembali ke Kalkulator, lalu staf melanjutkan seperti biasa.
 *
 * KENAPA lewat Kalkulator dan bukan langsung ke Proposal: pesanan tidak
 * menyimpan harga jual ke pelanggan. Ketiga angka uang yang ada di sana
 * bukan itu — Penawaran SANCI adalah harga SANCI kepada toko (mencetaknya
 * berarti memperlihatkan modal toko kepada pelanggannya sendiri),
 * order_items.unit_price adalah "nilai referensi per baris" (0014) yang
 * digerbangi izin penawaran, dan partner_purchase_amount adalah angka yang
 * dilaporkan cabang dan oleh 0009 disebut eksplisit tidak boleh dipercaya
 * mentah-mentah. Jadi yang dibawa cuma produk dan jumlahnya; harganya
 * diketik staf yang memang tahu berapa ia menjualnya.
 *
 * Baris pesanan yang tidak terhubung ke produk katalog (product_id null —
 * baris ketikan bebas) tidak bisa ikut: Proposal butuh id itu untuk mengambil
 * foto dan deskripsi. Jumlahnya dihitung dan DIKATAKAN di Kalkulator, tidak
 * pernah hilang diam-diam (LESSONS #10).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CalcArea } from "@/lib/calculator-shared";
import { writeCalcPrefill } from "@/lib/calc-prefill";

export type OrderProposalItem = {
  product_id: string | null;
  name_snapshot: string;
  code_snapshot: string | null;
  quantity: number;
  /** Lihat catatan identitas baris di lib/calculator-shared.ts (CalcLine). */
  color_code: string | null;
};

export default function OrderProposalButton({
  items,
  customerName,
  area,
  href,
  cta,
  saveFailed,
  noProducts,
}: {
  items: OrderProposalItem[];
  customerName: string;
  area: CalcArea;
  /** Kalkulator area pemasang. */
  href: string;
  cta: string;
  saveFailed: string;
  /** Ditampilkan kalau TIDAK SATU pun baris terhubung ke produk katalog. */
  noProducts: string;
}) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);

  const usable = items.filter((i) => i.product_id);
  const skipped = items.length - usable.length;

  function go() {
    if (usable.length === 0) {
      setErr(noProducts);
      return;
    }
    const ok = writeCalcPrefill(area, {
      customerName,
      skipped,
      lines: usable.map((i) => ({
        productId: i.product_id as string,
        name: i.name_snapshot,
        code: i.code_snapshot,
        qty: i.quantity,
        colorCode: i.color_code,
      })),
    });
    if (!ok) {
      setErr(saveFailed);
      return;
    }
    setErr(null);
    router.push(href);
  }

  return (
    <>
      {err && (
        <div className="banner bad" style={{ marginTop: 12 }}>
          {err}
        </div>
      )}
      <div className="btnrow" style={{ marginTop: 12 }}>
        <button type="button" className="btn" onClick={go}>
          {cta}
        </button>
      </div>
    </>
  );
}
