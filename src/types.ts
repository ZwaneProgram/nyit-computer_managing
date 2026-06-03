// Shared domain types for the Nyit Computer stock & sales system.

export type CategoryId =
  | 'all'
  | 'gpu'
  | 'cpu'
  | 'mb'
  | 'ram'
  | 'ssd'
  | 'psu'
  | 'monitor'
  | 'peripheral';

export interface Category {
  id: CategoryId;
  name: string;
}

export interface Product {
  id: string;
  cat: Exclude<CategoryId, 'all'>;
  name: string;
  sku: string;
  serial: string;
  cost: number;
  price: number;
  stock: number;
  /** Reorder point — stock at or below this is "low". */
  low: number;
  brand: string;
  /** Warranty length in months. */
  warranty: number;
}

export interface Bundle {
  id: string;
  name: string;
  /** Product ids included in the bundle. */
  items: string[];
  cost: number;
  price: number;
  sold: number;
  image: string;
}

export type TxnStatus = 'paid' | 'pending' | 'refunded';

export interface Txn {
  id: string;
  ts: string;
  type: 'item' | 'bundle';
  label: string;
  customer: string;
  staff: string;
  amount: number;
  profit: number;
  status: TxnStatus;
}

/** Top-level navigable views. */
export type ViewId =
  | 'dashboard'
  | 'inventory'
  | 'add-product'
  | 'categories'
  | 'bundles'
  | 'sales'
  | 'analytics';
