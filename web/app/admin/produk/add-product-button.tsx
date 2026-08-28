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
import { createProduct, setProductBasePrice } from "../actions-products";
import { lookupByRequestId } from "../actions-lookup";
import { unggahFotoProduk } from "./upload-product-photo";

export default function AddProductButton() {
  const router = useRouter();
  const m = useAdminMessages();
  const [open, setOpen] = useState(false);
  const { submitting, begin, release, reset } = useSubmitGuard();
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [netMsg, setNetMsg] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);
  const draft = useLocalDraft("product", null, open);

  function openModal() {
    // Nomor permintaan dipakai ulang bila percobaan sebelumnya belum pasti berhasil.
    if (!requestId.current) requestId.current = crypto.randomUUID();
    reset();
    setErrs({});
    setNetMsg(null);
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

    setOpen(false);
    router.refresh();
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
        <form onSubmit={onSubmit} ref={draft.formRef} onInput={draft.onInput} onChange={draft.onInput}>
          <div className={`field${errs.name ? " invalid" : ""}`}>
            <label htmlFor="np_name">{m.admin.productNameFieldLabel}</label>
            <input id="np_name" name="name" type="text" autoComplete="off" />
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
          {/* Ukuran (0024) — posisi setelah kategori, meniru urutan baris
              spesifikasi di halaman detail produk (Ukuran di atas harga). */}
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
            <label htmlFor="np_stock">{m.admin.productStockStatusFieldLabel}</label>
            <select id="np_stock" name="stock_status" defaultValue="AVAILABLE">
              <option value="AVAILABLE">{m.common.stockAvailable}</option>
              <option value="LIMITED">{m.common.stockLimited}</option>
              <option value="OUT_OF_STOCK">{m.common.stockOutOfStock}</option>
            </select>
          </div>
          {/* Harga Dasar SANCI (0021) — opsional; kosong = produk tanpa
              harga dasar (kalkulator/picker mulai 0 seperti biasa). Ber-
              atribut name supaya ikut draf lokal seperti field lain. */}
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
          <div className="field">
            <label htmlFor="np_photo">{m.admin.productPhotoFieldLabel}</label>
            <input id="np_photo" name="photo" type="file" accept="image/png,image/jpeg,image/webp" />
            <div className="hint">{m.admin.productPhotoHint}</div>
          </div>
          <div className="btnrow">
            <button type="button" className="btn" onClick={closeModal}>
              {m.common.cancel}
            </button>
            <button type="submit" className="btn primary" disabled={submitting}>
              {submitting ? m.common.saving : m.admin.productCreateBtn}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
