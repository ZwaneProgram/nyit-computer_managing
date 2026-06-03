# Design — Analytics date-range, Sales history filters, Inventory 2-state status, remove bell

Date: 2026-06-03
Status: approved (pending spec review)

## Scope

Four changes to the live Nyit Computer app:

1. **Remove the Topbar notification bell** (it was decorative/unwired).
2. **Inventory status → 2 states only** (`มีของ` / `หมด`).
3. **Analytics date-range filter** (preset selector, recomputes server-side).
4. **Sales history** — server-side date filter + search + pagination.

Out of scope (explicitly decided): low-stock removal is **Inventory-only**. The Dashboard
low-stock card, the Settings "default low-stock threshold", the per-product reorder point
(`จุดสั่งซื้อ` / `products.low`), and `shop_settings.default_low` all stay untouched. No DB
column drops.

---

## 1. Remove notification bell

**File:** `src/components/Topbar.tsx`

Delete the `.notif-btn` button and its `.notif-dot` span (lines ~38–41). No other changes —
the bell is self-contained and unwired. Leftover CSS (`.notif-btn`, `.notif-dot`) can stay or
be removed; harmless either way. No backend, no new endpoint.

---

## 2. Inventory status → `มีของ` / `หมด`

**File:** `src/views/InventoryView.tsx` (frontend-only; `products.low` stays in the DB and is
still shown as `จุดสั่งซื้อ` in the product detail).

- **`statusChip`** (currently 3 branches): becomes
  - `stock === 0` → `<span className="chip chip-neg chip-dot">หมด</span>`
  - else → `<span className="chip chip-pos chip-dot">มีของ</span>`
  - Remove the `เหลือน้อย` (`chip-warn`) branch.
- **`StockFilter` type:** `'all' | 'in' | 'out'` (remove `'low'`).
- **`quickFilters`:** three chips — `ทั้งหมด` (all), `มีของ` (`stock > 0`), `หมด` (`stock === 0`).
  Remove the `เหลือน้อย` chip.
- **`filtered` memo:** `'in'` → `p.stock > 0`; `'out'` → `p.stock === 0`; remove the `'low'`
  and the old `> p.low` logic.

Reorder point (`p.low`) is still displayed in `ProductDetail` (`จุดสั่งซื้อ`) — left as-is.

---

## 3. Analytics date-range filter

### Backend — `server/src/routes/stats.ts`

Add an optional query param: `GET /api/stats?range=7d|30d|90d|1y|all`. Default `all`
(preserves current behavior — nothing else calling `/api/stats` breaks).

Map range → a `since` boundary:
- `7d` → `now() - interval '7 days'`
- `30d` → `now() - interval '30 days'`
- `90d` → `now() - interval '90 days'`
- `1y` → `now() - interval '1 year'`
- `all` → no lower bound

**Recomputed for the window** (add `where created_at >= $since` / join-filter on sale date):
- totals KPIs: `sales`, `profit`, `orders`, `avgOrder`
- `topProducts`, `categoryShare`, `categoryUnits`, `bundlePerformance`
- the main time-series chart + the stock-movement chart

**Stays a current snapshot** (range does NOT apply — these are point-in-time):
- `inventoryValue`, `inStockUnits` (derived from current `in_stock` serials)
- `lowStock` (unchanged; still returned, still used by Dashboard)

**Chart granularity adapts to range:**
- `7d` / `30d` / `90d` → **daily** buckets (`date_trunc('day', …)`), labels = day/month e.g. `3 มิ.ย.`
- `1y` / `all` → **monthly** buckets (`date_trunc('month', …)`), labels = Thai month (current behavior)

The frontend charts already accept `{ labels, data }` arrays, so only the arrays' contents
change. The response shape of `salesByMonth` / `stockMovement` stays `{ labels, sales, profit, orders }`
/ `{ labels, inb, outb }` — only the bucketing/labels differ. (Field names kept for minimal churn;
they now mean "by bucket" not strictly "by month".)

