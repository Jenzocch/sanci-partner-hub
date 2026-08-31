import { createClient } from "@/lib/supabase/server";
import { getAdminMessages } from "@/lib/i18n";
import ProductImg from "@/lib/product-img";
import type { ColorRow } from "../actions-colors";
import AddColorButton from "./add-color-button";
import ColorRowActions from "./color-row-actions";

export const dynamic = "force-dynamic";

function isMissingTableErr(err: { code?: string } | null): boolean {
  return !!err && err.code === "42P01";
}

/**
 * /admin/warna (Fitur A) — katalog warna GLOBAL (migrasi 0025,
 * `product_colors`). Menampilkan SEMUA status (ACTIVE + INACTIVE — sama
 * sengaja dengan /admin/produk: layar kelola, bukan etalase), terurut
 * sort_order lalu code.
 *
 * Server-rendered MURNI (tanpa client-state daftar, LESSONS #45) — palet
 * warna diperkirakan puluhan baris, jauh dari skala yang butuh pencarian
 * database bertahap (lib/catalog-query.ts). Interaktivitas per baris ada di
 * ColorRowActions (client kecil), yang `router.refresh()`-nya SELALU
 * menembus karena halaman ini bukan useState yang menelan props sekali.
 */
export default async function WarnaPage() {
  const m = await getAdminMessages();
  const supabase = await createClient();

  const { data: colors, error } = await supabase
    .from("product_colors")
    .select("id, code, name, photo_url, status, sort_order")
    .order("sort_order")
    .order("code");

  // product_colors bisa saja belum ada (migrasi 0025 dikerjakan terpisah dari
  // kode ini — LESSONS #12). Ini menggantikan SELURUH isi halaman — tanpa
  // tabel, tidak ada apa pun yang bisa ditampilkan (LESSONS #10: bukan
  // daftar kosong, banner yang menamai migrasinya).
  if (isMissingTableErr(error)) {
    return (
      <div>
        <div className="worktop">
          <h1>{m.admin.navColors}</h1>
        </div>
        <div className="card emptybox">{m.admin.colorMigrationMsg}</div>
      </div>
    );
  }
  if (error) {
    return (
      <div>
        <div className="worktop">
          <h1>{m.admin.navColors}</h1>
        </div>
        <div className="card" style={{ margin: 0 }}>
          <div className="err">{m.common.errorLoad}</div>
        </div>
      </div>
    );
  }

  const rows = (colors ?? []) as ColorRow[];

  return (
    <div>
      <div className="worktop">
        <h1>{m.admin.navColors}</h1>
        <AddColorButton />
      </div>

      {rows.length === 0 ? (
        <div className="card emptybox">{m.admin.colorEmpty}</div>
      ) : (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>{m.admin.colorPhotoFieldLabel}</th>
                <th>{m.admin.colorCodeFieldLabel}</th>
                <th>{m.admin.colorNameFieldLabel}</th>
                <th>{m.common.status}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c, i) => (
                <tr key={c.id}>
                  <td style={{ width: 56 }}>
                    <div style={{ width: 40, height: 40, borderRadius: "var(--r-md)", overflow: "hidden", border: "1px solid var(--line)" }}>
                      <ProductImg
                        src={c.photo_url}
                        alt={c.code}
                        placeholder={<span className="small muted" aria-hidden="true" />}
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                      />
                    </div>
                  </td>
                  <td>
                    <span className="code">{c.code}</span>
                  </td>
                  <td>{c.name || "—"}</td>
                  <td>
                    <span className={`chip ${c.status}`}>
                      {c.status === "ACTIVE" ? m.common.statusActive : m.common.statusInactive}
                    </span>
                  </td>
                  <td className="ta-right">
                    <ColorRowActions color={c} isFirst={i === 0} isLast={i === rows.length - 1} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="footnote">{m.admin.colorFootnote}</p>
    </div>
  );
}
