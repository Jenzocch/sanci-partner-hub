"use client";

import { useCallback, useEffect, useState } from "react";
import { useCabangMessages } from "@/lib/i18n/provider";
import {
  getPackageContentsBranch,
  type PackageContentRow,
  type PackageContentsOutcome,
} from "../package-items-actions";

/**
 * "Lihat isi" — penampil HANYA BACA isi sebuah Package di sisi cabang
 * (partner_package_items, migrasi 0012). Dipakai dua layar:
 *   - /cabang/pesanan/baru  → di bawah dropdown Package, supaya staf tahu apa
 *                             yang ia pilihkan SEBELUM pesanan dibuat.
 *   - /cabang/pesanan/[id]  → di sebelah nama Package pesanan itu.
 *
 * Sengaja TIDAK memuat apa pun sampai ditekan: dua layar ini sudah padat
 * query, dan sebagian besar pengguna tidak membuka isinya setiap kali.
 *
 * EMPAT keadaan dibedakan, tidak ada yang dilebur (LESSONS #10):
 *   memuat · gagal (+ tombol coba lagi) · katalog belum dibuka · kosong.
 * Yang paling penting: gagal TIDAK PERNAH digambar sebagai "paket ini kosong".
 * Baris yang produknya tidak terbaca (produk ditarik dari katalog) tetap
 * ditampilkan dengan jumlahnya — menghilangkannya diam-diam akan membuat isi
 * paket terlihat lebih sedikit dari yang sebenarnya.
 *
 * Tidak ada tombol ubah/hapus di sini dan tidak boleh ada: isi Package
 * dikurasi SANCI (0012 §4 — cabang tidak punya policy tulis sama sekali).
 */

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; items: PackageContentRow[] }
  | { kind: "not_opened" }
  | { kind: "module_inactive" }
  | { kind: "error" };

export default function PackageContents({ packageId }: { packageId: string }) {
  const m = useCabangMessages();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<LoadState>({ kind: "idle" });

  // Package yang dipilih bisa berganti (dropdown di form pesanan baru) —
  // isi lama HARUS dibuang, bukan tetap terpampang di bawah nama yang lain.
  useEffect(() => {
    setOpen(false);
    setState({ kind: "idle" });
  }, [packageId]);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    let res: PackageContentsOutcome;
    try {
      res = await getPackageContentsBranch(packageId);
    } catch {
      // Jaringan putus / action tidak sampai — ini kegagalan, bukan "kosong".
      setState({ kind: "error" });
      return;
    }
    if (res.status === "ok") setState({ kind: "ok", items: res.items });
    else if (res.status === "not_opened") setState({ kind: "not_opened" });
    else if (res.status === "module_inactive") setState({ kind: "module_inactive" });
    else setState({ kind: "error" });
  }, [packageId]);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (state.kind === "idle" || state.kind === "error") void load();
  }

  const panelId = `pkgisi-${packageId}`;

  return (
    <div className="stack" style={{ gap: 8, marginTop: 6 }}>
      <div>
        <button
          type="button"
          className="btn sm ghost"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={panelId}
        >
          {open ? m.cabang.packageContentsHideCta : m.cabang.packageContentsCta}
        </button>
      </div>

      {open && (
        <div id={panelId}>
          <div className="overline">{m.cabang.packageContentsTitle}</div>
          {state.kind === "loading" && <div className="hint">{m.common.loading}</div>}
          {state.kind === "error" && (
            <div>
              <div className="err">{m.cabang.packageContentsLoadError}</div>
              <div className="btnrow-inline">
                <button type="button" className="btn sm" onClick={() => void load()}>
                  {m.common.retry}
                </button>
              </div>
            </div>
          )}
          {state.kind === "module_inactive" && (
            <div className="banner bad">{m.cabang.errFeatureInactive}</div>
          )}
          {state.kind === "not_opened" && (
            <div className="banner info">{m.cabang.packageContentsCatalogClosed}</div>
          )}
          {state.kind === "ok" &&
            (state.items.length === 0 ? (
              <div className="emptybox">{m.cabang.packageContentsEmpty}</div>
            ) : (
              <ul className="audit-list">
                {state.items.map((it) => (
                  <li key={it.id}>
                    <div className="spread">
                      <span>
                        {it.name ? (
                          <strong>{it.name}</strong>
                        ) : (
                          <span className="muted">{m.cabang.packageContentsProductGone}</span>
                        )}
                        {it.code && (
                          <>
                            {" "}
                            <span className="code">{it.code}</span>
                          </>
                        )}{" "}
                        <span className="chip qty" aria-label={`${m.cabang.orderItemColQty} ${it.quantity}`}>
                          ×{it.quantity}
                        </span>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ))}
        </div>
      )}
    </div>
  );
}
