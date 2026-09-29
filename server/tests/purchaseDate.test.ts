import { after, before, beforeEach, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwt from 'jsonwebtoken';
import { PGlite } from '@electric-sql/pglite';

// This suite must never connect to the shop database, even when server/.env exists.
process.env.DATABASE_URL = 'postgres://unused:unused@127.0.0.1:1/isolated_tests';
process.env.JWT_SECRET = 'isolated-purchase-date-tests';
const { pool } = await import('../src/db');
const { productRoutes } = await import('../src/routes/products');
const db = new PGlite();
const app = Fastify();
const cookies = { nyit_session: jwt.sign({ uid: 1 }, process.env.JWT_SECRET) };
const sql = (text: string, params?: unknown[]) => db.query<Record<string, any>>(text, params);
const schema = await readFile(new URL('../src/schema.sql', import.meta.url), 'utf8');
const bangkokToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });

before(async () => {
  mock.method(pool, 'query', sql);
  mock.method(pool, 'connect', async () => ({ query: sql, release() {} }));
  await db.exec(schema);
  await app.register(cookie);
  await app.register(productRoutes);
  await app.ready();
});

beforeEach(async () => {
  await db.exec(`truncate users, products restart identity cascade;
    insert into users (username, password_hash, role) values ('staff', 'unused', 'staff');
    insert into products (name, category_id) values ('GPU', 1), ('CPU', 2);`);
});

after(async () => {
  await app.close();
  mock.restoreAll();
  await db.close();
  await pool.end();
});

async function addUnit(productId: number, unit: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: `/api/products/${productId}/serials`, cookies, payload: { units: [unit] } });
}

test('a unit keeps the purchase date it was given', async () => {
  const res = await addUnit(1, { serial: 'GPU-1', purchased_at: '2026-01-15' });
  assert.equal(res.statusCode, 201, res.body);
  assert.equal(res.json().serials[0].purchased_at, '2026-01-15');
});

test('a unit without a purchase date defaults to today in Bangkok', async () => {
  const res = await addUnit(1, { serial: 'GPU-1' });
  assert.equal(res.statusCode, 201, res.body);
  assert.equal(res.json().serials[0].purchased_at, bangkokToday());
});

test('a future purchase date is rejected', async () => {
  const res = await addUnit(1, { serial: 'GPU-1', purchased_at: '2999-01-01' });
  assert.equal(res.statusCode, 400, res.body);
  const { rows } = await sql('select count(*)::int as n from product_serials');
  assert.equal(rows[0].n, 0);
});

test('creating a product with units stores each purchase date', async () => {
  const res = await app.inject({ method: 'POST', url: '/api/products', cookies,
    payload: { name: 'RAM', units: [{ serial: 'RAM-1', purchased_at: '2026-03-01' }, { serial: 'RAM-2' }] } });
  assert.equal(res.statusCode, 201, res.body);
  const detail = await app.inject({ method: 'GET', url: `/api/products/${res.json().product.id}`, cookies });
  assert.deepEqual(detail.json().serials.map((s: any) => s.purchased_at), ['2026-03-01', bangkokToday()]);
});

test('editing a unit changes its purchase date, and keeps it when omitted', async () => {
  const id = (await addUnit(1, { serial: 'GPU-1', purchased_at: '2026-01-15' })).json().serials[0].id;
  let res = await app.inject({ method: 'PUT', url: `/api/serials/${id}`, cookies, payload: { serial: 'GPU-1', purchased_at: '2026-02-20' } });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(res.json().serial.purchased_at, '2026-02-20');
  res = await app.inject({ method: 'PUT', url: `/api/serials/${id}`, cookies, payload: { serial: 'GPU-1', price: 500 } });
  assert.equal(res.json().serial.purchased_at, '2026-02-20');
  res = await app.inject({ method: 'PUT', url: `/api/serials/${id}`, cookies, payload: { serial: 'GPU-1', purchased_at: '2999-01-01' } });
  assert.equal(res.statusCode, 400, res.body);
});

test('the inventory date filter uses purchase date, not entry date', async () => {
  await addUnit(1, { serial: 'GPU-1', purchased_at: '2026-01-10' });
  await addUnit(1, { serial: 'GPU-2', purchased_at: '2026-01-31' });
  await addUnit(2, { serial: 'CPU-1', purchased_at: '2026-02-01' });
  const res = await app.inject({ method: 'GET', url: '/api/products?from=2026-01-01&to=2026-01-31', cookies });
  const rows = res.json().products;
  assert.deepEqual(rows.map((p: any) => [p.name, p.added_in_range]), [['GPU', 2]]);
});

test('migration backfills purchase date from the Bangkok entry date and is re-runnable', async () => {
  await db.exec(`alter table product_serials drop column purchased_at;
    insert into product_serials (product_id, serial, created_at) values (1, 'OLD-1', '2026-04-30T18:30:00Z');`);
  await db.exec(schema);
  await db.exec(schema);
  const { rows } = await sql(`select to_char(purchased_at, 'YYYY-MM-DD') as d from product_serials where serial = 'OLD-1'`);
  assert.equal(rows[0].d, '2026-05-01');
});
