"use server";

/**
 * Server Actions untuk ISI Package (migrasi 0012) — dikelola SANCI Admin saja.
 *
 * Pola ditiru dari actions-packages.ts / actions-products.ts: safeWrite +
 * client_request_id, dan konflik nomor permintaan diperiksa SEBELUM konflik
 * kode bisnis (LESSONS #21) supaya jaringan lemah tidak menghasilkan baris
 * ganda maupun pesan "kode duplikat" yang menyesatkan.
 *
 * partner_package_items BISA belum ada di database (migrasi 0012 dijalankan
 * terpisah dari kode — LESSONS #12). Setiap error 42P01 diterjemahkan ke pesan
 * degradasi yang sama, bukan dibiarkan bocor sebagai error DB mentah.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  pesan,
  confirmByRequestId,
  isRequestIdConflict,
  safeWrite,
} from "@/lib/safe-write";
import { getMessages } from "@/lib/i18n";

type ActionError = { field?: string; message: string };
type ActionResult<T> = { data: T } | { error: ActionError };

function isMissingTable(code: string | undefined): boolean {
  return code === "42P01";
}

/** Jumlah wajib bilangan bulat positif — cerminan CHECK (quantity > 0) di 0012. */
function isValidQty(q: number): boolean {
  return Number.isInteger(q) && q > 0;
}

export async function addPackageItem(
  packageId: string,
  productId: string,
  quantity: number,
  clientRequestId: string
): Promise<ActionResult<{ id: string }>> {
  const m = await getMessages();
  const PESAN = pesan(m);
  const supabase = await createClient();

  if (!isValidQty(quantity)) {
    return { error: { field: "quantity", message: m.admin.packageItemQtyInvalid } };
  }

  const { data: existing, error: existingErr } = await supabase
    .from("partner_package_items")
    .select("id")
    .eq("client_request_id", clientRequestId)
    .maybeSingle();
  if (existingErr) {
    if (isMissingTable(existingErr.code)) {
      return { error: { message: m.admin.packageItemMigrationMsg } };
    }
    return { error: { message: PESAN.serverSibuk } };
  }
  if (existing) {
    revalidatePath("/admin/partners/[id]/packages/[packageId]", "page");
    return { data: { id: existing.id } };
  }

  const written = await safeWrite(
    supabase
      .from("partner_package_items")
      .insert({
        package_id: packageId,
        product_id: productId,
        quantity,
        client_request_id: clientRequestId,
      })
      .select("id")
      .single()
  );

  const recheck = () =>
    confirmByRequestId(
      supabase
        .from("partner_package_items")
        .select("id")
        .eq("client_request_id", clientRequestId)
        .maybeSingle()
    );

  if (!written.ok) {
    if (written.reason === "db") {
      if (isMissingTable(written.code)) {
        return { error: { message: m.admin.packageItemMigrationMsg } };
      }
      // Bentrok nomor permintaan = percobaan sebelumnya sudah mendarat
      // (LESSONS #21). Diperiksa DULUAN, sebelum unique yang lain.
      if (isRequestIdConflict(written)) {
        const again = await recheck();
        if (again.status === "found") {
          revalidatePath("/admin/partners/[id]/packages/[packageId]", "page");
          return { data: { id: again.data.id } };
        }
        return { error: { message: PESAN.belumPastiBaru } };
      }
      // Tabel ini punya DUA unique constraint, jadi 23505 saja tidak cukup untuk
      // tahu apa yang terjadi (LESSONS #21/#27). Yang tersisa di sini adalah
      // unique (package_id, product_id): produknya SUDAH ada di paket ini.
      // Pesannya harus menunjukkan jalan keluar yang benar — ubah jumlah baris
      // yang sudah ada — bukan "server sibuk", karena mencoba lagi tidak akan
      // pernah berhasil.
      if (written.code === "23505") {
        return { error: { field: "product", message: m.admin.packageItemDuplicate } };
      }
      return { error: { message: PESAN.serverSibuk } };
    }
    const check = await recheck();
    if (check.status === "found") {
      revalidatePath("/admin/partners/[id]/packages/[packageId]", "page");
      return { data: { id: check.data.id } };
    }
    return {
      error: {
        message: check.status === "absent" ? PESAN.belumTersimpan : PESAN.belumPastiBaru,
      },
    };
  }

  revalidatePath("/admin/partners/[id]/packages/[packageId]", "page");
  return { data: { id: written.data.id } };
}

export async function updatePackageItemQuantity(
  itemId: string,
  quantity: number
): Promise<ActionResult<true>> {
  const m = await getMessages();
  const PESAN = pesan(m);
  const supabase = await createClient();

  if (!isValidQty(quantity)) {
    return { error: { field: "quantity", message: m.admin.packageItemQtyInvalid } };
  }

  const saved = await safeWrite(
    supabase
      .from("partner_package_items")
      .update({ quantity })
      .eq("id", itemId)
      .select("package_id")
      .single()
  );

  if (!saved.ok) {
    if (saved.reason === "db") {
      if (isMissingTable(saved.code)) {
        return { error: { message: m.admin.packageItemMigrationMsg } };
      }
      return { error: { message: PESAN.serverSibuk } };
    }
    return { error: { message: PESAN.belumPastiUbah } };
  }

  revalidatePath("/admin/partners/[id]/packages/[packageId]", "page");
  return { data: true };
}

export async function removePackageItem(itemId: string): Promise<ActionResult<true>> {
  const m = await getMessages();
  const PESAN = pesan(m);
  const supabase = await createClient();

  const removed = await safeWrite(
    supabase
      .from("partner_package_items")
      .delete()
      .eq("id", itemId)
      .select("package_id")
      .single()
  );

  if (!removed.ok) {
    if (removed.reason === "db") {
      if (isMissingTable(removed.code)) {
        return { error: { message: m.admin.packageItemMigrationMsg } };
      }
      return { error: { message: PESAN.serverSibuk } };
    }
    return { error: { message: PESAN.belumPastiUbah } };
  }

  revalidatePath("/admin/partners/[id]/packages/[packageId]", "page");
  return { data: true };
}
