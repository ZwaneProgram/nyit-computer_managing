# AGENTS — Nyit Computer · live project handoff

> **Any AI agent (Codex, Claude, etc.) entering this repo: READ THIS FILE FIRST, top to bottom.**
> Single source of truth for what's built, what's decided, and what to do next.
> The human switches agents when tokens run low — so **keep this updated**: at the end of every
> session, append to the **Progress log** and rewrite the **CURRENT NEXT STEP**.

---

## ⏭️ CURRENT NEXT STEP

**Phase 0 (Foundation) nearly done.** Backend + Postgres + login gate all working end-to-end on dev.

Done so far in Phase 0:
- `server/` backend: Fastify API + Postgres (`pg`) + auth (register/login/logout/me/**needs-setup**, bcrypt + JWT cookie) + products/categories endpoints + `schema.sql` + migrate script.
- Vite dev proxy added (`/api` → `http://localhost:3000`).
- **Postgres installed (Windows) + migrated** — DB `nyit` live, `server/.env` set. Auth flow verified end-to-end (needs-setup → register first → login → me → 2nd-account-blocked).
- **Frontend login gate done:** `src/lib/api.ts` (fetch wrapper: `api` for auth, `http` for feature endpoints), `src/auth/AuthContext.tsx` (provider + `useAuth`), `src/views/LoginView.tsx` (Thai login / first-account-setup screen). App is gated in `App.tsx`; Topbar has a logout button; Sidebar shows the logged-in user. First account auto-creates when DB is empty (needs-setup), then auto-logs-in.

**Inventory BACKEND is done + verified** (2026-06-03): categories CRUD (`/api/categories`), products CRUD with **derived stock** + draft `status` (`/api/products?status=active|draft|all`, `/api/products/:id` returns product+serials), per-unit serials (`POST /api/products/:id/serials`, `DELETE /api/serials/:id`), image upload (`POST /api/upload` → `/uploads/*`, multipart, 4MB, image-only). Vite proxies `/uploads` too. All smoke-tested via curl. See LOCKED decision #9 for the model.

**Inventory UI — DONE this pass (2026-06-03):** new `src/data/inventory.ts` (real API data layer + types + normalisers — coerces pg string bigint/numeric to JS numbers; `uploadImage` via FormData). `InventoryView` rewritten: real list, search/category/stock filters, **active vs แบบร่าง tabs** (covers drafts), thumbnail = photo or "ไม่มีรูป", click row → **ProductDetail** (serial units list + add/remove serial, delete product). `AddProductView` rewritten: real `createProduct` (active or `บันทึกแบบร่าง`→draft), serial entry, real photo upload. App passes `showToast` to Inventory. Typechecks + builds clean. The **mock `src/data/catalog.ts` still exists** — used by the not-yet-wired views (Bundles/Sales/Dashboard/Analytics/Sidebar low-count); delete it once the last consumer is migrated.

**Inventory is now FEATURE-COMPLETE** (2026-06-03): list, filters, active/draft tabs, product detail + per-unit serials, add, **edit** (AddProductView edit mode via `editId` prop; App holds `editProductId`, `editProduct()` opens it; serials card hidden in edit — serials managed in detail), **delete**, **categories management** (`CategoriesView`, new nav item `categories`/`หมวดหมู่`, CRUD), flexible warranty (presets + custom). All endpoints smoke-tested live. (Optional later: CSV export — was removed from toolbar.)

**Bundles DONE (2026-06-03):** `routes/bundles.ts` (CRUD; list returns each bundle's component products + derived stock + `sold` count; price/cost/profit computed client-side from live components in `src/data/bundles.ts`). `BundlesView` rewritten off mock: list cards (edit/delete), create/edit form (real product picker + discount slider + auto summary). Selling a bundle waits for the Sales module. Smoke-tested CRUD live.

**Next, in order:**
1. **Sales** — wire `SalesView`. Needs the **atomic checkout** transaction: on confirm, for each line flip N `product_serials` from `in_stock`→`sold` (lowers derived stock), write `sales` + `sale_items` (+ `stock_movements`), all in one `BEGIN/COMMIT`. Bundle sale = deduct one unit of each component. Build `routes/sales.ts` (create sale, list history) + a `src/data/sales.ts`. Record the logged-in user as staff. Customer fields stored on the sale (no separate CRM). Payment status: keep paid/pending (drop "partial"? confirm w/ user).
2. Then Dashboard/Analytics (real SQL aggregations over sales) → Settings/cleanup.
3. Once Sales/Dashboard/Analytics are wired, **delete mock `src/data/catalog.ts`** and the Sidebar low-count's dependency on it (Sidebar still imports mock `PRODUCTS` for its badge).

To run dev: backend `cd server && npm run dev` (:3000), frontend `npm run dev` (:5173). Empty DB → app shows "create first account".

---

## What this project is

A **Thai-language stock & sales web app for a computer shop** ("Nyit Computer"). Users: **1 owner + 1–2 staff**, low traffic, on a real domain.

## Current state (frontend)

- **Complete responsive UI**, 6 screens, but every screen still runs on **MOCK data** in `src/data/catalog.ts` (forms only toast; analytics are hard-coded). Replacing that with the API is the work ahead.
- Stack: **Vite + React 18 + TypeScript** SPA, plain CSS w/ design tokens. Theming (dark/accent/density) works via `localStorage`. Builds clean (`npm run build`).

### Commands
```bash
# frontend (repo root)
npm install && npm run dev        # http://localhost:5173 (proxies /api → :3000)
npm run build                     # tsc -b + vite build → dist/

# backend (server/)
cd server
npm install
cp .env.example .env              # then edit DATABASE_URL + JWT_SECRET
npm run migrate                   # create tables (needs Postgres running)
npm run dev                       # API on :3000
```

### File structure
```
src/                       frontend
  App.tsx, main.tsx, styles.css, types.ts
  data/  catalog.ts (MOCK — being replaced), format.ts
  hooks/ components/ (+charts/) views/
server/                    backend (Fastify + Postgres)
  src/index.ts             app entry, registers routes, /api/health
  src/db.ts                pg Pool + query()
  src/auth.ts              register/login/logout/me, JWT cookie, requireAuth guard
  src/routes/products.ts   products + categories endpoints
  src/schema.sql           database schema
  src/migrate.ts           applies schema.sql
  .env.example
```

**Architecture rule:** views import from `src/data/` only — never call the API directly. Add `src/data/*.ts` modules that wrap `fetch('/api/...')` and return the existing `src/types.ts` shapes, so views barely change.

---

## Decisions LOCKED (don't re-litigate without reason)

1. **Frontend:** Vite + React + TypeScript (SPA; internal tool behind login, no SEO need).
2. **Hosting + backend: FULL VPS — everything on the owner's Contabo VPS.** Website + Node API + PostgreSQL + image uploads all on one box, behind the domain. No Supabase, no Vercel, no external accounts. (We have SSH: IP + username + password.)
3. **Database: PostgreSQL, installed natively. NO Docker** — dev (Windows) and prod (VPS) both run native Postgres + Node. Prod: Node under **pm2**, **Caddy** for automatic HTTPS + static serving + `/api` proxy.
4. **Backend stack:** Node + **Fastify** (TypeScript, run via `tsx` — no build step). Auth = bcrypt password hashes + JWT in an httpOnly cookie.
5. **Auth model: single role.** Every account has **full access**. No staff/owner permission split. Multi-account supported: the **first** account can be created on an empty DB; after that, creating accounts requires being logged in.
6. **Security: light by design** (human's call — "just stock, no business secrets"). Still: hash passwords, don't expose secrets/DB creds in the frontend, keep JWT cookie httpOnly.
7. **Image storage:** local `uploads/` folder on the VPS, served by Caddy. (Dev: same folder locally.)
8. **Cost target near-free** — only real cost is the domain (~$10/yr). Language: **Thai UI**. Mobile responsive. Keep modular; avoid unnecessary complexity.
9. **Inventory model (decided 2026-06-03):**
   - **Full per-unit serial tracking.** A `products` row is a *model* (e.g. "RTX 5070"); each physical unit is a `product_serials` row with its own serial. **Stock is derived = count of `in_stock` serials** (the `products.stock` column was dropped). Clicking a product shows all its units/serials. Adding stock = adding serials.
   - **Categories are user-editable** (CRUD) — get their own management section. 8 defaults seeded (gpu/cpu/mb/ram/ssd/psu/monitor/peripheral).
   - **Product photos:** real upload (`POST /api/upload` → `server/uploads/`, served at `/uploads/*`). No photo → UI shows "ไม่มีรูป" text (not the old category-abbreviation thumbnail).
   - **Drafts kept:** products have `status` `active|draft`; drafts may omit SKU; they get their own **Drafts page**. (`บันทึกแบบร่าง` stays.)
   - **Removed:** the `สร้างใบสั่งซื้อ` / `สั่งเพิ่ม` purchase-order buttons (POs remain YAGNI), and the global topbar search.

---

## Data model (PostgreSQL) — see `server/src/schema.sql` for the authoritative version

`users` (id, username unique, password_hash, full_name) · `categories` · `products`
`product_serials` · `bundles` + `bundle_items` · `sales` + `sale_items`
`stock_movements` · `shop_settings` (singleton). Later/optional: `customers`, `suppliers`, `purchase_orders`.

**Behavior to implement (not just tables):**
- **Stock is derived**, not stored: `count(product_serials where status='in_stock')` per product (queries already compute this as `stock`).
- A sale must flip matching `product_serials` to `sold` (which lowers derived stock) and write `stock_movements` — in a single transaction (`BEGIN/COMMIT`) so it's atomic.
- Low-stock alerts = products where `derived_stock <= low`.
- Analytics = SQL aggregations over `sales`/`sale_items`/`stock_movements` (replaces the hard-coded numbers).

---

## Roadmap (one module per session)

- **Phase 0 — Foundation:** backend scaffold ✅ · Postgres install + migrate ✅ · frontend login gate ✅ · wire products data layer ⬅️ *next*. *(in progress)*
- **Phase 1 — Inventory:** product CRUD, categories, serials, image upload (`uploads/`), stock + reorder points, manual adjustments, real low-stock alerts, CSV export.
- **Phase 2 — Bundles:** CRUD, auto price/cost from components, stock validation.
- **Phase 3 — Sales/Checkout:** atomic checkout (single + bundle) w/ stock deduction + serial assignment, customer capture, payment/shipping/discount, real history, receipt print/PDF, refunds.
- **Phase 4 — Analytics:** real aggregations + date-range filtering + export.
- **Phase 5 — Cross-cutting:** global search (⌘K), notifications (low stock), settings page (shop info, payment methods, shipping, thresholds, account management), loading/error/empty states, validation.
- **Later (YAGNI):** customers/CRM · suppliers & POs · multi-branch · barcode/QR.

---

## Conventions & gotchas

- **Do NOT read `node_modules/`** unless truly necessary — wastes the human's tokens.
- Keep the **Thai UI**; match existing `src/` component style; stay mobile responsive.
- Keep the **data layer isolated** in `src/data/`.
- Backend runs with **`tsx`** (no compile step) — extensionless TS imports are fine. Use `bcryptjs` (pure JS, no native build → works on Windows + VPS).
- `.env` is gitignored — never commit DB creds or `JWT_SECRET`. There's a `server/.env.example` template.
- **Git works in the Claude environment** (`main` tracks GitHub origin). Codex's shell reportedly can't run `git` — if so, leave commits to a Claude session or have the human commit.

---

## Progress log (newest first)

- **2026-06-03 (Claude):** **Bundles module.** Built `routes/bundles.ts` (CRUD; bundle list includes component products w/ derived stock + sold count; registered in index.ts). New `src/data/bundles.ts` (computes list_price/price/profit/min-stock from live components). Rewrote `BundlesView` to real API (list cards w/ edit+delete, create/edit form w/ real product picker + discount slider). Smoke-tested bundle CRUD live (throwaway records). tsc+build clean. Note: user said Inventory may be restructured later ("might drop tables/redo") — fine, it's a base. **Stopped at:** Sales module (see CURRENT NEXT STEP).
- **2026-06-03 (Claude):** Finished Inventory: **edit product** (AddProductView edit mode + App `editProductId`/`editProduct`, edit button in ProductDetail, serials card hidden when editing) and **categories management** (`CategoriesView` + `categories` nav item, full CRUD). Flexible warranty (presets + custom months). Smoke-tested product PUT/DELETE + category PUT/DELETE live via a minted session (throwaway records only — user data untouched). tsc+build clean. **Stopped at:** Bundles module (needs backend `routes/bundles.ts` first — see CURRENT NEXT STEP).
- **2026-06-03 (Claude):** Wired the **Inventory frontend** to the real API. New `src/data/inventory.ts` data layer. Rewrote `InventoryView` (real list, filters, active/draft tabs, product-detail with per-unit serial add/remove, delete) and `AddProductView` (real create + draft + serial entry + photo upload). Added `.chip-x` style; App passes showToast to Inventory. tsc + vite build clean. Mock `catalog.ts` kept for unwired views. **Stopped at:** categories-management UI + edit-product (see CURRENT NEXT STEP step 1).
- **2026-06-03 (Claude):** Kicked off the "make it all real" job. Removed global topbar search. Locked the **inventory model** with the human (full per-unit serials, editable categories, real photos, drafts kept, PO buttons removed — LOCKED #9). Reworked `schema.sql` (products: dropped stored `stock`, `sku` nullable, added `status` active/draft + partial unique sku; `product_serials.created_at`; seeded 8 categories; idempotent ALTERs to converge the dev DB). Added deps `@fastify/multipart` + `@fastify/static`. Built backend: `routes/categories.ts` (CRUD), rewrote `routes/products.ts` (derived stock, draft status filter, serials add/remove, product+serials detail), `routes/uploads.ts` (image upload). Registered all in `index.ts`; Vite proxies `/uploads`. Smoke-tested the whole surface via curl (create w/ serials, derived stock, dup-serial 409, draft no-sku, upload 201 + static serve 200), then cleared test data. **Stopped at:** frontend Inventory UI (see CURRENT NEXT STEP step 1).
- **2026-06-03 (Claude):** Human installed Postgres (Windows) + created DB `nyit` + set `server/.env`; migrate ran clean. Added `GET /api/auth/needs-setup`. Built the **frontend login gate**: `src/lib/api.ts` (fetch wrapper, `credentials:'include'`, `api` + `http`), `src/auth/AuthContext.tsx` (`AuthProvider`/`useAuth`), `src/views/LoginView.tsx` (Thai login + first-account-setup). Gated `App.tsx` (loading → login → shell), added logout to Topbar + real user in Sidebar, `lock`/`logout` icons, `.auth` styles. Verified the whole auth flow live (curl) then truncated `users` so first-run UX is clean. Both typechecks pass. **Stopped at:** next code task = wire the products data layer (seed categories first — see CURRENT NEXT STEP).
- **2026-06-01 (Claude):** Locked hosting/DB decisions (Full VPS on Contabo, native Postgres, no Docker, Fastify, single-role auth w/ multi-account). Scaffolded `server/` (Fastify + pg + auth + products/categories + schema + migrate) and added the Vite `/api` proxy. **Stopped at:** human to install Postgres + run migrate; next code task = frontend login gate, then wire the products data layer.
- **2026-06-01 (Codex):** Reopened backend decision after learning the owner has a Contabo VPS reached via FileZilla; documented VPS-vs-managed trade-offs; pointed `CLAUDE.md` at this file.
- **2026-06-01 (Claude):** Built the full UI from the Claude Design handoff (6 responsive screens, theming). Chose Vite/React/TS. Wrote the initial handoff.
