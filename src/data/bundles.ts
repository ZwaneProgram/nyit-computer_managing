// Bundle data layer. Price/cost/profit/stock are derived from the live
// component products so a bundle stays correct when product prices change.
import { http } from '../lib/api';

export interface BundleItem {
  product_id: number;
  name: string;
  sku: string | null;
  price: number;
  cost: number;
  image_url: string | null;
  stock: number;
  /** Pinned unit for this component; null = auto (cheapest). */
  serial_id: number | null;
  /** SN of the pinned unit, for display. */
  pinned_serial: string | null;
  /** Whether the pinned unit is still in stock (false → showing the fallback). */
  pinned_ok: boolean;
}

export interface Bundle {
  id: number;
  name: string;
  /** Percent off the list price (0 when a baht discount is used). */
  discount_pct: number;
  /** Flat baht off each set (0 when a percent discount is used). */
  discount_thb: number;
  /** Flat baht assembly fee added to each set (after the discount). */
  assembly_fee: number;
  /** true = parts arranged by hand; false = kept in the ตั้งค่าระบบ order. */
  custom_order: boolean;
  /** 0 = shop warranty (30 days), >0 = months. Overridden by warranty_text when set. */
  warranty_months: number;
  /** Free-text warranty (e.g. "15 วัน"); null = use warranty_months. */
  warranty_text: string | null;
  /** The bundle's own ordered image gallery (independent of component photos). */
  images: string[];
  /** The bundle's chosen cover (one of `images`); null → fall back to components. */
  image_url: string | null;
  sold: number;
  items: BundleItem[];
  /** Sum of component list prices. */
  list_price: number;
  /** Sum of component costs. */
  total_cost: number;
  /** Discounted bundle price. */
  price: number;
  profit: number;
  /** Sellable sets = the limiting component's stock. */
  stock: number;
}

const num = (v: unknown): number => (v == null ? 0 : Number(v));

/**
 * One bundle's selling price: list price minus percent, then minus baht (never
 * below zero), then plus the assembly fee. Mirrors server/src/lib/bundlePrice.ts.
 */
export const bundlePrice = (listPrice: number, discountPct: number, discountThb: number, assemblyFee = 0): number =>
  Math.max(0, Math.round(listPrice * (1 - discountPct / 100)) - discountThb) + assemblyFee;

/** A bundle's saved options: pricing extras (only one discount non-zero) + part-order mode. */
export interface BundleOptions {
  discount_pct: number;
  discount_thb: number;
  assembly_fee: number;
  /** true = parts arranged by hand; false = follow the order in ตั้งค่าระบบ. */
  custom_order: boolean;
}

function normItem(r: Record<string, unknown>): BundleItem {
  return {
    product_id: Number(r.product_id),
    name: r.name as string,
    sku: (r.sku as string) ?? null,
    price: num(r.price),
    cost: num(r.cost),
    image_url: (r.image_url as string) ?? null,
    stock: num(r.stock),
    serial_id: r.serial_id == null ? null : Number(r.serial_id),
    pinned_serial: (r.pinned_serial as string) ?? null,
    pinned_ok: r.pinned_ok === true,
  };
}

function normBundle(r: Record<string, unknown>): Bundle {
  const items = ((r.items as Record<string, unknown>[]) ?? []).map(normItem);
  const list_price = items.reduce((s, i) => s + i.price, 0);
  const total_cost = items.reduce((s, i) => s + i.cost, 0);
  const discount_pct = num(r.discount_pct);
  const discount_thb = num(r.discount_thb);
  const assembly_fee = num(r.assembly_fee);
  const price = bundlePrice(list_price, discount_pct, discount_thb, assembly_fee);
  return {
    id: Number(r.id),
    name: r.name as string,
    discount_pct,
    discount_thb,
    assembly_fee,
    custom_order: r.custom_order === true,
    warranty_months: num(r.warranty_months),
    warranty_text: (r.warranty_text as string) ?? null,
    images: Array.isArray(r.images) ? (r.images as string[]) : [],
    image_url: (r.image_url as string) ?? null,
    sold: num(r.sold),
    items,
    list_price,
    total_cost,
    price,
    profit: price - total_cost,
    stock: items.length ? Math.min(...items.map((i) => i.stock)) : 0,
  };
}

export async function fetchBundles(): Promise<Bundle[]> {
  const { bundles } = await http.get<{ bundles: Record<string, unknown>[] }>('/api/bundles');
  return bundles.map(normBundle);
}

export interface BundleImages {
  images: string[];
  image_url: string | null;
}

/** One component to save: a product with an optional pinned unit (null = auto). */
export interface BundleComponent { product_id: number; serial_id: number | null; }

export async function createBundle(name: string, discount: BundleOptions, warranty_months: number, warranty_text: string | null, items: BundleComponent[], gallery: BundleImages): Promise<void> {
  await http.post('/api/bundles', { name, ...discount, warranty_months, warranty_text, items, ...gallery });
}

export async function updateBundle(id: number, name: string, discount: BundleOptions, warranty_months: number, warranty_text: string | null, items: BundleComponent[], gallery: BundleImages): Promise<void> {
  await http.put(`/api/bundles/${id}`, { name, ...discount, warranty_months, warranty_text, items, ...gallery });
}

export async function deleteBundle(id: number): Promise<void> {
  await http.del(`/api/bundles/${id}`);
}
