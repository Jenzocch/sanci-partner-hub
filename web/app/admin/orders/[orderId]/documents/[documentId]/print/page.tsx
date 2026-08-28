import { Fragment } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatIDR, displayPhoneID, formatCalendarDate } from "@/lib/orders-shared";
import { COMPANY_INFO } from "@/lib/company-info";
import PrintButton from "./print-button";

export const dynamic = "force-dynamic";

/**
 * Halaman cetak dokumen pesanan (SO/DO/Invoice, migrasi 0016).
 *
 * BAHASA: seluruh label di halaman ini HARDCODED Bahasa Indonesia, TIDAK
 * lewat `Messages`/i18n — ini disengaja, bukan kelalaian. Ketiga dokumen
 * adalah kertas resmi yang DITANDATANGANI pelanggan (SO/DO) atau ditagihkan
 * (Invoice); bahasa di kertas yang ditandatangani pelanggan tidak boleh
 * ikut berubah kalau admin yang mencetaknya kebetulan sedang memakai
 * antarmuka Inggris/Mandarin — pelanggan yang tanda tangan membaca Bahasa
 * Indonesia, bukan preferensi bahasa layar admin. Penjelasan penuh ada di
 * `web/lib/i18n/GLOSSARY.md` §"列印文件本身不跑 i18n". Chrome APLIKASI di
 * sekitar halaman ini (sidebar admin, nav) tetap ikut bahasa yang dipilih —
 * hanya ISI DOKUMEN yang dibekukan ke Bahasa Indonesia.
 *
 * "Dibekukan" BUKAN berarti "bebas mengarang kata": teksnya ditulis di sini,
 * tapi ISTILAHNYA tetap istilah yang sama dengan layar aplikasi versi Bahasa
 * Indonesia (`lib/i18n/messages/common.ts` + GLOSSARY.md) — Subtotal, Diskon,
 * Harga Akhir, Harga Satuan, Uang Muka (DP), Potongan Tunai, Sisa Bayar.
 * Pegawai membaca angka yang sama di HP-nya lalu menyerahkan kertas ini ke
 * pelanggan; kalau kertasnya memakai nama lain untuk angka yang sama
 * ("Harga Akhir" di layar vs "Total Setelah Disc" di kertas), yang bingung
 * adalah orang di depan meja. Kalau nama sebuah angka berubah di common.ts,
 * ubah juga di sini.
 *
 * AUTH: server component ini TIDAK menambah pemeriksaan admin sendiri —
 * route ini bersarang di bawah `app/admin/layout.tsx`, yang SUDAH menolak
 * pengguna bukan-admin (redirect ke "/") sebelum halaman ini pernah
 * dirender, pola yang sama persis dengan semua halaman `/admin/**` lain.
 *
 * LAYOUT: MENIRU STRUKTUR template Excel asli owner (Sales_order_format /
 * DO_format / INVOICE_format.xlsx) — blok header, tabel item, total,
 * transfer bank, tanda tangan — BUKAN kloning piksel. Nilai uang lewat
 * `formatIDR`; tanggal lewat `toLocaleDateString("id-ID", …)` (dokumen
 * Indonesia, locale tetap id-ID di sini terlepas dari `m.common.dateLocale`
 * chrome aplikasi — alasan sama dengan catatan bahasa di atas).
 */

type DocType = "SO" | "DO" | "INVOICE";

type One<T> = T | T[] | null;
function one<T>(v: One<T>): T | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

function formatDateID(iso: string): string {
  // doc_date adalah kolom `date` (bukan timestamptz): dirender lewat helper
  // bersama yang menjangkarkannya ke UTC di kedua sisi, jadi tanggalnya tidak
  // pernah bergeser sehari oleh zona server maupun pembaca. Locale-nya tetap
  // "id-ID" DIPAKU di sini (bukan m.common.dateLocale) — alasan sama dengan
  // catatan bahasa di kepala berkas: isi dokumen yang ditandatangani
  // pelanggan tidak ikut bahasa layar admin.
  return formatCalendarDate(iso, "id-ID");
}

type OrderItemDetail = {
  name_snapshot: string;
  code_snapshot: string | null;
  custom_size: string | null;
  note: string | null;
  color_code: string | null;
  unit_price: number | null;
  line_discount: number | null;
  /** Untuk kolom Foto di cetak SO (owner 2026-08-27) — null pada baris
   *  manual tanpa produk katalog. */
  product_id: string | null;
};

type DocLine = { quantity: number; order_items: One<OrderItemDetail> };

