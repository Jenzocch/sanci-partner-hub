import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  displayPhoneID,
  formatIDR,
  isMissingTableError,
  fulfillmentLabel,
  type FulfillmentPath,
} from "@/lib/orders-shared";
import { getCabangMessages } from "@/lib/i18n";
import StatusBadge from "../status-badge";
import OrderDetailActions, { type PackageOption, type StaffOption } from "./order-detail-actions";
import InvoiceSection from "./invoice-section";
import OrderItemsSection, { type OrderItemRow } from "./order-items-section";
import OfferSection from "./offer-section";

export const dynamic = "force-dynamic";

type One<T> = T | T[] | null;
function one<T>(v: One<T>): T | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

type OrderDetailRow = {
  id: string;
  order_number: string;
  package_name: string;
  status: "REGISTERED" | "CANCELLED";
  notes: string | null;
  created_at: string;
  branch_id: string;
  partner_id: string;
  partner_sales_staff_id: string | null;
  partner_pic_staff_id: string | null;
  customers: One<{ full_name: string; phone_normalized: string; whatsapp: string | null }>;
  partner_branches: One<{ name: string }>;
  partners: One<{ name: string; code: string }>;
  sales: One<{ full_name: string; status: string }>;
  pic: One<{ full_name: string; status: string }>;
};

type Assignment = { staff_id: string; role: string };

/**
 * cancelled_at/cancellation_reason (migration 0005) dibaca TERPISAH dari query
 * utama: kalau kolomnya belum ada (42703 — kode belum diikuti migrasi, LESSONS
 * #12), halaman detail tetap harus bisa dibuka, bukan malah ikut gagal total
 * hanya karena info pembatalan belum tersedia.
 */
type CancelInfo = { cancelled_at: string | null; cancellation_reason: string | null };
async function fetchCancelInfo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderId: string
): Promise<{ info: CancelInfo | null; unavailable: boolean }> {
  const { data, error } = await supabase
    .from("partner_orders")
    .select("cancelled_at, cancellation_reason")
    .eq("id", orderId)
    .maybeSingle();
  if (error) {
    return { info: null, unavailable: error.code === "42703" };
  }
  return { info: (data as CancelInfo | null) ?? null, unavailable: false };
}

/**
 * package_id (migration 0008) dibaca TERPISAH dari query utama untuk alasan
 * yang sama dengan fetchCancelInfo di atas: kalau kolomnya belum ada, halaman
 * detail tetap harus bisa dibuka (LESSONS #12).
 */
async function fetchOrderPackageId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("partner_orders")
    .select("package_id")
    .eq("id", orderId)
    .maybeSingle();
  if (error) return null;
  return (data as { package_id: string | null } | null)?.package_id ?? null;
}

/**
 * fulfillment_path / partner_purchase_amount / invoice_url / customer_arrived_at
 * (migration 0009) dibaca TERPISAH dari query utama untuk alasan yang sama
 * dengan fetchCancelInfo/fetchOrderPackageId di atas: kolom belum ada →
 * fitur ini disembunyikan diam-diam, halaman tetap harus bisa dibuka
 * (LESSONS #12). Keempat kolom ditambahkan migrasi yang sama, jadi dibaca
 * dalam satu query saja.
 *
 * Tiga status, BUKAN dua (LESSONS #10 — error DB ≠ "fitur belum aktif"):
 *   - "ok"             → kolom ada, data terbaca normal.
 *   - "missing-column" → 42703, migrasi memang belum jalan — sembunyikan
 *                         bagian ini diam-diam, ini keadaan transisi wajar.
 *   - "error"          → error LAIN (RLS berubah, timeout, koneksi putus) —
 *                         TIDAK boleh disamarkan jadi "belum aktif"; halaman
 *                         harus bilang "gagal dimuat" + jalan untuk coba lagi.
 */
