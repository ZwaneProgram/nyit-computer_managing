import { after, before, beforeEach, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwt from 'jsonwebtoken';
import { PGlite } from '@electric-sql/pglite';

// This suite must never connect to the shop database, even when server/.env exists.
process.env.DATABASE_URL = 'postgres://unused:unused@127.0.0.1:1/isolated_tests';
process.env.JWT_SECRET = 'isolated-sale-history-tests';
const { pool } = await import('../src/db');
const { saleHistoryRoutes } = await import('../src/routes/saleHistory');
const { saleRoutes } = await import('../src/routes/sales');
const { statsRoutes } = await import('../src/routes/stats');
const db = new PGlite();
const app = Fastify();
const cookies = { nyit_session: jwt.sign({ uid: 1 }, process.env.JWT_SECRET) };
const sql = (text: string, params?: unknown[]) => db.query<Record<string, any>>(text, params);

before(async () => {
  // Real PostgreSQL SQL/transactions in memory; only the pg transport is replaced.
  mock.method(pool, 'query', sql);
  mock.method(pool, 'connect', async () => ({ query: sql, release() {} }));
  await db.exec(await readFile(new URL('../src/schema.sql', import.meta.url), 'utf8'));
  await app.register(cookie);
  await app.register(saleRoutes);
  await app.register(saleHistoryRoutes);
  await app.register(statsRoutes);
  await app.ready();
});

beforeEach(async () => {
  await db.exec(`truncate users, products, bundles, sales, stock_movements restart identity cascade;
    insert into users (username, password_hash, role) values ('staff', 'unused', 'staff');
    insert into products (name, category_id) values ('GPU', 1), ('CPU', 2);
    insert into product_serials (product_id, serial, price, cost) values
      (1, 'GPU-1', 100.25, 60.10), (1, 'GPU-2', 100.25, 60.10),
      (2, 'CPU-1', 200.50, 100.20), (2, 'CPU-2', 200.50, 100.20);
    insert into bundles (name) values ('Computer');
    insert into bundle_items (bundle_id, product_id) values (1, 1), (1, 2);`);
});

after(async () => {
  await app.close();
  mock.restoreAll();
  await db.close();
  await pool.end();
});

async function checkout(bundle = false) {
  const res = await app.inject({ method: 'POST', url: '/api/sales', cookies,
    payload: bundle ? { kind: 'bundle', bundle_id: 1, bundle_qty: 2 } : { kind: 'item', items: [{ serial_id: 1 }, { serial_id: 3 }] } });
  assert.equal(res.statusCode, 201, res.body);
  return Number(res.json().sale.id);
}

async function detail(id: number) {
  const res = await app.inject({ method: 'GET', url: `/api/sales/${id}`, cookies });
  assert.equal(res.statusCode, 200, res.body);
  return res.json().sale;
}

function editPayload(sale: any) {
  return { revision: sale.revision, customer_name: 'New customer', customer_phone: '0812345678',
    customer_address: 'Bangkok', tax_id: null, shipping: 10.50, discount: 20.25,
    items: sale.items.map((line: any) => ({ id: Number(line.id), unit_price: Number(line.unit_price) })) };
}

async function remove(id: number, revision: string) {
  return app.inject({ method: 'DELETE', url: `/api/sales/${id}?revision=${revision}`, cookies });
}

test('all history detail/write endpoints require authentication', async () => {
  for (const method of ['GET', 'PUT', 'DELETE'] as const) {
    const res = await app.inject({ method, url: '/api/sales/1', ...(method === 'PUT' ? { payload: {} } : {}) });
    assert.equal(res.statusCode, 401);
  }
});

test('staff can edit a sale; money is exact and historical costs, date and stock are preserved', async () => {
  const id = await checkout();
  const original = await detail(id);
  const payload = editPayload(original);
  payload.items[0].unit_price = 120.35;
  await sql('update product_serials set cost = 999, price = 999');
  const res = await app.inject({ method: 'PUT', url: `/api/sales/${id}`, cookies, payload });
  assert.equal(res.statusCode, 200, res.body);
  const updated = await detail(id);
  assert.equal(Number(updated.subtotal), 320.85);
  assert.equal(Number(updated.total), 311.10);
  assert.equal(Number(updated.profit), 140.30);
  assert.equal(updated.customer_name, 'New customer');
  assert.equal(updated.created_at, original.created_at);
  assert.equal(updated.staff_id, original.staff_id);
  assert.notEqual(updated.revision, original.revision);
  assert.deepEqual(updated.units, original.units);
  assert.equal(Number(updated.items[0].unit_cost), 60.10);
  assert.equal((await sql("select count(*)::int n from product_serials where status = 'sold'")).rows[0].n, 2);
  assert.equal((await sql('select count(*)::int n from stock_movements')).rows[0].n, 2);
  const history = await app.inject({ url: '/api/sales?q=New%20customer', cookies });
  assert.equal(history.json().total, 1);
  assert.equal(Number(history.json().sales[0].total), 311.10);
  const stats = await app.inject({ url: '/api/stats', cookies });
  assert.equal(stats.statusCode, 200, stats.body);
  assert.equal(stats.json().totals.sales, 311.10);
  assert.equal(stats.json().totals.profit, 140.30);
});

test('bundle edits preserve set quantity and original cost, even if bundle is changed afterwards', async () => {
  const id = await checkout(true);
  const sale = await detail(id);
  assert.equal(sale.units.length, 4);
  await sql('delete from bundle_items where bundle_id = 1');
  const payload = editPayload(sale);
  payload.items[0].unit_price = 350.25;
  const res = await app.inject({ method: 'PUT', url: `/api/sales/${id}`, cookies, payload });
  assert.equal(res.statusCode, 200, res.body);
  const updated = await detail(id);
  assert.equal(Number(updated.items[0].qty), 2);
  assert.equal(Number(updated.subtotal), 700.50);
  assert.equal(Number(updated.total), 690.75);
  assert.equal(Number(updated.profit), 360.25); // Original checkout rounds bundle unit cost to 160.
});

test('invalid money, excess discount, duplicate/missing/foreign line IDs and malformed bodies are rejected', async () => {
  const id = await checkout();
  const sale = await detail(id);
  const good = editPayload(sale);
  const cases = [
    null, {}, { ...good, shipping: -1 }, { ...good, shipping: '10' },
    { ...good, shipping: 0.001 }, { ...good, shipping: 1e10 },
    { ...good, discount: 10000 }, { ...good, customer_name: {} },
    { ...good, items: [] }, { ...good, items: [good.items[0], good.items[0]] },
    { ...good, items: [{ ...good.items[0], id: 999 }, good.items[1]] },
    { ...good, items: [{ ...good.items[0], unit_price: -10 }, good.items[1]] },
    { ...good, revision: '' },
  ];
  for (const payload of cases) {
    const res = await app.inject({ method: 'PUT', url: `/api/sales/${id}`, cookies,
      headers: { 'content-type': 'application/json' }, payload: JSON.stringify(payload) });
    assert.equal(res.statusCode, 400, `${JSON.stringify(payload)}: ${res.body}`);
  }
  assert.deepEqual(await detail(id), sale);
});

test('stale edit and stale delete return 409 without overwriting the latest bill', async () => {
  const id = await checkout();
  const original = await detail(id);
  const payload = editPayload(original);
  const first = await app.inject({ method: 'PUT', url: `/api/sales/${id}`, cookies, payload });
  assert.equal(first.statusCode, 200, first.body);
  const second = await app.inject({ method: 'PUT', url: `/api/sales/${id}`, cookies, payload });
  assert.equal(second.statusCode, 409, second.body);
  assert.equal((await remove(id, original.revision)).statusCode, 409);
  assert.equal((await detail(id)).customer_name, 'New customer');
});

for (const bundle of [false, true]) {
  test(`deleting ${bundle ? 'bundle' : 'item'} sale restores exact stock once and removes sale from reports`, async () => {
    const id = await checkout(bundle);
    const sale = await detail(id);
    await sql('delete from bundle_items');
    const res = await remove(id, sale.revision);
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().restored_units, bundle ? 4 : 2);
    assert.equal((await sql("select count(*)::int n from product_serials where status = 'in_stock' and sale_id is null")).rows[0].n, 4);
    assert.equal((await sql('select count(*)::int n from sale_items')).rows[0].n, 0);
    assert.equal((await sql('select sum(delta)::int n from stock_movements')).rows[0].n, 0);
    assert.equal((await sql('select count(*)::int n from stock_movements where note is null')).rows[0].n, 0);
    const history = await app.inject({ url: '/api/sales', cookies });
    assert.equal(history.json().total, 0);
    const stats = await app.inject({ url: '/api/stats', cookies });
    assert.equal(stats.statusCode, 200, stats.body);
    assert.equal(stats.json().totals.sales, 0);
    assert.equal(stats.json().totals.profit, 0);
    assert.equal(stats.json().totals.inStockUnits, 4);
    assert.equal((await remove(id, sale.revision)).statusCode, 404);
    const next = await checkout();
    assert.notEqual(next, id); // Returned units can be sold again on a new bill.
  });
}

