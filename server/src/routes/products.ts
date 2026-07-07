import type { FastifyInstance } from 'fastify';
import { pool, query } from '../db';
import { requireAuth } from '../auth';

/** One physical unit (product_serials row). */
interface UnitInput {
  serial?: string;
  sku?: string | null;
  cost?: number;
  price?: number;
  warranty_months?: number;
  warranty_text?: string | null;
  note?: string | null;
  image_url?: string | null;
  images?: unknown;
  draft?: boolean;
}

interface ProductBody {
  category_id?: number | null;
  name?: string;
  brand?: string | null;
  model?: string | null;
  low?: number;
  notes?: string | null;
  description?: string | null;
  specs?: [string, string][] | null;
  status?: 'active' | 'draft';
  /** Physical units to create alongside the catalog (create only). */
  units?: UnitInput[];
}

/** A normalised unit ready to insert. */
interface CleanUnit {
  serial: string;
  sku: string | null;
  cost: number;
  price: number;
  warranty_months: number;
  warranty_text: string | null;
  note: string | null;
  image_url: string | null;
  images: string[];
  draft: boolean;
}

/** Ordered, de-duped list of image URLs (strings), capped. */
function cleanImages(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    const s = typeof raw === 'string' ? raw.trim() : '';
    if (s && !seen.has(s)) { seen.add(s); out.push(s); }
  }
  return out.slice(0, 12);
}

/** Reconcile the gallery with the chosen cover: cover must be one of `images`. */
function galleryFor(u: UnitInput): { images: string[]; cover: string | null } {
  let images = cleanImages(u.images);
  let cover = typeof u.image_url === 'string' && u.image_url.trim() ? u.image_url.trim() : null;
  if (cover && !images.includes(cover)) images = [cover, ...images];
  if (!cover) cover = images[0] ?? null;
  return { images, cover };
}

/** Clean a unit list: trim serials, drop blank-serial rows, de-dupe by serial. */
function cleanUnits(input: unknown): CleanUnit[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: CleanUnit[] = [];
  for (const raw of input) {
    const u = (raw ?? {}) as UnitInput;
    const serial = String(u.serial ?? '').trim();
    if (!serial) continue;
    const key = serial.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const { images, cover } = galleryFor(u);
    out.push({
      serial,
      sku: u.sku?.toString().trim() || null,
      cost: Number(u.cost) || 0,
      price: Number(u.price) || 0,
      warranty_months: Number(u.warranty_months) || 0,
      warranty_text: u.warranty_text?.toString().trim() || null,
      note: u.note?.toString().trim() || null,
      image_url: cover,
      images,
      draft: u.draft === true,
    });
  }
  return out;
}

// Translate a unique-violation into a friendly Thai message.
function conflictMessage(err: unknown): string | null {
  const e = err as { code?: string; constraint?: string };
  if (e.code !== '23505') return null;
  if (e.constraint === 'product_serials_serial_key') return 'มี Serial Number นี้อยู่แล้ว';
  if (e.constraint === 'uniq_serials_sku') return 'SKU นี้มีอยู่แล้ว';
  return 'ข้อมูลซ้ำกับที่มีอยู่แล้ว';
}

// Catalog + category + derived stock + price range + in-stock cost total.
const PRODUCT_SELECT = `
  select p.*, c.name as category_name, c.slug as category_slug,
         coalesce(s.in_stock, 0)::int as stock,
         coalesce(s.draft_count, 0)::int as draft_count,
         s.price_min, s.price_max, s.cost_min, coalesce(s.stock_cost, 0) as stock_cost
    from products p
    left join categories c on c.id = p.category_id
    left join (
      select product_id,
             count(*) filter (where status = 'in_stock') as in_stock,
             count(*) filter (where status = 'draft')    as draft_count,
             min(price) filter (where status = 'in_stock') as price_min,
             max(price) filter (where status = 'in_stock') as price_max,
             min(cost)  filter (where status = 'in_stock') as cost_min,
             sum(cost)  filter (where status = 'in_stock') as stock_cost
        from product_serials group by product_id
    ) s on s.product_id = p.id`;

const UNIT_RETURN = 'id, serial, sku, status, cost, price, warranty_months, warranty_text, note, image_url, images, created_at';

