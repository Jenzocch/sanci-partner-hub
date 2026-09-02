"use client";

/**
 * Isi Pesanan di FORM pembuatan pesanan — satu komponen untuk DUA form:
 *   - /admin/orders/baru   (web/app/admin/orders/baru/new-order-form.tsx)
 *   - /cabang/pesanan/baru (web/app/cabang/pesanan/baru/new-order-form.tsx)
 *
 * Jalur ketiga masuknya baris pesanan saat PEMBUATAN (owner 2026-08-24):
 * selain salinan Package (:item:) dan hand-off Kalkulator, pengguna kini bisa
 * memilih produk langsung di form lewat picker modal ini. Penulisan ke
 * order_items dilakukan FORM pemasang setelah pesanan berhasil dibuat —
 * lewat `copyCalcCartItemsToOrder` yang sama dengan jalur hand-off (satu
 * daftar, satu jalur tulis; lihat catatan panjang di kedua form).
 *
 * Keputusan desain yang mengikat komponen ini:
 *   - Daftar produk dimuat MALAS: halaman form TIDAK boleh mengambil daftar
 *     produk di muka (form-nya harus tetap ringan) — fetch pertama terjadi
 *     saat picker dibuka, lewat Server Action per area (`loadProducts` prop).
 *     Sejak 2026-08-26 pencarian/kategori dieksekusi DATABASE dan daftar
 *     tumbuh per 60 lewat "Muat Lebih Banyak" (kontrak lib/catalog-query.ts,
 *     hook lib/use-catalog-search.ts) — menggantikan pola `.limit(200)` +
 *     peringatan catalogListCappedMsg. Daftar kategori chip diminta pada
 *     fetch pertama (withCategories) supaya lengkap terlepas halaman tampil.
 *   - Produk habis stok TETAP tampil, hanya diredam visual (aturan kejujuran
 *     yang sama dengan kalkulator — menyembunyikan barang ≠ jujur soal stok).
 *   - Pilih produk = qty 1; produk yang sama digabung dengan MENJUMLAH qty
 *     (aturan addToCart kalkulator). Kolom harga selalu tampil di kedua area;
 *     di sisi cabang trg_order_item_price_guard (0014) tetap penentunya —
 *     tanpa can_edit_offer harga gugur di server dan form melaporkannya lewat
 *     banner degradasi (…PriceNote), bukan menyembunyikan kolomnya.
 *   - Komponen ini SENGAJA ramping: tanpa rantai diskon, tanpa breakdown —
 *     itu tetap tugas Kalkulator Penawaran.
 *   - Semua input di sini TANPA atribut `name`: draf lokal form cabang
 *     (use-local-draft.ts::kumpulkan) dan FormData submit sama-sama hanya
 *     membaca field ber-`name`, jadi baris pilihan tidak pernah bocor ke
 *     keduanya (baris hidup sebagai state React murni).
 *   - Teks semuanya dari slice `common` (komponen dipasang di dua area,
 *     aturan yang sama dengan lib/kalkulator-client.tsx); judul section
 *     dirender form pemasang dengan kunci slice-nya sendiri
 *     (orderItemsCardTitle) supaya tidak menambah kunci common baru untuk
 *     kata yang sudah ada di kedua slice.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { STOCK_STATUS_CHIP, stockStatusLabel, type StockStatus } from "@/lib/catalog-shared";
import { useCatalogSearch, type CatalogFetchInput } from "@/lib/use-catalog-search";
import { useCommonMessages } from "@/lib/i18n/provider";
import { formatIDR, parseIDRInput } from "@/lib/orders-shared";
import { CALC_MAX_QTY, type ColorOptionRow, type FetchColorsFn } from "@/lib/calculator-shared";

export type PickerProduct = {
  id: string;
  name: string;
  code: string | null;
  category: string | null;
  photoUrl: string | null;
  stockStatus: StockStatus;
  /**
   * Harga efektif 0021 — PREFILL unitPrice saat produk ditambahkan
   * (cabang: override toko sendiri → Harga Dasar SANCI; form admin: harga
   * efektif partner TERPILIH). null/absen = mulai 0, ketik manual
   * (perilaku lama). Kolom harga baris tetap selalu bisa diketik; di sisi
   * cabang trg_order_item_price_guard (0014) tetap penentu akhirnya.
   */
  price?: number | null;
};

