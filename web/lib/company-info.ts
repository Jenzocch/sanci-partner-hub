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
   * 2026-08-27. Disalin VERBATIM dari kop template asli di workbook
   * "Form SO INV dan DO-SANCI" (tab Sales Order (SO) - Updated):
   * baris alamat, email, dan website persis seperti di kertas lama.
   * `phone` masih kosong karena kop template asli TIDAK mencantumkan
   * nomor telepon — isi di sini (satu tempat) begitu owner memberikan
   * nomornya; baris telepon otomatis ikut tercetak begitu terisi.
   */
  letterhead: {
    brand: "SANCI",
    name: "PT. WAHANA ERA INOVASI",
    addressLines: [
      "Jalan Minangkabau Barat No. 8-8A, RT 01/RW 01,",
      "Kelurahan Pasar Manggis, Kecamatan Setiabudi,",
      "Jakarta Selatan, DKI Jakarta 12970 - Indonesia",
    ],
    phone: "",
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