type OrderExtras = {
  fulfillmentPath: FulfillmentPath | null;
  purchaseAmount: number | null;
  invoiceUrl: string | null;
  customerArrivedAt: string | null;
};
const EMPTY_EXTRAS: OrderExtras = {
  fulfillmentPath: null,
  purchaseAmount: null,
  invoiceUrl: null,
  customerArrivedAt: null,
};
type OrderExtrasState = "ok" | "missing-column" | "error";
async function fetchOrderExtras(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderId: string
): Promise<{ extras: OrderExtras; state: OrderExtrasState }> {
  const { data, error } = await supabase
    .from("partner_orders")
    .select("fulfillment_path, partner_purchase_amount, invoice_url, customer_arrived_at")
    .eq("id", orderId)
    .maybeSingle();
  if (error) {
    return { extras: EMPTY_EXTRAS, state: error.code === "42703" ? "missing-column" : "error" };
  }
  const row = data as {
    fulfillment_path: FulfillmentPath | null;
    partner_purchase_amount: number | null;
    invoice_url: string | null;
    customer_arrived_at: string | null;
  } | null;
  return {
    extras: {
      fulfillmentPath: row?.fulfillment_path ?? null,
      purchaseAmount: row?.partner_purchase_amount ?? null,
      invoiceUrl: row?.invoice_url ?? null,
      customerArrivedAt: row?.customer_arrived_at ?? null,
    },
    state: "ok",
  };
}

/**
 * shipping_address (migrasi 0014) dibaca TERPISAH — kolomnya bisa saja
 * belum ada (LESSONS #12).
 */
async function fetchShippingAddress(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderId: string
): Promise<{ status: "ok"; data: string | null } | { status: "missing-column" } | { status: "error" }> {
  const { data, error } = await supabase
    .from("partner_orders")
    .select("shipping_address")
    .eq("id", orderId)
    .maybeSingle();
  if (error) return { status: error.code === "42703" ? "missing-column" : "error" };
  return { status: "ok", data: (data as { shipping_address: string | null } | null)?.shipping_address ?? null };
}

/**
 * order_items (migrasi 0014) — tabel BARU, degradasi lewat 42P01 (LESSONS
 * #12), sama pola dengan InvoiceSection/OrderDetailActions extras.
 */
async function fetchOrderItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderId: string
): Promise<{ items: OrderItemRow[]; unavailable: boolean }> {
  const { data, error } = await supabase
    .from("order_items")
    .select("id, name_snapshot, code_snapshot, quantity, note, color_code, custom_size")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });
  if (error) return { items: [], unavailable: error.code === "42P01" };
  return { items: (data ?? []) as OrderItemRow[], unavailable: false };
}

/**
 * Penawaran SANCI (order_sanci_offers, migrasi 0013 + 0014 + 0015) dari sisi
 * cabang. RLS (oso_partner_read, 0014) sudah menegakkan can_view_offer —
 * kalau flag itu mati atau baris memang belum ada, query ini SENDIRINYA
 * mengembalikan 0 baris; halaman tidak perlu memeriksa flag untuk MEMUTUSKAN
 * apakah boleh membaca, hanya untuk memutuskan apakah boleh MENAMPILKAN
 * kartu ini sama sekali (fail-closed ganda: RLS di database, kartu di sini).
 *
 * Pola degradasi kolom SAMA dengan fetchOrderOffer di halaman admin: coba
 * SELECT lebar (termasuk kolom 0015) dulu, turun ke SELECT sempit kalau
 * 42703 (0015 belum jalan tapi 0013/0014 sudah).
 */
