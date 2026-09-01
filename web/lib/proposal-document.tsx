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

/**
 * Tiga susunan halaman produk yang dipakai bergiliran. Bukan hiasan: tiga
 * halaman berturut-turut yang identik membuat dokumen terbaca sebagai daftar
 * yang panjang, dan mata berhenti memperhatikan. Isinya sama di ketiganya.
 *   01 foto memimpin  — foto selebar halaman di atas, teks dua kolom di bawah
 *   02 terbelah       — foto tegak di kiri, seluruh teks menumpuk di kanan
 *   03 teks memimpin  — cerita di kiri, foto tinggi di kanan, spesifikasi
 *                       jadi pita selebar halaman di dasar
 *   04 foto menutup   — kebalikan irama 01: teks dulu, foto di dasar
 *   05, 06            — cermin dari 02 dan 03
 *
 * Produk KETUJUH baru mengulang susunan produk pertama, dan di antara
 * keduanya ada halaman galeri, jadi jaraknya belasan halaman. Majalah pun
 * bekerja begitu: sejumlah kecil master yang diputar, bukan tiap halaman
 * didesain ulang sendiri-sendiri.
 */
const LAYOUTS = [
  styles.layoutHero,
  styles.layoutSplit,
  styles.layoutStory,
  styles.layoutHeroEnd,
  styles.layoutSplitMirror,
  styles.layoutStoryMirror,
];

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
        // Kunci React WAJIB (productId, colorCode), bukan productId saja:
        // sejak keranjang bisa memuat "sofa Cream" dan "sofa Abu" sebagai
        // dua baris, productId tidak lagi unik di dalam daftar ini.
        key: `${line.productId}::${line.colorCode ?? ""}`,
      };
    });
  }, [handoff, load]);

  /**
   * Halaman profil produk — SATU per produk BERBEDA, bukan satu per baris.
   *
   * Kenapa dipisah dari `rows`: dua warna dari sofa yang sama adalah DUA
   * pilihan (dan memang dua baris di daftar pilihan + dua baris harga), tapi
   * profilnya SATU — foto, deskripsi, ukuran, dan kategorinya identik.
   * Mencetaknya dua kali menghasilkan dua lembar A4 yang sama persis di
   * dalam buku yang dipegang pelanggan; itu terbaca sebagai kesalahan cetak,
   * bukan sebagai kelengkapan.
   *
   * `no` diambil dari nomor baris PERTAMA produk itu di daftar pilihan
   * supaya nomor 01/02/03 di halaman produk tetap merujuk ke daftar yang
   * sama seperti sebelumnya. `colors` mengumpulkan SEMUA warna yang dipilih
   * untuk produk itu (urut kemunculan, tanpa duplikat) — di situlah pembaca
   * halaman ini melihat bahwa dua pilihannya sama-sama tercakup.
   */
  const productPages = useMemo(() => {
    const byProduct = new Map<
      string,
      { row: (typeof rows)[number]; no: number; colors: string[] }
    >();
    rows.forEach((r, i) => {
      const existing = byProduct.get(r.line.productId);
      const color = r.line.colorCode;
      if (!existing) {
        byProduct.set(r.line.productId, { row: r, no: i + 1, colors: color ? [color] : [] });
        return;
      }
      if (color && !existing.colors.includes(color)) existing.colors.push(color);
    });
    return Array.from(byProduct.values());
  }, [rows]);

  /**
   * Produk yang BERHASIL dimuat tapi profilnya tidak ikut pulang (audit
   * 2026-08-31). Penyebab nyatanya bukan kegagalan jaringan — pemuatan itu
   * `ok:true`, cuma isinya lebih sedikit dari yang diminta:
   *   - SANCI menandai produknya INACTIVE sesudah staf memasukkannya ke
   *     keranjang (keranjang kalkulator adalah draf localStorage yang bisa
   *     berumur berhari-hari), atau produknya dihapus;
   *   - katalog toko ini ditutup di tengah jalan, jadi RLS memulangkan
   *     barisnya kosong.
   *
   * Sebelum perbaikan ini halaman produknya TETAP dicetak — dengan nomor dan
   * nama saja, tanpa foto/deskripsi/ukuran/kategori — dan tidak ada satu
   * kalimat pun di layar yang mengatakannya. Staf mencetak selembar A4 nyaris
   * kosong dan menyerahkannya ke pelanggan.
   *
   * Sekarang: halaman profilnya TIDAK dicetak (selembar kosong lebih buruk
   * daripada tidak ada lembar), barisnya TETAP utuh di daftar pilihan dan
   * ringkasan harga (staf memang memilihnya, dan harganya ada di sana), dan
   * layar mengatakan produk mana yang kehilangan halaman profil — di banner
   * `noprint`, jadi tidak pernah ikut tercetak (LESSONS #10).
   */
  // Diturunkan dari productPages, BUKAN rows: satu produk yang dipilih dalam
  // dua warna kehilangan SATU halaman profil, bukan dua, dan menyebut namanya
  // dua kali di banner hanya membuat staf mengira ada dua masalah.
  const missingProfiles =
    load.phase === "ready" ? productPages.filter((pg) => !pg.row.product).map((pg) => pg.row.line.name) : [];

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
  /**
   * Foto sampul: foto pertama dari baris BERNILAI TERTINGGI, bukan baris
   * pertama. Urutan keranjang cuma mencatat produk mana yang kebetulan
   * ditambahkan staf lebih dulu — memakai itu berarti sampulnya ditentukan
   * kebetulan. Barang termahal biasanya pusat ruangannya (ranjang, sofa) dan
   * hal yang paling ingin dilihat pelanggan lebih dulu. Kalau baris termahal
   * belum berfoto, mundur ke foto pertama yang ADA supaya sampulnya tidak
   * kosong hanya karena satu produk belum difoto.
   */
  const coverPhoto =
    rows
      .filter((r) => r.photos.length > 0)
      .reduce<(typeof rows)[number] | null>(
        (best, r) => (!best || r.amount > best.amount ? r : best),
        null
      )?.photos[0] ?? heroPhotos[0];

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
          {/* Susunan TEGAK, bukan dua kolom. Foto katalog SANCI adalah
              gambar potong yang LEBAR; ditaruh di kolom kanan setinggi
              halaman ia cuma mengisi sepertiga tingginya dan sisanya
              menganga — persis "tengahnya kosong" yang dikeluhkan owner.
              Selebar halaman, ia mengisi ruangnya sendiri. */}
          <div className={styles.coverTop}>
            <span className={styles.wordmark}>
              {/* eslint-disable-next-line @next/next/no-img-element -- aset merek publik */}
              <img src={LOGO} alt={lh.brand} />
            </span>
            <p className={styles.eyebrow}>{m.proposalCoverKicker}</p>
          </div>

          <h1 className={styles.coverTitle}>{m.proposalTitle}</h1>
          <p className={styles.coverSub}>{m.proposalCoverSub}</p>

          <Photo
            src={coverPhoto}
            alt={rows[0]?.line.name ?? lh.brand}
            className={styles.coverImage}
            eager
          />

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

          {/* Kontak pindah ke SAMPUL, dan halaman penutup dihapus (arahan
              owner 2026-08-31: penutupnya terlalu kosong dan sampulnya juga
              setengah kosong — dua halaman setengah isi digabung jadi satu
              yang penuh). Ada untungnya juga: pelanggan melihat cara
              menghubungi toko begitu membuka dokumen, bukan sesudah membalik
              sembilan halaman. */}
          <div className={styles.coverFoot}>
            <div>
              <p className={styles.eyebrow}>{m.proposalContactShowroom}</p>
              <p className={styles.coverFootValue}>{lh.name}</p>
            </div>
            <div>
              <p className={styles.eyebrow}>{m.proposalContactLabel}</p>
              <p className={`${styles.coverFootValue} ${styles.contactPhone}`}>
                {lh.phone ? `WhatsApp · ${lh.phone}` : lh.website}
              </p>
            </div>
            <p className={styles.coverFootThanks}>{m.proposalThanksBody}</p>
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
              <article className={styles.selRow} key={r.key}>
                <span className={styles.selNo}>{String(i + 1).padStart(2, "0")}</span>
                <Photo src={r.photos[0]} alt={r.line.name} className={styles.selPhoto} />
                <div>
                  <div className={styles.selName}>{r.line.name}</div>
                  {r.line.code && <p className={styles.selCode}>{r.line.code}</p>}
                  {/* Warna ditaruh di baris SENDIRI, bukan disambung ke nama:
                      dua baris yang hanya berbeda warna harus bisa dibedakan
                      sekilas oleh pelanggan yang memegang kertas ini. Bidang
                      kosong tetap disembunyikan seluruhnya (aturan dokumen
                      ini) — produk tanpa warna tidak mendapat baris kosong. */}
                  {r.line.colorCode && (
                    <p className={styles.selCode}>
                      {m.color}: {r.line.colorCode}
                    </p>
                  )}
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
                <div className={styles.sumLine} key={`s-${r.key}`}>
                  <Photo src={r.photos[0]} alt={r.line.name} className={styles.sumLineArt} />
                  <div>
                    <div className={styles.sumLineName}>{r.line.name}</div>
                    {r.line.code && <p className={styles.selCode}>{r.line.code}</p>}
                    {/* Tanpa ini, "sofa ×2" dan "sofa ×3" di daftar yang
                        dijumlahkan terbaca sebagai satu produk yang tercetak
                        dua kali karena salah. */}
                    {r.line.colorCode && (
                      <p className={styles.selCode}>
                        {m.color}: {r.line.colorCode}
                      </p>
                    )}
                  </div>
                  <span className={`${styles.sumLineQty} ${styles.num}`}>× {r.line.qty}</span>
                </div>
              ))}
            </div>
          </div>
        </Sheet>

        {/* ── Tiap produk: pembuka, rincian, galeri ──────────────── */}
        {productPages.map((page, i) => {
          const r = page.row;
          const p = r.product;
          // Profil tidak ikut pulang = TIDAK ada halaman produk (lihat
          // missingProfiles di atas). Nomor yang DICETAK adalah `page.no`
          // (nomor baris pertama produk itu di daftar pilihan), BUKAN `i` —
          // `i` di sini menghitung halaman produk yang benar-benar disusun,
          // dan sejak halaman didedupe per produk keduanya tidak lagi sama.
          // `i` tetap dipakai untuk memutar tata letak dan cermin galeri,
          // yang memang soal irama halaman, bukan penomoran.
          if (!p) return null;
          const desc = p?.description?.trim();
          /**
           * Foto KEDUA ikut di halaman produk, bukan membuka halaman galeri
           * sendiri: galeri berisi satu ubin menyisakan sebagian besar
           * halaman kosong — persis "halaman yang tidak mengatakan apa-apa"
           * yang sudah dua kali diminta owner untuk dibuang. Galeri baru
           * muncul mulai foto KETIGA.
           */
          const second = r.photos[1];
          const gallery = r.photos.slice(2);
          return (
            <div key={`p-${r.line.productId}`} /* productId sudah unik di productPages */>
              {/* SATU halaman per produk, bukan dua. Versi sebelumnya memisah
                  "pembuka" dan "rincian", dan hasilnya pada data sungguhan:
                  nama produk tercetak tiga kali (judul pembuka, kicker
                  rincian, judul rincian), ukuran/kode/kategori tercetak dua
                  kali, dan halaman rincian yang isinya pendek menyisakan
                  sekitar enam per sepuluh halaman kosong. Digabung, tiap
                  keterangan muncul TEPAT SEKALI dan halamannya terisi. */}
              <Sheet n={next()}>
                {/* Tata letak BERGANTI tiap produk (arahan owner 2026-08-31,
                    dan §36 spesifikasi aslinya): tiga produk berturut-turut
                    dengan susunan identik terbaca sebagai tabel, bukan
                    majalah. Ketiganya memakai bahan yang sama persis —
                    nomor, nama, kode, foto, deskripsi, spesifikasi — hanya
                    susunannya yang berbeda, jadi tidak ada produk yang
                    mendapat keterangan lebih sedikit daripada yang lain. */}
                <div className={`${styles.prodPage} ${LAYOUTS[i % LAYOUTS.length]}`}>
                  <div className={styles.prodHead}>
                    <span className={styles.prodNo}>{String(page.no).padStart(2, "0")}</span>
                    <div>
                      <h2 className={styles.prodTitle}>{r.line.name}</h2>
                      {r.line.code && <p className={styles.prodCode}>{r.line.code}</p>}
                    </div>
                  </div>

                  <Photo src={r.photos[0]} alt={r.line.name} className={styles.prodPhoto} />

                  {second && (
                    <Photo src={second} alt={r.line.name} className={styles.prodPhoto2} />
                  )}

                  <div className={styles.prodText}>
                    {desc && (
                      <>
                        <p className={styles.eyebrow}>{m.proposalAboutLabel}</p>
                        <p className={styles.heroDesc}>{desc}</p>
                      </>
                    )}
                  </div>

                  {(p?.size || p?.category || page.colors.length > 0) && (
                    <dl className={styles.prodSpec}>
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
                      {/* Di sinilah halaman yang SATU ini mengatakan bahwa
                          kedua pilihan warna pelanggan tercakup — tanpa baris
                          ini, dedupe halaman akan terbaca sebagai "warna
                          keduanya hilang". Kosong = tidak dicetak sama
                          sekali, seperti bidang lain di dokumen ini. */}
                      {page.colors.length > 0 && (
                        <div className={styles.detailRow}>
                          <dt className={styles.detailLabel}>{m.proposalSpecColorsChosen}</dt>
                          <dd className={styles.detailValue}>{page.colors.join(" · ")}</dd>
                        </div>
                      )}
                    </dl>
                  )}
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
                  <div className={`${styles.gallery} ${galleryShape(gallery.length)}${i % 2 ? ` ${styles.galMirror}` : ""}`}>
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

        {load.phase === "error" && (
          <div className="banner bad noprint" style={{ maxWidth: 900, margin: "0 auto 34px" }}>
            {load.text}
            <div style={{ marginTop: 6 }}>{m.proposalProfilesMissing}</div>
          </div>
        )}

        {/* Sebagian produk kehilangan halaman profilnya — beda keadaan dari
            banner di atas (pemuatannya BERHASIL, isinya yang kurang), jadi
            kalimatnya sendiri dan warnanya `info`, bukan `bad`. `noprint`:
            ini pesan untuk staf, bukan untuk pelanggan yang memegang kertas. */}
        {missingProfiles.length > 0 && (
          <div className="banner info noprint" style={{ maxWidth: 900, margin: "0 auto 34px" }}>
            {m.proposalProfilesPartial
              .replace("{n}", String(missingProfiles.length))
              .replace("{names}", missingProfiles.join(", "))}
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
