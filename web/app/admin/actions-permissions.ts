"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type ActionError = { message: string };
type ActionResult<T> = { data: T } | { error: ActionError };

const VIS = ["OWN_BRANCH", "PARTNER_ALL_BRANCHES"] as const;
const EDIT = ["OWN_BRANCH", "PARTNER_ALL_BRANCHES"] as const;

export async function updatePolicy(
  partnerId: string,
  input: { visibilityScope: string; editScope: string }
): Promise<ActionResult<true>> {
  const supabase = await createClient();

  if (!VIS.includes(input.visibilityScope as (typeof VIS)[number])) {
    return { error: { message: "Visibilitas tidak valid." } };
  }
  if (!EDIT.includes(input.editScope as (typeof EDIT)[number])) {
    return { error: { message: "Cakupan edit tidak valid." } };
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
  if (error) return { error: { message: "Tidak bisa menyimpan hak akses sekarang." } };

  revalidatePath(`/admin/partners/${partnerId}`);
  return { data: true };
}
