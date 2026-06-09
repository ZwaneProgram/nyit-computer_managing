# Per-item Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move SKU, cost, price, warranty, note, and image from the product (catalog) down to each physical unit (`product_serials`), so two units of the same model can differ; the Sales screen sells a chosen unit.

**Architecture:** `products` stays the catalog (name/category/brand/model/reorder/note). `product_serials` becomes the item, carrying its own sku/cost/price/warranty/note/image. Stock is still the derived count of in_stock units. Sales picks specific serial ids. Bundles keep working off a representative unit price (UI overhaul deferred).

**Tech Stack:** Fastify + node-postgres (server, run via tsx), Vite + React + TS (client). No unit-test framework in this repo — verification is `tsc -b`, `npm run build`, and curl/manual smoke tests, matching existing practice.

**Verification baseline (run from repo root unless noted):**
- Backend typecheck: `cd server && npx tsc --noEmit`
- Frontend typecheck + build: `npm run build`
- Migrate (shared VPS DB via SSH tunnel on localhost:5433): `cd server && npm run migrate`

---

## Task 1: Schema — move columns to product_serials

**Files:**
- Modify: `server/src/schema.sql`

- [ ] **Step 1: Edit `create table products`** — remove the moved columns. The block becomes:

```sql
create table if not exists products (
  id              bigint generated always as identity primary key,
  category_id     bigint references categories(id) on delete set null,
  name            text not null,
  brand           text,
  model           text,
  low             int not null default 0,
  notes           text,
  status          text not null default 'active' check (status in ('active', 'draft')),
  created_by      bigint references users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
```

Delete the line `create unique index if not exists uniq_products_sku on products(sku) where sku is not null;` and its comment.

- [ ] **Step 2: Edit `create table product_serials`** — add the per-item columns:

```sql
create table if not exists product_serials (
  id              bigint generated always as identity primary key,
  product_id      bigint not null references products(id) on delete cascade,
  serial          text not null unique,
  sku             text,
  cost            numeric(12,2) not null default 0,
  price           numeric(12,2) not null default 0,
  warranty_months int not null default 0,
  note            text,
  image_url       text,
  status          text not null default 'in_stock' check (status in ('in_stock', 'sold', 'returned')),
  sale_id         bigint,
  created_at      timestamptz not null default now()
);
```

- [ ] **Step 3: Add the converge block** (place it right after the existing `alter table product_serials add column if not exists created_at ...` line). This handles already-populated databases:

```sql
-- Per-item inventory (2026-06-09): move sku/cost/price/warranty/image from the
-- catalog (products) down to each unit (product_serials). Idempotent.
alter table product_serials add column if not exists sku             text;
alter table product_serials add column if not exists cost            numeric(12,2) not null default 0;
alter table product_serials add column if not exists price           numeric(12,2) not null default 0;
alter table product_serials add column if not exists warranty_months int not null default 0;
alter table product_serials add column if not exists note            text;
alter table product_serials add column if not exists image_url       text;
create unique index if not exists uniq_serials_sku on product_serials(sku) where sku is not null;

-- One-time copy of catalog values onto units, BEFORE dropping the columns.
-- Only fills zero/null so re-runs never clobber per-unit edits. Guarded so it
-- no-ops once products no longer has the columns. SKU is intentionally NOT
-- copied (would collide with the per-unit unique index).
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_name = 'products' and column_name = 'price') then
    update product_serials ps set
      cost            = case when ps.cost = 0 then p.cost else ps.cost end,
      price           = case when ps.price = 0 then p.price else ps.price end,
      warranty_months = case when ps.warranty_months = 0 then p.warranty_months else ps.warranty_months end,
      image_url       = coalesce(ps.image_url, p.image_url)
    from products p where p.id = ps.product_id;
  end if;
end $$;

-- Drop the moved columns from the catalog.
drop index if exists uniq_products_sku;
alter table products drop column if exists sku;
alter table products drop column if exists cost;
alter table products drop column if exists price;
alter table products drop column if exists warranty_months;
alter table products drop column if exists image_url;
```

- [ ] **Step 4: Run migrate**

Run: `cd server && npm run migrate`
Expected: completes without error ("schema applied" or equivalent). Re-run once to confirm idempotency (still no error).

- [ ] **Step 5: Commit**

```bash
git add server/src/schema.sql
git commit -m "feat(db): move sku/cost/price/warranty/note/image to product_serials"
```