/** Satu baris Isi Pesanan yang dipilih di form (state React murni, bukan field form). */
export type PickedLine = {
  productId: string;
  name: string;
  code: string | null;
  /** Diketik bebas — katalog tidak punya harga (0010); 0 = tidak diisi. */
  unitPrice: number;
  qty: number;
  /** Lihat catatan identitas baris di lib/calculator-shared.ts (CalcLine). */
  colorCode: string | null;
};

/**
 * Hasil pemuatan SATU halaman daftar produk, SUDAH diterjemahkan area
 * pemasang: outcome area-spesifik (katalog belum dibuka / migrasi belum
 * jalan / error) dipetakan ke kalimat slice masing-masing SEBELUM sampai ke
 * komponen ini, supaya komponen bebas dari slice cabang/admin. `categories`
 * hanya terisi saat diminta lewat withCategories (fetch pertama).
 */
export type PickerLoadResult =
  | { ok: true; products: PickerProduct[]; hasMore: boolean; categories?: string[] }
  | { ok: false; message: string };

/**
 * Baris hand-off generik yang bisa dituang lewat mergeLinesFromHandoff —
 * dipenuhi baik oleh CalcHandoffLine (lib/calculator-shared.ts, hand-off
 * Kalkulator) MAUPUN CatalogCartLine (lib/catalog-cart.ts, hand-off "Tambah
 * ke Pesanan" dari grid katalog) — yang belakangan TIDAK punya konsep warna
 * sama sekali, jadi `colorCode` di sini OPSIONAL (absen = null).
 */
type MergeableHandoffLine = {
  productId: string;
  name: string;
  code: string | null;
  unitPrice: number;
  qty: number;
  colorCode?: string | null;
};

/**
 * Prefill baris dari hand-off Kalkulator ("Gunakan angka ini") ATAU dari
 * hand-off katalog — aturan gabung yang SAMA dengan penambahan lewat picker:
 * baris dengan produk DAN WARNA yang sama dijumlah qty-nya (audit
 * 2026-09-01 — sebelumnya kunci gabungnya hanya productId, yang membuat dua
 * baris warna BERBEDA dari order_items sungguhan bisa tertuang lagi ke sini
 * dan tergabung KEMBALI menjadi satu, membalikkan perbaikan yang sama
 * persis sedang dikerjakan); harga baris yang sudah ada TIDAK ditimpa (kalau
 * kosong/0, harga hand-off dipakai). Satu tempat untuk aturan ini supaya dua
 * form tidak menyimpang.
 */
export function mergeLinesFromHandoff(prev: PickedLine[], handoffLines: MergeableHandoffLine[]): PickedLine[] {
  const next = [...prev];
  for (const h of handoffLines) {
    const hColor = h.colorCode ?? null;
    const idx = next.findIndex((l) => l.productId === h.productId && l.colorCode === hColor);
    if (idx >= 0) {
      const cur = next[idx];
      next[idx] = {
        ...cur,
        qty: Math.min(CALC_MAX_QTY, cur.qty + h.qty),
        unitPrice: cur.unitPrice > 0 ? cur.unitPrice : h.unitPrice,
      };
    } else {
      next.push({ productId: h.productId, name: h.name, code: h.code, unitPrice: h.unitPrice, qty: h.qty, colorCode: hColor });
    }
  }
  return next;
}

/**
 * Thumbnail 48px mengikuti aturan lib/catalog-shared.ts untuk `<img>` biasa:
 * lazy + decoding async, ruang dipesan lebih dulu (kotak 48px tetap),
 * onError → placeholder (bukan ikon rusak browser), object-fit contain.
 */
