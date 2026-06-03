import type { FastifyInstance } from 'fastify';
import { query } from '../db';
import { requireAuth } from '../auth';

interface CategoryBody {
  name?: string;
  slug?: string;
  sort?: number;
}

/** Make a stable ascii slug; fall back to a unique code for Thai-only names. */
function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || `cat-${Date.now().toString(36)}`;
}

export async function categoryRoutes(app: FastifyInstance) {
  const guard = { preHandler: requireAuth() };

  // List with product counts (handy for the management screen).
  app.get('/api/categories', async () => {
    const { rows } = await query(
      `select c.*, coalesce(pc.n, 0)::int as product_count
         from categories c
         left join (select category_id, count(*) as n from products group by category_id) pc
           on pc.category_id = c.id
        order by c.sort, c.name`,
    );
    return { categories: rows };
  });

  app.post('/api/categories', guard, async (req, reply) => {
    const b = (req.body ?? {}) as CategoryBody;
    if (!b.name?.trim()) return reply.code(400).send({ error: 'ต้องระบุชื่อหมวดหมู่' });
    const slug = b.slug?.trim() || slugify(b.name);
    try {
      const { rows } = await query(
        'insert into categories (name, slug, sort) values ($1, $2, $3) returning *',
        [b.name.trim(), slug, b.sort ?? 0],
      );
      return reply.code(201).send({ category: rows[0] });
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        return reply.code(409).send({ error: 'หมวดหมู่นี้มีอยู่แล้ว' });
      }
      throw err;
    }
  });

  app.put('/api/categories/:id', guard, async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = (req.body ?? {}) as CategoryBody;
    if (!b.name?.trim()) return reply.code(400).send({ error: 'ต้องระบุชื่อหมวดหมู่' });
    try {
      const { rows } = await query(
        'update categories set name = $1, sort = coalesce($2, sort) where id = $3 returning *',
        [b.name.trim(), b.sort ?? null, id],
      );
      if (!rows[0]) return reply.code(404).send({ error: 'ไม่พบหมวดหมู่' });
      return { category: rows[0] };
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        return reply.code(409).send({ error: 'หมวดหมู่นี้มีอยู่แล้ว' });
      }
      throw err;
    }
  });

  // Deleting a category leaves its products uncategorised (FK on delete set null).
  app.delete('/api/categories/:id', guard, async (req, reply) => {
    const { id } = req.params as { id: string };
    await query('delete from categories where id = $1', [id]);
    return reply.code(204).send();
  });
}
