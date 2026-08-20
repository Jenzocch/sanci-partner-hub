import type { Messages } from "./i18n/messages";
import { formatIDR } from "./orders-shared";

/**
 * Layar Aktivitas dalam tiga bahasa.
 *
 * Semua teks hidup di lib/i18n/messages/common.ts; file ini hanya memetakan
 * KODE dari database (nama kolom, nilai enum, kode aksi) ke kunci pesan.
 * Pemanggil menyerahkan `Messages` miliknya — halaman server memakai
 * `await getMessages()`, komponen client memakai `useMessages()`.
 *
 * Kalau sebuah kode belum punya label, yang tampil adalah KODE MENTAH
 * (mis. "STAFF_ASSIGNMENT_CREATED") — itu bahasa Inggris bocor ke pengguna
 * non-teknis (LESSONS #13). Tambahkan barisnya di sini + kuncinya di
 * common.ts, jangan biarkan lolos.
 */

// Nama kolom database → label yang dimengerti pengguna.
function fieldLabel(m: Messages, key: string): string | undefined {
  const c = m.common;
  const map: Record<string, string> = {
    name: c.name,
    code: c.code,
    status: c.status,
    contact_name: c.contactName,
    contact_phone: c.whatsapp,
    address: c.address,
    city: c.city,
    province: c.province,
    full_name: c.fullName,
    phone: c.phone,
    whatsapp: c.whatsapp,
    role: c.role,
    visibility_scope: c.visibilityScope,
    edit_scope: c.editScope,
    configured: c.configured,
    end_at: c.endDate,
    order_number: c.orderNumber,
    package_name: c.package,
    notes: c.notes,
    description: c.description,
    cancellation_reason: c.cancellationReason,
    fulfillment_path: c.fulfillment,
    partner_purchase_amount: c.storePurchase,
    invoice_url: c.invoice,
    category: c.category,
    stock_status: c.stockStatus,
    enabled: c.catalogAccess,
    quantity: c.quantity,
    // 0013 — order_sanci_offers.amount. Nama kolomnya generik ("amount"), tapi
    // hanya SATU tabel di seluruh skema yang punya kolom bernama persis itu:
    // sudah diperiksa dengan menghitung kolom ber-"amount" di database lengkap
    // (0001→0013) dan yang muncul hanya `partner_purchase_amount` (nama lain)
    // dan `amount` milik tabel ini. Jadi pemetaan ini tidak bisa salah sasaran.
    amount: c.sanciOffer,
    // 0014 — DP/Kondisi Pembayaran menempel di order_sanci_offers (data yang
    // diketik manusia, bukan hasil hitungan — lihat catatan "PENYIMPANGAN
    // SADAR" di kepala migration 0014). shipping_address menempel di
    // partner_orders. Ketiganya angka/teks TUNGGAL, jadi aman dipetakan
    // langsung seperti kolom lain di peta ini.
    dp_amount: c.dpAmount,
    payment_condition: c.paymentCondition,
    shipping_address: c.shippingAddress,
    // 0014 — order_items. name_snapshot/code_snapshot SENGAJA diberi label
    // (bukan masuk SKIP di bawah): keduanya salinan beku nama/kode produk,
    // bermakna langsung bagi pembaca non-teknis (beda dari UUID relasi).
    name_snapshot: c.name,
    code_snapshot: c.code,
    note: c.notes,
    color_code: c.colorCode,
    custom_size: c.customSize,
    unit_price: c.unitPrice,
    line_discount: c.lineDiscount,
    // 0015 — rantai diskon tingkat pesanan (order_sanci_offers). discount_pcts
    // dirender lewat cabang KHUSUS di formatDiff() di bawah (bukan asLabel()
    // biasa — ia array jsonb, bukan skalar), tapi tetap perlu label KOLOMnya
    // di sini supaya baris diffnya punya judul. markup_pct/cash_discount/
    // final_amount adalah skalar biasa (lihat GLOSSARY.md §"订单层级的折扣链
    //计算" — kata "Diskon" DIIZINKAN di sini, beda dari line_discount di atas).
    discount_pcts: c.discountPcts,
    markup_pct: c.markupPct,
    cash_discount: c.cashDiscount,
    final_amount: c.finalAmount,
  };
  return map[key];
}

