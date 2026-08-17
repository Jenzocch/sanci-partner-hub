"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CODE_RE } from "@/lib/validation";
import {
  PESAN,
  confirmByRequestId,
  isRequestIdConflict,
  safeWrite,
} from "@/lib/safe-write";

type ActionError = { field?: string; message: string };
type ActionResult<T> =
  | { data: T }
  | { error: ActionError }
  | { duplicate: { id: string; name: string } };

export async function createPartner(input: {
  name: string;
  code: string;
  contactName?: string;
  contactPhone?: string;
  clientRequestId: string;
  confirmDuplicate?: boolean;
}): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const name = input.name.trim();
  const code = input.code.trim().toUpperCase();

  if (!name) return { error: { field: "name", message: "Nama partner wajib diisi." } };
  if (!CODE_RE.test(code)) {
    return { error: { field: "code", message: "2–8 karakter, hanya A–Z, 0–9, dan tanda hubung." } };
  }

  // Idempotency (SPEC §61/§73): request yang sama (retry jaringan lemah) tidak boleh membuat baris kedua.
  const { data: existing } = await supabase
    .from("partners")
    .select("id")
    .eq("client_request_id", input.clientRequestId)
    .maybeSingle();
  if (existing) {
    revalidatePath("/admin");
    return { data: { id: existing.id } };
  }

  if (!input.confirmDuplicate) {
    const { data: dup } = await supabase
      .from("partners")
      .select("id, name")
      .ilike("name", name)
      .maybeSingle();
    if (dup) return { duplicate: { id: dup.id, name: dup.name } };
  }

  const written = await safeWrite(
    supabase
      .from("partners")
      .insert({
        name,
        code,
        contact_name: input.contactName?.trim() || null,
        contact_phone: input.contactPhone?.trim() || null,
        client_request_id: input.clientRequestId,
      })
      .select("id")
      .single()
  );

  if (!written.ok) {
    if (written.reason === "db") {
      // Bentrok pada nomor permintaan = percobaan sebelumnya SUDAH masuk.
      if (isRequestIdConflict(written)) {
        const again = await confirmByRequestId(
          supabase
            .from("partners")
            .select("id")
            .eq("client_request_id", input.clientRequestId)
            .maybeSingle()
        );
        if (again.status === "found") {
          revalidatePath("/admin");
          return { data: { id: again.data.id } };
        }
        return { error: { message: PESAN.belumPastiBaru } };
      }
      // Jangan bocorkan error DB mentah ke pengguna (SPEC §69).
      if (written.code === "23505") {
        return { error: { field: "code", message: `Kode partner ${code} sudah dipakai.` } };
      }
      return { error: { message: PESAN.serverSibuk } };
    }
    // Jawaban tidak sampai: tanyakan status sebenarnya, jangan INSERT lagi (SPEC §61).
    const check = await confirmByRequestId(
      supabase
        .from("partners")
        .select("id")
        .eq("client_request_id", input.clientRequestId)
        .maybeSingle()
    );
    if (check.status === "found") {
      revalidatePath("/admin");
      return { data: { id: check.data.id } };
    }
    return {
      error: {
        message: check.status === "absent" ? PESAN.belumTersimpan : PESAN.belumPastiBaru,
      },
    };
  }

  revalidatePath("/admin");
  return { data: { id: written.data.id } };
}

export async function updatePartner(
  id: string,
  input: { name: string; code?: string; contactName?: string; contactPhone?: string }
): Promise<ActionResult<true>> {
  const supabase = await createClient();
  const { data: partner } = await supabase
    .from("partners")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (!partner) return { error: { message: "Partner tidak ditemukan." } };

  const name = input.name.trim();
  if (!name) return { error: { field: "name", message: "Nama partner wajib diisi." } };

  const update: Record<string, unknown> = {
    name,
    contact_name: input.contactName?.trim() || null,
    contact_phone: input.contactPhone?.trim() || null,
  };

  const locked = partner.status !== "DRAFT";
  let code: string | undefined;
  if (!locked && input.code) {
    code = input.code.trim().toUpperCase();
    if (!CODE_RE.test(code)) {
      return { error: { field: "code", message: "2–8 karakter, hanya A–Z, 0–9, dan tanda hubung." } };
    }
    update.code = code;
  }

  const saved = await safeWrite(
    supabase.from("partners").update(update).eq("id", id).select("id").single()
  );
  if (!saved.ok) {
    if (saved.reason === "unconfirmed") {
      return { error: { message: PESAN.belumPastiUbah } };
    }
    if (saved.code === "23505") {
      return { error: { field: "code", message: `Kode partner ${code} sudah dipakai.` } };
    }
    return { error: { message: PESAN.serverSibuk } };
  }

  revalidatePath("/admin");
  revalidatePath(`/admin/partners/${id}`);
  return { data: true };
}

