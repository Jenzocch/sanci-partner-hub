"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { submitSafely } from "@/lib/safe-write";
import { useLocalDraft } from "@/lib/use-local-draft";
import DraftBanner from "@/lib/draft-banner";
import { type SanciProductRow, type StockStatus } from "@/lib/catalog-shared";
import { useAdminMessages } from "@/lib/i18n/provider";
import { formatIDR, parseIDRInput } from "@/lib/orders-shared";
import {
  getProductBasePrice,
  setProductBasePrice,
  setProductStatus,
  setProductStockStatus,
  updateProduct,
} from "../actions-products";
import { unggahFotoProduk } from "./upload-product-photo";
import ProductGalleryClient from "./product-gallery-client";

/**
 * Kolom Harga Dasar SANCI (0021) di modal Ubah. Nilainya dimuat MALAS saat
 * modal dibuka (grid /admin/produk tetap bebas harga — rencana 0021; query
 * daftar tidak disentuh). "error" ≠ "belum ada harga" (LESSONS #10):
 * saat gagal dimuat kolomnya DINONAKTIFKAN — kolom kosong yang tampil
 * seolah "belum ada harga" akan MENGHAPUS harga dasar saat disimpan.
 */
type BasePriceState =
  | { status: "loading" }
  /** `message` = sebab dari server kalau ada (mis. migrasi 0021 belum jalan) — lebih jujur dari kalimat generik. */
  | { status: "error"; message?: string }
  | { status: "ready"; initial: string; value: string };

/**
 * Baris yang benar-benar dipakai kartu + modal Ubah — created_at/updated_at
 * tidak lagi diambil halaman (audit 2026-08-22: tidak pernah dirender),
 * jadi tipe prop di sini melepasnya juga (Omit, bukan tipe baru, supaya
 * kolom lain tetap terkunci ke kontrak lib/catalog-shared.ts).
 */
type ProductActionRow = Omit<SanciProductRow, "created_at" | "updated_at">;

/**
 * Dilaporkan ke daftar SETELAH server memastikan tulisan sukses, supaya baris
 * di state client (use-catalog-search) ikut nilai baru. Tanpa ini baris tetap
 * pra-simpan — router.refresh() TIDAK menembus useState (temuan review
 * 2026-08-28, LESSONS #45) — dan prefill modal Ubah berikutnya menulis balik
 * data lama (untuk `size` itu = terhapus diam-diam). display_price ikut di
 * sini karena kartu daftar menampilkannya, walau bukan kolom sanci_products.
 */
export type ProductSavedPatch = Partial<ProductActionRow> & { display_price?: number | null };

