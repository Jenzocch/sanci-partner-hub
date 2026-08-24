import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatIDR, displayPhoneID } from "@/lib/orders-shared";
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
  // doc_date adalah kolom `date` (bukan timestamptz) — tambahkan waktu netral
  // supaya parsing tidak tergeser sehari oleh timezone browser/server.
  const d = iso.length <= 10 ? new Date(`${iso}T00:00:00`) : new Date(iso);
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

type OrderItemDetail = {
  name_snapshot: string;
  code_snapshot: string | null;
  custom_size: string | null;
  note: string | null;
  color_code: string | null;
  unit_price: number | null;
  line_discount: number | null;
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
        "quantity, order_items:order_item_id(name_snapshot, code_snapshot, custom_size, note, color_code, unit_price, line_discount)"
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
  const [salesRes, offerRes, customerPoRes] = await Promise.all([
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
  ]);
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
        {docType === "SO" && (
          <SOSheet doc={doc} order={order} customer={customer} salesName={salesName} lines={lines} offer={offer} />
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
}: {
  doc: { doc_number: string; doc_date: string; notes: string | null };
  order: { order_number: string; notes: string | null; created_at: string; shipping_address: string | null };
  customer: { full_name: string; phone_normalized: string; whatsapp: string | null } | null;
  salesName: string | null;
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

      <table className="itemtable">
        <thead>
          <tr>
            <th>No.</th>
            <th>Item</th>
            <th>Ukuran</th>
            <th>Catatan</th>
            <th>Warna</th>
            <th>Qty</th>
            <th>Harga</th>
            <th>Disc</th>
            <th>Setelah Disc</th>
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
                  {it?.name_snapshot ?? "—"}
                  {it?.code_snapshot && <span className="itemcode"> ({it.code_snapshot})</span>}
                </td>
                <td>{it?.custom_size || "—"}</td>
                <td>{it?.note || "—"}</td>
                <td>{it?.color_code || "—"}</td>
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
          <tr>
            <td className="tlabel">SubTotal</td>
            <td className="tval">{formatIDR(subtotal)}</td>
          </tr>
          {offer?.discountPcts.map((p, i) => (
            <tr key={i}>
              <td className="tlabel">Discount {i + 1}</td>
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
          <tr>
            <td className="tlabel strong">Total Setelah Disc</td>
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
                  {it?.name_snapshot ?? "—"}
                  {it?.code_snapshot && <span className="itemcode"> ({it.code_snapshot})</span>}
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
            <th>Harga</th>
            <th>Disc</th>
            <th>Setelah Disc</th>
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
                  {it?.name_snapshot ?? "—"}
                  {it?.code_snapshot && <span className="itemcode"> ({it.code_snapshot})</span>}
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
          <tr>
            <td className="tlabel strong">SubTotal</td>
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
  .print-sheet table{width:100%;border-collapse:collapse;margin-bottom:16px}
  .print-sheet .headtable td{padding:3px 6px;vertical-align:top;border:none}
  .print-sheet .headtable .hlabel{width:22%;font-weight:600;color:#333333}
  .print-sheet .headtable .hval{width:28%}
  .print-sheet .itemtable th,.print-sheet .itemtable td{border:1px solid #999999;padding:5px 7px;text-align:left}
  .print-sheet .itemtable th{background:#eeeeee;font-weight:700}
  .print-sheet .itemtable .num{text-align:right;white-space:nowrap}
  .print-sheet .itemcode{color:#555555;font-size:11px}
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
  @media print{
    .no-print{display:none !important}
    body *{visibility:hidden}
    .print-sheet,.print-sheet *{visibility:visible}
    .print-sheet{position:absolute;left:0;top:0;width:100%;max-width:none;margin:0;padding:0}
    @page{size:A4;margin:14mm}
  }
`;
