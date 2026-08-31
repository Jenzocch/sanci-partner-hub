import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  ORDER_STATUS_CHIP,
  fulfillmentLabel,
  orderStatusLabel,
  displayPhoneID,
  isMissingTableError,
  normalizePhoneID,
  formatDateTimeWIB,
  wibDayBoundsToIso,
  type FulfillmentPath,
  type OrderStatus,
} from "@/lib/orders-shared";
import { likeEscape, catalogIlikeOrFilter } from "@/lib/catalog-query";
import { getAdminMessages } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const LIST_LIMIT = 50;

/** Batas baris `order_items` yang dipindai saat mencari nama/kode produk —
 *  dipisah dari LIST_LIMIT supaya satu kata kunci populer (mis. "Sofa")
 *  tidak memindai seluruh tabel item; diurutkan created_at terbaru dulu
 *  supaya kalau kepotong, yang hilang adalah item LAMA bukan yang baru. */
const ORDER_ITEMS_SCAN_LIMIT = 200;

/** Batas baris `partner_staff` yang dipindai saat mencari nama sales —
 *  jumlah staf jauh lebih kecil dari produk/item, tapi tetap dibatasi
 *  supaya tidak ada query tanpa batas atas (LESSONS #6, input tak dipercaya). */
const STAFF_MATCH_SCAN_LIMIT = 200;

/**
 * Batas pindaian nomor dokumen (SO/DO/Invoice) — pola sama dengan
 * ORDER_ITEMS_SCAN_LIMIT: cari dokumennya dulu, lalu ambil pesanannya lewat
 * order_id, bukan menarik semua pesanan lalu menyaring di memori.
 */
const DOC_NUMBER_SCAN_LIMIT = 200;

const ORDER_COLS =
  "id, order_number, customer_id, partner_id, branch_id, partner_sales_staff_id, package_name, status, created_at";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Filter "Status Kirim" (2026-08-31). Tiga nilai, bukan lima seperti kolom
 * Status Kirim di lembar Google Sheets: membedakan "DO sebagian" dari "sudah
 * DO penuh" menuntut kuantitas order_items DAN order_document_items untuk
 * setiap pesanan yang tampil — beban query yang tidak sepadan untuk sebuah
 * DAFTAR. Pertanyaan operasional sehari-hari ("mana yang belum dikirim")
 * sudah terjawab oleh tiga nilai ini; rinciannya ada di lembar Sheets.
 */
type ShippingFilter = "ALL" | "BELUM_DO" | "SUDAH_DO" | "DITERIMA";

/**
 * Batas pindaian filter kirim. Filternya dikerjakan DI MEMORI karena
 * "pesanan yang TIDAK punya DO" bukan sesuatu yang bisa ditanyakan lintas
 * tabel ke PostgREST tanpa view/RPC baru (dan daftar `in.(...)` berisi ribuan
 * UUID melebihi panjang URL yang wajar). Konsekuensinya dibatasi dan
 * DIKATAKAN: kalau salah satu batas ini tersentuh, catatan kaki muncul di
 * bawah daftar — bukan hasil terpotong yang terlihat lengkap (LESSONS #10).
 */
const SHIPPING_DOC_SCAN_LIMIT = 3000;
const SHIPPING_ORDER_SCAN_LIMIT = LIST_LIMIT * 6;

type OrderListRow = {
  id: string;
  order_number: string;
  customer_id: string;
  partner_id: string;
  branch_id: string;
  partner_sales_staff_id: string | null;
  package_name: string;
  status: OrderStatus;
  created_at: string;
};

