import type { FastifyInstance } from 'fastify';
import { pool, query } from '../db';
import { requireAuth } from '../auth';

interface SaleBody {
  kind?: 'item' | 'bundle';
  items?: { serial_id: number }[];
  bundle_id?: number;
  bundle_qty?: number;
  /** Explicit units chosen at checkout (one per component; used when qty = 1). */
  serials?: number[];
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  tax_id?: string | null;
  shipping?: number;
  discount?: number;
}

const num = (v: unknown): number => (v == null ? 0 : Number(v));

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

      // Each line = one specific unit (item) or one bundle set.
      const lines: { product_id: number | null; bundle_id: number | null; qty: number; unit_price: number; unit_cost: number }[] = [];
      const soldSerialIds: number[] = [];           // serials to flip -> sold
      const movements: { product_id: number; delta: number }[] = [];

      if (kind === 'item') {
        const ids = (b.items ?? []).map((i) => Number(i.serial_id)).filter((n) => Number.isFinite(n));
        if (!ids.length) { await client.query('rollback'); return reply.code(400).send({ error: 'ยังไม่มีรายการสินค้า' }); }
        for (const sid of ids) {
          const { rows } = await client.query(
            'select id, product_id, price, cost, status from product_serials where id = $1 for update',
            [sid],
          );
          const u = rows[0];
          if (!u) { await client.query('rollback'); return reply.code(400).send({ error: 'มีหน่วยสินค้าที่ไม่อยู่ในระบบ' }); }
          if (u.status !== 'in_stock') {
            await client.query('rollback');
            return reply.code(409).send({ error: 'มีหน่วยสินค้าที่ถูกขายไปแล้ว — รีเฟรชแล้วลองใหม่' });
          }
          lines.push({ product_id: Number(u.product_id), bundle_id: null, qty: 1, unit_price: num(u.price), unit_cost: num(u.cost) });
          soldSerialIds.push(Number(u.id));
          movements.push({ product_id: Number(u.product_id), delta: -1 });
        }
      } else {
        const bundleId = Number(b.bundle_id);
        const setQty = Math.max(1, Number(b.bundle_qty) || 1);
        if (!bundleId) { await client.query('rollback'); return reply.code(400).send({ error: 'ยังไม่ได้เลือกชุดสินค้า' }); }
        const { rows: brow } = await client.query('select id, discount_pct from bundles where id = $1', [bundleId]);
        if (!brow[0]) { await client.query('rollback'); return reply.code(400).send({ error: 'ไม่พบชุดสินค้า' }); }
        const { rows: comps } = await client.query('select product_id, serial_id from bundle_items where bundle_id = $1', [bundleId]);
        if (!comps.length) { await client.query('rollback'); return reply.code(400).send({ error: 'ชุดสินค้านี้ไม่มีสินค้า' }); }

        // Explicit per-component units chosen at checkout (qty = 1 path). When the
        // client sends them, honor exactly those; otherwise auto-pick per component
        // (pinned unit first if still in stock, then FIFO).
        const explicit = Array.isArray(b.serials) ? b.serials.map(Number).filter(Number.isFinite) : [];
        let listTotal = 0, costTotal = 0;

        if (explicit.length) {
          if (setQty !== 1) { await client.query('rollback'); return reply.code(400).send({ error: 'เลือกชิ้นเองได้เฉพาะตอนขายทีละชุด' }); }
          const { rows: picks } = await client.query(
            `select id, product_id, price, cost, status from product_serials where id = any($1) for update`,
            [explicit],
          );
          const byId = new Map((picks as Record<string, unknown>[]).map((r) => [Number(r.id), r]));
          const needed = new Map<number, number>();          // product_id -> count still to cover
          for (const c of comps) needed.set(Number(c.product_id), (needed.get(Number(c.product_id)) ?? 0) + 1);
          for (const sid of explicit) {
            const u = byId.get(sid);
            if (!u || u.status !== 'in_stock') { await client.query('rollback'); return reply.code(409).send({ error: 'มีชิ้นที่เลือกถูกขายไปแล้ว — รีเฟรชแล้วลองใหม่' }); }
            const pid = Number(u.product_id);
            if (!needed.get(pid)) { await client.query('rollback'); return reply.code(400).send({ error: 'ชิ้นที่เลือกไม่ตรงกับสินค้าในชุด' }); }
            needed.set(pid, needed.get(pid)! - 1);
            listTotal += num(u.price); costTotal += num(u.cost); soldSerialIds.push(sid);
            movements.push({ product_id: pid, delta: -1 });
          }
          for (const [, n] of needed) {
            if (n > 0) { await client.query('rollback'); return reply.code(400).send({ error: 'เลือกชิ้นให้ครบทุกสินค้าในชุด' }); }
          }
        } else {
          for (const c of comps) {
            const pid = Number(c.product_id);
            const pinId = c.serial_id == null ? null : Number(c.serial_id);
            const chosen: Record<string, unknown>[] = [];
            // Prefer the pinned unit when it is still in stock.
            if (pinId != null) {
              const { rows: pin } = await client.query(
                `select id, price, cost from product_serials where id = $1 and status = 'in_stock' for update`,
                [pinId],
              );
              if (pin[0]) chosen.push(pin[0] as Record<string, unknown>);
            }
            // Fill the rest FIFO, skipping the pinned unit already taken.
            const remaining = setQty - chosen.length;
            if (remaining > 0) {
              const { rows: picks } = await client.query(
                `select id, price, cost from product_serials
                   where product_id = $1 and status = 'in_stock' and id <> all($2)
                   order by created_at, id limit $3 for update`,
                [pid, chosen.map((c2) => Number(c2.id)), remaining],
              );
              chosen.push(...(picks as Record<string, unknown>[]));
            }
            if (chosen.length < setQty) {
              const { rows: p } = await client.query('select name from products where id = $1', [pid]);
              await client.query('rollback');
              return reply.code(409).send({ error: `สต๊อกไม่พอสำหรับ "${p[0]?.name ?? `#${pid}`}" ในชุดสินค้า` });
            }
            for (const pk of chosen) { listTotal += num(pk.price); costTotal += num(pk.cost); soldSerialIds.push(Number(pk.id)); }
            movements.push({ product_id: pid, delta: -setQty });
          }
        }
        const discounted = Math.round(listTotal * (1 - num(brow[0].discount_pct) / 100));
        lines.push({
          product_id: null, bundle_id: bundleId, qty: setQty,
          unit_price: Math.round(discounted / setQty), unit_cost: Math.round(costTotal / setQty),
        });
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
      if (soldSerialIds.length) {
        await client.query("update product_serials set status = 'sold', sale_id = $2 where id = any($1)", [soldSerialIds, Number(sale.id)]);
      }
      for (const m of movements) {
        await client.query(
          "insert into stock_movements (product_id, delta, reason, ref_sale_id, created_by) values ($1, $2, 'sale', $3, $4)",
          [m.product_id, m.delta, Number(sale.id), userId],
        );
      }

      await client.query('commit');
      return reply.code(201).send({ sale });
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
  });
}
