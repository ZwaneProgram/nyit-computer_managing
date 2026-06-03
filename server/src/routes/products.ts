import type { FastifyInstance } from 'fastify';
import { pool, query } from '../db';
import { requireAuth } from '../auth';

interface ProductBody {
  category_id?: number | null;
  name?: string;
  sku?: string | null;
  brand?: string | null;
  model?: string | null;
  cost?: number;
  price?: number;
  low?: number;
  warranty_months?: number;
  image_url?: string | null;
  notes?: string | null;
  status?: 'active' | 'draft';
  /** Serial numbers for the physical units (only used on create). */
  serials?: string[];
}

/** Clean a serial list: trim, drop blanks, de-dupe (case-insensitive). */
function cleanSerials(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    const s = String(raw ?? '').trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

// Translate a unique-violation into a friendly Thai message.
function conflictMessage(err: unknown): string | null {
  const e = err as { code?: string; constraint?: string };
  if (e.code !== '23505') return null;
  if (e.constraint === 'product_serials_serial_key') return 'มี Serial Number นี้อยู่แล้ว';
  if (e.constraint === 'uniq_products_sku') return 'SKU นี้มีอยู่แล้ว';
  return 'ข้อมูลซ้ำกับที่มีอยู่แล้ว';
}

// Shared select: product + category + derived in-stock count.
const PRODUCT_SELECT = `
  select p.*, c.name as category_name, c.slug as category_slug,
         coalesce(s.in_stock, 0)::int as stock
    from products p
    left join categories c on c.id = p.category_id
    left join (
      select product_id, count(*) filter (where status = 'in_stock') as in_stock
        from product_serials group by product_id
    ) s on s.product_id = p.id`;

export async function productRoutes(app: FastifyInstance) {
  const guard = { preHandler: requireAuth() };

  // List products. ?status=active (default) | draft | all
  app.get('/api/products', async (req) => {
    const { status = 'active' } = req.query as { status?: string };
    const filter = ['active', 'draft', 'all'].includes(status) ? status : 'active';
    const { rows } = await query(
      `${PRODUCT_SELECT} where ($1 = 'all' or p.status = $1) order by p.name`,
      [filter],
    );
    return { products: rows };
  });

  // One product, with all its serial units.
  app.get('/api/products/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { rows } = await query(`${PRODUCT_SELECT} where p.id = $1`, [id]);
    if (!rows[0]) return reply.code(404).send({ error: 'ไม่พบสินค้า' });
    const { rows: serials } = await query(
      'select id, serial, status, sale_id, created_at from product_serials where product_id = $1 order by created_at, id',
      [id],
    );
    return { product: rows[0], serials };
  });

  app.post('/api/products', guard, async (req, reply) => {
    const b = (req.body ?? {}) as ProductBody;
    const status = b.status === 'draft' ? 'draft' : 'active';
    if (!b.name?.trim()) return reply.code(400).send({ error: 'ต้องระบุชื่อสินค้า' });
    if (status === 'active' && !b.sku?.trim()) {
      return reply.code(400).send({ error: 'สินค้าที่เผยแพร่ต้องมี SKU (หรือบันทึกเป็นแบบร่างก่อน)' });
    }
    const serials = cleanSerials(b.serials);

    const client = await pool.connect();
    try {
      await client.query('begin');
      const { rows } = await client.query(
        `insert into products
           (category_id, name, sku, brand, model, cost, price, low, warranty_months, image_url, notes, status, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         returning *`,
        [
          b.category_id ?? null, b.name.trim(), b.sku?.trim() || null, b.brand ?? null, b.model ?? null,
          b.cost ?? 0, b.price ?? 0, b.low ?? 0, b.warranty_months ?? 0,
          b.image_url ?? null, b.notes ?? null, status, req.user!.id,
        ],
      );
      const product = rows[0];
      for (const s of serials) {
        await client.query('insert into product_serials (product_id, serial) values ($1, $2)', [product.id, s]);
      }
      await client.query('commit');
      return reply.code(201).send({ product: { ...product, stock: serials.length } });
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
    if (status === 'active' && !b.sku?.trim()) {
      return reply.code(400).send({ error: 'สินค้าที่เผยแพร่ต้องมี SKU' });
    }
    try {
      const { rows } = await query(
        `update products set
           category_id = $1, name = $2, sku = $3, brand = $4, model = $5,
           cost = $6, price = $7, low = $8, warranty_months = $9,
           image_url = $10, notes = $11, status = $12, updated_at = now()
         where id = $13
         returning *`,
        [
          b.category_id ?? null, b.name.trim(), b.sku?.trim() || null, b.brand ?? null, b.model ?? null,
          b.cost ?? 0, b.price ?? 0, b.low ?? 0, b.warranty_months ?? 0,
          b.image_url ?? null, b.notes ?? null, status, id,
        ],
      );
      if (!rows[0]) return reply.code(404).send({ error: 'ไม่พบสินค้า' });
      return { product: rows[0] };
    } catch (err) {
      const msg = conflictMessage(err);
      if (msg) return reply.code(409).send({ error: msg });
      throw err;
    }
  });

  app.delete('/api/products/:id', guard, async (req, reply) => {
    const { id } = req.params as { id: string };
    await query('delete from products where id = $1', [id]); // cascades to serials
    return reply.code(204).send();
  });

  // ----- Serial units -----

  // Add one or more serial units to a product (stock goes up).
  app.post('/api/products/:id/serials', guard, async (req, reply) => {
    const { id } = req.params as { id: string };
    const serials = cleanSerials((req.body as { serials?: string[] })?.serials);
    if (!serials.length) return reply.code(400).send({ error: 'ต้องระบุ Serial Number อย่างน้อยหนึ่งรายการ' });

    const { rows: exists } = await query('select 1 from products where id = $1', [id]);
    if (!exists[0]) return reply.code(404).send({ error: 'ไม่พบสินค้า' });

    const client = await pool.connect();
    try {
      await client.query('begin');
      const added = [];
      for (const s of serials) {
        const { rows } = await client.query(
          'insert into product_serials (product_id, serial) values ($1, $2) returning id, serial, status, created_at',
          [id, s],
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

  // Remove a serial unit (only if not already sold).
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
