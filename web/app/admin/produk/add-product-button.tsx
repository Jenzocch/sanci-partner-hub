"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { submitSafely } from "@/lib/safe-write";
import { useLocalDraft } from "@/lib/use-local-draft";
import DraftBanner from "@/lib/draft-banner";
import { STOCK_STATUS_LABEL, type StockStatus } from "@/lib/catalog-shared";
import { createProduct } from "../actions-products";
import { lookupByRequestId } from "../actions-lookup";
import { unggahFotoProduk } from "./upload-product-photo";

export default function AddProductButton() {
  const router = useRouter();
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
          description: String(fd.get("description") || ""),
          stockStatus: String(fd.get("stock_status") || "AVAILABLE") as StockStatus,
          clientRequestId: rid,
        }),
      lookup: () => lookupByRequestId("product", rid),
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

    // Foto diurus PALING AKHIR, sesudah data produk dipastikan tersimpan.
    // Kegagalan foto tidak boleh membuat langkah ini terasa gagal — produk
    // sudah ada, pengguna cukup diberi tahu lewat peringatan halaman berikutnya.
    const berkas = fd.get("photo");
    if (berkas instanceof File && berkas.size > 0) {
      await unggahFotoProduk(newId, berkas);
    }

    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button className="btn primary" onClick={openModal}>
        + Tambah Produk
      </button>
    );
  }

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
      <div className="modal" role="dialog" aria-modal="true">
        <h2>Tambah Produk</h2>
        {netMsg && <div className="banner warn">{netMsg}</div>}
        {errs._form && <div className="banner bad">{errs._form}</div>}
        <DraftBanner draft={draft.draft} onRestore={draft.restore} onDiscard={draft.discard} />
        <form onSubmit={onSubmit} ref={draft.formRef} onInput={draft.onInput} onChange={draft.onInput}>
          <div className={`field${errs.name ? " invalid" : ""}`}>
            <label htmlFor="np_name">Nama produk *</label>
            <input id="np_name" name="name" type="text" autoComplete="off" />
            {errs.name && <div className="err-text">{errs.name}</div>}
          </div>
          <div className="field">
            <label htmlFor="np_code">Kode</label>
            <input id="np_code" name="code" type="text" autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="np_category">Kategori</label>
            <input id="np_category" name="category" type="text" autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="np_desc">Deskripsi</label>
            <textarea id="np_desc" name="description" placeholder="Opsional..." />
          </div>
          <div className="field">
            <label htmlFor="np_stock">Status Stok</label>
            <select id="np_stock" name="stock_status" defaultValue="AVAILABLE">
              <option value="AVAILABLE">{STOCK_STATUS_LABEL.AVAILABLE}</option>
              <option value="LIMITED">{STOCK_STATUS_LABEL.LIMITED}</option>
              <option value="OUT_OF_STOCK">{STOCK_STATUS_LABEL.OUT_OF_STOCK}</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="np_photo">Foto (opsional)</label>
            <input id="np_photo" name="photo" type="file" accept="image/png,image/jpeg,image/webp" />
            <div className="hint">
              PNG, JPG, atau WebP. Maksimal 5 MB — gambar diperkecil otomatis sebelum dikirim.
            </div>
          </div>
          <div className="btnrow">
            <button type="button" className="btn" onClick={closeModal}>
              Batal
            </button>
            <button type="submit" className="btn primary" disabled={submitting}>
              {submitting ? "Menyimpan…" : "Buat Produk"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
