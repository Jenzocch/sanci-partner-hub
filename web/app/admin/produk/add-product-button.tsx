"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { submitSafely } from "@/lib/safe-write";
import { useLocalDraft } from "@/lib/use-local-draft";
import DraftBanner from "@/lib/draft-banner";
import { type StockStatus } from "@/lib/catalog-shared";
import { useAdminMessages } from "@/lib/i18n/provider";
import { formatIDR, parseIDRInput } from "@/lib/orders-shared";
import { createProduct, setProductBasePrice, setProductDiscontinued } from "../actions-products";
import { lookupByRequestId } from "../actions-lookup";
import { unggahFotoProduk } from "./upload-product-photo";

export default function AddProductButton() {
  const router = useRouter();
  const m = useAdminMessages();
  const [open, setOpen] = useState(false);
  const { submitting, begin, release, reset } = useSubmitGuard();
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [netMsg, setNetMsg] = useState<string | null>(null);
  // Pesan sukses "Simpan & tambah lagi" — modal tetap terbuka untuk produk berikutnya.
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  // Tombol mana yang ditekan: submit biasa menutup modal, "lanjut" tidak.
  const lanjutRef = useRef(false);
  const requestId = useRef<string | null>(null);
  const draft = useLocalDraft("product", null, open);

  function openModal() {
    // Nomor permintaan dipakai ulang bila percobaan sebelumnya belum pasti berhasil.
    if (!requestId.current) requestId.current = crypto.randomUUID();
    reset();
    setErrs({});
    setNetMsg(null);
    setSavedMsg(null);
    setOpen(true);
  }

  function closeModal() {
    reset();
    setOpen(false);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!begin()) return;
    setErrs({});
    setNetMsg(null);
    const fd = new FormData(e.currentTarget);
    const rid = requestId.current!;
    const out = await submitSafely({
      run: () =>
        createProduct({
          name: String(fd.get("name") || ""),
          code: String(fd.get("code") || ""),
          category: String(fd.get("category") || ""),
          size: String(fd.get("size") || ""),
          description: String(fd.get("description") || ""),
          stockStatus: String(fd.get("stock_status") || "AVAILABLE") as StockStatus,
          clientRequestId: rid,
        }),
      lookup: () => lookupByRequestId("product", rid),
      messages: m,
      buttonLabel: m.admin.productCreateBtn,
    });

    let newId: string;
    if (out.status === "confirmed") {
      newId = out.id;
    } else if (out.status !== "ok") {
      // Belum tentu/atau belum tersimpan — jangan sekali pun disebut berhasil.
      release();
      setNetMsg(out.message);
      return;
    } else {
      const res = out.result;
      if ("error" in res) {
        release();
        setErrs({ [res.error.field || "_form"]: res.error.message });
        return;
      }
      newId = res.data.id;
    }

    // Berhasil: draf baru dihapus di sini — sesudah server memastikan tersimpan.
    draft.clear();
    requestId.current = null;

    // Harga Dasar SANCI (0021) — best-effort SETELAH produk pasti tersimpan
    // (pola foto di bawah): kegagalannya tidak membatalkan produk yang sudah
    // ada. Gagal → beri tahu lewat alert (idiom aksi kartu di layar ini) dan
    // arahkan mengisinya ulang lewat modal Ubah — JANGAN diklaim tersimpan
    // tanpa bukti (LESSONS #7).
    const basePriceRaw = String(fd.get("base_price") || "").trim();
    if (basePriceRaw !== "") {
      const priceRes = await setProductBasePrice(newId, basePriceRaw);
      if ("error" in priceRes) alert(m.admin.productBasePriceSaveFailed);
    }

    // Foto diurus PALING AKHIR, sesudah data produk dipastikan tersimpan.
    // Kegagalan foto tidak boleh membuat langkah ini terasa gagal — produk
    // sudah ada, pengguna cukup diberi tahu lewat peringatan halaman berikutnya.
    const berkas = fd.get("photo");
    if (berkas instanceof File && berkas.size > 0) {
      await unggahFotoProduk(newId, berkas, m);
    }

    // "Akan dihentikan" (0030) — best-effort SETELAH produk pasti tersimpan,
    // pola harga dasar di atas. Default false di database, jadi hanya
    // ditulis kalau dicentang.
    if (fd.get("discontinued") === "on") {
      const discRes = await setProductDiscontinued(newId, true);
      if ("error" in discRes) alert(m.admin.productDiscontinuedSaveFailed);
    }

    router.refresh();

    if (lanjutRef.current) {
      // Entri massal (mis. 49 produk baru sekaligus): modal TIDAK ditutup.
      // Kategori sengaja dipertahankan — produk yang dimasukkan berurutan
      // hampir selalu satu kategori. Semua yang lain dikosongkan.
      const form = e.currentTarget;
      const kategori = String(fd.get("category") || "");
      form.reset();
      const kat = form.elements.namedItem("category") as HTMLInputElement | null;
      if (kat) kat.value = kategori;
      setSavedMsg(m.admin.productSavedAndNext.replace("{name}", String(fd.get("name") || "")));
      requestId.current = crypto.randomUUID();
      release();
      (form.elements.namedItem("name") as HTMLInputElement | null)?.focus();
      return;
    }
    setOpen(false);
  }

  if (!open) {
    return (
      <button className="btn primary" onClick={openModal}>
        {m.admin.productAddBtn}
      </button>
    );
  }

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
      <div className="modal" role="dialog" aria-modal="true">
        <h2>{m.admin.productAddModalTitle}</h2>
        {netMsg && <div className="banner warn">{netMsg}</div>}
        {errs._form && <div className="banner bad">{errs._form}</div>}
        <DraftBanner draft={draft.draft} onRestore={draft.restore} onDiscard={draft.discard} />
        {savedMsg && <div className="banner ok">{savedMsg}</div>}
        <form onSubmit={onSubmit} ref={draft.formRef} onInput={draft.onInput} onChange={draft.onInput}>
          {/* Dikelompokkan (owner 2026-09-22 "更符合使用者邏輯, 快速清楚"):
              siapa produknya → berapa & ada atau tidak → detail. Satu-satunya
              isian wajib (Nama) ada di paling atas dan langsung difokuskan. */}
          <div className="sectiontitle" style={{ fontSize: "var(--fs-body)" }}>{m.admin.productSecIdentity}</div>
          <div className={`field${errs.name ? " invalid" : ""}`}>
            <label htmlFor="np_name">{m.admin.productNameFieldLabel} *</label>
            <input id="np_name" name="name" type="text" autoComplete="off" autoFocus />
            {errs.name && <div className="err-text">{errs.name}</div>}
          </div>
          <div className="field">
            <label htmlFor="np_code">{m.admin.productCodeFieldLabel}</label>
            <input id="np_code" name="code" type="text" autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="np_category">{m.admin.productCategoryFieldLabel}</label>
            <input id="np_category" name="category" type="text" autoComplete="off" />
          </div>

          <div className="sectiontitle" style={{ fontSize: "var(--fs-body)" }}>{m.admin.productSecSelling}</div>
          {/* Harga Dasar SANCI (0021) — opsional; kosong = produk tanpa harga dasar. */}
          <div className="field">
            <label htmlFor="np_base_price">{m.admin.productBasePriceFieldLabel}</label>
            <input
              id="np_base_price"
              name="base_price"
              type="text"
              inputMode="numeric"
              placeholder="Rp 0"
              onChange={(e) => {
                const n = parseIDRInput(e.target.value);
                e.target.value = n === null ? "" : formatIDR(n);
              }}
            />
            <div className="hint">{m.admin.productBasePriceHint}</div>
          </div>
          {/* Stok: tiga pilihan satu klik (bukan dropdown dua klik). */}
          <div className="field">
            <label>{m.admin.productStockStatusFieldLabel}</label>
            <div className="segmented">
              {(["AVAILABLE", "LIMITED", "OUT_OF_STOCK"] as const).map((s) => (
                <label key={s} className="seg radio">
                  <input type="radio" name="stock_status" value={s} defaultChecked={s === "AVAILABLE"} />
                  {s === "AVAILABLE" ? m.common.stockAvailable : s === "LIMITED" ? m.common.stockLimited : m.common.stockOutOfStock}
                </label>
              ))}
            </div>
          </div>
          <div className="field">
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400 }}>
              <input type="checkbox" name="discontinued" />
              {m.admin.productDiscontinuedLabel}
            </label>
            <div className="hint">{m.admin.productDiscontinuedHint}</div>
          </div>

          <div className="sectiontitle" style={{ fontSize: "var(--fs-body)" }}>{m.admin.productSecDetail}</div>
          <div className="field">
            <label htmlFor="np_size">{m.admin.productSizeFieldLabel}</label>
            <input id="np_size" name="size" type="text" autoComplete="off" />
            <div className="hint">{m.admin.productSizeFieldHint}</div>
          </div>
          <div className="field">
            <label htmlFor="np_desc">{m.common.description}</label>
            <textarea id="np_desc" name="description" placeholder={`${m.common.optional}...`} />
          </div>
          <div className="field">
            <label htmlFor="np_photo">{m.admin.productPhotoFieldLabel}</label>
            <input id="np_photo" name="photo" type="file" accept="image/png,image/jpeg,image/webp" />
            <div className="hint">{m.admin.productPhotoHint}</div>
          </div>
          <div className="btnrow">
            <button type="button" className="btn" onClick={closeModal}>
              {m.common.cancel}
            </button>
            <button type="submit" className="btn" disabled={submitting} onClick={() => (lanjutRef.current = true)}>
              {m.admin.productSaveAndNextBtn}
            </button>
            <button type="submit" className="btn primary" disabled={submitting} onClick={() => (lanjutRef.current = false)}>
              {submitting ? m.common.saving : m.admin.productCreateBtn}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
