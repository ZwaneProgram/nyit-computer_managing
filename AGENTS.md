# AGENTS — Nyit Computer · live project handoff

> **Any AI agent (Codex, Claude, etc.) entering this repo: READ THIS FILE FIRST, top to bottom.**
> It is the single source of truth for what's built, what was decided, and what to do next.
> The human switches between agents when tokens run low — so **keep this file updated**:
> at the end of every working session, update the **Progress log** and the **CURRENT NEXT STEP**.

---

## ⏭️ CURRENT NEXT STEP (do this first)

**We are at the start of "Phase 0 — Foundation." Nothing is wired to a database yet.**

Latest conversation changed the deployment assumption: the owner appears to have bought a **Contabo Cloud VPS**, and the human thinks we may need to use it instead of Supabase/Vercel. FileZilla is only an upload tool; the real question is whether we have VPS-level access.

Do this first:
1. Confirm VPS access and facts from the human/owner:
   - Do we have SSH/root access, or only FileZilla?
   - OS: Ubuntu/Debian/Windows/other?
   - Specs: RAM, CPU, disk.
   - Domain/DNS access.
   - Is anything already running on the VPS?
   - Control panel, if any: cPanel, DirectAdmin, Plesk, CyberPanel, custom, none.
2. If SSH/root access exists, plan a VPS stack before coding:
   - Caddy or Nginx for HTTPS/domain.
   - Node.js API (Fastify/Express) for auth, products, sales, uploads.
   - PostgreSQL on the VPS.
   - Local uploads folder for product images.
   - Daily backups for Postgres + uploads.
3. Confirm the **owner-vs-staff permission matrix** (see "Open decisions" below). It still shapes auth, API permissions, and database design.
4. Then scaffold the chosen backend/database foundation.

**Do not skip ahead to building features before the DB + auth foundation exists.**

---

## What this project is

A **Thai-language stock & sales management web app for a computer shop** ("Nyit Computer"). Used by **1 owner + 1–2 staff**, low traffic. Must be hosted on a real domain, accessible by owner and staff.

## Current state (what's actually built)

- A **complete, responsive UI** — all 6 screens designed and interactive, but **every screen runs on MOCK data** in `src/data/catalog.ts`. Forms only show a toast; nothing persists. Analytics are hard-coded numbers.
- Stack: **Vite + React 18 + TypeScript** SPA. Plain CSS with design tokens. No backend yet.
- Theming works for real: dark/light, accent color, row density — persisted to `localStorage`.
- Builds clean (`npm run build`, strict TS passes). Dev server verified serving.

### Commands
```bash
npm install
npm run dev      # http://localhost:5173 ; also exposes a LAN URL for phone/tablet testing
npm run build    # tsc -b + vite build → dist/
npm run preview
```

### File structure
```
src/
  main.tsx, App.tsx          shell: sidebar / topbar / router / toast / mobile drawer
  styles.css                 design tokens + all component styles + responsive layers
  types.ts                   domain types (Product, Bundle, Txn, ViewId, ...)
  data/
    catalog.ts               *** MOCK DATA — this is what gets replaced by Supabase ***
    format.ts                Thai currency/number formatters
  hooks/                     useTheme (dark/accent/density), useMediaQuery
  components/                Sidebar, Topbar, MobileNav, SettingsMenu, Icons,
                             charts/ (Sparkline, BarChart, Donut, AreaChart — pure SVG)
  views/                     DashboardView, InventoryView, AddProductView,
                             BundlesView, SalesView, AnalyticsView
```

**Key architecture rule for the DB work:** the data layer is isolated in `src/data/`. Replace the mock arrays/helpers (`PRODUCTS`, `productById`, etc.) with async calls **while keeping the shapes in `src/types.ts` the same**, so the views barely change. Views import from `data/`, never hit the backend/database directly — add `src/data/` API modules (e.g. `products.ts`, `sales.ts`) that wrap fetch/Supabase calls depending on the final backend choice.

---

## Decisions already locked (do not re-litigate without reason)

