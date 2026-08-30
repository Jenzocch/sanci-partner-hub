"use client";

/**
 * Dokumen Proposal — halaman 1 ringkasan pilihan + angka, halaman berikutnya
 * satu profil produk per halaman (foto besar, ukuran, deskripsi, galeri).
 *
 * Aturan yang mengikat layar ini:
 *   - TIDAK menulis apa pun ke database (lihat lib/proposal-shared.ts).
 *   - Angka TIDAK dihitung ulang di sini. Subtotal, tiap langkah diskon, dan
 *     total akhir datang apa adanya dari hand-off yang ditulis Kalkulator,
 *     yang memakai computeChainFinal() — satu-satunya rumus yang sah
 *     (calculator-shared.ts: kalikan berurutan, SATU kali round di akhir).
 *     Menghitung ulang di sini dengan cara sendiri adalah cara paling mudah
 *     membuat dokumen pelanggan berbeda beberapa rupiah dari layar staf.
 *     Yang dihitung di sini HANYA jumlah per baris (unitPrice × qty), angka
 *     yang memang tidak ada di hand-off dan tidak masuk ke rantai mana pun.
 *   - Profil produk diambil SEGAR dari database; kalau gagal, ringkasannya
 *     tetap tercetak dan kegagalannya DIKATAKAN (LESSONS #10) — bukan
 *     dokumen setengah jadi yang diam-diam kehilangan halaman isi.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCabangMessages } from "@/lib/i18n/provider";
import { formatIDR } from "@/lib/orders-shared";
import { COMPANY_INFO } from "@/lib/company-info";
import {
  readProposalHandoff,
  type ProposalHandoff,
  type ProposalProduct,
} from "@/lib/proposal-shared";
import { loadProposalProducts } from "./actions";
import styles from "./proposal.module.css";

type LoadState =
  | { phase: "loading" }
  | { phase: "ready"; products: ProposalProduct[] }
  | { phase: "error"; text: string };

export default function ProposalClient() {
  const m = useCabangMessages();
  const [handoff, setHandoff] = useState<ProposalHandoff | null>(null);
  const [ready, setReady] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [load, setLoad] = useState<LoadState>({ phase: "loading" });

  // localStorage hanya ada di browser — dibaca sesudah hidrasi, bukan saat
  // render pertama (server tidak punya nilainya, dan menebaknya akan bikin
  // hydration mismatch).
  useEffect(() => {
    const h = readProposalHandoff();
    setHandoff(h);
    setCustomerName(h?.customerName ?? "");
    setReady(true);
  }, []);

  useEffect(() => {
    if (!handoff) return;
    let alive = true;
    loadProposalProducts(handoff.lines.map((l) => l.productId))
      .then((res) => {
        if (!alive) return;
        if (res.ok) {
          setLoad({ phase: "ready", products: res.products });
          return;
        }
        setLoad({
          phase: "error",
          text: res.reason === "catalog-closed" ? m.cabang.proposalCatalogClosed : m.cabang.proposalLoadFailed,
        });
      })
      // Server Action yang ditolak/putus di tengah TIDAK boleh meninggalkan
      // layar di "Memuat…" selamanya (audit 2026-08-29, dua kasus yang sama).
      .catch(() => {
        if (alive) setLoad({ phase: "error", text: m.cabang.proposalLoadFailed });
      });
    return () => {
      alive = false;
    };
  }, [handoff, m]);

  if (!ready) return null;

  if (!handoff) {
    return (
      <main className="pwrap">
        <div className="card">
          <h2>{m.cabang.proposalEmptyTitle}</h2>
          <p className="sub">{m.cabang.proposalEmptyBody}</p>
          <div className="btnrow" style={{ marginTop: 14 }}>
            <Link href="/cabang/kalkulator" className="btn primary">
              {m.cabang.proposalBackCta}
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const lh = COMPANY_INFO.letterhead;
  const dateText = new Date(handoff.savedAt).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  // Baris diskon ditampilkan sebagai PERSENTASE saja, bukan rupiah per
  // langkah: memecah rupiah tiap langkah adalah bahasa alat hitung staf
  // (Kalkulator), sementara dokumen pelanggan cuma perlu menjawab "berapa
  // potongannya dan berapa akhirnya".
  const products = load.phase === "ready" ? load.products : [];

  return (
    <>
      {/* `styles.noprint`, BUKAN string "noprint": nama kelas di CSS Module
          di-hash, jadi kelas global bernama sama tidak akan pernah cocok. */}
      <div className={`${styles.bar} ${styles.noprint}`}>
        <Link href="/cabang/kalkulator" className="btn sm">
          {m.cabang.proposalBackCta}
        </Link>
        <input
          className={styles.nameField}
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          placeholder={m.cabang.proposalCustomerPlaceholder}
          aria-label={m.cabang.proposalForLabel}
        />
        <button type="button" className="btn primary" onClick={() => window.print()}>
          {m.cabang.proposalPrintCta}
        </button>
      </div>

      <article className={styles.sheet}>
        <header className={styles.head}>
          {/* eslint-disable-next-line @next/next/no-img-element -- aset publik /brand, bukan foto yang butuh optimasi next/image */}
          <img className={styles.headLogo} src="/brand/sanci-logo.png" alt={lh.brand} />
          <div className={styles.headMeta}>
            <div>{lh.name}</div>
            {lh.addressLines.map((line) => (
              <div key={line}>{line}</div>
            ))}
            <div>
              {lh.phone ? `${lh.phone} · ` : ""}
              {lh.website}
            </div>
          </div>
        </header>

        <h1 className={styles.title}>{m.cabang.proposalTitle}</h1>
        <p className={styles.subtitle}>{m.cabang.proposalSubtitle}</p>

        <div className={styles.forLine}>
          {customerName.trim() ? (
            <>
              {m.cabang.proposalForLabel}
              <span className={styles.forName}>{customerName.trim()}</span>
            </>
          ) : null}
          <div style={{ marginTop: customerName.trim() ? 8 : 0 }}>{dateText}</div>
        </div>

        <h2 className={styles.secTitle}>{m.cabang.proposalSelectionTitle}</h2>
        <table className={styles.items}>
          <thead>
            <tr>
              <th aria-hidden="true" />
              <th>{m.cabang.proposalColItem}</th>
              <th className={styles.num}>{m.cabang.proposalColQty}</th>
              <th className={styles.num}>{m.cabang.proposalColUnit}</th>
              <th className={styles.num}>{m.cabang.proposalColTotal}</th>
            </tr>
          </thead>
          <tbody>
            {handoff.lines.map((line) => {
              const prod = products.find((p) => p.id === line.productId);
              const cover = prod?.photos[0];
              return (
                <tr key={line.productId}>
                  <td className={styles.thumbCell}>
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element -- URL publik Supabase Storage, pola sama dengan layar katalog
                      <img className={styles.thumb} src={cover} alt="" />
                    ) : (
                      <span className={styles.thumb} aria-hidden="true" />
                    )}
                  </td>
                  <td>
                    <div className={styles.itemName}>{line.name}</div>
                    {(line.code || prod?.size) && (
                      <div className={styles.itemMeta}>
                        {[line.code, prod?.size].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </td>
                  <td className={styles.num}>{line.qty}</td>
                  <td className={styles.num}>{formatIDR(line.unitPrice)}</td>
                  <td className={styles.num}>{formatIDR(line.unitPrice * line.qty)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className={styles.totals}>
          <div className={styles.totalRow}>
            <span>{m.cabang.proposalSubtotal}</span>
            <span>{formatIDR(handoff.subtotal)}</span>
          </div>
          {/* Rantai diskon dirangkum SATU baris ("10% + 5%") dengan rupiah
              totalnya. Memecah rupiah per langkah adalah bahasa alat hitung
              staf; pelanggan cuma perlu tahu berapa potongannya dan berapa
              akhirnya — dan satu baris berarti tidak ada angka per-langkah
              yang perlu dihitung ulang di sini. */}
          {handoff.discountPcts.length > 0 && (
            <div className={`${styles.totalRow} ${styles.totalDisc}`}>
              <span>
                {m.cabang.proposalDiscountStep.replace("{pct}", handoff.discountPcts.join("% + "))}
              </span>
              <span>−{formatIDR(handoff.totalDiscountAmount)}</span>
            </div>
          )}
          {handoff.markupPct !== null && handoff.markupPct !== 0 && (
            <div className={`${styles.totalRow} ${styles.totalDisc}`}>
              <span>{m.cabang.proposalMarkup.replace("{pct}", String(handoff.markupPct))}</span>
              <span />
            </div>
          )}
          {handoff.cashDiscount > 0 && (
            <div className={`${styles.totalRow} ${styles.totalDisc}`}>
              <span>{m.cabang.proposalCashDiscount}</span>
              <span>−{formatIDR(handoff.cashDiscount)}</span>
            </div>
          )}
          <div className={`${styles.totalRow} ${styles.grand}`}>
            <span>{m.cabang.proposalGrandTotal}</span>
            <span>{formatIDR(handoff.finalAmount)}</span>
          </div>
        </div>

        <p className={styles.note}>{m.cabang.proposalFootnote}</p>

        {load.phase === "error" && (
          <div className="banner bad" style={{ marginTop: 20 }}>
            {load.text}
            <div style={{ marginTop: 6 }}>{m.cabang.proposalProfilesMissing}</div>
          </div>
        )}

        {products.map((p) => (
          <section className={styles.product} key={p.id}>
            <div className={styles.productHead}>
              <h2 className={styles.productName}>{p.name}</h2>
              {p.code && <span className={styles.productCode}>{p.code}</span>}
            </div>

            {p.photos[0] && (
              // eslint-disable-next-line @next/next/no-img-element -- URL publik Supabase Storage
              <img className={styles.hero} src={p.photos[0]} alt={p.name} />
            )}

            {(p.size || p.category) && (
              <div className={styles.specs}>
                {p.size && (
                  <div className={styles.specRow}>
                    <span className={styles.specKey}>{m.cabang.proposalSpecSize}</span>
                    <span className={styles.specVal}>{p.size}</span>
                  </div>
                )}
                {p.category && (
                  <div className={styles.specRow}>
                    <span className={styles.specKey}>{m.cabang.proposalSpecCategory}</span>
                    <span className={styles.specVal}>{p.category}</span>
                  </div>
                )}
              </div>
            )}

            {p.description && <p className={styles.desc}>{p.description}</p>}

            {p.photos.length > 1 && (
              <div className={styles.gallery}>
                {p.photos.slice(1).map((url) => (
                  // eslint-disable-next-line @next/next/no-img-element -- URL publik Supabase Storage
                  <img className={styles.galleryImg} src={url} alt={p.name} key={url} />
                ))}
              </div>
            )}
          </section>
        ))}
      </article>
    </>
  );
}
