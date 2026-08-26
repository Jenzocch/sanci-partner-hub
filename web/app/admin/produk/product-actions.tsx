"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { submitSafely } from "@/lib/safe-write";
import { useLocalDraft } from "@/lib/use-local-draft";
import DraftBanner from "@/lib/draft-banner";
import { type SanciProductRow, type StockStatus } from "@/lib/catalog-shared";
import { useAdminMessages } from "@/lib/i18n/provider";
import { setProductStatus, setProductStockStatus, updateProduct } from "../actions-products";
import { unggahFotoProduk } from "./upload-product-photo";

/**
 * Baris yang benar-benar dipakai kartu + modal Ubah — created_at/updated_at
 * tidak lagi diambil halaman (audit 2026-08-22: tidak pernah dirender),
 * jadi tipe prop di sini melepasnya juga (Omit, bukan tipe baru, supaya
 * kolom lain tetap terkunci ke kontrak lib/catalog-shared.ts).
 */
type ProductActionRow = Omit<SanciProductRow, "created_at" | "updated_at">;

export default function ProductActions({ product }: { product: ProductActionRow }) {
  const router = useRouter();
  const m = useAdminMessages();
  const [modal, setModal] = useState<null | "edit">(null);
  const { submitting, begin, release, reset } = useSubmitGuard();
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [netMsg, setNetMsg] = useState<string | null>(null);
  const [fotoMsg, setFotoMsg] = useState<string | null>(null);
  const [stockBusy, setStockBusy] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const draft = useLocalDraft("product", product.id, modal === "edit");

  function openEdit() {
    reset();
    setErrs({});
    setNetMsg(null);
    setModal("edit");
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
    const out = await submitSafely({
      kind: "update",
      run: () =>
        updateProduct(product.id, {
          name: String(fd.get("name") || ""),
          code: String(fd.get("code") || ""),
          category: String(fd.get("category") || ""),
          description: String(fd.get("description") || ""),
        }),
      messages: m,
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

    // Foto diurus PALING AKHIR, sesudah data produk dipastikan tersimpan
    // (SPEC-style logo partner: kegagalan foto cuma peringatan).
    const berkas = fd.get("photo");
    if (berkas instanceof File && berkas.size > 0) {
      setFotoMsg(await unggahFotoProduk(product.id, berkas, m));
    }

    setModal(null);
    router.refresh();
  }

  async function onStockChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value as StockStatus;
    setStockBusy(true);
    const res = await setProductStockStatus(product.id, value);
    setStockBusy(false);
    if ("error" in res) {
      alert(res.error.message);
      e.target.value = product.stock_status; // gagal — kembalikan tampilan ke nilai server
      return;
    }
    router.refresh();
  }

  async function onToggleStatus() {
    if (statusBusy) return;
    setStatusBusy(true);
    const res = await setProductStatus(product.id, product.status === "ACTIVE" ? "INACTIVE" : "ACTIVE");
    setStatusBusy(false);
    if ("error" in res) {
      alert(res.error.message);
      return;
    }
    router.refresh();
  }

  return (
    <>
      {fotoMsg && <div className="banner warn">{fotoMsg}</div>}

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
              <div className="field">
                <label htmlFor={`ep_desc_${product.id}`}>{m.common.description}</label>
                <textarea id={`ep_desc_${product.id}`} name="description" defaultValue={product.description || ""} />
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