/**
 * discount_pcts (jsonb array, mis. [8, 10]) TIDAK bisa lewat asLabel() biasa —
 * itu bukan skalar. Dirender "8% + 10%" (rantai kosong → "-"), meniru cara
 * manusia membaca rantai persen berurutan (0015 GLOSSARY.md: multiplikatif,
 * bukan dijumlah — tapi TAMPILANNYA tetap "+" karena itu bagaimana pengguna
 * MENULISKAN daftarnya, bukan klaim bahwa efeknya penjumlahan).
 */
function discountChainLabel(v: unknown): string {
  if (!Array.isArray(v) || v.length === 0) return "-";
  return v.map((n) => `${n}%`).join(" + ");
}

// Nilai enum internal → bahasa sehari-hari.
function valueLabel(m: Messages, value: string): string | undefined {
  const c = m.common;
  const map: Record<string, string> = {
    REGISTERED: c.orderStatusRegistered,
    CANCELLED: c.orderStatusCancelled,
    ACTIVE: c.statusActive,
    INACTIVE: c.statusInactive,
    DRAF: c.statusDraft,
    DRAFT: c.statusDraft,
    SUSPENDED: c.statusSuspended,
    DIRECT_DELIVERY: c.fulfillmentDirect,
    SHOWROOM_VISIT: c.fulfillmentShowroom,
    AVAILABLE: c.stockAvailable,
    LIMITED: c.stockLimited,
    OUT_OF_STOCK: c.stockOutOfStock,
    // Ditambahkan audit round 2 (LESSONS #28): nilai yang benar-benar ditulis DB
    // untuk menonaktifkan staf/akun (status ENDED/DISABLED) dan untuk kebijakan
    // akses (visibility_scope/edit_scope) tapi belum ada di tabel ini — tanpa
    // baris ini kode Inggris bocor mentah ke Activity (LESSONS #13). Wording
    // "Sesama partner" / "Cabang sendiri" disamakan dengan cabang/akun/page.tsx.
    ENDED: c.statusEnded,
    DISABLED: c.statusDisabled,
    OWN_BRANCH: c.scopeOwnBranch,
    PARTNER_ALL_BRANCHES: c.scopePartnerAll,
    SELECTED_BRANCHES: c.scopeSelectedBranches,
    BRANCH_USER: c.roleBranchUser,
  };
  return map[value];
}

