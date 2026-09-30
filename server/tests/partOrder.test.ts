import { after, before, beforeEach, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwt from 'jsonwebtoken';
import { PGlite } from '@electric-sql/pglite';

// This suite must never connect to the shop database, even when server/.env exists.
process.env.DATABASE_URL = 'postgres://unused:unused@127.0.0.1:1/isolated_tests';
process.env.JWT_SECRET = 'isolated-part-order-tests';
const { pool } = await import('../src/db');
const { bundleRoutes } = await import('../src/routes/bundles');
const { settingsRoutes } = await import('../src/routes/settings');
const db = new PGlite();
const app = Fastify();
const owner = { nyit_session: jwt.sign({ uid: 1 }, process.env.JWT_SECRET) };
const staff = { nyit_session: jwt.sign({ uid: 2 }, process.env.JWT_SECRET) };
const sql = (text: string, params?: unknown[]) => db.query<Record<string, any>>(text, params);
const schema = await readFile(new URL('../src/schema.sql', import.meta.url), 'utf8');

before(async () => {
  mock.method(pool, 'query', sql);
  mock.method(pool, 'connect', async () => ({ query: sql, release() {} }));
  await db.exec(schema);
  await app.register(cookie);
  await app.register(bundleRoutes);
  await app.register(settingsRoutes);
  await app.ready();
});

// Products 1..6 named A–F; categories chosen so that name order, id order and
// PC-build order all differ.
beforeEach(async () => {
  await db.exec(`truncate users, products, bundles restart identity cascade;
    update shop_settings set bundle_part_order = null;
    insert into users (username, password_hash, role) values ('owner', 'x', 'owner'), ('staff', 'x', 'staff');`);
  const parts: [string, string][] = [['A-PSU', 'psu'], ['B-VGA', 'gpu'], ['C-SSD', 'ssd'], ['D-RAM', 'ram'], ['E-BOARD', 'mb'], ['F-CPU', 'cpu']];
  for (const [name, slug] of parts) {
    await sql(`insert into products (name, category_id) select $1, id from categories where slug = $2`, [name, slug]);
  }
});

after(async () => {
  await app.close();
  mock.restoreAll();
  await db.close();
  await pool.end();
});

const names = async () => (await app.inject({ method: 'GET', url: '/api/bundles', cookies: owner })).json().bundles[0].items.map((i: any) => i.name);
const save = (ids: number[], id?: number, custom_order = true) => app.inject({ method: id ? 'PUT' : 'POST', url: id ? `/api/bundles/${id}` : '/api/bundles',
  cookies: owner, payload: { name: 'PC', custom_order, items: ids.map((product_id) => ({ product_id })) } });
const catIds = async () => Object.fromEntries((await sql('select slug, id from categories')).rows.map((r) => [r.slug, Number(r.id)]));
const setOrder = async (slugs: string[]) => {
  const ids = await catIds();
  return app.inject({ method: 'PUT', url: '/api/settings/bundle-part-order', cookies: owner, payload: { category_ids: slugs.map((s) => ids[s]) } });
};

test('a hand-arranged bundle keeps exactly the order it was saved in', async () => {
  assert.equal((await save([4, 1, 6, 2])).statusCode, 201);
  assert.deepEqual(await names(), ['D-RAM', 'A-PSU', 'F-CPU', 'B-VGA']);
});

test('re-saving a hand-arranged bundle in a new order changes the order', async () => {
  await save([4, 1, 6, 2]);
  assert.equal((await save([6, 4, 2, 1], 1)).statusCode, 200);
  assert.deepEqual(await names(), ['F-CPU', 'D-RAM', 'B-VGA', 'A-PSU']);
});

test('a bundle that follows settings is saved in the settings order, whatever order it was sent in', async () => {
  assert.equal((await save([4, 1, 6, 2], undefined, false)).statusCode, 201);
  assert.deepEqual(await names(), ['F-CPU', 'D-RAM', 'B-VGA', 'A-PSU']);
  const list = (await app.inject({ method: 'GET', url: '/api/bundles', cookies: owner })).json().bundles;
  assert.equal(list[0].custom_order, false);
});

test('changing the settings order re-sorts bundles that follow it, and leaves hand-arranged ones alone', async () => {
  await save([4, 1, 6, 2], undefined, false);
  await save([2, 6], undefined, true);
  assert.equal((await setOrder(['psu', 'gpu', 'cpu', 'ram'])).statusCode, 200);
  const list = (await app.inject({ method: 'GET', url: '/api/bundles', cookies: owner })).json().bundles;
  const byId = Object.fromEntries(list.map((b: any) => [Number(b.id), b.items.map((i: any) => i.name)]));
  assert.deepEqual(byId[1], ['A-PSU', 'B-VGA', 'F-CPU', 'D-RAM']);
  assert.deepEqual(byId[2], ['B-VGA', 'F-CPU']);
});

test('migration numbers existing parts in PC-build order and is re-runnable', async () => {
  await db.exec(`alter table bundle_items drop column sort;
    insert into bundles (name) values ('Old');
    insert into bundle_items (bundle_id, product_id) values (1, 1), (1, 2), (1, 3), (1, 4), (1, 5), (1, 6);`);
  await db.exec(schema);
  await db.exec(schema);
  assert.deepEqual(await names(), ['F-CPU', 'E-BOARD', 'D-RAM', 'C-SSD', 'B-VGA', 'A-PSU']);
});

test('part-order setting defaults to PC-build order and lists every category once', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/settings/bundle-part-order', cookies: staff });
  assert.equal(res.statusCode, 200, res.body);
  const slugs = res.json().categories.map((c: any) => c.slug);
  assert.deepEqual(slugs.slice(0, 6), ['cpu', 'mb', 'ram', 'ssd', 'gpu', 'psu']);
  const { rows } = await sql('select count(*)::int n from categories');
  assert.equal(slugs.length, rows[0].n);
  assert.equal(new Set(slugs).size, slugs.length);
});

test('owner can save a part order; staff cannot; unknown ids are dropped and missing ones appended', async () => {
  const cats = (await app.inject({ method: 'GET', url: '/api/settings/bundle-part-order', cookies: owner })).json().categories;
  const bySlug = Object.fromEntries(cats.map((c: any) => [c.slug, c.id]));
  const wanted = [bySlug.gpu, bySlug.cpu, 99999];
  assert.equal((await app.inject({ method: 'PUT', url: '/api/settings/bundle-part-order', cookies: staff, payload: { category_ids: wanted } })).statusCode, 403);
  const res = await app.inject({ method: 'PUT', url: '/api/settings/bundle-part-order', cookies: owner, payload: { category_ids: wanted } });
  assert.equal(res.statusCode, 200, res.body);
  const slugs = res.json().categories.map((c: any) => c.slug);
  assert.deepEqual(slugs.slice(0, 3), ['gpu', 'cpu', 'mb']);
  assert.equal(slugs.length, cats.length);
});
