"use server";

/**
 * Menulis baris Isi Pesanan / Kalkulator ke order_items.
 *
 * PENTING: idempotency adalah PER BARIS (`lineId`), bukan per product/warna.
 * Satu produk boleh punya 5 baris dengan Qty/warna/harga masing-masing dan
 * kelimanya harus tetap menjadi 5 order_items. Legacy caller tanpa lineId
 * tetap memakai key lama agar retry yang sudah berjalan sebelum deploy tidak
 * membuat duplikat lintas versi.
 */

import { createClient } from "@/lib/supabase/server";
import { safeWrite } from "@/lib/safe-write";

const MAX_ITEM_QTY = 999_999;
const MAX_ITEM_UNIT_PRICE = 9_999_999_999_999;

export type CopyPickedItemsOutcome = {
  total: number;
  created: number;
  priceGuardDegraded: boolean;
};

export type PickedItemWriteLine = {
  lineId?: string;
  productId: string;
  unitPrice: number;
  qty: number;
  colorCode?: string | null;
};

function requestIdForLine(
  orderClientRequestId: string,
  line: PickedItemWriteLine,
  colorCode: string | null
): string {
  const lineId = line.lineId?.trim();
  if (lineId) return `${orderClientRequestId}:calc-line:${lineId}`;
  // Backward compatibility for hand-offs/forms created before lineId existed.
  return colorCode
    ? `${orderClientRequestId}:calc-item:${line.productId}:${colorCode}`
    : `${orderClientRequestId}:calc-item:${line.productId}`;
}

export async function copyPickedItemsToOrder(
  orderId: string,
  orderClientRequestId: string,
  lines: PickedItemWriteLine[]
): Promise<CopyPickedItemsOutcome> {
  const supabase = await createClient();
  if (lines.length === 0) return { total: 0, created: 0, priceGuardDegraded: false };

  type ProductLite = { id: string; name: string; code: string | null };
  const productIds = Array.from(new Set(lines.map((l) => l.productId)));
  const { data: products, error } = await supabase
    .from("sanci_products")
    .select("id, name, code")
    .in("id", productIds);
  if (error) return { total: lines.length, created: 0, priceGuardDegraded: false };

  const byId = new Map(((products as ProductLite[] | null) ?? []).map((p) => [p.id, p]));
  const withoutPriceRows: Record<string, unknown>[] = [];
  const withPriceRows: Record<string, unknown>[] = [];
  const withPriceBaseRows: Record<string, unknown>[] = [];

  for (const line of lines) {
    const product = byId.get(line.productId);
    if (!product) continue;

    const qty = Math.max(1, Math.min(MAX_ITEM_QTY, Math.round(line.qty) || 1));
    const colorCode = line.colorCode ?? null;
    const basePayload: Record<string, unknown> = {
      order_id: orderId,
      product_id: line.productId,
      name_snapshot: product.name,
      code_snapshot: product.code,
      quantity: qty,
      color_code: colorCode,
      client_request_id: requestIdForLine(orderClientRequestId, line, colorCode),
    };

    const includesPrice =
      Number.isFinite(line.unitPrice) && line.unitPrice > 0 && line.unitPrice <= MAX_ITEM_UNIT_PRICE;
    if (includesPrice) {
      withPriceRows.push({ ...basePayload, unit_price: line.unitPrice });
      withPriceBaseRows.push(basePayload);
    } else {
      withoutPriceRows.push(basePayload);
    }
  }

  if (withoutPriceRows.length === 0 && withPriceRows.length === 0) {
    return { total: lines.length, created: 0, priceGuardDegraded: false };
  }

  let created = 0;
  let priceGuardDegraded = false;

  if (withoutPriceRows.length > 0) {
    const written = await safeWrite(
      supabase
        .from("order_items")
        .upsert(withoutPriceRows, { onConflict: "client_request_id", ignoreDuplicates: true })
        .select("id")
    );
    if (written.ok) created += written.data.length;
  }

  if (withPriceRows.length > 0) {
    let written = await safeWrite(
      supabase
        .from("order_items")
        .upsert(withPriceRows, { onConflict: "client_request_id", ignoreDuplicates: true })
        .select("id")
    );
    if (!written.ok && written.reason === "db" && written.detail.includes("Kolom harga per baris")) {
      priceGuardDegraded = true;
      written = await safeWrite(
        supabase
          .from("order_items")
          .upsert(withPriceBaseRows, { onConflict: "client_request_id", ignoreDuplicates: true })
          .select("id")
      );
    }
    if (written.ok) created += written.data.length;
  }

  return { total: lines.length, created, priceGuardDegraded };
}