---

## Task 2: Backend — products route (catalog + per-item units)

**Files:**
- Modify: `server/src/routes/products.ts`

- [ ] **Step 1: Replace `ProductBody` + `cleanSerials` + `conflictMessage` + `PRODUCT_SELECT`** with:

```ts
interface UnitInput {
  serial?: string;
  sku?: string | null;
  cost?: number;
  price?: number;
  warranty_months?: number;
  note?: string | null;
  image_url?: string | null;
}
interface ProductBody {
  category_id?: number | null;
  name?: string;
  brand?: string | null;
  model?: string | null;
  low?: number;
  notes?: string | null;
  status?: 'active' | 'draft';
  /** Physical units to create alongside the catalog (create only). */
  units?: UnitInput[];
}

/** Clean a unit list: trim serials, drop blank-serial rows, de-dupe by serial. */
function cleanUnits(input: unknown): Required<Pick<UnitInput, 'serial'>> & UnitInput[] extends never ? UnitInput[] : UnitInput[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: UnitInput[] = [];
  for (const raw of input) {
    const u = (raw ?? {}) as UnitInput;
    const serial = String(u.serial ?? '').trim();
    if (!serial) continue;
    const key = serial.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      serial,
      sku: u.sku?.toString().trim() || null,
      cost: Number(u.cost) || 0,
      price: Number(u.price) || 0,
      warranty_months: Number(u.warranty_months) || 0,
      note: u.note?.toString().trim() || null,
      image_url: u.image_url ?? null,
    });
  }
  return out;
}

function conflictMessage(err: unknown): string | null {
  const e = err as { code?: string; constraint?: string };
  if (e.code !== '23505') return null;
  if (e.constraint === 'product_serials_serial_key') return 'มี Serial Number นี้อยู่แล้ว';
  if (e.constraint === 'uniq_serials_sku') return 'SKU นี้มีอยู่แล้ว';
  return 'ข้อมูลซ้ำกับที่มีอยู่แล้ว';
}

// Catalog + category + derived stock + price range + in-stock cost total.
const PRODUCT_SELECT = `
  select p.*, c.name as category_name, c.slug as category_slug,
         coalesce(s.in_stock, 0)::int as stock,
         s.price_min, s.price_max, coalesce(s.stock_cost, 0) as stock_cost
    from products p
    left join categories c on c.id = p.category_id
    left join (
      select product_id,
             count(*) filter (where status = 'in_stock') as in_stock,
             min(price) filter (where status = 'in_stock') as price_min,
             max(price) filter (where status = 'in_stock') as price_max,
             sum(cost)  filter (where status = 'in_stock') as stock_cost
        from product_serials group by product_id
    ) s on s.product_id = p.id`;
```

> Note: simplify the `cleanUnits` return type to just `UnitInput[]` — drop the convoluted conditional. Final signature: `function cleanUnits(input: unknown): UnitInput[]`.

- [ ] **Step 2: Update the unit columns in `GET /api/products/:id`** serial select:

```ts
const { rows: serials } = await query(
  `select id, serial, sku, status, cost, price, warranty_months, note, image_url, sale_id, created_at
     from product_serials where product_id = $1 order by created_at, id`,
  [id],
);
```

- [ ] **Step 3: Rewrite `POST /api/products`** (catalog insert + units insert, no SKU requirement):