/**
 * Menyimpan alamat logo yang baru diunggah (SPEC §41).
 *
 * Dipanggil SESUDAH berkas berhasil masuk ke storage dari browser. Kegagalan di
 * sini tidak boleh menggagalkan penyimpanan data partner — pemanggil hanya
 * menampilkan peringatan, bukan error penyimpanan.
 */
export async function setPartnerLogo(
  id: string,
  logoUrl: string
): Promise<ActionResult<true>> {
  // Nilai dari browser tidak dipercaya (LESSONS #6): hanya alamat publik di
  // bucket logo milik partner ini yang boleh masuk ke kolom logo_url.
  // Garis miring di akhir alamat proyek dibuang dulu — kalau tidak, pencocokan
  // di bawah gagal diam-diam dan logo tidak pernah tersimpan.
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  const prefix = `${base}/storage/v1/object/public/partner-logos/${id}/`;
  if (!logoUrl.startsWith(prefix)) {
    return { error: { message: "Alamat logo tidak dikenali." } };
  }

  const supabase = await createClient();
  const saved = await safeWrite(
    supabase.from("partners").update({ logo_url: logoUrl }).eq("id", id).select("id").single()
  );
  if (!saved.ok) {
    return { error: { message: PESAN.serverSibuk } };
  }

  revalidatePath("/admin");
  revalidatePath(`/admin/partners/${id}`);
  return { data: true };
}

export async function setPartnerStatus(
  id: string,
  status: "ACTIVE" | "SUSPENDED" | "INACTIVE"
): Promise<ActionResult<true>> {
  const supabase = await createClient();

  if (status === "ACTIVE") {
    // Aktivasi harus diverifikasi ulang di server — checklist di client hanya UX (SPEC §12).
    const [{ count: branchCount }, { count: userCount }, { data: policy }] = await Promise.all([
      supabase
        .from("partner_branches")
        .select("id", { count: "exact", head: true })
        .eq("partner_id", id)
        .eq("status", "ACTIVE"),
      supabase
        .from("partner_users")
        .select("id", { count: "exact", head: true })
        .eq("partner_id", id)
        .eq("status", "ACTIVE"),
      supabase.from("partner_access_policies").select("configured").eq("partner_id", id).maybeSingle(),
    ]);
    if (!branchCount || !userCount || !policy?.configured) {
      return { error: { message: "Syarat aktivasi belum lengkap." } };
    }
  }

  const { data: updated, error } = await supabase
    .from("partners")
    .update({ status })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  // RLS bisa menyaring update ini jadi 0 baris tanpa error — jangan anggap berhasil
  // kalau tidak ada baris yang benar-benar berubah (LESSONS #7).
  if (error || !updated) return { error: { message: "Tidak bisa mengubah status sekarang." } };

  revalidatePath("/admin");
  revalidatePath(`/admin/partners/${id}`);
  return { data: true };
}

export async function deleteDraftPartner(id: string, typedCode: string) {
  const supabase = await createClient();
  const { data: partner } = await supabase
    .from("partners")
    .select("code, status")
    .eq("id", id)
    .maybeSingle();
  if (!partner) return { error: { message: "Partner tidak ditemukan." } };
  if (partner.status !== "DRAFT") {
    return { error: { message: "Hanya partner berstatus DRAF yang bisa dihapus permanen." } };
  }
  if (typedCode.trim().toUpperCase() !== partner.code) {
    return { error: { message: `Ketik ${partner.code} persis untuk konfirmasi.` } };
  }

  const { data: deleted, error } = await supabase.from("partners").delete().eq("id", id).select("id");
  if (error) {
    // FK RESTRICT dari branch/staff/user lain — master data terpakai tidak boleh hilang diam-diam.
    return { error: { message: "Partner ini sudah punya data terkait — tidak bisa dihapus permanen." } };
  }
  // RLS bisa menyaring delete ini jadi 0 baris tanpa error — jangan redirect seolah
  // berhasil kalau tidak ada baris yang benar-benar terhapus (LESSONS #7).
  if (!deleted || deleted.length === 0) {
    return { error: { message: "Tidak bisa menghapus partner sekarang." } };
  }

  revalidatePath("/admin");
  redirect("/admin");
}
