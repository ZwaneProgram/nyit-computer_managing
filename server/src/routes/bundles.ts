import type { FastifyInstance } from 'fastify';
import { pool, query } from '../db';
import { requireAuth } from '../auth';

interface BundleBody {
  name?: string;
  discount_pct?: number;
  warranty_months?: number;
  warranty_text?: string | null;
  product_ids?: number[];
}

/** Clamp a warranty value to a non-negative integer (0 = shop warranty). */
function cleanWarranty(input: unknown): number {
  const n = Math.floor(Number(input));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Trim free-text warranty; empty becomes null. */
function cleanWarrantyText(input: unknown): string | null {
  const s = input == null ? '' : String(input).trim();
  return s || null;
}

function cleanIds(input: unknown): number[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<number>();
  for (const raw of input) {
    const id = Number(raw);
    if (Number.isFinite(id)) seen.add(id);
  }
  return [...seen];
}

// Items for a set of bundles, each with the component product + derived stock.
async function itemsByBundle(): Promise<Map<string, unknown[]>> {
  // Per-item inventory: derive a representative price/cost from the cheapest
  // in-stock unit (catalog no longer stores price/cost/sku/image).
  const { rows } = await query(
    `select bi.bundle_id, p.id as product_id, p.name,
            null::text as sku, null::text as image_url,
            coalesce(s.in_stock, 0)::int as stock,
            coalesce(s.price_min, 0) as price,
            coalesce(s.cost_min, 0)  as cost
       from bundle_items bi
       join products p on p.id = bi.product_id
       left join (
         select product_id,
                count(*) filter (where status = 'in_stock') as in_stock,
                min(price) filter (where status = 'in_stock') as price_min,
                min(cost)  filter (where status = 'in_stock') as cost_min
           from product_serials group by product_id
       ) s on s.product_id = p.id
      order by p.name`,
  );
  const map = new Map<string, unknown[]>();
  for (const r of rows as Record<string, unknown>[]) {
    const key = String(r.bundle_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  return map;
}

export async function bundleRoutes(app: FastifyInstance) {
  const guard = { preHandler: requireAuth() };

  app.get('/api/bundles', async () => {
    const { rows: bundles } = await query('select * from bundles order by name');
    const items = await itemsByBundle();
    const { rows: soldRows } = await query(
      "select bundle_id, count(*)::int as sold from sale_items where bundle_id is not null group by bundle_id",
    );
    const sold = new Map((soldRows as Record<string, unknown>[]).map((r) => [String(r.bundle_id), r.sold]));
    const result = (bundles as Record<string, unknown>[]).map((b) => ({
      ...b,
      items: items.get(String(b.id)) ?? [],
      sold: sold.get(String(b.id)) ?? 0,
    }));
    return { bundles: result };
  });

  app.get('/api/bundles/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { rows } = await query('select * from bundles where id = $1', [id]);
    if (!rows[0]) return reply.code(404).send({ error: 'ไม่พบชุดสินค้า' });
    const items = await itemsByBundle();
    return { bundle: { ...rows[0], items: items.get(String(id)) ?? [] } };
  });

  app.post('/api/bundles', guard, async (req, reply) => {
    const b = (req.body ?? {}) as BundleBody;
    if (!b.name?.trim()) return reply.code(400).send({ error: 'ต้องระบุชื่อชุดสินค้า' });
    const ids = cleanIds(b.product_ids);
    if (!ids.length) return reply.code(400).send({ error: 'เลือกสินค้าอย่างน้อยหนึ่งรายการ' });

    const client = await pool.connect();
    try {
      await client.query('begin');
      const { rows } = await client.query(
        'insert into bundles (name, discount_pct, warranty_months, warranty_text, created_by) values ($1, $2, $3, $4, $5) returning *',
        [b.name.trim(), b.discount_pct ?? 0, cleanWarranty(b.warranty_months), cleanWarrantyText(b.warranty_text), req.user!.id],
      );
      const bundle = rows[0];
      for (const pid of ids) {
        await client.query('insert into bundle_items (bundle_id, product_id) values ($1, $2)', [bundle.id, pid]);
      }
      await client.query('commit');
      return reply.code(201).send({ bundle });
    } catch (err) {
      await client.query('rollback');
      if ((err as { code?: string }).code === '23503') {
        return reply.code(400).send({ error: 'มีสินค้าที่เลือกไม่อยู่ในระบบแล้ว' });
      }
      throw err;
    } finally {
      client.release();
    }
  });

  app.put('/api/bundles/:id', guard, async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = (req.body ?? {}) as BundleBody;
    if (!b.name?.trim()) return reply.code(400).send({ error: 'ต้องระบุชื่อชุดสินค้า' });
    const ids = cleanIds(b.product_ids);
    if (!ids.length) return reply.code(400).send({ error: 'เลือกสินค้าอย่างน้อยหนึ่งรายการ' });

    const client = await pool.connect();
    try {
      await client.query('begin');
      const { rows } = await client.query(
        'update bundles set name = $1, discount_pct = $2, warranty_months = $3, warranty_text = $4 where id = $5 returning *',
        [b.name.trim(), b.discount_pct ?? 0, cleanWarranty(b.warranty_months), cleanWarrantyText(b.warranty_text), id],
      );
      if (!rows[0]) {
        await client.query('rollback');
        return reply.code(404).send({ error: 'ไม่พบชุดสินค้า' });
      }
      await client.query('delete from bundle_items where bundle_id = $1', [id]);
      for (const pid of ids) {
        await client.query('insert into bundle_items (bundle_id, product_id) values ($1, $2)', [id, pid]);
      }
      await client.query('commit');
      return { bundle: rows[0] };
    } catch (err) {
      await client.query('rollback');
      if ((err as { code?: string }).code === '23503') {
        return reply.code(400).send({ error: 'มีสินค้าที่เลือกไม่อยู่ในระบบแล้ว' });
      }
      throw err;
    } finally {
      client.release();
    }
  });

  app.delete('/api/bundles/:id', guard, async (req, reply) => {
    const { id } = req.params as { id: string };
    await query('delete from bundles where id = $1', [id]); // cascades to bundle_items
    return reply.code(204).send();
  });
}
