import { createClient } from "@/lib/supabase/server";
import { STOCK_STATUS_CHIP, stockStatusLabel, type SanciProductRow, type StockStatus } from "@/lib/catalog-shared";
import AddProductButton from "./add-product-button";
import ProductActions from "./product-actions";
import ProductPhoto from "./product-photo";
import { getMessages } from "@/lib/i18n";

export const dynamic = "force-dynamic";

function isMissingTableErr(err: { code?: string } | null): boolean {
  return !!err && err.code === "42P01";
}

export default async function ProdukPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; stock?: string }>;
}) {
  const m = await getMessages();
  const STOCK_OPTIONS: { value: "ALL" | StockStatus; label: string }[] = [
    { value: "ALL", label: m.admin.filterStockAll },
    { value: "AVAILABLE", label: m.common.stockAvailable },
    { value: "LIMITED", label: m.common.stockLimited },
    { value: "OUT_OF_STOCK", label: m.common.stockOutOfStock },
  ];
  const sp = await searchParams;
  const q = (sp.q || "").trim().toLowerCase();
  const stockFilter: "ALL" | StockStatus =
    sp.stock === "AVAILABLE" || sp.stock === "LIMITED" || sp.stock === "OUT_OF_STOCK" ? sp.stock : "ALL";

  const supabase = await createClient();
  const { data: products, error } = await supabase
    .from("sanci_products")
    .select("id, name, code, category, description, photo_url, stock_status, status, created_at, updated_at")
    .order("name");

  // sanci_products bisa saja belum ada (migrasi 0010 dijalankan terpisah dari
  // kode — LESSONS #12). Ini menggantikan SELURUH isi halaman, bukan cuma
  // tabelnya, karena tanpa tabel itu tidak ada apa pun yang bisa ditampilkan.
  if (isMissingTableErr(error)) {
    return (
      <div>
        <div className="worktop">
          <h1>{m.common.product}</h1>
        </div>
        <div className="card emptybox">{m.admin.catalogMigrationMsg}</div>
      </div>
    );
  }

  const allRows = (products ?? []) as SanciProductRow[];
  const rows = allRows.filter((p) => {
    if (q) {
      const hit = p.name.toLowerCase().includes(q) || (p.code || "").toLowerCase().includes(q);
      if (!hit) return false;
    }
    if (stockFilter !== "ALL" && p.stock_status !== stockFilter) return false;
    return true;
  });

  return (
    <div>
      <div className="worktop">
        <h1>{m.common.product}</h1>
        <AddProductButton />
      </div>

      <form className="searchrow wide" action="/admin/produk" method="GET">
        <input
          type="search"
          name="q"
          placeholder={m.admin.produkSearchPlaceholder}
          defaultValue={sp.q || ""}
          className="search-input"
        />
        <select name="stock" defaultValue={stockFilter} className="filter-select">
          {STOCK_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button className="btn" type="submit">
          {m.common.search}
        </button>
      </form>

      {error ? (
        <div className="card" style={{ margin: 0 }}>
          <div className="err">{m.common.errorLoad}</div>
        </div>
      ) : rows.length === 0 ? (
        <div className="card emptybox">
          {allRows.length === 0 ? m.admin.produkEmpty : m.admin.produkEmptyFiltered.replace("{q}", sp.q || "")}
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: 18,
          }}
        >
          {rows.map((p) => (
            <div
              key={p.id}
              className="card"
              style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", marginBottom: 0 }}
            >
              <ProductPhoto url={p.photo_url} name={p.name} />
              <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
                <div>
                  <div style={{ fontWeight: 650, fontSize: "var(--fs-body)" }}>{p.name}</div>
                  <div style={{ marginTop: 4 }}>
                    {p.code ? <span className="code">{p.code}</span> : <span className="small muted">—</span>}
                  </div>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <span className={STOCK_STATUS_CHIP[p.stock_status]}>{stockStatusLabel(m, p.stock_status)}</span>
                  <span className={`chip ${p.status}`}>
                    {p.status === "ACTIVE" ? m.common.statusActive : m.common.statusInactive}
                  </span>
                </div>
                <ProductActions product={p} />
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="footnote">{m.admin.produkFootnote}</p>
    </div>
  );
}
