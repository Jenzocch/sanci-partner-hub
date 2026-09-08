"use server";

import { createClient } from "@/lib/supabase/server";
import { getAdminMessages } from "@/lib/i18n";
import { pesan, catatGagal } from "@/lib/safe-write";
import { fetchItemCoverage, type DocType } from "@/lib/documents-shared";

type ActionError = { message: string };
type ActionResult<T> = { data: T } | { error: ActionError };

function isMissingSchema(code: string | undefined): boolean {
  // undefined_table / undefined_column — hanya dua ini yang boleh diterjemahkan
  // sebagai modul dokumen belum dimigrasikan. Timeout, RLS, network/backend
  // failure tidak boleh disamakan dengan migration (LESSONS #10).
  return code === "42P01" || code === "42703";
}

export async function getOrderDocumentItemCoverageSafe(
  orderId: string,
  docType: DocType,
  excludeDocumentId?: string
): Promise<
  ActionResult<{ items: { id: string; name: string; code: string | null; ordered: number; covered: number }[] }>
> {
  const m = await getAdminMessages();
  const PESAN = pesan(m);
  const supabase = await createClient();
  const coverage = await fetchItemCoverage(supabase, orderId, docType, excludeDocumentId);

  if ("error" in coverage) {
    if (isMissingSchema(coverage.code)) {
      return { error: { message: m.admin.docFeatureOff } };
    }
    return {
      error: {
        message: PESAN.serverSibukKode(
          catatGagal("getOrderDocumentItemCoverage", {
            hasil: { code: coverage.code, detail: coverage.detail },
          })
        ),
      },
    };
  }

  return {
    data: {
      items: coverage.orderItems.map((it) => ({
        id: it.id,
        name: it.name_snapshot,
        code: it.code_snapshot,
        ordered: it.quantity,
        covered: coverage.covered[it.id] ?? 0,
      })),
    },
  };
}
