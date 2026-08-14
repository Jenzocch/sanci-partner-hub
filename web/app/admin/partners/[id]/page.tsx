import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PartnerActions from "./partner-actions";

export const dynamic = "force-dynamic";

const SLBL: Record<string, string> = {
  ACTIVE: "AKTIF",
  DRAFT: "DRAF",
  SUSPENDED: "DITANGGUHKAN",
  INACTIVE: "NONAKTIF",
};

export default async function PartnerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: partner } = await supabase
    .from("partners")
    .select("id, name, code, status, contact_name, contact_phone, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!partner) notFound();

  const [{ data: branches }, { data: users }, { data: policy }] = await Promise.all([
    supabase.from("partner_branches").select("id, name, address, city, status").eq("partner_id", id),
    supabase.from("partner_users").select("id, status").eq("partner_id", id),
    supabase.from("partner_access_policies").select("configured").eq("partner_id", id).maybeSingle(),
  ]);

  const activeBranches = (branches ?? []).filter((b) => b.status === "ACTIVE");
  const activeUsers = (users ?? []).filter((u) => u.status === "ACTIVE");
  const gate = [
    { ok: !!partner.name, label: "Nama partner" },
    { ok: !!partner.code, label: "Kode partner" },
    { ok: activeBranches.length > 0, label: "Minimal 1 cabang aktif" },
    { ok: activeUsers.length > 0, label: "Minimal 1 akun login aktif" },
    { ok: !!policy?.configured, label: "Hak akses sudah diatur" },
  ];
  const canActivate = gate.every((g) => g.ok);

  return (
    <div>
      <div className="crumb">
        <a href="/admin">Partner</a> / {partner.name}
      </div>
      <div className="pagehead">
        <h1>{partner.name}</h1>
        <span className={`chip ${partner.status}`} style={{ fontSize: 14, padding: "5px 14px" }}>
          {SLBL[partner.status]}
        </span>
      </div>

      <div className="cardgrid-two">
        <div className="card">
          <h3 style={{ fontSize: 17, marginBottom: 14 }}>Informasi Partner</h3>
          <dl className="kv">
            <dt>Kode</dt>
            <dd>
              <span className="code">{partner.code}</span>
            </dd>
            <dt>Status</dt>
            <dd>
              <span className={`chip ${partner.status}`}>{SLBL[partner.status]}</span>
            </dd>
            <dt>Kontak</dt>
            <dd>{partner.contact_name || "—"}</dd>
            <dt>WhatsApp</dt>
            <dd>{partner.contact_phone || "—"}</dd>
          </dl>
          <PartnerActions partner={partner} canActivate={canActivate} />
        </div>

        <div className="card">
          {partner.status === "DRAFT" ? (
            <>
              <h3 style={{ fontSize: 17, marginBottom: 12 }}>Syarat aktivasi</h3>
              <ul className="gate">
                {gate.map((g) => (
                  <li key={g.label} className={g.ok ? "yes" : "no"}>
                    {g.ok ? "✓ " : "○ "}
                    {g.label}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <h3 style={{ fontSize: 17, marginBottom: 12 }}>Cabang</h3>
              {activeBranches.length === 0 ? (
                <div className="emptybox" style={{ padding: 24 }}>
                  Belum ada cabang.
                </div>
              ) : (
                activeBranches.map((b) => (
                  <div key={b.id} className="rowline">
                    <span>
                      {b.name}
                      <div className="small muted">
                        {b.address}
                        {b.city ? `, ${b.city}` : ""}
                      </div>
                    </span>
                    <span className={`chip ${b.status}`}>{SLBL[b.status]}</span>
                  </div>
                ))
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
