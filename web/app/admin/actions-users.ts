"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type ActionError = { message: string };
type ActionResult<T> = { data: T } | { error: ActionError };

export async function toggleUserStatus(userId: string): Promise<ActionResult<true>> {
  const supabase = await createClient();
  const { data: user } = await supabase
    .from("partner_users")
    .select("status, partner_id")
    .eq("id", userId)
    .maybeSingle();
  if (!user) return { error: { message: "Akun tidak ditemukan." } };

  const nextStatus = user.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
  const { error } = await supabase.from("partner_users").update({ status: nextStatus }).eq("id", userId);
  if (error) return { error: { message: "Tidak bisa mengubah status akun sekarang." } };

  revalidatePath(`/admin/partners/${user.partner_id}`);
  return { data: true };
}

// Membuat akun login baru (auth.users) BUTUH Supabase service_role key —
// tidak tersedia di environment ini (sengaja tidak diberikan, lihat LESSONS.md).
// Fungsi ini sengaja TIDAK diimplementasikan; UI menampilkan penjelasan alih-alih
// form yang pura-pura berfungsi (audit-jenzo: jangan berpura-pura selesai).
