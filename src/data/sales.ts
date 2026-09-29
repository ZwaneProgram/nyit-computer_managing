// Sales data layer — checkout + history.
import { http } from '../lib/api';

export interface Sale {
  id: number;
  kind: 'item' | 'bundle';
  customer_name: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  tax_id: string | null;
  shipping: number;
  discount: number;
  subtotal: number;
  total: number;
  profit: number;
  staff_name: string | null;
  staff_username: string | null;
  status: string;
  created_at: string;
  label: string;
  line_count: number;
}

export interface NewSale {
  kind: 'item' | 'bundle';
  items?: { serial_id: number }[];
  bundle_id?: number;
  bundle_qty?: number;
  /** Explicit units chosen at checkout (one per component; qty = 1 only). */
  serials?: number[];
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  tax_id?: string | null;
  shipping: number;
  discount: number;
}

const num = (v: unknown): number => (v == null ? 0 : Number(v));

function normSale(r: Record<string, unknown>): Sale {
  return {
    id: Number(r.id),
    kind: (r.kind as 'item' | 'bundle') ?? 'item',
    customer_name: (r.customer_name as string) ?? null,
    customer_phone: (r.customer_phone as string) ?? null,
    customer_address: (r.customer_address as string) ?? null,
    tax_id: (r.tax_id as string) ?? null,
    shipping: num(r.shipping),
    discount: num(r.discount),
    subtotal: num(r.subtotal),
    total: num(r.total),
    profit: num(r.profit),
    staff_name: (r.staff_name as string) ?? null,
    staff_username: (r.staff_username as string) ?? null,
    status: (r.status as string) ?? 'paid',
    created_at: r.created_at as string,
    label: (r.label as string) ?? '—',
    line_count: num(r.line_count),
  };
}

export interface SalesQuery {
  from?: string;
  to?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export async function fetchSales(params: SalesQuery = {}): Promise<{ sales: Sale[]; total: number }> {
  const sp = new URLSearchParams();
  if (params.from) sp.set('from', params.from);
  if (params.to) sp.set('to', params.to);
  if (params.q) sp.set('q', params.q);
  if (params.limit != null) sp.set('limit', String(params.limit));
  if (params.offset != null) sp.set('offset', String(params.offset));
  const qs = sp.toString();
  const { sales, total } = await http.get<{ sales: Record<string, unknown>[]; total: number }>(
    `/api/sales${qs ? `?${qs}` : ''}`,
  );
  return { sales: sales.map(normSale), total: num(total) };
}

export async function createSale(payload: NewSale): Promise<Sale> {
  const { sale } = await http.post<{ sale: Record<string, unknown> }>('/api/sales', payload);
  return normSale(sale);
}

export interface SaleLine {
  id: number;
  name: string;
  qty: number;
  unit_price: number;
  unit_cost: number;
}

export interface SaleDetail extends Sale {
  revision: string;
  items: SaleLine[];
  units: { id: number; name: string; serial: string; sku: string | null }[];
}

export interface SaleUpdate {
  revision: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  tax_id: string | null;
  shipping: number;
  discount: number;
  items: { id: number; unit_price: number }[];
}

export async function fetchSale(id: number): Promise<SaleDetail> {
  const { sale } = await http.get<{ sale: Record<string, unknown> }>(`/api/sales/${id}`);
  return {
    ...normSale(sale),
    revision: String(sale.revision),
    items: (sale.items as SaleLine[]).map((line) => ({
      ...line, id: Number(line.id), qty: num(line.qty), unit_price: num(line.unit_price), unit_cost: num(line.unit_cost),
    })),
    units: (sale.units as SaleDetail['units']).map((unit) => ({ ...unit, id: Number(unit.id) })),
  };
}

export async function updateSale(id: number, payload: SaleUpdate): Promise<void> {
  await http.put(`/api/sales/${id}`, payload);
}

export async function deleteSale(id: number, revision: string): Promise<void> {
  await http.del(`/api/sales/${id}?revision=${encodeURIComponent(revision)}`);
}
