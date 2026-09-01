import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  ORDER_STATUS_CHIP,
  displayPhoneID,
  formatDateTimeWIB,
  orderStatusLabel,
  type OrderStatus,
} from "@/lib/orders-shared";
import {
  CUSTOMER_PAYMENT_STATUS_CHIP,
  customerPaymentStatus,
  customerPaymentStatusLabel,
  type CustomerPaymentStatus,
} from "@/lib/payment-shared";
import { getAdminMessages } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * Detail satu pelanggan sisi ADMIN (/admin/pelanggan/[customerId]) —
 * 2026-09-01.
 *
 * KENAPA ADA: /admin/pelanggan hanya PERNAH jadi daftar — namanya bukan
 * tautan, jadi pertanyaan "pelanggan ini pernah pesan apa saja" tidak punya
 * jawaban di sisi admin sama sekali (sisi cabang sudah punya sejak SPEC
 * §52–53, lihat /cabang/pelanggan/[customerId]). Satu-satunya jalan sebelum
 * ini adalah mencari nama pelanggan di /admin/orders, yang menjawab
 * pertanyaan lain (daftar pesanan), bukan riwayat satu orang.
 *
 * PERBEDAAN SENGAJA dari halaman kembarannya di sisi cabang:
 *   1. TANPA tombol Ubah. Halaman cabang punya CustomerEditActions yang
 *      digerbang edit_scope; di sini tidak ada padanannya — v1 ini murni
 *      BACA. Menambah tulisan admin ke tabel customers adalah keputusan
 *      tersendiri (hak akses + audit), bukan efek samping halaman riwayat.
 *   2. Riwayat pesanan menyebut Partner + Cabang: admin melihat SEMUA
 *      partner, jadi "PT A · Cabang Bekasi" adalah keterangan yang membedakan
 *      — di sisi cabang, partnernya selalu partner sendiri.
 *   3. Ada kolom status bayar (0026) di tiap baris riwayat, sejalan dengan
 *      kolom yang sama di /admin/orders.
 *
 * Auth: layout /admin sudah menggerbang platform_admins; RLS `sp_admin_all`
 * tetap batas sesungguhnya (LESSONS #5). Halaman ini tidak menulis apa pun.
 */

type QueryErr = { code?: string; message?: string } | null;

function isMissingColumnErr(err: QueryErr): boolean {
  return !!err && err.code === "42703";
}

type CustomerDetailRow = {
  id: string;
  full_name: string;
  phone: string;
  phone_normalized: string;
  whatsapp: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  notes: string | null;
  created_at: string;
  created_via_partner_id: string | null;
  created_via_branch_id: string | null;
  customer_code: string | null;
  source_id: string | null;
  sales_staff_id: string | null;
};

/** Kolom yang PASTI ada sejak tabel customers lahir (0004). */
const NARROW_COLS =
  "id, full_name, phone, phone_normalized, whatsapp, address, city, province, notes, created_at, " +
  "created_via_partner_id, created_via_branch_id";
/** + kolom 0017/0018/0019 yang bisa saja belum dimigrasikan (LESSONS #12). */
const WIDE_COLS = `${NARROW_COLS}, customer_code, source_id, sales_staff_id`;

type OrderHistoryRow = {
  id: string;
  order_number: string;
  package_name: string;
  status: OrderStatus;
  created_at: string;
  partner_id: string;
  branch_id: string;
};

/** Riwayat satu pelanggan — sama seperti sisi cabang, dibatasi 50 baris
 *  terbaru. Kalau tersentuh, catatan kakinya WAJIB tampil (LESSONS #10). */
const ORDER_HISTORY_LIMIT = 50;

export default async function AdminPelangganDetailPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const m = await getAdminMessages();
  const { customerId } = await params;
  const supabase = await createClient();

  // Pola SELECT lebar → sempit yang sama dengan /admin/pelanggan dan
  // /cabang/pelanggan/[customerId]: kalau 0017/0018/0019 belum jalan,
  // halaman ini TETAP tampil tanpa kode/sumber/sales, bukan gagal total.
  async function fetchCustomer(): Promise<{ data: CustomerDetailRow | null; error: QueryErr }> {
    const wide = await supabase.from("customers").select(WIDE_COLS).eq("id", customerId).maybeSingle();
    if (wide.error && isMissingColumnErr(wide.error)) {
      const narrow = await supabase.from("customers").select(NARROW_COLS).eq("id", customerId).maybeSingle();
      return {
        error: narrow.error,
        data: narrow.data
          ? ({
              ...(narrow.data as unknown as Record<string, unknown>),
              customer_code: null,
              source_id: null,
              sales_staff_id: null,
            } as unknown as CustomerDetailRow)
          : null,
      };
    }
    return { error: wide.error, data: wide.data as unknown as CustomerDetailRow | null };
  }

  // Detail pelanggan dan riwayat pesanannya tidak saling bergantung (keduanya
  // hanya butuh customerId dari rute) — satu gelombang, bukan berurutan.
  const [{ data: customer, error: customerErr }, { data: orderData, error: ordersErr }] = await Promise.all([
    fetchCustomer(),
    supabase
      .from("partner_orders")
      .select("id, order_number, package_name, status, created_at, partner_id, branch_id")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(ORDER_HISTORY_LIMIT),
  ]);

  if (customerErr) {
    return (
      <div>
        <div className="crumb">
          <Link href="/admin/pelanggan">{m.common.customer}</Link>
        </div>
        <div className="card" style={{ margin: 0 }}>
          <div className="err">{m.common.errorLoad}</div>
        </div>
      </div>
    );
  }
  if (!customer) notFound();

  // Gagal membaca riwayat ≠ "belum ada pesanan" (LESSONS #10) — dibedakan
  // sampai ke layar, bukan dilebur jadi daftar kosong.
  const orders = ordersErr ? null : ((orderData ?? []) as OrderHistoryRow[]);
  const historyCapped = orders !== null && orders.length >= ORDER_HISTORY_LIMIT;

  // Nama partner/cabang/sumber/sales untuk baris yang benar-benar tampil —
  // Map by id, bukan embed PostgREST (pola yang sama dengan /admin/orders;
  // partner_orders punya DUA FK ke tabel partner, LESSONS #24).
  const partnerIds = Array.from(new Set((orders ?? []).map((o) => o.partner_id)));
  const branchIds = Array.from(new Set((orders ?? []).map((o) => o.branch_id)));
  if (customer.created_via_partner_id && !partnerIds.includes(customer.created_via_partner_id)) {
    partnerIds.push(customer.created_via_partner_id);
  }
  if (customer.created_via_branch_id && !branchIds.includes(customer.created_via_branch_id)) {
    branchIds.push(customer.created_via_branch_id);
  }

  const [partnersRes, branchesRes, sourceRes, salesRes, payRes] = await Promise.all([
    partnerIds.length > 0
      ? supabase.from("partners").select("id, name").in("id", partnerIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[], error: null as QueryErr }),
    branchIds.length > 0
      ? supabase.from("partner_branches").select("id, name").in("id", branchIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[], error: null as QueryErr }),
    // Sumber & sales TOLERAN: tabelnya milik 0018. Gagal = barisnya tidak
    // ditampilkan, bukan halaman gagal.
    customer.source_id
      ? supabase.from("customer_sources").select("label").eq("id", customer.source_id).maybeSingle()
      : Promise.resolve({ data: null as { label: string } | null, error: null as QueryErr }),
    customer.sales_staff_id
      ? supabase.from("sanci_sales_staff").select("name").eq("id", customer.sales_staff_id).maybeSingle()
      : Promise.resolve({ data: null as { name: string } | null, error: null as QueryErr }),
    // Status bayar (0026) — query TERPISAH dan toleran, persis seperti di
    // /admin/orders: kalau kolomnya belum ada, kolom Bayar TIDAK ditampilkan
    // sama sekali (bukan ditampilkan kosong, yang terbaca "belum bayar").
    orders && orders.length > 0
      ? supabase
          .from("partner_orders")
          .select("id, customer_total_amount, customer_paid_amount")
          .in("id", orders.map((o) => o.id))
      : Promise.resolve({
          data: [] as { id: string; customer_total_amount: number | null; customer_paid_amount: number | null }[],
          error: null as QueryErr,
        }),
  ]);

  const partnersMap = new Map(((partnersRes.data ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
  const branchesMap = new Map(((branchesRes.data ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));
  const sourceLabel = sourceRes.error ? null : (sourceRes.data as { label: string } | null)?.label ?? null;
  const salesName = salesRes.error ? null : (salesRes.data as { name: string } | null)?.name ?? null;

  const bayarAvailable = !payRes.error;
  const bayarMap = new Map<string, CustomerPaymentStatus>();
  if (bayarAvailable) {
    for (const r of (payRes.data ?? []) as {
      id: string;
      customer_total_amount: number | null;
      customer_paid_amount: number | null;
    }[]) {
      bayarMap.set(r.id, customerPaymentStatus(r.customer_total_amount, r.customer_paid_amount ?? 0));
    }
  }

  const createdVia = !customer.created_via_partner_id
    ? m.admin.customerCreatedViaSanci
    : (() => {
        const partnerName =
          partnersMap.get(customer.created_via_partner_id) ?? m.admin.customerCreatedViaUnknownPartner;
        const branchName = customer.created_via_branch_id
          ? branchesMap.get(customer.created_via_branch_id)
          : undefined;
        return branchName ? `${partnerName} · ${branchName}` : partnerName;
      })();

  return (
    <div>
      <div className="crumb">
        <Link href="/admin/pelanggan">{m.common.customer}</Link> / {customer.full_name}
      </div>
      <div className="pagehead">
        <h1>{customer.full_name}</h1>
      </div>

      <div className="card">
        <dl className="kv">
          {customer.customer_code && (
            <>
              <dt>{m.common.code}</dt>
              <dd>
                <span className="code">{customer.customer_code}</span>
              </dd>
            </>
          )}
          <dt>{m.common.phone}</dt>
          <dd>{displayPhoneID(customer.phone_normalized)}</dd>
          <dt>{m.common.whatsapp}</dt>
          <dd>{customer.whatsapp || "—"}</dd>
          <dt>{m.common.address}</dt>
          <dd>{customer.address || "—"}</dd>
          <dt>{m.common.city}</dt>
          <dd>{customer.city || "—"}</dd>
          <dt>{m.common.province}</dt>
          <dd>{customer.province || "—"}</dd>
          <dt>{m.common.notes}</dt>
          <dd>{customer.notes || "—"}</dd>
          {(sourceLabel || salesName) && (
            <>
              <dt>{m.admin.customerColSourceSales}</dt>
              <dd>
                {sourceLabel || "—"} · {salesName || "—"}
              </dd>
            </>
          )}
          <dt>{m.admin.customerColCreatedVia}</dt>
          <dd>{createdVia}</dd>
          <dt>{m.common.createdAt}</dt>
          <dd>{formatDateTimeWIB(customer.created_at, m.common.dateLocale)}</dd>
        </dl>
      </div>

      <div className="overline">{m.common.orderHistoryTitle}</div>
      {orders === null ? (
        <div className="card" style={{ margin: 0 }}>
          <div className="err">{m.common.errorLoad}</div>
        </div>
      ) : orders.length === 0 ? (
        <div className="card emptybox">{m.common.noOrdersForCustomer}</div>
      ) : (
        <div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>{m.common.orderNumber}</th>
                  <th>{m.common.partner}</th>
                  <th>{m.common.branch}</th>
                  <th>{m.common.package}</th>
                  <th>{m.common.status}</th>
                  {bayarAvailable && <th>{m.common.customerPaymentStatus}</th>}
                  <th>{m.common.createdAt}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const bayarStatus = bayarMap.get(o.id);
                  return (
                    <tr key={o.id}>
                      <td>
                        <Link href={`/admin/orders/${o.id}`} className="rowname" prefetch={false}>
                          <span className="code">{o.order_number}</span>
                        </Link>
                      </td>
                      <td>
                        <strong>{partnersMap.get(o.partner_id) ?? "—"}</strong>
                      </td>
                      <td>{branchesMap.get(o.branch_id) ?? "—"}</td>
                      <td>{o.package_name}</td>
                      <td>
                        <span className={ORDER_STATUS_CHIP[o.status]}>{orderStatusLabel(m, o.status)}</span>
                      </td>
                      {bayarAvailable && (
                        <td>
                          {bayarStatus ? (
                            <span className={CUSTOMER_PAYMENT_STATUS_CHIP[bayarStatus]}>
                              {customerPaymentStatusLabel(m, bayarStatus)}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                      )}
                      <td className="small muted">{formatDateTimeWIB(o.created_at, m.common.dateLocale)}</td>
                      <td className="ta-right">
                        <Link href={`/admin/orders/${o.id}`} className="linkbtn" prefetch={false}>
                          {m.admin.openBtn}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {historyCapped && <div className="footnote">{m.admin.customerHistoryCapped}</div>}
        </div>
      )}
    </div>
  );
}