1. **Frontend: Vite + React + TypeScript** (chosen over Next.js). It's an internal dashboard behind a login — no SEO need; SPA gives snappier click-to-click interaction. Next.js's SSR/RSC would add complexity for no benefit here.
2. **Backend + DB decision is reopened.** Earlier recommendation was Supabase over Neon because Supabase bundles Postgres + Auth + Storage with no server admin. Latest human direction: owner likely has a **Contabo Cloud VPS**, and we may need to use that instead.
3. **If using Contabo VPS:** prefer a conventional VPS stack: React static frontend + Node.js API + PostgreSQL + local uploads + Caddy/Nginx HTTPS + backups. Do not put database credentials or FileZilla/FTP credentials in the browser.
4. **If VPS access is not sufficient:** fall back to the earlier recommendation: Vercel/Cloudflare for frontend + Supabase for Postgres/Auth/Storage.
5. **FileZilla is not a backend.** It can upload files to the server, but only SSH/root or a real control panel tells us whether the VPS can run the app stack.
6. **Cost target: near-free.** Only real cost is a domain (~$10/yr), not needed until launch.
7. **Language: Thai UI** throughout. Mobile responsive required. Keep components modular; avoid unnecessary complexity.

---

## Latest planning notes — Contabo / FileZilla / Supabase

- The human discovered the owner has hosting accessed through **FileZilla**, then clarified it is probably a **Contabo Cloud VPS**.
- FileZilla itself is only a file transfer tool. It does not mean the server can run the app by itself.
- If the owner only gives FileZilla/FTP access, that is mostly useful for uploading static frontend files and maybe manually uploaded public assets. It is not enough for login, database, secure image upload, stock transactions, or analytics.
- If the owner gives **SSH/root access** to the Contabo VPS, we can run the whole app there:
  - Caddy/Nginx for HTTPS and domain routing.
  - React/Vite static build for frontend.
  - Node.js backend API for auth, roles, CRUD, sales transactions, and image uploads.
  - PostgreSQL installed on the VPS.
  - Product images stored in a server uploads folder and served publicly through the web server.
  - Daily backups for database dumps and uploaded images.
- This is possible, but it creates server responsibilities that Supabase/Vercel would have handled: security updates, firewall, SSL, backups, upload validation, auth/session security, and recovery if the VPS breaks.
- Current preference from the human: likely use the Contabo VPS instead of Supabase, but do **not** implement until VPS access/specs are confirmed.

---

## Open decisions (decide before/at the relevant phase)

### A. Owner vs Staff permissions — **NEXT, confirm this**
Proposed default (confirm or edit):

| Capability | Owner | Staff |
|---|---|---|
| View inventory, make sales, create/edit products & bundles, adjust stock | ✅ | ✅ |
| See **cost & profit** figures (margins, profit analytics, cost column) | ✅ | ❌ (sees prices only) |
| Delete products / bundles / sales | ✅ | ❌ |
| Refunds / returns | ✅ | ✅ (or owner-only?) |
| Manage staff/users | ✅ | ❌ |
| Change shop settings (receipt info, categories, thresholds) | ✅ | ❌ |
| View analytics (sales) | ✅ | ✅ (sales) / profit owner-only |

### B. Later decisions
- Receipt format (print vs PDF; what fields/logo).
- CSV import format for bulk product upload (if wanted).
- Whether to keep saved **customers** (CRM) or just free-text customer info per sale.
- Final hosting/backend path:
  - Contabo VPS all-in-one: frontend + API + Postgres + uploads.
  - Managed split: Vercel/Cloudflare frontend + Supabase backend.
  - Hybrid: FTP/static frontend + managed backend.

---

## Proposed data model (Postgres)

Core tables (build these first). If using Supabase, `auth.users` is Supabase-managed. If using the VPS, create our own `users` table and make `profiles.id` reference it instead.

```
profiles            id (=auth.users.id), full_name, role ('owner'|'staff'), created_at
categories          id, name, slug, sort
products            id, category_id→categories, name, sku (unique), brand, model,
                    cost, price, stock, low (reorder point), warranty_months,
                    image_url, notes, created_by→profiles, created_at, updated_at
product_serials     id, product_id→products, serial (unique), 
                    status ('in_stock'|'sold'|'returned'), sale_id→sales (nullable)
bundles             id, name, discount_pct, created_by, created_at   (price/cost derived from items)
bundle_items        bundle_id→bundles, product_id→products            (PK: both)
sales               id, kind ('item'|'bundle'), customer_name, customer_phone,
                    customer_address, tax_id, payment_method ('cash'|'transfer'|'card'|'qr'),
                    payment_status ('paid'|'pending'|'partial'),
                    shipping, discount, subtotal, total, profit,
                    staff_id→profiles, created_at, status ('paid'|'pending'|'refunded')
sale_items          id, sale_id→sales, product_id (nullable), bundle_id (nullable),
                    qty, unit_price, unit_cost
stock_movements     id, product_id→products, delta (+/-),
                    reason ('purchase'|'sale'|'adjustment'|'return'),
                    ref_sale_id (nullable), note, created_by, created_at
shop_settings       id (singleton row), shop_name, address, tax_id, phone,
                    default_low, currency
```

