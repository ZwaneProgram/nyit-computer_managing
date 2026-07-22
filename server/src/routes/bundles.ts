import type { FastifyInstance } from 'fastify';
import { pool, query } from '../db';
import { requireAuth } from '../auth';

interface BundleBody {
  name?: string;
  discount_pct?: number;
  warranty_months?: number;
  warranty_text?: string | null;
  /** Components with an optional pinned unit. Preferred over product_ids. */
  items?: { product_id?: number; serial_id?: number | null }[];
  /** Legacy flat form (no pins) — still accepted. */
  product_ids?: number[];
  images?: unknown;
  image_url?: string | null;
}

/** Ordered, de-duped image URLs; reconcile the chosen cover to be one of them. */
function cleanGallery(images: unknown, cover: unknown): { images: string[]; cover: string | null } {
  const out: string[] = [];
  const seen = new Set<string>();
  if (Array.isArray(images)) {
    for (const raw of images) {
      const s = typeof raw === 'string' ? raw.trim() : '';
      if (s && !seen.has(s)) { seen.add(s); out.push(s); }
    }
  }
  let c = typeof cover === 'string' && cover.trim() ? cover.trim() : null;
  let imgs = out.slice(0, 12);
  if (c && !imgs.includes(c)) imgs = [c, ...imgs].slice(0, 12);
  if (!c) c = imgs[0] ?? null;
  return { images: imgs, cover: c };
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

interface Component { product_id: number; serial_id: number | null; }

/**
 * Normalize the component list into unique {product_id, serial_id} rows.
 * Accepts the new `items` form (with optional pins) or the legacy `product_ids`
 * form (no pins). De-dupes by product_id, keeping the first occurrence.
 */
function cleanComponents(b: BundleBody): Component[] {
  const raw: { product_id?: number | unknown; serial_id?: number | null }[] = Array.isArray(b.items)
    ? b.items
    : Array.isArray(b.product_ids)
      ? b.product_ids.map((id) => ({ product_id: id, serial_id: null }))
      : [];
  const seen = new Set<number>();
  const out: Component[] = [];
  for (const r of raw) {
    const pid = Number(r.product_id);
    if (!Number.isFinite(pid) || seen.has(pid)) continue;
    const sid = r.serial_id == null ? null : Number(r.serial_id);
    seen.add(pid);
    out.push({ product_id: pid, serial_id: Number.isFinite(sid as number) ? (sid as number) : null });
  }
  return out;
}

/** Drop a pin whose serial does not belong to its product (keeps data honest). */
async function validatePins(
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
  comps: Component[],
): Promise<Component[]> {
  const pinned = comps.filter((c) => c.serial_id != null);
  if (!pinned.length) return comps;
  const { rows } = await client.query(
    'select id, product_id from product_serials where id = any($1)',
    [pinned.map((c) => c.serial_id)],
  );
  const owner = new Map((rows as { id: number; product_id: number }[]).map((r) => [Number(r.id), Number(r.product_id)]));
  return comps.map((c) =>
    c.serial_id != null && owner.get(c.serial_id) !== c.product_id ? { ...c, serial_id: null } : c,
  );
}

// Items for a set of bundles, each with the component product + derived stock.
async function itemsByBundle(): Promise<Map<string, unknown[]>> {
  // Per-item inventory: when a specific unit is pinned AND still in stock, that
  // unit's price/cost/sku represent the component; otherwise fall back to the
  // cheapest in-stock unit. pinned_ok tells the UI whether the pin still holds.
  const { rows } = await query(
    `select bi.bundle_id, p.id as product_id, p.name,
            bi.serial_id,
            pin.serial as pinned_serial,
            (pin.id is not null and pin.status = 'in_stock') as pinned_ok,
            case when pin.status = 'in_stock' then pin.sku else null end as sku,
            null::text as image_url,
            coalesce(s.in_stock, 0)::int as stock,
            case when pin.status = 'in_stock' then pin.price else coalesce(s.price_min, 0) end as price,
            case when pin.status = 'in_stock' then pin.cost  else coalesce(s.cost_min, 0)  end as cost
       from bundle_items bi
       join products p on p.id = bi.product_id
       left join product_serials pin on pin.id = bi.serial_id
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
    const comps = cleanComponents(b);
    if (!comps.length) return reply.code(400).send({ error: 'เลือกสินค้าอย่างน้อยหนึ่งรายการ' });

    const client = await pool.connect();
    try {
      await client.query('begin');
      const items = await validatePins(client, comps);
      const g = cleanGallery(b.images, b.image_url);
      const { rows } = await client.query(
        'insert into bundles (name, discount_pct, warranty_months, warranty_text, images, image_url, created_by) values ($1, $2, $3, $4, $5::jsonb, $6, $7) returning *',
        [b.name.trim(), b.discount_pct ?? 0, cleanWarranty(b.warranty_months), cleanWarrantyText(b.warranty_text), JSON.stringify(g.images), g.cover, req.user!.id],
      );
      const bundle = rows[0];
      for (const it of items) {
        await client.query('insert into bundle_items (bundle_id, product_id, serial_id) values ($1, $2, $3)', [bundle.id, it.product_id, it.serial_id]);
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
    const comps = cleanComponents(b);
    if (!comps.length) return reply.code(400).send({ error: 'เลือกสินค้าอย่างน้อยหนึ่งรายการ' });

    const client = await pool.connect();
    try {
      await client.query('begin');
      const items = await validatePins(client, comps);
      const g = cleanGallery(b.images, b.image_url);
      const { rows } = await client.query(
        'update bundles set name = $1, discount_pct = $2, warranty_months = $3, warranty_text = $4, images = $5::jsonb, image_url = $6 where id = $7 returning *',
        [b.name.trim(), b.discount_pct ?? 0, cleanWarranty(b.warranty_months), cleanWarrantyText(b.warranty_text), JSON.stringify(g.images), g.cover, id],
      );
      if (!rows[0]) {
        await client.query('rollback');
        return reply.code(404).send({ error: 'ไม่พบชุดสินค้า' });
      }
      await client.query('delete from bundle_items where bundle_id = $1', [id]);
      for (const it of items) {
        await client.query('insert into bundle_items (bundle_id, product_id, serial_id) values ($1, $2, $3)', [id, it.product_id, it.serial_id]);
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
