import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { pool, query } from '../db';
import { requireAuth } from '../auth';

interface ItemLine { product_id: number; qty: number }
interface SaleBody {
  kind?: 'item' | 'bundle';
  items?: ItemLine[];
  bundle_id?: number;
  bundle_qty?: number;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  tax_id?: string | null;
  shipping?: number;
  discount?: number;
}

const num = (v: unknown): number => (v == null ? 0 : Number(v));

/** Thrown when a product doesn't have enough in-stock units. */
class StockError extends Error {}

/**
 * Reserve `need` in-stock serials for a product (FIFO), flip them to sold,
 * and record a stock movement. Throws StockError if not enough stock.
 */
async function sellUnits(client: PoolClient, productId: number, need: number, saleId: number, userId: number) {
  const { rows } = await client.query(
    `select id from product_serials
       where product_id = $1 and status = 'in_stock'
       order by created_at, id limit $2 for update`,
    [productId, need],
  );
  if (rows.length < need) {
    const { rows: p } = await client.query('select name from products where id = $1', [productId]);
    throw new StockError(`สต๊อกไม่พอสำหรับ "${p[0]?.name ?? `#${productId}`}" (ต้องการ ${need}, มี ${rows.length})`);
  }
  const ids = rows.map((r) => r.id);
  await client.query("update product_serials set status = 'sold', sale_id = $2 where id = any($1)", [ids, saleId]);
  await client.query(
    "insert into stock_movements (product_id, delta, reason, ref_sale_id, created_by) values ($1, $2, 'sale', $3, $4)",
    [productId, -need, saleId, userId],
  );
}

export async function saleRoutes(app: FastifyInstance) {
  const guard = { preHandler: requireAuth() };

  // History (newest first) with optional date range, search, and pagination.
  app.get('/api/sales', guard, async (req) => {
    const qp = (req.query ?? {}) as Record<string, string | undefined>;
    const from = qp.from && qp.from.trim() ? qp.from.trim() : null;
    const to = qp.to && qp.to.trim() ? qp.to.trim() : null;
    const search = qp.q && qp.q.trim() ? qp.q.trim() : null;
    const limit = Math.min(100, Math.max(1, Number(qp.limit) || 25));
    const offset = Math.max(0, Number(qp.offset) || 0);
    const like = search ? `%${search}%` : null;

    // Shared WHERE for both the count and the page query. $1..$4 = from,to,search,like.
    const where = `
      where ($1::date is null or s.created_at >= $1::date)
        and ($2::date is null or s.created_at < ($2::date + interval '1 day'))
        and ($3::text is null or s.id::text = $3 or s.customer_name ilike $4 or exists (
              select 1 from sale_items si
              left join products p on p.id = si.product_id
              left join bundles bd on bd.id = si.bundle_id
              where si.sale_id = s.id and (p.name ilike $4 or bd.name ilike $4)))`;
    const filterParams = [from, to, search, like];

    const { rows: countRows } = await query(
      `select count(*)::int total from sales s ${where}`,
      filterParams,
    );
    const total = (countRows[0] as Record<string, unknown>).total as number;

    const { rows: sales } = await query(
      `select s.*, u.full_name as staff_name, u.username as staff_username
         from sales s left join users u on u.id = s.staff_id
         ${where}
        order by s.created_at desc
        limit $5 offset $6`,
      [...filterParams, limit, offset],
    );

    const saleIds = (sales as Record<string, unknown>[]).map((s) => Number(s.id));
    const { rows: items } = saleIds.length
      ? await query(
          `select si.sale_id, si.qty, si.product_id, si.bundle_id,
                  p.name as product_name, bd.name as bundle_name
             from sale_items si
             left join products p on p.id = si.product_id
             left join bundles bd on bd.id = si.bundle_id
            where si.sale_id = any($1)`,
          [saleIds],
        )
      : { rows: [] as Record<string, unknown>[] };

    const bySale = new Map<string, Record<string, unknown>[]>();
    for (const it of items as Record<string, unknown>[]) {
      const k = String(it.sale_id);
      if (!bySale.has(k)) bySale.set(k, []);
      bySale.get(k)!.push(it);
    }
    const result = (sales as Record<string, unknown>[]).map((s) => {
      const lines = bySale.get(String(s.id)) ?? [];
      let label = '—';
      if (lines.length) {
        const first = lines[0];
        const name = (first.bundle_name as string) || (first.product_name as string) || 'สินค้า';
        label = lines.length > 1 ? `${name} +${lines.length - 1} รายการ` : `${name}${num(first.qty) > 1 ? ` ×${num(first.qty)}` : ''}`;
      }
      return { ...s, label, line_count: lines.length };
    });
    return { sales: result, total };
  });

  // Atomic checkout.
  app.post('/api/sales', guard, async (req, reply) => {
    const b = (req.body ?? {}) as SaleBody;
    const kind = b.kind === 'bundle' ? 'bundle' : 'item';
    const shipping = num(b.shipping);
    const discount = num(b.discount);
    const userId = req.user!.id;

    const client = await pool.connect();
    try {
      await client.query('begin');

      // Build line items + the per-product quantity to deduct.
      const lines: { product_id: number | null; bundle_id: number | null; qty: number; unit_price: number; unit_cost: number }[] = [];
      const need = new Map<number, number>();
      const addNeed = (pid: number, q: number) => need.set(pid, (need.get(pid) ?? 0) + q);

      if (kind === 'item') {
        const items = (b.items ?? []).filter((i) => Number(i.product_id) && Number(i.qty) > 0);
        if (!items.length) { await client.query('rollback'); return reply.code(400).send({ error: 'ยังไม่มีรายการสินค้า' }); }
        for (const it of items) {
          const { rows } = await client.query('select id, price, cost from products where id = $1', [it.product_id]);
          if (!rows[0]) { await client.query('rollback'); return reply.code(400).send({ error: 'มีสินค้าที่ไม่อยู่ในระบบ' }); }
          const qty = Number(it.qty);
          lines.push({ product_id: Number(it.product_id), bundle_id: null, qty, unit_price: num(rows[0].price), unit_cost: num(rows[0].cost) });
          addNeed(Number(it.product_id), qty);
        }
      } else {
        const bundleId = Number(b.bundle_id);
        const setQty = Math.max(1, Number(b.bundle_qty) || 1);
        if (!bundleId) { await client.query('rollback'); return reply.code(400).send({ error: 'ยังไม่ได้เลือกชุดสินค้า' }); }
        const { rows: brow } = await client.query('select id, discount_pct from bundles where id = $1', [bundleId]);
        if (!brow[0]) { await client.query('rollback'); return reply.code(400).send({ error: 'ไม่พบชุดสินค้า' }); }
        const { rows: comps } = await client.query(
          'select p.id, p.price, p.cost from bundle_items bi join products p on p.id = bi.product_id where bi.bundle_id = $1',
          [bundleId],
        );
        if (!comps.length) { await client.query('rollback'); return reply.code(400).send({ error: 'ชุดสินค้านี้ไม่มีสินค้า' }); }
        const listPrice = comps.reduce((s, c) => s + num(c.price), 0);
        const bundleCost = comps.reduce((s, c) => s + num(c.cost), 0);
        const bundlePrice = Math.round(listPrice * (1 - num(brow[0].discount_pct) / 100));
        lines.push({ product_id: null, bundle_id: bundleId, qty: setQty, unit_price: bundlePrice, unit_cost: bundleCost });
        for (const c of comps) addNeed(Number(c.id), setQty);
      }

      const subtotal = lines.reduce((s, l) => s + l.unit_price * l.qty, 0);
      const cost = lines.reduce((s, l) => s + l.unit_cost * l.qty, 0);
      const total = subtotal + shipping - discount;
      const profit = subtotal - cost - discount;

      const { rows: saleRows } = await client.query(
        `insert into sales (kind, customer_name, customer_phone, customer_address, tax_id,
                            shipping, discount, subtotal, total, profit, staff_id, status)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'paid') returning *`,
        [
          kind, b.customer_name ?? null, b.customer_phone ?? null, b.customer_address ?? null, b.tax_id ?? null,
          shipping, discount, subtotal, total, profit, userId,
        ],
      );
      const sale = saleRows[0];

      for (const l of lines) {
        await client.query(
          'insert into sale_items (sale_id, product_id, bundle_id, qty, unit_price, unit_cost) values ($1,$2,$3,$4,$5,$6)',
          [sale.id, l.product_id, l.bundle_id, l.qty, l.unit_price, l.unit_cost],
        );
      }
      for (const [pid, q] of need) {
        await sellUnits(client, pid, q, Number(sale.id), userId);
      }

      await client.query('commit');
      return reply.code(201).send({ sale });
    } catch (err) {
      await client.query('rollback');
      if (err instanceof StockError) return reply.code(409).send({ error: err.message });
      throw err;
    } finally {
      client.release();
    }
  });
}