export async function productRoutes(app: FastifyInstance) {
  const guard = { preHandler: requireAuth() };

  // List catalogs.
  //   ?drafts=1     → only catalogs that contain at least one draft unit.
  //   ?from=&to=    → only catalogs that had at least one UNIT added in the date
  //                   range (by product_serials.created_at, inclusive); each row
  //                   also returns added_in_range = how many units fell in range.
  app.get('/api/products', async (req) => {
    const q = req.query as { drafts?: string; from?: string; to?: string };
    const onlyDrafts = q.drafts === '1';
    const from = q.from?.trim() || null;
    const to = q.to?.trim() || null;
    const { rows } = await query(
      `select p.*, c.name as category_name, c.slug as category_slug,
              coalesce(s.in_stock, 0)::int as stock,
              coalesce(s.draft_count, 0)::int as draft_count,
              s.price_min, s.price_max, s.cost_min, coalesce(s.stock_cost, 0) as stock_cost,
              coalesce(s.added_in_range, 0)::int as added_in_range
         from products p
         left join categories c on c.id = p.category_id
         left join (
           select product_id,
                  count(*) filter (where status = 'in_stock') as in_stock,
                  count(*) filter (where status = 'draft')    as draft_count,
                  min(price) filter (where status = 'in_stock') as price_min,
                  max(price) filter (where status = 'in_stock') as price_max,
                  min(cost)  filter (where status = 'in_stock') as cost_min,
                  sum(cost)  filter (where status = 'in_stock') as stock_cost,
                  count(*) filter (where
                    ($2::date is null or created_at >= $2::date) and
                    ($3::date is null or created_at < ($3::date + interval '1 day'))
                  ) as added_in_range
             from product_serials group by product_id
         ) s on s.product_id = p.id
        where ($1::bool is false or coalesce(s.draft_count, 0) > 0)
          and (($2::date is null and $3::date is null) or coalesce(s.added_in_range, 0) > 0)
        order by p.name`,
      [onlyDrafts, from, to],
    );
    return { products: rows };
  });

  // Look up in-stock units by Serial Number or SKU (for the sales search).
  //   ?q=<term>  → partial, case-insensitive match on serial OR sku.
  // Returns sellable (in_stock) units with their parent product's name/brand so
  // the sales screen can surface the right product for a scanned/typed serial.
  app.get('/api/products/unit-search', async (req) => {
    const q = (req.query as { q?: string }).q?.trim() ?? '';
    if (!q) return { units: [] };
    const { rows } = await query(
      `select ${UNIT_RETURN.split(', ').map((c) => `ps.${c}`).join(', ')}, ps.sale_id,
              ps.product_id, p.name as product_name, p.brand as product_brand
         from product_serials ps
         join products p on p.id = ps.product_id
        where ps.status = 'in_stock'
          and (ps.serial ilike $1 or ps.sku ilike $1)
        order by (lower(ps.serial) = lower($2) or lower(coalesce(ps.sku, '')) = lower($2)) desc,
                 ps.serial
        limit 20`,
      [`%${q}%`, q],
    );
    return { units: rows };
  });

  // One product, with all its units.
  app.get('/api/products/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { rows } = await query(`${PRODUCT_SELECT} where p.id = $1`, [id]);
    if (!rows[0]) return reply.code(404).send({ error: 'ไม่พบสินค้า' });
    const { rows: serials } = await query(
      `select ${UNIT_RETURN}, sale_id from product_serials where product_id = $1 order by created_at, id`,
      [id],
    );
    return { product: rows[0], serials };
  });

  app.post('/api/products', guard, async (req, reply) => {
    const b = (req.body ?? {}) as ProductBody;
    const status = b.status === 'draft' ? 'draft' : 'active';
    if (!b.name?.trim()) return reply.code(400).send({ error: 'ต้องระบุชื่อสินค้า' });
    const units = cleanUnits(b.units);

    const client = await pool.connect();
    try {
      await client.query('begin');
      const { rows } = await client.query(
        `insert into products (category_id, name, brand, model, low, notes, description, specs, status, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         returning *`,
        [
          b.category_id ?? null, b.name.trim(), b.brand ?? null, b.model ?? null,
          b.low ?? 0, b.notes ?? null, b.description ?? null,
          b.specs ? JSON.stringify(b.specs) : null, status, req.user!.id,
        ],
      );
      const product = rows[0];
      for (const u of units) {
        await client.query(
          `insert into product_serials (product_id, serial, sku, cost, price, warranty_months, warranty_text, note, image_url, images, status)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)`,
          [product.id, u.serial, u.sku, u.cost, u.price, u.warranty_months, u.warranty_text, u.note, u.image_url, JSON.stringify(u.images), u.draft ? 'draft' : 'in_stock'],
        );
      }
      await client.query('commit');
      return reply.code(201).send({ product: { ...product, stock: units.filter((u) => !u.draft).length } });
    } catch (err) {
      await client.query('rollback');
      const msg = conflictMessage(err);
      if (msg) return reply.code(409).send({ error: msg });
      throw err;
    } finally {
      client.release();
    }
  });

  app.put('/api/products/:id', guard, async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = (req.body ?? {}) as ProductBody;
    if (!b.name?.trim()) return reply.code(400).send({ error: 'ต้องระบุชื่อสินค้า' });
    const status = b.status === 'draft' ? 'draft' : 'active';
    const { rows } = await query(
      `update products set
         category_id = $1, name = $2, brand = $3, model = $4,
         low = $5, notes = $6, description = $7, specs = $8, status = $9, updated_at = now()
       where id = $10
       returning *`,
      [
        b.category_id ?? null, b.name.trim(), b.brand ?? null, b.model ?? null,
        b.low ?? 0, b.notes ?? null, b.description ?? null,
        b.specs ? JSON.stringify(b.specs) : null, status, id,
      ],
    );
    if (!rows[0]) return reply.code(404).send({ error: 'ไม่พบสินค้า' });
    return { product: rows[0] };
  });

  app.delete('/api/products/:id', guard, async (req, reply) => {
    const { id } = req.params as { id: string };
    await query('delete from products where id = $1', [id]); // cascades to serials
    return reply.code(204).send();
  });

  // ----- Units (product_serials) -----

  // Add one or more units to a product (stock goes up).
  app.post('/api/products/:id/serials', guard, async (req, reply) => {
    const { id } = req.params as { id: string };
    const units = cleanUnits((req.body as { units?: UnitInput[] })?.units);
    if (!units.length) return reply.code(400).send({ error: 'ต้องระบุ Serial Number อย่างน้อยหนึ่งรายการ' });

    const { rows: exists } = await query('select 1 from products where id = $1', [id]);
    if (!exists[0]) return reply.code(404).send({ error: 'ไม่พบสินค้า' });

    const client = await pool.connect();
    try {
      await client.query('begin');
      const added = [];
      for (const u of units) {
        const { rows } = await client.query(
          `insert into product_serials (product_id, serial, sku, cost, price, warranty_months, warranty_text, note, image_url, images, status)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)
           returning ${UNIT_RETURN}`,
          [id, u.serial, u.sku, u.cost, u.price, u.warranty_months, u.warranty_text, u.note, u.image_url, JSON.stringify(u.images), u.draft ? 'draft' : 'in_stock'],
        );
        added.push(rows[0]);
      }
      await client.query('commit');
      return reply.code(201).send({ serials: added });
    } catch (err) {
      await client.query('rollback');
      const msg = conflictMessage(err);
      if (msg) return reply.code(409).send({ error: msg });
      throw err;
    } finally {
      client.release();
    }
  });

  // Edit one unit (only if not already sold).
  app.put('/api/serials/:serialId', guard, async (req, reply) => {
    const { serialId } = req.params as { serialId: string };
    const u = cleanUnits([req.body])[0];
    if (!u) return reply.code(400).send({ error: 'ต้องระบุ Serial Number' });
    const { rows: cur } = await query('select status from product_serials where id = $1', [serialId]);
    if (!cur[0]) return reply.code(404).send({ error: 'ไม่พบรายการ' });
    if (cur[0].status === 'sold') return reply.code(409).send({ error: 'แก้ไขไม่ได้: หน่วยนี้ถูกขายไปแล้ว' });
    try {
      const { rows } = await query(
        `update product_serials set serial = $1, sku = $2, cost = $3, price = $4,
           warranty_months = $5, warranty_text = $6, note = $7, image_url = $8, images = $9::jsonb, status = $10 where id = $11
         returning ${UNIT_RETURN}`,
        [u.serial, u.sku, u.cost, u.price, u.warranty_months, u.warranty_text, u.note, u.image_url, JSON.stringify(u.images), u.draft ? 'draft' : 'in_stock', serialId],
      );
      return { serial: rows[0] };
    } catch (err) {
      const msg = conflictMessage(err);
      if (msg) return reply.code(409).send({ error: msg });
      throw err;
    }
  });

  // Remove a unit (only if not already sold).
  app.delete('/api/serials/:serialId', guard, async (req, reply) => {
    const { serialId } = req.params as { serialId: string };
    const { rows } = await query('select status from product_serials where id = $1', [serialId]);
    if (!rows[0]) return reply.code(404).send({ error: 'ไม่พบรายการ' });
    if (rows[0].status === 'sold') {
      return reply.code(409).send({ error: 'ลบไม่ได้: หน่วยนี้ถูกขายไปแล้ว' });
    }
    await query('delete from product_serials where id = $1', [serialId]);
    return reply.code(204).send();
  });
}
