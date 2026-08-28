import { createClient } from "@/lib/supabase/server";
import { formatIDR, formatDateTimeWIB, formatCalendarDate } from "@/lib/orders-shared";
import type { CustomerOrderView, CustomerStage } from "@/lib/customer-link";
import RevealAddress from "./reveal-address";

export const dynamic = "force-dynamic";

/**
 * Halaman pesanan untuk PELANGGAN — tanpa login (migrasi 0023).
 *
 * RUTE DI AKAR, bukan di bawah /cabang atau /admin: keduanya punya layout
 * yang menuntut sesi dan menggambar navigasi staf. Halaman ini dibuka orang
 * yang tidak punya akun dan tidak akan pernah punya.
 *
 * BAHASA: seluruh teks HARDCODED Bahasa Indonesia, TIDAK lewat `Messages` —
 * disengaja, presedennya halaman cetak SO/DO/Invoice. Pembacanya pelanggan
 * toko; ia tidak punya cookie bahasa dan tidak boleh mendapat kalimat
 * Mandarin hanya karena staf yang mengirim tautannya memakai antarmuka
 * Mandarin. Penjelasan penuhnya di lib/i18n/GLOSSARY.md.
 *
 * KEAMANAN: halaman ini TIDAK PERNAH menyentuh tabel. Satu-satunya sumber
 * datanya adalah RPC `fn_customer_order_view` (SECURITY DEFINER, daftar
 * putih kolom disusun satu per satu di migrasi 0023 §5). Tidak ada satu pun
 * policy anon di partner_orders/customers/order_items — dibuktikan
 * test-harness 95_behavior_0023.sql T2.
 *
 * TIGA KEADAAN, DIBEDAKAN JUJUR (LESSONS #10 — kegagalan TIDAK BOLEH
 * menyamar jadi "tidak ditemukan"):
 *   - RPC menjawab NULL  → tautan memang tidak dikenal → "Link tidak valid".
 *   - RPC/DB error       → "Sedang gangguan" + tombol coba lagi.
 *   - data ada           → isi halaman.
 * Menggabungkan keduanya akan membuat gangguan server terbaca oleh pelanggan
 * sebagai "toko menghapus pesanan saya".
 */

type StageStep = { key: CustomerStage; label: string };

/** Linimasa tiga langkah — bentuknya beda menurut jalur pemenuhan. */
const STEPS_DELIVERY: StageStep[] = [
  { key: "ORDER_RECEIVED", label: "Pesanan diterima" },
  { key: "SHIPPING", label: "Sedang dikirim" },
  { key: "DELIVERED", label: "Sudah diterima" },
];
const STEPS_PICKUP: StageStep[] = [
  { key: "ORDER_RECEIVED", label: "Pesanan diterima" },
  { key: "READY_FOR_PICKUP", label: "Silakan ambil di toko" },
  { key: "PICKED_UP", label: "Selesai" },
];

function stepsFor(v: CustomerOrderView): StageStep[] {
  return v.fulfillment_path === "SHOWROOM_VISIT" ? STEPS_PICKUP : STEPS_DELIVERY;
}

/**
 * Indeks langkah yang sedang berjalan. READY_FOR_PICKUP adalah langkah KEDUA
 * pada jalur ambil-sendiri (pesanan yang belum diambil sudah pasti diterima
 * tokonya), jadi ia tidak pernah memetakan ke indeks 0.
 */
function activeIndex(v: CustomerOrderView): number {
  const steps = stepsFor(v);
  const i = steps.findIndex((s) => s.key === v.stage);
  return i < 0 ? 0 : i;
}

function Timeline({ view }: { view: CustomerOrderView }) {
  const steps = stepsFor(view);
  const active = activeIndex(view);
  return (
    <ol
      style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 0 }}
    >
      {steps.map((s, i) => {
        const done = i < active;
        const now = i === active;
        const color = done || now ? "var(--ok)" : "var(--line2)";
        return (
          <li key={s.key} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "none" }}>
              <span
                aria-hidden="true"
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "999px",
                  background: done || now ? color : "transparent",
                  border: `2px solid ${color}`,
                  marginTop: 4,
                }}
              />
              {i < steps.length - 1 && (
                <span
                  aria-hidden="true"
                  style={{ width: 2, flex: 1, minHeight: 34, background: done ? "var(--ok)" : "var(--line)" }}
                />
              )}
            </div>
            <div style={{ paddingBottom: i < steps.length - 1 ? 18 : 0 }}>
              <div style={{ fontWeight: now ? 700 : 500, color: now ? "var(--ink)" : "var(--ink2)" }}>
                {s.label}
              </div>
              {now && s.key === "SHIPPING" && view.do_date && (
                <div className="small muted">Surat jalan {formatCalendarDate(view.do_date, "id-ID")}</div>
              )}
              {now && s.key === "DELIVERED" && view.delivered_at && (
                <div className="small muted">{formatDateTimeWIB(view.delivered_at, "id-ID")} WIB</div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="pwrap" style={{ maxWidth: "var(--read-max)", margin: "0 auto" }}>
      {children}
    </main>
  );
}

