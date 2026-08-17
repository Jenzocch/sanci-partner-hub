"use server";

/**
 * Server Actions untuk Katalog Produk SANCI (Phase 2 slice 5) — dikelola
 * SANCI Admin saja. Tipe & label ada di lib/catalog-shared.ts (sumber
 * kebenaran tunggal, dipakai juga di sisi partner/cabang nanti).
 *
 * Pola idempotency + safeWrite ditiru dari actions-packages.ts (LESSONS #21)
 * supaya jaringan lemah tidak menghasilkan produk ganda.
 *
 * sanci_products / sanci_catalog_access BISA belum ada di database (migration
 * 0010 dikerjakan paralel dengan kode ini — LESSONS #12). Setiap error 42P01
 * diterjemahkan ke pesan degradasi yang sama, bukan dibiarkan bocor sebagai
 * error DB mentah (LESSONS #10).
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ProductStatus, StockStatus } from "@/lib/catalog-shared";
import { PESAN, confirmByRequestId, isRequestIdConflict, safeWrite } from "@/lib/safe-write";

type ActionError = { field?: string; message: string };
type ActionResult<T> = { data: T } | { error: ActionError };

// Sama persis dengan pesan di app/admin/produk/page.tsx dan di
// catalog-access-form.tsx — file "use server" tidak boleh mengekspor apa pun
// selain async function, jadi string ini didefinisikan ulang di sana.
const CATALOG_MIGRATION_MSG = "Fitur katalog produk belum aktif — migrasi belum dijalankan.";

const STOCK_STATUSES: StockStatus[] = ["AVAILABLE", "LIMITED", "OUT_OF_STOCK"];
const PRODUCT_STATUSES: ProductStatus[] = ["ACTIVE", "INACTIVE"];

function isMissingTable(code: string | undefined): boolean {
  return code === "42P01";
}

export async function createProduct(input: {
  name: string;
  code?: string;
  category?: string;
  description?: string;
  stockStatus: StockStatus;
  clientRequestId: string;
}): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const name = input.name.trim();
  if (!name) return { error: { field: "name", message: "Nama produk wajib diisi." } };
  if (!STOCK_STATUSES.includes(input.stockStatus)) {
    return { error: { field: "stock_status", message: "Status stok tidak valid." } };
  }

  // Idempotency (LESSONS #21/#3): request yang sama (retry jaringan lemah)
  // tidak boleh membuat baris kedua.
  const { data: existing, error: existingErr } = await supabase
    .from("sanci_products")
    .select("id")
    .eq("client_request_id", input.clientRequestId)
    .maybeSingle();
  if (existingErr) {
    if (isMissingTable(existingErr.code)) return { error: { message: CATALOG_MIGRATION_MSG } };
    return { error: { message: PESAN.serverSibuk } };
  }
  if (existing) {
    revalidatePath("/admin/produk");
    return { data: { id: existing.id } };
  }

  const written = await safeWrite(
    supabase
      .from("sanci_products")
      .insert({
        name,
        code: input.code?.trim() || null,
        category: input.category?.trim() || null,
        description: input.description?.trim() || null,
        stock_status: input.stockStatus,
        client_request_id: input.clientRequestId,
      })
      .select("id")
      .single()
  );

  const recheck = () =>
    confirmByRequestId(
      supabase
        .from("sanci_products")
        .select("id")
        .eq("client_request_id", input.clientRequestId)
        .maybeSingle()
    );

  if (!written.ok) {
    if (written.reason === "db") {
      if (isMissingTable(written.code)) return { error: { message: CATALOG_MIGRATION_MSG } };
      // Bentrok nomor permintaan = percobaan sebelumnya sudah mendarat (LESSONS #21).
      if (isRequestIdConflict(written)) {
        const again = await recheck();
        if (again.status === "found") {
          revalidatePath("/admin/produk");
          return { data: { id: again.data.id } };
        }
        return { error: { message: PESAN.belumPastiBaru } };
      }
      // Bentrok KODE PRODUK (sanci_products_code_key) — beda constraint dari
      // client_request_id di atas (LESSONS #21: satu tabel, dua unique, dua
      // arti berbeda). Tanpa cabang ini pengguna melihat "server sibuk" dan
      // menekan Simpan lagi berulang — tidak akan pernah berhasil karena
      // masalahnya bukan jaringan, sama seperti createPackage di actions-packages.ts.
      if (written.code === "23505") {
        return { error: { field: "code", message: "Kode produk sudah dipakai." } };
      }
      return { error: { message: PESAN.serverSibuk } };
    }
    // Jawaban tidak sampai: tanyakan status sebenarnya, jangan INSERT lagi.
    const check = await recheck();
    if (check.status === "found") {
      revalidatePath("/admin/produk");
      return { data: { id: check.data.id } };
    }
    return {
      error: { message: check.status === "absent" ? PESAN.belumTersimpan : PESAN.belumPastiBaru },
    };
  }

  revalidatePath("/admin/produk");
  return { data: { id: written.data.id } };
}

export async function updateProduct(
  id: string,
  input: { name: string; code?: string; category?: string; description?: string }
): Promise<ActionResult<true>> {
  const supabase = await createClient();
  const name = input.name.trim();
  if (!name) return { error: { field: "name", message: "Nama produk wajib diisi." } };

  const saved = await safeWrite(
    supabase
      .from("sanci_products")
      .update({
        name,
        code: input.code?.trim() || null,
        category: input.category?.trim() || null,
        description: input.description?.trim() || null,
      })
      .eq("id", id)
      .select("id")
      .single()
  );
  if (!saved.ok) {
    if (saved.reason === "db") {
      if (isMissingTable(saved.code)) return { error: { message: CATALOG_MIGRATION_MSG } };
      // Sama seperti createProduct: bentrok kode (23505) bukan "server sibuk"
      // — pesan generik akan menyuruh admin mengulang percobaan yang pasti
      // gagal lagi (parity dengan updatePackage di actions-packages.ts).
      if (saved.code === "23505") {
        return { error: { field: "code", message: "Kode produk sudah dipakai." } };
      }
      return { error: { message: PESAN.serverSibuk } };
    }
    return { error: { message: PESAN.belumPastiUbah } };
  }

  revalidatePath("/admin/produk");
  return { data: true };
}

export async function setProductStockStatus(
  id: string,
  stockStatus: StockStatus
): Promise<ActionResult<true>> {
  if (!STOCK_STATUSES.includes(stockStatus)) {
    return { error: { message: "Status stok tidak valid." } };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sanci_products")
    .update({ stock_status: stockStatus })
    .eq("id", id)
    .select("id")
    .single();
  if (error || !data) {
    if (isMissingTable(error?.code)) return { error: { message: CATALOG_MIGRATION_MSG } };
    return { error: { message: "Tidak bisa mengubah status stok sekarang." } };
  }

  revalidatePath("/admin/produk");
  return { data: true };
}

export async function setProductStatus(
  id: string,
  status: ProductStatus
): Promise<ActionResult<true>> {
  if (!PRODUCT_STATUSES.includes(status)) {
    return { error: { message: "Status produk tidak valid." } };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sanci_products")
    .update({ status })
    .eq("id", id)
    .select("id")
    .single();
  if (error || !data) {
    if (isMissingTable(error?.code)) return { error: { message: CATALOG_MIGRATION_MSG } };
    return { error: { message: "Tidak bisa mengubah status produk sekarang." } };
  }

  revalidatePath("/admin/produk");
  return { data: true };
}

/**
 * Menyimpan alamat foto yang baru diunggah (pola sama dengan setPartnerLogo
 * di actions.ts — LESSONS #6/#22). Dipanggil SESUDAH berkas berhasil masuk ke
 * storage dari browser. Kegagalan di sini tidak boleh menggagalkan
 * penyimpanan data produk — pemanggil hanya menampilkan peringatan.
 */
