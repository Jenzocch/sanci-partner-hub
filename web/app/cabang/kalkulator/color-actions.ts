"use server";

/**
 * Cabang calculator color resolver.
 *
 * Owner rule 2026-09-02: Bed / Bedside products must support color selection.
 * Legacy/imported products can still carry `has_color_options=false` from the
 * safe migration default. The normal product-master flag remains canonical
 * for every other product; this bridge only covers the Bed family.
 *
 * Security stays under the current partner session and RLS. No admin/service
 * role client is introduced here.
 */

import { createClient } from "@/lib/supabase/server";
import {
  listActiveColorsCabang,
  type ColorRow,
  type ListActiveColorsOutcome,
} from "@/app/cabang/pesanan/actions";

function isBedFamily(name: string | null, category: string | null): boolean {
  return /\bbed(?:side)?\b/i.test(`${category ?? ""} ${name ?? ""}`);
}

export async function listActiveColorsForCabangCalculator(
  productId: string
): Promise<ListActiveColorsOutcome> {
  const canonical = await listActiveColorsCabang(productId);
  if (canonical.status !== "ok" || canonical.hasColorOptions) return canonical;

  const supabase = await createClient();
  const { data: product, error: productError } = await supabase
    .from("sanci_products")
    .select("name, category")
    .eq("id", productId)
    .maybeSingle();

  if (productError || !product || !isBedFamily(product.name, product.category)) {
    return canonical;
  }

  const { data: colors, error: colorsError } = await supabase
    .from("product_colors")
    .select("id, code, name, photo_url, status, sort_order")
    .eq("status", "ACTIVE")
    .order("sort_order")
    .order("code");

  if (colorsError) return { status: "error" };

  return {
    status: "ok",
    hasColorOptions: true,
    colors: (colors ?? []) as ColorRow[],
  };
}