async function fetchOrderOfferCabang(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderId: string
): Promise<{
  amount: number | null;
  dpAmount: number | null;
  paymentCondition: string | null;
  discountPcts: number[];
  markupPct: number | null;
  cashDiscount: number;
  finalAmount: number | null;
}> {
  const EMPTY = {
    amount: null,
    dpAmount: null,
    paymentCondition: null,
    discountPcts: [] as number[],
    markupPct: null,
    cashDiscount: 0,
    finalAmount: null,
  };
  const wide = await supabase
    .from("order_sanci_offers")
    .select("amount, dp_amount, payment_condition, discount_pcts, markup_pct, cash_discount, final_amount")
    .eq("order_id", orderId)
    .maybeSingle();
  if (!wide.error) {
    const row = wide.data as {
      amount: number | string;
      dp_amount: number | string;
      payment_condition: string | null;
      discount_pcts: number[] | null;
      markup_pct: number | string | null;
      cash_discount: number | string;
      final_amount: number | string;
    } | null;
    if (!row) return EMPTY;
    return {
      amount: Number(row.amount),
      dpAmount: Number(row.dp_amount),
      paymentCondition: row.payment_condition,
      discountPcts: (row.discount_pcts ?? []).map(Number),
      markupPct: row.markup_pct == null ? null : Number(row.markup_pct),
      cashDiscount: Number(row.cash_discount ?? 0),
      finalAmount: Number(row.final_amount ?? row.amount),
    };
  }
  if (wide.error.code !== "42703") return EMPTY;
  const narrow = await supabase
    .from("order_sanci_offers")
    .select("amount, dp_amount, payment_condition")
    .eq("order_id", orderId)
    .maybeSingle();
  if (narrow.error) return EMPTY;
  const row = narrow.data as { amount: number | string; dp_amount: number | string; payment_condition: string | null } | null;
  if (!row) return EMPTY;
  const amount = Number(row.amount);
  return {
    amount,
    dpAmount: Number(row.dp_amount),
    paymentCondition: row.payment_condition,
    discountPcts: [],
    markupPct: null,
    cashDiscount: 0,
    finalAmount: amount,
  };
}

