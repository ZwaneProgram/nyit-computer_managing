# Per-unit draft + visible unit image — design (2026-06-09)

## Problem

Two follow-ups on the per-item inventory ([[2026-06-09-per-item-inventory-design]]):

1. **Unit images are write-only.** You can upload a photo per unit, but the
   product-detail unit table never shows it — so the upload is pointless.
2. **Draft is at the wrong level.** `บันทึกแบบร่าง` currently drafts the whole
   *catalog*. It should be **per unit**: an individual unit can be a draft
   (recorded but not yet sellable) while the catalog stays normal.

## Decisions (from brainstorming)

- **Per-unit draft.** A unit can be `draft` — recorded but **excluded from stock
  and from sales** until finished. The catalog itself is always normal.
- **Catalog draft removed from the UI**, but the Inventory **"แบบร่าง" tab stays,
  repurposed** to list catalogs that contain ≥1 draft unit. Existing draft
  *catalogs* are flipped to active.
- **Unit image shown** as a thumbnail in the detail unit row, click → full view.

## Data model

- **`product_serials.status`** gains `'draft'`:
  `check (status in ('draft', 'in_stock', 'sold', 'returned'))`.
  - Stock = `count(status='in_stock')` (unchanged) → drafts auto-excluded.
  - Sales already only sell `in_stock` units → drafts auto-excluded.
  - `price_min/price_max/cost_min/stock_cost` keep filtering `in_stock` only.
- **`products.status`**: kept in the DB but no longer set to `draft` by the UI;
  existing `draft` catalogs are migrated to `active`.

## Backend (`server/src/routes/products.ts`, `schema.sql`)

- Schema: idempotent drop+recreate of the `product_serials` status check to
  include `draft`; `update products set status='active' where status='draft'`.
- `UnitInput`/`CleanUnit` gain `draft: boolean`. Insert sets
  `status = draft ? 'draft' : 'in_stock'`. `PUT /api/serials/:id` sets status
  from the `draft` flag (sold units still rejected).
- `PRODUCT_SELECT` subquery adds `count(*) filter (where status='draft') as
  draft_count`. `GET /api/products?drafts=1` → only catalogs with
  `draft_count > 0`; default → all catalogs.
- Unit return columns add `status` (so the UI can show the draft chip) — already
  returned; ensure `draft_count` is on the product row.

## Frontend

- **`src/data/inventory.ts`**: `Serial.status` adds `'draft'`; `UnitInput` gains
  `draft`; `Product` gains `draft_count`. `fetchProducts(drafts = false)` →
  `/api/products?drafts=1` when true.
- **`AddProductView`**: remove the catalog `บันทึกแบบร่าง` button (save is always
  active). Each unit row in the editor gets a **"บันทึกเป็นแบบร่าง"** checkbox.
- **`InventoryView`**:
  - List "แบบร่าง" tab → `fetchProducts(true)`; show a draft-count chip on rows
    that have drafts; empty-state text updated.
  - ProductDetail unit table: add a **thumbnail** cell (click → open image in a
    new tab; "ไม่มีรูป" when none); status chip shows gray **"แบบร่าง"** for
    draft units; in-stock count unchanged.
  - `UnitFields` shared form gains the **draft checkbox**; `toUnitInput` carries
    it; `startEdit` seeds it from `status === 'draft'`.
- **Callers** `SalesView`/`BundlesView`: `fetchProducts()` (drafts=false) — no
  behavior change (they already only see sellable stock).

## Out of scope
- Bundles (still deferred). Sales flow unchanged (drafts simply never appear as
  sellable units).

## Verification
- `tsc` (both) + `npm run build` clean.
- migrate idempotent (run twice).
- Smoke: add a unit as draft → not in stock, not sellable, shows in "แบบร่าง"
  tab; edit + un-tick → becomes in-stock/sellable; unit thumbnail visible.
