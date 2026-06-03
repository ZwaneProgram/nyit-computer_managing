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

**Next, in order:**
1. **Wire Inventory** — replace mock `PRODUCTS` in `src/data/catalog.ts` with calls to `/api/products` via `http.get/post/put/del` (keep the `Product` shape in `src/types.ts`; note backend product fields are snake_case — map them). Then AddProduct → `POST /api/products`. **NOTE:** backend `category_id` is an int FK to a `categories` table that is currently empty — seed categories (the 8 in `CATEGORIES`) or adjust before wiring.
2. Continue the Roadmap (bundles → sales → analytics → cross-cutting).

**Do not build features before the products data-layer wiring work.**

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

---

## Data model (PostgreSQL) — see `server/src/schema.sql` for the authoritative version

`users` (id, username unique, password_hash, full_name) · `categories` · `products`
`product_serials` · `bundles` + `bundle_items` · `sales` + `sale_items`
`stock_movements` · `shop_settings` (singleton). Later/optional: `customers`, `suppliers`, `purchase_orders`.

**Behavior to implement (not just tables):**
- A sale must **deduct stock**, write `stock_movements`, and flip matching `product_serials` to `sold` — do it in a single transaction (a Postgres function/RPC or a `BEGIN/COMMIT` in the API) so it's atomic.
- Low-stock alerts = `products` where `stock <= low`.
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

- **2026-06-03 (Claude):** Human installed Postgres (Windows) + created DB `nyit` + set `server/.env`; migrate ran clean. Added `GET /api/auth/needs-setup`. Built the **frontend login gate**: `src/lib/api.ts` (fetch wrapper, `credentials:'include'`, `api` + `http`), `src/auth/AuthContext.tsx` (`AuthProvider`/`useAuth`), `src/views/LoginView.tsx` (Thai login + first-account-setup). Gated `App.tsx` (loading → login → shell), added logout to Topbar + real user in Sidebar, `lock`/`logout` icons, `.auth` styles. Verified the whole auth flow live (curl) then truncated `users` so first-run UX is clean. Both typechecks pass. **Stopped at:** next code task = wire the products data layer (seed categories first — see CURRENT NEXT STEP).
- **2026-06-01 (Claude):** Locked hosting/DB decisions (Full VPS on Contabo, native Postgres, no Docker, Fastify, single-role auth w/ multi-account). Scaffolded `server/` (Fastify + pg + auth + products/categories + schema + migrate) and added the Vite `/api` proxy. **Stopped at:** human to install Postgres + run migrate; next code task = frontend login gate, then wire the products data layer.
- **2026-06-01 (Codex):** Reopened backend decision after learning the owner has a Contabo VPS reached via FileZilla; documented VPS-vs-managed trade-offs; pointed `CLAUDE.md` at this file.
- **2026-06-01 (Claude):** Built the full UI from the Claude Design handoff (6 responsive screens, theming). Chose Vite/React/TS. Wrote the initial handoff.
