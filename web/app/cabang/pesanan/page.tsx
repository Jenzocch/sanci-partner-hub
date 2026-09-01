import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isMissingTableError } from "@/lib/orders-shared";
import { customerPaymentStatus, shippingState, type CustomerPaymentStatus, type ShippingState } from "@/lib/payment-shared";
import { getCabangMessages } from "@/lib/i18n";
import OrderListClient, { type OrderListItem } from "./order-list-client";

export const dynamic = "force-dynamic";

/**
 * Status kirim + status bayar untuk daftar ini (2026-09-01) — sisi cabang
 * akhirnya mendapat kedua filter yang sudah lama ada di /admin/orders.
 *
 * BENTUKNYA BERBEDA dari sisi admin, dan itu disengaja:
 *   - /admin/orders menyaring di SERVER (form GET + searchParams) karena
 *     daftarnya bisa panjang dan pencariannya menempuh enam jalur query.
 *   - Daftar ini sudah mengambil 100 baris sekaligus lalu menyaring di
 *     MEMORI di klien (kata kunci + status pesanan berjalan begitu sejak
 *     awal). Menambah dua filter berarti melengkapi baris yang SUDAH
 *     diambil dengan dua keterangan, bukan membangun ulang halaman ini jadi
 *     form GET — perubahan sebesar itu akan membuang persist jelajah
 *     (use-browse-persist) dan mengubah alur staf tanpa diminta.
 *
 * Konsekuensinya: kedua filter di sini menyaring TEPAT 100 pesanan terbaru
 * yang sudah tampil, tidak pernah lebih — tidak ada batas pindaian
 * tersembunyi, dan karena itu tidak ada catatan kaki "terpotong" seperti di
 * sisi admin. Yang tampil di layar persis himpunan yang disaring.
 *
 * Keduanya dibaca lewat query TERPISAH dan TOLERAN (LESSONS #12): kalau
 * 0016/0023/0026 belum jalan, filter yang bersangkutan DIMATIKAN dan
 * dikatakan — bukan semua baris diam-diam jatuh ke "Belum DO"/"Belum Bayar"
 * (LESSONS #10).
 */
const ORDER_LIST_LIMIT = 100;


type OrderRow = {
  id: string;
  order_number: string;
  package_name: string;
  status: "REGISTERED" | "CANCELLED";
  created_at: string;
  branch_id: string;
  customers: { full_name: string; phone_normalized: string } | { full_name: string; phone_normalized: string }[] | null;
  partner_branches: { name: string } | { name: string }[] | null;
  sales: { full_name: string } | { full_name: string }[] | null;
};

