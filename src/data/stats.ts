// Stats data layer — real aggregations for Dashboard + Analytics.
import { http } from '../lib/api';

export type StatsRange = '7d' | '30d' | '90d' | '1y' | 'all';

export interface Stats {
  range: StatsRange;
  kpis: {
    monthSales: number; monthProfit: number; monthOrders: number; inventoryValue: number;
    deltaSales: number; deltaProfit: number; deltaOrders: number;
  };
  totals: { sales: number; profit: number; orders: number; avgOrder: number; inStockUnits: number; grossProfit: number };
  salesTrend: { labels: string[]; thisWeek: number[]; lastWeek: number[] };
  salesByMonth: { labels: string[]; sales: number[]; profit: number[]; orders: number[] };
  stockMovement: { labels: string[]; inb: number[]; outb: number[] };
  categoryShare: { label: string; value: number }[];
  categoryUnits: { label: string; units: number }[];
  topProducts: { id: number; name: string; sku: string | null; image_url: string | null; qty: number; revenue: number; profit: number }[];
  lowStock: { id: number; name: string; sku: string | null; brand: string | null; image_url: string | null; category_name: string | null; stock: number; low: number }[];
  bundlePerformance: { id: number; name: string; item_count: number; sold: number; revenue: number; profit: number; margin: number }[];
}

export async function fetchStats(range: StatsRange = 'all'): Promise<Stats> {
  return http.get<Stats>(`/api/stats?range=${range}`);
}
