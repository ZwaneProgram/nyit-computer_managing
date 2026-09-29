/**
 * One bundle's selling price: component list price minus a percent discount,
 * then minus a flat baht discount (never below zero), then plus the assembly
 * fee. The form sets only one of the two discounts; the other is 0. Mirrors
 * src/data/bundles.ts `bundlePrice` and the storefront's SQL in
 * nyitfront/lib/products.ts.
 */
export function bundlePrice(listPrice: number, discountPct: number, discountThb: number, assemblyFee = 0): number {
  const parts = Math.max(0, Math.round(listPrice * (1 - (Number(discountPct) || 0) / 100)) - (Number(discountThb) || 0));
  return parts + (Number(assemblyFee) || 0);
}

/** Percent discount clamped to 0–100. */
export const cleanPct = (v: unknown): number => Math.min(100, Math.max(0, Number(v) || 0));

/** Baht discount clamped to >= 0. */
export const cleanThb = (v: unknown): number => Math.max(0, Number(v) || 0);
