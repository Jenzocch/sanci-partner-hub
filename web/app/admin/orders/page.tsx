import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  FULFILLMENT_PATH_LABEL,
  ORDER_STATUS_LABEL,
  displayPhoneID,
  isMissingTableError,
  normalizePhoneID,
  type FulfillmentPath,
  type OrderStatus,
} from "@/lib/orders-shared";

export const dynamic = "force-dynamic";

const LIST_LIMIT = 50;

const STATUS_OPTIONS: { value: "ALL" | OrderStatus; label: string }[] = [
  { value: "ALL", label: "Status: semua" },
  { value: "REGISTERED", label: ORDER_STATUS_LABEL.REGISTERED },
  { value: "CANCELLED", label: ORDER_STATUS_LABEL.CANCELLED },
];

const JALUR_OPTIONS: { value: "ALL" | FulfillmentPath; label: string }[] = [
  { value: "ALL", label: "Jalur: semua" },
  { value: "DIRECT_DELIVERY", label: FULFILLMENT_PATH_LABEL.DIRECT_DELIVERY },
  { value: "SHOWROOM_VISIT", label: FULFILLMENT_PATH_LABEL.SHOWROOM_VISIT },
];

const ORDER_COLS =
  "id, order_number, customer_id, partner_id, branch_id, partner_sales_staff_id, package_name, status, created_at";

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
  searchParams: Promise<{ q?: string; status?: string; jalur?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q || "").trim();
  const statusFilter: "ALL" | OrderStatus =
    sp.status === "REGISTERED" || sp.status === "CANCELLED" ? sp.status : "ALL";
  const jalurFilter: "ALL" | FulfillmentPath =
    sp.jalur === "DIRECT_DELIVERY" || sp.jalur === "SHOWROOM_VISIT" ? sp.jalur : "ALL";

  const supabase = await createClient();

  // ── 1. Kalau ada kata kunci, cari dulu customer yang cocok (nama atau
  //      telepon setelah dinormalisasi) — hasilnya dipakai untuk memfilter
  //      partner_orders di server, bukan menarik semua baris lalu menyaring
  //      di sini (SPEC §75/§76).
  let matchedCustomerIds: string[] = [];
  let queryErr: QueryErr = null;

  if (q) {
    const normalizedPhone = normalizePhoneID(q);
    const custQuery = supabase.from("customers").select("id");
    const { data: custRows, error: custErr } = normalizedPhone
      ? await custQuery.eq("phone_normalized", normalizedPhone).limit(LIST_LIMIT)
      : await custQuery.ilike("full_name", `%${q}%`).limit(LIST_LIMIT);
    if (custErr) {
      queryErr = custErr;
    } else {
      matchedCustomerIds = (custRows ?? []).map((c: { id: string }) => c.id);
    }
  }

  // ── 2. Ambil partner_orders — difilter status di server, dan (kalau ada
  //      kata kunci) digabung dari dua pencarian: order_number cocok, atau
  //      customer_id ada di hasil langkah 1.
  let orderRows: OrderListRow[] = [];

  if (!queryErr) {
    if (!q) {
      let query = supabase
        .from("partner_orders")
        .select(ORDER_COLS)
        .order("created_at", { ascending: false });
      if (statusFilter !== "ALL") query = query.eq("status", statusFilter);
      const { data, error } = await query.limit(LIST_LIMIT);
      if (error) queryErr = error;
      else orderRows = (data ?? []) as OrderListRow[];
    } else {
      let orderNumberQuery = supabase
        .from("partner_orders")
        .select(ORDER_COLS)
        .ilike("order_number", `%${q}%`)
        .order("created_at", { ascending: false });
      if (statusFilter !== "ALL") orderNumberQuery = orderNumberQuery.eq("status", statusFilter);
      const jobs = [orderNumberQuery.limit(LIST_LIMIT)];

      if (matchedCustomerIds.length > 0) {
        let byCustomerQuery = supabase
          .from("partner_orders")
          .select(ORDER_COLS)
          .in("customer_id", matchedCustomerIds)
          .order("created_at", { ascending: false });
        if (statusFilter !== "ALL") byCustomerQuery = byCustomerQuery.eq("status", statusFilter);
        jobs.push(byCustomerQuery.limit(LIST_LIMIT));
      }
      const results = await Promise.all(jobs);
      const firstError = results.find((r) => r.error)?.error;
      if (firstError) {
        queryErr = firstError;
      } else {
        const byId = new Map<string, OrderListRow>();
        results.forEach((r) => (r.data ?? []).forEach((row: OrderListRow) => byId.set(row.id, row)));
        orderRows = Array.from(byId.values())
          .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
          .slice(0, LIST_LIMIT);
      }
    }
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
  let jalurAvailable = false;
  if (!queryErr) {
    const { error: jalurProbeErr } = await supabase.from("partner_orders").select("fulfillment_path").limit(1);
    jalurAvailable = !jalurProbeErr;
  }

  let jalurMap = new Map<string, FulfillmentPath | null>();
  if (jalurAvailable && orderRows.length > 0) {
    const { data: jalurData } = await supabase
      .from("partner_orders")
      .select("id, fulfillment_path")
      .in("id", orderRows.map((r) => r.id));
    jalurMap = new Map(
      (jalurData ?? []).map((r: { id: string; fulfillment_path: FulfillmentPath | null }) => [
        r.id,
        r.fulfillment_path,
      ])
    );
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
          <h1>Pesanan Partner</h1>
        </div>
        <div className="card emptybox">
          Fitur pesanan belum aktif — migration database belum dijalankan.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="worktop">
        <h1>Pesanan Partner</h1>
      </div>

      <form className="searchrow wide" action="/admin/orders" method="GET">
        <input
          type="search"
          name="q"
          placeholder="Cari nomor pesanan / nama customer / telepon…"
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
        <button className="btn" type="submit">
          Cari
        </button>
      </form>

      {queryErr ? (
        <div className="card" style={{ margin: 0 }}>
          <div className="err">Daftar pesanan gagal dimuat. Muat ulang halaman untuk mencoba lagi.</div>
        </div>
      ) : orderRows.length === 0 ? (
        <div className="card emptybox">
          {q ? `Tidak ada pesanan yang cocok dengan "${q}".` : "Belum ada pesanan."}
        </div>
      ) : (
        <div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Nomor Pesanan</th>
                  <th>Customer</th>
                  <th>Partner</th>
                  <th>Cabang</th>
                  <th>Paket</th>
                  <th>Sales</th>
                  <th>Status</th>
                  {jalurAvailable && <th>Jalur</th>}
                  <th>Dibuat</th>
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
                        <Link href={`/admin/orders/${r.id}`} className="rowname">
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
                        <span className={`chip ${r.status === "REGISTERED" ? "ACTIVE" : "SUSPENDED"}`}>
                          {ORDER_STATUS_LABEL[r.status]}
                        </span>
                      </td>
                      {jalurAvailable && (
                        <td>
                          {jalurPath ? (
                            <span className="chip accent">{FULFILLMENT_PATH_LABEL[jalurPath]}</span>
                          ) : (
                            "—"
                          )}
                        </td>
                      )}
                      <td className="small muted">
                        {new Date(r.created_at).toLocaleString("id-ID")}
                      </td>
                      <td className="ta-right">
                        <Link href={`/admin/orders/${r.id}`} className="linkbtn">
                          Buka
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="footnote">
            Menampilkan {orderRows.length} terbaru{orderRows.length === LIST_LIMIT ? " (maks. 50)" : ""}.
          </div>
        </div>
      )}
    </div>
  );
}
