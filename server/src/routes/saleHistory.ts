import type { FastifyInstance } from 'fastify';
import { pool, query } from '../db';
import { requireAuth } from '../auth';

interface EditSale {
  revision: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  tax_id: string | null;
  shipping: number;
  discount: number;
  items: { id: number; unit_price: number }[];
}

const validId = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const cents = (value: number) => Math.round(value * 100);
const validMoney = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 1e10 &&
  Math.abs(value * 100 - cents(value)) < 0.0001;
const validRevision = (value: unknown): value is string => typeof value === 'string' && /^\d+$/.test(value);
const customerKeys = ['customer_name', 'customer_phone', 'customer_address', 'tax_id'] as const;

function validEdit(value: unknown): value is EditSale {
  if (!value || typeof value !== 'object') return false;
  const b = value as EditSale;
  return validRevision(b.revision) && validMoney(b.shipping) && validMoney(b.discount) &&
    customerKeys.every((key) => b[key] === null || (typeof b[key] === 'string' && b[key]!.length <= 5000)) &&
    Array.isArray(b.items) && b.items.length > 0 &&
    b.items.every((line) => line && validId(line.id) && validMoney(line.unit_price)) &&
    new Set(b.items.map((line) => line.id)).size === b.items.length;
}

export async function saleHistoryRoutes(app: FastifyInstance) {
  const guard = { preHandler: requireAuth() };

  app.get('/api/sales/:id', guard, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!validId(id)) return reply.code(400).send({ error: 'เลขที่บิลไม่ถูกต้อง' });
    // One statement gives a consistent snapshot of the bill, lines and units.
    const { rows } = await query(
      `select s.*, s.xmin::text as revision,
              u.full_name as staff_name, u.username as staff_username,
              coalesce((select jsonb_agg(jsonb_build_object(
                'id', si.id, 'qty', si.qty, 'unit_price', si.unit_price, 'unit_cost', si.unit_cost,
                'name', coalesce(b.name, p.name, 'สินค้าที่ถูกลบ')) order by si.id)
                from sale_items si left join products p on p.id = si.product_id
                left join bundles b on b.id = si.bundle_id where si.sale_id = s.id), '[]'::jsonb) as items,
              coalesce((select jsonb_agg(jsonb_build_object(
                'id', ps.id, 'serial', ps.serial, 'sku', ps.sku, 'name', p.name) order by ps.id)
                from product_serials ps join products p on p.id = ps.product_id
                where ps.sale_id = s.id), '[]'::jsonb) as units
         from sales s left join users u on u.id = s.staff_id where s.id = $1`, [id],
    );
    if (!rows[0]) return reply.code(404).send({ error: 'ไม่พบบิลนี้ อาจถูกลบไปแล้ว' });
    return { sale: rows[0] };
  });

  app.put('/api/sales/:id', guard, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!validId(id) || !validEdit(req.body)) {
      return reply.code(400).send({ error: 'ข้อมูลไม่ถูกต้อง กรุณาระบุราคาเป็นจำนวนบวกหรือศูนย์ ทศนิยมไม่เกิน 2 ตำแหน่ง' });
    }
    const b = req.body;
    const client = await pool.connect();
    try {
      await client.query('begin');
      const { rows: sales } = await client.query('select xmin::text as revision from sales where id = $1 for update', [id]);
      if (!sales[0]) {
        await client.query('rollback');
        return reply.code(404).send({ error: 'ไม่พบบิลนี้ อาจถูกลบไปแล้ว' });
      }
      if (sales[0].revision !== b.revision) {
        await client.query('rollback');
        return reply.code(409).send({ error: 'บิลนี้ถูกแก้ไขแล้ว กรุณาปิดแล้วเปิดใหม่ก่อนบันทึก' });
      }
      const { rows: lines } = await client.query('select id, qty, unit_cost from sale_items where sale_id = $1 order by id for update', [id]);
      const prices = new Map(b.items.map((line) => [line.id, line.unit_price]));
      if (lines.length !== prices.size || lines.some((line) => !prices.has(Number(line.id)))) {
        await client.query('rollback');
        return reply.code(400).send({ error: 'รายการสินค้าไม่ตรงกับบิลเดิม กรุณาเปิดบิลใหม่อีกครั้ง' });
      }
      // Keep the original cost and quantities; catalogue prices may have changed since checkout.
      const subtotal = lines.reduce((sum, line) => sum + cents(prices.get(Number(line.id))!) * Number(line.qty), 0);
      const cost = lines.reduce((sum, line) => sum + cents(Number(line.unit_cost)) * Number(line.qty), 0);
      const total = subtotal + cents(b.shipping) - cents(b.discount);
      const profit = subtotal - cost - cents(b.discount);
      if (cents(b.discount) > subtotal || [subtotal, total, profit].some((n) => !Number.isSafeInteger(n) || Math.abs(n) >= 1e12)) {
        await client.query('rollback');
        return reply.code(400).send({ error: 'ส่วนลดต้องไม่เกินยอดสินค้า และยอดเงินต้องน้อยกว่า 10,000,000,000 บาท' });
      }
      for (const line of b.items) {
        await client.query('update sale_items set unit_price = $1 where id = $2 and sale_id = $3', [line.unit_price, line.id, id]);
      }
      const { rows } = await client.query(
        `update sales set customer_name = $1, customer_phone = $2, customer_address = $3, tax_id = $4,
          shipping = $5, discount = $6, subtotal = $7, total = $8, profit = $9
          where id = $10 returning *`,
        [...customerKeys.map((key) => b[key]?.trim() || null), b.shipping, b.discount, subtotal / 100, total / 100, profit / 100, id],
      );
      await client.query('commit');
      return { sale: rows[0] };
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
  });

  app.delete('/api/sales/:id', guard, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const revision = (req.query as { revision?: string }).revision;
    if (!validId(id) || !validRevision(revision)) return reply.code(400).send({ error: 'ข้อมูลบิลไม่ถูกต้อง กรุณาเปิดบิลใหม่อีกครั้ง' });
    const client = await pool.connect();
    try {
      await client.query('begin');
      const { rows: sales } = await client.query('select xmin::text as revision from sales where id = $1 for update', [id]);
      if (!sales[0]) {
        await client.query('rollback');
        return reply.code(404).send({ error: 'ไม่พบบิลนี้ อาจถูกลบไปแล้ว' });
      }
      if (sales[0].revision !== revision) {
        await client.query('rollback');
        return reply.code(409).send({ error: 'บิลนี้ถูกแก้ไขแล้ว กรุณาตรวจสอบบิลอีกครั้งก่อนลบ' });
      }
      // Restore the actual sold units, including bundle components, never today's bundle definition.
      const { rows: units } = await client.query('select id, product_id, status from product_serials where sale_id = $1 order by id for update', [id]);
      if (units.some((unit) => unit.status !== 'sold')) {
        await client.query('rollback');
        return reply.code(409).send({ error: 'สถานะสต๊อกของบิลนี้ไม่ตรงกัน กรุณาตรวจสอบก่อนลบ' });
      }
      await client.query("update product_serials set status = 'in_stock', sale_id = null where sale_id = $1", [id]);
      const restored = new Map<number, number>();
      for (const unit of units) restored.set(Number(unit.product_id), (restored.get(Number(unit.product_id)) ?? 0) + 1);
      // Keep stock movement history with the bill number after its FK is cleared by deletion.
      await client.query("update stock_movements set note = concat_ws(' · ', nullif(note, ''), $2::text) where ref_sale_id = $1", [id, `ลบบิล #${id}`]);
      for (const [productId, qty] of restored) {
        await client.query(
          "insert into stock_movements (product_id, delta, reason, note, created_by) values ($1, $2, 'adjustment', $3, $4)",
          [productId, qty, `คืนสต๊อกจากการลบบิล #${id}`, req.user!.id],
        );
      }
      await client.query('delete from sales where id = $1', [id]);
      await client.query('commit');
      return { ok: true, restored_units: units.length };
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
  });
}
