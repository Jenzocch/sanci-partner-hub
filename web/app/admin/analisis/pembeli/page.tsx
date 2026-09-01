import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  ORDER_STATUS_CHIP,
  displayPhoneID,
  formatDateTimeWIB,
  formatIDR,
  isMissingTableError,
  orderStatusLabel,
  type OrderStatus,
} from "@/lib/orders-shared";
import { catalogIlikeOrFilter } from "@/lib/catalog-query";
import { getAdminMessages } from "@/lib/i18n";
import AnalisisTabs from "../tabs";

export const dynamic = "force-dynamic";

/**
 * "Siapa yang pernah beli produk ini" (/admin/analisis/pembeli) — 2026-09-01.
 *
 * KENAPA ADA: pertanyaan owner "那個型號有賣給誰過" sampai sekarang HANYA bisa
 * dijawab di lembar Google Sheets (tab "Item Pesanan"). Di dalam sistem, tab
 * "Produk Terlaris" sebelah menjawab pertanyaan yang BERBEDA — ia
 * menjumlahkan berapa banyak yang terjual, bukan KEPADA SIAPA. Mencari nama
 * produk di /admin/orders mendekati, tapi yang pulang adalah daftar PESANAN
 * (satu baris per pesanan, tanpa jumlah/warna/harga baris itu sendiri),
 * bukan daftar pembelian.
 *
 * BENTUK JAWABANNYA: satu baris per BARIS PESANAN, bukan per pelanggan.
 * Pelanggan yang membeli sofa yang sama dua kali dalam dua pesanan berbeda
 * MEMANG muncul dua kali — menggabungkannya akan menyembunyikan bahwa itu
 * dua transaksi terpisah, dan justru pengulangan itu yang menarik.
 *
 * DUA KEPUTUSAN CAKUPAN yang sengaja:
 *
 *  1. PENCARIAN TEKS, bukan pilih-produk-dari-katalog. Alasannya bukan
 *     kemalasan: baris pesanan yang diketik tangan admin SELALU
 *     `product_id = null` (0014 §5 — modus "Tambah" di halaman pesanan tidak
 *     pernah menautkan ke katalog), jadi pencarian berdasarkan id akan
 *     DIAM-DIAM melewatkan justru penjualan yang paling sering diketik
 *     manual. `name_snapshot`/`code_snapshot` beku di baris pesanan sejak
 *     dibuat, jadi teks adalah satu-satunya kunci yang menjangkau keduanya.
 *     Baris manual diberi lencana supaya bedanya kelihatan, bukan
 *     disembunyikan.
 *
 *  2. Pesanan DIBATALKAN IKUT DITAMPILKAN, dengan chip statusnya. Membuang
 *     diam-diam akan membuat halaman ini berbohong ("tidak pernah dijual ke
 *     siapa pun") tentang penjualan yang nyata-nyata pernah terjadi lalu
 *     dibatalkan — dan pembatalan itu sendiri sering justru yang dicari.
 *     Beda dari tab "Produk Terlaris" yang memang HANYA REGISTERED, karena
 *     di sana angkanya dijumlahkan jadi omzet.
 *
 * Auth: layout /admin sudah menggerbang platform_admins; RLS `oi_admin_all`
 * (0014 §8) tetap batas sesungguhnya (LESSONS #5). Halaman ini tidak menulis
 * apa pun.
 */

type QueryErr = { code?: string; message?: string } | null;

/**
 * Batas pindaian baris `order_items`. Angka yang SAMA dengan
 * ORDER_ITEMS_SCAN_LIMIT di /admin/orders, dan bukan kebetulan: dua halaman
 * ini melakukan pemindaian yang bentuknya identik (ilike atas
 * name_snapshot/code_snapshot, lalu ambil pesanannya lewat `.in(order_id)`),
 * jadi panjang URL `.in()` yang dihasilkan juga sekelas. Diurutkan
 * created_at terbaru dulu supaya kalau kepotong, yang hilang adalah
 * pembelian LAMA — dan catatan kakinya WAJIB muncul (LESSONS #10).
 */
const ITEM_SCAN_LIMIT = 200;

type ItemRow = {
  id: string;
  order_id: string;
  product_id: string | null;
  name_snapshot: string;
  code_snapshot: string | null;
  color_code: string | null;
  quantity: number;
  unit_price: number | null;
  line_discount: number | null;
};

type OrderRow = {
  id: string;
  order_number: string;
  customer_id: string;
  partner_id: string;
  branch_id: string;
  status: OrderStatus;
  created_at: string;
};