function one<T>(v: T | T[] | null): T | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function PesananListPage() {
  const m = await getCabangMessages();
  const supabase = await createClient();
  // Tanpa auth.getUser(): batas keamanannya RLS, bukan cek halaman (LESSONS
  // #5) — untuk pengunjung yang belum login, pembacaan partner_users ini
  // pulang kosong, jadi `!pu` → redirect sama persis; middleware sudah
  // menyegarkan sesi tiap navigasi. Beda error vs kosong TETAP dijaga
  // (LESSONS #10): error DB → kartu error, hanya hasil kosong di-redirect.
  //
  // Kebijakan akses diambil terpisah — tidak ada FK partner_users →
  // partner_access_policies, embed langsung ditolak PostgREST saat runtime.
  const { data: pu, error: puError } = await supabase
    .from("partner_users")
    .select("branch_id, partner_id")
    .maybeSingle();
  if (puError) {
    return (
      <main className="page">
        <div className="card">
          <div className="err">{m.cabang.errAccountLoad}</div>
        </div>
      </main>
    );
  }
  if (!pu) redirect("/");

  // Kebijakan (hanya flag tampilan crossBranchVisible) dan daftar order
  // tidak saling bergantung — RLS pada partner_orders sudah membatasi baris
  // sesuai kebijakan visibilitas; query di sini hanya membaca hasil yang
  // sudah difilter, bukan filter tambahan. Dijalankan berbarengan, bukan
  // berurutan (audit kecepatan 2026-08-22, temuan #6).
  const [{ data: pol }, { data: orders, error }] = await Promise.all([
    supabase
      .from("partner_access_policies")
      .select("visibility_scope")
      .eq("partner_id", pu.partner_id)
      .maybeSingle(),
    supabase
      .from("partner_orders")
      .select(
        "id, order_number, package_name, status, created_at, branch_id, customers:customer_id(full_name, phone_normalized), partner_branches:branch_id(name), sales:partner_sales_staff_id(full_name)"
      )
      .order("created_at", { ascending: false })
      .limit(ORDER_LIST_LIMIT),
  ]);
  const crossBranchVisible = pol?.visibility_scope === "PARTNER_ALL_BRANCHES";

  let errorKind: "missing_table" | "other" | null = null;
  if (error) {
    errorKind = isMissingTableError(error) ? "missing_table" : "other";
  }

  const orderRows = (orders as OrderRow[] | null) ?? [];
  const orderIds = orderRows.map((o) => o.id);

  // ── Keterangan kirim + bayar untuk baris yang BENAR-BENAR tampil ──
  //
  // Ketiga pembacaan saling bebas dan semuanya dibatasi `.in(orderIds)` —
  // maksimal 100 id, jauh di bawah panjang URL yang wajar (sisi admin
  // memindai global justru karena jendelanya bisa jauh lebih lebar).
  // Dilewati sama sekali kalau daftarnya kosong/error: tidak ada baris yang
  // perlu dilengkapi.
  let shippingByOrder: Map<string, ShippingState> | null = null;
  let paymentByOrder: Map<string, CustomerPaymentStatus> | null = null;
  if (!errorKind && orderIds.length > 0) {
    const [doRes, deliveredRes, payRes] = await Promise.all([
      supabase.from("order_documents").select("order_id").eq("doc_type", "DO").in("order_id", orderIds),
      supabase.from("partner_orders").select("id, delivered_at").in("id", orderIds),
      supabase
        .from("partner_orders")
        .select("id, customer_total_amount, customer_paid_amount")
        .in("id", orderIds),
    ]);

    // Kirim butuh KEDUA pembacaan: satu saja yang gagal sudah cukup membuat
    // turunannya salah (mis. pesanan yang sudah diterima akan terbaca
    // "Sudah DO" atau malah "Belum DO"), jadi filternya dimatikan utuh.
    if (!doRes.error && !deliveredRes.error) {
      const hasDo = new Set((doRes.data ?? []).map((r: { order_id: string }) => r.order_id));
      const delivered = new Set(
        ((deliveredRes.data ?? []) as { id: string; delivered_at: string | null }[])
          .filter((r) => r.delivered_at !== null)
          .map((r) => r.id)
      );
      shippingByOrder = new Map(orderIds.map((id) => [id, shippingState(id, hasDo, delivered)]));
    }

    if (!payRes.error) {
      paymentByOrder = new Map(
        ((payRes.data ?? []) as {
          id: string;
          customer_total_amount: number | null;
          customer_paid_amount: number | null;
        }[]).map((r) => [
          r.id,
          customerPaymentStatus(r.customer_total_amount, r.customer_paid_amount ?? 0),
        ])
      );
    }
  }

  const items: OrderListItem[] = orderRows.map((o) => {
    const customer = one(o.customers);
    const branch = one(o.partner_branches);
    const sales = one(o.sales);
    return {
      id: o.id,
      orderNumber: o.order_number,
      packageName: o.package_name,
      status: o.status,
      createdAt: o.created_at,
      customerName: customer?.full_name ?? m.cabang.orderUnknownCustomer,
      customerPhone: customer?.phone_normalized ?? "",
      salesName: sales?.full_name ?? null,
      branchId: o.branch_id,
      branchName: branch?.name ?? "—",
      // `null` di sini berarti TIDAK DIKETAHUI (pembacaannya gagal / migrasi
      // belum jalan), bukan "belum DO"/"belum bayar" — klien memakai bedanya
      // untuk menyembunyikan filternya, bukan menyaring semua baris habis.
      shipping: shippingByOrder?.get(o.id) ?? null,
      payment: paymentByOrder?.get(o.id) ?? null,
    };
  });

  return (
    <main className="pwrap">
      <div className="backrow">
        <Link href="/cabang" className="linkbtn">
          {m.cabang.navBackHome}
        </Link>
      </div>
      <div className="worktop">
        <h2 className="mtitle" style={{ marginBottom: 0 }}>
          {m.cabang.homeOrders}
        </h2>
        <Link href="/cabang/pesanan/baru" className="btn primary sm">
          {m.cabang.homeNewOrder}
        </Link>
      </div>
      <OrderListClient
        items={items}
        errorKind={errorKind}
        ownBranchId={pu.branch_id}
        crossBranchVisible={crossBranchVisible}
        shippingAvailable={shippingByOrder !== null}
        paymentAvailable={paymentByOrder !== null}
      />
    </main>
  );
}
