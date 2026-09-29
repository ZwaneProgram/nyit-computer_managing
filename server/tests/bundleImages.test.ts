import { after, before, beforeEach, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwt from 'jsonwebtoken';
import { PGlite } from '@electric-sql/pglite';

// This suite must never connect to the shop database, even when server/.env exists.
process.env.DATABASE_URL = 'postgres://unused:unused@127.0.0.1:1/isolated_tests';
process.env.JWT_SECRET = 'isolated-bundle-image-tests';
const { pool } = await import('../src/db');
const { bundleRoutes } = await import('../src/routes/bundles');
const { productRoutes } = await import('../src/routes/products');
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
  await app.register(productRoutes);
  await app.ready();
});

beforeEach(async () => {
  // GPU: cheap unit has no photo, dearer unit has one, sold unit has another.
  // CPU: no photos at all.
  await db.exec(`truncate users, products, bundles, sales, stock_movements restart identity cascade;
    insert into users (username, password_hash, role) values ('staff', 'unused', 'staff');
    insert into products (name, category_id) values ('GPU', 1), ('CPU', 2);
    insert into product_serials (product_id, serial, price, image_url, status) values
      (1, 'GPU-1', 100, null, 'in_stock'),
      (1, 'GPU-2', 200, '/uploads/gpu-2.jpg', 'in_stock'),
      (1, 'GPU-3', 50, '/uploads/gpu-sold.jpg', 'sold'),
      (2, 'CPU-1', 300, null, 'in_stock');`);
});

after(async () => {
  await app.close();
  mock.restoreAll();
  await db.close();
  await pool.end();
});

const products = async () => (await app.inject({ method: 'GET', url: '/api/products', cookies })).json().products;
const bundles = async () => (await app.inject({ method: 'GET', url: '/api/bundles', cookies })).json().bundles;

test('product list carries a photo from an in-stock unit, or null when none has one', async () => {
  const byName = Object.fromEntries((await products()).map((p: any) => [p.name, p.image_url]));
  assert.equal(byName.GPU, '/uploads/gpu-2.jpg');
  assert.equal(byName.CPU, null);
});

test('bundle components carry an in-stock unit photo', async () => {
  await db.exec(`insert into bundles (name) values ('PC'); insert into bundle_items (bundle_id, product_id) values (1, 1), (1, 2);`);
  const items = (await bundles())[0].items;
  assert.equal(items.find((i: any) => i.name === 'GPU').image_url, '/uploads/gpu-2.jpg');
  assert.equal(items.find((i: any) => i.name === 'CPU').image_url, null);
});

test('a pinned in-stock unit shows its own photo', async () => {
  await sql(`update product_serials set image_url = '/uploads/gpu-1.jpg' where serial = 'GPU-1'`);
  await db.exec(`insert into bundles (name) values ('PC'); insert into bundle_items (bundle_id, product_id, serial_id) values (1, 1, 2);`);
  assert.equal((await bundles())[0].items[0].image_url, '/uploads/gpu-2.jpg');
  await sql(`update bundle_items set serial_id = 1`);
  assert.equal((await bundles())[0].items[0].image_url, '/uploads/gpu-1.jpg');
});