function asLabel(m: Messages, key: string, v: unknown): string {
  // 0015 — discount_pcts adalah ARRAY jsonb (mis. [8, 10]), bukan skalar.
  // Diperiksa PALING AWAL karena `typeof [] === "object"`, bukan salah satu
  // cabang di bawah — tanpa ini array akan jatuh ke String(v) dan tampil
  // sebagai "8,10" mentah alih-alih "8% + 10%".
  if (key === "discount_pcts" && Array.isArray(v)) return discountChainLabel(v);
  // Boolean mentah (mis. sanci_catalog_access.enabled) tidak boleh tampil
  // sebagai "true"/"false" — itu bahasa Inggris bocor ke UI (LESSONS #13).
  if (typeof v === "boolean") return v ? m.common.yes : m.common.no;
  // markup_pct (0015) adalah persentase TUNGGAL, bukan Rupiah — "%" ditambahkan
  // langsung, tidak lewat formatIDR (beda perlakuan dari amount/cash_discount
  // di bawah yang memang uang).
  if (key === "markup_pct" && typeof v === "number") return `${v}%`;
  // Uang tetap harus lewat formatIDR — angka mentah ("1500000") tidak
  // terbaca sebagai Rupiah oleh staf non-teknis (item H audit round 2).
  // Rupiah tetap format id-ID di ketiga bahasa: itu mata uang nyatanya.
  //
  // `amount` (0013, order_sanci_offers) ikut di sini dengan alasan yang sama.
  // Kolomnya `numeric(15,2)` sehingga to_jsonb() menghasilkan ANGKA JSON, bukan
  // teks — sudah diperiksa dengan jsonb_typeof() di Postgres 16 lokal, jadi
  // penjaga `typeof v === "number"` di bawah memang menangkapnya. Kalau suatu
  // hari tabel LAIN memakai nama kolom `amount`, mata uangnya harus tetap
  // Rupiah atau baris ini harus dipersempit — lihat catatan di fieldLabel().
  // cash_discount/final_amount (0015) ikut daftar ini dengan alasan yang sama
  // persis — keduanya numeric(15,2), keduanya Rupiah sungguhan.
  if (
    (key === "partner_purchase_amount" ||
      key === "amount" ||
      key === "dp_amount" ||
      key === "unit_price" ||
      key === "line_discount" ||
      key === "cash_discount" ||
      key === "final_amount") &&
    typeof v === "number"
  ) {
    return formatIDR(v);
  }
  const s = String(v);
  return valueLabel(m, s) ?? s;
}

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
  // Ditambahkan slice 6 (0012): product_id adalah UUID relasi ke sanci_products,
  // perlakuannya sama dengan customer_id / package_id di atas. Nama produknya
  // sudah terbaca di layar Isi Package; UUID-nya tidak berarti apa-apa bagi
  // pembaca non-teknis dan tidak boleh bocor ke Aktivitas (SPEC §69).
  "product_id",
  // Ditambahkan slice 7 (0013): `order_id` adalah UUID relasi ke partner_orders,
  // perlakuannya sama dengan customer_id / package_id / product_id di atas.
  // Ia SUDAH bocor sebelum ini — setiap baris ORDER_INTERNAL_NOTE_CREATED
  // (0009) menampilkan "order_id: 3fa85f64-…" mentah di layar Aktivitas, karena
  // daftar ini tidak pernah ikut diperbarui waktu tabel itu lahir. Persis pola
  // LESSONS #28. Nomor pesanannya sudah terbaca di judul halaman detail
  // pesanan; UUID-nya tidak berarti apa-apa bagi pembacanya.
  "order_id",
]);

