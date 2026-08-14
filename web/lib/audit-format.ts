const LABELS: Record<string, string> = {
  name: "Nama",
  code: "Kode",
  status: "Status",
  contact_name: "Kontak",
  contact_phone: "WhatsApp",
  address: "Alamat",
  city: "Kota",
  province: "Provinsi",
  full_name: "Nama",
  phone: "Telepon",
  role: "Peran",
  visibility_scope: "Visibilitas",
  edit_scope: "Cakupan Edit",
  configured: "Dikonfigurasi",
  end_at: "Tanggal Berakhir",
};

// Kolom internal (id, timestamp, kunci idempotency) tidak berarti apa-apa
// bagi pengguna non-teknis — jangan pernah ditampilkan mentah (SPEC §69).
const SKIP = new Set([
  "id",
  "created_at",
  "updated_at",
  "client_request_id",
  "partner_id",
  "branch_id",
  "staff_id",
  "auth_user_id",
  "logo_url",
]);

export function formatAuditDiff(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null
): string[] {
  const keys = new Set([
    ...(before ? Object.keys(before) : []),
    ...(after ? Object.keys(after) : []),
  ]);
  const lines: string[] = [];

  for (const key of keys) {
    if (SKIP.has(key)) continue;
    const b = before ? before[key] : undefined;
    const a = after ? after[key] : undefined;
    if (JSON.stringify(b) === JSON.stringify(a)) continue;

    const label = LABELS[key] || key;
    if (b === undefined || b === null) {
      if (a === null || a === "" || a === undefined) continue;
      lines.push(`${label}: ${String(a)}`);
    } else if (a === undefined) {
      lines.push(`${label}: ${String(b)} (dihapus)`);
    } else {
      lines.push(`${label}: ${String(b)} → ${String(a)}`);
    }
  }
  return lines;
}
