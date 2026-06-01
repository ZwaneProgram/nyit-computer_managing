# AGENTS — Nyit Computer · live project handoff

> **Any AI agent (Codex, Claude, etc.) entering this repo: READ THIS FILE FIRST, top to bottom.**
> It is the single source of truth for what's built, what was decided, and what to do next.
> The human switches between agents when tokens run low — so **keep this file updated**:
> at the end of every working session, update the **Progress log** and the **CURRENT NEXT STEP**.

---

## ⏭️ CURRENT NEXT STEP (do this first)

**We are at the start of "Phase 0 — Foundation." Nothing is wired to a database yet.**

The immediate next decision (needs the human to confirm) is the **owner-vs-staff permission matrix** (see "Open decisions" below). A sensible default is proposed there — confirm or adjust it, because it shapes the database schema and the Row-Level Security rules.

After that's confirmed, in order:
1. Human creates a free **Supabase** project (we'll guide the clicks). Get `Project URL` + `anon` key.
2. Add `@supabase/supabase-js`; create `src/lib/supabase.ts`; put keys in `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). **Never commit the `service_role` key.**
3. Create the database schema (see "Proposed data model").
4. Build Auth (login screen, session handling, roles) + Row-Level Security policies.
5. Then proceed module-by-module per the Roadmap.

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

**Key architecture rule for the DB work:** the data layer is isolated in `src/data/`. Replace the mock arrays/helpers (`PRODUCTS`, `productById`, etc.) with async Supabase queries **while keeping the shapes in `src/types.ts` the same**, so the views barely change. Views import from `data/`, never hit Supabase directly — add a `src/data/` API module (e.g. `products.ts`, `sales.ts`) that wraps Supabase calls.

---

## Decisions already locked (do not re-litigate without reason)

1. **Frontend: Vite + React + TypeScript** (chosen over Next.js). It's an internal dashboard behind a login — no SEO need; SPA gives snappier click-to-click interaction. Next.js's SSR/RSC would add complexity for no benefit here.
2. **Backend + DB: Supabase** (Postgres + Auth + Storage), chosen over Neon. Reason: Supabase bundles **auth + file storage + auto API**, all on a free tier, with **no server administration** (just a web dashboard). Neon is database-only — would mean building our own auth and bolting on separate file storage. Free tier (500 MB DB, 50k auth users, 1 GB storage) far exceeds a 3-person shop's needs.
   - Caveat: free Supabase projects **pause after 7 days of zero DB activity** (one click in the dashboard to resume). A daily-used shop never hits this. $25/mo Pro removes it later if ever needed.
3. **App architecture: SPA talks directly to Supabase** via `@supabase/supabase-js`, secured by **Row-Level Security (RLS)**. **No custom backend server** to build or host.
4. **Hosting plan:** develop locally now (`npm run dev`) against the cloud Supabase project. When ready to go live, deploy the static build to **Vercel or Cloudflare Pages (free)** + connect the owner's domain. ~5 min, still no server admin.
5. **The owner's own server is OUT OF SCOPE.** Specs/OS unknown; we don't design around it. The app is portable (static files + portable Postgres), so self-hosting there is an optional future path, not a requirement.
6. **Cost target: near-free.** Only real cost is a domain (~$10/yr), not needed until launch.
7. **Language: Thai UI** throughout. Mobile responsive required. Keep components modular; avoid unnecessary complexity.

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

---

## Proposed data model (Supabase / Postgres)

Core tables (build these first). `auth.users` is Supabase-managed.

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

- **Phase 0 — Foundation:** Supabase project · client + `.env` · schema · Auth (login + roles) · RLS. *(current)*
- **Phase 1 — Inventory:** product CRUD, categories, serial tracking, image upload (Supabase Storage), stock + reorder points, manual stock adjustments, real low-stock alerts, CSV export.
- **Phase 2 — Bundles:** bundle CRUD, auto price/cost from components, stock validation.
- **Phase 3 — Sales/Checkout:** real checkout (single + bundle) with atomic stock deduction + serial assignment, customer capture, payment/shipping/discount, real sales history, receipt print/PDF, refunds/returns.
- **Phase 4 — Analytics:** real aggregations (sales, profit, top sellers, category share, stock movement, bundle performance) + date-range filtering + export.
- **Phase 5 — Cross-cutting:** global search (⌘K), notifications (bell → low stock), settings page (shop info, payment methods, shipping rates, default thresholds, staff management), loading/error/empty states, form validation.
- **Later (YAGNI for now):** customers/CRM · suppliers & purchase orders · multi-branch · barcode/QR scanning.

---

## Conventions & gotchas for agents

- **Do NOT read files under `node_modules/`** unless truly necessary — it wastes the human's tokens. Prefer docs / type signatures / public API.
- Keep the **Thai UI**. Match existing component style in `src/`. Keep it mobile responsive.
- Keep the **data layer isolated** (`src/data/`); don't scatter Supabase calls through views.
- `anon` key is safe to ship in the client **only because RLS protects the data** — so every table needs RLS policies. Never expose the `service_role` key in frontend code.
- **No git repo yet.** Consider `git init` for safer cross-agent continuity (each session = a commit).
- There is **no formal spec doc committed**; the decisions above ARE the spec. If you do a big design, you may write one under `docs/`.

---

## Progress log (append newest at top)

- **2026-06-01 (Claude):** Built the full UI from the Claude Design handoff (6 responsive screens, theming). Decided stack (Vite/React/TS), DB (Supabase over Neon), architecture (SPA + RLS, no backend), hosting plan (local dev now → Vercel/Cloudflare later, owner's server out of scope). Wrote this handoff. **Stopped at:** confirming the owner/staff permission matrix (Open decision A) before scaffolding Supabase.
