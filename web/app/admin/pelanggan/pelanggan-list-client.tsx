"use client";

/**
 * Daftar pelanggan /admin/pelanggan (tab "list") — sejak 2026-08-28 pencarian
 * berjalan di DATABASE dan daftar tumbuh per 60 lewat "Muat Lebih Banyak"
 * (kontrak lib/catalog-query.ts, hook bersama lib/use-catalog-search.ts),
 * menggantikan pola lama "SELECT semua baris + saring di memori + form GET".
 * Batch pertama tetap dirender server (props initial*); ketikan → debounce
 * 300 ms → getPelangganPageAdmin.
 *
 * Semantik yang DIPERTAHANKAN dari versi lama:
 *   - kolom tabel sama persis (Nama/Telepon/Kode/Sumber·Sales/Dibuat via);
 *   - pencarian nama ATAU telepon ATAU kode (dulu includes() di memori,
 *     sekarang ilike server — sama-sama substring tanpa peduli kapital);
 *   - urutan created_at terbaru dulu (+ tiebreak id untuk offset paging);
 *   - dua kalimat kosong berbeda (belum ada pelanggan / tidak cocok "{q}").
 *
 * Kenapa TIDAK ada pemakaian patchProduct di layar ini (audit LESSONS #45
 * saat konversi): tab ini tidak punya tulisan per-baris sama sekali — tidak
 * ada modal Ubah/status untuk pelanggan. Satu-satunya tulisan yang berakhir
 * router.refresh() adalah "Tambah Pelanggan" (BARIS BARU, bukan ubahan baris
 * yang sedang tampil; patch per-id tidak berlaku): batch segar hasil refresh
 * diadopsi efek adopsi hook saat tanpa filter/gulungan, dan initialRef SELALU
 * diperbarui sehingga "kosongkan pencarian" memulihkan daftar yang sudah
 * memuat pelanggan baru itu. Tulisan master sumber/sales (tab lain) mengalir
 * lewat props sources/sales di bawah — itu props server murni yang dibaca
 * ulang setiap render, refresh biasa masih menembusnya. Kalau suatu saat tab
 * ini mendapat tulisan per-baris (mis. ubah nama pelanggan), WAJIB memanggil
 * daftar.patchProduct(id, patch) pada konfirmasi sukses — lihat
 * produk-admin-client.tsx untuk polanya.
 */

import { useCallback, useMemo } from "react";
import Link from "next/link";
import { useCatalogSearch, type CatalogFetchResult } from "@/lib/use-catalog-search";
import { useAdminMessages } from "@/lib/i18n/provider";
import { getPelangganPageAdmin, type AdminCustomerRow } from "../actions-customers";

/** Kunci sessionStorage keadaan jelajah — format sama dengan layar daftar
 *  lain yang memakai persist (mis. cabang.produk.browse). */
const BROWSE_STATE_KEY = "admin.pelanggan.browse";

type SourceOpt = { id: string; label: string };
type SalesOpt = { id: string; name: string };
type PartnerOpt = { id: string; name: string };
type BranchOpt = { id: string; name: string };

