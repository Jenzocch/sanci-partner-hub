import { createClient } from "@/lib/supabase/server";
import { formatIDR, isMissingTableError, wibDayBoundsToIso } from "@/lib/orders-shared";
import { getAdminMessages } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * Batas baris `order_items` yang dipindai untuk menghitung Produk Terlaris.
 * Data sungguhan hari ini masih sangat kecil (puluhan pesanan, SPEC delegasi
 * irisan ini) — batas ini murni jaring pengaman untuk masa depan, BUKAN
 * angka yang sengaja dipilih ketat. Kalau kepotong, footnote-nya WAJIB
 * tampil (LESSONS #10: tidak ada pemotongan diam-diam) — lihat
 * `analyticsScanCapNote` di bawah.
 */
const ORDER_ITEMS_SCAN_LIMIT = 5000;

/**
 * Batas baris `partner_orders` (hanya kolom `id`) yang diambil untuk
 * menentukan pesanan REGISTERED mana saja yang masuk rentang tanggal.
 * SENGAJA jauh lebih longgar dari ORDER_ITEMS_SCAN_LIMIT — ini murni
 * jaring pengaman terhadap query tanpa batas atas (LESSONS #6), bukan
 * cap yang realistis akan tersentuh (jumlah pesanan jauh lebih sedikit
 * dari jumlah baris item). TIDAK diberi footnote sendiri kalau tersentuh
 * — pada skala data saat ini itu berarti sesuatu sudah sangat aneh, dan
 * kalaupun terjadi, cap item di atas tetap menjaga total tidak diam-diam
 * melebihi apa yang benar-benar dihitung.
 */
const ORDER_ID_SCAN_LIMIT = 20000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type SortKey = "qty" | "amount";

type OrderItemRow = {
  product_id: string | null;
  name_snapshot: string;
  code_snapshot: string | null;
  quantity: number;
  unit_price: number | null;
  line_discount: number | null;
};

type AggRow = {
  key: string;
  name: string;
  code: string | null;
  manual: boolean;
  qty: number;
  amount: number;
};

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; dateFrom?: string; dateTo?: string }>;
}) {
  const m = await getAdminMessages();
  const sp = await searchParams;
  const sort: SortKey = sp.sort === "qty" ? "qty" : "amount";

  // Sama persis dengan pola /admin/orders (LESSONS: satu pola dipakai
  // berulang, bukan ditemukan ulang per halaman) — input mentah dari
  // <input type="date"> divalidasi formatnya dulu (LESSONS #6), lalu
  // dibandingkan APA ADANYA terhadap created_at (timestamptz UTC, diisi
  // server `now()` — LESSONS #11) TANPA konversi zona waktu pengguna.
  // Trade-off yang sama disengaja: staf di WIB/WITA/WIT bisa meleset
  // beberapa jam dari batas hari kalender lokal mereka; diterima karena
  // SPEC tidak minta presisi jam.
  const dateFrom = sp.dateFrom && DATE_RE.test(sp.dateFrom) ? sp.dateFrom : "";
  const dateTo = sp.dateTo && DATE_RE.test(sp.dateTo) ? sp.dateTo : "";
  const gteIso = dateFrom ? wibDayBoundsToIso(dateFrom, "start") : "";
  const lteIso = dateTo ? wibDayBoundsToIso(dateTo, "end") : "";

  const supabase = await createClient();

  // ── 1. Pesanan REGISTERED dalam rentang tanggal → daftar id ────────────
  // Round-trip pertama dari DUA total. Kenapa pesanan dulu, BUKAN baca
  // order_items dulu lalu tanya balik statusnya: order_items tidak punya
  // kolom status/created_at pesanan sendiri untuk difilter di query yang
  // sama, jadi "item dulu" berarti memindai SEMUA item (termasuk yang
  // CANCELLED dan di luar rentang tanggal) sampai ORDER_ITEMS_SCAN_LIMIT
  // sebelum tahu baris mana yang relevan — di data nyata (banyak pesanan
  // lama/CANCELLED) itu bisa menghabiskan jatah pemindaian untuk baris yang
  // ujung-ujungnya dibuang. "Pesanan dulu" menyaring di query yang murah
  // (tabel jauh lebih kecil dari order_items) sehingga jatah pemindaian
  // langkah 2 seluruhnya dipakai untuk baris yang benar-benar relevan.
  let orderIds: string[] = [];
  let queryErr: { code?: string; message?: string } | null = null;

  {
    let idQuery = supabase
      .from("partner_orders")
      .select("id")
      .eq("status", "REGISTERED")
      .order("created_at", { ascending: false })
      .limit(ORDER_ID_SCAN_LIMIT);
    if (gteIso) idQuery = idQuery.gte("created_at", gteIso);
    if (lteIso) idQuery = idQuery.lte("created_at", lteIso);
    const { data, error } = await idQuery;
    if (error) queryErr = error;
    else orderIds = (data ?? []).map((r: { id: string }) => r.id);
  }

  // ── 2. order_items milik pesanan-pesanan itu → agregasi di memori ──────
  // Round-trip kedua (TOTAL 2, tidak ada round-trip ketiga untuk nama/kode
  // produk — name_snapshot/code_snapshot sudah beku di baris ini sejak
  // pesanan dibuat, migration 0014, jadi tidak perlu JOIN balik ke
  // sanci_products). RLS: `oi_admin_all` (0014 §8, "for all using
  // (fn_is_admin())") — admin baca SEMUA baris order_items tanpa syarat
  // kepemilikan pesanan, beda dari sisi cabang yang digerbang
  // fn_can_view_branch (oi_partner_read). `.in("order_id", orderIds)`
  // dilewati sama sekali kalau orderIds kosong — bukan cuma optimisasi,
  // supabase-js/PostgREST akan mengembalikan 0 baris untuk `.in()` dengan
  // array kosong, jadi ini murni menghindari satu round-trip yang sudah
  // pasti hasilnya nol.
  let items: OrderItemRow[] = [];
  let itemsCapped = false;

  if (!queryErr && orderIds.length > 0) {
    const { data, error } = await supabase
      .from("order_items")
      .select("product_id, name_snapshot, code_snapshot, quantity, unit_price, line_discount")
      .in("order_id", orderIds)
      .order("created_at", { ascending: false })
      .limit(ORDER_ITEMS_SCAN_LIMIT);
    if (error) queryErr = error;
    else {
      items = (data ?? []) as OrderItemRow[];
      itemsCapped = items.length >= ORDER_ITEMS_SCAN_LIMIT;
    }
  }

  // ── 3. Agregasi per product_id (baris manual → per name_snapshot) ──────
  // Kunci agregasi: product_id kalau ada, kalau tidak (baris manual, tanpa
  // rujukan katalog — migration 0014 §5) pakai name_snapshot dengan prefix
  // supaya tidak pernah tabrakan dengan sebuah uuid product_id yang sah.
  // Revenue per baris: (unit_price - line_discount) × quantity, harga NULL
  // dihitung 0 (footnote `analyticsUnpricedNote` menjelaskan ini secara
  // eksplisit ke pengguna kalau ada baris yang kena, bukan didiamkan).
  const agg = new Map<string, AggRow>();
  let unpricedCount = 0;

  for (const it of items) {
    if (it.unit_price === null) unpricedCount += 1;
    const unitPrice = it.unit_price ?? 0;
    const discount = it.line_discount ?? 0;
    const lineAmount = (unitPrice - discount) * it.quantity;

    const key = it.product_id ?? `manual:${it.name_snapshot}`;
    const existing = agg.get(key);
    if (existing) {
      existing.qty += it.quantity;
      existing.amount += lineAmount;
    } else {
      agg.set(key, {
        key,
        name: it.name_snapshot,
        code: it.code_snapshot,
        manual: it.product_id === null,
        qty: it.quantity,
        amount: lineAmount,
      });
    }
  }

  const ranked = Array.from(agg.values())
    .sort((a, b) => (sort === "qty" ? b.qty - a.qty : b.amount - a.amount))
    .slice(0, 20);
  const maxValue = ranked.reduce(
    (max, r) => Math.max(max, sort === "qty" ? r.qty : r.amount),
    0
  );

  // ── Degradasi: tabel belum ada = migration belum jalan, bukan error
  //    biasa dan BUKAN "0 penjualan" (LESSONS #9, #12, #10 — tiga keadaan
  //    yang tidak boleh disamakan: error muat ≠ fitur belum aktif ≠
  //    memang nol di rentang ini).
  if (isMissingTableError(queryErr)) {
    return (
      <div>
        <div className="worktop">
          <h1>{m.admin.navAnalytics}</h1>
        </div>
        <div className="card emptybox">{m.admin.analyticsFeatureOff}</div>
      </div>
    );
  }

  return (
    <div>
      <div className="worktop">
        <h1>{m.admin.navAnalytics}</h1>
      </div>

      <form className="searchrow wide" action="/admin/analisis" method="GET">
        <label className="small muted">
          {m.admin.analyticsSortLabel + " "}
          <select name="sort" defaultValue={sort} className="filter-select">
            <option value="amount">{m.admin.analyticsSortAmount}</option>
            <option value="qty">{m.admin.analyticsSortQty}</option>
          </select>
        </label>
        <label className="small muted">
          {m.admin.ordersDateFromLabel + " "}
          <input type="date" name="dateFrom" defaultValue={dateFrom} className="filter-select" />
        </label>
        <label className="small muted">
          {m.admin.ordersDateToLabel + " "}
          <input type="date" name="dateTo" defaultValue={dateTo} className="filter-select" />
        </label>
        <button className="btn" type="submit">
          {m.common.search}
        </button>
      </form>

      {queryErr ? (
        <div className="card" style={{ margin: 0 }}>
          <div className="err">{m.common.errorLoad}</div>
        </div>
      ) : ranked.length === 0 ? (
        <div className="card emptybox">{m.admin.analyticsEmpty}</div>
      ) : (
        <div className="card">
          <h2 style={{ marginBottom: 16 }}>{m.admin.analyticsCardTitle}</h2>
          <div className="rankbar-list">
            {ranked.map((r, i) => {
              const value = sort === "qty" ? r.qty : r.amount;
              const pct = maxValue > 0 ? Math.max(0, (value / maxValue) * 100) : 0;
              return (
                <div className="rankbar-row" key={r.key}>
                  <div className="rankbar-rank">{i + 1}</div>
                  <div className="rankbar-name">
                    <strong>{r.name}</strong>
                    {r.code && <span className="code">{r.code}</span>}
                    {r.manual && <span className="chip neutral">{m.admin.analyticsManualBadge}</span>}
                  </div>
                  <div className="rankbar-value num">
                    {sort === "qty" ? r.qty.toLocaleString("id-ID") : formatIDR(r.amount)}
                  </div>
                  <div className="rankbar-track">
                    <div className="rankbar-fill" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="footnote">
            {m.admin.analyticsShowingCount.replace("{n}", String(ranked.length))}
            {itemsCapped && (
              <>
                {" "}
                {m.admin.analyticsScanCapNote.replace("{n}", String(ORDER_ITEMS_SCAN_LIMIT))}
              </>
            )}
            {unpricedCount > 0 && (
              <>
                {" "}
                {m.admin.analyticsUnpricedNote.replace("{n}", String(unpricedCount))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
