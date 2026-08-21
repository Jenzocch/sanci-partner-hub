/**
 * Saran inisial `partner_staff.code` (migrasi 0019) dari `full_name` —
 * KEMUDAHAN UI MURNI, tidak pernah dipaksakan: field tetap bebas diedit/
 * dikosongkan, dan database TIDAK PERNAH mewajibkan kode ini terisi (lihat
 * kepala migration 0019 § "APA YANG DIBUKA IRISAN INI"). Dipakai dari dua
 * tempat (web/app/cabang/staff/[branchId]/add-staff-button.tsx dan
 * web/app/admin/partners/[id]/branches/[branchId]/add-staff-button.tsx) —
 * satu fungsi bersama supaya perilaku sarannya identik di kedua sisi
 * (LESSONS #27: pola yang disalin ke dua tempat gampang diverifikasi hanya
 * di satu sisi lalu sisi lain diam-diam beda).
 *
 * Hasilnya SELALU cocok dengan format server (huruf besar/angka, 1-10
 * karakter — CHECK constraint partner_staff_code_format) supaya saran yang
 * diterima apa adanya tidak pernah ditolak database.
 */
export function suggestStaffCode(fullName: string): string {
  const words = fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "";

  const raw =
    words.length === 1
      ? words[0].slice(0, 2)
      : words
          .slice(0, 3)
          .map((w) => w[0])
          .join("");

  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
}
