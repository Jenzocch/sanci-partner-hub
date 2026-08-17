import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { displayPhoneID, isMissingTableError } from "@/lib/orders-shared";
import StatusBadge from "../status-badge";
import OrderDetailActions, { type PackageOption, type StaffOption } from "./order-detail-actions";

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

export default async function PesananDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
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
          <div className="err">Data akun gagal dimuat. Muat ulang halaman untuk mencoba lagi.</div>
        </div>
      </main>
    );
  }
  if (!pu) redirect("/");

  const { data: puPolicy } = await supabase
    .from("partner_access_policies")
    .select("edit_scope")
    .eq("partner_id", pu.partner_id)
    .maybeSingle();

  // RLS pada partner_orders membatasi baris: order di cabang yang tidak boleh
  // dilihat pengguna ini tidak akan pernah muncul di sini.
  const { data, error } = await supabase
    .from("partner_orders")
    .select(
      "id, order_number, package_name, status, notes, created_at, branch_id, partner_id, " +
        "partner_sales_staff_id, partner_pic_staff_id, " +
        "customers:customer_id(full_name, phone_normalized, whatsapp), " +
        "partner_branches:branch_id(name), partners:partner_id(name, code), " +
        "sales:partner_sales_staff_id(full_name, status), pic:partner_pic_staff_id(full_name, status)"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return (
        <main className="pwrap">
          <div className="card">
            <div className="banner bad">
              Modul Pesanan belum aktif di database (migrasi belum dijalankan). Hubungi SANCI Admin.
            </div>
          </div>
        </main>
      );
    }
    return (
      <main className="pwrap">
        <div className="card">
          <div className="err">Gagal memuat detail pesanan.</div>
          <Link href={`/cabang/pesanan/${orderId}`} className="btn sm">
            Coba Lagi
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

  // Staf untuk dropdown Sales/PIC diambil dari CABANG PESANAN (bisa beda dari
  // cabang login saat PARTNER_ALL_BRANCHES mengubah order cabang lain) — bukan
  // cabang pengguna sendiri (SPEC menuntut ini secara eksplisit).
  let staffOptions: StaffOption[] = [];
  let packages: PackageOption[] = [];
  let currentPackageId: string | null = null;
  let cancelInfo: CancelInfo | null = null;
  let cancelInfoUnavailable = false;
  if (canManage) {
    const [{ data: staffList }, { data: assignments }, { data: packageRows }, fetchedPackageId] = await Promise.all([
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
    ]);
    const roleByStaff = new Map<string, string>();
    (assignments ?? []).forEach((a: Assignment) => roleByStaff.set(a.staff_id, a.role));
    staffOptions = (staffList ?? [])
      .filter((s) => s.status === "ACTIVE" && roleByStaff.has(s.id))
      .map((s) => ({ id: s.id, fullName: s.full_name, role: roleByStaff.get(s.id)! }));
    packages = (packageRows ?? []).map((p) => ({ id: p.id, name: p.name }));
    currentPackageId = fetchedPackageId;
  }
  if (order.status === "CANCELLED") {
    const res = await fetchCancelInfo(supabase, order.id);
    cancelInfo = res.info;
    cancelInfoUnavailable = res.unavailable;
  }

  return (
    <main className="pwrap">
      <div className="backrow">
        <Link href="/cabang/pesanan" className="linkbtn">
          ← Daftar Pesanan
        </Link>
      </div>

      <div className="idcard">
        <div className="overline">Partner Order</div>
        <h2>{partner?.name ?? "—"}</h2>
        <div className="br">Cabang {branch?.name ?? "—"}</div>
        {isOtherBranch && (
          <div className="banner info" style={{ marginTop: 10 }}>
            Cabang lain — hanya lihat.
          </div>
        )}
      </div>

      <div className="card">
        <div className="stack">
          <div className="spread">
            <span className="code" style={{ fontSize: "var(--fs-sec)" }}>
              {order.order_number}
            </span>
            <StatusBadge status={order.status} />
          </div>
          <dl className="kv">
            <dt>Pelanggan</dt>
            <dd>{customer?.full_name ?? "Pelanggan tidak diketahui"}</dd>
            <dt>WhatsApp</dt>
            <dd>{customer?.phone_normalized ? displayPhoneID(customer.phone_normalized) : "—"}</dd>
            <dt>Package</dt>
            <dd>{order.package_name}</dd>
            <dt>Sales</dt>
            <dd>
              {sales?.full_name ?? "—"}
              {sales && sales.status !== "ACTIVE" && <span className="small muted"> (nonaktif)</span>}
            </dd>
            <dt>PIC</dt>
            <dd>
              {pic?.full_name ?? "—"}
              {pic && pic.status !== "ACTIVE" && <span className="small muted"> (nonaktif)</span>}
            </dd>
            <dt>Catatan</dt>
            <dd>{order.notes || "—"}</dd>
            <dt>Dibuat</dt>
            <dd>
              {new Date(order.created_at).toLocaleString("id-ID", {
                day: "numeric",
                month: "long",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </dd>
          </dl>
        </div>

        {order.status === "CANCELLED" && (
          <div className="banner" style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Pesanan dibatalkan</div>
            {cancelInfoUnavailable ? (
              <div>Info pembatalan belum tersedia (migrasi database belum dijalankan).</div>
            ) : (
              <>
                <div>Alasan: {cancelInfo?.cancellation_reason || "—"}</div>
                <div>
                  Waktu:{" "}
                  {cancelInfo?.cancelled_at
                    ? new Date(cancelInfo.cancelled_at).toLocaleString("id-ID", {
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
            customerName={customer?.full_name ?? "Pelanggan tidak diketahui"}
            packageName={order.package_name}
            packageId={currentPackageId}
            packages={packages}
            salesStaffId={order.partner_sales_staff_id}
            picStaffId={order.partner_pic_staff_id}
            notes={order.notes}
            staffOptions={staffOptions}
          />
        ) : (
          <p className="footnote">
            {order.status === "CANCELLED"
              ? "Pesanan yang sudah dibatalkan tidak bisa diubah lagi."
              : "Pesanan ini hanya bisa dilihat dari sisi cabang ini. Perubahan atau pembatalan dilakukan oleh cabang pemilik pesanan."}
          </p>
        )}
      </div>
    </main>
  );
}
