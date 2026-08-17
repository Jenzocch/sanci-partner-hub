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
  whatsapp: "WhatsApp",
  role: "Peran",
  visibility_scope: "Visibilitas",
  edit_scope: "Cakupan Edit",
  configured: "Dikonfigurasi",
  end_at: "Tanggal Berakhir",
  order_number: "Nomor Pesanan",
  package_name: "Package",
  notes: "Catatan",
  description: "Deskripsi",
  cancellation_reason: "Alasan Pembatalan",
};

// Nilai enum internal → bahasa sehari-hari.
const VALUE_LABELS: Record<string, string> = {
  REGISTERED: "Terdaftar",
  CANCELLED: "Dibatalkan",
  ACTIVE: "Aktif",
  INACTIVE: "Nonaktif",
  DRAFT: "Draf",
  SUSPENDED: "Ditangguhkan",
};

const asLabel = (v: unknown) => {
  const s = String(v);
  return VALUE_LABELS[s] ?? s;
};

// Kolom internal (id, UUID relasi, timestamp, kunci idempotency) tidak berarti
// apa-apa bagi pengguna non-teknis — jangan pernah ditampilkan mentah (SPEC §69).
// Pesanan produksi pertama (GH-GH-BSD-260817-0001) membuktikan daftar lama
// bocor: created_by / customer_id / partner_*_staff_id tampil sebagai UUID.
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
  "created_by",
  "cancelled_by",
  "cancelled_at",
  "customer_id",
  "partner_sales_staff_id",
  "partner_pic_staff_id",
  "package_id",
  "phone_normalized",
  "created_via_partner_id",
  "created_via_branch_id",
]);

// Kode aksi audit → kalimat sehari-hari (dipakai halaman Activity/History).
export const ACTION_LABELS: Record<string, string> = {
  ORDER_CREATED: "Pesanan dibuat",
  ORDER_UPDATED: "Pesanan diubah",
  ORDER_STATUS_CHANGED: "Status pesanan berubah",
  ORDER_CANCELLED: "Pesanan dibatalkan",
  ORDER_ATTRIBUTION_CORRECTED: "Atribusi cabang dikoreksi",
  CUSTOMER_CREATED: "Pelanggan dibuat",
  CUSTOMER_UPDATED: "Pelanggan diubah",
  CUSTOMER_PHONE_CHANGED: "Nomor telepon pelanggan diubah",
  PACKAGE_CREATED: "Package dibuat",
  PACKAGE_UPDATED: "Package diubah",
  PACKAGE_STATUS_CHANGED: "Status package berubah",
  PARTNER_CREATED: "Partner dibuat",
  PARTNER_UPDATED: "Partner diubah",
  PARTNER_STATUS_CHANGED: "Status partner berubah",
  BRANCH_CREATED: "Cabang dibuat",
  BRANCH_UPDATED: "Cabang diubah",
  BRANCH_STATUS_CHANGED: "Status cabang berubah",
  STAFF_CREATED: "Staf ditambahkan",
  STAFF_UPDATED: "Staf diubah",
  STAFF_DEACTIVATED: "Staf dinonaktifkan",
  STAFF_ASSIGNMENT_CREATED: "Penugasan staf dibuat",
  STAFF_ASSIGNMENT_CHANGED: "Penugasan staf berubah",
  USER_CREATED: "Akun dibuat",
  USER_DISABLED: "Akun dinonaktifkan",
  USER_REACTIVATED: "Akun diaktifkan kembali",
  PERMISSION_CHANGED: "Izin akses diubah",
};

export const ROLE_LABELS: Record<string, string> = {
  PARTNER_USER: "Pengguna Cabang",
  SANCI_ADMIN: "SANCI Admin",
};

export function formatAuditAction(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export function formatActorRole(role: string | null): string {
  if (!role) return "";
  return ROLE_LABELS[role] ?? role;
}

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
      lines.push(`${label}: ${asLabel(a)}`);
    } else if (a === undefined) {
      lines.push(`${label}: ${asLabel(b)} (dihapus)`);
    } else {
      lines.push(`${label}: ${asLabel(b)} → ${asLabel(a)}`);
    }
  }
  return lines;
}
