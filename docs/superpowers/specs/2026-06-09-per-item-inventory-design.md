# Per-item inventory — design (2026-06-09)

## Problem

Today a `products` row is a *model* (e.g. "RTX 5070") and it carries the **SKU,
cost, price, and warranty** — so every physical unit of that model shares them.
The shop buys and sells the same model at **different prices, costs, and
warranties** per physical unit, and wants its own shop **SKU** (e.g. `SKU001`)
plus a **photo** per actual item. The current model can't represent that.

This is the inventory restructure flagged in `AGENTS.md` (TODO #4 "per-serial
cost", and the note "Inventory part may be restructured later").

## Mental model (user's words)

- A **catalog** = the big grouping, e.g. **RTX 5090**. It holds only shared
  info and has **no thumbnail image**.
- **Inside** the catalog are the individual **items** — RTX 5090 **#1**, **#2**,
  … — each with its own SKU, serial, price/cost, warranty, note, and picture.

## Locked decisions (from brainstorming)

1. **Keep the catalog → items grouping.** Catalog stays as the wrapper; the
   per-physical-unit attributes move down to the item.
2. **SKU and serial are both per item.** SKU is **optional**, typed manually,
   unique when present. Serial is kept (stays required + unique, as today).
3. **Cost + price ("ราคาและกำไร") are per item.** Profit per sale is exact.
4. **Warranty is per item.**
5. **Note + image are per item.** The catalog itself has **no image field**.
6. **Sales picks the exact item(s).** Selling a catalog means choosing the
   specific item (by SKU/serial, with its price shown); that item's
   price/cost/warranty flow into the sale and its serial flips to `sold`.
7. **Bundles are deferred** (secondary follow-up — see Out of scope).
8. **Convenience:** when adding a 2nd+ item in one add session, pre-fill its
   fields from the item just typed.

## Data model changes

### `products` (the catalog)
- **Keep:** `id`, `category_id`, `name`, `brand`, `model`, `low` (reorder
  point), `notes`, `status` (active/draft), `created_by`, `created_at`,
  `updated_at`.
- **Remove (move to item):** `sku`, `cost`, `price`, `warranty_months`,
  `image_url`.
- Drop the `uniq_products_sku` partial index.

### `product_serials` (the item)
- **Keep:** `id`, `product_id`, `serial` (not null, unique), `status`
  (in_stock/sold/returned), `sale_id`, `created_at`.
- **Add:**
  - `sku text` — nullable; unique when present (`uniq_serials_sku` partial
    index `where sku is not null`).
  - `cost numeric(12,2) not null default 0`
  - `price numeric(12,2) not null default 0`
  - `warranty_months int not null default 0`
  - `note text`
  - `image_url text`

### Derived values (unchanged in spirit)
- **Stock** per catalog = `count(product_serials where status='in_stock')`.
- **Inventory value** = sum of each in_stock item's own `cost` (was
  `products.cost * derived_stock`).
- **Catalog list price shown** = a range / "from" of its in_stock items'
  `price` (no single catalog price exists anymore).

## Backend changes

- **`schema.sql`:** add the new `product_serials` columns + partial unique
  index; drop the moved `products` columns. Add idempotent `ALTER`s to
  converge the live DB (the shared VPS Postgres) without data loss — copy
  existing `products.{sku,cost,price,warranty_months,image_url}` onto each of
  that product's serials *before* dropping the columns.
- **`routes/products.ts`:**
  - Catalog create/update no longer takes sku/cost/price/warranty/image.
  - Item (serial) create/update now takes `sku?`, `serial`, `cost`, `price`,
    `warranty_months`, `note?`, `image_url?`. Validate SKU/serial uniqueness
    (409 on dup, as today for serials).
  - Detail endpoint returns each item's full fields. List endpoint returns
    derived stock + a price range/"from" per catalog.
- **`routes/sales.ts`:** checkout takes the **specific serial id(s)** chosen
  (not just product_id + qty). Each `sale_items` row snapshots that item's
  `unit_price`/`unit_cost` from the serial; the serial flips to `sold` in the
  same transaction; `stock_movements` written as today.
- **`routes/stats.ts`:** inventory-value and any price/cost references switch
  from `products.{price,cost}` to aggregations over `product_serials`. Sales
  analytics already read `sale_items.unit_*`, so those are unaffected.

## Frontend changes (Thai UI, keep existing component style)

- **`AddProductView`:** split into **catalog form** (ข้อมูลพื้นฐาน: name,
  category, brand, model + ข้อมูลเพิ่มเติม: reorder point, note — no image) and
  the **item sub-form** (SKU optional, serial, cost, price, warranty, note,
  image). 2nd+ item pre-fills from the previous.
- **`InventoryView`:** list shows catalogs with derived stock + price "from",
  **no thumbnail**. Catalog detail lists items (#1, #2…) each showing
  SKU/serial/price/warranty/note/photo; add/remove items here.
- **`SalesView`:** when a catalog is added to the cart, staff picks the exact
  item(s) from a list showing each in_stock item's SKU/serial + price; that
  item's price/warranty flow into the line. Cart lines are per item.
- **`src/data/inventory.ts` + `src/data/sales.ts`:** update shapes to carry
  per-item fields and the chosen-serial checkout payload. Views keep importing
  only from `src/data/`.

## Out of scope (deferred)

- **Bundles** — bundles group catalogs; making them pick specific items at sale
  time is a separate follow-up. Until then bundles keep working off whatever
  catalog-level fallback we leave, or are temporarily hidden if they break.
  Decide during planning; do **not** let bundles block the main change.
- CSV export, receipt print (existing TODO #2).

## Risks / notes

- The shared **live VPS Postgres** has real data — the migration must copy
  per-model values down to each serial before dropping columns, and be
  idempotent. Test the ALTERs against a copy first.
- The Sales change is the largest UX shift; verify checkout still deducts stock
  atomically and profit is computed from per-item cost.
