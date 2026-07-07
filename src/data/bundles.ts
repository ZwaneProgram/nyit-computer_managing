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
}

export interface Bundle {
  id: number;
  name: string;
  discount_pct: number;
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

function normItem(r: Record<string, unknown>): BundleItem {
  return {
    product_id: Number(r.product_id),
    name: r.name as string,
    sku: (r.sku as string) ?? null,
    price: num(r.price),
    cost: num(r.cost),
    image_url: (r.image_url as string) ?? null,
    stock: num(r.stock),
  };
}

function normBundle(r: Record<string, unknown>): Bundle {
  const items = ((r.items as Record<string, unknown>[]) ?? []).map(normItem);
  const list_price = items.reduce((s, i) => s + i.price, 0);
  const total_cost = items.reduce((s, i) => s + i.cost, 0);
  const discount_pct = num(r.discount_pct);
  const price = Math.round(list_price * (1 - discount_pct / 100));
  return {
    id: Number(r.id),
    name: r.name as string,
    discount_pct,
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

export async function createBundle(name: string, discount_pct: number, warranty_months: number, warranty_text: string | null, product_ids: number[], gallery: BundleImages): Promise<void> {
  await http.post('/api/bundles', { name, discount_pct, warranty_months, warranty_text, product_ids, ...gallery });
}

export async function updateBundle(id: number, name: string, discount_pct: number, warranty_months: number, warranty_text: string | null, product_ids: number[], gallery: BundleImages): Promise<void> {
  await http.put(`/api/bundles/${id}`, { name, discount_pct, warranty_months, warranty_text, product_ids, ...gallery });
}

export async function deleteBundle(id: number): Promise<void> {
  await http.del(`/api/bundles/${id}`);
}