type OfferInfo = {
  amount: number;
  dpAmount: number;
  paymentCondition: string | null;
  discountPcts: number[];
  markupPct: number | null;
  cashDiscount: number;
  finalAmount: number;
} | null;

export default async function DocumentPrintPage({
  params,
}: {
  params: Promise<{ orderId: string; documentId: string }>;
}) {
  const { orderId, documentId } = await params;
  const supabase = await createClient();

  // Ketiga pembacaan di bawah hanya butuh orderId/documentId dari param rute
  // — tidak ada yang bergantung hasil satu sama lain, jadi diambil dalam SATU
  // gelombang (audit kecepatan 2026-08-22, temuan #7). Pembacaan yang memang
  // butuh hasilnya (nama sales, penawaran) menyusul di gelombang kedua di
  // bawah.
  const [
    { data: doc, error: docErr },
    { data: orderData, error: orderErr },
    { data: linesData },
  ] = await Promise.all([
    supabase
      .from("order_documents")
      .select("id, doc_type, doc_number, doc_date, notes")
      .eq("id", documentId)
      .eq("order_id", orderId)
      .maybeSingle(),
    supabase
      .from("partner_orders")
      .select(
        "order_number, notes, shipping_address, created_at, partner_sales_staff_id, " +
          "customers:customer_id(full_name, phone_normalized, whatsapp, address, city, province)"
      )
      .eq("id", orderId)
      .maybeSingle(),
    supabase
      .from("order_document_items")
      .select(
        "quantity, order_items:order_item_id(name_snapshot, code_snapshot, custom_size, note, color_code, unit_price, line_discount, product_id)"
      )
      .eq("document_id", documentId),
  ]);
  if (docErr || !doc) notFound();

  const docType = doc.doc_type as DocType;

  if (orderErr || !orderData) notFound();

  const order = orderData as unknown as {
    order_number: string;
    notes: string | null;
    shipping_address: string | null;
    created_at: string;
    partner_sales_staff_id: string | null;
    customers: One<{
      full_name: string;
      phone_normalized: string;
      whatsapp: string | null;
      address: string | null;
      city: string | null;
      province: string | null;
    }>;
  };
  const customer = one(order.customers);
  const lines = (linesData ?? []) as unknown as DocLine[];

  // Gelombang kedua — dua pembacaan yang bergantung hasil gelombang pertama
  // (id sales dari order, jenis dokumen dari doc), tapi tidak saling
  // bergantung, jadi dijalankan berbarengan:
  //   - nama sales, hanya kalau order memang menunjuk sales;
  //   - Penawaran SANCI (0013/0015) — dipakai SO (subtotal/diskon/DP) dan
  //     INVOICE (harga/DP/sisa), TIDAK dipakai DO (surat jalan tidak membawa
  //     nominal uang). Query TERPISAH, bukan embed (LESSONS #12): tabelnya
  //     bisa saja belum ada / kosong, dan itu tidak boleh menggagalkan
  //     halaman cetak (mis. DO tetap harus tercetak walau tidak pernah butuh
  //     angka ini).
  //   - customer_po (0020) — HANYA Invoice yang memakainya (baris "Purchase
  //     Order"). Dibaca TERPISAH dari SELECT lebar gelombang pertama dengan
  //     SENGAJA (LESSONS #12): kolomnya lahir di migrasi 0020 — kalau kode
  //     ini naik sebelum migrasi dijalankan, 42703 pada SELECT lebar akan
  //     membuat SELURUH halaman cetak jatuh ke notFound(); dengan pembacaan
  //     terpisah yang toleran, dokumen tetap tercetak dan baris Purchase
  //     Order jatuh kembali ke nomor pesanan sistem (perilaku lama, fallback
  //     jujur — tidak pernah baris kosong).
  //   - foto produk (owner 2026-08-27) — HANYA cetak SO yang memakainya
  //     (kolom Foto, meniru template Excel; Invoice/DO sengaja tetap ringkas
  //     — keputusan owner). Kegagalan query foto TIDAK menggagalkan cetak:
  //     peta kosong = kolom Foto kosong.
  const soProductIds =
    docType === "SO"
      ? [...new Set(lines.map((l) => one(l.order_items)?.product_id).filter((v): v is string => !!v))]
      : [];
  const [salesRes, offerRes, customerPoRes, photoRes] = await Promise.all([
    order.partner_sales_staff_id
      ? supabase
          .from("partner_staff")
          .select("full_name")
          .eq("id", order.partner_sales_staff_id)
          .maybeSingle()
      : Promise.resolve(null),
    docType !== "DO"
      ? supabase
          .from("order_sanci_offers")
          .select("amount, dp_amount, payment_condition, discount_pcts, markup_pct, cash_discount, final_amount")
          .eq("order_id", orderId)
          .maybeSingle()
      : Promise.resolve(null),
    docType === "INVOICE"
      ? supabase.from("partner_orders").select("customer_po").eq("id", orderId).maybeSingle()
      : Promise.resolve(null),
    soProductIds.length > 0
      ? supabase.from("sanci_products").select("id, photo_url").in("id", soProductIds)
      : Promise.resolve(null),
  ]);
  const photoByProduct = new Map<string, string>();
  if (photoRes && !photoRes.error) {
    for (const row of (photoRes.data ?? []) as { id: string; photo_url: string | null }[]) {
      if (row.photo_url) photoByProduct.set(row.id, row.photo_url);
    }
  }
  const salesName: string | null = salesRes ? salesRes.data?.full_name ?? null : null;
  // error (termasuk 42703 saat 0020 belum jalan) => null => fallback nomor
  // pesanan sistem di InvoiceSheet — tidak pernah menggagalkan cetak.
  const customerPo: string | null = customerPoRes && !customerPoRes.error
    ? ((customerPoRes.data as { customer_po: string | null } | null)?.customer_po ?? null)
    : null;

  let offer: OfferInfo = null;
  const offerData = offerRes ? offerRes.data : null;
  if (offerData) {
    offer = {
      amount: Number(offerData.amount),
      dpAmount: Number(offerData.dp_amount),
      paymentCondition: offerData.payment_condition,
      discountPcts: ((offerData.discount_pcts as number[] | null) ?? []).map(Number),
      markupPct: offerData.markup_pct == null ? null : Number(offerData.markup_pct),
      cashDiscount: Number(offerData.cash_discount ?? 0),
      finalAmount: Number(offerData.final_amount ?? offerData.amount),
    };
  }

  const totalQty = lines.reduce((sum, l) => sum + l.quantity, 0);

  return (
    <div>
      <PrintButton label="Cetak / Simpan PDF" />
      <style>{PRINT_CSS}</style>
      <div className="print-sheet">
        <LetterheadBlock />
        {docType === "SO" && (
          <SOSheet
            doc={doc}
            order={order}
            customer={customer}
            salesName={salesName}
            lines={lines}
            offer={offer}
            photoByProduct={photoByProduct}
          />
        )}
        {docType === "DO" && <DOSheet doc={doc} order={order} customer={customer} lines={lines} totalQty={totalQty} />}
        {docType === "INVOICE" && (
          <InvoiceSheet doc={doc} order={order} customer={customer} lines={lines} offer={offer} customerPo={customerPo} />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Sales Order
 * ------------------------------------------------------------------ */

function SOSheet({
  doc,
  order,
  customer,
  salesName,
  lines,
  offer,
  photoByProduct,
}: {
  doc: { doc_number: string; doc_date: string; notes: string | null };
  order: { order_number: string; notes: string | null; created_at: string; shipping_address: string | null };
  customer: { full_name: string; phone_normalized: string; whatsapp: string | null } | null;
  salesName: string | null;
  /** Foto produk per product_id — hanya SO (owner 2026-08-27); baris manual
   *  atau foto gagal dimuat = sel Foto kosong, cetak tidak pernah gagal. */
  photoByProduct: Map<string, string>;
  lines: DocLine[];
  offer: OfferInfo;
}) {
  const subtotal = lines.reduce((sum, l) => {
    const it = one(l.order_items);
    const price = it?.unit_price ?? 0;
    const disc = it?.line_discount ?? 0;
    return sum + Math.max(price - disc, 0) * l.quantity;
  }, 0);
  const remaining = offer ? Math.max(offer.finalAmount - offer.dpAmount, 0) : 0;

  return (
    <>
      <h1 className="doctitle">Sales Order</h1>
      <table className="headtable">
        <tbody>
          <tr>
            <td className="hlabel">No. SO</td>
            <td className="hval">{doc.doc_number}</td>
            <td className="hlabel">Nama Customer</td>
            <td className="hval">{customer?.full_name ?? "—"}</td>
          </tr>
          <tr>
            <td className="hlabel">Tanggal SO</td>
            <td className="hval">{formatDateID(doc.doc_date)}</td>
            <td className="hlabel">Telp</td>
            <td className="hval">{customer ? displayPhoneID(customer.phone_normalized) : "—"}</td>
          </tr>
          <tr>
            <td className="hlabel">Nama Sales</td>
            <td className="hval">{salesName ?? "—"}</td>
            <td className="hlabel">Alamat Kirim Barang</td>
            <td className="hval">{order.shipping_address || "—"}</td>
          </tr>
          <tr>
            <td className="hlabel">Delivery Note</td>
            <td className="hval" colSpan={3}>
              {order.notes || "—"}
            </td>
          </tr>
          <tr>
            <td className="hlabel">Kondisi Pembayaran</td>
            <td className="hval" colSpan={3}>
              {offer?.paymentCondition || "—"}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Dua baris per barang (owner 2026-08-27: "分成兩列...上面是品名照片
          catatan規格顏色...第二段才是數量價格折扣") — baris atas keterangan
          barang (Foto/Item/Ukuran/Catatan/Warna), baris bawah SATU strip
          ringkas Qty/Harga Satuan/Potongan/Jumlah rata kanan. Alasan: dengan
          kolom Foto, 10 kolom sejajar terlalu sempit di A4 (bukti screenshot
          cetak asli owner — "(KODE)" sampai terpotong tanggung). Sepasang
          baris per barang TIDAK BOLEH terpisah halaman — rowtop/rowbottom di
          bawah punya aturan break-after/before sendiri (lihat PRINT_CSS),
          terpisah dari aturan break-inside per <tr> yang sudah ada. */}
      <table className="itemtable">
        <thead>
          <tr>
            <th>No.</th>
            <th>Item</th>
            <th>Foto</th>
            <th>Ukuran</th>
            <th>Catatan</th>
            <th>Warna</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            const it = one(l.order_items);
            const price = it?.unit_price ?? 0;
            const disc = it?.line_discount ?? 0;
            const afterDisc = Math.max(price - disc, 0) * l.quantity;
            return (
              <Fragment key={i}>
                <tr className="rowtop">
                  <td>{i + 1}</td>
                  <td>
                    {/* Nama + kode dipisah jadi dua BARIS (owner 2026-08-27:
                        "品名段落再優化" — screenshot cetak asli menunjukkan
                        "(KODE)" nempel di ujung nama lalu terpotong tanggung
                        di tengah saat wrap, kolom sempit jadi terlihat kacau).
                        Kode sekarang baris sendiri di bawah nama, konsisten
                        di ketiga dokumen (SO/DO/Invoice). */}
                    <div>{it?.name_snapshot ?? "—"}</div>
                    {it?.code_snapshot && <div className="itemcode">{it.code_snapshot}</div>}
                  </td>
                  <td className="photocell">
                    {it?.product_id && photoByProduct.get(it.product_id) ? (
                      // eslint-disable-next-line @next/next/no-img-element -- dokumen cetak statis, tanpa optimasi next/image
                      <img src={photoByProduct.get(it.product_id)} alt={it.name_snapshot} />
                    ) : null}
                  </td>
                  <td>{it?.custom_size || "—"}</td>
                  <td>{it?.note || "—"}</td>
                  <td>{it?.color_code || "—"}</td>
                </tr>
                <tr className="rowbottom">
                  <td colSpan={6}>
                    <div className="itemstrip">
                      <span>
                        <span className="lbl">Qty</span>
                        <span className="val">{l.quantity}</span>
                      </span>
                      <span>
                        <span className="lbl">Harga Satuan</span>
                        <span className="val">{formatIDR(price)}</span>
                      </span>
                      <span>
                        <span className="lbl">Potongan</span>
                        <span className="val">{formatIDR(disc)}</span>
                      </span>
                      <span>
                        <span className="lbl">Jumlah</span>
                        <span className="val strong">{formatIDR(afterDisc)}</span>
                      </span>
                    </div>
                  </td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>

      <table className="totaltable">
        <tbody>
          <tr>
            <td className="tlabel">Subtotal</td>
            <td className="tval">{formatIDR(subtotal)}</td>
          </tr>
          {offer?.discountPcts.map((p, i) => (
            <tr key={i}>
              <td className="tlabel">Diskon {i + 1}</td>
              <td className="tval">{p}%</td>
            </tr>
          ))}
          {offer?.markupPct != null && (
            <tr>
              <td className="tlabel">Markup</td>
              <td className="tval">{offer.markupPct}%</td>
            </tr>
          )}
          {offer && offer.cashDiscount > 0 && (
            <tr>
              <td className="tlabel">Potongan Tunai</td>
              <td className="tval">{formatIDR(offer.cashDiscount)}</td>
            </tr>
          )}
          {/* `final_amount` (0015) — di layar aplikasi angka ini bernama
              "Harga Akhir" (common.ts `finalAmount`), jadi kertasnya memakai
              nama yang sama. Tanpa baris penawaran, jatuh ke subtotal baris:
              tetap "harga akhir" yang ditagih, hanya belum ada diskon. */}
          <tr>
            <td className="tlabel strong">Harga Akhir</td>
            <td className="tval strong">{formatIDR(offer?.finalAmount ?? subtotal)}</td>
          </tr>
          <tr>
            <td className="tlabel">Uang Muka (DP)</td>
            <td className="tval">{formatIDR(offer?.dpAmount ?? 0)}</td>
          </tr>
          <tr>
            <td className="tlabel strong">Sisa Bayar</td>
            <td className="tval strong">{formatIDR(remaining)}</td>
          </tr>
        </tbody>
      </table>

      <BankBlock />
      <SignatureBlock left="Disetujui Oleh," right="Disiapkan Oleh," />
      <TermsBlock />
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Surat Jalan (DO)
 * ------------------------------------------------------------------ */

function DOSheet({
  doc,
  order,
  customer,
  lines,
  totalQty,
}: {
  doc: { doc_number: string; doc_date: string; notes: string | null };
  order: { order_number: string; notes: string | null; shipping_address: string | null };
  customer: { full_name: string } | null;
  lines: DocLine[];
  totalQty: number;
}) {
  return (
    <>
      <h1 className="doctitle">Surat Jalan</h1>
      <table className="headtable">
        <tbody>
          <tr>
            <td className="hlabel">Ship to</td>
            <td className="hval">{customer?.full_name ?? "—"}</td>
            <td className="hlabel">Delivery No</td>
            <td className="hval">{doc.doc_number}</td>
          </tr>
          <tr>
            <td className="hlabel">Alamat</td>
            <td className="hval">{order.shipping_address || "—"}</td>
            <td className="hlabel">Tanggal DO</td>
            <td className="hval">{formatDateID(doc.doc_date)}</td>
          </tr>
          <tr>
            <td className="hlabel">Delivery Note</td>
            <td className="hval" colSpan={3}>
              {order.notes || doc.notes || "—"}
            </td>
          </tr>
        </tbody>
      </table>

      <table className="itemtable">
        <thead>
          <tr>
            <th>No.</th>
            <th>Item</th>
            <th>Catatan</th>
            <th>Qty</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            const it = one(l.order_items);
            return (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>
                  {/* Nama + kode dipisah jadi dua BARIS (owner 2026-08-27:
                      "品名段落再優化" — screenshot cetak asli menunjukkan
                      "(KODE)" nempel di ujung nama lalu terpotong tanggung
                      di tengah saat wrap, kolom sempit jadi terlihat kacau).
                      Kode sekarang baris sendiri di bawah nama, konsisten
                      di ketiga dokumen (SO/DO/Invoice). */}
                  <div>{it?.name_snapshot ?? "—"}</div>
                  {it?.code_snapshot && <div className="itemcode">{it.code_snapshot}</div>}
                </td>
                <td>{it?.note || "—"}</td>
                <td className="num">{l.quantity}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3} className="tlabel strong">
              Total Qty
            </td>
            <td className="num strong">{totalQty}</td>
          </tr>
        </tfoot>
      </table>

      <SignatureBlock left="Diterima Oleh," middle="Dikirim Oleh," right="Disetujui Oleh," />
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Invoice
 * ------------------------------------------------------------------ */

function InvoiceSheet({
  doc,
  order,
  customer,
  lines,
  offer,
  customerPo,
}: {
  doc: { doc_number: string; doc_date: string; notes: string | null };
  order: { order_number: string };
  customer: { full_name: string } | null;
  lines: DocLine[];
  offer: OfferInfo;
  customerPo: string | null;
}) {
  const subtotal = lines.reduce((sum, l) => {
    const it = one(l.order_items);
    const price = it?.unit_price ?? 0;
    const disc = it?.line_discount ?? 0;
    return sum + Math.max(price - disc, 0) * l.quantity;
  }, 0);
  const remaining = offer ? Math.max(offer.finalAmount - offer.dpAmount, 0) : 0;

  return (
    <>
      <h1 className="doctitle">Invoice</h1>
      <table className="headtable">
        <tbody>
          <tr>
            <td className="hlabel">Bill to</td>
            <td className="hval">{customer?.full_name ?? "—"}</td>
            <td className="hlabel">Invoice No.</td>
            <td className="hval">{doc.doc_number}</td>
          </tr>
          <tr>
            <td className="hlabel">Kondisi Pembayaran</td>
            <td className="hval">{offer?.paymentCondition || "—"}</td>
            <td className="hlabel">Tanggal Invoice</td>
            <td className="hval">{formatDateID(doc.doc_date)}</td>
          </tr>
          <tr>
            <td className="hlabel">Purchase Order</td>
            {/* Nomor PO milik PELANGGAN (0020) kalau ada; kalau tidak, tetap
                nomor pesanan sistem seperti sebelumnya — fallback jujur,
                barisnya tidak pernah kosong. */}
            <td className="hval" colSpan={3}>
              {customerPo || order.order_number}
            </td>
          </tr>
        </tbody>
      </table>

      <table className="itemtable">
        <thead>
          <tr>
            <th>No.</th>
            <th>Item</th>
            <th>Qty</th>
            <th>Harga Satuan</th>
            <th>Potongan</th>
            <th>Jumlah</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            const it = one(l.order_items);
            const price = it?.unit_price ?? 0;
            const disc = it?.line_discount ?? 0;
            return (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>
                  {/* Nama + kode dipisah jadi dua BARIS (owner 2026-08-27:
                      "品名段落再優化" — screenshot cetak asli menunjukkan
                      "(KODE)" nempel di ujung nama lalu terpotong tanggung
                      di tengah saat wrap, kolom sempit jadi terlihat kacau).
                      Kode sekarang baris sendiri di bawah nama, konsisten
                      di ketiga dokumen (SO/DO/Invoice). */}
                  <div>{it?.name_snapshot ?? "—"}</div>
                  {it?.code_snapshot && <div className="itemcode">{it.code_snapshot}</div>}
                </td>
                <td className="num">{l.quantity}</td>
                <td className="num">{formatIDR(price)}</td>
                <td className="num">{formatIDR(disc)}</td>
                <td className="num">{formatIDR(Math.max(price - disc, 0) * l.quantity)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <table className="totaltable">
        <tbody>
          {/* BUKAN subtotal, walaupun dulu tertulis begitu: angkanya
              `final_amount` — ekspresi yang PERSIS SAMA dengan baris "Harga
              Akhir" di SO, dan Sisa Bayar di bawah dihitung darinya. Invoice
              memang tidak pernah mencetak subtotal sebelum diskon (rincian
              per baris sudah ada di tabel di atas), jadi namanya diluruskan
              ke "Harga Akhir" — sama dengan layar aplikasi dan sama dengan
              SO, supaya satu angka tidak punya dua nama di dua kertas. */}
          <tr>
            <td className="tlabel strong">Harga Akhir</td>
            <td className="tval strong">{formatIDR(offer?.finalAmount ?? subtotal)}</td>
          </tr>
          <tr>
            <td className="tlabel">Uang Muka (DP)</td>
            <td className="tval">{formatIDR(offer?.dpAmount ?? 0)}</td>
          </tr>
          <tr>
            <td className="tlabel strong">Sisa Bayar</td>
            <td className="tval strong">{formatIDR(remaining)}</td>
          </tr>
        </tbody>
      </table>

      <BankBlock />
      <SignatureBlock right="Hormat Kami," />
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Blok bersama
 * ------------------------------------------------------------------ */

/**
 * Kop surat — sama untuk SO/DO/Invoice, tata letaknya meniru kop template
 * Excel asli (owner 2026-08-27): KIRI logo + nama PT, KANAN blok alamat
 * rata-kanan + kontak, ditutup garis navy. Dipadatkan hari yang sama
 * (owner: "地址太浪費空間, 字體縮小, 能夠少行數 就少行數") — alamat dari
 * COMPANY_INFO.letterhead SUDAH dibungkus 2 baris di sumbernya, dan Telp/
 * Email/Website digabung SATU baris di sini (bukan 2), teks aslinya tidak
 * dipotong. Nilainya dari COMPANY_INFO.letterhead (lib/company-info.ts) —
 * satu tempat edit, tanpa UI admin (kebijakan sama dengan blok bank). Baris
 * telepon hanya tercetak bila nomornya sudah diisi di sana.
 *
 * Logo asli (public/brand/sanci-logo.png, 282×61) diunggah owner via Google
 * Drive 2026-08-27 — dibuka dari `/brand/sanci-logo.png` (jalur publik
 * Next.js, bukan Supabase Storage: aset statis punya build, tidak perlu
 * versi cache-bust seperti foto produk). `<img>` biasa, BUKAN `next/image`:
 * halaman cetak ini sudah menegaskan "BUKAN kloning piksel" tapi dokumen
 * dagang tetap harus identik tiap render — next/image dapat memilih format/
 * ukuran berbeda antar permintaan, sama sekali tidak diinginkan di sini.
 */
function LetterheadBlock() {
  const lh = COMPANY_INFO.letterhead;
  const contact = [lh.phone && `Telp: ${lh.phone}`, `Email: ${lh.email}`, `Website: ${lh.website}`]
    .filter(Boolean)
    .join("  |  ");
  return (
    <div className="letterhead">
      <div className="lh-left">
        {/* eslint-disable-next-line @next/next/no-img-element -- dokumen cetak statis, lihat catatan di atas */}
        <img className="lh-logo" src="/brand/sanci-logo.png" alt={lh.brand} />
        <div className="lh-company">{lh.name}</div>
      </div>
      <div className="lh-right">
        {lh.addressLines.map((line) => (
          <div key={line}>{line}</div>
        ))}
        <div>{contact}</div>
      </div>
    </div>
  );
}

function BankBlock() {
  return (
    <table className="banktable">
      <tbody>
        <tr>
          <td className="hlabel">Transfer Account</td>
          <td className="hval">{COMPANY_INFO.bank.name}</td>
        </tr>
        <tr>
          <td className="hlabel">Nomor Rekening</td>
          <td className="hval">{COMPANY_INFO.bank.accountNumber}</td>
        </tr>
        <tr>
          <td className="hlabel">Kota</td>
          <td className="hval">{COMPANY_INFO.bank.city}</td>
        </tr>
        <tr>
          <td className="hlabel">Nama Penerima</td>
          <td className="hval">{COMPANY_INFO.legalName}</td>
        </tr>
      </tbody>
    </table>
  );
}

function SignatureBlock({ left, middle, right }: { left?: string; middle?: string; right?: string }) {
  const cols = [left, middle, right].filter(Boolean) as string[];
  return (
    <table className="sigtable">
      <tbody>
        <tr>
          {cols.map((c, i) => (
            <td key={i} className="sigcell">
              {c}
              <div className="sigline">(..........…..................)</div>
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

const TERMS = [
  "1. Dengan menandatangani dokumen ini, pembeli menyatakan telah mengecek dan menyetujui detail barang (tipe, warna, bahan, ukuran, dan jumlah) yang tercantum di Sales Order.",
  "2. Segala ketidaksesuaian harus disampaikan maksimal 2x24 jam setelah dokumen ini ditandatangani.",
  "3. Barang yang sudah dipesan sesuai dengan Sales Order ini tidak dapat dibatalkan, ditukar, atau dikembalikan dengan alasan kesalahan order oleh pemesan.",
  "4. Kondisi Alami Material: Khusus untuk produk kayu solid dan kulit, Pembeli memahami bahwa perbedaan serat kayu atau sedikit variasi tekstur adalah karakteristik alami material dan tidak dianggap sebagai cacat produksi.",
];

function TermsBlock() {
  return (
    <div className="terms">
      <div className="termstitle">Syarat &amp; Ketentuan Pemesanan (Terms &amp; Conditions):</div>
      {TERMS.map((t) => (
        <p key={t}>{t}</p>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * CSS — A4-friendly, black-on-white REGARDLESS of dark mode (dokumen
 * dagang, bukan permukaan aplikasi — tidak boleh ikut var(--ink)/dark theme
 * milik globals.css). @media print menyembunyikan chrome aplikasi (sidebar/
 * nav dari app/admin/layout.tsx) dan tombol Cetak itu sendiri.
 * ------------------------------------------------------------------ */
const PRINT_CSS = `
  .print-sheet{
    background:#ffffff;color:#111111;
    max-width:900px;margin:0 auto;padding:24px;
    font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;
  }
  .print-sheet .doctitle{font-size:22px;font-weight:700;margin:0 0 16px;text-align:center;letter-spacing:.04em;text-transform:uppercase}
  .print-sheet .letterhead{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;border-bottom:3px solid #2a3f76;padding-bottom:6px;margin-bottom:12px}
  .print-sheet .lh-logo{height:30px;width:auto;display:block}
  .print-sheet .lh-company{font-size:11px;font-weight:700;letter-spacing:.05em;margin-top:4px;color:#2a3f76}
  .print-sheet .lh-right{text-align:right;font-size:9px;color:#333333;line-height:1.35}
  .print-sheet .photocell{width:60px;text-align:center}
  .print-sheet .photocell img{width:52px;height:52px;object-fit:contain;display:block;margin:0 auto}
  .print-sheet table{width:100%;border-collapse:collapse;margin-bottom:16px}
  .print-sheet .headtable td{padding:3px 6px;vertical-align:top;border:none}
  .print-sheet .headtable .hlabel{width:22%;font-weight:600;color:#333333}
  .print-sheet .headtable .hval{width:28%}
  .print-sheet .itemtable th,.print-sheet .itemtable td{border:1px solid #999999;padding:5px 7px;text-align:left}
  .print-sheet .itemtable th{background:#eeeeee;font-weight:700}
  .print-sheet .itemtable .num{text-align:right;white-space:nowrap}
  .print-sheet .itemcode{color:#666666;font-size:10.5px;margin-top:2px;font-family:"Courier New",Courier,monospace}
  /* Baris bawah (Qty/Harga Satuan/Potongan/Jumlah) — hanya tabel SO yang punya
     .rowtop/.rowbottom (DO tidak ada uang, Invoice tidak ada Foto/Ukuran/
     Catatan/Warna jadi tidak sesak). Garis antar dua baris satu barang
     dihilangkan supaya terlihat SATU blok, ditutup strip abu-abu. */
  .print-sheet .itemtable .rowtop td{border-bottom:none}
  .print-sheet .itemtable .rowbottom td{border-top:none;background:#f6f7f9;padding:3px 7px 6px}
  .print-sheet .itemstrip{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:3px 20px;font-size:11.5px}
  .print-sheet .itemstrip .lbl{color:#666666;margin-right:4px}
  .print-sheet .itemstrip .val{font-variant-numeric:tabular-nums;font-weight:600}
  .print-sheet .itemstrip .val.strong{font-weight:800;color:#111111}
  .print-sheet .totaltable{max-width:380px;margin-left:auto}
  .print-sheet .totaltable td{padding:3px 6px;border:none}
  .print-sheet .totaltable .tlabel{color:#333333}
  .print-sheet .totaltable .tval{text-align:right}
  .print-sheet .totaltable .strong{font-weight:700;border-top:1px solid #999999}
  .print-sheet .banktable{max-width:380px}
  .print-sheet .banktable td{padding:2px 6px;border:none}
  .print-sheet .banktable .hlabel{width:45%;font-weight:600;color:#333333}
  .print-sheet .sigtable{margin-top:36px}
  .print-sheet .sigcell{width:33%;text-align:center;vertical-align:top;padding:0 8px}
  .print-sheet .sigline{margin-top:56px;border-top:1px solid #333333;padding-top:4px;font-size:12px;color:#555555}
  .print-sheet .terms{margin-top:24px;font-size:11px;color:#222222}
  .print-sheet .termstitle{font-weight:700;margin-bottom:6px}
  .print-sheet .terms p{margin:0 0 4px}
  /* Pesanan panjang menembus beberapa halaman (owner 2026-08-27: "產品多要
     分頁,要清楚"): header tabel diulang tiap halaman, satu baris produk
     (termasuk fotonya) tidak pernah terpotong di tengah, dan blok
     total/bank/tanda tangan/syarat pindah utuh ke halaman berikutnya. */
  .print-sheet .itemtable thead{display:table-header-group}
  .print-sheet .itemtable tr{page-break-inside:avoid;break-inside:avoid}
  /* Pasangan rowtop/rowbottom (satu barang, dua baris — owner 2026-08-27)
     TIDAK BOLEH ada potongan halaman DI ANTARA keduanya, terpisah dari
     aturan break-inside per <tr> di atas (itu mencegah SATU baris terpotong,
     bukan mencegah potongan JATUH di antara dua baris pasangan). */
  .print-sheet .itemtable .rowtop{page-break-after:avoid;break-after:avoid-page}
  .print-sheet .itemtable .rowbottom{page-break-before:avoid;break-before:avoid-page}
  .print-sheet .totaltable,.print-sheet .banktable,.print-sheet .sigtable,.print-sheet .terms{
    page-break-inside:avoid;break-inside:avoid}
  @media print{
    .no-print{display:none !important}
    body *{visibility:hidden}
    .print-sheet,.print-sheet *{visibility:visible}
    .print-sheet{position:absolute;left:0;top:0;width:100%;max-width:none;margin:0;padding:0}
    @page{size:A4;margin:14mm}
  }
`;
