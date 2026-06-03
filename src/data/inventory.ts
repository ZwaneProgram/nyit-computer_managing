// Real inventory data layer — talks to the Fastify/Postgres API.
// Postgres returns bigint/numeric as strings, so we normalise to JS numbers here.
import { http } from '../lib/api';

export type ProductStatus = 'active' | 'draft';
export type SerialStatus = 'in_stock' | 'sold' | 'returned';

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
  status: SerialStatus;
  sale_id: number | null;
  created_at: string;
}

export interface Product {
  id: number;
  category_id: number | null;
  category_name: string | null;
  category_slug: string | null;
  name: string;
  sku: string | null;
  brand: string | null;
  model: string | null;
  cost: number;
  price: number;
  low: number;
  warranty_months: number;
  image_url: string | null;
  notes: string | null;
  status: ProductStatus;
  /** Derived: count of in_stock serial units. */
  stock: number;
  created_at: string;
  updated_at: string;
}

/** Fields the create/update form sends. */
export interface ProductInput {
  category_id: number | null;
  name: string;
  sku: string | null;
  brand: string | null;
  model: string | null;
  cost: number;
  price: number;
  low: number;
  warranty_months: number;
  image_url: string | null;
  notes: string | null;
  status: ProductStatus;
  serials?: string[];
}

const n = (v: unknown): number => (v == null ? 0 : Number(v));

function normProduct(r: Record<string, unknown>): Product {
  return {
    id: Number(r.id),
    category_id: r.category_id == null ? null : Number(r.category_id),
    category_name: (r.category_name as string) ?? null,
    category_slug: (r.category_slug as string) ?? null,
    name: r.name as string,
    sku: (r.sku as string) ?? null,
    brand: (r.brand as string) ?? null,
    model: (r.model as string) ?? null,
    cost: n(r.cost),
    price: n(r.price),
    low: n(r.low),
    warranty_months: n(r.warranty_months),
    image_url: (r.image_url as string) ?? null,
    notes: (r.notes as string) ?? null,
    status: (r.status as ProductStatus) ?? 'active',
    stock: n(r.stock),
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}

function normSerial(r: Record<string, unknown>): Serial {
  return {
    id: Number(r.id),
    serial: r.serial as string,
    status: r.status as SerialStatus,
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
export async function fetchProducts(status: ProductStatus | 'all' = 'active'): Promise<Product[]> {
  const { products } = await http.get<{ products: Record<string, unknown>[] }>(
    `/api/products?status=${status}`,
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

export async function addSerials(productId: number, serials: string[]): Promise<Serial[]> {
  const r = await http.post<{ serials: Record<string, unknown>[] }>(
    `/api/products/${productId}/serials`,
    { serials },
  );
  return r.serials.map(normSerial);
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
