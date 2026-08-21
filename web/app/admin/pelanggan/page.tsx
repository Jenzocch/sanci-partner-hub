import { createClient } from "@/lib/supabase/server";
import AddCustomerButton from "./add-customer-button";
import MasterDataSection from "./master-data-section";
import { getMessages } from "@/lib/i18n";

export const dynamic = "force-dynamic";

type QueryErr = { code?: string; message?: string } | null;

function isMissingTableErr(err: QueryErr): boolean {
  return !!err && err.code === "42P01";
}
function isMissingColumnErr(err: QueryErr): boolean {
  return !!err && err.code === "42703";
}

type CustomerRow = {
  id: string;
  full_name: string;
  phone: string;
  address: string | null;
  email: string | null;
  customer_code: string | null;
  source_id: string | null;
  sales_staff_id: string | null;
  created_via_partner_id: string | null;
  created_via_branch_id: string | null;
  created_at: string;
};
type SourceRow = { id: string; code: string; label: string; status: string };
type SalesRow = { id: string; code: string; name: string; status: string };
type PartnerRow = { id: string; name: string };
type BranchRow = { id: string; name: string; partner_id: string };

export default async function PelangganPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tab?: string }>;
}) {
  const m = await getMessages();
  const sp = await searchParams;
  const q = (sp.q || "").trim().toLowerCase();
  const tab = sp.tab === "sumber" || sp.tab === "sales" ? sp.tab : "list";

  const supabase = await createClient();

  // source_id/sales_staff_id (migrasi 0018) BISA belum ada sebagai kolom
  // kalau kodenya sudah naik lebih dulu (LESSONS #12) — coba SELECT lebar
  // dulu, turun ke SELECT sempit kalau 42703 (kolom tak dikenal), supaya
  // daftar pelanggan dasar (nama/telepon/kode lama) tetap tampil walau fitur
  // baru ini belum aktif.
  let customers: CustomerRow[] = [];
  let customersErr: QueryErr = null;
  let codeFeatureOn = true;
  {
    const wide = await supabase
      .from("customers")
      .select(
        "id, full_name, phone, address, email, customer_code, source_id, sales_staff_id, created_via_partner_id, created_via_branch_id, created_at"
      )
      .order("created_at", { ascending: false });
    if (wide.error && isMissingColumnErr(wide.error)) {
      codeFeatureOn = false;
      const narrow = await supabase
        .from("customers")
        .select(
          "id, full_name, phone, address, email, customer_code, created_via_partner_id, created_via_branch_id, created_at"
        )
        .order("created_at", { ascending: false });
      customersErr = narrow.error;
      customers = ((narrow.data ?? []) as Omit<CustomerRow, "source_id" | "sales_staff_id">[]).map((c) => ({
        ...c,
        source_id: null,
        sales_staff_id: null,
      }));
    } else {
      customersErr = wide.error;
      customers = (wide.data ?? []) as CustomerRow[];
    }
  }

  const [{ data: sources, error: sourcesErr }, { data: sales, error: salesErr }, { data: partners }, { data: branches }] =
    await Promise.all([
      supabase.from("customer_sources").select("id, code, label, status").order("code"),
      supabase.from("sanci_sales_staff").select("id, code, name, status").order("code"),
      supabase.from("partners").select("id, name"),
      supabase.from("partner_branches").select("id, name, partner_id"),
    ]);

  const migrationMissing = isMissingTableErr(sourcesErr) || isMissingTableErr(salesErr) || !codeFeatureOn;

  const sourceById = new Map(((sources ?? []) as SourceRow[]).map((s) => [s.id, s]));
  const salesById = new Map(((sales ?? []) as SalesRow[]).map((s) => [s.id, s]));
  const partnerById = new Map(((partners ?? []) as PartnerRow[]).map((p) => [p.id, p]));
  const branchById = new Map(((branches ?? []) as BranchRow[]).map((b) => [b.id, b]));
  const activeSources = ((sources ?? []) as SourceRow[]).filter((s) => s.status === "ACTIVE");
  const activeSales = ((sales ?? []) as SalesRow[]).filter((s) => s.status === "ACTIVE");

  function createdViaLabel(c: CustomerRow): string {
    if (!c.created_via_partner_id) return m.admin.customerCreatedViaSanci;
    const partner = partnerById.get(c.created_via_partner_id);
    const branch = c.created_via_branch_id ? branchById.get(c.created_via_branch_id) : undefined;
    const partnerName = partner?.name || m.admin.customerCreatedViaUnknownPartner;
    return branch ? `${partnerName} · ${branch.name}` : partnerName;
  }

  const rows = customers.filter((c) => {
    if (!q) return true;
    return (
      c.full_name.toLowerCase().includes(q) ||
      c.phone.toLowerCase().includes(q) ||
      (c.customer_code || "").toLowerCase().includes(q)
    );
  });

  const tabs = [
    { key: "list", label: m.admin.customerTabList },
    { key: "sumber", label: m.admin.customerTabSources },
    { key: "sales", label: m.admin.customerTabSales },
  ];

  return (
    <div>
      <div className="worktop">
        <h1>{m.common.customer}</h1>
        {tab === "list" && (
          <AddCustomerButton
            sources={activeSources.map((s) => ({ id: s.id, code: s.code, label: s.label }))}
            sales={activeSales.map((s) => ({ id: s.id, code: s.code, name: s.name }))}
            codeFeatureOn={codeFeatureOn}
          />
        )}
      </div>

      <div className="tabs">
        {tabs.map((t) => (
          <a key={t.key} href={`/admin/pelanggan?tab=${t.key}`} className={`tab${tab === t.key ? " on" : ""}`}>
            {t.label}
          </a>
        ))}
      </div>

      {tab === "list" && (
        <div>
          <form className="searchrow wide" action="/admin/pelanggan" method="GET">
            <input type="hidden" name="tab" value="list" />
            <input
              type="search"
              name="q"
              placeholder={m.admin.customerSearchPlaceholder}
              defaultValue={sp.q || ""}
              className="search-input"
            />
            <button className="btn" type="submit">
              {m.common.search}
            </button>
          </form>

          {customersErr ? (
            <div className="card" style={{ margin: 0 }}>
              <div className="err">{m.common.errorLoad}</div>
            </div>
          ) : rows.length === 0 ? (
            <div className="card emptybox">
              {customers.length === 0
                ? m.admin.customerEmpty
                : m.admin.customerEmptyFiltered.replace("{q}", sp.q || "")}
            </div>
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
                        <td style={{ fontWeight: 650 }}>{c.full_name}</td>
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
        </div>
      )}

      {tab === "sumber" && (
        <MasterDataSection
          kind="source"
          migrationMissing={migrationMissing}
          rows={(sources ?? []).map((s: SourceRow) => ({ id: s.id, code: s.code, text: s.label, status: s.status }))}
        />
      )}

      {tab === "sales" && (
        <MasterDataSection
          kind="sales"
          migrationMissing={migrationMissing}
          rows={(sales ?? []).map((s: SalesRow) => ({ id: s.id, code: s.code, text: s.name, status: s.status }))}
        />
      )}

      {migrationMissing && tab === "list" && (
        <p className="footnote">{m.admin.customerCodeMigrationMsg}</p>
      )}
    </div>
  );
}