function PickerThumb({ url, name, muted, placeholder }: { url: string | null; name: string; muted: boolean; placeholder: string }) {
  const [broken, setBroken] = useState(false);
  const box: React.CSSProperties = {
    width: 48,
    height: 48,
    flex: "0 0 48px",
    borderRadius: "var(--r-sm)",
    background: "var(--surface2)",
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
  if (!url || broken) {
    return (
      <div style={box} aria-hidden="true">
        <span className="small muted" style={{ fontSize: 9, textAlign: "center", lineHeight: 1.2 }}>{placeholder}</span>
      </div>
    );
  }
  return (
    <div style={box}>
      {/* eslint-disable-next-line @next/next/no-img-element -- photo_url adalah URL publik dari SANCI (bukan aset lokal), lihat catatan di lib/catalog-shared.ts */}
      <img
        src={url}
        alt={name}
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          ...(muted ? { filter: "grayscale(70%)", opacity: 0.6 } : null),
        }}
      />
    </div>
  );
}

export default function OrderItemsSection({
  lines,
  onLinesChange,
  loadProducts,
  fetchColors,
}: {
  lines: PickedLine[];
  onLinesChange: (next: PickedLine[]) => void;
  /** Server Action per area, dibungkus form pemasang (lihat PickerLoadResult).
   *  Pencocokan nama/kode/kategori kini terjadi di query action-nya —
   *  semantiknya sama dengan memo `filtered` lama (lib/catalog-query.ts). */
  loadProducts: (input: CatalogFetchInput) => Promise<PickerLoadResult>;
  /** Server Action per area untuk daftar warna aktif satu produk (Fitur C,
   *  migrasi 0025) — app/admin/actions-colors.ts::listActiveColors atau
   *  app/cabang/pesanan/actions.ts::listActiveColorsCabang. */
  fetchColors: FetchColorsFn;
}) {
  const m = useCommonMessages();
  const [open, setOpen] = useState(false);

  // Daftar warna per produk — dimuat MALAS per productId yang MUNCUL di
  // `lines` (bukan di muka untuk semua produk katalog), dan di-cache untuk
  // umur komponen ini (interaksi keranjang tidak butuh data segar terus-
  // menerus). Pola sama dengan colorLoad di order-items-section.tsx, hanya
  // di sini SATU peta untuk BANYAK baris sekaligus (keranjang bisa punya
  // lebih dari satu produk), bukan satu state per modal.
  type ColorLoadState = { status: "loading" } | { status: "idle" } | { status: "error" } | { status: "ready"; colors: ColorOptionRow[] };
  const [colorLoads, setColorLoads] = useState<Map<string, ColorLoadState>>(new Map());
  const fetchedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const productIds = Array.from(new Set(lines.map((l) => l.productId)));
    const toFetch = productIds.filter((id) => !fetchedRef.current.has(id));
    if (toFetch.length === 0) return;
    toFetch.forEach((id) => fetchedRef.current.add(id));
    setColorLoads((prev) => {
      const next = new Map(prev);
      toFetch.forEach((id) => next.set(id, { status: "loading" }));
      return next;
    });
    toFetch.forEach((id) => {
      fetchColors(id)
        .then((res) => {
          setColorLoads((prev) => {
            const next = new Map(prev);
            if (res.status !== "ok" || !res.hasColorOptions || res.colors.length === 0) {
              next.set(id, { status: res.status === "error" ? "error" : "idle" });
            } else {
              next.set(id, { status: "ready", colors: res.colors });
            }
            return next;
          });
        })
        .catch(() => {
          setColorLoads((prev) => new Map(prev).set(id, { status: "error" }));
        });
    });
  }, [lines, fetchColors]);

  // Mode MALAS (initial: null): fetch pertama saat picker dibuka; hasil
  // di-cache hook selama halaman hidup (buka-tutup modal tidak fetch ulang).
  const katalog = useCatalogSearch<PickerProduct>({
    fetchPage: loadProducts,
    initial: null,
    fallbackErrorMessage: m.errorLoad,
  });
  const { products, hasMore, searching, loadingMore, error, loadedOnce } = katalog;

  function handleOpen() {
    setOpen(true);
    katalog.ensureLoaded();
  }

  const categories = useMemo(
    () => [...katalog.categories].sort((a, b) => a.localeCompare(b, m.dateLocale)),
    [katalog.categories, m.dateLocale]
  );

  /**
   * Baris mana yang BARU SAJA menyerap baris lain karena warnanya bertabrakan
   * (audit UI 2026-09-01) — alasan lengkap di lib/kalkulator-client.tsx pada
   * state bernama sama. Di sini daftar barisnya milik pemanggil (props
   * lines/onLinesChange), tapi catatan ini murni tampilan, jadi ia tinggal
   * sebagai state LOKAL: form pesanan tidak perlu tahu apa pun tentangnya.
   */
  const [colorMergedNote, setColorMergedNote] = useState<{ key: string; name: string } | null>(null);

  /** Pemuatan pertama gagal total (belum ada daftar sehat) vs error susulan
   *  (daftar lama tetap tampil) — dua perlakuan berbeda di JSX bawah. */
  const initialLoading = !loadedOnce && searching;
  const initialError = !loadedOnce && !searching ? error : null;

  // HANYA baris "belum dipilih warnanya" (colorCode null) yang dihitung —
  // itulah baris yang ditambah/dikurangi tombol pada daftar produk (lihat
  // addProduct). Baris yang sudah diberi warna tertentu tidak ikut angka
  // ini; menekan "Tambah" lagi untuk produk yang SEMUA barisnya sudah
  // berwarna akan memulai baris baru (belum berwarna) — begitulah cara
  // menambah varian warna kedua/ketiga tanpa kontrol baru di daftar produk.
  const qtyByProduct = useMemo(() => {
    const map = new Map<string, number>();
    lines.forEach((l) => {
      if (l.colorCode === null) map.set(l.productId, l.qty);
    });
    return map;
  }, [lines]);

  /**
   * Qty 1; duplikat digabung dengan menjumlah qty — TAPI hanya kalau
   * WARNANYA JUGA SAMA (audit 2026-09-01). Menambah dari daftar produk
   * selalu menyasar baris "belum berwarna" produk itu (bikin baru kalau
   * belum ada) — memberi warna pada baris itu lewat pemilih warna di bawah
   * membebaskan slot "belum berwarna" untuk baris kedua, jadi menekan
   * "Tambah" lagi otomatis memulai varian warna berikutnya.
   */
  function addProduct(p: PickerProduct) {
    const idx = lines.findIndex((l) => l.productId === p.id && l.colorCode === null);
    if (idx >= 0) {
      const next = [...lines];
      next[idx] = { ...next[idx], qty: Math.min(CALC_MAX_QTY, next[idx].qty + 1) };
      onLinesChange(next);
      return;
    }
    // Prefill harga efektif 0021 — nilai awal yang bisa diubah, bukan kunci.
    onLinesChange([...lines, { productId: p.id, name: p.name, code: p.code, unitPrice: p.price ?? 0, qty: 1, colorCode: null }]);
  }

  function removeLine(productId: string, colorCode: string | null) {
    onLinesChange(lines.filter((l) => !(l.productId === productId && l.colorCode === colorCode)));
  }
  function setLineQty(productId: string, colorCode: string | null, qty: number) {
    const clamped = Math.max(1, Math.min(CALC_MAX_QTY, Math.round(qty) || 1));
    onLinesChange(
      lines.map((l) => (l.productId === productId && l.colorCode === colorCode ? { ...l, qty: clamped } : l))
    );
  }
  function setLineUnitPrice(productId: string, colorCode: string | null, raw: string) {
    const n = parseIDRInput(raw);
    onLinesChange(
      lines.map((l) => (l.productId === productId && l.colorCode === colorCode ? { ...l, unitPrice: n ?? 0 } : l))
    );
  }

  /**
   * Ganti warna satu baris. Kalau baris LAIN untuk produk yang sama dan
   * warna BARU itu sudah ada, GABUNGKAN (jumlahkan qty, baris ini lenyap)
   * alih-alih membiarkan dua baris dengan identitas (productId, colorCode)
   * yang sama hidup berdampingan — identitas baris HARUS tetap unik, sama
   * seperti addProduct/addColorVariant di atas.
   */
  function setLineColor(productId: string, oldColorCode: string | null, newColorCode: string | null) {
    if (oldColorCode === newColorCode) return;
    const collideIdx = lines.findIndex((l) => l.productId === productId && l.colorCode === newColorCode);
    const movingIdx = lines.findIndex((l) => l.productId === productId && l.colorCode === oldColorCode);
    if (movingIdx < 0) return;

    if (collideIdx >= 0) {
      const merged = {
        ...lines[collideIdx],
        qty: Math.min(CALC_MAX_QTY, lines[collideIdx].qty + lines[movingIdx].qty),
      };
      // DI TEMPAT, bukan .concat() ke dasar daftar — lihat catatan sepadan
      // di lib/kalkulator-client.tsx::setLineColor.
      onLinesChange(lines.map((l, i) => (i === collideIdx ? merged : l)).filter((_, i) => i !== movingIdx));
      setColorMergedNote({ key: `${productId}::${newColorCode ?? ""}`, name: merged.name });
      return;
    }

    setColorMergedNote(null);
    onLinesChange(
      lines.map((l) => (l.productId === productId && l.colorCode === oldColorCode ? { ...l, colorCode: newColorCode } : l))
    );
  }

  /**
   * Tombol "+ Tambah warna lain" pada satu baris. Kalau produk ini SUDAH
   * punya baris "belum berwarna" (mis. baru saja ditekan sekali sebelum
   * sempat diberi warna), tombol menambah qty baris itu — SAMA seperti
   * menekan "Tambah" lagi di daftar produk (addProduct) — bukan diam-diam
   * tidak melakukan apa pun (LESSONS #10). Kalau belum ada, baris baru qty
   * 1 dibuat, harga sama dengan baris asal (nilai awal, tetap bisa diketik).
   */
  function addColorVariant(productId: string, fromLine: PickedLine) {
    setColorMergedNote(null);
    const idx = lines.findIndex((l) => l.productId === productId && l.colorCode === null);
    if (idx >= 0) {
      const next = [...lines];
      next[idx] = { ...next[idx], qty: Math.min(CALC_MAX_QTY, next[idx].qty + 1) };
      onLinesChange(next);
      return;
    }
    onLinesChange([...lines, { productId, name: fromLine.name, code: fromLine.code, unitPrice: fromLine.unitPrice, qty: 1, colorCode: null }]);
  }

  // 44px ("var(--tap)") — bukan 34px seperti sebelumnya. Kontrol qty +/-
  // yang SAMA di kalkulator (lib/kalkulator.module.css .stepBtn) sudah
  // benar 44px sejak awal; baris ini adalah satu-satunya tempat di app yang
  // tertinggal 34px (temuan review 2026-08-29) — kontrol yang paling sering
  // ditekan di seluruh alur bikin pesanan, salah satu yang paling penting
  // untuk memenuhi kontrak --tap.
  const stepBtn: React.CSSProperties = {
    width: "var(--tap)",
    height: "var(--tap)",
    border: "1px solid var(--line)",
    borderRadius: "var(--r-sm)",
    background: "var(--surface2)",
    color: "var(--ink)",
    fontSize: 16,
    lineHeight: 1,
    cursor: "pointer",
  };

  return (
    <div style={{ marginBottom: 18 }}>
      {lines.length === 0 ? (
        <p className="hint" style={{ marginBottom: 8 }}>
          {m.pickerEmptyHint}
        </p>
      ) : (
        lines.map((line) => {
          const lineKey = `${line.productId}::${line.colorCode ?? ""}`;
          const colorLoad = colorLoads.get(line.productId);
          const colorReady = colorLoad?.status === "ready" ? colorLoad.colors : null;
          const selectedColor = colorReady?.find((c) => c.code === line.colorCode);
          return (
            <div
              key={lineKey}
              style={{
                border: "1px solid var(--line)",
                borderRadius: "var(--r-md)",
                padding: "10px 12px",
                marginBottom: 8,
              }}
            >
              <div style={{ fontWeight: 600 }}>
                {line.name} {line.code && <span className="code">{line.code}</span>}
              </div>
              {colorReady && (
                <div className="field" style={{ margin: "8px 0 0" }}>
                  <label htmlFor={`oi_color_${lineKey}`}>{m.calcColorFieldLabel}</label>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <select
                      id={`oi_color_${lineKey}`}
                      value={line.colorCode ?? ""}
                      onChange={(e) => setLineColor(line.productId, line.colorCode, e.target.value || null)}
                      style={{ flex: 1 }}
                      aria-label={m.calcColorPickerAria.replace("{name}", line.name)}
                    >
                      <option value="">{m.calcColorPickerPlaceholder}</option>
                      {colorReady.map((c) => (
                        <option key={c.id} value={c.code}>
                          {c.name ? `${c.code} — ${c.name}` : c.code}
                        </option>
                      ))}
                    </select>
                    {selectedColor?.photo_url && (
                      // eslint-disable-next-line @next/next/no-img-element -- lihat catatan di lib/catalog-shared.ts
                      <img
                        src={selectedColor.photo_url}
                        alt=""
                        style={{ width: 28, height: 28, borderRadius: "var(--r-sm)", objectFit: "cover", border: "1px solid var(--line)", flex: "none" }}
                      />
                    )}
                  </div>
                </div>
              )}
              {colorLoad?.status === "error" && <div className="hint" style={{ marginTop: 6 }}>{m.calcColorLoadFailedNote}</div>}
              {/* Penggabungan warna WAJIB dikatakan — lihat catatan sepadan di
                  lib/kalkulator-client.tsx. */}
              {colorMergedNote?.key === lineKey && (
                <div className="banner info" style={{ marginTop: 6 }}>
                  {m.calcColorMergedNote.replace("{name}", colorMergedNote.name)}
                </div>
              )}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginTop: 8 }}>
                <div className="field" style={{ margin: 0, flex: "1 1 150px", minWidth: 130 }}>
                  <label htmlFor={`oi_price_${lineKey}`}>{m.calcUnitPriceLabel}</label>
                  <input
                    id={`oi_price_${lineKey}`}
                    type="text"
                    inputMode="numeric"
                    placeholder="Rp 0"
                    value={line.unitPrice ? formatIDR(line.unitPrice) : ""}
                    onChange={(e) => setLineUnitPrice(line.productId, line.colorCode, e.target.value)}
                  />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label htmlFor={`oi_qty_${lineKey}`}>{m.calcQtyLabel}</label>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <button
                      type="button"
                      style={stepBtn}
                      onClick={() => setLineQty(line.productId, line.colorCode, line.qty - 1)}
                      aria-label="−"
                    >
                      −
                    </button>
                    <input
                      id={`oi_qty_${lineKey}`}
                      type="number"
                      min={1}
                      max={CALC_MAX_QTY}
                      value={line.qty}
                      onChange={(e) => setLineQty(line.productId, line.colorCode, Number(e.target.value))}
                      style={{ width: 64, textAlign: "center" }}
                    />
                    <button
                      type="button"
                      style={stepBtn}
                      onClick={() => setLineQty(line.productId, line.colorCode, line.qty + 1)}
                      aria-label="+"
                    >
                      +
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn sm"
                  style={{ marginLeft: "auto" }}
                  onClick={() => removeLine(line.productId, line.colorCode)}
                  aria-label={m.calcRemoveLineAria.replace("{name}", line.name)}
                >
                  {m.calcRemoveLineCta}
                </button>
              </div>
              {/* Varian warna kedua/ketiga — hanya masuk akal kalau produknya
                  memang punya pilihan warna (daftar berhasil dimuat DAN
                  tidak kosong). */}
              {colorReady && (
                <div className="btnrow" style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => addColorVariant(line.productId, line)}
                    aria-label={m.calcAddColorVariantAria.replace("{name}", line.name)}
                  >
                    {m.calcAddColorVariantCta}
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}

      <button type="button" className="btn" onClick={handleOpen}>
        {m.pickerOpenCta}
      </button>

      {open && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          {/* `.tall`: modal jadi kolom flex bertinggi terbatas, `.modalbody`
              di bawah jadi SATU-SATUNYA area gulir (bukan overlay MAUPUN
              modal yang ikut gulir) — sebelumnya daftar produk punya
              gulirnya sendiri (maxHeight 52vh) DI DALAM modal yang overlay-
              nya juga bisa gulir: dua area gulir bersarang, pengguna tidak
              bisa membedakan sedang menggeser yang mana (temuan review
              2026-08-29). Header/pencarian/kategori tetap di luar
              `.modalbody` supaya selalu terlihat; tombol Tutup juga di
              luar, di dasar, supaya tidak perlu digulir ke ujung daftar. */}
          <div className="modal tall" role="dialog" aria-modal="true" aria-label={m.calcGoToProductsCta}>
            <h2>{m.calcGoToProductsCta}</h2>

            {initialLoading && <div className="hint">{m.loading}</div>}
            {initialError && (
              <div className="banner bad">
                {initialError}
                <div className="btnrow-inline">
                  <button type="button" className="btn sm" onClick={katalog.reload}>
                    {m.retry}
                  </button>
                </div>
              </div>
            )}

            {loadedOnce && (
              <>
                <div className="searchrow" style={{ marginBottom: 10, flex: "none" }}>
                  <input
                    className="search-input"
                    type="search"
                    placeholder={m.produkSearchPlaceholder}
                    value={katalog.q}
                    onChange={(e) => katalog.setQuery(e.target.value)}
                  />
                </div>
                {categories.length > 0 && (
                  <div className="chipscroll" style={{ marginBottom: 10, flex: "none" }}>
                    <button
                      type="button"
                      className={`btn sm${katalog.category === null ? " primary" : ""}`}
                      onClick={() => katalog.setCategoryFilter(null)}
                    >
                      {m.filterAll}
                    </button>
                    {categories.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className={`btn sm${katalog.category === c ? " primary" : ""}`}
                        onClick={() => katalog.setCategoryFilter(katalog.category === c ? null : c)}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}

                {/* Error susulan (pencarian/muat-lebih gagal): daftar yang
                    sudah ada TETAP tampil di bawahnya, tidak dikosongkan. */}
                {error && (
                  <div className="banner bad" style={{ flex: "none" }}>
                    {error}
                  </div>
                )}
                {searching && (
                  <div className="hint" style={{ flex: "none" }}>
                    {m.loading}
                  </div>
                )}

                <div className="modalbody">
                  {products.length === 0 ? (
                    !searching && (
                      <div className="emptybox">
                        {katalog.isFiltered ? m.noProductsMatchSearch : m.noProductsYet}
                      </div>
                    )
                  ) : (
                    <>
                      {products.map((p) => {
                        const inListQty = qtyByProduct.get(p.id) ?? 0;
                        const isOut = p.stockStatus === "OUT_OF_STOCK";
                        return (
                          <div
                            key={p.id}
                            style={{
                              display: "flex",
                              gap: 10,
                              alignItems: "center",
                              padding: "8px 2px",
                              borderBottom: "1px solid var(--line)",
                            }}
                          >
                            <PickerThumb url={p.photoUrl} name={p.name} muted={isOut} placeholder={m.noPhotoPlaceholder} />
                            <div style={{ flex: 1, minWidth: 0, ...(isOut ? { opacity: 0.6 } : null) }}>
                              <div style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{p.name}</div>
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 3 }}>
                                {p.code && <span className="code">{p.code}</span>}
                                <span className={STOCK_STATUS_CHIP[p.stockStatus]}>{stockStatusLabel({ common: m }, p.stockStatus)}</span>
                                {inListQty > 0 && <span className="small muted">×{inListQty}</span>}
                              </div>
                            </div>
                            <button
                              type="button"
                              className="btn sm primary"
                              onClick={() => addProduct(p)}
                              aria-label={m.pickerAddAria.replace("{name}", p.name)}
                            >
                              {m.add}
                            </button>
                          </div>
                        );
                      })}
                      {hasMore && (
                        <div className="btnrow" style={{ justifyContent: "center", margin: "10px 0" }}>
                          <button
                            type="button"
                            className="btn sm"
                            onClick={katalog.loadMore}
                            disabled={loadingMore || searching}
                          >
                            {loadingMore ? m.loading : m.loadMoreCta}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </>
            )}

            <div className="btnrow" style={{ marginTop: 14, flex: "none" }}>
              <button type="button" className="btn" onClick={() => setOpen(false)}>
                {m.close}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
