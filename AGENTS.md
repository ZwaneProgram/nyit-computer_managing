# AGENTS — Nyit Computer · live project handoff

> **Any AI agent (Codex, Claude, etc.) entering this repo: READ THIS FILE FIRST, top to bottom.**
> Single source of truth for what's built, what's decided, and what to do next.
> The human switches agents when tokens run low — so **keep this updated**: at the end of every
> session, append to the **Progress log** and rewrite the **CURRENT NEXT STEP**.

---

## ⏭️ CURRENT NEXT STEP

**STATUS: all 6 screens + Settings are wired to the real Postgres backend and working on dev.** Auth/login gate, Inventory (products + per-unit serials + photos + drafts + categories CRUD + edit), Bundles, Sales (atomic checkout that deducts stock), Dashboard + Analytics (real `/api/stats` aggregations), and the **Settings page** (shop info + default low-stock threshold + owner/staff account management) are all DONE and committed. Mock data deleted. Charts fixed. **Auth now has owner/staff roles** (LOCKED #5). See the Progress log below for the full blow-by-blow, and LOCKED decisions (esp. #9 inventory model). **The app is now DEPLOYED & LIVE at http://194.233.88.142:3000** (Contabo VPS, single-port under pm2 — see deploy item #3 + `DEPLOY.md`). Since then: analytics date-range, sales-history filters/pagination, inventory 2-state status, bell removed, a responsive + dark-mode pass, density slider, and **local dev now shares the VPS DB via an SSH tunnel** (image-upload caveat — see TODO #6) — all live. Next up: **VPS hardening (#5: pm2 boot-persistence + nightly backup)**, the rest of the responsive pass (#6), and optional polish (#2: CSV export, receipt print).

To run dev: backend `cd server && npm run dev` (:3000), frontend `npm run dev` (:5173). Empty DB → "create first account".

### 📋 TODO (remaining work — newest priorities first)

- [x] **1. Settings page** — DONE 2026-06-03. `SettingsView` (`settings` ViewId, "ตั้งค่าระบบ" sidebar button wired). Shop info (`GET`/`PUT /api/settings`, owner-only write). Default low-stock threshold prefills the Add-Product reorder point. **Account management** with **owner/staff roles** (see LOCKED #5): `routes/users.ts` (`GET`/`POST`/`DELETE /api/users`, `PUT /api/users/:id/password`) + UI — owner lists/adds/removes accounts & resets passwords; everyone can change their own password. Guards: can't delete yourself / the last owner; staff own-pw needs current pw. Smoke-tested 15/15 live. (Also fixed: `currentUser` now coerces `id` to a number since pg returns bigint as string — `===` self-checks were silently failing.)
- [ ] **2. Optional polish:**
  - **CSV export** (Inventory list + Analytics).
  - **Receipt print/PDF** on a completed sale (success screen has a spot for it).
  - ~~Refunds~~ — DROPPED 2026-06-03 (user: shop doesn't take returns). ~~Low-stock sidebar badge~~ — DROPPED (low-stock concept removed from Inventory today).
- [x] **3. Deploy to the Contabo VPS** — DONE 2026-06-03. **LIVE at http://194.233.88.142:3000** (single-port under pm2, `/opt/nyit-app`, Node 20 + PostgreSQL 16.14). Owner account created. **Full runbook is in `DEPLOY.md`.** Remaining small follow-ups: confirm **pm2 boot-persistence** stuck (`pm2 startup`+`save`), set up the **nightly `pg_dump` backup** cron (DEPLOY.md §Backups), and the *later* **subdomain + HTTPS** path (DEPLOY.md §later, then `COOKIE_SECURE=true`).
  - **VPS recon (2026-06-03):** Ubuntu 24.04, root login, 133GB free / 7.8GB RAM. **Apache** owns 80/443 + **MySQL** on 3306 — the box already serves live sites (`/var/www/nyit.one`, `/var/www/stock.nyit` = an **existing PHP/MySQL stock system**, plus a `stock_system.sql` dump). Node + Postgres were NOT installed. Port 3000 free.
  - **Decisions (with user):** Deploy the new app **alongside**, do NOT touch Apache/MySQL/old sites. New app runs **single-port on `http://<IP>:3000`** for now (Fastify serves the built `dist/` + `/api` + `/uploads`; no Caddy/Apache vhost yet). New app uses its own **PostgreSQL** (coexists w/ MySQL on 5432). **Start fresh data** (no migration of the old MySQL stock data; old system kept as backup). Subdomain + HTTPS via Apache reverse-proxy is the documented *later* step (`DEPLOY.md` §later).
  - **Done repo-side:** Fastify serves frontend `dist/` + SPA fallback when present (`index.ts`); cookie `secure` is env-driven `COOKIE_SECURE` (default false for http); `.env.example` updated; `DEPLOY.md` written. Tested single-port serving locally (/, assets, SPA fallback, /api). Pushed to GitHub (private repo → clone needs a PAT, see DEPLOY.md §4).
  - **Still to do on the VPS:** run `DEPLOY.md` steps 1–9 (install Node/pm2/Postgres, clone w/ token, `.env` w/ fresh secrets, build, migrate, pm2, open port 3000), then create the first account (= owner). Later: `pg_dump` backup cron (§Backups), domain+HTTPS+`COOKIE_SECURE=true` (§later).
- [ ] **4. App loose ends (small):**
  - [x] Topbar **notification bell** — REMOVED 2026-06-03 (user decided low-stock alerts aren't needed; shop carries little stock).
  - [x] **Analytics date-range filter** — DONE 2026-06-03. `/api/stats?range=7d|30d|90d|1y|all` (default `all`); recomputes KPIs/tables/charts, daily buckets ≤90d & monthly for 1y/all; inventory-value/in-stock/low-stock stay current snapshots. Preset selector in `AnalyticsView`.
  - [x] **Sales history** — DONE 2026-06-03. `/api/sales` now takes `from/to/q/limit/offset` and returns `{ sales, total }`; history tab has a date filter + debounced search (bill#/customer/product) + 25/page pagination.
  - [ ] **Per-serial cost** — cost is currently per product, not per unit (matters if same model is bought at different prices).
  - Also 2026-06-03: **Inventory status simplified to 2 states** (`มีของ`/`หมด`) — dropped the `เหลือน้อย` chip + quick-filter (Inventory view only; `products.low` reorder point + Dashboard low-stock card + Settings threshold kept untouched).

- [ ] **5. VPS hardening (later — do soon, real data is live):**
  - [ ] **pm2 boot-persistence** — confirm the app auto-starts after a reboot: `pm2 startup systemd -u root --hp /root` (run the line it prints), then `pm2 save`. Test with a reboot if possible.
  - [ ] **Nightly `pg_dump` backup cron** — `DEPLOY.md` §Backups: `( crontab -l 2>/dev/null; echo "0 2 * * * sudo -u postgres pg_dump nyit > /root/nyit-backup-\$(date +\%F).sql" ) | crontab -`. Confirm it's installed and producing files.

- [ ] **6. Responsive + theming pass (started 2026-06-03, more later):**
  - [x] Fixed dense chart labels (`thinLabels` in `BarChart`/`AreaChart` → ~12 readable labels; the 30/90-day ranges were crushing 30–90 labels).
  - [x] Phone **card-view** (≤600px) for the **Inventory** list + **Sales history** tables (`tbl-cards` class + `data-label` per `td`); no more sideways scroll on phones.
  - [x] Bigger mobile tap targets (≈36px) for pagination, qty steppers, tabs, chips.
  - [x] Fixed dark-mode **unreadable black text**: `.product-pick` had no `color` so buttons used the UA default black → added `color: var(--ink)` (affected sale-type, bundle picker, product search cards).
  - [x] Fixed Sales-history **horizontal overflow** ("off the box"): the `pagn` had `table-flush` (−20px margins) inside a card with no padding → removed it.
  - [x] Row-density picker is now a **draggable slider** (was a 3-button segment).
  - [ ] **Still scroll-not-carded on phones** (do later if wanted): Analytics top-products & bundle tables, Settings user list, the sales **cart**, serials table.
  - [ ] **Cleanup:** unused `.seg`/`.seg-btn` CSS (density picker no longer uses it).

- **DEV DB = shared VPS Postgres via SSH tunnel.** Local `server/.env` `DATABASE_URL` → `localhost:5433`; user runs `ssh -N -L 5433:localhost:5432 -o ServerAliveInterval=30 root@194.233.88.142` and leaves it open (no tunnel ⇒ login/all data 500). **Image-upload gotcha:** DB is shared but `server/uploads/` is NOT — a file only exists on the machine that uploaded it. **Rule: upload product images on the LIVE site, not locally.** Local dev serves `/uploads/*` with a fallback: if a file isn't local and `UPLOADS_FALLBACK_URL` is set (DEV ONLY — never on the VPS), it 302s to the VPS. So local dev sees real images; locally-uploaded images won't show on the live site until re-uploaded there.

PARKED (later / YAGNI, intentionally not built): customers/CRM · suppliers & purchase orders · multi-branch · barcode/QR scanning.

NOTE: user said the **Inventory part may be restructured later** ("might drop tables / redo") — confirm with them before building anything that deeply depends on the current inventory schema.

To run dev: backend `cd server && npm run dev` (:3000), frontend `npm run dev` (:5173). Empty DB → app shows "create first account".

---

## What this project is

A **Thai-language stock & sales web app for a computer shop** ("Nyit Computer"). Users: **1 owner + 1–2 staff**, low traffic, on a real domain.

## Current state (frontend)

- **All screens now run on REAL data** via the API (mock `src/data/catalog.ts` deleted 2026-06-03). Data layers: `src/data/{inventory,bundles,sales,stats}.ts` + `src/lib/api.ts`. Inventory/Bundles/Sales/Dashboard/Analytics all wired; auth-gated.
- Stack: **Vite + React 18 + TypeScript** SPA, plain CSS w/ design tokens. Theming (dark/accent/density) works via `localStorage`. Builds clean (`npm run build`).
- `src/types.ts` now holds only `ViewId`; domain types live with their data layers.

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
5. **Auth model: two roles — `owner` + `staff`** (changed 2026-06-03; was single-role). `users.role` column. The **first** account created on an empty DB is automatically the **owner**. The owner manages everything (shop settings + account management: add / remove accounts, reset anyone's password). **Staff** use the whole shop normally but cannot manage accounts or shop settings; they can change **their own** password (requires the current password). Owner-only API is gated by `requireOwner()`; account creation now happens via owner-only `POST /api/users` (the public `/api/auth/register` is first-account-only).
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

- **2026-06-03 (Claude):** **Responsive + dark-mode + dev-DB session (all pushed to `origin/main`, deployed to the VPS).** (1) **Shared dev DB:** pointed local `server/.env` at the VPS Postgres via an SSH tunnel (`localhost:5433`); added a DEV-ONLY `/uploads` fallback (`UPLOADS_FALLBACK_URL`, env-gated, never set on VPS) since the DB is shared but upload *files* aren't — established the rule "upload product images on the LIVE site." (2) **Responsive pass:** `thinLabels` for dense chart ranges; phone card-view for Inventory + Sales-history tables; bigger mobile tap targets. (3) **Bug fixes:** dark-mode black text on `.product-pick` (added `color: var(--ink)`); Sales-history `table-flush` overflow removed. (4) **Density picker → draggable slider.** (5) Dropped Refunds + low-stock-badge from the TODO. All built clean (root+server) and deployed via the `DEPLOY.md` update routine (`git reset --hard origin/main` + `npm run build` + `pm2 restart`). More responsive work (other tables, `.seg` cleanup) deferred — see TODO #6.
- **2026-06-03 (Claude):** **Polish batch — analytics range, sales filters, inventory 2-state, bell removed.** Brainstormed → spec (`docs/superpowers/specs/2026-06-03-…-design.md`) → plan (`docs/superpowers/plans/2026-06-03-…`) → executed via subagents on branch `feat/analytics-sales-inventory-polish`. (1) Removed the unwired Topbar notification bell. (2) Inventory status → `มีของ`/`หมด` only (dropped `เหลือน้อย`; `products.low` + Dashboard card + Settings threshold left intact). (3) `/api/stats?range=` (7d/30d/90d/1y/all, default all) recomputes KPIs/tables/charts with daily-vs-monthly bucketing; inventory-value/in-stock/low-stock stay snapshots; `AnalyticsView` preset selector. (4) `/api/sales` gained `from/to/q/limit/offset` + returns `{ sales, total }`; history tab has date filter + debounced search + 25/page pagination (also fixed `DashboardView`'s `fetchSales` call). tsc(root+server)+build all clean. **NOT yet runtime-verified against the live DB** (needs a logged-in session over the SSH tunnel) and **not yet merged to main**. Also: local `server/.env` now points at the **shared VPS Postgres via SSH tunnel** (`localhost:5433` → VPS 5432) so dev + prod use one DB.
- **2026-06-03 (Claude):** **DEPLOYED — app is LIVE at http://194.233.88.142:3000.** Walked the user through the `DEPLOY.md` VPS steps: installed Node v20.20.2 + pm2 7.0.1 + PostgreSQL 16.14, created DB/user `nyit`, cloned to `/opt/nyit-app` (user made the repo **public**), wrote `server/.env` with fresh secrets (`COOKIE_SECURE=false`, http), `npm install` + `npm run build` + `npm run migrate` (✅ schema applied), started under pm2 as `nyit-app` (single-port: Fastify serves `dist/`+`/api`+`/uploads`). Health + logs confirm it's online; user confirmed the site loads (and is fast). `ufw` inactive so port 3000 is open. **Follow-ups (small):** confirm pm2 boot-persistence (`pm2 startup`+`save`), install nightly `pg_dump` backup cron, later add subdomain+HTTPS (then `COOKIE_SECURE=true`). NOTE: user prefers Claude **push to GitHub only when asked** — local commits OK.
- **2026-06-03 (Claude):** **Deploy prep + VPS recon.** Ran read-only recon on the Contabo VPS: Ubuntu 24.04, root, **Apache on 80/443 + MySQL on 3306 already serving live sites** (incl. an existing PHP/MySQL stock system at `/var/www/stock.nyit` + a `stock_system.sql` dump). Node/Postgres not installed; port 3000 free. **Plan (locked w/ user):** deploy the new app alongside, untouched, **single-port `http://<IP>:3000`** (Fastify serves `dist/` + API), its own Postgres (coexists w/ MySQL), **fresh data** (no old-data migration; old system kept as backup). Repo prep: Fastify now serves the built frontend + SPA fallback (`index.ts`), cookie `secure` env-driven (`COOKIE_SECURE`), `.env.example` updated, wrote **`DEPLOY.md`** (full Ubuntu runbook + update routine + backups + later subdomain/HTTPS). Tested single-port serving locally; pushed all to GitHub (repo is **private** → VPS clone needs a PAT). **Stopped at:** user to run the `DEPLOY.md` VPS steps (Claude can't SSH in). See CURRENT NEXT STEP #3.
- **2026-06-03 (Claude):** Slimmed Settings per user — shop info card reduced to just the default low-stock threshold (other shop_settings columns kept in DB, not edited in UI); account management unchanged.
- **2026-06-03 (Claude):** **Settings page + owner/staff roles.** Human chose owner-only account management → **changed LOCKED #5 from single-role to two roles** (`users.role` owner/staff; first account = owner; idempotent migration adds the column + promotes the earliest account; ran it — `test2` is now owner). Backend: `requireOwner()` guard in `auth.ts`; `register` is now first-account-only; new `routes/users.ts` (list/add/delete accounts owner-only, `PUT /:id/password` — owner resets anyone, staff changes own w/ current pw; guards block deleting self / the last owner) + `routes/settings.ts` (`GET` any-auth, `PUT` owner-only). **Bug fixed:** `currentUser` now coerces `id` to a number (pg returns bigint as string, so `id === me.id` self-checks were silently false). Frontend: `data/settings.ts` layer, `SettingsView` (shop-info card owner-only, change-my-password card for everyone, account-management card owner-only with inline pw reset + add-account form), `settings` ViewId + wired sidebar button + Topbar title fallback, `ApiUser.role`, Add-Product reorder point prefilled from `default_low`. tsc(both)+build clean; 15/15 endpoint smoke tests pass; test data cleaned. **Stopped at:** optional polish (#2) or deploy (#3) — see CURRENT NEXT STEP.
- **2026-06-03 (Claude):** Fixed chart axis labels (BarChart + AreaChart): `preserveAspectRatio="none"` was horizontally distorting in-SVG `<text>` into an unreadable smear — moved labels to HTML rows below each chart; AreaChart line now uses `vector-effect: non-scaling-stroke` for a crisp constant-width line.
- **2026-06-03 (Claude):** **Dashboard + Analytics + final cleanup.** Built `routes/stats.ts` (one `/api/stats` endpoint: month KPIs w/ deltas, all-time totals, 7-day trend vs prev week, 12-month sales/profit/orders, inventory value, in/out movement from serials, category share + units, top products, low-stock, bundle performance). New `src/data/stats.ts`. Rewrote `DashboardView` + `AnalyticsView` to real data (kept SVG charts; removed decorative range/export + PO buttons; real date/greeting). **Deleted mock `src/data/catalog.ts`**, removed Sidebar low-count badge, trimmed `src/types.ts` to just `ViewId`. Smoke-tested `/api/stats` live. tsc+build clean. **Data wiring of all 6 screens is COMPLETE.** Next: Settings page / polish (see CURRENT NEXT STEP).
- **2026-06-03 (Claude):** **Sales module.** `routes/sales.ts` atomic checkout (FIFO serial→sold, stock_movements, 409 on insufficient stock) + history; `src/data/sales.ts`; rewrote `SalesView` (item cart capped at stock, bundle picker + set qty, optional customer, shipping/discount, success screen, history). **Removed the whole payment section per user.** Staff auto = logged-in user. Smoke-tested live (sold 2 → stock 3→1, totals/profit correct, oversell→409), test data cleaned. tsc+build clean. **Stopped at:** Dashboard/Analytics (see CURRENT NEXT STEP).
- **2026-06-03 (Claude):** **Bundles module.** Built `routes/bundles.ts` (CRUD; bundle list includes component products w/ derived stock + sold count; registered in index.ts). New `src/data/bundles.ts` (computes list_price/price/profit/min-stock from live components). Rewrote `BundlesView` to real API (list cards w/ edit+delete, create/edit form w/ real product picker + discount slider). Smoke-tested bundle CRUD live (throwaway records). tsc+build clean. Note: user said Inventory may be restructured later ("might drop tables/redo") — fine, it's a base. **Stopped at:** Sales module (see CURRENT NEXT STEP).
- **2026-06-03 (Claude):** Finished Inventory: **edit product** (AddProductView edit mode + App `editProductId`/`editProduct`, edit button in ProductDetail, serials card hidden when editing) and **categories management** (`CategoriesView` + `categories` nav item, full CRUD). Flexible warranty (presets + custom months). Smoke-tested product PUT/DELETE + category PUT/DELETE live via a minted session (throwaway records only — user data untouched). tsc+build clean. **Stopped at:** Bundles module (needs backend `routes/bundles.ts` first — see CURRENT NEXT STEP).
- **2026-06-03 (Claude):** Wired the **Inventory frontend** to the real API. New `src/data/inventory.ts` data layer. Rewrote `InventoryView` (real list, filters, active/draft tabs, product-detail with per-unit serial add/remove, delete) and `AddProductView` (real create + draft + serial entry + photo upload). Added `.chip-x` style; App passes showToast to Inventory. tsc + vite build clean. Mock `catalog.ts` kept for unwired views. **Stopped at:** categories-management UI + edit-product (see CURRENT NEXT STEP step 1).
- **2026-06-03 (Claude):** Kicked off the "make it all real" job. Removed global topbar search. Locked the **inventory model** with the human (full per-unit serials, editable categories, real photos, drafts kept, PO buttons removed — LOCKED #9). Reworked `schema.sql` (products: dropped stored `stock`, `sku` nullable, added `status` active/draft + partial unique sku; `product_serials.created_at`; seeded 8 categories; idempotent ALTERs to converge the dev DB). Added deps `@fastify/multipart` + `@fastify/static`. Built backend: `routes/categories.ts` (CRUD), rewrote `routes/products.ts` (derived stock, draft status filter, serials add/remove, product+serials detail), `routes/uploads.ts` (image upload). Registered all in `index.ts`; Vite proxies `/uploads`. Smoke-tested the whole surface via curl (create w/ serials, derived stock, dup-serial 409, draft no-sku, upload 201 + static serve 200), then cleared test data. **Stopped at:** frontend Inventory UI (see CURRENT NEXT STEP step 1).
- **2026-06-03 (Claude):** Human installed Postgres (Windows) + created DB `nyit` + set `server/.env`; migrate ran clean. Added `GET /api/auth/needs-setup`. Built the **frontend login gate**: `src/lib/api.ts` (fetch wrapper, `credentials:'include'`, `api` + `http`), `src/auth/AuthContext.tsx` (`AuthProvider`/`useAuth`), `src/views/LoginView.tsx` (Thai login + first-account-setup). Gated `App.tsx` (loading → login → shell), added logout to Topbar + real user in Sidebar, `lock`/`logout` icons, `.auth` styles. Verified the whole auth flow live (curl) then truncated `users` so first-run UX is clean. Both typechecks pass. **Stopped at:** next code task = wire the products data layer (seed categories first — see CURRENT NEXT STEP).
- **2026-06-01 (Claude):** Locked hosting/DB decisions (Full VPS on Contabo, native Postgres, no Docker, Fastify, single-role auth w/ multi-account). Scaffolded `server/` (Fastify + pg + auth + products/categories + schema + migrate) and added the Vite `/api` proxy. **Stopped at:** human to install Postgres + run migrate; next code task = frontend login gate, then wire the products data layer.
- **2026-06-01 (Codex):** Reopened backend decision after learning the owner has a Contabo VPS reached via FileZilla; documented VPS-vs-managed trade-offs; pointed `CLAUDE.md` at this file.
- **2026-06-01 (Claude):** Built the full UI from the Claude Design handoff (6 responsive screens, theming). Chose Vite/React/TS. Wrote the initial handoff.