export async function setProductPhoto(id: string, photoUrl: string): Promise<ActionResult<true>> {
  // Nilai dari browser tidak dipercaya: hanya alamat publik di bucket foto
  // milik PRODUK INI yang boleh masuk ke kolom photo_url.
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  const prefix = `${base}/storage/v1/object/public/product-photos/${id}/`;
  if (!photoUrl.startsWith(prefix)) {
    return { error: { message: "Alamat foto tidak dikenali." } };
  }

  const supabase = await createClient();
  const saved = await safeWrite(
    supabase.from("sanci_products").update({ photo_url: photoUrl }).eq("id", id).select("id").single()
  );
  if (!saved.ok) {
    if (saved.reason === "db" && isMissingTable(saved.code)) {
      return { error: { message: CATALOG_MIGRATION_MSG } };
    }
    return { error: { message: PESAN.serverSibuk } };
  }

  revalidatePath("/admin/produk");
  return { data: true };
}

/**
 * Katalog Produk SANCI per partner: toggle admin-only. Tanpa baris di
 * sanci_catalog_access = TERTUTUP (default yang aman secara bisnis —
 * LESSONS #8: kalau nanti kolomnya lupa diisi, kegagalan diam-diam tidak
 * boleh membuka katalog ke partner yang belum disetujui).
 */
export async function setCatalogAccess(partnerId: string, enabled: boolean): Promise<ActionResult<true>> {
  const supabase = await createClient();
  const saved = await safeWrite(
    supabase
      .from("sanci_catalog_access")
      .upsert({ partner_id: partnerId, enabled }, { onConflict: "partner_id" })
      .select("partner_id")
      .single()
  );
  if (!saved.ok) {
    if (saved.reason === "db" && isMissingTable(saved.code)) {
      return { error: { message: CATALOG_MIGRATION_MSG } };
    }
    return { error: { message: "Tidak bisa menyimpan pengaturan katalog sekarang." } };
  }

  revalidatePath(`/admin/partners/${partnerId}`);
  return { data: true };
}