test('delete refuses inconsistent unit status without changing data', async () => {
  const id = await checkout();
  await sql("update product_serials set status = 'returned' where id = 1");
  const sale = await detail(id);
  const res = await remove(id, sale.revision);
  assert.equal(res.statusCode, 409, res.body);
  assert.equal((await sql('select count(*)::int n from sales')).rows[0].n, 1);
  assert.equal((await sql('select count(*)::int n from stock_movements')).rows[0].n, 2);
});

test('failure during delete rolls back stock restoration and movement records', async () => {
  const id = await checkout();
  const sale = await detail(id);
  await db.exec(`create function fail_sale_delete() returns trigger language plpgsql as $$ begin raise exception 'forced test failure'; end $$;
    create trigger fail_delete before delete on sales for each row execute function fail_sale_delete();`);
  try {
    const res = await remove(id, sale.revision);
    assert.equal(res.statusCode, 500);
    assert.deepEqual(await detail(id), sale);
    assert.equal((await sql("select count(*)::int n from product_serials where status = 'sold'")).rows[0].n, 2);
    assert.equal((await sql('select count(*)::int n from stock_movements')).rows[0].n, 2);
  } finally { await db.exec('drop trigger fail_delete on sales; drop function fail_sale_delete()'); }
});

test('failure updating bill totals rolls back all changed line prices', async () => {
  const id = await checkout();
  const sale = await detail(id);
  await db.exec(`create function fail_sale_update() returns trigger language plpgsql as $$ begin raise exception 'forced test failure'; end $$;
    create trigger fail_update before update on sales for each row execute function fail_sale_update();`);
  try {
    const payload = editPayload(sale);
    payload.items[0].unit_price = 333;
    const res = await app.inject({ method: 'PUT', url: `/api/sales/${id}`, cookies, payload });
    assert.equal(res.statusCode, 500);
    assert.deepEqual(await detail(id), sale);
  } finally { await db.exec('drop trigger fail_update on sales; drop function fail_sale_update()'); }
});

test('missing and malformed sale IDs return 404/400', async () => {
  for (const [id, status] of [['999', 404], ['invalid', 400], ['-1', 400]]) {
    assert.equal((await app.inject({ url: `/api/sales/${id}`, cookies })).statusCode, status);
    assert.equal((await remove(Number(id), '1')).statusCode, status);
  }
});

test('zero prices and loss-making corrections are allowed', async () => {
  const id = await checkout();
  const sale = await detail(id);
  const payload = { ...editPayload(sale), shipping: 0, discount: 0,
    items: sale.items.map((line: any) => ({ id: Number(line.id), unit_price: 0 })) };
  const res = await app.inject({ method: 'PUT', url: `/api/sales/${id}`, cookies, payload });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(Number(res.json().sale.total), 0);
  assert.equal(Number(res.json().sale.profit), -160.30);
});
