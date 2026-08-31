"use client";

/**
 * Dokumen Proposal — buku proposal pelanggan bergaya editorial furnitur,
 * dirakit dari keranjang Kalkulator dan data katalog SANCI yang sesungguhnya.
 *
 * Bahasa visualnya mengikuti prototipe HTML milik owner (30-08-2026,
 * "SANCI Proposal — Premium Furniture Editorial"): lembar A4 sungguhan,
 * kertas gading, tipografi serif besar, foto besar, ruang kosong lebar.
 * Yang BERBEDA dari prototipe itu, dan sengaja:
 *
 *   1. Foto memakai foto produk SANCI dari product_photos, bukan gambar stok
 *      Unsplash. Gambar stok adalah furnitur milik orang lain — dokumen yang
 *      dibawa pelanggan tidak boleh memperlihatkannya sebagai produk SANCI.
 *   2. Setiap produk mendapat perlakuan yang SAMA (pembuka, rincian, galeri
 *      sesuai jumlah fotonya), bukan hanya produk pertama.
 *   3. Semua teks dari slice `common` supaya komponen ini bisa dipasang di
 *      /cabang maupun /admin (aturan rumah untuk komponen dua-area).
 *
 * Aturan keras yang mengikat layar ini:
 *   - TIDAK menulis apa pun ke database (lihat lib/proposal-shared.ts).
 *   - Angka TIDAK dihitung ulang. Subtotal, total diskon, dan harga akhir
 *     datang apa adanya dari hand-off Kalkulator, yang memakai
 *     computeChainFinal() — satu-satunya rumus yang sah. Rumus kedua di sini
 *     adalah cara paling mudah membuat kertas yang dipegang pelanggan meleset
 *     beberapa rupiah dari layar staf. Yang dihitung di sini HANYA jumlah per
 *     baris (unitPrice × qty), angka yang tidak ada di hand-off dan tidak
 *     masuk rantai mana pun.
 *   - Bidang kosong DISEMBUNYIKAN seluruhnya — tidak pernah "N/A", "-", atau
 *     "Rp 0".
 *   - Tidak ada klaim produk yang dikarang: setiap kalimat tentang produk
 *     berasal dari kolom description milik katalog.
 */

import { useEffect, useMemo, useRef, useState } from "react";
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
import { shrinkPhotosForPrint } from "@/lib/shrink-photos-for-print";
import styles from "./proposal-document.module.css";

const LOGO = "/brand/sanci-logo.png";

type LoadState =
  | { phase: "loading" }
  | { phase: "ready"; products: ProposalProduct[] }
  | { phase: "error"; text: string };

/** Satu lembar A4. `n` null = tanpa nomor halaman (sampul). */
function Sheet({ children, n }: { children: React.ReactNode; n: number | null }) {
  return (
    <section className={styles.sheet}>
      <div className={styles.inner}>
        {children}
        <span className={styles.pgBrand}>SANCI Proposal</span>
        {n !== null && <span className={styles.pgNo}>{String(n).padStart(2, "0")}</span>}
      </div>
    </section>
  );
}

/** Foto produk, atau bidang gading tenang kalau produk itu belum berfoto. */
function Photo({
  src,
  alt,
  className,
  eager,
}: {
  src: string | undefined;
  alt: string;
  className: string;
  eager?: boolean;
}) {
  return (
    <div className={className}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL publik Supabase Storage, pola sama dengan seluruh layar katalog
        <img src={src} alt={alt} loading={eager ? "eager" : "lazy"} decoding="async" />
      ) : (
        <span className={styles.noPhoto} aria-hidden="true" />
      )}
    </div>
  );
}

