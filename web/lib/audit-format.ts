import { formatIDR } from "./orders-shared";

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
  fulfillment_path: "Jalur Pesanan",
  partner_purchase_amount: "Total Belanja di Toko",
  invoice_url: "Invoice",
  category: "Kategori",
  stock_status: "Status Stok",
  enabled: "Akses Katalog",
};

// Nilai enum internal → bahasa sehari-hari.
const VALUE_LABELS: Record<string, string> = {
  REGISTERED: "Terdaftar",
  CANCELLED: "Dibatalkan",
  ACTIVE: "Aktif",
  INACTIVE: "Nonaktif",
  DRAF: "Draf",
  DRAFT: "Draf",
  SUSPENDED: "Ditangguhkan",
  DIRECT_DELIVERY: "Kirim Langsung",
  SHOWROOM_VISIT: "Kunjungan Showroom",
  AVAILABLE: "Tersedia",
  LIMITED: "Terbatas",
  OUT_OF_STOCK: "Habis",
  // Ditambahkan audit round 2 (LESSONS #28): nilai yang benar-benar ditulis DB
  // untuk menonaktifkan staf/akun (status ENDED/DISABLED) dan untuk kebijakan
  // akses (visibility_scope/edit_scope) tapi belum ada di tabel ini — tanpa
  // baris ini kode Inggris bocor mentah ke Activity (LESSONS #13). Wording
  // "Sesama partner" / "Cabang sendiri" disamakan dengan cabang/akun/page.tsx.
  ENDED: "Berakhir",
  DISABLED: "Dinonaktifkan",
  OWN_BRANCH: "Cabang sendiri",
  PARTNER_ALL_BRANCHES: "Sesama partner",
  SELECTED_BRANCHES: "Cabang terpilih",
  BRANCH_USER: "Pengguna Cabang",
};

const asLabel = (key: string, v: unknown) => {
  // Boolean mentah (mis. sanci_catalog_access.enabled) tidak boleh tampil
  // sebagai "true"/"false" — itu bahasa Inggris bocor ke UI (LESSONS #13).
  if (typeof v === "boolean") return v ? "Ya" : "Tidak";
  // Uang tetap harus lewat formatIDR — angka mentah ("1500000") tidak
  // terbaca sebagai Rupiah oleh staf non-teknis (item H audit round 2).
  if (key === "partner_purchase_amount" && typeof v === "number") return formatIDR(v);
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
  // Ditambahkan slice 4/5: parity dengan created_by/cancelled_by di atas —
  // customer_arrived_by adalah UUID aktor, photo_url adalah path storage.
  // Tanpa ini keduanya bocor mentah ke Activity (pola persis P2-2 lama).
  // customer_arrived_at TIDAK diikutkan diff: aksi ORDER_CUSTOMER_ARRIVED
  // sudah menyampaikan kejadiannya, dan waktunya sudah tampil terformat di
  // banner "Pelanggan sudah tiba" — sama seperti cancelled_at di atas.
  "customer_arrived_by",
  "customer_arrived_at",
  "photo_url",
]);

// Kode aksi audit → kalimat sehari-hari (dipakai halaman Activity/History).
export const ACTION_LABELS: Record<string, string> = {
  ORDER_CREATED: "Pesanan dibuat",
  ORDER_UPDATED: "Pesanan diubah",
  ORDER_STATUS_CHANGED: "Status pesanan berubah",
  ORDER_CANCELLED: "Pesanan dibatalkan",
  ORDER_ATTRIBUTION_CORRECTED: "Atribusi cabang dikoreksi",
  ORDER_CUSTOMER_ARRIVED: "Pelanggan tiba di SANCI",
  ORDER_INTERNAL_NOTE_CREATED: "Catatan internal SANCI ditambahkan",
  CUSTOMER_CREATED: "Pelanggan dibuat",
  CUSTOMER_UPDATED: "Pelanggan diubah",
  CUSTOMER_PHONE_CHANGED: "Nomor telepon pelanggan diubah",
  PACKAGE_CREATED: "Package dibuat",
  PACKAGE_UPDATED: "Package diubah",
  PACKAGE_STATUS_CHANGED: "Status package berubah",
  PRODUCT_CREATED: "Produk ditambahkan",
  PRODUCT_UPDATED: "Produk diubah",
  PRODUCT_STATUS_CHANGED: "Status produk berubah",
  PRODUCT_DELETED: "Produk dihapus",
  CATALOG_ACCESS_CREATED: "Akses katalog dibuka",
  CATALOG_ACCESS_UPDATED: "Akses katalog diubah",
  PARTNER_CREATED: "Partner dibuat",
  PARTNER_UPDATED: "Partner diubah",
  PARTNER_STATUS_CHANGED: "Status partner berubah",
  BRANCH_CREATED: "Cabang dibuat",
  BRANCH_UPDATED: "Cabang diubah",
  BRANCH_STATUS_CHANGED: "Status cabang berubah",
  STAFF_CREATED: "Staf ditambahkan",
  STAFF_UPDATED: "Staf diubah",
  STAFF_DEACTIVATED: "Staf dinonaktifkan",
  // fn_audit_row (migrasi 0001) memancarkan <PREFIX>_STATUS_CHANGED saat kolom
  // status berubah — bukan STAFF_DEACTIVATED / USER_DISABLED / dst. Tanpa label
  // ini, menonaktifkan staf / akun / penugasan menampilkan KODE MENTAH di layar
  // Aktivitas (SPEC §69). Label lama di atas dipertahankan (tidak berbahaya).
  STAFF_STATUS_CHANGED: "Status staf berubah",
  STAFF_ASSIGNMENT_CREATED: "Penugasan staf dibuat",
  // fn_audit_row (0010:558) memancarkan <PREFIX>_UPDATED, bukan _CHANGED —
  // STAFF_ASSIGNMENT_CHANGED di bawah adalah kode mati (tidak pernah ditulis
  // DB), dibiarkan agar tidak berbahaya kalau ada pemanggil lama.
  STAFF_ASSIGNMENT_UPDATED: "Penugasan staf berubah",
  STAFF_ASSIGNMENT_CHANGED: "Penugasan staf berubah",
  STAFF_ASSIGNMENT_STATUS_CHANGED: "Status penugasan staf berubah",
  USER_CREATED: "Akun dibuat",
  USER_DISABLED: "Akun dinonaktifkan",
  USER_REACTIVATED: "Akun diaktifkan kembali",
  USER_STATUS_CHANGED: "Status akun berubah",
  PERMISSION_CHANGED: "Izin akses diubah",
};

export const ROLE_LABELS: Record<string, string> = {
  PARTNER_USER: "Pengguna Cabang",
  SANCI_ADMIN: "SANCI Admin",
  // 0010:596 menulis 'SYSTEM' saat auth.uid() null (mis. proses server/trigger
  // tanpa sesi login) — tanpa label ini kode Inggris tampil mentah di Activity.
  SYSTEM: "Sistem",
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
      lines.push(`${label}: ${asLabel(key, a)}`);
    } else if (a === undefined) {
      lines.push(`${label}: ${asLabel(key, b)} (dihapus)`);
    } else {
      lines.push(`${label}: ${asLabel(key, b)} → ${asLabel(key, a)}`);
    }
  }
  return lines;
}
