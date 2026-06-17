// Shared UI types. Domain data types now live with their data layers
// (src/data/inventory.ts, bundles.ts, sales.ts, stats.ts).

/** Top-level navigable views. */
export type ViewId =
  | 'dashboard'
  | 'inventory'
  | 'add-product'
  | 'categories'
  | 'bundles'
  | 'sales'
  | 'analytics'
  | 'generate-post'
  | 'settings';