export default function ProductActions({
  product,
  onSaved,
}: {
  product: ProductActionRow;
  onSaved: (patch: ProductSavedPatch) => void;
}) {
  const router = useRouter();
  const m = useAdminMessages();
  const [modal, setModal] = useState<null | "edit">(null);
  const { submitting, begin, release, reset } = useSubmitGuard();
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [netMsg, setNetMsg] = useState<string | null>(null);
  const [fotoMsg, setFotoMsg] = useState<string | null>(null);
  const [stockBusy, setStockBusy] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [priceMsg, setPriceMsg] = useState<string | null>(null);
  const [basePrice, setBasePrice] = useState<BasePriceState>({ status: "loading" });
  const draft = useLocalDraft("product", product.id, modal === "edit");

  function openEdit() {
    reset();
    setErrs({});
    setNetMsg(null);
    setPriceMsg(null);
    setModal("edit");
    // Harga Dasar SANCI dimuat malas per pembukaan modal (0021) — nilai
    // segar tiap kali, bukan cache kartu.
    setBasePrice({ status: "loading" });
    getProductBasePrice(product.id)
      .then((res) => {
        if ("error" in res) {
          setBasePrice({ status: "error", message: res.error.message });
          return;
        }
        const formatted = res.data === null ? "" : formatIDR(res.data);
        setBasePrice({ status: "ready", initial: formatted, value: formatted });
      })
      .catch(() => setBasePrice({ status: "error" }));
  }

  function onBasePriceChange(raw: string) {
    setBasePrice((prev) => {
      if (prev.status !== "ready") return prev;
      const n = parseIDRInput(raw);
      return { ...prev, value: n === null ? "" : formatIDR(n) };
    });
  }

  function closeModal() {
    reset();
    setModal(null);
  }

  async function onEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!begin()) return;
    setErrs({});
    setNetMsg(null);
    const fd = new FormData(e.currentTarget);
    // Normalisasi PERSIS seperti updateProduct di server (trim; kosong → null)
    // — nilai inilah yang dilaporkan ke onSaved setelah server memastikan
    // tersimpan, jadi baris di daftar tidak pernah menyimpang dari DB.
    const disimpan = {
      name: String(fd.get("name") || "").trim(),
      code: String(fd.get("code") || "").trim() || null,
      category: String(fd.get("category") || "").trim() || null,
      description: String(fd.get("description") || "").trim() || null,
      size: String(fd.get("size") || "").trim() || null,
    };
    const out = await submitSafely({
      kind: "update",
      run: () =>
        updateProduct(product.id, {
          name: String(fd.get("name") || ""),
          code: String(fd.get("code") || ""),
          category: String(fd.get("category") || ""),
          description: String(fd.get("description") || ""),
          size: String(fd.get("size") || ""),
        }),
      messages: m,
      buttonLabel: m.common.save,
    });
    if (out.status !== "ok") {
      release();
      setNetMsg(out.message);
      return;
    }
    const res = out.result;
    if ("error" in res) {
      release();
      setErrs({ [res.error.field || "_form"]: res.error.message });
      return;
    }
    draft.clear();
    onSaved(disimpan); // server sudah memastikan tersimpan — baris daftar ikut sekarang

    // Harga Dasar SANCI (0021) — best-effort SETELAH data produk pasti
    // tersimpan (pola foto di bawah): kegagalannya cuma peringatan, tidak
    // membatalkan simpanan produk. Hanya ditulis kalau nilainya MEMANG
    // berubah (dirty-check terhadap nilai awal yang dimuat) dan kolomnya
    // sempat termuat sehat — kolom yang gagal dimuat dinonaktifkan di JSX,
    // jadi tidak pernah menghapus harga tanpa sepengetahuan admin.
    if (basePrice.status === "ready" && basePrice.value !== basePrice.initial) {
      const priceRes = await setProductBasePrice(product.id, basePrice.value);
      if ("error" in priceRes) setPriceMsg(m.admin.productBasePriceSaveFailed);
      else onSaved({ display_price: parseIDRInput(basePrice.value) }); // harga kartu ikut nilai tersimpan
    }

    // Foto diurus PALING AKHIR, sesudah data produk dipastikan tersimpan
    // (SPEC-style logo partner: kegagalan foto cuma peringatan).
    const berkas = fd.get("photo");
    if (berkas instanceof File && berkas.size > 0) {
      const foto = await unggahFotoProduk(product.id, berkas, m);
      setFotoMsg(foto.warning);
      // URL baru ber-?v= dilaporkan juga — tanpa ini kartu di hasil pencarian
      // menampilkan foto lama (URL lama immutable di cache) dan admin
      // menyimpulkan unggahannya gagal, persis salah baca yang dicegah
      // LESSONS #22.
      if (foto.url) onSaved({ photo_url: foto.url });
    }

    setModal(null);
    router.refresh();
  }

  // Dua kendali kartu (stok & aktif/nonaktif) dibungkus submitSafely seperti
  // form lain — SEBELUMNYA panggilan action-nya telanjang: kegagalan jaringan
  // atau tab dengan versi deploy usang (Server Action 404) melempar exception
  // yang tidak tertangkap, `setBusy(false)` di bawah `await` tidak pernah
  // jalan → kendali mati permanen TANPA pesan apa pun (laporan owner
  // 2026-08-26: "produk tidak bisa dinonaktifkan"). Sekarang kegagalan apa pun
  // memulihkan tombol dan menjelaskan sebabnya — termasuk pesan "versi usang,
  // muat ulang" dari deteksi stale deploy.
  async function onStockChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value as StockStatus;
    const select = e.target;
    setStockBusy(true);
    const out = await submitSafely({
      kind: "update",
      run: () => setProductStockStatus(product.id, value),
      messages: m,
      // BUKAN productStockFieldLabel ("Status stok") — itu nama KOLOM, dan
      // "tekan \"Status stok\" lagi" terbaca aneh (bukan nama sesuatu yang
      // bisa ditekan). productStockRetryLabel menamai kontrolnya sendiri,
      // supaya kalimat pemulihan jaringan tetap masuk akal untuk satu-
      // satunya pemakai submitSafely yang berupa dropdown, bukan tombol.
      buttonLabel: m.admin.productStockRetryLabel,
    });
    setStockBusy(false);
    if (out.status !== "ok") {
      alert(out.message);
      select.value = product.stock_status; // gagal — kembalikan tampilan ke nilai server
      return;
    }
    if ("error" in out.result) {
      alert(out.result.error.message);
      select.value = product.stock_status;
      return;
    }
    onSaved({ stock_status: value }); // baris daftar ikut — chip stok kartu jujur seketika
    router.refresh();
  }

  async function onToggleStatus() {
    if (statusBusy) return;
    const next: SanciProductRow["status"] = product.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    setStatusBusy(true);
    const out = await submitSafely({
      kind: "update",
      run: () => setProductStatus(product.id, next),
      messages: m,
      buttonLabel: product.status === "ACTIVE" ? m.common.deactivate : m.common.activate,
    });
    setStatusBusy(false);
    if (out.status !== "ok") {
      alert(out.message);
      return;
    }
    if ("error" in out.result) {
      alert(out.result.error.message);
      return;
    }
    onSaved({ status: next }); // label tombol + badge status berbalik seketika, bukan setelah reload
    router.refresh();
  }

  return (
    <>
      {fotoMsg && <div className="banner warn">{fotoMsg}</div>}
      {priceMsg && <div className="banner warn">{priceMsg}</div>}

      <div>
        <label
          htmlFor={`stock_${product.id}`}
          className="small muted"
          style={{ display: "block", marginBottom: 4 }}
        >
          {m.admin.productStockFieldLabel}
        </label>
        <select
          id={`stock_${product.id}`}
          className="filter-select"
          style={{ width: "100%" }}
          defaultValue={product.stock_status}
          onChange={onStockChange}
          disabled={stockBusy}
        >
          <option value="AVAILABLE">{m.common.stockAvailable}</option>
          <option value="LIMITED">{m.common.stockLimited}</option>
          <option value="OUT_OF_STOCK">{m.common.stockOutOfStock}</option>
        </select>
      </div>

      <div className="btnrow-inline">
        <button className="btn sm" onClick={openEdit}>
          {m.common.edit}
        </button>
        <button className="btn sm" onClick={onToggleStatus} disabled={statusBusy}>
          {product.status === "ACTIVE" ? m.common.deactivate : m.common.activate}
        </button>
      </div>

      {modal === "edit" && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="modal" role="dialog" aria-modal="true">
            <h2>{m.admin.productEditModalTitle}</h2>
            {netMsg && <div className="banner warn">{netMsg}</div>}
            {errs._form && <div className="banner bad">{errs._form}</div>}
            <DraftBanner draft={draft.draft} onRestore={draft.restore} onDiscard={draft.discard} />
            <form onSubmit={onEdit} ref={draft.formRef} onInput={draft.onInput} onChange={draft.onInput}>
              <div className={`field${errs.name ? " invalid" : ""}`}>
                <label htmlFor={`ep_name_${product.id}`}>{m.admin.productNameFieldLabel}</label>
                <input id={`ep_name_${product.id}`} name="name" type="text" defaultValue={product.name} />
                {errs.name && <div className="err-text">{errs.name}</div>}
              </div>
              <div className="field">
                <label htmlFor={`ep_code_${product.id}`}>{m.admin.productCodeFieldLabel}</label>
                <input id={`ep_code_${product.id}`} name="code" type="text" defaultValue={product.code || ""} />
              </div>
              <div className="field">
                <label htmlFor={`ep_cat_${product.id}`}>{m.admin.productCategoryFieldLabel}</label>
                <input
                  id={`ep_cat_${product.id}`}
                  name="category"
                  type="text"
                  defaultValue={product.category || ""}
                />
              </div>
              {/* Ukuran (0024). Prefill dari baris daftar AMAN justru karena
                  onSaved/patchProduct di atas — nilai basi di sini bukan cuma
                  salah tampil, ia TERSIMPAN BALIK saat Simpan (LESSONS #45). */}
              <div className="field">
                <label htmlFor={`ep_size_${product.id}`}>{m.admin.productSizeFieldLabel}</label>
                <input
                  id={`ep_size_${product.id}`}
                  name="size"
                  type="text"
                  defaultValue={product.size || ""}
                />
                <div className="hint">{m.admin.productSizeFieldHint}</div>
              </div>
              <div className="field">
                <label htmlFor={`ep_desc_${product.id}`}>{m.common.description}</label>
                <textarea id={`ep_desc_${product.id}`} name="description" defaultValue={product.description || ""} />
              </div>
              {/* Harga Dasar SANCI (0021). SENGAJA tanpa atribut `name`:
                  input terkontrol yang dimuat async — draf lokal (yang cuma
                  membaca field ber-name) tidak boleh memulihkan nilai basi
                  ke sini (LESSONS #1 sekeluarga: nilai lama menimpa nilai
                  segar). Saat gagal dimuat, kolom DINONAKTIFKAN — kolom
                  kosong palsu yang tersimpan berarti MENGHAPUS harga. */}
              <div className="field">
                <label htmlFor={`ep_base_price_${product.id}`}>{m.admin.productBasePriceFieldLabel}</label>
                <input
                  id={`ep_base_price_${product.id}`}
                  type="text"
                  inputMode="numeric"
                  placeholder="Rp 0"
                  value={basePrice.status === "ready" ? basePrice.value : ""}
                  onChange={(e) => onBasePriceChange(e.target.value)}
                  disabled={basePrice.status !== "ready"}
                />
                {basePrice.status === "loading" && <div className="hint">{m.common.loading}</div>}
                {basePrice.status === "error" && (
                  <div className="err-text">
                    {basePrice.message
                      ? `${basePrice.message} ${m.admin.productBasePriceLoadFailed}`
                      : m.admin.productBasePriceLoadFailed}
                  </div>
                )}
                {basePrice.status === "ready" && (
                  <div className="hint">{m.admin.productBasePriceHint}</div>
                )}
              </div>
              <div className="field">
                <label htmlFor={`ep_photo_${product.id}`}>{m.admin.productPhotoFieldLabel}</label>
                <input
                  id={`ep_photo_${product.id}`}
                  name="photo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                />
                <div className="hint">{m.admin.productPhotoHintKeep}</div>
              </div>
              {/* Foto tambahan (migration 0022, galeri DI LUAR foto sampul di
                  atas) — dimuat malas oleh komponen ini sendiri saat modal ini
                  ter-mount (`modal === "edit"` di bawah), bukan di openEdit()
                  seperti Harga Dasar SANCI: galeri punya alur tambah/hapusnya
                  sendiri yang independen dari submit form Ubah Produk ini. */}
              <ProductGalleryClient productId={product.id} />
              <div className="btnrow">
                <button type="button" className="btn" onClick={closeModal}>
                  {m.common.cancel}
                </button>
                <button type="submit" className="btn primary" disabled={submitting}>
                  {submitting ? m.common.saving : m.common.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
