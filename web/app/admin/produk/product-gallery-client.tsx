"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminMessages } from "@/lib/i18n/provider";
import { listProductPhotos, deleteProductPhoto } from "../actions-product-photos";
import { unggahFotoGaleri, pathFotoGaleriDariUrl } from "./upload-gallery-photo";

type GalleryPhoto = { id: string; photo_url: string; sort_order: number };

type GalleryState =
  | { status: "loading" }
  /** Error DB ≠ galeri kosong (LESSONS #10) — kartu ini tidak pernah
   *  ditampilkan sebagai "belum ada foto". */
  | { status: "error"; message?: string }
  | { status: "ready"; photos: GalleryPhoto[] };

/**
 * Galeri "Foto tambahan" di dalam modal Ubah Produk (migration 0022,
 * product_photos) — DI LUAR foto sampul yang sudah ada sejak 0010 (field
 * "Foto" di product-actions.tsx, TIDAK disentuh satu kata pun di sini).
 *
 * Dimuat MALAS saat modal dibuka (komponen ini di-mount hanya selagi
 * `modal === "edit"` di product-actions.tsx — pola yang sama dengan Harga
 * Dasar SANCI di komponen induk) lewat useEffect saat mount, BUKAN dipicu
 * dari induk — supaya "Coba lagi" pada kartu error bisa memuat ulang tanpa
 * ikut membangun ulang seluruh state modal induk.
 *
 * Tiga keadaan diperlakukan berbeda (LESSONS #10): loading (spinner teks),
 * error (pesan + tombol "Coba lagi" — TIDAK PERNAH ditampilkan seolah
 * "belum ada foto"), dan galeri benar-benar kosong (kalimat kosong yang
 * jujur, dikonfirmasi server, bukan tebakan client).
 */
export default function ProductGalleryClient({ productId }: { productId: string }) {
  const m = useAdminMessages();
  const [state, setState] = useState<GalleryState>({ status: "loading" });
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const res = await listProductPhotos(productId);
      if ("error" in res) {
        setState({ status: "error", message: res.error.message });
        return;
      }
      setState({ status: "ready", photos: res.data });
    } catch {
      setState({ status: "error" });
    }
  }, [productId]);

  useEffect(() => {
    load();
    // load() sengaja hanya dijalankan sekali per mount (productId tetap sama
    // selama modal terbuka) — "Coba lagi" memanggil load() lagi secara
    // eksplisit lewat tombol, bukan lewat efek yang berulang.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  async function onFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // supaya memilih berkas yang sama lagi tetap memicu onChange
    if (files.length === 0) return;

    setUploading(true);
    setUploadMsg(null);
    let failed = 0;
    // Berurutan (bukan Promise.all) — supaya banyak unggahan sekaligus tidak
    // membanjiri koneksi lemah cabang/admin, dan supaya kegagalan SATU foto
    // tidak menghentikan sisanya (setiap panggilan independen, lihat
    // unggahFotoGaleri: tidak pernah melempar error).
    for (const file of files) {
      const err = await unggahFotoGaleri(productId, file, m);
      if (err) failed += 1;
    }
    setUploading(false);
    if (failed > 0) {
      setUploadMsg(
        m.admin.productGalleryUploadPartialFailed.replace("{n}", String(failed)).replace("{total}", String(files.length))
      );
    }
    await load();
  }

  async function onDelete(photo: GalleryPhoto) {
    if (deletingId) return;
    setDeletingId(photo.id);
    setUploadMsg(null);
    // DB dulu = otoritatif (catatan lengkap di actions-product-photos.ts).
    const res = await deleteProductPhoto(photo.id);
    if ("error" in res) {
      setDeletingId(null);
      setUploadMsg(res.error.message);
      return;
    }
    // Storage best-effort SESUDAH DB sukses — kegagalannya HANYA peringatan,
    // tidak membatalkan penghapusan yang sudah terjadi (baris DB sudah
    // hilang; berkas storage yatim di sini DAPAT DITERIMA, bukan bug: tidak
    // ada satu pun baris lagi yang menunjuk ke berkas itu, jadi ia tidak
    // pernah tampil di mana pun — hanya memakai ruang storage yang tidak
    // terlihat pengguna).
    const path = pathFotoGaleriDariUrl(photo.photo_url);
    if (path) {
      try {
        const { createClient: createBrowserSupabase } = await import("@/lib/supabase/client");
        const supabase = createBrowserSupabase();
        const { error } = await supabase.storage.from("product-photos").remove([path]);
        if (error) setUploadMsg(m.admin.productGalleryDeleteFailed);
      } catch {
        setUploadMsg(m.admin.productGalleryDeleteFailed);
      }
    }
    setDeletingId(null);
    setState((prev) => (prev.status === "ready" ? { status: "ready", photos: prev.photos.filter((p) => p.id !== photo.id) } : prev));
  }

  return (
    <div className="field">
      <label>{m.admin.productGalleryTitle}</label>

      {state.status === "loading" && <div className="hint">{m.common.loading}</div>}

      {state.status === "error" && (
        <div className="err-text">
          {state.message ? `${state.message} ${m.admin.productGalleryLoadFailed}` : m.admin.productGalleryLoadFailed}{" "}
          <button type="button" className="btn sm" onClick={load}>
            {m.common.retry}
          </button>
        </div>
      )}

      {state.status === "ready" && (
        <>
          {state.photos.length === 0 ? (
            <div className="hint">{m.admin.productGalleryEmpty}</div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8, marginBottom: 8 }}>
              {state.photos.map((p) => (
                <div key={p.id} style={{ position: "relative", width: 72, height: 72, flex: "none" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- lihat catatan lib/catalog-shared.ts */}
                  <img
                    src={p.photo_url}
                    alt=""
                    loading="lazy"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      borderRadius: "var(--r-md)",
                      border: "1px solid var(--line)",
                      display: "block",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => onDelete(p)}
                    disabled={deletingId === p.id}
                    aria-label={m.admin.productGalleryDeleteAria}
                    style={{
                      position: "absolute",
                      top: -6,
                      right: -6,
                      width: 24,
                      height: 24,
                      borderRadius: "var(--r-pill)",
                      border: "1px solid var(--line)",
                      background: "var(--surface)",
                      color: "var(--bad)",
                      fontSize: 14,
                      lineHeight: 1,
                      cursor: "pointer",
                      boxShadow: "var(--shadow-xs)",
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {uploadMsg && <div className="err-text">{uploadMsg}</div>}
          {uploading && <div className="hint">{m.admin.productGalleryUploading}</div>}

          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            onChange={onFilesSelected}
            disabled={uploading}
          />
          <div className="hint">{m.admin.productGalleryHint}</div>
        </>
      )}
    </div>
  );
}
