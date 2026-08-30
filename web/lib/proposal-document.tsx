"use client";

/**
 * Dokumen Proposal — halaman sampul, lalu ringkasan pilihan + angka, lalu
 * satu profil produk per halaman (foto besar, ukuran, deskripsi, galeri).
 *
 * Komponen ini dipasang di DUA area (cabang & admin), jadi mengikuti aturan
 * rumah untuk komponen dua-area (sama seperti lib/order-item-picker.tsx dan
 * lib/kalkulator-client.tsx): teksnya dari slice `common`, sedangkan yang
 * berbeda per area — Server Action pemuat produk dan tujuan tombol kembali —
 * datang sebagai prop. Dengan begitu tidak ada satu pun kunci `admin.*` atau
 * `cabang.*` yang bocor ke sini.
 *
 * Aturan yang mengikat layar ini:
 *   - TIDAK menulis apa pun ke database (lihat lib/proposal-shared.ts).
 *   - Angka TIDAK dihitung ulang di sini. Subtotal, total diskon, dan total
 *     akhir datang apa adanya dari hand-off yang ditulis Kalkulator, yang
 *     memakai computeChainFinal() — satu-satunya rumus yang sah
 *     (calculator-shared.ts: kalikan berurutan, SATU kali round di akhir).
 *     Rumus kedua di sini adalah cara paling mudah membuat kertas yang
 *     dipegang pelanggan meleset beberapa rupiah dari layar staf. Yang
 *     dihitung di sini HANYA jumlah per baris (unitPrice × qty).
 *   - Profil produk diambil SEGAR dari database; kalau gagal, ringkasannya
 *     tetap tercetak dan kegagalannya DIKATAKAN (LESSONS #10) — bukan
 *     dokumen yang diam-diam kehilangan halaman isi.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCommonMessages } from "@/lib/i18n/provider";
import { formatIDR } from "@/lib/orders-shared";
import { COMPANY_INFO } from "@/lib/company-info";
import {
  readProposalHandoff,
  type ProposalHandoff,
  type ProposalLoadResult,
  type ProposalProduct,
} from "@/lib/proposal-shared";
import styles from "./proposal-document.module.css";

type LoadState =
  | { phase: "loading" }
  | { phase: "ready"; products: ProposalProduct[] }
  | { phase: "error"; text: string };

export default function ProposalDocument({
  loadProducts,
  backHref,
}: {
  /** Server Action pemuat profil produk milik area pemasang (gerbangnya sendiri). */
  loadProducts: (productIds: string[]) => Promise<ProposalLoadResult>;
  /** Tujuan tombol "kembali" — kalkulator area pemasang. */
  backHref: string;
}) {
  const m = useCommonMessages();
  const [handoff, setHandoff] = useState<ProposalHandoff | null>(null);
  const [ready, setReady] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [load, setLoad] = useState<LoadState>({ phase: "loading" });

  // localStorage hanya ada di browser — dibaca sesudah hidrasi, bukan saat
  // render pertama (server tidak punya nilainya; menebaknya = hydration mismatch).
  useEffect(() => {
    const h = readProposalHandoff();
    setHandoff(h);
    setCustomerName(h?.customerName ?? "");
    setReady(true);
  }, []);

  useEffect(() => {
    if (!handoff) return;
    let alive = true;
    loadProducts(handoff.lines.map((l) => l.productId))
      .then((res) => {
        if (!alive) return;
        if (res.ok) {
          setLoad({ phase: "ready", products: res.products });
          return;
        }
        setLoad({
          phase: "error",
          text: res.reason === "catalog-closed" ? m.proposalCatalogClosed : m.proposalLoadFailed,
        });
      })
      // Server Action yang ditolak/putus di tengah TIDAK boleh meninggalkan
      // layar di "Memuat…" selamanya (audit 2026-08-29, dua kasus yang sama).
      .catch(() => {
        if (alive) setLoad({ phase: "error", text: m.proposalLoadFailed });
      });
    return () => {
      alive = false;
    };
  }, [handoff, loadProducts, m]);

  if (!ready) return null;

  if (!handoff) {
    return (
      <main className="pwrap">
        <div className="card">
          <h2>{m.proposalEmptyTitle}</h2>
          <p className="sub">{m.proposalEmptyBody}</p>
          <div className="btnrow" style={{ marginTop: 14 }}>
            <Link href={backHref} className="btn primary">
              {m.proposalBackCta}
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
  const products = load.phase === "ready" ? load.products : [];
  // Foto sampul untuk halaman judul: foto produk pertama yang punya foto.
  // Tanpa foto sama sekali, halaman judul tetap sah — judulnya saja.
  const coverPhoto = products.find((p) => p.photos.length > 0)?.photos[0];

  return (
    <>
      {/* `styles.noprint`, BUKAN string "noprint": nama kelas di CSS Module
          di-hash, jadi kelas global bernama sama tidak akan pernah cocok. */}
      <div className={`${styles.bar} ${styles.noprint}`}>
        <Link href={backHref} className="btn sm">
          {m.proposalBackCta}
        </Link>
        <input
          className={styles.nameField}
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          placeholder={m.proposalCustomerPlaceholder}
          aria-label={m.proposalForLabel}
        />
        <button type="button" className="btn primary" onClick={() => window.print()}>
          {m.proposalPrintCta}
        </button>
      </div>

      <article className={styles.sheet}>
        {/* ── Sampul ─────────────────────────────────────────────────── */}
        <section className={styles.cover}>
          <div className={styles.coverTop}>
            {/* eslint-disable-next-line @next/next/no-img-element -- aset publik /brand, bukan foto yang butuh optimasi next/image */}
            <img className={styles.coverLogo} src="/brand/sanci-logo.png" alt={lh.brand} />
            <span className={styles.coverDate}>{dateText}</span>
          </div>

          {coverPhoto && (
            // eslint-disable-next-line @next/next/no-img-element -- URL publik Supabase Storage
            <img className={styles.coverImg} src={coverPhoto} alt="" />
          )}

          <h1 className={styles.coverTitle}>{m.proposalTitle}</h1>
          <p className={styles.coverSub}>{m.proposalSubtitle}</p>

          {customerName.trim() && (
            <p className={styles.coverFor}>
              <span className={styles.eyebrow}>{m.proposalForLabel}</span>
              <span className={styles.coverForName}>{customerName.trim()}</span>
            </p>
          )}
        </section>

        {/* ── Ringkasan pilihan ──────────────────────────────────────── */}
        <section className={styles.summary}>
          <h2 className={styles.secTitle}>
            <span className={styles.secIndex}>01</span>
            {m.proposalSelectionTitle}
          </h2>

          <table className={styles.items}>
            <thead>
              <tr>
                <th aria-hidden="true" />
                <th>{m.proposalColItem}</th>
                <th className={styles.num}>{m.proposalColQty}</th>
                <th className={styles.num}>{m.proposalColUnit}</th>
                <th className={styles.num}>{m.proposalColTotal}</th>
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
                        // eslint-disable-next-line @next/next/no-img-element -- URL publik Supabase Storage
                        <img className={styles.thumb} src={cover} alt="" />
                      ) : (
                        <span className={styles.thumb} aria-hidden="true" />
                      )}
                    </td>
                    <td>
                      <div className={styles.itemName}>{line.name}</div>
                      {(line.code || prod?.size) && (
                        <div className={styles.itemMeta}>
                          {[line.code, prod?.size].filter(Boolean).join("  ·  ")}
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
              <span>{m.proposalSubtotal}</span>
              <span>{formatIDR(handoff.subtotal)}</span>
            </div>
            {/* Rantai diskon dirangkum SATU baris ("10% + 5%") dengan rupiah
                totalnya. Memecah rupiah per langkah adalah bahasa alat hitung
                staf; pelanggan cuma perlu tahu berapa potongannya dan berapa
                akhirnya — dan satu baris berarti tidak ada angka per-langkah
                yang perlu dihitung ulang di sini. */}
            {handoff.discountPcts.length > 0 && (
              <div className={`${styles.totalRow} ${styles.totalDisc}`}>
                <span>{m.proposalDiscountStep.replace("{pct}", handoff.discountPcts.join("% + "))}</span>
                <span>−{formatIDR(handoff.totalDiscountAmount)}</span>
              </div>
            )}
            {handoff.markupPct !== null && handoff.markupPct !== 0 && (
              <div className={`${styles.totalRow} ${styles.totalDisc}`}>
                <span>{m.proposalMarkup.replace("{pct}", String(handoff.markupPct))}</span>
                <span />
              </div>
            )}
            {handoff.cashDiscount > 0 && (
              <div className={`${styles.totalRow} ${styles.totalDisc}`}>
                <span>{m.proposalCashDiscount}</span>
                <span>−{formatIDR(handoff.cashDiscount)}</span>
              </div>
            )}
            <div className={`${styles.totalRow} ${styles.grand}`}>
              <span>{m.proposalGrandTotal}</span>
              <span>{formatIDR(handoff.finalAmount)}</span>
            </div>
          </div>

          <p className={styles.note}>{m.proposalFootnote}</p>

          {load.phase === "error" && (
            <div className="banner bad" style={{ marginTop: 20 }}>
              {load.text}
              <div style={{ marginTop: 6 }}>{m.proposalProfilesMissing}</div>
            </div>
          )}
        </section>

        {/* ── Profil produk, satu per halaman ────────────────────────── */}
        {products.map((p, i) => (
          <section className={styles.product} key={p.id}>
            <div className={styles.productHead}>
              <span className={styles.secIndex}>{String(i + 2).padStart(2, "0")}</span>
              <h2 className={styles.productName}>{p.name}</h2>
              {p.code && <span className={styles.productCode}>{p.code}</span>}
            </div>

            {p.photos[0] && (
              // eslint-disable-next-line @next/next/no-img-element -- URL publik Supabase Storage
              <img className={styles.hero} src={p.photos[0]} alt={p.name} />
            )}

            <div className={styles.productBody}>
              <div className={styles.specs}>
                {p.size && (
                  <div className={styles.specRow}>
                    <span className={styles.specKey}>{m.proposalSpecSize}</span>
                    <span className={styles.specVal}>{p.size}</span>
                  </div>
                )}
                {p.category && (
                  <div className={styles.specRow}>
                    <span className={styles.specKey}>{m.proposalSpecCategory}</span>
                    <span className={styles.specVal}>{p.category}</span>
                  </div>
                )}
              </div>
              {p.description && <p className={styles.desc}>{p.description}</p>}
            </div>

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
