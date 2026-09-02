"use server";

/**
 * Admin calculator color resolver.
 *
 * Owner rule 2026-09-02: Bed / Bedside products must support color selection.
 * Legacy/imported products can still have `has_color_options=false` because
 * migration 0025 deliberately defaulted that column to false. Do not make
 * every catalog item color-capable; only bridge that legacy default for the
 * Bed family here. Explicit `has_color_options=true` continues to use the
 * canonical listActiveColors() path unchanged.
 */

import { createClient } from "@/lib/supabase/server";
import {
  listActiveColors,
  type ColorRow,
  type ListActiveColorsOutcome,
} from "@/app/admin/actions-colors";

function isBedFamily(name: string | null, category: string | null): boolean {
  return /\bbed(?:side)?\b/i.test(`${category ?? ""} ${name ?? ""}`);
}

export async function listActiveColorsForAdminCalculator(
  productId: string
): Promise<ListActiveColorsOutcome> {
  const canonical = await listActiveColors(productId);

  // Existing product-master decision remains authoritative when enabled, and
  // migration/query failures keep their original semantics.
  if (canonical.status !== "ok" || canonical.hasColorOptions) return canonical;

  const supabase = await createClient();
  const { data: product, error: productError } = await supabase
    .from("sanci_products")
    .select("name, category")
    .eq("id", productId)
    .maybeSingle();

  // This fallback must never turn a read problem into a fake color-enabled
  // result. Preserve the canonical no-color result when identity cannot be
  // confirmed.
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
