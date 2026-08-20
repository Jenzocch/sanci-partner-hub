"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getMessages } from "@/lib/i18n";

type ActionError = { message: string };
type ActionResult<T> = { data: T } | { error: ActionError };

const VIS = ["OWN_BRANCH", "PARTNER_ALL_BRANCHES"] as const;
const EDIT = ["OWN_BRANCH", "PARTNER_ALL_BRANCHES"] as const;

export async function updatePolicy(
  partnerId: string,
  input: { visibilityScope: string; editScope: string }
): Promise<ActionResult<true>> {
  const m = await getMessages();
  const supabase = await createClient();

  if (!VIS.includes(input.visibilityScope as (typeof VIS)[number])) {
    return { error: { message: m.admin.visibilityScopeInvalid } };
  }
  if (!EDIT.includes(input.editScope as (typeof EDIT)[number])) {
    return { error: { message: m.admin.editScopeInvalid } };
  }

  const { error } = await supabase.from("partner_access_policies").upsert(
    {
      partner_id: partnerId,
      visibility_scope: input.visibilityScope,
      edit_scope: input.editScope,
      configured: true,
    },
    { onConflict: "partner_id" }
  );
  if (error) return { error: { message: m.admin.permSaveFailed } };

  revalidatePath(`/admin/partners/${partnerId}`);
  return { data: true };
}

/**
 * Izin Penawaran SANCI per partner (migrasi 0014) — `can_view_offer` /
 * `can_edit_offer` di `partner_access_policies`. Berbeda dari `updatePolicy`
 * di atas (yang mengganti DUA kolom scope sekaligus): dua kolom ini
 * TERPISAH dari visibility_scope/edit_scope, jadi ditulis lewat upsert
 * TERSENDIRI supaya menyimpan izin penawaran tidak pernah diam-diam
 * menimpa (atau bergantung pada) pengaturan Visibilitas/Akses cabang.
 *
 * `42703` (kolom belum ada) diterjemahkan ke pesan "migrasi belum jalan" —
 * kode boleh naik lebih dulu daripada 0014 dijalankan (LESSONS #12).
 */
export async function updateOfferPermissions(
  partnerId: string,
  input: { canViewOffer: boolean; canEditOffer: boolean }
): Promise<ActionResult<true>> {
  const m = await getMessages();
  const supabase = await createClient();

  const { error } = await supabase.from("partner_access_policies").upsert(
    {
      partner_id: partnerId,
      can_view_offer: input.canViewOffer,
      can_edit_offer: input.canEditOffer,
      configured: true,
    },
    { onConflict: "partner_id" }
  );
  if (error) {
    if (error.code === "42703") return { error: { message: m.admin.orderOfferFeatureOffAction } };
    return { error: { message: m.admin.offerPermSaveFailed } };
  }

  revalidatePath(`/admin/partners/${partnerId}`);
  return { data: true };
}