```ts
app.post('/api/products', guard, async (req, reply) => {
  const b = (req.body ?? {}) as ProductBody;
  const status = b.status === 'draft' ? 'draft' : 'active';
  if (!b.name?.trim()) return reply.code(400).send({ error: 'ต้องระบุชื่อสินค้า' });
  const units = cleanUnits(b.units);

  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query(
      `insert into products (category_id, name, brand, model, low, notes, status, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
      [b.category_id ?? null, b.name.trim(), b.brand ?? null, b.model ?? null,
       b.low ?? 0, b.notes ?? null, status, req.user!.id],
    );
    const product = rows[0];
    for (const u of units) {
      await client.query(
        `insert into product_serials (product_id, serial, sku, cost, price, warranty_months, note, image_url)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [product.id, u.serial, u.sku, u.cost, u.price, u.warranty_months, u.note, u.image_url],
      );
    }
    await client.query('commit');
    return reply.code(201).send({ product: { ...product, stock: units.length } });
  } catch (err) {
    await client.query('rollback');
    const msg = conflictMessage(err);
    if (msg) return reply.code(409).send({ error: msg });
    throw err;
  } finally {
    client.release();
  }
});
```

- [ ] **Step 4: Rewrite `PUT /api/products/:id`** (catalog fields only, no SKU requirement):

```ts
app.put('/api/products/:id', guard, async (req, reply) => {
  const { id } = req.params as { id: string };
  const b = (req.body ?? {}) as ProductBody;
  if (!b.name?.trim()) return reply.code(400).send({ error: 'ต้องระบุชื่อสินค้า' });
  const status = b.status === 'draft' ? 'draft' : 'active';
  const { rows } = await query(
    `update products set category_id = $1, name = $2, brand = $3, model = $4,
       low = $5, notes = $6, status = $7, updated_at = now()
     where id = $8 returning *`,
    [b.category_id ?? null, b.name.trim(), b.brand ?? null, b.model ?? null,
     b.low ?? 0, b.notes ?? null, status, id],
  );
  if (!rows[0]) return reply.code(404).send({ error: 'ไม่พบสินค้า' });
  return { product: rows[0] };
});
```

- [ ] **Step 5: Rewrite `POST /api/products/:id/serials`** to accept unit objects:

```ts
app.post('/api/products/:id/serials', guard, async (req, reply) => {
  const { id } = req.params as { id: string };
  const units = cleanUnits((req.body as { units?: UnitInput[] })?.units);
  if (!units.length) return reply.code(400).send({ error: 'ต้องระบุ Serial Number อย่างน้อยหนึ่งรายการ' });

  const { rows: exists } = await query('select 1 from products where id = $1', [id]);
  if (!exists[0]) return reply.code(404).send({ error: 'ไม่พบสินค้า' });

  const client = await pool.connect();
  try {
    await client.query('begin');
    const added = [];
    for (const u of units) {
      const { rows } = await client.query(
        `insert into product_serials (product_id, serial, sku, cost, price, warranty_months, note, image_url)
         values ($1,$2,$3,$4,$5,$6,$7,$8)
         returning id, serial, sku, status, cost, price, warranty_months, note, image_url, created_at`,
        [id, u.serial, u.sku, u.cost, u.price, u.warranty_months, u.note, u.image_url],
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
```

- [ ] **Step 6: Add `PUT /api/serials/:serialId`** (edit one unit; block edits to sold units), placed just above the DELETE serial handler:

```ts
app.put('/api/serials/:serialId', guard, async (req, reply) => {
  const { serialId } = req.params as { serialId: string };
  const u = cleanUnits([{ ...(req.body as UnitInput), serial: (req.body as UnitInput)?.serial }])[0];
  if (!u) return reply.code(400).send({ error: 'ต้องระบุ Serial Number' });
  const { rows: cur } = await query('select status from product_serials where id = $1', [serialId]);
  if (!cur[0]) return reply.code(404).send({ error: 'ไม่พบรายการ' });
  if (cur[0].status === 'sold') return reply.code(409).send({ error: 'แก้ไขไม่ได้: หน่วยนี้ถูกขายไปแล้ว' });
  try {
    const { rows } = await query(
      `update product_serials set serial = $1, sku = $2, cost = $3, price = $4,
         warranty_months = $5, note = $6, image_url = $7 where id = $8
       returning id, serial, sku, status, cost, price, warranty_months, note, image_url, created_at`,
      [u.serial, u.sku, u.cost, u.price, u.warranty_months, u.note, u.image_url, serialId],
    );
    return { serial: rows[0] };
  } catch (err) {
    const msg = conflictMessage(err);
    if (msg) return reply.code(409).send({ error: msg });
    throw err;
  }
});
```

- [ ] **Step 7: Typecheck**

Run: `cd server && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add server/src/routes/products.ts
git commit -m "feat(api): per-item fields on serials; catalog drops moved fields; edit-unit endpoint"
```

---

## Task 3: Backend — sales route sells chosen units

**Files:**
- Modify: `server/src/routes/sales.ts`

- [ ] **Step 1: Replace `ItemLine`/`SaleBody` and the `sellUnits` helper.** New item shape carries serial ids; bundle keeps FIFO auto-pick (deferred UI):

```ts
interface SaleBody {
  kind?: 'item' | 'bundle';
  items?: { serial_id: number }[];
  bundle_id?: number;
  bundle_qty?: number;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  tax_id?: string | null;
  shipping?: number;
  discount?: number;
}
```

Delete the `ItemLine` interface and the entire `sellUnits` function (its logic moves inline below).

- [ ] **Step 2: Rewrite the body of `POST /api/sales`** (the `kind === 'item'` and `kind === 'bundle'` branches, plus the serial-flip loop). Replace from `// Build line items...` down to the `for (const [pid, q] of need)` loop with:

```ts
// Each line = one specific unit (item) or one bundle set.
const lines: { product_id: number | null; bundle_id: number | null; qty: number; unit_price: number; unit_cost: number }[] = [];
const soldSerialIds: number[] = [];          // serials to flip -> sold
const movements: { product_id: number; delta: number }[] = [];

if (kind === 'item') {
  const ids = (b.items ?? []).map((i) => Number(i.serial_id)).filter((n) => Number.isFinite(n));
  if (!ids.length) { await client.query('rollback'); return reply.code(400).send({ error: 'ยังไม่มีรายการสินค้า' }); }
  for (const sid of ids) {
    const { rows } = await client.query(
      `select id, product_id, price, cost, status from product_serials where id = $1 for update`,
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
  const { rows: comps } = await client.query('select product_id from bundle_items where bundle_id = $1', [bundleId]);
  if (!comps.length) { await client.query('rollback'); return reply.code(400).send({ error: 'ชุดสินค้านี้ไม่มีสินค้า' }); }

  let listTotal = 0, costTotal = 0;
  for (const c of comps) {
    const pid = Number(c.product_id);
    const { rows: picks } = await client.query(
      `select id, price, cost from product_serials
         where product_id = $1 and status = 'in_stock' order by created_at, id limit $2 for update`,
      [pid, setQty],
    );
    if (picks.length < setQty) {
      const { rows: p } = await client.query('select name from products where id = $1', [pid]);
      await client.query('rollback');
      return reply.code(409).send({ error: `สต๊อกไม่พอสำหรับ "${p[0]?.name ?? `#${pid}`}" ในชุดสินค้า` });
    }
    for (const pk of picks) { listTotal += num(pk.price); costTotal += num(pk.cost); soldSerialIds.push(Number(pk.id)); }
    movements.push({ product_id: pid, delta: -setQty });
  }
  const discounted = Math.round(listTotal * (1 - num(brow[0].discount_pct) / 100));
  lines.push({
    product_id: null, bundle_id: bundleId, qty: setQty,
    unit_price: Math.round(discounted / setQty), unit_cost: Math.round(costTotal / setQty),
  });
}
```

- [ ] **Step 3: Replace the serial-flip + movement loop** (the old `for (const [pid, q] of need) await sellUnits(...)`) with:

```ts
if (soldSerialIds.length) {
  await client.query("update product_serials set status = 'sold', sale_id = $2 where id = any($1)", [soldSerialIds, Number(sale.id)]);
}
for (const m of movements) {
  await client.query(
    "insert into stock_movements (product_id, delta, reason, ref_sale_id, created_by) values ($1, $2, 'sale', $3, $4)",
    [m.product_id, m.delta, Number(sale.id), userId],
  );
}
```

Keep the existing `subtotal`/`cost`/`total`/`profit` computation and the `sales` + `sale_items` inserts unchanged (they already read from `lines`). Remove the now-unused `StockError` import usage only if no longer referenced — the bundle/item branches now return 409 directly, so delete the `class StockError` declaration and its `catch` check.

- [ ] **Step 4: Typecheck**

Run: `cd server && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/sales.ts
git commit -m "feat(api): sales sells chosen serial units; bundles FIFO-pick units (interim)"
```

---

## Task 4: Backend — stats uses per-unit cost; drop catalog sku refs

**Files:**
- Modify: `server/src/routes/stats.ts`

- [ ] **Step 1: Replace the `invVal` query** (inventory value now sums each in-stock unit's own cost):

```ts
query(`select coalesce(sum(cost),0) v from product_serials where status='in_stock'`),
```

- [ ] **Step 2: Remove `p.sku` from the `topProd` query** select list (change `select p.id, p.name, p.sku, p.image_url,` to `select p.id, p.name, p.image_url,`).

- [ ] **Step 3: Remove `p.sku` from the `low` query** select list (change `select p.id, p.name, p.sku, p.brand, ...` to `select p.id, p.name, p.brand, ...`).

- [ ] **Step 4: Set `sku: null` in both mappings** — in `topProducts.map` change `sku: (r.sku as string) ?? null,` to `sku: null as string | null,` and likewise in `lowStock.map`. (Keeps the API shape; the catalog no longer has a single SKU.)

- [ ] **Step 5: Typecheck**

Run: `cd server && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/stats.ts
git commit -m "feat(api): inventory value from per-unit cost; drop catalog sku refs"
```

---

## Task 5: Backend — bundles route stops reading products.price/cost

**Files:**
- Modify: `server/src/routes/bundles.ts`

- [ ] **Step 1: Rewrite `itemsByBundle`** so each component derives a representative price/cost from its in-stock units (cheapest unit) instead of the removed `products.price/cost`:

```ts
async function itemsByBundle(): Promise<Map<string, unknown[]>> {
  const { rows } = await query(
    `select bi.bundle_id, p.id as product_id, p.name,
            null::text as sku, p.image_url,
            coalesce(s.in_stock, 0)::int as stock,
            coalesce(s.price_min, 0) as price,
            coalesce(s.cost_min, 0)  as cost
       from bundle_items bi
       join products p on p.id = bi.product_id
       left join (
         select product_id,
                count(*) filter (where status = 'in_stock') as in_stock,
                min(price) filter (where status = 'in_stock') as price_min,
                min(cost)  filter (where status = 'in_stock') as cost_min
           from product_serials group by product_id
       ) s on s.product_id = p.id
      order by p.name`,
  );
  const map = new Map<string, unknown[]>();
  for (const r of rows as Record<string, unknown>[]) {
    const key = String(r.bundle_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  return map;
}
```

Note: `p.image_url` no longer exists on products — change `p.image_url` to `null::text as image_url`.

- [ ] **Step 2: Typecheck**

Run: `cd server && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/bundles.ts
git commit -m "fix(api): bundles derive representative price/cost from units"
```

---

## Task 6: Frontend data layer — inventory.ts

**Files:**
- Modify: `src/data/inventory.ts`

- [ ] **Step 1: Replace the `Serial`, `Product`, `ProductInput` interfaces** and add `UnitInput`:

```ts
export interface Serial {
  id: number;
  serial: string;
  sku: string | null;
  status: SerialStatus;
  cost: number;
  price: number;
  warranty_months: number;
  note: string | null;
  image_url: string | null;
  sale_id: number | null;
  created_at: string;
}

export interface Product {
  id: number;
  category_id: number | null;
  category_name: string | null;
  category_slug: string | null;
  name: string;
  brand: string | null;
  model: string | null;
  low: number;
  notes: string | null;
  status: ProductStatus;
  /** Derived: count of in_stock units. */
  stock: number;
  /** Price range of in-stock units (null when none). */
  price_min: number | null;
  price_max: number | null;
  /** Sum of in-stock units' cost. */
  stock_cost: number;
  created_at: string;
  updated_at: string;
}

/** One physical unit the form sends. */
export interface UnitInput {
  serial: string;
  sku: string | null;
  cost: number;
  price: number;
  warranty_months: number;
  note: string | null;
  image_url: string | null;
}

/** Catalog fields the create/update form sends. */
export interface ProductInput {
  category_id: number | null;
  name: string;
  brand: string | null;
  model: string | null;
  low: number;
  notes: string | null;
  status: ProductStatus;
  units?: UnitInput[];
}
```

- [ ] **Step 2: Replace `normProduct` and `normSerial`:**

```ts
function normProduct(r: Record<string, unknown>): Product {
  return {
    id: Number(r.id),
    category_id: r.category_id == null ? null : Number(r.category_id),
    category_name: (r.category_name as string) ?? null,
    category_slug: (r.category_slug as string) ?? null,
    name: r.name as string,
    brand: (r.brand as string) ?? null,
    model: (r.model as string) ?? null,
    low: n(r.low),
    notes: (r.notes as string) ?? null,
    status: (r.status as ProductStatus) ?? 'active',
    stock: n(r.stock),
    price_min: r.price_min == null ? null : n(r.price_min),
    price_max: r.price_max == null ? null : n(r.price_max),
    stock_cost: n(r.stock_cost),
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}

function normSerial(r: Record<string, unknown>): Serial {
  return {
    id: Number(r.id),
    serial: r.serial as string,
    sku: (r.sku as string) ?? null,
    status: r.status as SerialStatus,
    cost: n(r.cost),
    price: n(r.price),
    warranty_months: n(r.warranty_months),
    note: (r.note as string) ?? null,
    image_url: (r.image_url as string) ?? null,
    sale_id: r.sale_id == null ? null : Number(r.sale_id),
    created_at: r.created_at as string,
  };
}
```

- [ ] **Step 3: Replace `addSerials` with `addUnits` + add `updateSerial`:**

```ts
export async function addUnits(productId: number, units: UnitInput[]): Promise<Serial[]> {
  const r = await http.post<{ serials: Record<string, unknown>[] }>(
    `/api/products/${productId}/serials`, { units },
  );
  return r.serials.map(normSerial);
}

export async function updateSerial(serialId: number, input: UnitInput): Promise<Serial> {
  const { serial } = await http.put<{ serial: Record<string, unknown> }>(`/api/serials/${serialId}`, input);
  return normSerial(serial);
}
```

Keep `deleteSerial` and `uploadImage` as-is.

- [ ] **Step 4: Typecheck the whole app** (this surfaces every consumer that must change — Tasks 7–9 fix them):

Run: `npm run build`
Expected: FAILS with type errors in `InventoryView.tsx`, `AddProductView.tsx`, `SalesView.tsx` referencing removed `Product.price/cost/sku/...` and `addSerials`. That is expected; proceed to fix them next. Do not commit yet.

---

## Task 7: Frontend — AddProductView (catalog form + per-item units)

**Files:**
- Modify: `src/views/AddProductView.tsx`

The catalog form keeps **ข้อมูลพื้นฐาน** (name, category, brand, model) and **ข้อมูลเพิ่มเติม** (reorder point `low`, model `notes`) — and drops the SKU/price/warranty/image cards from the catalog. A new **per-unit editor** lets the user add units, each with: serial, SKU (optional), cost, price, warranty, note, image. Adding a 2nd+ unit pre-fills from the previous one.

- [ ] **Step 1: Replace the `form` state + add a `units` list state.** The catalog `form` keeps only `{ category_id, name, brand, model, low, notes }`. Add:

```ts
interface UnitDraft {
  serial: string; sku: string; cost: string; price: string; warranty: string; note: string; image_url: string | null;
}
const emptyUnit = (from?: UnitDraft): UnitDraft => ({
  serial: '', sku: '',
  cost: from?.cost ?? '', price: from?.price ?? '', warranty: from?.warranty ?? '36',
  note: '', image_url: null,
});
const [units, setUnits] = useState<UnitDraft[]>([]);
```

Remove the old `serials`/`serialInput`/`imageUrl`/`warrantyCustom` single-image state and the `cost`/`price`/`profit`/`margin` derived from the catalog form (profit now shown per unit).

- [ ] **Step 2: Build the catalog form JSX** — keep the ข้อมูลพื้นฐาน card but delete its **SKU** field; delete the whole **ราคาและกำไร** card; delete the right-column **รูปสินค้า** + **ตัวอย่าง** image cards (image is per unit now). Keep the ข้อมูลเพิ่มเติม card (reorder point + model note).

- [ ] **Step 3: Add a "หน่วยสินค้า (แต่ละเครื่อง)" card** that renders the `units` list. Each unit row is an editable sub-card with: serial input, SKU input (labeled optional), cost, price (with live per-unit profit), warranty select (reuse `WARRANTY_PRESETS`), note textarea, and an image upload (reuse `uploadImage`, storing into that unit's `image_url`). Provide an "เพิ่มเครื่อง" button that appends `emptyUnit(units[units.length - 1])` (pre-fill from previous), and a remove button per unit. Helper:

```ts
const setUnit = (i: number, patch: Partial<UnitDraft>) =>
  setUnits((arr) => arr.map((u, idx) => (idx === i ? { ...u, ...patch } : u)));
const addUnitRow = () => setUnits((arr) => [...arr, emptyUnit(arr[arr.length - 1])]);
const removeUnitRow = (i: number) => setUnits((arr) => arr.filter((_, idx) => idx !== i));
```

Per-unit profit display: `const up = Number(u.price) || 0, uc = Number(u.cost) || 0;` show `fmtTHB(up - uc)`.

- [ ] **Step 4: Update `save()`** to send catalog + units. Remove the `status === 'active' && !sku` guard (SKU is optional now). Build:

```ts
const input: ProductInput = {
  category_id: form.category_id === '' ? null : Number(form.category_id),
  name: form.name.trim(),
  brand: form.brand.trim() || null,
  model: form.model.trim() || null,
  low: Number(form.low) || 0,
  notes: form.notes.trim() || null,
  status,
  units: units
    .filter((u) => u.serial.trim())
    .map((u) => ({
      serial: u.serial.trim(),
      sku: u.sku.trim() || null,
      cost: Number(u.cost) || 0,
      price: Number(u.price) || 0,
      warranty_months: Number(u.warranty) || 0,
      note: u.note.trim() || null,
      image_url: u.image_url,
    })),
};
```

In **edit mode** (`isEdit`), units are managed on the detail page, so omit `units` (only catalog fields are saved) — mirror the existing behavior that hid the serials card when editing.

- [ ] **Step 5: Edit-mode prefill** — in the `fetchProduct(editId)` effect, set only the catalog `form` fields (drop sku/cost/price/warranty/image). Leave `units` empty in edit mode.

- [ ] **Step 6: Typecheck** (will still fail on InventoryView/SalesView until Tasks 8–9):

Run: `npx tsc -b` (root) or continue to Task 8 then build once. Expected: AddProductView errors resolved.

---

## Task 8: Frontend — InventoryView (list + per-item detail)

**Files:**
- Modify: `src/views/InventoryView.tsx`

- [ ] **Step 1: List table — remove catalog SKU/cost/price columns, drop the thumbnail.** Replace the per-row cells: keep สินค้า (name + brand + stock-derived), หมวด, คงเหลือ, สถานะ, actions. Replace the single ราคาทุน/ราคาขาย columns with one **ราคา** column showing the range: `p.price_min == null ? '—' : (p.price_min === p.price_max ? fmtTHB(p.price_min) : 'เริ่ม ' + fmtTHB(p.price_min))`. Remove `<Thumb>` from the product cell (catalog has no image). Update `SortKey` to `'name' | 'stock' | 'price'` and sort price by `price_min ?? 0`. Update the product-cell-meta line that referenced `p.warranty_months` to drop it (warranty is per unit now).

- [ ] **Step 2: Fix `totalValue`** — change `products.reduce((s, p) => s + p.cost * p.stock, 0)` to `products.reduce((s, p) => s + p.stock_cost, 0)`.

- [ ] **Step 3: Fix search** — `p.sku` no longer exists on Product; search by name + brand only:

```ts
arr = arr.filter((p) => p.name.toLowerCase().includes(s) || (p.brand ?? '').toLowerCase().includes(s));
```

Also remove `sku` from the column header and the `SortHd`/`<th>SKU</th>`.

- [ ] **Step 4: ProductDetail left card** — remove the image block and the ราคาทุน/ราคาขาย/รับประกัน summary rows (those are per unit now). Keep ยี่ห้อ/รุ่น/จุดสั่งซื้อ + model note. Update the subtitle that printed `product.sku` to print `product.category_name` only.

- [ ] **Step 5: ProductDetail units table — show per-unit fields + edit.** Replace the units table header with: `Serial / SKU`, `ราคาทุน`, `ราคาขาย`, `รับประกัน`, `สถานะ`, actions. Each in-stock row gets an **edit** button that opens an inline editor (reuse a small form modal or expand-row) calling `updateSerial(s.id, input)`; the existing remove button stays. The "add unit" control becomes a small form with serial + sku + cost + price + warranty + note + image (reuse the unit sub-form shape from AddProductView Task 7 Step 3) calling `addUnits(id, [unit])`.

```ts
// replace addOne(): build a UnitInput from the add-unit form fields, then:
await addUnits(id, [unit]);
```

Change the import `addSerials` → `addUnits` and add `updateSerial`.

- [ ] **Step 6: Typecheck**

Run: `npx tsc -b`
Expected: InventoryView errors resolved (SalesView still pending).

---

## Task 9: Frontend — SalesView (pick specific units) + sales data layer

**Files:**
- Modify: `src/data/sales.ts`
- Modify: `src/views/SalesView.tsx`

- [ ] **Step 1: `src/data/sales.ts` — change `NewSale.items`** from `{ product_id: number; qty: number }[]` to `{ serial_id: number }[]`. No other change.

- [ ] **Step 2: SalesView — load units to choose from.** Add a fetch of each active product's units. Simplest: when the user expands a product in the picker, call `fetchProduct(p.id)` to list its in-stock units; or add a helper that fetches units lazily. Implement a `unitsByProduct` cache:

```ts
const [unitMap, setUnitMap] = useState<Record<number, Serial[]>>({});
const loadUnits = async (pid: number) => {
  if (unitMap[pid]) return;
  const { serials } = await fetchProduct(pid);
  setUnitMap((m) => ({ ...m, [pid]: serials.filter((s) => s.status === 'in_stock') }));
};
```

(Import `fetchProduct` and `type Serial` from `../data/inventory`.)

- [ ] **Step 3: Cart is now a list of chosen units.** Replace `interface CartLine { product_id: number; qty: number }` with `interface CartUnit { serial: Serial; product_name: string }` and `const [cart, setCart] = useState<CartUnit[]>([])`. The "เพิ่มสินค้า" search picks a product, then shows its in-stock units (serial + SKU + price); clicking a unit appends it to the cart (guard against adding the same `serial.id` twice). Remove the qty stepper (each unit is qty 1).

- [ ] **Step 4: Recompute totals from chosen units:**

```ts
const subtotal = type === 'item'
  ? cart.reduce((s, c) => s + c.serial.price, 0)
  : (selectedBundle ? selectedBundle.price * bundleQty : 0);
const cost = type === 'item'
  ? cart.reduce((s, c) => s + c.serial.cost, 0)
  : (selectedBundle ? selectedBundle.total_cost * bundleQty : 0);
const itemCount = type === 'item' ? cart.length : bundleQty;
const canConfirm = !busy && (type === 'item' ? cart.length > 0 : !!selectedBundle && bundleQty > 0 && bundleQty <= selectedBundle.stock);
```

Remove the `overStock` item branch for units (a chosen unit is inherently in stock); keep the bundle stock check.

- [ ] **Step 5: Build the item line table** to show each chosen unit (name + serial/SKU, price, remove button) — no qty column. Update `confirm()` payload:

```ts
...(type === 'item'
  ? { items: cart.map((c) => ({ serial_id: c.serial.id })) }
  : { bundle_id: bundleId!, bundle_qty: bundleQty }),
```

- [ ] **Step 6: Build + typecheck the whole app**

Run: `npm run build`
Expected: PASS (no type errors, vite build succeeds).

- [ ] **Step 7: Commit**

```bash
git add src/data/inventory.ts src/data/sales.ts src/views/AddProductView.tsx src/views/InventoryView.tsx src/views/SalesView.tsx
git commit -m "feat(ui): per-item catalog form, inventory detail, and unit-pick sales"
```

---

## Task 10: End-to-end smoke test (live DB via tunnel)

**Files:** none (manual verification).

- [ ] **Step 1: Start backend + frontend.** `cd server && npm run dev` (with the SSH tunnel open) and `npm run dev` from root.

- [ ] **Step 2: Create a catalog with two differently-priced units.** Add "RTX 5090", add unit #1 (serial A, price 70000, warranty 12) and unit #2 (serial B, SKU `SKU001`, price 72000, warranty 24). Confirm both save and the list shows the catalog with stock 2 and a price range.

- [ ] **Step 3: Sell one unit.** On Sales, pick RTX 5090 → choose unit #2; confirm the line uses 72000; complete the sale. Verify stock drops to 1 and unit #2 shows ขายแล้ว in the detail.

- [ ] **Step 4: Check analytics.** Dashboard/Analytics load without error; inventory value reflects the remaining unit's cost.

- [ ] **Step 5: Check bundles page still loads** (no crash) — prices show from unit data.

- [ ] **Step 6: Update AGENTS.md** Progress log + CURRENT NEXT STEP to record the per-item inventory restructure, then commit:

```bash
git add AGENTS.md
git commit -m "docs: record per-item inventory restructure"
```

---

## Notes / interim decisions
- **Bundles UI overhaul is deferred** (spec §Out of scope). Bundles keep working by deriving a representative (cheapest in-stock unit) price/cost; selling a bundle FIFO-picks units. Revisit when bundles get the per-unit treatment.
- **`stock_movements`** stays per-product with a -1 (or -setQty) delta; per-serial granularity is implicit via `product_serials.sale_id`.
- No automated test framework exists in this repo; verification is typecheck + build + manual smoke (matches existing sessions).