// Kode aksi audit → KUNCI kalimat di common.ts (dipakai halaman Activity).
const ACTION_KEYS: Record<string, keyof Messages["common"]> = {
  ORDER_CREATED: "auditOrderCreated",
  ORDER_UPDATED: "auditOrderUpdated",
  ORDER_STATUS_CHANGED: "auditOrderStatusChanged",
  ORDER_CANCELLED: "auditOrderCancelled",
  ORDER_ATTRIBUTION_CORRECTED: "auditOrderAttributionCorrected",
  ORDER_CUSTOMER_ARRIVED: "auditOrderCustomerArrived",
  ORDER_INTERNAL_NOTE_CREATED: "auditOrderInternalNote",
  // 0013 — nilai penawaran SANCI per pesanan. Tabel order_sanci_offers tidak
  // punya kolom status, jadi hanya tiga aksi generik ini yang bisa muncul.
  // "Diisi" dan "diubah" sengaja dibedakan: yang pertama adalah keputusan baru,
  // yang kedua adalah koreksi/negosiasi ulang atas keputusan yang sudah ada.
  ORDER_OFFER_CREATED: "auditOrderOfferSet",
  ORDER_OFFER_UPDATED: "auditOrderOfferUpdated",
  ORDER_OFFER_DELETED: "auditOrderOfferRemoved",
  // 0014 — isi pesanan per baris (order_items). Tabel ini tidak punya kolom
  // status, jadi hanya tiga aksi generik ini yang bisa muncul.
  ORDER_ITEM_CREATED: "auditOrderItemCreated",
  ORDER_ITEM_UPDATED: "auditOrderItemUpdated",
  ORDER_ITEM_DELETED: "auditOrderItemDeleted",
  CUSTOMER_CREATED: "auditCustomerCreated",
  CUSTOMER_UPDATED: "auditCustomerUpdated",
  CUSTOMER_PHONE_CHANGED: "auditCustomerPhoneChanged",
  PACKAGE_CREATED: "auditPackageCreated",
  PACKAGE_UPDATED: "auditPackageUpdated",
  PACKAGE_STATUS_CHANGED: "auditPackageStatusChanged",
  // 0012 — isi Package. Tabel partner_package_items tidak punya kolom status,
  // jadi hanya tiga aksi generik ini yang bisa muncul.
  PACKAGE_ITEM_CREATED: "auditPackageItemAdded",
  PACKAGE_ITEM_UPDATED: "auditPackageItemUpdated",
  PACKAGE_ITEM_DELETED: "auditPackageItemRemoved",
  PRODUCT_CREATED: "auditProductCreated",
  PRODUCT_UPDATED: "auditProductUpdated",
  PRODUCT_STATUS_CHANGED: "auditProductStatusChanged",
  PRODUCT_DELETED: "auditProductDeleted",
  CATALOG_ACCESS_CREATED: "auditCatalogAccessCreated",
  CATALOG_ACCESS_UPDATED: "auditCatalogAccessUpdated",
  PARTNER_CREATED: "auditPartnerCreated",
  PARTNER_UPDATED: "auditPartnerUpdated",
  PARTNER_STATUS_CHANGED: "auditPartnerStatusChanged",
  BRANCH_CREATED: "auditBranchCreated",
  BRANCH_UPDATED: "auditBranchUpdated",
  BRANCH_STATUS_CHANGED: "auditBranchStatusChanged",
  STAFF_CREATED: "auditStaffCreated",
  STAFF_UPDATED: "auditStaffUpdated",
  STAFF_DEACTIVATED: "auditStaffDeactivated",
  // fn_audit_row (migrasi 0001) memancarkan <PREFIX>_STATUS_CHANGED saat kolom
  // status berubah — bukan STAFF_DEACTIVATED / USER_DISABLED / dst. Tanpa label
  // ini, menonaktifkan staf / akun / penugasan menampilkan KODE MENTAH di layar
  // Aktivitas (SPEC §69). Label lama di atas dipertahankan (tidak berbahaya).
  STAFF_STATUS_CHANGED: "auditStaffStatusChanged",
  STAFF_ASSIGNMENT_CREATED: "auditStaffAssignmentCreated",
  // fn_audit_row (0010:558) memancarkan <PREFIX>_UPDATED, bukan _CHANGED —
  // STAFF_ASSIGNMENT_CHANGED di bawah adalah kode mati (tidak pernah ditulis
  // DB), dibiarkan agar tidak berbahaya kalau ada pemanggil lama.
  STAFF_ASSIGNMENT_UPDATED: "auditStaffAssignmentUpdated",
  STAFF_ASSIGNMENT_CHANGED: "auditStaffAssignmentUpdated",
  STAFF_ASSIGNMENT_STATUS_CHANGED: "auditStaffAssignmentStatusChanged",
  USER_CREATED: "auditUserCreated",
  USER_DISABLED: "auditUserDisabled",
  USER_REACTIVATED: "auditUserReactivated",
  USER_STATUS_CHANGED: "auditUserStatusChanged",
  PERMISSION_CHANGED: "auditPermissionChanged",
};

const ROLE_KEYS: Record<string, keyof Messages["common"]> = {
  PARTNER_USER: "roleBranchUser",
  SANCI_ADMIN: "roleSanciAdmin",
  // 0010:596 menulis 'SYSTEM' saat auth.uid() null (mis. proses server/trigger
  // tanpa sesi login) — tanpa label ini kode Inggris tampil mentah di Activity.
  SYSTEM: "roleSystem",
};

export function formatAuditAction(m: Messages, action: string): string {
  const key = ACTION_KEYS[action];
  return key ? m.common[key] : action;
}

export function formatActorRole(m: Messages, role: string | null): string {
  if (!role) return "";
  const key = ROLE_KEYS[role];
  return key ? m.common[key] : role;
}

export function formatAuditDiff(
  m: Messages,
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

    const label = fieldLabel(m, key) || key;
    if (b === undefined || b === null) {
      if (a === null || a === "" || a === undefined) continue;
      lines.push(`${label}: ${asLabel(m, key, a)}`);
    } else if (a === undefined) {
      lines.push(`${label}: ${asLabel(m, key, b)} (${m.common.removed})`);
    } else {
      lines.push(`${label}: ${asLabel(m, key, b)} → ${asLabel(m, key, a)}`);
    }
  }
  return lines;
}
