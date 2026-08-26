"use client";

/**
 * Daftar "Harga Normal" (/cabang/harga, 0021) — sisi client.
 *
 * Satu baris = satu produk katalog: Harga Dasar SANCI (baca saja) → Harga
 * Normal toko ini (input + Simpan; tombol "Ikuti harga SANCI" menghapus
 * override sehingga lookup jatuh kembali ke harga dasar). Pencarian/
 * kategori/muat-lebih memakai hook katalog bersama (lib/use-catalog-
 * search.ts) — pemakai ketujuh kontrak lib/catalog-query.ts.
 *
 * State harga per baris:
 *   - `overrides` = nilai TERSIMPAN yang sudah dikonfirmasi server sesi
 *     ini (menimpa my_price bawaan baris — baris hasil pencarian lama
 *     tidak menampilkan harga basi setelah disimpan).
 *   - `drafts` = isi input yang belum disimpan; TIDAK pernah ditimpa
 *     respons fetch yang datang belakangan (LESSONS #1 — input terkontrol
 *     per-baris, fetch hanya mengganti daftar baris, bukan drafts).
 *   - Pesan per baris: sukses ✓ hanya setelah server mengonfirmasi
 *     (LESSONS #2/#7); "belum pasti" tampil apa adanya, bukan sebagai
 *     sukses maupun gagal.
 */

import { useCallback, useMemo, useState } from "react";
import { formatIDR, parseIDRInput } from "@/lib/orders-shared";
import { useCatalogSearch, type CatalogFetchResult } from "@/lib/use-catalog-search";
import { useCabangMessages } from "@/lib/i18n/provider";
import {
  clearMyPrice,
  getHargaPageBranch,
  setMyPrice,
  type HargaRow,
} from "./actions";

type RowMsg = { kind: "ok" | "bad" | "unsure"; text: string };