type QueryErr = { code?: string; message?: string } | null;

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; jalur?: string; kirim?: string; dateFrom?: string; dateTo?: string }>;
}) {
  const m = await getAdminMessages();
  const STATUS_OPTIONS: { value: "ALL" | OrderStatus; label: string }[] = [
    { value: "ALL", label: m.admin.filterStatusAll },
    { value: "REGISTERED", label: m.common.orderStatusRegistered },
    { value: "CANCELLED", label: m.common.orderStatusCancelled },
  ];
  const JALUR_OPTIONS: { value: "ALL" | FulfillmentPath; label: string }[] = [
    { value: "ALL", label: m.admin.filterFulfillmentAll },
    { value: "DIRECT_DELIVERY", label: m.common.fulfillmentDirect },
    { value: "SHOWROOM_VISIT", label: m.common.fulfillmentShowroom },
  ];
  const KIRIM_OPTIONS: { value: ShippingFilter; label: string }[] = [
    { value: "ALL", label: m.admin.filterShippingAll },
    { value: "BELUM_DO", label: m.admin.filterShippingBelumDo },
    { value: "SUDAH_DO", label: m.admin.filterShippingSudahDo },
    { value: "DITERIMA", label: m.admin.filterShippingDiterima },
  ];
  const sp = await searchParams;
  const q = (sp.q || "").trim();
  const kirimFilter: ShippingFilter =
    sp.kirim === "BELUM_DO" || sp.kirim === "SUDAH_DO" || sp.kirim === "DITERIMA" ? sp.kirim : "ALL";
  const statusFilter: "ALL" | OrderStatus =
    sp.status === "REGISTERED" || sp.status === "CANCELLED" ? sp.status : "ALL";
  const jalurFilter: "ALL" | FulfillmentPath =
    sp.jalur === "DIRECT_DELIVERY" || sp.jalur === "SHOWROOM_VISIT" ? sp.jalur : "ALL";
  // Input mentah dari <input type="date"> — divalidasi formatnya (bukan
  // dipercaya begitu saja, LESSONS #6) sebelum dipakai membangun filter.
  const dateFrom = sp.dateFrom && DATE_RE.test(sp.dateFrom) ? sp.dateFrom : "";
  const dateTo = sp.dateTo && DATE_RE.test(sp.dateTo) ? sp.dateTo : "";
  // Rentang tanggal dibandingkan APA ADANYA terhadap created_at (timestamptz
  // UTC, diisi server `now()` — LESSONS #11), TANPA konversi zona waktu
  // pengguna: "Dari tanggal" = 00:00:00.000 UTC hari itu, "Sampai tanggal" =
  // 23:59:59.999 UTC hari itu. Trade-off yang disengaja: untuk staf di
  // WIB/WITA/WIT, hari kalender LOKAL mereka bisa meleset beberapa jam dari
  // rentang UTC ini (pesanan jam 00:30 WIB tanggal 5 punya created_at UTC di
  // tanggal 4). Diterima karena SPEC tidak minta presisi jam, dan menghindari
  // kerumitan zona waktu di server component (server tidak tahu zona waktu
  // browser staf) — kalau nanti perlu presisi ini, itu keputusan migrasi
  // tersendiri (kolom zona waktu partner/branch), bukan tebakan di sini.
  const gteIso = dateFrom ? wibDayBoundsToIso(dateFrom, "start") : "";
  const lteIso = dateTo ? wibDayBoundsToIso(dateTo, "end") : "";

  const supabase = await createClient();

  let queryErr: QueryErr = null;

  /**
   * Satu bentuk query daftar pesanan: kolom + urutan + filter status/tanggal
   * yang IDENTIK untuk semua jalur pencarian. Dipakai lewat pemanggilan
   * (bukan satu builder dipakai ulang) karena builder supabase-js sekali
   * pakai — tiap jalur butuh instansnya sendiri.
   */
  const ordersQuery = () => {
    let qb = supabase.from("partner_orders").select(ORDER_COLS);
    if (statusFilter !== "ALL") qb = qb.eq("status", statusFilter);
    if (gteIso) qb = qb.gte("created_at", gteIso);
    if (lteIso) qb = qb.lte("created_at", lteIso);
    return qb.order("created_at", { ascending: false });
  };

  // ── 1–2. Ambil partner_orders — difilter status+tanggal di server, dan
  //      (kalau ada kata kunci) digabung dari LIMA jalur pencarian yang
  //      hasilnya digabung-dedupe di memori berdasar id (bukan `.or()`
  //      lintas tabel — masing-masing jalur query vertikal sendiri,
  //      LESSONS #40):
  //        1) order_number cocok (ilike)
  //        2) customers.full_name/phone_normalized cocok → customer_id
  //        3) customer_po cocok (ilike) — kolom 0020, TOLERAN error apa pun
  //           (termasuk 42703 kalau migration belum jalan di suatu env):
  //           jalur ini gagal sendirian, tidak menggagalkan seluruh
  //           pencarian (LESSONS #12).
  //        4) order_items.name_snapshot/code_snapshot cocok → order_id
  //        5) partner_staff.full_name cocok → partner_sales_staff_id
  //        6) order_documents.doc_number cocok → order_id (2026-08-31).
  //           ALUR NYATA owner: Kalkulator → Proposal → SO, lalu DO menyusul
  //           beberapa hari kemudian dan Invoice setelahnya. Yang dipegang
  //           orang kantor di hari kedua adalah SELEMBAR SO — dan nomor SO
  //           tidak pernah dicetak bersama order_number, jadi tanpa jalur ini
  //           tidak ada jalan kembali dari kertas itu ke pesanannya.
  //      Jalur 3/4/5/6 adalah PERLUASAN cakupan pencarian di atas jalur 1/2
  //      yang sudah ada — kegagalan salah satunya (RLS, tabel belum siap,
  //      dst.) TIDAK menggagalkan seluruh pencarian, hanya jalur itu yang
  //      diam-diam tidak menyumbang baris. Jalur 1/2 tetap mempertahankan
  //      perilaku lama: gagal = seluruh pencarian gagal (queryErr).
  //
  //      BENTUK EKSEKUSI (audit kecepatan 2026-08-29) — DUA gelombang, dulu
  //      empat. Yang benar-benar berantai cuma "cari id dulu, baru cari
  //      pesanannya": jalur 2/4/5 harus menunggu pencarian id
  //      customer/item/staf-nya sendiri. Sisanya tidak saling bergantung
  //      sama sekali dan dulu hanya kebetulan berurutan karena letaknya di
  //      dalam blok `else` satu sama lain:
  //        gelombang A (5 paralel): customers, order_number, customer_po,
  //          order_items, partner_staff;
  //        gelombang B (≤3 paralel): partner_orders by customer_id / by id
  //          (hasil item) / by partner_sales_staff_id.
  //      Konsekuensi yang disengaja: kalau jalur 1/2 gagal, empat query
  //      gelombang A yang lain TETAP terlanjur jalan dan hasilnya dibuang —
  //      lebih murah daripada satu perjalanan bolak-balik ekstra pada SETIAP
  //      pencarian yang sehat (kasus normal), dan tampilannya sama persis
  //      (queryErr → kartu error yang sama).
  let orderRows: OrderListRow[] = [];
  let productMatchCapped = false;

  if (!q) {
    // Filter kirim menyaring DI MEMORI (lihat SHIPPING_ORDER_SCAN_LIMIT), jadi
    // jendela yang diambil harus lebih lebar dari yang ditampilkan — kalau
    // tidak, menyaring 50 baris teratas bisa menyisakan 3 baris dan
    // menyembunyikan pesanan yang memenuhi syarat tepat di bawahnya.
    const fetchLimit = kirimFilter === "ALL" ? LIST_LIMIT : SHIPPING_ORDER_SCAN_LIMIT;
    const { data, error } = await ordersQuery().limit(fetchLimit);
    if (error) queryErr = error;
    else orderRows = (data ?? []) as OrderListRow[];
  } else {
    const likePattern = `%${likeEscape(q)}%`;

    // Jalur 2, langkah A: customer yang cocok (nama ATAU telepon setelah
    // dinormalisasi) — id-nya dipakai memfilter partner_orders di server,
    // bukan menarik semua baris lalu menyaring di sini (SPEC §75/§76).
    const normalizedPhone = normalizePhoneID(q);
    const custQuery = supabase.from("customers").select("id");

    // Jalur 4, langkah A: order_items.name_snapshot/code_snapshot — DUA
    // kolom tabel yang sama, jadi pakai catalogIlikeOrFilter (sudah
    // menangani escape + PostgREST-quote untuk `.or()`, LESSONS #40)
    // alih-alih dua query terpisah.
    const itemsOrFilter = catalogIlikeOrFilter(q, ["name_snapshot", "code_snapshot"]);
    let itemsQuery = supabase
      .from("order_items")
      .select("order_id")
      .order("created_at", { ascending: false })
      .limit(ORDER_ITEMS_SCAN_LIMIT);
    if (itemsOrFilter) itemsQuery = itemsQuery.or(itemsOrFilter);

    // ── Gelombang A: enam pencarian yang TIDAK saling bergantung.
    const [custRes, orderNumberRes, poRes, itemsRes, staffRes, docsRes] = await Promise.all([
      normalizedPhone
        ? custQuery.eq("phone_normalized", normalizedPhone).limit(LIST_LIMIT)
        : custQuery.ilike("full_name", likePattern).limit(LIST_LIMIT),
      // Jalur 1: order_number
      ordersQuery().ilike("order_number", likePattern).limit(LIST_LIMIT),
      // Jalur 3: customer_po (toleran — errornya tidak pernah naik ke queryErr)
      ordersQuery().ilike("customer_po", likePattern).limit(LIST_LIMIT),
      itemsQuery,
      // Jalur 5, langkah A: partner_staff.full_name → id staf.
      supabase.from("partner_staff").select("id").ilike("full_name", likePattern).limit(STAFF_MATCH_SCAN_LIMIT),
      // Jalur 6, langkah A: order_documents.doc_number → order_id. Toleran
      // seperti jalur 3/4/5 — kalau 0016 belum jalan di suatu env (42P01)
      // atau RLS menolak, jalur ini diam-diam tidak menyumbang baris dan
      // pencarian lain tetap utuh (LESSONS #12).
      supabase
        .from("order_documents")
        .select("order_id")
        .ilike("doc_number", likePattern)
        .limit(DOC_NUMBER_SCAN_LIMIT),
    ]);

    // Urutan pemeriksaan error dipertahankan seperti versi berurutan:
    // customers dulu, baru order_number, baru (di bawah) by-customer —
    // penting karena isMissingTableError(queryErr) memilih pesan layar.
    if (custRes.error) queryErr = custRes.error;
    else if (orderNumberRes.error) queryErr = orderNumberRes.error;

    if (!queryErr) {
      const matchedCustomerIds = (custRes.data ?? []).map((c: { id: string }) => c.id);

      let orderIdsFromItems: string[] = [];
      if (!itemsRes.error) {
        const itemRows = (itemsRes.data ?? []) as { order_id: string }[];
        productMatchCapped = itemRows.length >= ORDER_ITEMS_SCAN_LIMIT;
        orderIdsFromItems = Array.from(new Set(itemRows.map((r) => r.order_id)));
      }
      const orderIdsFromDocs = docsRes.error
        ? []
        : Array.from(
            new Set((docsRes.data ?? []).map((r: { order_id: string }) => r.order_id))
          );

      const staffIdsMatched = staffRes.error
        ? []
        : (staffRes.data ?? []).map((r: { id: string }) => r.id);

      // ── Gelombang B: empat lanjutan "id → pesanan". Saling independen —
      //    dulu jalur 4 dan 5 di-await berurutan tanpa alasan.
      const [byCustomerRes, byItemsRes, byStaffRes, byDocsRes] = await Promise.all([
        matchedCustomerIds.length > 0
          ? ordersQuery().in("customer_id", matchedCustomerIds).limit(LIST_LIMIT)
          : null,
        orderIdsFromItems.length > 0 ? ordersQuery().in("id", orderIdsFromItems).limit(LIST_LIMIT) : null,
        staffIdsMatched.length > 0
          ? ordersQuery().in("partner_sales_staff_id", staffIdsMatched).limit(LIST_LIMIT)
          : null,
        orderIdsFromDocs.length > 0 ? ordersQuery().in("id", orderIdsFromDocs).limit(LIST_LIMIT) : null,
      ]);

      // Jalur 2 tetap "gagal = seluruh pencarian gagal" (perilaku lama).
      if (byCustomerRes?.error) queryErr = byCustomerRes.error;

      if (!queryErr) {
        // Dedupe by id. Urutan penggabungan tidak penting: tiap jalur
        // memilih ORDER_COLS yang sama dari tabel yang sama, jadi baris
        // dengan id sama identik isinya.
        const byId = new Map<string, OrderListRow>();
        const merge = (rows: OrderListRow[] | null) =>
          (rows ?? []).forEach((row) => byId.set(row.id, row));
        merge((orderNumberRes.data ?? []) as OrderListRow[]);
        if (byCustomerRes) merge((byCustomerRes.data ?? []) as OrderListRow[]);
        // Jalur 3/4/5 toleran: error = tidak menyumbang baris, titik.
        if (!poRes.error) merge((poRes.data ?? []) as OrderListRow[]);
        if (byItemsRes && !byItemsRes.error) merge((byItemsRes.data ?? []) as OrderListRow[]);
        if (byStaffRes && !byStaffRes.error) merge((byStaffRes.data ?? []) as OrderListRow[]);
        if (byDocsRes && !byDocsRes.error) merge((byDocsRes.data ?? []) as OrderListRow[]);

        orderRows = Array.from(byId.values())
          .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
          .slice(0, LIST_LIMIT);
      }
    }
  }

  // ── 2b. Filter "Status Kirim" (2026-08-31) ──────────────────
  //
  // Dua himpunan id diambil terpisah, keduanya TOLERAN (LESSONS #12):
  //   - pesanan yang punya minimal satu DO  → order_documents (0016)
  //   - pesanan yang sudah diterima         → delivered_at (0023)
  // Kalau salah satu migrasinya belum jalan, filternya TIDAK diam-diam
  // mengosongkan daftar: ia dimatikan dan catatan kaki menjelaskannya.
  let shippingUnavailable = false;
  let shippingCapped = false;
  if (kirimFilter !== "ALL" && !queryErr) {
    const [doRes, deliveredRes] = await Promise.all([
      supabase
        .from("order_documents")
        .select("order_id")
        .eq("doc_type", "DO")
        .limit(SHIPPING_DOC_SCAN_LIMIT),
      supabase
        .from("partner_orders")
        .select("id")
        .not("delivered_at", "is", null)
        .limit(SHIPPING_DOC_SCAN_LIMIT),
    ]);

    if (doRes.error || deliveredRes.error) {
      shippingUnavailable = true;
    } else {
      const doRows = (doRes.data ?? []) as { order_id: string }[];
      const deliveredRows = (deliveredRes.data ?? []) as { id: string }[];
      shippingCapped =
        doRows.length >= SHIPPING_DOC_SCAN_LIMIT ||
        deliveredRows.length >= SHIPPING_DOC_SCAN_LIMIT ||
        orderRows.length >= SHIPPING_ORDER_SCAN_LIMIT;
      const hasDo = new Set(doRows.map((r) => r.order_id));
      const delivered = new Set(deliveredRows.map((r) => r.id));
      orderRows = orderRows.filter((r) => {
        if (delivered.has(r.id)) return kirimFilter === "DITERIMA";
        if (hasDo.has(r.id)) return kirimFilter === "SUDAH_DO";
        return kirimFilter === "BELUM_DO";
      });
    }
    orderRows = orderRows.slice(0, LIST_LIMIT);
  }

  // ── 3. Ambil nama Partner / Cabang / Sales / Customer untuk baris yang
  //      benar-benar tampil (bukan seluruh tabel) — pola yang sama dengan
  //      /admin (Map by id, bukan JOIN embed yang bergantung nama FK).
  const partnerIds = Array.from(new Set(orderRows.map((r) => r.partner_id)));
  const branchIds = Array.from(new Set(orderRows.map((r) => r.branch_id)));
  const staffIds = Array.from(
    new Set(orderRows.map((r) => r.partner_sales_staff_id).filter((v): v is string => !!v))
  );
  const customerIds = Array.from(new Set(orderRows.map((r) => r.customer_id)));

  let partnersMap = new Map<string, string>();
  let branchesMap = new Map<string, string>();
  let staffMap = new Map<string, string>();
  let customersMap = new Map<string, { full_name: string; phone_normalized: string }>();

  if (!queryErr && orderRows.length > 0) {
    const [
      { data: partnersData, error: partnersErr },
      { data: branchesData, error: branchesErr },
      { data: staffData, error: staffErr },
      { data: customersData, error: customersErr },
    ] = await Promise.all([
      supabase.from("partners").select("id, name").in("id", partnerIds),
      supabase.from("partner_branches").select("id, name").in("id", branchIds),
      staffIds.length > 0
        ? supabase.from("partner_staff").select("id, full_name").in("id", staffIds)
        : Promise.resolve({ data: [] as { id: string; full_name: string }[], error: null as QueryErr }),
      supabase.from("customers").select("id, full_name, phone_normalized").in("id", customerIds),
    ]);
    queryErr = partnersErr || branchesErr || staffErr || customersErr || null;
    if (!queryErr) {
      partnersMap = new Map((partnersData ?? []).map((p: { id: string; name: string }) => [p.id, p.name]));
      branchesMap = new Map((branchesData ?? []).map((b: { id: string; name: string }) => [b.id, b.name]));
      staffMap = new Map((staffData ?? []).map((s: { id: string; full_name: string }) => [s.id, s.full_name]));
      customersMap = new Map(
        (customersData ?? []).map((c: { id: string; full_name: string; phone_normalized: string }) => [
          c.id,
          { full_name: c.full_name, phone_normalized: c.phone_normalized },
        ])
      );
    }
  }

  // ── 4. Jalur (fulfillment_path, migration 0009 dikerjakan paralel) — SELALU
  //      diambil lewat query TERPISAH dari daftar utama supaya kolom yang
  //      belum ada (42703) tidak pernah bisa menggagalkan query utama itu
  //      sendiri (LESSONS #12). Kalau kolomnya tersedia, filter Jalur
  //      diterapkan di memori pada baris yang SUDAH diambil (bukan query DB
  //      baru dengan LIMIT-nya sendiri) — trade-off sengaja: baris yang cocok
  //      jalur tertentu tapi berada di luar 50 baris terbaru tidak akan
  //      muncul. Kalau kolom belum ada, filter dan kolom Jalur di tabel
  //      SAMA SEKALI tidak ditampilkan (bukan ditampilkan kosong).
  // Query ini SEKALIGUS menjadi probe keberadaan kolomnya sendiri (migrasi
  // 0009 sudah production-VERIFIED — probe .limit(1) terpisah yang dulu
  // mendahuluinya hanya menambah satu perjalanan bolak-balik, audit kecepatan
  // 2026-08-22 temuan #7): 42703 dari sini berarti kolom belum ada, dan
  // dijalankan juga saat daftar kosong supaya keputusan tampil/tidaknya
  // filter Jalur tetap sama seperti sebelumnya.
  let jalurAvailable = false;
  let jalurMap = new Map<string, FulfillmentPath | null>();
  if (!queryErr) {
    const { data: jalurData, error: jalurErr } = await supabase
      .from("partner_orders")
      .select("id, fulfillment_path")
      .in("id", orderRows.map((r) => r.id));
    if (jalurErr) {
      // Kolom belum ada (42703) ATAU query gagal — jangan biarkan jalurMap
      // kosong lalu diam-diam menyaring semua baris kalau ada filter Jalur
      // aktif (LESSONS #10). Jalur degradasinya satu dan sama:
      // kolom + filter Jalur disembunyikan semua, bukan ditampilkan kosong.
      jalurAvailable = false;
    } else {
      jalurAvailable = true;
      jalurMap = new Map(
        (jalurData ?? []).map((r: { id: string; fulfillment_path: FulfillmentPath | null }) => [
          r.id,
          r.fulfillment_path,
        ])
      );
    }
  }
  if (jalurAvailable && jalurFilter !== "ALL") {
    orderRows = orderRows.filter((r) => jalurMap.get(r.id) === jalurFilter);
  }

  // ── Degradasi: tabel belum ada = migration belum jalan, bukan error biasa
  //    dan BUKAN "0 pesanan" (LESSONS #9, #12, #10).
  if (isMissingTableError(queryErr)) {
    return (
      <div>
        <div className="worktop">
          <h1>{m.admin.navOrders}</h1>
        </div>
        <div className="card emptybox">{m.admin.ordersFeatureOff}</div>
      </div>
    );
  }

  return (
    <div>
      <div className="worktop">
        <h1>{m.admin.navOrders}</h1>
        {/* Satu-satunya pintu masuk v1 fitur "admin membuat pesanan atas nama
            cabang" — navigasi ke halaman sendiri (bukan modal seperti
            AddPartnerButton): formulirnya terlalu besar untuk modal. */}
        <Link href="/admin/orders/baru" className="btn primary">
          {m.admin.orderCreateBtn}
        </Link>
      </div>

      <form className="searchrow wide" action="/admin/orders" method="GET">
        <input
          type="search"
          name="q"
          placeholder={m.admin.ordersSearchPlaceholder}
          defaultValue={q}
          className="search-input"
        />
        <select name="status" defaultValue={statusFilter} className="filter-select">
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {jalurAvailable && (
          <select name="jalur" defaultValue={jalurFilter} className="filter-select">
            {JALUR_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
        {/* Status kirim — "mana yang belum dikirim hari ini" adalah pertanyaan
            harian, jadi filternya berdiri sejajar dengan Status dan Jalur,
            bukan bersembunyi di balik kata kunci. */}
        <select name="kirim" defaultValue={kirimFilter} className="filter-select">
          {KIRIM_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
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
      ) : orderRows.length === 0 ? (
        <div className="card emptybox">
          {q ? m.admin.ordersEmptyFiltered.replace("{q}", q) : m.admin.ordersEmpty}
        </div>
      ) : (
        <div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>{m.common.orderNumber}</th>
                  <th>{m.admin.colCustomer}</th>
                  <th>{m.common.partner}</th>
                  <th>{m.common.branch}</th>
                  <th>{m.common.package}</th>
                  <th>{m.admin.colSales}</th>
                  <th>{m.common.status}</th>
                  {jalurAvailable && <th>{m.admin.colFulfillment}</th>}
                  <th>{m.common.createdAt}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {orderRows.map((r) => {
                  const customer = customersMap.get(r.customer_id);
                  const jalurPath = jalurMap.get(r.id);
                  return (
                    <tr key={r.id}>
                      <td>
                        <Link href={`/admin/orders/${r.id}`} className="rowname" prefetch={false}>
                          <span className="code">{r.order_number}</span>
                        </Link>
                      </td>
                      <td>
                        <div>
                          <strong>{customer?.full_name ?? "—"}</strong>
                        </div>
                        <div className="small muted">
                          {customer ? displayPhoneID(customer.phone_normalized) : "—"}
                        </div>
                      </td>
                      <td>
                        <strong>{partnersMap.get(r.partner_id) ?? "—"}</strong>
                      </td>
                      <td>{branchesMap.get(r.branch_id) ?? "—"}</td>
                      <td>{r.package_name}</td>
                      <td>{r.partner_sales_staff_id ? staffMap.get(r.partner_sales_staff_id) ?? "—" : "—"}</td>
                      <td>
                        <span className={ORDER_STATUS_CHIP[r.status]}>
                          {orderStatusLabel(m, r.status)}
                        </span>
                      </td>
                      {jalurAvailable && (
                        <td>
                          {jalurPath ? (
                            <span className="chip accent">{fulfillmentLabel(m, jalurPath)}</span>
                          ) : (
                            "—"
                          )}
                        </td>
                      )}
                      <td className="small muted">
                        {formatDateTimeWIB(r.created_at, m.common.dateLocale)}
                      </td>
                      <td className="ta-right">
                        <Link href={`/admin/orders/${r.id}`} className="linkbtn" prefetch={false}>
                          {m.admin.openBtn}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="footnote">
            {m.admin.ordersShowingCount
              .replace("{n}", String(orderRows.length))
              .replace("{cap}", orderRows.length === LIST_LIMIT ? m.admin.ordersShowingCap : "")}
          </div>
          {q && productMatchCapped && <div className="footnote">{m.admin.ordersProductMatchCapped}</div>}
          {/* Batas pindaian filter kirim DIKATAKAN, bukan hasil terpotong yang
              terlihat lengkap (LESSONS #10). */}
          {kirimFilter !== "ALL" && shippingCapped && (
            <div className="footnote">{m.admin.ordersShippingCapped}</div>
          )}
          {kirimFilter !== "ALL" && shippingUnavailable && (
            <div className="footnote">{m.admin.ordersShippingUnavailable}</div>
          )}
        </div>
      )}
    </div>
  );
}
