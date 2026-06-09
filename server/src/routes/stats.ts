import type { FastifyInstance } from 'fastify';
import { query } from '../db';
import { requireAuth } from '../auth';

const n = (v: unknown): number => (v == null ? 0 : Number(v));
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const TH_DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

/** % change a vs b (rounded), 0 when b is 0. */
const pct = (a: number, b: number) => (b === 0 ? 0 : Math.round(((a - b) / b) * 1000) / 10);

type Range = '7d' | '30d' | '90d' | '1y' | 'all';
const RANGE_DAYS: Record<Exclude<Range, 'all'>, number> = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
const parseRange = (v: unknown): Range =>
  v === '7d' || v === '30d' || v === '90d' || v === '1y' || v === 'all' ? (v as Range) : 'all';

export async function statsRoutes(app: FastifyInstance) {
  app.get('/api/stats', { preHandler: requireAuth() }, async (req) => {
    const range = parseRange((req.query as Record<string, unknown> | undefined)?.range);
    // Lower bound for range-dependent aggregations. null = all-time.
    const since = range === 'all' ? null : new Date(Date.now() - RANGE_DAYS[range] * 86400000);
    // Time-series granularity: daily for short ranges, monthly for long ranges.
    const daily = range === '7d' || range === '30d' || range === '90d';
    const trunc = daily ? 'day' : 'month';

    const [
      invVal, monthAgg, seriesAgg, dayAgg, catShare, bundleShare, topProd, low,
      totalsRow, grossRow, serialIn, serialOut, catUnits, bundlePerf, inStockRow,
    ] = await Promise.all([
      // --- snapshot: inventory value (range-independent) — sum each in-stock unit's own cost ---
      query(`select coalesce(sum(cost),0) v from product_serials where status='in_stock'`),
      // --- monthly agg (ALWAYS all-time monthly) — drives the month-over-month KPI deltas ---
      query(`select to_char(date_trunc('month',created_at),'YYYY-MM') k,
                     sum(total) sales, sum(profit) profit, count(*) orders
               from sales group by 1`),
      // --- time series for the main chart (range + adaptive granularity) ---
      query(`select to_char(date_trunc('${trunc}',created_at),'YYYY-MM-DD') k,
                     sum(total) sales, sum(profit) profit, count(*) orders
               from sales where ($1::timestamptz is null or created_at >= $1) group by 1`, [since]),
      // --- 14-day weekly trend (Dashboard widget; intentionally NOT range-filtered) ---
      query(`select to_char(date_trunc('day',created_at),'YYYY-MM-DD') k, sum(total) sales
               from sales where created_at >= now() - interval '14 days' group by 1`),
      // --- category share (range) ---
      query(`select coalesce(c.name,'ไม่ระบุหมวด') label, sum(si.unit_price*si.qty) revenue
               from sale_items si
               join products p on p.id=si.product_id
               join sales s on s.id=si.sale_id
               left join categories c on c.id=p.category_id
               where si.product_id is not null and ($1::timestamptz is null or s.created_at >= $1)
               group by c.name`, [since]),
      // --- bundle revenue slice (range) ---
      query(`select coalesce(sum(si.unit_price*si.qty),0) revenue
               from sale_items si join sales s on s.id=si.sale_id
               where si.bundle_id is not null and ($1::timestamptz is null or s.created_at >= $1)`, [since]),
      // --- top products (range) ---
      query(`select p.id, p.name, p.image_url,
                     sum(si.qty) qty, sum(si.unit_price*si.qty) revenue,
                     sum((si.unit_price-si.unit_cost)*si.qty) profit
               from sale_items si
               join products p on p.id=si.product_id
               join sales s on s.id=si.sale_id
               where si.product_id is not null and ($1::timestamptz is null or s.created_at >= $1)
               group by p.id order by qty desc limit 5`, [since]),
      // --- low stock (snapshot; used by Dashboard) ---
      query(`select p.id, p.name, p.brand, c.name category_name, p.low,
                     coalesce(s.cnt,0)::int stock
               from products p left join categories c on c.id=p.category_id
               left join (select product_id, count(*) cnt from product_serials where status='in_stock' group by product_id) s
                 on s.product_id=p.id
               where p.status='active' and coalesce(s.cnt,0) <= p.low order by stock asc`),
      // --- totals (range) ---
      query(`select coalesce(sum(total),0) sales, coalesce(sum(profit),0) profit,
                     count(*) orders, coalesce(avg(total),0) avg
               from sales where ($1::timestamptz is null or created_at >= $1)`, [since]),
      // --- gross profit from sale_items (range) ---
      query(`select coalesce(sum((si.unit_price-si.unit_cost)*si.qty),0) v
               from sale_items si join sales s on s.id=si.sale_id
               where ($1::timestamptz is null or s.created_at >= $1)`, [since]),
      // --- serials added per bucket (range + granularity) ---
      query(`select to_char(date_trunc('${trunc}',created_at),'YYYY-MM-DD') k, count(*) n
               from product_serials where ($1::timestamptz is null or created_at >= $1) group by 1`, [since]),
      // --- serials sold per bucket (range + granularity) ---
      query(`select to_char(date_trunc('${trunc}',s.created_at),'YYYY-MM-DD') k, count(*) n
               from product_serials ps join sales s on s.id=ps.sale_id
               where ps.status='sold' and ($1::timestamptz is null or s.created_at >= $1) group by 1`, [since]),
      // --- category units (range) ---
      query(`select coalesce(c.name,'ไม่ระบุหมวด') label, sum(si.qty) units
               from sale_items si
               join products p on p.id=si.product_id
               join sales s on s.id=si.sale_id
               left join categories c on c.id=p.category_id
               where si.product_id is not null and ($1::timestamptz is null or s.created_at >= $1)
               group by c.name order by units desc limit 6`, [since]),
      // --- bundle performance (range; date filter inside subquery to keep zero-sale bundles) ---
      query(`select bd.id, bd.name,
                     (select count(*) from bundle_items bi where bi.bundle_id=bd.id) item_count,
                     coalesce(sum(si.qty),0) sold,
                     coalesce(sum(si.unit_price*si.qty),0) revenue,
                     coalesce(sum((si.unit_price-si.unit_cost)*si.qty),0) profit
               from bundles bd
               left join (
                 select si.bundle_id, si.qty, si.unit_price, si.unit_cost
                 from sale_items si join sales s on s.id=si.sale_id
                 where ($1::timestamptz is null or s.created_at >= $1)
               ) si on si.bundle_id=bd.id
               group by bd.id order by sold desc`, [since]),
      // --- in-stock units (snapshot) ---
      query(`select coalesce(sum(cnt),0) u from (select count(*) cnt from product_serials where status='in_stock' group by product_id) t`),
    ]);

    const now = new Date();

    // ----- KPI deltas: this calendar month vs last (always monthly, all-time) -----
    const mMap = new Map((monthAgg.rows as Record<string, unknown>[]).map((r) => [r.k as string, r]));
    const curK = monthKey(now);
    const prevK = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const cur = mMap.get(curK);
    const prev = mMap.get(prevK);
    const kpis = {
      monthSales: n(cur?.sales), monthProfit: n(cur?.profit), monthOrders: n(cur?.orders),
      inventoryValue: n(invVal.rows[0].v),
      deltaSales: pct(n(cur?.sales), n(prev?.sales)),
      deltaProfit: pct(n(cur?.profit), n(prev?.profit)),
      deltaOrders: pct(n(cur?.orders), n(prev?.orders)),
    };

    // ----- chart buckets (daily for short ranges, monthly for long) -----
    const buckets: Date[] = [];
    if (daily) {
      const days = RANGE_DAYS[range as '7d' | '30d' | '90d'];
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i); buckets.push(d);
      }
    } else {
      for (let i = 11; i >= 0; i--) buckets.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
    }
    const bucketKey = (d: Date) => (daily ? dayKey(d) : dayKey(new Date(d.getFullYear(), d.getMonth(), 1)));
    const bucketLabel = (d: Date) => (daily ? `${d.getDate()} ${TH_MONTHS[d.getMonth()]}` : TH_MONTHS[d.getMonth()]);

    const seriesMap = new Map((seriesAgg.rows as Record<string, unknown>[]).map((r) => [r.k as string, r]));
    const salesByMonth = {
      labels: buckets.map(bucketLabel),
      sales: buckets.map((d) => n(seriesMap.get(bucketKey(d))?.sales)),
      profit: buckets.map((d) => n(seriesMap.get(bucketKey(d))?.profit)),
      orders: buckets.map((d) => n(seriesMap.get(bucketKey(d))?.orders)),
    };

    const inMap = new Map((serialIn.rows as Record<string, unknown>[]).map((r) => [r.k as string, n(r.n)]));
    const outMap = new Map((serialOut.rows as Record<string, unknown>[]).map((r) => [r.k as string, n(r.n)]));
    const stockMovement = {
      labels: buckets.map(bucketLabel),
      inb: buckets.map((d) => inMap.get(bucketKey(d)) ?? 0),
      outb: buckets.map((d) => outMap.get(bucketKey(d)) ?? 0),
    };

    // ----- 14-day -> this week vs last week (Dashboard) -----
    const dMap = new Map((dayAgg.rows as Record<string, unknown>[]).map((r) => [r.k as string, n(r.sales)]));
    const days: Date[] = [];
    for (let i = 13; i >= 0; i--) { const d = new Date(now); d.setDate(now.getDate() - i); days.push(d); }
    const lastWeekDays = days.slice(0, 7);
    const thisWeekDays = days.slice(7);
    const salesTrend = {
      labels: thisWeekDays.map((d) => TH_DOW[d.getDay()]),
      thisWeek: thisWeekDays.map((d) => dMap.get(dayKey(d)) ?? 0),
      lastWeek: lastWeekDays.map((d) => dMap.get(dayKey(d)) ?? 0),
    };

    // ----- category share (products + bundles as one slice) -----
    const categoryShare = (catShare.rows as Record<string, unknown>[]).map((r) => ({ label: r.label as string, value: n(r.revenue) }));
    const bundleRev = n(bundleShare.rows[0].revenue);
    if (bundleRev > 0) categoryShare.push({ label: 'ชุดสินค้า', value: bundleRev });
    categoryShare.sort((a, b) => b.value - a.value);

    const totalsRowR = totalsRow.rows[0] as Record<string, unknown>;
    const totals = {
      sales: n(totalsRowR.sales), profit: n(totalsRowR.profit), orders: n(totalsRowR.orders),
      avgOrder: Math.round(n(totalsRowR.avg)),
      inStockUnits: n((inStockRow.rows[0] as Record<string, unknown>).u),
      grossProfit: n((grossRow.rows[0] as Record<string, unknown>).v),
    };

    return {
      range,
      kpis,
      totals,
      salesTrend,
      salesByMonth,
      stockMovement,
      categoryShare,
      categoryUnits: (catUnits.rows as Record<string, unknown>[]).map((r) => ({ label: r.label as string, units: n(r.units) })),
      topProducts: (topProd.rows as Record<string, unknown>[]).map((r) => ({
        id: Number(r.id), name: r.name as string, sku: null as string | null, image_url: (r.image_url as string) ?? null,
        qty: n(r.qty), revenue: n(r.revenue), profit: n(r.profit),
      })),
      lowStock: (low.rows as Record<string, unknown>[]).map((r) => ({
        id: Number(r.id), name: r.name as string, sku: null as string | null, brand: (r.brand as string) ?? null,
        image_url: null as string | null, category_name: (r.category_name as string) ?? null,
        stock: n(r.stock), low: n(r.low),
      })),
      bundlePerformance: (bundlePerf.rows as Record<string, unknown>[]).map((r) => {
        const revenue = n(r.revenue); const profit = n(r.profit);
        return {
          id: Number(r.id), name: r.name as string, item_count: n(r.item_count), sold: n(r.sold),
          revenue, profit, margin: revenue ? Math.round((profit / revenue) * 1000) / 10 : 0,
        };
      }),
    };
  });
}