export default function ProposalDocument({
  loadProducts,
  backHref,
}: {
  /** Server Action pemuat profil produk milik area pemasang (gerbangnya sendiri). */
  loadProducts: (productIds: string[]) => Promise<ProposalLoadResult>;
  /** Tujuan tombol kembali — kalkulator area pemasang. */
  backHref: string;
}) {
  const m = useCommonMessages();
  const [handoff, setHandoff] = useState<ProposalHandoff | null>(null);
  const [ready, setReady] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [load, setLoad] = useState<LoadState>({ phase: "loading" });
  /** Sedang menyiapkan cetakan (menurunkan resolusi foto) — tombol dikunci. */
  const [printing, setPrinting] = useState(false);
  const docRef = useRef<HTMLElement | null>(null);

  /**
   * Foto diturunkan resolusinya seukuran cetak, baru dialog cetak dibuka,
   * lalu dikembalikan. Alasannya diukur, bukan dikira: Chrome menanam gambar
   * pada resolusi ASLI berapa pun ukuran tampilnya (lihat
   * lib/shrink-photos-for-print.ts). Kegagalan apa pun di jalur ini TIDAK
   * boleh menghalangi mencetak — paling buruk berkasnya lebih besar.
   */
  async function handlePrint() {
    if (printing) return;
    setPrinting(true);
    let undo: (() => void) | null = null;
    try {
      if (docRef.current) undo = await shrinkPhotosForPrint(docRef.current);
      window.print();
    } catch {
      window.print();
    } finally {
      undo?.();
      setPrinting(false);
    }
  }

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

  /**
   * Baris pilihan digabung dengan profil produknya, sekali saja.
   * Daftar produk diturunkan DI DALAM memo, bukan di badan komponen: di luar
   * sini `load.phase !== "ready"` menghasilkan array baru tiap render, dan
   * memo yang bergantung padanya tidak pernah benar-benar menahan apa pun.
   */
  const rows = useMemo(() => {
    if (!handoff) return [];
    const products = load.phase === "ready" ? load.products : [];
    return handoff.lines.map((line) => {
      const product = products.find((x) => x.id === line.productId);
      return {
        line,
        product,
        amount: line.unitPrice * line.qty,
        photos: product?.photos ?? [],
      };
    });
  }, [handoff, load]);

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
  const who = customerName.trim();
  const heroPhotos = rows.flatMap((r) => r.photos);

  // Nomor halaman dihitung sambil menyusun: sampul tidak bernomor, sisanya
  // berurutan berapa pun jumlah produk dan fotonya.
  let pageNo = 1;
  const next = () => ++pageNo;

  const totals = (
    <>
      <div className={styles.moneyRow}>
        <span className={styles.micro}>{m.proposalSubtotal}</span>
        <strong className={styles.num}>{formatIDR(handoff.subtotal)}</strong>
      </div>
      {handoff.discountPcts.length > 0 && (
        <div className={styles.moneyRow}>
          <span className={styles.micro}>
            {m.proposalDiscountStep.replace("{pct}", handoff.discountPcts.join("% + "))}
          </span>
          <strong className={styles.num}>− {formatIDR(handoff.totalDiscountAmount)}</strong>
        </div>
      )}
      {handoff.cashDiscount > 0 && (
        <div className={styles.moneyRow}>
          <span className={styles.micro}>{m.proposalCashDiscount}</span>
          <strong className={styles.num}>− {formatIDR(handoff.cashDiscount)}</strong>
        </div>
      )}
      <div className={styles.moneyFinal}>
        <p className={styles.priceLabel}>{m.proposalFinalPrice}</p>
        <p className={`${styles.value} ${styles.num}`}>{formatIDR(handoff.finalAmount)}</p>
      </div>
    </>
  );

  return (
    <div className={styles.wrap}>
      <header className={`${styles.bar} noprint`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- aset merek publik */}
        <img src={LOGO} alt={lh.brand} style={{ height: 15, width: "auto", display: "block" }} />
        <span className={styles.barSpacer} />
        <input
          className={styles.nameField}
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          placeholder={m.proposalCustomerPlaceholder}
          aria-label={m.proposalForLabel}
        />
        <Link href={backHref} className={styles.tool}>
          {m.proposalBackCta}
        </Link>
        <button
          type="button"
          className={`${styles.tool} ${styles.toolPrimary}`}
          disabled={printing}
          onClick={handlePrint}
        >
          {printing ? m.proposalPrintPreparing : m.proposalPrintCta}
        </button>
      </header>

      <main className={styles.doc} ref={docRef}>
        {/* ── Sampul ─────────────────────────────────────────────── */}
        <Sheet n={null}>
          <div className={styles.coverGrid}>
            <div className={styles.coverCopy}>
              <span className={styles.wordmark}>
                {/* eslint-disable-next-line @next/next/no-img-element -- aset merek publik */}
                <img src={LOGO} alt={lh.brand} />
              </span>
              <div>
                <p className={styles.eyebrow}>{m.proposalCoverKicker}</p>
                <h1 className={styles.coverTitle}>{m.proposalTitle}</h1>
                <p className={styles.coverSub}>{m.proposalCoverSub}</p>
              </div>
              <div className={styles.coverMeta}>
                {who && (
                  <div>
                    <p className={styles.eyebrow}>{m.proposalForLabel}</p>
                    <p className={styles.coverName}>{who}</p>
                  </div>
                )}
                <div>
                  <p className={styles.eyebrow}>{m.proposalMetaDate}</p>
                  <p className={styles.coverDate}>{dateText}</p>
                </div>
              </div>
            </div>
            <Photo
              src={heroPhotos[0]}
              alt={rows[0]?.line.name ?? lh.brand}
              className={styles.coverImage}
              eager
            />
          </div>
        </Sheet>

        {/* ── Pengantar ──────────────────────────────────────────── */}
        <Sheet n={next()}>
          <div className={styles.introGrid}>
            <div>
              <p className={styles.eyebrow}>{m.proposalForLabel}</p>
              <h2 className={styles.introTitle}>{m.proposalIntroTitle}</h2>
              {who && <p className={styles.clientName}>{who}</p>}
              <p className={styles.introNote}>{m.proposalIntroNote}</p>
            </div>
            <div className={styles.metaStack}>
              <div className={styles.metaRow}>
                <p className={styles.metaLabel}>{m.proposalMetaDate}</p>
                <p className={`${styles.metaValue} ${styles.num}`}>{dateText}</p>
              </div>
              <div className={styles.metaRow}>
                <p className={styles.metaLabel}>{m.proposalMetaBy}</p>
                <p className={styles.metaValue}>{lh.name}</p>
              </div>
              <div className={styles.metaRow}>
                <p className={styles.metaLabel}>{m.proposalMetaCount}</p>
                <p className={`${styles.metaValue} ${styles.num}`}>{rows.length}</p>
              </div>
            </div>
          </div>
        </Sheet>

        {/* ── Pilihan Anda ───────────────────────────────────────── */}
        <Sheet n={next()}>
          <div className={styles.secHead}>
            <div>
              <p className={styles.eyebrow}>{m.proposalSelectionKicker}</p>
              <h2 className={styles.secTitle}>{m.proposalSelectionTitle}</h2>
            </div>
            <p className={styles.micro}>
              {m.proposalProductsCount.replace("{n}", String(rows.length))}
            </p>
          </div>

          <div className={styles.selList}>
            {rows.map((r, i) => (
              <article className={styles.selRow} key={r.line.productId}>
                <span className={styles.selNo}>{String(i + 1).padStart(2, "0")}</span>
                <Photo src={r.photos[0]} alt={r.line.name} className={styles.selPhoto} />
                <div>
                  <div className={styles.selName}>{r.line.name}</div>
                  {r.line.code && <p className={styles.selCode}>{r.line.code}</p>}
                  {r.product?.size && <p className={styles.selSize}>{r.product.size}</p>}
                </div>
                <div>
                  <p className={styles.priceLabel}>{m.proposalColQty}</p>
                  <p className={`${styles.priceValue} ${styles.num}`}>{r.line.qty}</p>
                </div>
                <div>
                  <p className={styles.priceLabel}>{m.proposalColUnit}</p>
                  <p className={`${styles.priceValue} ${styles.num}`}>{formatIDR(r.line.unitPrice)}</p>
                </div>
                <div>
                  <p className={styles.priceLabel}>{m.proposalColTotal}</p>
                  <p className={`${styles.priceValue} ${styles.priceStrong} ${styles.num}`}>
                    {formatIDR(r.amount)}
                  </p>
                </div>
              </article>
            ))}
          </div>

          <div className={styles.selTotal}>
            <div className={styles.selTotalBox}>{totals}</div>
          </div>
        </Sheet>

        {/* ── Ringkasan harga ────────────────────────────────────── */}
        <Sheet n={next()}>
          <div className={styles.sumLayout}>
            <div className={styles.sumCopy}>
              <p className={styles.eyebrow}>{m.proposalSummaryKicker}</p>
              <h2 className={styles.sumTitle}>{m.proposalSummaryTitle}</h2>
              <div className={styles.metaStack}>
                <div className={styles.moneyRow}>
                  <span className={styles.micro}>{m.proposalMetaCount}</span>
                  <strong className={styles.num}>{rows.length}</strong>
                </div>
                {totals}
              </div>
              <p className={styles.sumNote}>{m.proposalFootnote}</p>
            </div>
            {/* Dulu di sini ada SATU foto produk sebagai hiasan. Pada cetakan
                sungguhan itu berbahaya: angka besar di sebelah satu foto
                terbaca sebagai harga FOTO ITU — pelanggan bisa mengira
                Rp 133 juta adalah harga meja makannya. Diganti daftar
                SELURUH produk yang dijumlahkan, jadi totalnya jelas milik
                siapa. */}
            <div className={styles.sumList}>
              <p className={styles.eyebrow}>{m.proposalSummaryOfLabel}</p>
              {rows.map((r) => (
                <div className={styles.sumLine} key={`s-${r.line.productId}`}>
                  <Photo src={r.photos[0]} alt={r.line.name} className={styles.sumLineArt} />
                  <div>
                    <div className={styles.sumLineName}>{r.line.name}</div>
                    {r.line.code && <p className={styles.selCode}>{r.line.code}</p>}
                  </div>
                  <span className={`${styles.sumLineQty} ${styles.num}`}>× {r.line.qty}</span>
                </div>
              ))}
            </div>
          </div>
        </Sheet>

        {/* ── Tiap produk: pembuka, rincian, galeri ──────────────── */}
        {rows.map((r, i) => {
          const p = r.product;
          const desc = p?.description?.trim();
          const gallery = r.photos.slice(1);
          return (
            <div key={`p-${r.line.productId}`}>
              {/* SATU halaman per produk, bukan dua. Versi sebelumnya memisah
                  "pembuka" dan "rincian", dan hasilnya pada data sungguhan:
                  nama produk tercetak tiga kali (judul pembuka, kicker
                  rincian, judul rincian), ukuran/kode/kategori tercetak dua
                  kali, dan halaman rincian yang isinya pendek menyisakan
                  sekitar enam per sepuluh halaman kosong. Digabung, tiap
                  keterangan muncul TEPAT SEKALI dan halamannya terisi. */}
              <Sheet n={next()}>
                <div className={styles.prodHero}>
                  <div className={styles.prodHead}>
                    <span className={styles.prodNo}>{String(i + 1).padStart(2, "0")}</span>
                    <div>
                      <h2 className={styles.prodTitle}>{r.line.name}</h2>
                      {r.line.code && <p className={styles.prodCode}>{r.line.code}</p>}
                    </div>
                  </div>

                  <Photo src={r.photos[0]} alt={r.line.name} className={styles.heroPhoto} />

                  <div className={styles.prodFoot}>
                    {desc && (
                      <div className={styles.prodAbout}>
                        <p className={styles.eyebrow}>{m.proposalAboutLabel}</p>
                        <p className={styles.heroDesc}>{desc}</p>
                      </div>
                    )}
                    {(p?.size || p?.category) && (
                      <dl className={styles.detailBlock}>
                        {p?.size && (
                          <div className={styles.detailRow}>
                            <dt className={styles.detailLabel}>{m.proposalSpecSize}</dt>
                            <dd className={`${styles.detailValue} ${styles.num}`}>{p.size}</dd>
                          </div>
                        )}
                        {p?.category && (
                          <div className={styles.detailRow}>
                            <dt className={styles.detailLabel}>{m.proposalSpecCategory}</dt>
                            <dd className={styles.detailValue}>{p.category}</dd>
                          </div>
                        )}
                      </dl>
                    )}
                  </div>
                </div>
              </Sheet>

              {/* Galeri hanya kalau ada foto SELAIN foto pembuka. */}
              {gallery.length > 0 && (
                <Sheet n={next()}>
                  <div className={styles.galHead}>
                    <p className={styles.eyebrow}>
                      {m.proposalGalleryKicker.replace("{name}", r.line.name)}
                    </p>
                    <h2 className={styles.galTitle}>{m.proposalGalleryTitle}</h2>
                  </div>
                  <div className={`${styles.gallery} ${galleryShape(gallery.length)}`}>
                    {gallery.map((url) => (
                      <div className={styles.galItem} key={url}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- URL publik Supabase Storage */}
                        <img src={url} alt={r.line.name} loading="lazy" decoding="async" />
                      </div>
                    ))}
                  </div>
                </Sheet>
              )}
            </div>
          );
        })}

        {/* ── Halaman akhir ──────────────────────────────────────── */}
        <Sheet n={next()}>
          <div className={styles.finalLayout}>
            {/* Halaman penutup, TANPA angka (arahan owner 2026-08-31). Harga
                hidup di satu tempat saja: halaman Ringkasan Harga, di sebelah
                daftar produk yang dijumlahkannya. Mengulangnya di sini cuma
                menambah satu tempat lagi untuk salah baca — dan pernah persis
                begitu: total di sebelah satu foto terbaca sebagai harga foto
                itu. */}
            <div>
              <p className={styles.eyebrow}>{m.proposalFinalKicker}</p>
              <div className={styles.thanks}>
                <h2 className={styles.finalTitle}>{m.proposalThanksTitle}</h2>
                <p className={styles.thanksBody}>{m.proposalThanksBody}</p>
                <div className={styles.contact}>
                  <div>
                    <p className={styles.eyebrow}>{m.proposalContactShowroom}</p>
                    <p className={styles.contactValue}>{lh.name}</p>
                  </div>
                  <div>
                    <p className={styles.eyebrow}>{m.proposalContactLabel}</p>
                    <p className={`${styles.contactValue} ${styles.contactPhone}`}>
                      {lh.phone ? `WhatsApp · ${lh.phone}` : lh.website}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Sheet>

        {load.phase === "error" && (
          <div className="banner bad noprint" style={{ maxWidth: 900, margin: "0 auto 34px" }}>
            {load.text}
            <div style={{ marginTop: 6 }}>{m.proposalProfilesMissing}</div>
          </div>
        )}
      </main>
    </div>
  );
}

/**
 * Bentuk grid galeri mengikuti JUMLAH foto — satu grid tetap akan
 * meninggalkan lubang kosong ketika produk cuma punya dua foto. Lebih dari
 * lima foto per produk tidak mungkin sampai ke sini (dibatasi di Server
 * Action), tapi kalau batas itu kelak dinaikkan, bentuk terpadatlah yang
 * dipakai, bukan grid yang rusak.
 */
function galleryShape(count: number): string {
  if (count <= 1) return styles.gal1;
  if (count === 2) return styles.gal2;
  if (count === 3) return styles.gal3;
  if (count === 4) return styles.gal4;
  return styles.gal5;
}