export default function HargaClient({
  initialProducts,
  initialHasMore,
  initialCategories,
}: {
  initialProducts: HargaRow[];
  initialHasMore: boolean;
  initialCategories: string[];
}) {
  const m = useCabangMessages();

  const fetchForHook = useCallback(
    async (input: {
      q: string;
      category: string | null;
      offset: number;
      withCategories?: boolean;
    }): Promise<CatalogFetchResult<HargaRow>> => {
      try {
        const res = await getHargaPageBranch(input);
        if (res.status === "ok") {
          return { ok: true, products: res.products, hasMore: res.hasMore, categories: res.categories };
        }
        if (res.status === "not_opened") return { ok: false, message: m.cabang.catalogNotOpenedMsg };
        if (res.status === "module_inactive") return { ok: false, message: m.cabang.hargaModuleInactiveMsg };
        return { ok: false, message: m.cabang.errProductListLoadFailed };
      } catch {
        return { ok: false, message: m.cabang.errProductListLoadFailed };
      }
    },
    [m]
  );

  const katalog = useCatalogSearch<HargaRow>({
    fetchPage: fetchForHook,
    initial: { products: initialProducts, hasMore: initialHasMore },
    initialCategories,
    fallbackErrorMessage: m.cabang.errProductListLoadFailed,
  });
  const { products, hasMore, searching, loadingMore, error } = katalog;

  const categories = useMemo(
    () => [...katalog.categories].sort((a, b) => a.localeCompare(b, m.common.dateLocale)),
    [katalog.categories, m.common.dateLocale]
  );

  /** Override TERSIMPAN yang dikonfirmasi server sesi ini (menimpa baris fetch). */
  const [overrides, setOverrides] = useState<Record<string, number | null>>({});
  /** Isi input per baris yang belum disimpan. */
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [rowMsg, setRowMsg] = useState<Record<string, RowMsg | undefined>>({});

  function savedPrice(row: HargaRow): number | null {
    return row.id in overrides ? overrides[row.id] : row.my_price;
  }
  function draftValue(row: HargaRow): string {
    if (row.id in drafts) return drafts[row.id];
    const mine = savedPrice(row);
    return mine === null ? "" : formatIDR(mine);
  }
  function setDraft(id: string, raw: string) {
    const n = parseIDRInput(raw);
    setDrafts((d) => ({ ...d, [id]: n === null ? "" : formatIDR(n) }));
    setRowMsg((r) => ({ ...r, [id]: undefined }));
  }

  async function handleSave(row: HargaRow) {
    const value = draftValue(row);
    if (value.trim() === "" || saving[row.id]) return;
    setSaving((s) => ({ ...s, [row.id]: true }));
    setRowMsg((r) => ({ ...r, [row.id]: undefined }));
    try {
      const res = await setMyPrice(row.id, value);
      if (res.ok) {
        setOverrides((o) => ({ ...o, [row.id]: res.myPrice }));
        setDrafts((d) => {
          const next = { ...d };
          delete next[row.id];
          return next;
        });
        setRowMsg((r) => ({ ...r, [row.id]: { kind: "ok", text: m.cabang.hargaSavedOk } }));
      } else {
        // "belum pasti" ≠ gagal (LESSONS #2) — teksnya sendiri yang bicara.
        const unsure = res.message === m.cabang.hargaSaveUnsure;
        setRowMsg((r) => ({ ...r, [row.id]: { kind: unsure ? "unsure" : "bad", text: res.message } }));
      }
    } catch {
      setRowMsg((r) => ({ ...r, [row.id]: { kind: "unsure", text: m.cabang.hargaSaveUnsure } }));
    } finally {
      setSaving((s) => ({ ...s, [row.id]: false }));
    }
  }

  async function handleClear(row: HargaRow) {
    if (saving[row.id]) return;
    setSaving((s) => ({ ...s, [row.id]: true }));
    setRowMsg((r) => ({ ...r, [row.id]: undefined }));
    try {
      const res = await clearMyPrice(row.id);
      if (res.ok) {
        setOverrides((o) => ({ ...o, [row.id]: null }));
        setDrafts((d) => {
          const next = { ...d };
          next[row.id] = "";
          return next;
        });
        setRowMsg((r) => ({ ...r, [row.id]: { kind: "ok", text: m.cabang.hargaClearedOk } }));
      } else {
        const unsure = res.message === m.cabang.hargaSaveUnsure;
        setRowMsg((r) => ({ ...r, [row.id]: { kind: unsure ? "unsure" : "bad", text: res.message } }));
      }
    } catch {
      setRowMsg((r) => ({ ...r, [row.id]: { kind: "unsure", text: m.cabang.hargaSaveUnsure } }));
    } finally {
      setSaving((s) => ({ ...s, [row.id]: false }));
    }
  }

  return (
    <>
      <div className="searchrow">
        <input
          className="search-input"
          type="search"
          placeholder={m.common.produkSearchPlaceholder}
          value={katalog.q}
          onChange={(e) => katalog.setQuery(e.target.value)}
        />
      </div>

      {categories.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          <button
            type="button"
            className={`btn sm${katalog.category === null ? " primary" : ""}`}
            onClick={() => katalog.setCategoryFilter(null)}
          >
            {m.common.filterAll}
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

      {/* Pencarian gagal TIDAK mengosongkan daftar — hasil sebelumnya tetap
          tampil di bawah banner (aturan hook bersama). */}
      {error && <div className="banner bad">{error}</div>}
      {searching && <div className="hint">{m.common.loading}</div>}

      {products.length === 0 ? (
        !searching && (
          <div className="card emptybox">
            {katalog.isFiltered ? m.common.noProductsMatchSearch : m.common.noProductsYet}
          </div>
        )
      ) : (
        <div>
          {products.map((row) => {
            const mine = savedPrice(row);
            const value = draftValue(row);
            const msg = rowMsg[row.id];
            const busy = !!saving[row.id];
            const dirty =
              value.trim() !== "" && value !== (mine === null ? "" : formatIDR(mine));
            return (
              <div key={row.id} className="card" style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 650 }}>
                  {row.name} {row.code && <span className="code">{row.code}</span>}
                </div>
                <div className="small muted" style={{ marginTop: 4 }}>
                  {m.cabang.hargaBaseLabel}:{" "}
                  {row.base_price === null ? m.cabang.hargaNoBase : formatIDR(row.base_price)}
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    alignItems: "flex-end",
                    marginTop: 8,
                  }}
                >
                  <div className="field" style={{ margin: 0, flex: "1 1 170px", minWidth: 150 }}>
                    <label htmlFor={`hn_${row.id}`}>{m.cabang.hargaMyLabel}</label>
                    <input
                      id={`hn_${row.id}`}
                      type="text"
                      inputMode="numeric"
                      placeholder={
                        row.base_price === null ? "Rp 0" : formatIDR(row.base_price)
                      }
                      value={value}
                      onChange={(e) => setDraft(row.id, e.target.value)}
                      disabled={busy}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn sm primary"
                    disabled={busy || !dirty}
                    onClick={() => handleSave(row)}
                  >
                    {busy ? m.common.saving : m.common.save}
                  </button>
                  {mine !== null && (
                    <button
                      type="button"
                      className="btn sm"
                      disabled={busy}
                      onClick={() => handleClear(row)}
                    >
                      {m.cabang.hargaResetCta}
                    </button>
                  )}
                </div>
                {mine === null && !dirty && (
                  <div className="hint" style={{ marginTop: 6 }}>
                    {m.cabang.hargaFollowsBaseNote}
                  </div>
                )}
                {msg &&
                  (msg.kind === "bad" ? (
                    <div className="err-text">{msg.text}</div>
                  ) : (
                    <div
                      className="small"
                      style={{
                        marginTop: 6,
                        fontWeight: 600,
                        color: msg.kind === "ok" ? "var(--ok)" : "var(--warn)",
                      }}
                    >
                      {msg.text}
                    </div>
                  ))}
              </div>
            );
          })}
        </div>
      )}

      {hasMore && products.length > 0 && (
        <div className="btnrow" style={{ justifyContent: "center", marginTop: 14 }}>
          <button
            type="button"
            className="btn"
            onClick={katalog.loadMore}
            disabled={loadingMore || searching}
          >
            {loadingMore ? m.common.loading : m.common.loadMoreCta}
          </button>
        </div>
      )}
    </>
  );
}