export default async function PesananDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const m = await getCabangMessages();
  const { orderId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  // edit_scope diambil terpisah — tidak ada FK partner_users →
  // partner_access_policies, embed langsung ditolak PostgREST saat runtime.
  const { data: pu, error: puError } = await supabase
    .from("partner_users")
    .select("branch_id, partner_id")
    .maybeSingle();
  // maybeSingle() error di sini biasanya berarti lebih dari satu baris cocok —
  // terjadi kalau akun SANCI Admin (RLS-nya melihat SEMUA partner_users) membuka
  // URL /cabang/* langsung tanpa lewat halaman login (LESSONS #24 sepupu).
  if (puError) {
    return (
      <main className="pwrap">
        <div className="card">
          <div className="err">{m.cabang.errAccountLoad}</div>
        </div>
      </main>
    );
  }
  if (!pu) redirect("/");

  const puPolicyPromise = supabase
    .from("partner_access_policies")
    .select("edit_scope")
    .eq("partner_id", pu.partner_id)
    .maybeSingle();

  // can_view_offer/can_edit_offer (0014) + can_discount (0015) — SELECT
  // TERPISAH dari puPolicy di atas: 0015 bisa saja belum jalan sementara
  // edit_scope (0001) tentu sudah, jadi menggabungkannya akan membuat 42703
  // dari can_discount menggagalkan pembacaan edit_scope juga (LESSONS #12).
  // Dicoba DENGAN can_discount dulu; ditolak 42703 KHUSUS kolom itu → ulang
  // TANPA can_discount (0014 sudah jalan, 0015 belum — dua flag lama tetap
  // harus terbaca).
  // `pu` sudah dipastikan non-null di atas (`if (!pu) redirect("/")`), tapi
  // TypeScript tidak menyimpan penyempitan itu ke DALAM sebuah nested function
  // declaration (closure) — nilainya ditangkap ke const TERPISAH di sini
  // supaya narrowing-nya tidak hilang di fetchOfferFlags() di bawah.
  const partnerIdForOfferFlags = pu.partner_id;
  async function fetchOfferFlags(): Promise<{ canViewOffer: boolean; canEditOffer: boolean; canDiscount: boolean }> {
    const wide = await supabase
      .from("partner_access_policies")
      .select("can_view_offer, can_edit_offer, can_discount")
      .eq("partner_id", partnerIdForOfferFlags)
      .maybeSingle();
    if (!wide.error) {
      const row = wide.data as { can_view_offer: boolean; can_edit_offer: boolean; can_discount: boolean } | null;
      return {
        canViewOffer: row?.can_view_offer ?? false,
        canEditOffer: row?.can_edit_offer ?? false,
        canDiscount: row?.can_discount ?? false,
      };
    }
    const narrow = await supabase
      .from("partner_access_policies")
      .select("can_view_offer, can_edit_offer")
      .eq("partner_id", partnerIdForOfferFlags)
      .maybeSingle();
    const row = narrow.data as { can_view_offer: boolean; can_edit_offer: boolean } | null;
    return { canViewOffer: row?.can_view_offer ?? false, canEditOffer: row?.can_edit_offer ?? false, canDiscount: false };
  }
  // Kedua pembacaan kebijakan di atas menyentuh TABEL dan BARIS yang sama
  // (partner_access_policies untuk partner ini) dan tidak saling bergantung —
  // dipisah hanya supaya 42703 dari can_discount tidak ikut menjatuhkan
  // edit_scope. Query utama order hanya butuh orderId (param rute), jadi ikut
  // gelombang yang sama — RLS pada partner_orders membatasi baris: order di
  // cabang yang tidak boleh dilihat pengguna ini tidak akan pernah muncul di
  // sini. Ketiganya dijalankan berbarengan, bukan berurutan (audit kecepatan
  // 2026-08-22, temuan #6).
  const [{ data: puPolicy }, offerFlags, { data, error }] = await Promise.all([
    puPolicyPromise,
    fetchOfferFlags(),
    supabase
      .from("partner_orders")
      .select(
        "id, order_number, package_name, status, notes, created_at, branch_id, partner_id, " +
          "partner_sales_staff_id, partner_pic_staff_id, " +
          "customers:customer_id(full_name, phone_normalized, whatsapp), " +
          "partner_branches:branch_id(name), partners:partner_id(name, code), " +
          "sales:partner_sales_staff_id(full_name, status), pic:partner_pic_staff_id(full_name, status)"
      )
      .eq("id", orderId)
      .maybeSingle(),
  ]);

  if (error) {
    if (isMissingTableError(error)) {
      return (
        <main className="pwrap">
          <div className="card">
            <div className="banner bad">{m.cabang.errOrderModuleInactive}</div>
          </div>
        </main>
      );
    }
    return (
      <main className="pwrap">
        <div className="card">
          <div className="err">{m.cabang.errOrderDetailLoadFailed}</div>
          <Link href={`/cabang/pesanan/${orderId}`} className="btn sm">
            {m.common.retry}
          </Link>
        </div>
      </main>
    );
  }
  if (!data) notFound();

  const order = data as unknown as OrderDetailRow;
  const customer = one(order.customers);
  const branch = one(order.partner_branches);
  const partner = one(order.partners);
  const sales = one(order.sales);
  const pic = one(order.pic);
  const isOtherBranch = order.branch_id !== pu.branch_id;

  // Pola sama seperti /cabang/staff/[branchId]: edit_scope menentukan boleh/
  // tidaknya mengubah cabang LAIN. Cabang sendiri selalu boleh.
  const canEditBranch = !isOtherBranch || puPolicy?.edit_scope === "PARTNER_ALL_BRANCHES";
  // Tombol Ubah/Batalkan hanya untuk order yang masih REGISTERED — order yang
  // sudah dibatalkan seluruhnya read-only (dipaksa DB juga, tapi jangan
  // menggambar tombol yang tidak akan berhasil dipakai).
  const canManage = canEditBranch && order.status === "REGISTERED";

  // Semua pembacaan sisa halaman hanya butuh order.id/partner_id/branch_id —
  // yang sudah diketahui sejak query utama di atas. Dulu mereka berjalan
  // sebagai EMPAT tahap berurutan (extras → blok canManage → cancelInfo →
  // shipping/items/offer); urutannya cuma akibat tata letak kode, bukan
  // ketergantungan data. Digabung jadi SATU gelombang: 4 perjalanan
  // bolak-balik ke Supabase menjadi 1, di halaman yang paling sering dibuka
  // staf cabang lewat jaringan seluler.
  const [
    extrasResult,
    manageData,
    cancelResult,
    shippingResult,
    itemsResult,
    offerData,
  ] = await Promise.all([
    fetchOrderExtras(supabase, order.id),
    // Staf untuk dropdown Sales/PIC diambil dari CABANG PESANAN (bisa beda dari
    // cabang login saat PARTNER_ALL_BRANCHES mengubah order cabang lain) — bukan
    // cabang pengguna sendiri (SPEC menuntut ini secara eksplisit).
    canManage
      ? Promise.all([
          supabase.from("partner_staff").select("id, full_name, status").eq("partner_id", order.partner_id),
          supabase
            .from("partner_staff_assignments")
            .select("staff_id, role")
            .eq("branch_id", order.branch_id)
            .is("end_at", null),
          // Package (migration 0008) — tabel belum ada (42P01) atau kosong dianggap
          // sama: turun ke input teks bebas, tanpa error (LESSONS #12).
          supabase.from("partner_packages").select("id, name").eq("partner_id", order.partner_id).eq("status", "ACTIVE").order("name"),
          fetchOrderPackageId(supabase, order.id),
        ])
      : Promise.resolve(null),
    order.status === "CANCELLED"
      ? fetchCancelInfo(supabase, order.id)
      : Promise.resolve<{ info: CancelInfo | null; unavailable: boolean }>({ info: null, unavailable: false }),
    fetchShippingAddress(supabase, order.id),
    fetchOrderItems(supabase, order.id),
    offerFlags.canViewOffer ? fetchOrderOfferCabang(supabase, order.id) : Promise.resolve(null),
  ]);

  const { extras, state: extrasState } = extrasResult;
  const extrasAvailable = extrasState === "ok";
  // "invoice.pdf" → "pdf" — dipakai InvoiceSection untuk menebak cara
  // menampilkan (gambar vs PDF) dari path yang tersimpan.
  const invoiceExt = extras.invoiceUrl?.split(".").pop()?.toLowerCase() ?? null;

  let staffOptions: StaffOption[] = [];
  let packages: PackageOption[] = [];
  let currentPackageId: string | null = null;
  if (manageData) {
    const [{ data: staffList }, { data: assignments }, { data: packageRows }, fetchedPackageId] = manageData;
    const roleByStaff = new Map<string, string>();
    (assignments ?? []).forEach((a: Assignment) => roleByStaff.set(a.staff_id, a.role));
    staffOptions = (staffList ?? [])
      .filter((s) => s.status === "ACTIVE" && roleByStaff.has(s.id))
      .map((s) => ({ id: s.id, fullName: s.full_name, role: roleByStaff.get(s.id)! }));
    packages = (packageRows ?? []).map((p) => ({ id: p.id, name: p.name }));
    currentPackageId = fetchedPackageId;
  }
  const cancelInfo: CancelInfo | null = cancelResult.info;
  const cancelInfoUnavailable = cancelResult.unavailable;

  return (
    <main className="pwrap">
      <div className="backrow">
        <Link href="/cabang/pesanan" className="linkbtn">
          {m.cabang.navBackOrders}
        </Link>
      </div>

      <div className="idcard">
        <div className="overline">{m.cabang.partnerOrderLabel}</div>
        <h2>{partner?.name ?? "—"}</h2>
        <div className="br">{m.cabang.homeBranchLabel.replace("{name}", branch?.name ?? "—")}</div>
        {isOtherBranch && (
          <div className="banner info" style={{ marginTop: 10 }}>
            {m.cabang.otherBranchViewOnlyBanner}
          </div>
        )}
      </div>

      <div className="card">
        <div className="stack">
          <div className="spread">
            <span className="code" style={{ fontSize: "var(--fs-sec)" }}>
              {order.order_number}
            </span>
            <StatusBadge status={order.status} messages={m} />
          </div>

          {extrasState === "error" && (
            <div className="banner bad">
              {m.common.errorSection}
              <div className="btnrow-inline">
                <Link href={`/cabang/pesanan/${orderId}`} className="btn sm">
                  {m.cabang.reloadCta}
                </Link>
              </div>
            </div>
          )}

          {extrasAvailable && extras.customerArrivedAt && (
            <div className="banner ok">
              {m.cabang.customerArrivedPrefix}{" "}
              {new Date(extras.customerArrivedAt).toLocaleString(m.common.dateLocale, {
                day: "numeric",
                month: "long",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          )}

          <dl className="kv">
            <dt>{m.common.customer}</dt>
            <dd>{customer?.full_name ?? m.cabang.orderUnknownCustomer}</dd>
            <dt>{m.common.whatsapp}</dt>
            <dd>{customer?.phone_normalized ? displayPhoneID(customer.phone_normalized) : "—"}</dd>
            <dt>{m.common.package}</dt>
            <dd>{order.package_name}</dd>
            {extrasAvailable && (
              <>
                <dt>{m.common.fulfillment}</dt>
                <dd>
                  {extras.fulfillmentPath ? (
                    <span className="chip accent">{fulfillmentLabel(m, extras.fulfillmentPath)}</span>
                  ) : (
                    <span className="chip neutral">{m.cabang.notSetChip}</span>
                  )}
                </dd>
                <dt>{m.common.storePurchase}</dt>
                <dd>{extras.purchaseAmount != null ? formatIDR(extras.purchaseAmount) : "—"}</dd>
              </>
            )}
            <dt>{m.cabang.salesDt}</dt>
            <dd>
              {sales?.full_name ?? "—"}
              {sales && sales.status !== "ACTIVE" && <span className="small muted"> ({m.common.statusInactive})</span>}
            </dd>
            <dt>{m.cabang.picLabel}</dt>
            <dd>
              {pic?.full_name ?? "—"}
              {pic && pic.status !== "ACTIVE" && <span className="small muted"> ({m.common.statusInactive})</span>}
            </dd>
            <dt>{m.common.notes}</dt>
            <dd>{order.notes || "—"}</dd>
            {shippingResult.status === "ok" && (
              <>
                <dt>{m.common.shippingAddress}</dt>
                <dd style={{ whiteSpace: "pre-wrap" }}>{shippingResult.data || "—"}</dd>
              </>
            )}
            <dt>{m.common.createdAt}</dt>
            <dd>
              {new Date(order.created_at).toLocaleString(m.common.dateLocale, {
                day: "numeric",
                month: "long",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </dd>
          </dl>
        </div>

        {extrasAvailable && (
          <InvoiceSection orderId={order.id} hasInvoice={!!extras.invoiceUrl} invoiceExt={invoiceExt} canManage={canManage} />
        )}

        {itemsResult.unavailable ? null : (
          <OrderItemsSection
            orderId={order.id}
            items={itemsResult.items}
            canManage={canManage}
            copyWarning={false}
          />
        )}

        {offerFlags.canViewOffer && offerData && (
          <OfferSection
            orderId={order.id}
            canEditOffer={canEditBranch && offerFlags.canEditOffer}
            canDiscount={canEditBranch && offerFlags.canDiscount}
            offer={offerData}
          />
        )}

        {order.status === "CANCELLED" && (
          <div className="banner" style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>{m.cabang.orderCancelledHeading}</div>
            {cancelInfoUnavailable ? (
              <div>{m.cabang.cancelInfoUnavailableMsg}</div>
            ) : (
              <>
                <div>{m.common.reason}: {cancelInfo?.cancellation_reason || "—"}</div>
                <div>
                  {m.cabang.cancelTimeLabel}:{" "}
                  {cancelInfo?.cancelled_at
                    ? new Date(cancelInfo.cancelled_at).toLocaleString(m.common.dateLocale, {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—"}
                </div>
              </>
            )}
          </div>
        )}

        {canManage ? (
          <OrderDetailActions
            orderId={order.id}
            orderNumber={order.order_number}
            customerName={customer?.full_name ?? m.cabang.orderUnknownCustomer}
            packageName={order.package_name}
            packageId={currentPackageId}
            packages={packages}
            salesStaffId={order.partner_sales_staff_id}
            picStaffId={order.partner_pic_staff_id}
            notes={order.notes}
            staffOptions={staffOptions}
            fulfillmentPath={extras.fulfillmentPath}
            purchaseAmount={extras.purchaseAmount}
            extrasAvailable={extrasAvailable}
            shippingAddress={shippingResult.status === "ok" ? shippingResult.data : null}
          />
        ) : (
          <p className="footnote">
            {order.status === "CANCELLED"
              ? m.cabang.orderCancelledReadonlyNote
              : m.cabang.orderOtherBranchReadonlyNote}
          </p>
        )}
      </div>
    </main>
  );
}
