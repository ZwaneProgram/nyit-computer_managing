import { after, before, beforeEach, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwt from 'jsonwebtoken';
import { PGlite } from '@electric-sql/pglite';

// This suite must never connect to the shop database, even when server/.env exists.
process.env.DATABASE_URL = 'postgres://unused:unused@127.0.0.1:1/isolated_tests';
process.env.JWT_SECRET = 'isolated-bundle-discount-tests';
const { pool } = await import('../src/db');
const { bundleRoutes } = await import('../src/routes/bundles');
const { saleRoutes } = await import('../src/routes/sales');
const { bundlePrice } = await import('../src/lib/bundlePrice');
const db = new PGlite();
const app = Fastify();
const cookies = { nyit_session: jwt.sign({ uid: 1 }, process.env.JWT_SECRET) };
const sql = (text: string, params?: unknown[]) => db.query<Record<string, any>>(text, params);

before(async () => {
  mock.method(pool, 'query', sql);
  mock.method(pool, 'connect', async () => ({ query: sql, release() {} }));
  await db.exec(await readFile(new URL('../src/schema.sql', import.meta.url), 'utf8'));
  await app.register(cookie);
  await app.register(bundleRoutes);
  await app.register(saleRoutes);
  await app.ready();
});

beforeEach(async () => {
  await db.exec(`truncate users, products, bundles, sales, stock_movements restart identity cascade;
    insert into users (username, password_hash, role) values ('staff', 'unused', 'staff');
    insert into products (name, category_id) values ('GPU', 1), ('CPU', 2);
    insert into product_serials (product_id, serial, price, cost) values
      (1, 'GPU-1', 6000, 5000), (1, 'GPU-2', 6000, 5000),
      (2, 'CPU-1', 4000, 3000), (2, 'CPU-2', 4000, 3000);`);
});

after(async () => {
  await app.close();
  mock.restoreAll();
  await db.close();
  await pool.end();
});

async function saveBundle(body: Record<string, unknown>, id?: number) {
  return app.inject({ method: id ? 'PUT' : 'POST', url: id ? `/api/bundles/${id}` : '/api/bundles', cookies,
    payload: { name: 'PC', items: [{ product_id: 1 }, { product_id: 2 }], ...body } });
}

async function sellBundle(qty: number) {
  const res = await app.inject({ method: 'POST', url: '/api/sales', cookies, payload: { kind: 'bundle', bundle_id: 1, bundle_qty: qty } });
  assert.equal(res.statusCode, 201, res.body);
  const { rows } = await sql('select unit_price::float as unit_price, qty from sale_items where sale_id = $1', [res.json().sale.id]);
  return rows[0];
}

test('bundlePrice applies percent, then baht, and never goes below zero', () => {
  assert.equal(bundlePrice(10000, 10, 0), 9000);
  assert.equal(bundlePrice(10000, 0, 500), 9500);
  assert.equal(bundlePrice(10000, 0, 0), 10000);
  assert.equal(bundlePrice(10000, 100, 0), 0);
  assert.equal(bundlePrice(300, 0, 500), 0);
});

test('a bundle can be saved with a baht discount and returns it', async () => {
  const res = await saveBundle({ discount_pct: 0, discount_thb: 500 });
  assert.equal(res.statusCode, 201, res.body);
  const list = (await app.inject({ method: 'GET', url: '/api/bundles', cookies })).json().bundles;
  assert.equal(Number(list[0].discount_thb), 500);
  assert.equal(Number(list[0].discount_pct), 0);
});

test('percent is clamped to 0–100 and baht to >= 0', async () => {
  await saveBundle({ discount_pct: 150, discount_thb: -20 });
  let { rows } = await sql('select discount_pct::float p, discount_thb::float t from bundles');
  assert.deepEqual([rows[0].p, rows[0].t], [100, 0]);
  await saveBundle({ discount_pct: -5, discount_thb: 250 }, 1);
  ({ rows } = await sql('select discount_pct::float p, discount_thb::float t from bundles'));
  assert.deepEqual([rows[0].p, rows[0].t], [0, 250]);
});

test('selling a baht-discount bundle charges list price minus baht, per set', async () => {
  await saveBundle({ discount_thb: 500 });
  const line = await sellBundle(2);
  assert.equal(line.qty, 2);
  assert.equal(line.unit_price, 10000 - 500);
});

test('selling a percent-discount bundle is unchanged', async () => {
  await saveBundle({ discount_pct: 10 });
  const line = await sellBundle(1);
  assert.equal(line.unit_price, 9000);
});

test('bundlePrice adds the assembly fee after the discount', () => {
  assert.equal(bundlePrice(10000, 10, 0, 500), 9500);
  assert.equal(bundlePrice(10000, 0, 500, 300), 9800);
  assert.equal(bundlePrice(300, 0, 500, 200), 200);
});

test('assembly fee is saved (clamped >= 0) and charged per set as profit', async () => {
  let res = await saveBundle({ discount_thb: 500, assembly_fee: -50 });
  let { rows } = await sql('select assembly_fee::float f from bundles');
  assert.equal(rows[0].f, 0);
  res = await saveBundle({ discount_thb: 500, assembly_fee: 300 }, 1);
  assert.equal(res.statusCode, 200, res.body);
  const line = await sellBundle(2);
  assert.equal(line.unit_price, 10000 - 500 + 300);
  ({ rows } = await sql('select unit_cost::float c from sale_items'));
  assert.equal(rows[0].c, 8000);
});

test('existing bundles migrate with a zero baht discount', async () => {
  await saveBundle({ discount_pct: 5 });
  const { rows } = await sql('select discount_thb::float t from bundles');
  assert.equal(rows[0].t, 0);
});