export default async function LihatPesananPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("fn_customer_order_view", { p_token: token });

  // Keadaan 2: gangguan. TIDAK PERNAH disamarkan jadi "link tidak valid".
  if (error) {
    return (
      <Shell>
        <div className="card">
          <h1 style={{ fontSize: "var(--fs-h2)", marginTop: 0 }}>Sedang gangguan</h1>
          <p>
            Halaman ini sedang tidak bisa dimuat. Ini masalah di sisi kami, bukan tautan Anda.
            Silakan coba lagi sebentar lagi.
          </p>
          {/* Tautan biasa (bukan tombol JS): halaman ini 0 KB JavaScript. */}
          <a className="btn primary" href={`/lihat/${encodeURIComponent(token)}`}>
            Coba lagi
          </a>
        </div>
      </Shell>
    );
  }

  // Keadaan 1: token memang tidak dikenal.
  const view = data as CustomerOrderView | null;
  if (!view) {
    return (
      <Shell>
        <div className="card">
          <h1 style={{ fontSize: "var(--fs-h2)", marginTop: 0 }}>Link tidak valid</h1>
          <p>
            Tautan ini tidak kami kenali. Mungkin sudah kedaluwarsa atau salah tersalin.
            Silakan hubungi toko tempat Anda memesan.
          </p>
        </div>
      </Shell>
    );
  }

  const sapaan = view.customer_first_name ? `Halo ${view.customer_first_name},` : "Halo,";

  // Pesanan dibatalkan: SELURUH halaman berubah. Tidak ada isi, tidak ada
  // uang, dan TIDAK ADA ALASAN (keputusan owner — alasan pembatalan adalah
  // percakapan antara toko dan pelanggan, bukan kalimat di layar).
  if (view.cancelled) {
    return (
      <Shell>
        <div className="card">
          <div className="overline">Pesanan {view.order_number}</div>
          <h1 style={{ fontSize: "var(--fs-h2)", marginTop: 0 }}>Pesanan dibatalkan</h1>
          <p>
            {sapaan} pesanan ini sudah dibatalkan. Silakan hubungi toko tempat Anda memesan untuk
            keterangan selanjutnya.
          </p>
        </div>
      </Shell>
    );
  }

  const items = view.items ?? [];
  const amounts = view.amounts ?? null;
  const nf = (v: number | string) => formatIDR(Number(v));

  return (
    <Shell>
      <div className="card">
        <div className="overline">Pesanan {view.order_number}</div>
        <h1 style={{ fontSize: "var(--fs-h2)", marginTop: 0, marginBottom: 6 }}>{sapaan}</h1>
        <p className="small muted" style={{ marginTop: 0 }}>
          Berikut perkembangan pesanan Anda.
        </p>
      </div>

      <div className="card">
        <h2 className="sectiontitle">Status pesanan</h2>
        <Timeline view={view} />
      </div>

      {items.length > 0 && (
        <div className="card">
          <h2 className="sectiontitle">Isi pesanan</h2>
          <div className="cardlist">
            {items.map((it, i) => (
              <div key={`${it.code ?? it.name}-${i}`} style={{ display: "flex", gap: 14, alignItems: "center" }}>
                {it.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={it.photo_url}
                    alt=""
                    width={64}
                    height={64}
                    style={{
                      width: 64,
                      height: 64,
                      objectFit: "cover",
                      borderRadius: "var(--r-md)",
                      border: "1px solid var(--line)",
                      flex: "none",
                    }}
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: "var(--r-md)",
                      background: "var(--surface2)",
                      flex: "none",
                    }}
                  />
                )}
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>{it.name}</div>
                  {it.code && <div className="small muted code">{it.code}</div>}
                </div>
                <div className="num" style={{ flex: "none", color: "var(--ink2)" }}>
                  {it.qty}x
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {amounts && (
        <div className="card">
          <h2 className="sectiontitle">Pembayaran</h2>
          <dl className="kv">
            {/* Satu konsep = satu kata (GLOSSARY): angka ini adalah
                `final_amount` yang sama dengan "Harga Akhir" di kalkulator,
                kartu penawaran dan banner hand-off. Dulu "Total" di sini —
                nama ketiga untuk angka yang sama (audit teks 2026-08-28). */}
            <dt>Harga Akhir</dt>
            <dd className="num">{nf(amounts.final)}</dd>
            <dt>Sudah dibayar (DP)</dt>
            <dd className="num">{nf(amounts.dp)}</dd>
            <dt>Sisa</dt>
            <dd className="num" style={{ fontWeight: 700 }}>
              {nf(amounts.sisa)}
            </dd>
          </dl>
        </div>
      )}

      {(view.city || view.has_address) && (
        <div className="card">
          <h2 className="sectiontitle">Alamat pengiriman</h2>
          {view.city && <p style={{ marginTop: 0 }}>{view.city}</p>}
          {view.has_address && <RevealAddress token={token} />}
        </div>
      )}

      <p className="footnote">
        Ada yang ingin ditanyakan? Silakan hubungi toko tempat Anda memesan.
      </p>
    </Shell>
  );
}
