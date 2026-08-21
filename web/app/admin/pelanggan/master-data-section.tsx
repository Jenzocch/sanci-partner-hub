"use client";

/**
 * Satu komponen untuk KEDUA master data ("Kode Sumber Tamu" dan "Kode
 * Sales") — parameterized lewat `kind`, bukan dua file kembar. Beda dari
 * pola product-actions.tsx/package-actions.tsx (yang memang dua file
 * terpisah karena field & aturan bisnisnya berbeda cukup jauh): kedua master
 * di sini punya BENTUK identik (kode + satu teks + status ACTIVE/INACTIVE),
 * hanya beda nama tabel/field/pesan — menggandakan file di sini hanya akan
 * menggandakan bug yang sama dua kali kalau ada yang perlu diperbaiki.
 *
 * Idiom status-toggle DIIKUTI dari partner-actions.tsx: konfirmasi untuk
 * NONAKTIFKAN (dialog terpisah), langsung untuk AKTIFKAN (tidak ada yang
 * dirugikan, LESSONS #4 — status ini murni bisa dibalik).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSubmitGuard } from "@/lib/use-submit-guard";
import { useAdminMessages } from "@/lib/i18n/provider";
import {
  createCustomerSource,
  updateCustomerSource,
  setCustomerSourceStatus,
  createSalesStaff,
  updateSalesStaff,
  setSalesStaffStatus,
} from "../actions-customers";

type Row = { id: string; code: string; text: string; status: string };
type Kind = "source" | "sales";

export default function MasterDataSection({
  kind,
  rows,
  migrationMissing,
}: {
  kind: Kind;
  rows: Row[];
  migrationMissing: boolean;
}) {
  const router = useRouter();
  const m = useAdminMessages();
  const { submitting, begin, release, reset } = useSubmitGuard();
  const [addOpen, setAddOpen] = useState(false);
  const [addErrs, setAddErrs] = useState<Record<string, string>>({});
  const [editId, setEditId] = useState<string | null>(null);
  const [editErrs, setEditErrs] = useState<Record<string, string>>({});
  const [confirmDeactivate, setConfirmDeactivate] = useState<Row | null>(null);

  const labels =
    kind === "source"
      ? {
          codeField: m.admin.sourceCodeFieldLabel,
          textField: m.admin.sourceLabelFieldLabel,
          addBtn: m.admin.sourceAddBtn,
          addTitle: m.admin.sourceAddModalTitle,
          editTitle: m.admin.sourceEditModalTitle,
          empty: m.admin.sourceEmpty,
          colText: m.admin.sourceColLabel,
        }
      : {
          codeField: m.admin.salesCodeFieldLabel,
          textField: m.admin.salesNameFieldLabel,
          addBtn: m.admin.salesAddBtn,
          addTitle: m.admin.salesAddModalTitle,
          editTitle: m.admin.salesEditModalTitle,
          empty: m.admin.salesEmpty,
          colText: m.admin.salesColName,
        };

  async function runCreate(fd: FormData): Promise<{ error?: { field?: string; message: string } }> {
    const code = String(fd.get("code") || "");
    const text = String(fd.get("text") || "");
    const rid = crypto.randomUUID();
    const res =
      kind === "source"
        ? await createCustomerSource({ code, label: text, clientRequestId: rid })
        : await createSalesStaff({ code, name: text, clientRequestId: rid });
    return "error" in res ? { error: res.error } : {};
  }

  async function runUpdate(id: string, fd: FormData): Promise<{ error?: { field?: string; message: string } }> {
    const code = String(fd.get("code") || "");
    const text = String(fd.get("text") || "");
    const res =
      kind === "source"
        ? await updateCustomerSource(id, { code, label: text })
        : await updateSalesStaff(id, { code, name: text });
    return "error" in res ? { error: res.error } : {};
  }

  async function runSetStatus(id: string, status: "ACTIVE" | "INACTIVE") {
    return kind === "source" ? setCustomerSourceStatus(id, status) : setSalesStaffStatus(id, status);
  }

  async function onAddSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!begin()) return;
    setAddErrs({});
    const fd = new FormData(e.currentTarget);
    const out = await runCreate(fd);
    release();
    if (out.error) {
      setAddErrs({ [out.error.field || "_form"]: out.error.message });
      return;
    }
    setAddOpen(false);
    router.refresh();
  }

  async function onEditSubmit(e: React.FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault();
    if (!begin()) return;
    setEditErrs({});
    const fd = new FormData(e.currentTarget);
    const out = await runUpdate(id, fd);
    release();
    if (out.error) {
      setEditErrs({ [out.error.field || "_form"]: out.error.message });
      return;
    }
    setEditId(null);
    router.refresh();
  }

  async function onToggleActivate(row: Row) {
    if (!begin()) return;
    const res = await runSetStatus(row.id, "ACTIVE");
    release();
    if ("error" in res) {
      alert(res.error.message);
      return;
    }
    router.refresh();
  }

  async function onConfirmDeactivate() {
    if (!confirmDeactivate || !begin()) return;
    const res = await runSetStatus(confirmDeactivate.id, "INACTIVE");
    if ("error" in res) {
      release();
      alert(res.error.message);
      return;
    }
    release();
    setConfirmDeactivate(null);
    router.refresh();
  }

  if (migrationMissing) {
    return <div className="card emptybox">{m.admin.customerCodeMigrationMsg}</div>;
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        <button
          className="btn primary"
          onClick={() => {
            reset();
            setAddErrs({});
            setAddOpen(true);
          }}
        >
          {labels.addBtn}
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="card emptybox">{labels.empty}</div>
      ) : (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>{m.common.code}</th>
                <th>{labels.colText}</th>
                <th>{m.common.status}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className="code">{r.code}</span>
                  </td>
                  <td>{r.text}</td>
                  <td>
                    <span className={`chip ${r.status}`}>
                      {r.status === "ACTIVE" ? m.common.statusActive : m.common.statusInactive}
                    </span>
                  </td>
                  <td className="ta-right">
                    <div className="btnrow-inline" style={{ marginTop: 0 }}>
                      <button
                        className="btn sm"
                        onClick={() => {
                          reset();
                          setEditErrs({});
                          setEditId(r.id);
                        }}
                      >
                        {m.common.edit}
                      </button>
                      {r.status === "ACTIVE" ? (
                        <button className="btn sm" onClick={() => setConfirmDeactivate(r)} disabled={submitting}>
                          {m.common.deactivate}
                        </button>
                      ) : (
                        <button className="btn sm" onClick={() => onToggleActivate(r)} disabled={submitting}>
                          {m.common.activate}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {addOpen && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setAddOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true">
            <h2>{labels.addTitle}</h2>
            {addErrs._form && <div className="banner bad">{addErrs._form}</div>}
            <form onSubmit={onAddSubmit}>
              <div className={`field${addErrs.code ? " invalid" : ""}`}>
                <label htmlFor="md_add_code">{labels.codeField}</label>
                <input id="md_add_code" name="code" type="text" style={{ textTransform: "uppercase" }} autoComplete="off" />
                {addErrs.code && <div className="err-text">{addErrs.code}</div>}
              </div>
              <div className={`field${addErrs.label || addErrs.name ? " invalid" : ""}`}>
                <label htmlFor="md_add_text">{labels.textField}</label>
                <input id="md_add_text" name="text" type="text" autoComplete="off" />
                {(addErrs.label || addErrs.name) && <div className="err-text">{addErrs.label || addErrs.name}</div>}
              </div>
              <div className="btnrow">
                <button type="button" className="btn" onClick={() => setAddOpen(false)}>
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

      {editId &&
        (() => {
          const row = rows.find((r) => r.id === editId);
          if (!row) return null;
          return (
            <div className="overlay" onClick={(e) => e.target === e.currentTarget && setEditId(null)}>
              <div className="modal" role="dialog" aria-modal="true">
                <h2>{labels.editTitle}</h2>
                {editErrs._form && <div className="banner bad">{editErrs._form}</div>}
                <form onSubmit={(e) => onEditSubmit(e, row.id)}>
                  <div className={`field${editErrs.code ? " invalid" : ""}`}>
                    <label htmlFor="md_edit_code">{labels.codeField}</label>
                    <input
                      id="md_edit_code"
                      name="code"
                      type="text"
                      defaultValue={row.code}
                      style={{ textTransform: "uppercase" }}
                    />
                    {editErrs.code && <div className="err-text">{editErrs.code}</div>}
                  </div>
                  <div className={`field${editErrs.label || editErrs.name ? " invalid" : ""}`}>
                    <label htmlFor="md_edit_text">{labels.textField}</label>
                    <input id="md_edit_text" name="text" type="text" defaultValue={row.text} />
                    {(editErrs.label || editErrs.name) && (
                      <div className="err-text">{editErrs.label || editErrs.name}</div>
                    )}
                  </div>
                  <div className="btnrow">
                    <button type="button" className="btn" onClick={() => setEditId(null)}>
                      {m.common.cancel}
                    </button>
                    <button type="submit" className="btn primary" disabled={submitting}>
                      {submitting ? m.common.saving : m.common.save}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          );
        })()}

      {confirmDeactivate && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setConfirmDeactivate(null)}>
          <div className="modal" role="dialog" aria-modal="true">
            <h2>{m.admin.customerMasterDeactivateTitle.replace("{text}", confirmDeactivate.text)}</h2>
            <p style={{ marginBottom: 6 }}>{m.admin.customerMasterDeactivateBody}</p>
            <div className="btnrow">
              <button type="button" className="btn" onClick={() => setConfirmDeactivate(null)}>
                {m.common.cancel}
              </button>
              <button type="button" className="btn danger" onClick={onConfirmDeactivate} disabled={submitting}>
                {submitting ? m.common.saving : m.common.deactivate}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