The month-over-month KPI deltas (`kpis.deltaSales` etc.) are inherently month-based; with a
range selected they remain "this calendar month vs last" and are shown on the Dashboard, not the
Analytics headline. Analytics headline KPIs use the range totals (no delta), as today.

### Frontend — `src/views/AnalyticsView.tsx` + `src/data/stats.ts`

- `fetchStats(range?: Range)` passes `?range=…`; `Range = '7d'|'30d'|'90d'|'1y'|'all'`.
- `AnalyticsView` adds `const [range, setRange] = useState<Range>('all')`; refetches on change.
- A preset selector row at the top: `[7วัน][30วัน][90วัน][1ปี][ทั้งหมด]` (reuse `.tabs`/`.quick-chip`
  styling). Active state highlighted.
- Chart subtitles reflect the range (e.g. "12 เดือนล่าสุด" → "ช่วงที่เลือก") — minor copy.
- Everything else re-renders from the response; no other structural change.

---

## 4. Sales history — date filter + search + pagination

### Backend — `server/src/routes/sales.ts`

`GET /api/sales` gains optional query params:
- `from` (ISO date, inclusive), `to` (ISO date, inclusive — treat as end-of-day)
- `q` (search string)
- `limit` (default 25), `offset` (default 0)

Returns **`{ sales, total }`** (was `{ sales }`).

- **WHERE** clause built from provided params:
  - `from` → `s.created_at >= $from`
  - `to` → `s.created_at < ($to::date + interval '1 day')`
  - `q` → `( s.id::text = $q OR s.customer_name ILIKE $like OR EXISTS (
            select 1 from sale_items si
            left join products p on p.id = si.product_id
            left join bundles bd on bd.id = si.bundle_id
            where si.sale_id = s.id and (p.name ILIKE $like OR bd.name ILIKE $like) ) )`
    where `$like = '%' + q + '%'`.
- **`total`** = `count(*)` over the same WHERE (separate query, no limit/offset).
- **Page query:** `ORDER BY s.created_at DESC LIMIT $limit OFFSET $offset`.
- **Item lookup scoped to the page:** fetch `sale_items` only `where si.sale_id = any($pageIds)`
  (currently it fetches items for ALL sales — fix as part of this). Label/`line_count`
  computation unchanged otherwise.

### Frontend — `src/views/SalesView.tsx` + `src/data/sales.ts`

- `fetchSales(params?: { from?; to?; q?; limit?; offset? })` → returns `{ sales, total }`.
- History tab gains:
  - A **filter bar**: date preset buttons (e.g. `ทั้งหมด / 7วัน / 30วัน / กำหนดเอง`) + optional
    from/to date inputs when `กำหนดเอง`, plus a debounced **search box** (placeholder
    "ค้นหาเลขบิล, ลูกค้า, หรือสินค้า…").
  - **Pagination**: prev/next + "แสดง X–Y จาก N รายการ", 25/page (mirror the Inventory `.pagn`
    pattern).
- State: `from`, `to`, `q` (debounced), `page`. Refetch when any change; reset `page` to 1 when
  filters change.

---

## Testing

- **Manual / curl smoke tests** against the dev server (mirroring how prior modules were verified
  in this repo — no automated test harness exists here):
  - `/api/stats?range=7d|30d|90d|1y|all` returns sane, range-narrowing numbers; default = `all`
    matches pre-change output.
  - `/api/sales?from&to&q&limit&offset` filters correctly, `total` matches the filter, paging
    works, search hits bill #/customer/product.
- **Type + build:** `tsc -b` (root + server) and `npm run build` clean.
- **Visual:** Analytics presets switch and redraw; Inventory shows only มีของ/หมด; bell gone;
  Sales history filters + pages.

## Risks / notes

- Adaptive chart bucketing is the one nontrivial bit — keep daily/monthly switch isolated in a
  helper in `stats.ts`.
- `/api/sales` response shape change (`{ sales }` → `{ sales, total }`) — the only consumer is
  `src/data/sales.ts`; update it in lockstep.
- Inventory low-stock removal is deliberately UI-only; DB columns and other screens are untouched
  and reversible.
