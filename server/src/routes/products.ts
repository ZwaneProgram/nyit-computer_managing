import type { FastifyInstance } from 'fastify';
import { query } from '../db';
import { requireAuth } from '../auth';

interface ProductBody {
  category_id?: number | null;
  name: string;
  sku: string;
  brand?: string | null;
  model?: string | null;
  cost?: number;
  price?: number;
  stock?: number;
  low?: number;
  warranty_months?: number;
  image_url?: string | null;
  notes?: string | null;
}

export async function productRoutes(app: FastifyInstance) {
  const guard = { preHandler: requireAuth() };

  // ----- Categories -----
  app.get('/api/categories', async () => {
    const { rows } = await query('select * from categories order by sort, name');
    return { categories: rows };
  });

  // ----- Products -----
  app.get('/api/products', async () => {
    const { rows } = await query(
      `select p.*, c.name as category_name, c.slug as category_slug
         from products p
         left join categories c on c.id = p.category_id
        order by p.name`,
    );
    return { products: rows };
  });

  app.get('/api/products/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { rows } = await query('select * from products where id = $1', [id]);
    if (!rows[0]) return reply.code(404).send({ error: 'ไม่พบสินค้า' });
    return { product: rows[0] };
  });

  app.post('/api/products', guard, async (req, reply) => {
    const b = (req.body ?? {}) as ProductBody;
    if (!b.name || !b.sku) return reply.code(400).send({ error: 'ต้องมีชื่อสินค้าและ SKU' });
    try {
      const { rows } = await query(
        `insert into products
           (category_id, name, sku, brand, model, cost, price, stock, low, warranty_months, image_url, notes, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         returning *`,
        [
          b.category_id ?? null, b.name, b.sku, b.brand ?? null, b.model ?? null,
          b.cost ?? 0, b.price ?? 0, b.stock ?? 0, b.low ?? 0, b.warranty_months ?? 0,
          b.image_url ?? null, b.notes ?? null, req.user!.id,
        ],
      );
      return reply.code(201).send({ product: rows[0] });
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        return reply.code(409).send({ error: 'SKU นี้มีอยู่แล้ว' });
      }
      throw err;
    }
  });

  app.put('/api/products/:id', guard, async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = (req.body ?? {}) as ProductBody;
    const { rows } = await query(
      `update products set
         category_id = $1, name = $2, sku = $3, brand = $4, model = $5,
         cost = $6, price = $7, stock = $8, low = $9, warranty_months = $10,
         image_url = $11, notes = $12, updated_at = now()
       where id = $13
       returning *`,
      [
        b.category_id ?? null, b.name, b.sku, b.brand ?? null, b.model ?? null,
        b.cost ?? 0, b.price ?? 0, b.stock ?? 0, b.low ?? 0, b.warranty_months ?? 0,
        b.image_url ?? null, b.notes ?? null, id,
      ],
    );
    if (!rows[0]) return reply.code(404).send({ error: 'ไม่พบสินค้า' });
    return { product: rows[0] };
  });

  app.delete('/api/products/:id', guard, async (req, reply) => {
    const { id } = req.params as { id: string };
    await query('delete from products where id = $1', [id]);
    return reply.code(204).send();
  });
}
