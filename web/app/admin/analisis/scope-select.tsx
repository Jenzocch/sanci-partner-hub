import type { AdminMessages } from "@/lib/i18n";
import { scopeToParam, type Scope } from "@/lib/sales-report-shared";
import type { BranchOpt, PartnerOpt } from "./report-data";

/**
 * <select name="scope"> Laporan Penjualan admin: semua / satu partner /
 * satu cabang. Satu kontrol (bukan dua select bertingkat partner→cabang)
 * supaya tetap nol JavaScript — pilihan cabang yang tidak cocok dengan
 * partner terpilih tidak mungkin terjadi. <optgroup> per partner: baris
 * pertamanya "semua cabang", sisanya cabang-cabangnya.
 */
export default function ScopeSelect({
  m,
  scope,
  partners,
  branches,
}: {
  m: AdminMessages;
  scope: Scope;
  partners: PartnerOpt[];
  branches: BranchOpt[];
}) {
  return (
    <label className="small muted">
      {m.admin.reportScopeLabel + " "}
      <select name="scope" defaultValue={scopeToParam(scope)} className="filter-select">
        <option value="">{m.admin.reportScopeAll}</option>
        {partners.map((p) => (
          <optgroup key={p.id} label={`${p.name} (${p.code})`}>
            <option value={`p:${p.id}`}>{m.admin.reportScopePartnerAll.replace("{name}", p.name)}</option>
            {branches
              .filter((b) => b.partner_id === p.id)
              .map((b) => (
                <option key={b.id} value={`b:${b.id}`}>
                  {`${p.code} · ${b.name} (${b.code})`}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
