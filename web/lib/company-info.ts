/**
 * Static company/bank config for printed sales documents (SO/DO/Invoice,
 * migration 0016) — NOT user-editable from any screen (see FEATURES.md "本
 * 切片刻意不做": editing the static bank block from UI is explicitly out of
 * scope). Edit the values HERE, in code, when the bank account or company
 * name changes — there is deliberately no admin UI for it.
 *
 * Values transcribed VERBATIM from the owner's real document templates
 * (source of truth, not invented): `INVOICE_format.xlsx` cells C32/C33/C34/
 * C35 (Bank/Account Number/City/Beneficiary's Name) and
 * `Sales_order_format.xlsx` cell D32 ("KCP Jakarta Selatan" — the SO
 * template's more specific branch-office form of the city field, used here
 * in preference to the Invoice template's plain "Jakarta Selatan" since it
 * carries strictly more information and the two are not in conflict).
 */

export const COMPANY_INFO = {
  /** Beneficiary's Name — Invoice template cell C35. */
  legalName: "PT WAHANA ERA INOVASI",
  /**
   * Kop surat (letterhead) kiri-atas SO/DO/Invoice — permintaan owner
   * 2026-08-27, dipadatkan hari yang sama (owner: "地址太浪費空間, 字體縮小,
   * 能夠少行數 就少行數"). Isinya sama persis dengan kop template asli di
   * workbook "Form SO INV dan DO-SANCI" (tab Sales Order (SO) - Updated) —
   * hanya PEMBUNGKUSAN BARISNYA yang dipadatkan (3 baris alamat + 2 baris
   * kontak → 2 + 1), teksnya sendiri tidak dipotong satu kata pun.
   * `phone` boleh dikosongkan (kop template asli tidak mencantumkannya) —
   * baris kontak otomatis menyusut ke email+website saja kalau kosong.
   */
  letterhead: {
    brand: "SANCI",
    name: "PT. WAHANA ERA INOVASI",
    addressLines: [
      "Jl. Minangkabau Barat No. 8-8A, RT 01/RW 01, Kel. Pasar Manggis,",
      "Kec. Setiabudi, Jakarta Selatan, DKI Jakarta 12970",
    ],
    phone: "0851-3318-5168",
    email: "wahana.elite@gmail.com",
    website: "www.sanci.co.id",
  },
  bank: {
    /** Bank — Invoice template cell C32. */
    name: "BCA",
    /** Account Number — Invoice template cell C33 / SO template cell D30. */
    accountNumber: "542-5816168",
    /** City — SO template cell D32 (branch-office form, more specific than
     * the Invoice template's plain "Jakarta Selatan"). */
    city: "KCP Jakarta Selatan",
  },
} as const;