Later / optional: `customers`, `suppliers`, `purchase_orders` (the "สั่งเพิ่ม / สร้างใบสั่งซื้อ" restock flow).

**Behavior to implement (not just tables):**
- A sale **deducts stock** and writes `stock_movements` rows + flips matching `product_serials` to `sold`. Do this in a Postgres function / transaction (RPC) so it's atomic.
- Low-stock alerts = `products` where `stock <= low`.
- Analytics = SQL aggregations over `sales` / `sale_items` / `stock_movements` (replace hard-coded numbers).

---

## Full roadmap (build in this order; one module per session)

- **Phase 0 — Foundation:** choose/verify backend path · schema · Auth (login + roles) · permissions · deployment/security/backups. *(current)*
- **Phase 1 — Inventory:** product CRUD, categories, serial tracking, image upload, stock + reorder points, manual stock adjustments, real low-stock alerts, CSV export.
- **Phase 2 — Bundles:** bundle CRUD, auto price/cost from components, stock validation.
- **Phase 3 — Sales/Checkout:** real checkout (single + bundle) with atomic stock deduction + serial assignment, customer capture, payment/shipping/discount, real sales history, receipt print/PDF, refunds/returns.
- **Phase 4 — Analytics:** real aggregations (sales, profit, top sellers, category share, stock movement, bundle performance) + date-range filtering + export.
- **Phase 5 — Cross-cutting:** global search (⌘K), notifications (bell → low stock), settings page (shop info, payment methods, shipping rates, default thresholds, staff management), loading/error/empty states, form validation.
- **Later (YAGNI for now):** customers/CRM · suppliers & purchase orders · multi-branch · barcode/QR scanning.

---

## Conventions & gotchas for agents

- **Do NOT read files under `node_modules/`** unless truly necessary — it wastes the human's tokens. Prefer docs / type signatures / public API.
- Keep the **Thai UI**. Match existing component style in `src/`. Keep it mobile responsive.
- Keep the **data layer isolated** (`src/data/`); don't scatter backend/database calls through views.
- Never expose secrets in frontend code. If using Supabase, the `anon` key is safe only because RLS protects the data; never expose `service_role`. If using VPS, never expose database credentials, JWT/session secrets, or FTP credentials.
- **Git repo exists** (`.git` is present and `main` tracks a GitHub origin), but this Codex shell currently cannot run `git` because the command is not installed/available in PATH.
- There is **no formal spec doc committed**; the decisions above ARE the spec. If you do a big design, you may write one under `docs/`.

---

## Progress log (append newest at top)

- **2026-06-01 (Codex):** Discussed FileZilla vs Vercel/Supabase, then learned the hosting is probably a Contabo Cloud VPS. Explained that FileZilla alone is just file upload, but a real VPS with SSH/root can run frontend + Node API + PostgreSQL + uploads. Updated this handoff to reopen the backend decision: latest likely direction is Contabo VPS, but first confirm SSH/root access, OS, specs, DNS, and whether anything is already running. **Stopped at:** letting Claude continue planning the VPS foundation before implementation.
- **2026-06-01 (Codex):** Read `AGENTS.md`, `CLAUDE.md`, `README.md`, and the pasted Claude transcript. Confirmed the handoff is mostly complete: Supabase/cloud hosting decision is captured, owner server is out of scope at that time, and Phase 0 is still blocked on confirming owner/staff permissions. Fixed `CLAUDE.md` to point agents to `AGENTS.md` and corrected the git note. **Stopped at:** asking the human to confirm the permission matrix before Supabase scaffolding.
- **2026-06-01 (Claude):** Built the full UI from the Claude Design handoff (6 responsive screens, theming). Decided stack (Vite/React/TS), DB (Supabase over Neon), architecture (SPA + RLS, no backend), hosting plan (local dev now → Vercel/Cloudflare later, owner's server out of scope). Wrote this handoff. **Stopped at:** confirming the owner/staff permission matrix (Open decision A) before scaffolding Supabase.
