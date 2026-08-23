import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isMissingTableError } from "@/lib/orders-shared";
import { getCabangMessages } from "@/lib/i18n";
import CustomerListClient, { type CustomerListItem } from "./customer-list-client";

export const dynamic = "force-dynamic";

export default async function PelangganListPage() {
  const m = await getCabangMessages();
  const supabase = await createClient();
  // Tanpa auth.getUser(): batas keamanannya RLS, bukan cek halaman (LESSONS
  // #5) — untuk pengunjung yang belum login, pembacaan partner_users ini
  // pulang kosong, jadi `!pu` → redirect sama persis; middleware sudah
  // menyegarkan sesi tiap navigasi. Beda error vs kosong TETAP dijaga
  // (LESSONS #10): error DB → kartu error, hanya hasil kosong di-redirect.
  const { data: pu, error: puError } = await supabase
    .from("partner_users")
    .select("branch_id, partner_id")
    .maybeSingle();
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

  // RLS (fn_can_view_customer) sudah membatasi baris ke pelanggan yang boleh
  // dilihat cabang ini — tidak perlu filter tambahan di sini (SPEC §32).
  // customer_code (migrasi 0017/0018/0019) BISA belum ada sebagai kolom kalau
  // kodenya sudah naik lebih dulu (LESSONS #12) — coba SELECT lebar dulu,
  // turun ke SELECT sempit kalau 42703, supaya daftar dasar tetap tampil.
  type CustomerRow = { id: string; full_name: string; phone_normalized: string; customer_code?: string | null };
  let customers: CustomerRow[] = [];
  let error: { code?: string } | null = null;
  {
    const wide = await supabase
      .from("customers")
      .select("id, full_name, phone_normalized, customer_code")
      .order("full_name")
      .limit(100);
    if (wide.error && wide.error.code === "42703") {
      const narrow = await supabase.from("customers").select("id, full_name, phone_normalized").order("full_name").limit(100);
      error = narrow.error;
      customers = ((narrow.data ?? []) as Omit<CustomerRow, "customer_code">[]).map((c) => ({ ...c, customer_code: null }));
    } else {
      error = wide.error;
      customers = (wide.data ?? []) as CustomerRow[];
    }
  }

  let errorKind: "missing_table" | "other" | null = null;
  if (error) {
    errorKind = isMissingTableError(error) ? "missing_table" : "other";
  }

  const ids = (customers ?? []).map((c) => c.id);
  const orderCounts = new Map<string, number>();
  if (ids.length > 0) {
    // Hitung jumlah pesanan per pelanggan lewat query terpisah — RLS pada
    // partner_orders otomatis membatasi ke order yang boleh dilihat cabang
    // ini juga, jadi angkanya konsisten dengan yang muncul di detail (§77).
    // `.limit()` jaring pengaman (bukan batas yang pernah tercapai wajar):
    // ids sudah dibatasi 100 pelanggan, tapi baris ORDER-nya sendiri tidak
    // — cabang dengan riwayat sangat panjang tetap terlindung dari respons
    // tak terbatas (audit kecepatan muat 2026-08-22 #16). Angka yang tampil
    // bisa jadi kurang dari sebenarnya HANYA di atas 5000 order gabungan
    // 100 pelanggan itu — batas yang realistis tidak akan tersentuh.
    const { data: orderRows } = await supabase
      .from("partner_orders")
      .select("customer_id")
      .in("customer_id", ids)
      .limit(5000);
    (orderRows ?? []).forEach((o: { customer_id: string }) => {
      orderCounts.set(o.customer_id, (orderCounts.get(o.customer_id) ?? 0) + 1);
    });
  }

  const items: CustomerListItem[] = (customers ?? []).map((c) => ({
    id: c.id,
    fullName: c.full_name,
    phoneNormalized: c.phone_normalized,
    customerCode: c.customer_code ?? null,
    orderCount: orderCounts.get(c.id) ?? 0,
  }));

  return (
    <main className="pwrap">
      <div className="backrow">
        <Link href="/cabang" className="linkbtn">
          {m.cabang.navBackHome}
        </Link>
      </div>
      <div className="worktop">
        <h2 className="mtitle" style={{ marginBottom: 0 }}>
          {m.common.customer}
        </h2>
        <Link href="/cabang/pesanan/baru" className="btn primary sm">
          {m.cabang.newCustomerCta}
        </Link>
      </div>
      <CustomerListClient items={items} errorKind={errorKind} />
    </main>
  );
}