export default function PelangganListClient({
  initialCustomers,
  initialHasMore,
  sources,
  sales,
  partners,
  branches,
}: {
  initialCustomers: AdminCustomerRow[];
  initialHasMore: boolean;
  /** Master label (bukan baris daftar) — tetap props server murni, jadi
   *  router.refresh() sesudah edit master di tab lain langsung menembus. */
  sources: SourceOpt[];
  sales: SalesOpt[];
  partners: PartnerOpt[];
  branches: BranchOpt[];
}) {
  const m = useAdminMessages();

  const sourceById = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);
  const salesById = useMemo(() => new Map(sales.map((s) => [s.id, s])), [sales]);
  const partnerById = useMemo(() => new Map(partners.map((p) => [p.id, p])), [partners]);
  const branchById = useMemo(() => new Map(branches.map((b) => [b.id, b])), [branches]);

  const fetchForHook = useCallback(
    async (input: { q: string; category: string | null; offset: number }): Promise<
      CatalogFetchResult<AdminCustomerRow>
    > => {
      try {
        const res = await getPelangganPageAdmin({ q: input.q, offset: input.offset });
        if (res.status === "ok") return { ok: true, products: res.customers, hasMore: res.hasMore };
        return { ok: false, message: m.common.errorLoad };
      } catch {
        return { ok: false, message: m.common.errorLoad };
      }
    },
    [m]
  );

  const daftar = useCatalogSearch<AdminCustomerRow>({
    fetchPage: fetchForHook,
    initial: { products: initialCustomers, hasMore: initialHasMore },
    fallbackErrorMessage: m.common.errorLoad,
    // Keadaan jelajah DIPERTAHANKAN (audit UI 2026-09-01). Sampai nama
    // pelanggan menjadi tautan ke /admin/pelanggan/[customerId], daftar ini
    // memang tidak punya ke mana pun untuk pergi, jadi ketiadaan persist
    // tidak terasa. Sekarang setiap kali admin membuka satu pelanggan lalu
    // menekan kembali, pencarian yang baru diketik DAN posisi gulir hilang
    // — memeriksa lima pelanggan berarti mengetik kata kunci yang sama lima
    // kali. Pola dan kuncinya sama dengan /cabang/produk.
    persist: { key: BROWSE_STATE_KEY },
  });
  const { products: rows, hasMore, searching, loadingMore, error } = daftar;

  function createdViaLabel(c: AdminCustomerRow): string {
    if (!c.created_via_partner_id) return m.admin.customerCreatedViaSanci;
    const partner = partnerById.get(c.created_via_partner_id);
    const branch = c.created_via_branch_id ? branchById.get(c.created_via_branch_id) : undefined;
    const partnerName = partner?.name || m.admin.customerCreatedViaUnknownPartner;
    return branch ? `${partnerName} · ${branch.name}` : partnerName;
  }

  const emptyMessage = daftar.q.trim()
    ? m.admin.customerEmptyFiltered.replace("{q}", daftar.q.trim())
    : m.admin.customerEmpty;

  return (
    <div>
      <div className="searchrow wide">
        <input
          type="search"
          placeholder={m.admin.customerSearchPlaceholder}
          value={daftar.q}
          onChange={(e) => daftar.setQuery(e.target.value)}
          className="search-input"
        />
      </div>

      {/* Pencarian gagal ≠ daftar kosong — hasil sebelumnya tetap tampil
          (kontrak hook, keluarga LESSONS #10). */}
      {error && <div className="banner bad">{error}</div>}
      {searching && <div className="hint">{m.common.loading}</div>}

      {rows.length === 0 ? (
        !searching && <div className="card emptybox">{emptyMessage}</div>
      ) : (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>{m.common.name}</th>
                <th>{m.common.phone}</th>
                <th>{m.admin.customerColCode}</th>
                <th>{m.admin.customerColSourceSales}</th>
                <th>{m.admin.customerColCreatedVia}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const source = c.source_id ? sourceById.get(c.source_id) : undefined;
                const salesStaff = c.sales_staff_id ? salesById.get(c.sales_staff_id) : undefined;
                return (
                  <tr key={c.id}>
                    {/* prefetch=false: daftar ini bisa tumbuh sampai ratusan
                        baris lewat "Muat Lebih Banyak" dan tujuannya
                        force-dynamic — prefetch hanya membuang request
                        (alasan yang sama dengan daftar pesanan). */}
                    <td>
                      <Link
                        href={`/admin/pelanggan/${c.id}`}
                        className="rowname"
                        prefetch={false}
                        style={{ fontWeight: 650 }}
                      >
                        {c.full_name}
                      </Link>
                    </td>
                    <td>{c.phone}</td>
                    <td>
                      {c.customer_code ? (
                        <span className="code">{c.customer_code}</span>
                      ) : (
                        <span className="small muted">—</span>
                      )}
                    </td>
                    <td>
                      {source || salesStaff ? (
                        <span className="small">
                          {source?.label || "—"} · {salesStaff?.name || "—"}
                        </span>
                      ) : (
                        <span className="small muted">—</span>
                      )}
                    </td>
                    <td className="small muted">{createdViaLabel(c)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {hasMore && rows.length > 0 && (
        <div className="btnrow" style={{ justifyContent: "center", marginTop: 18 }}>
          <button
            type="button"
            className="btn"
            onClick={daftar.loadMore}
            disabled={loadingMore || searching}
          >
            {loadingMore ? m.common.loading : m.common.loadMoreCta}
          </button>
        </div>
      )}
    </div>
  );
}
