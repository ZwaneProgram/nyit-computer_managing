// Real inventory data layer — talks to the Fastify/Postgres API.
// Postgres returns bigint/numeric as strings, so we normalise to JS numbers here.
import { http } from '../lib/api';

export type ProductStatus = 'active' | 'draft';
export type SerialStatus = 'draft' | 'in_stock' | 'sold' | 'returned';

export interface Category {
  id: number;
  name: string;
  slug: string;
  sort: number;
  product_count?: number;
}

export interface Serial {
  id: number;
  serial: string;
  sku: string | null;
  status: SerialStatus;
  cost: number;
  price: number;
  warranty_months: number;
  note: string | null;
  image_url: string | null;
  sale_id: number | null;
  created_at: string;
}

export interface Product {
  id: number;
  category_id: number | null;
  category_name: string | null;
  category_slug: string | null;
  name: string;
  brand: string | null;
  model: string | null;
  low: number;
  notes: string | null;
  status: ProductStatus;
  /** Derived: count of in_stock units. */
  stock: number;
  /** Derived: count of draft units. */
  draft_count: number;
  /** Price range of in-stock units (null when none). */
  price_min: number | null;
  price_max: number | null;
  /** Cheapest in-stock unit's cost (null when none) — representative cost. */
  cost_min: number | null;
  /** Sum of in-stock units' cost. */
  stock_cost: number;
  created_at: string;
  updated_at: string;
}

/** One physical unit the form sends. */
export interface UnitInput {
  serial: string;
  sku: string | null;
  cost: number;
  price: number;
  warranty_months: number;
  note: string | null;
  image_url: string | null;
  draft: boolean;
}

/** Catalog fields the create/update form sends. */
export interface ProductInput {
  category_id: number | null;
  name: string;
  brand: string | null;
  model: string | null;
  low: number;
  notes: string | null;
  status: ProductStatus;
  units?: UnitInput[];
}

const n = (v: unknown): number => (v == null ? 0 : Number(v));

function normProduct(r: Record<string, unknown>): Product {
  return {
    id: Number(r.id),
    category_id: r.category_id == null ? null : Number(r.category_id),
    category_name: (r.category_name as string) ?? null,
    category_slug: (r.category_slug as string) ?? null,
    name: r.name as string,
    brand: (r.brand as string) ?? null,
    model: (r.model as string) ?? null,
    low: n(r.low),
    notes: (r.notes as string) ?? null,
    status: (r.status as ProductStatus) ?? 'active',
    stock: n(r.stock),
    draft_count: n(r.draft_count),
    price_min: r.price_min == null ? null : n(r.price_min),
    price_max: r.price_max == null ? null : n(r.price_max),
    cost_min: r.cost_min == null ? null : n(r.cost_min),
    stock_cost: n(r.stock_cost),
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}

function normSerial(r: Record<string, unknown>): Serial {
  return {
    id: Number(r.id),
    serial: r.serial as string,
    sku: (r.sku as string) ?? null,
    status: r.status as SerialStatus,
    cost: n(r.cost),
    price: n(r.price),
    warranty_months: n(r.warranty_months),
    note: (r.note as string) ?? null,
    image_url: (r.image_url as string) ?? null,
    sale_id: r.sale_id == null ? null : Number(r.sale_id),
    created_at: r.created_at as string,
  };
}

// ----- Categories -----
export async function fetchCategories(): Promise<Category[]> {
  const { categories } = await http.get<{ categories: Record<string, unknown>[] }>('/api/categories');
  return categories.map((c) => ({
    id: Number(c.id),
    name: c.name as string,
    slug: c.slug as string,
    sort: n(c.sort),
    product_count: c.product_count == null ? undefined : n(c.product_count),
  }));
}

export async function createCategory(name: string): Promise<void> {
  await http.post('/api/categories', { name });
}
export async function updateCategory(id: number, name: string, sort?: number): Promise<void> {
  await http.put(`/api/categories/${id}`, { name, sort });
}
export async function deleteCategory(id: number): Promise<void> {
  await http.del(`/api/categories/${id}`);
}

// ----- Products -----
// drafts=true → only catalogs that contain at least one draft unit.
export async function fetchProducts(drafts = false): Promise<Product[]> {
  const { products } = await http.get<{ products: Record<string, unknown>[] }>(
    `/api/products${drafts ? '?drafts=1' : ''}`,
  );
  return products.map(normProduct);
}

export async function fetchProduct(id: number): Promise<{ product: Product; serials: Serial[] }> {
  const r = await http.get<{ product: Record<string, unknown>; serials: Record<string, unknown>[] }>(
    `/api/products/${id}`,
  );
  return { product: normProduct(r.product), serials: r.serials.map(normSerial) };
}

export async function createProduct(input: ProductInput): Promise<Product> {
  const { product } = await http.post<{ product: Record<string, unknown> }>('/api/products', input);
  return normProduct(product);
}

export async function updateProduct(id: number, input: ProductInput): Promise<Product> {
  const { product } = await http.put<{ product: Record<string, unknown> }>(`/api/products/${id}`, input);
  return normProduct(product);
}

export async function deleteProduct(id: number): Promise<void> {
  await http.del(`/api/products/${id}`);
}

export async function addUnits(productId: number, units: UnitInput[]): Promise<Serial[]> {
  const r = await http.post<{ serials: Record<string, unknown>[] }>(
    `/api/products/${productId}/serials`,
    { units },
  );
  return r.serials.map(normSerial);
}

export async function updateSerial(serialId: number, input: UnitInput): Promise<Serial> {
  const { serial } = await http.put<{ serial: Record<string, unknown> }>(`/api/serials/${serialId}`, input);
  return normSerial(serial);
}

export async function deleteSerial(serialId: number): Promise<void> {
  await http.del(`/api/serials/${serialId}`);
}

// ----- Image upload (multipart, separate from the JSON http wrapper) -----
export async function uploadImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('/api/upload', { method: 'POST', credentials: 'include', body: fd });
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !data.url) throw new Error(data.error ?? 'อัปโหลดรูปไม่สำเร็จ');
  return data.url;
}
