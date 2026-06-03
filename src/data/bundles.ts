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

export async function createBundle(name: string, discount_pct: number, product_ids: number[]): Promise<void> {
  await http.post('/api/bundles', { name, discount_pct, product_ids });
}

export async function updateBundle(id: number, name: string, discount_pct: number, product_ids: number[]): Promise<void> {
  await http.put(`/api/bundles/${id}`, { name, discount_pct, product_ids });
}

export async function deleteBundle(id: number): Promise<void> {
  await http.del(`/api/bundles/${id}`);
}