export default async function AdminBuyersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const m = await getAdminMessages();
  const sp = await searchParams;
  const q = (sp.q || "").trim();

  const header = (
    <>
      <div className="worktop">
        <h1>{m.admin.navAnalytics}</h1>
      </div>
      <AnalisisTabs active="pembeli" m={m} />
      <form className="searchrow wide" action="/admin/analisis/pembeli" method="GET">
        <input
          type="search"
          name="q"
          placeholder={m.admin.buyersSearchPlaceholder}
          defaultValue={q}
          className="search-input"
        />
        <button className="btn" type="submit">
          {m.common.search}
        </button>
      </form>
    </>
  );

  // Tanpa kata kunci TIDAK ada query sama sekali — halaman ini menjawab
  // "siapa yang beli PRODUK INI", dan tanpa produknya tidak ada pertanyaan.
  // Kartu ajakan, BUKAN daftar kosong yang terbaca seperti "belum ada
  // penjualan" (LESSONS #10).
  if (!q) {
    return (
      <div>
        {header}
        <div className="card emptybox">{m.admin.buyersPrompt}</div>
      </div>
    );
  }

  const supabase = await createClient();
  let queryErr: QueryErr = null;

  // ── 1. Baris pesanan yang cocok teksnya ────────────────────────
  // "Item dulu", KEBALIKAN dari tab Produk Terlaris yang sengaja "pesanan
  // dulu". Bukan ketidakkonsistenan: di sana predikat penyaringnya ada di
  // partner_orders (status + rentang tanggal), di sini predikatnya ada di
  // order_items itu sendiri (teks produk). Menyaring lebih dulu di tabel
  // yang memegang predikatnya adalah aturan yang sama, hasilnya kebetulan
  // berlawanan.
  const orFilter = catalogIlikeOrFilter(q, ["name_snapshot", "code_snapshot"]);
  let items: ItemRow[] = [];
  let itemsCapped = false;

  if (orFilter) {
    let itemsQuery = supabase
      .from("order_items")
      .select("id, order_id, product_id, name_snapshot, code_snapshot, color_code, quantity, unit_price, line_discount")
      .order("created_at", { ascending: false })
      .limit(ITEM_SCAN_LIMIT);
    itemsQuery = itemsQuery.or(orFilter);
    const { data, error } = await itemsQuery;
    if (error) queryErr = error;
    else {
      items = (data ?? []) as ItemRow[];
      itemsCapped = items.length >= ITEM_SCAN_LIMIT;
    }
  }

  // ── 2. Pesanan pemilik baris-baris itu ─────────────────────────
  const orderIds = Array.from(new Set(items.map((it) => it.order_id)));
  const ordersMap = new Map<string, OrderRow>();
  if (!queryErr && orderIds.length > 0) {
    const { data, error } = await supabase
      .from("partner_orders")
      .select("id, order_number, customer_id, partner_id, branch_id, status, created_at")
      .in("id", orderIds);
    if (error) queryErr = error;
    else for (const o of (data ?? []) as OrderRow[]) ordersMap.set(o.id, o);
  }

  // ── 3. Nama pelanggan / partner / cabang untuk baris yang tampil ──
  // Map by id, bukan embed PostgREST (partner_orders punya dua FK ke tabel
  // partner — LESSONS #24; pola yang sama dengan /admin/orders).
  const orders = Array.from(ordersMap.values());
  const customersMap = new Map<string, { full_name: string; phone_normalized: string }>();
  const partnersMap = new Map<string, string>();
  const branchesMap = new Map<string, string>();
  if (!queryErr && orders.length > 0) {
    const [custRes, partnerRes, branchRes] = await Promise.all([
      supabase
        .from("customers")
        .select("id, full_name, phone_normalized")
        .in("id", Array.from(new Set(orders.map((o) => o.customer_id)))),
      supabase.from("partners").select("id, name").in("id", Array.from(new Set(orders.map((o) => o.partner_id)))),
      supabase
        .from("partner_branches")
        .select("id, name")
        .in("id", Array.from(new Set(orders.map((o) => o.branch_id)))),
    ]);
    queryErr = custRes.error || partnerRes.error || branchRes.error || null;
    if (!queryErr) {
      for (const c of (custRes.data ?? []) as { id: string; full_name: string; phone_normalized: string }[]) {
        customersMap.set(c.id, { full_name: c.full_name, phone_normalized: c.phone_normalized });
      }
      for (const p of (partnerRes.data ?? []) as { id: string; name: string }[]) partnersMap.set(p.id, p.name);
      for (const b of (branchRes.data ?? []) as { id: string; name: string }[]) branchesMap.set(b.id, b.name);
    }
  }

  // Baris item yang pesanannya TIDAK ikut pulang dibuang: tanpa pesanan
  // tidak ada pembeli, dan baris tanpa pembeli tidak menjawab pertanyaan
  // halaman ini. Urutan akhir mengikuti tanggal PESANAN (bukan tanggal
  // baris item) — itu tanggal yang dikenal staf sebagai "kapan dibeli".
  const rows = items
    .map((it) => ({ item: it, order: ordersMap.get(it.order_id) }))
    .filter((r): r is { item: ItemRow; order: OrderRow } => !!r.order)
    .sort((a, b) => (a.order.created_at < b.order.created_at ? 1 : -1));

  const totalQty = rows.reduce((s, r) => s + r.item.quantity, 0);
  const buyerCount = new Set(rows.map((r) => r.order.customer_id)).size;

  if (isMissingTableError(queryErr)) {
    return (
      <div>
        {header}
        <div className="card emptybox">{m.admin.analyticsFeatureOff}</div>
      </div>
    );
  }

  return (
    <div>
      {header}

      {queryErr ? (
        <div className="card" style={{ margin: 0 }}>
          <div className="err">{m.common.errorLoad}</div>
        </div>
      ) : rows.length === 0 ? (
        <div className="card emptybox">{m.admin.buyersEmpty.replace("{q}", q)}</div>
      ) : (
        <div>
          <div className="banner info">
            {m.admin.buyersSummary
              .replace("{buyers}", String(buyerCount))
              .replace("{qty}", String(totalQty))
              .replace("{q}", q)}
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>{m.admin.colCustomer}</th>
                  <th>{m.common.product}</th>
                  <th>{m.common.color}</th>
                  <th>{m.common.quantity}</th>
                  <th>{m.common.unitPrice}</th>
                  <th>{m.common.orderNumber}</th>
                  <th>{m.common.partner}</th>
                  <th>{m.common.branch}</th>
                  <th>{m.common.status}</th>
                  <th>{m.common.createdAt}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const customer = customersMap.get(r.order.customer_id);
                  return (
                    // Kunci: `order_items.id` sendiri. Bukan
                    // (order_id, nama, warna) — kombinasi itu TIDAK unik:
                    // modus "Tambah" di halaman pesanan admin adalah teks
                    // bebas, jadi satu pesanan boleh memuat dua baris dengan
                    // nama DAN warna yang sama persis (mis. dua pengiriman
                    // terpisah untuk barang yang sama). Satu kolom uuid
                    // ekstra jauh lebih murah daripada kunci React yang
                    // bertabrakan.
                    <tr key={r.item.id}>
                      <td>
                        {customer ? (
                          <>
                            <div>
                              {/* Menuju riwayat pelanggan — dari "siapa yang
                                  beli ini" langsung ke "apa lagi yang pernah
                                  ia beli", tanpa lewat pencarian lagi. */}
                              <Link
                                href={`/admin/pelanggan/${r.order.customer_id}`}
                                className="rowname"
                                prefetch={false}
                              >
                                <strong>{customer.full_name}</strong>
                              </Link>
                            </div>
                            <div className="small muted">{displayPhoneID(customer.phone_normalized)}</div>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <div>{r.item.name_snapshot}</div>
                        {r.item.code_snapshot && <span className="code">{r.item.code_snapshot}</span>}
                        {r.item.product_id === null && (
                          <div>
                            <span className="chip neutral">{m.admin.analyticsManualBadge}</span>
                          </div>
                        )}
                      </td>
                      <td>{r.item.color_code || "—"}</td>
                      <td className="num">{r.item.quantity}</td>
                      {/* Harga NULL = belum diisi, BUKAN Rp 0 (LESSONS #10). */}
                      <td className="num">{r.item.unit_price == null ? "—" : formatIDR(r.item.unit_price)}</td>
                      <td>
                        <Link href={`/admin/orders/${r.order.id}`} className="rowname" prefetch={false}>
                          <span className="code">{r.order.order_number}</span>
                        </Link>
                      </td>
                      <td>{partnersMap.get(r.order.partner_id) ?? "—"}</td>
                      <td>{branchesMap.get(r.order.branch_id) ?? "—"}</td>
                      <td>
                        <span className={ORDER_STATUS_CHIP[r.order.status]}>
                          {orderStatusLabel(m, r.order.status)}
                        </span>
                      </td>
                      <td className="small muted">
                        {formatDateTimeWIB(r.order.created_at, m.common.dateLocale)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="footnote">
            {m.admin.buyersShowingCount.replace("{n}", String(rows.length))}
            {itemsCapped && <> {m.admin.buyersScanCapNote.replace("{n}", String(ITEM_SCAN_LIMIT))}</>}
          </div>
        </div>
      )}
    </div>
  );
}
