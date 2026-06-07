# Tailwind Responsive Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Tailwind CSS v4 to the Nyit Shop project and use it to fix all responsive layout issues across every screen, while keeping the existing CSS-variable-based theming (dark mode, accent colours, density) completely intact.

**Architecture:** Tailwind handles responsive column layouts (`sm:`, `md:`, `lg:`, `xl:`); the existing `styles.css` keeps all design tokens, dark-mode rules, and component styles. The two systems coexist — our unlayered CSS rules always win over Tailwind's layered utilities when there is a conflict. Five tables that still scroll on phones are fixed by adding the existing `tbl-cards` card-view pattern.

**Tech Stack:** Tailwind CSS v4, `@tailwindcss/vite` Vite plugin, React 18, TypeScript, Vite 6

---

## Breakpoint mapping (Tailwind prefix → project px)

| Prefix | px   | What happens                                 |
|--------|------|----------------------------------------------|
| base   | 0+   | Phone: 1 col, card-view tables               |
| `sm:`  | 600px | Tablet: 2-col grids, normal tables           |
| `md:`  | 900px | Sidebar appears, full nav                   |
| `lg:`  | 1100px | 3-4 col grids, 12-col splits, sticky aside |
| `xl:`  | 1600px | Wider sidebar/content                      |

---

## File map

| File | Change |
|------|--------|
| `package.json` | `tailwindcss`, `@tailwindcss/vite` added as devDependencies |
| `vite.config.ts` | Add `tailwindcss()` plugin |
| `src/styles.css` | Add `@import "tailwindcss"` + `@theme` breakpoints; remove `.grid-4/.grid-3/.grid-2/.grid-12`, `.col-*`, `.form-grid-*`, `.seg/.seg-btn`, and their responsive overrides |
| `src/views/DashboardView.tsx` | Grid class replacements + low-stock table card-view |
| `src/views/AnalyticsView.tsx` | Grid class replacements + top-products & bundle table card-view |
| `src/views/SalesView.tsx` | Main layout grid + cart table card-view + form-grid |
| `src/views/InventoryView.tsx` | ProductDetail layout grid + serials table card-view |
| `src/views/AddProductView.tsx` | Two-column layout + form-grid replacements |
| `src/views/BundlesView.tsx` | Bundle cards grid + create/edit layout grid |
| `src/views/SettingsView.tsx` | Accounts table card-view |

---

## Task 1: Install Tailwind v4 and configure Vite

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 1: Install packages**

Run from the repo root:
```bash
npm install -D tailwindcss @tailwindcss/vite
```
Expected: exits 0, `node_modules/tailwindcss` and `node_modules/@tailwindcss/vite` appear.

- [ ] **Step 2: Add plugin to vite.config.ts**

Replace the entire file with:
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    host: true,
    proxy: {
      '/api': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000',
    },
  },
});
```

- [ ] **Step 3: Verify build still passes**

```bash
npm run build
```
Expected: `dist/` created, no TypeScript or Vite errors.

- [ ] **Step 4: Commit**

```bash
git add vite.config.ts package.json package-lock.json
git commit -m "chore: install Tailwind CSS v4 + Vite plugin"
```

---

## Task 2: Configure styles.css — add Tailwind, set breakpoints, remove replaced CSS

**Files:**
- Modify: `src/styles.css`

This is the biggest CSS edit. Do it in one pass, then verify the build.

- [ ] **Step 1: Add `@import` and `@theme` at the very top of `src/styles.css`**

Insert these lines as the first non-comment content, before the `/* ===== Design tokens ===== */` comment and the `:root` block:

```css
@import "tailwindcss";

@theme {
  /* Override Tailwind's default breakpoints to match this project's CSS media queries */
  --breakpoint-sm: 600px;
  --breakpoint-md: 900px;
  --breakpoint-lg: 1100px;
  --breakpoint-xl: 1600px;
}
```

- [ ] **Step 2: Remove the static grid-column and form-grid CSS rules**

Delete these blocks from the `/* Grids */` section (lines ~305-319 in the original file):

```css
/* DELETE these 10 lines entirely */
.grid-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.grid-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.grid-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.grid-12 { grid-template-columns: repeat(12, minmax(0, 1fr)); }
.col-8 { grid-column: span 8; }
.col-7 { grid-column: span 7; }
.col-5 { grid-column: span 5; }
.col-4 { grid-column: span 4; }
.col-6 { grid-column: span 6; }
.col-12 { grid-column: span 12; }
```

And delete the form-grid rules (lines ~318-319):
```css
/* DELETE these 2 lines entirely */
.form-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.form-grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; }
```

- [ ] **Step 3: Remove `.seg` and `.seg-btn` (density picker no longer uses them)**

Delete these 3 rules from the `/* Settings popover */` section:
```css
/* DELETE these 3 rules */
.seg { display: flex; background: var(--surface-sunk); border-radius: 8px; padding: 2px; }
.seg-btn { flex: 1; height: 30px; border: 0; background: transparent; border-radius: 6px; font-size: 12.5px; font-weight: 500; color: var(--ink-2); }
.seg-btn[data-active="true"] { background: var(--surface); color: var(--ink); box-shadow: var(--shadow-1); font-weight: 600; }
```

- [ ] **Step 4: Remove responsive overrides for the deleted layout classes**

In `@media (max-width: 1100px)`, delete these 3 lines (keep `.sticky-aside { position: static; }` and `topbar-search` lines):
```css
/* DELETE these 3 lines from the 1100px block */
  .grid-4 { grid-template-columns: repeat(2, 1fr); }
  .grid-3 { grid-template-columns: repeat(2, 1fr); }
  .col-8, .col-7, .col-5, .col-4, .col-6 { grid-column: span 12; }
```

In `@media (max-width: 600px)`, delete these 2 lines (keep everything else in the 600px block):
```css
/* DELETE these 2 lines from the 600px block */
  .grid-4, .grid-3, .grid-2 { grid-template-columns: 1fr; }
  .form-grid-2, .form-grid-3 { grid-template-columns: 1fr; }
```

- [ ] **Step 5: Verify build passes**

```bash
npm run build
```
Expected: clean build, no errors. The app layout may look broken at this point (grid classes missing in TSX) — that's OK, the next tasks fix each view.

- [ ] **Step 6: Commit**

```bash
git add src/styles.css
git commit -m "style: add Tailwind v4 config, remove replaced layout CSS"
```

---

## Task 3: Fix DashboardView — responsive grid + low-stock card-view

**Files:**
- Modify: `src/views/DashboardView.tsx`

- [ ] **Step 1: Replace grid-4 and grid-12 class names**

Make these replacements in `DashboardView.tsx`:

```tsx
// Line 72 — KPI row
// OLD:
<div className="grid grid-4">
// NEW:
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">

// Line 88 — Chart + donut row (outer)
// OLD:
<div className="grid grid-12">
// NEW:
<div className="grid grid-cols-1 lg:grid-cols-12">

// Line 89 — Chart card
// OLD:
<div className="card col-8">
// NEW:
<div className="card col-span-12 lg:col-span-8">

// Line 105 — Donut card
// OLD:
<div className="card col-4">
// NEW:
<div className="card col-span-12 lg:col-span-4">

// Line 123 — Top sellers + transactions row (outer)
// OLD:
<div className="grid grid-12">
// NEW:
<div className="grid grid-cols-1 lg:grid-cols-12">

// Line 124 — Top sellers card
// OLD:
<div className="card col-7">
// NEW:
<div className="card col-span-12 lg:col-span-7">

// Line 145 — Transactions card
// OLD:
<div className="card col-5">
// NEW:
<div className="card col-span-12 lg:col-span-5">
```

- [ ] **Step 2: Add card-view to the low-stock table**

The low-stock `<table>` starts at line 171. Apply `tbl-cards` and `data-label` attributes:

```tsx
// OLD:
<table className="tbl">
  <thead><tr><th>สินค้า</th><th>SKU</th><th style={{ textAlign: 'right' }}>คงเหลือ</th><th style={{ textAlign: 'right' }}>จุดสั่งซื้อ</th><th>สถานะ</th></tr></thead>
  <tbody>
    {stats.lowStock.map((p) => (
      <tr key={p.id}>
        <td><div className="product-cell">...</div></td>
        <td className="mono">{p.sku || '—'}</td>
        <td className="num" style={{ textAlign: 'right' }}>{p.stock}</td>
        <td className="num muted" style={{ textAlign: 'right' }}>{p.low}</td>
        <td>{p.stock === 0 ? ...}</td>
      </tr>
    ))}
    ...
  </tbody>
</table>

// NEW:
<table className="tbl tbl-cards">
  <thead><tr><th>สินค้า</th><th>SKU</th><th style={{ textAlign: 'right' }}>คงเหลือ</th><th style={{ textAlign: 'right' }}>จุดสั่งซื้อ</th><th>สถานะ</th></tr></thead>
  <tbody>
    {stats.lowStock.map((p) => (
      <tr key={p.id}>
        <td className="cell-primary"><div className="product-cell">...</div></td>
        <td className="mono" data-label="SKU">{p.sku || '—'}</td>
        <td className="num" data-label="คงเหลือ" style={{ textAlign: 'right' }}>{p.stock}</td>
        <td className="num muted" data-label="จุดสั่งซื้อ" style={{ textAlign: 'right' }}>{p.low}</td>
        <td data-label="สถานะ">{p.stock === 0 ? ...}</td>
      </tr>
    ))}
    ...
  </tbody>
</table>
```

- [ ] **Step 3: Build and verify**

```bash
npm run build
```
Expected: clean build. Dashboard should show 1-col on phones, 2-col at 600px, 4-col KPIs at 1100px.

- [ ] **Step 4: Commit**

```bash
git add src/views/DashboardView.tsx
git commit -m "feat: DashboardView responsive grid + low-stock card-view"
```

---

## Task 4: Fix AnalyticsView — responsive grid + table card-views

**Files:**
- Modify: `src/views/AnalyticsView.tsx`

- [ ] **Step 1: Replace grid class names**

```tsx
// Line 78 — headline KPI strip
// OLD:  <div className="grid grid-4">
// NEW:  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">

// Line 93 — sales tab outer grid
// OLD:  <div className="grid grid-12">
// NEW:  <div className="grid grid-cols-1 lg:grid-cols-12">

// Line 94 — bar chart card
// OLD:  <div className="card col-8">
// NEW:  <div className="card col-span-12 lg:col-span-8">

// Line 103 — donut card
// OLD:  <div className="card col-4">
// NEW:  <div className="card col-span-12 lg:col-span-4">

// Line 120 — top-products card
// OLD:  <div className="card col-7">
// NEW:  <div className="card col-span-12 lg:col-span-7">

// Line 141 — monthly summary card
// OLD:  <div className="card col-5">
// NEW:  <div className="card col-span-12 lg:col-span-5">

// Line 169 — inventory tab outer grid
// OLD:  <div className="grid grid-12">
// NEW:  <div className="grid grid-cols-1 lg:grid-cols-12">

// Line 170 — movement chart card
// OLD:  <div className="card col-7">
// NEW:  <div className="card col-span-12 lg:col-span-7">

// Line 179 — category units card
// OLD:  <div className="card col-5">
// NEW:  <div className="card col-span-12 lg:col-span-5">
```

- [ ] **Step 2: Add card-view to the top-products table (sales tab, line 124)**

```tsx
// OLD:
<table className="tbl" style={{ marginTop: -4 }}>
  <thead><tr><th>สินค้า</th><th style={{ textAlign: 'right' }}>จำนวน</th><th style={{ textAlign: 'right' }}>ยอดขาย</th><th style={{ textAlign: 'right' }}>กำไร</th></tr></thead>
  <tbody>
    {stats.topProducts.map((r) => (
      <tr key={r.id}>
        <td><div className="product-cell">...</div></td>
        <td className="num" style={{ textAlign: 'right' }}>{r.qty}</td>
        <td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{fmtTHB(r.revenue)}</td>
        <td className="num" style={{ textAlign: 'right', color: 'var(--pos)' }}>+{fmtTHB(r.profit)}</td>
      </tr>
    ))}
    ...
  </tbody>
</table>

// NEW:
<table className="tbl tbl-cards" style={{ marginTop: -4 }}>
  <thead><tr><th>สินค้า</th><th style={{ textAlign: 'right' }}>จำนวน</th><th style={{ textAlign: 'right' }}>ยอดขาย</th><th style={{ textAlign: 'right' }}>กำไร</th></tr></thead>
  <tbody>
    {stats.topProducts.map((r) => (
      <tr key={r.id}>
        <td className="cell-primary"><div className="product-cell">...</div></td>
        <td className="num" data-label="จำนวน" style={{ textAlign: 'right' }}>{r.qty}</td>
        <td className="num" data-label="ยอดขาย" style={{ textAlign: 'right', fontWeight: 600 }}>{fmtTHB(r.revenue)}</td>
        <td className="num" data-label="กำไร" style={{ textAlign: 'right', color: 'var(--pos)' }}>+{fmtTHB(r.profit)}</td>
      </tr>
    ))}
    ...
  </tbody>
</table>
```

- [ ] **Step 3: Add card-view to the bundle performance table (bundle tab, line 200)**

```tsx
// OLD:
<table className="tbl">
  <thead><tr><th>ชุด</th><th style={{ textAlign: 'right' }}>ขายไป</th><th style={{ textAlign: 'right' }}>ยอดรวม</th><th style={{ textAlign: 'right' }}>กำไรรวม</th><th style={{ textAlign: 'right' }}>อัตรากำไร</th></tr></thead>
  <tbody>
    {stats.bundlePerformance.map((b) => (
      <tr key={b.id}>
        <td><div style={{ fontWeight: 500 }}>{b.name}</div>...</td>
        <td className="num" style={{ textAlign: 'right' }}>{b.sold}</td>
        <td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{fmtTHB(b.revenue)}</td>
        <td className="num" style={{ textAlign: 'right', color: 'var(--pos)' }}>+{fmtTHB(b.profit)}</td>
        <td className="num" style={{ textAlign: 'right' }}>{b.margin}%</td>
      </tr>
    ))}
    ...
  </tbody>
</table>

// NEW:
<table className="tbl tbl-cards">
  <thead><tr><th>ชุด</th><th style={{ textAlign: 'right' }}>ขายไป</th><th style={{ textAlign: 'right' }}>ยอดรวม</th><th style={{ textAlign: 'right' }}>กำไรรวม</th><th style={{ textAlign: 'right' }}>อัตรากำไร</th></tr></thead>
  <tbody>
    {stats.bundlePerformance.map((b) => (
      <tr key={b.id}>
        <td className="cell-primary"><div style={{ fontWeight: 500 }}>{b.name}</div>...</td>
        <td className="num" data-label="ขายไป" style={{ textAlign: 'right' }}>{b.sold}</td>
        <td className="num" data-label="ยอดรวม" style={{ textAlign: 'right', fontWeight: 600 }}>{fmtTHB(b.revenue)}</td>
        <td className="num" data-label="กำไรรวม" style={{ textAlign: 'right', color: 'var(--pos)' }}>+{fmtTHB(b.profit)}</td>
        <td className="num" data-label="อัตรากำไร" style={{ textAlign: 'right' }}>{b.margin}%</td>
      </tr>
    ))}
    ...
  </tbody>
</table>
```

- [ ] **Step 4: Build and verify**

```bash
npm run build
```
Expected: clean build.

- [ ] **Step 5: Commit**

```bash
git add src/views/AnalyticsView.tsx
git commit -m "feat: AnalyticsView responsive grid + table card-views"
```

---

## Task 5: Fix SalesView — main layout + cart card-view + form-grid

**Files:**
- Modify: `src/views/SalesView.tsx`

- [ ] **Step 1: Replace grid-12 and col-* classes in the new-bill layout**

```tsx
// Line 248 — outer two-col grid
// OLD:  <div className="grid grid-12">
// NEW:  <div className="grid grid-cols-1 lg:grid-cols-12">

// Line 249 — left (items) column
// OLD:  <div className="col-7 grid" style={{ gap: 'var(--gap)' }}>
// NEW:  <div className="col-span-12 lg:col-span-7 grid" style={{ gap: 'var(--gap)' }}>

// Line 358 — right (summary) column
// OLD:  <div className="col-5">
// NEW:  <div className="col-span-12 lg:col-span-5">
```

- [ ] **Step 2: Replace form-grid-2 in the customer info card**

```tsx
// Line 349
// OLD:  <div className="form-grid-2">
// NEW:  <div className="grid grid-cols-1 sm:grid-cols-2 gap-[14px]">
```

- [ ] **Step 3: Add card-view to the cart items table**

The cart table is at line 314 (inside the `type === 'item'` branch). Add `tbl-cards` + `data-label` + cell classes:

```tsx
// OLD:
<table className="tbl">
  <thead><tr>
    <th>สินค้า</th>
    <th style={{ textAlign: 'right', width: 110 }}>ราคา</th>
    <th style={{ textAlign: 'center', width: 130 }}>จำนวน</th>
    <th style={{ textAlign: 'right', width: 120 }}>ยอดรวม</th>
    <th style={{ width: 40 }} />
  </tr></thead>
  <tbody>
    {itemLines.map((l) => (
      <tr key={l.p.id}>
        <td>
          <div className="product-cell">...</div>
        </td>
        <td className="num" style={{ textAlign: 'right' }}>{fmtTHB(l.p.price)}</td>
        <td>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            ...stepper...
          </div>
        </td>
        <td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{fmtTHB(l.p.price * l.qty)}</td>
        <td><button ...><Icons.trash /></button></td>
      </tr>
    ))}
    ...
  </tbody>
</table>

// NEW:
<table className="tbl tbl-cards">
  <thead><tr>
    <th>สินค้า</th>
    <th style={{ textAlign: 'right', width: 110 }}>ราคา</th>
    <th style={{ textAlign: 'center', width: 130 }}>จำนวน</th>
    <th style={{ textAlign: 'right', width: 120 }}>ยอดรวม</th>
    <th style={{ width: 40 }} />
  </tr></thead>
  <tbody>
    {itemLines.map((l) => (
      <tr key={l.p.id}>
        <td className="cell-primary">
          <div className="product-cell">...</div>
        </td>
        <td className="num" data-label="ราคา" style={{ textAlign: 'right' }}>{fmtTHB(l.p.price)}</td>
        <td data-label="จำนวน">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            ...stepper...
          </div>
        </td>
        <td className="num" data-label="ยอดรวม" style={{ textAlign: 'right', fontWeight: 600 }}>{fmtTHB(l.p.price * l.qty)}</td>
        <td className="cell-actions"><button ...><Icons.trash /></button></td>
      </tr>
    ))}
    ...
  </tbody>
</table>
```

- [ ] **Step 4: Build and verify**

```bash
npm run build
```
Expected: clean build.

- [ ] **Step 5: Commit**

```bash
git add src/views/SalesView.tsx
git commit -m "feat: SalesView responsive grid + cart card-view"
```

---

## Task 6: Fix InventoryView — ProductDetail layout + serials card-view

**Files:**
- Modify: `src/views/InventoryView.tsx`

Note: The main product list table already uses `tbl-cards` (InventoryView line 180) — no change needed there. Only the `ProductDetail` sub-component needs changes.

- [ ] **Step 1: Replace grid-12 and col-* classes in ProductDetail**

```tsx
// ProductDetail component, line 349 — outer two-col grid
// OLD:  <div className="grid grid-12">
// NEW:  <div className="grid grid-cols-1 lg:grid-cols-12">

// Line 350 — info/photo column (left)
// OLD:  <div className="col-4">
// NEW:  <div className="col-span-12 lg:col-span-4">

// Line 369 — serials column (right)
// OLD:  <div className="col-8">
// NEW:  <div className="col-span-12 lg:col-span-8">
```

- [ ] **Step 2: Add card-view to the serials table**

The serials table is at line 383 inside `ProductDetail`:

```tsx
// OLD:
<table className="tbl">
  <thead><tr><th>Serial Number</th><th>สถานะ</th><th>เพิ่มเมื่อ</th><th style={{ width: 50 }} /></tr></thead>
  <tbody>
    {serials.map((s) => (
      <tr key={s.id}>
        <td className="mono" style={{ fontSize: 12.5 }}>{s.serial}</td>
        <td>{serialStatusChip(s.status)}</td>
        <td><span className="muted" style={{ fontSize: 12.5 }}>{new Date(s.created_at).toLocaleDateString('th-TH')}</span></td>
        <td style={{ textAlign: 'right' }}>
          {s.status === 'in_stock' ? <button ...><Icons.trash /></button> : null}
        </td>
      </tr>
    ))}
    ...
  </tbody>
</table>

// NEW:
<table className="tbl tbl-cards">
  <thead><tr><th>Serial Number</th><th>สถานะ</th><th>เพิ่มเมื่อ</th><th style={{ width: 50 }} /></tr></thead>
  <tbody>
    {serials.map((s) => (
      <tr key={s.id}>
        <td className="cell-primary mono" style={{ fontSize: 12.5 }}>{s.serial}</td>
        <td data-label="สถานะ">{serialStatusChip(s.status)}</td>
        <td data-label="เพิ่มเมื่อ"><span className="muted" style={{ fontSize: 12.5 }}>{new Date(s.created_at).toLocaleDateString('th-TH')}</span></td>
        <td className="cell-actions" style={{ textAlign: 'right' }}>
          {s.status === 'in_stock' ? <button ...><Icons.trash /></button> : null}
        </td>
      </tr>
    ))}
    ...
  </tbody>
</table>
```

- [ ] **Step 3: Build and verify**

```bash
npm run build
```
Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add src/views/InventoryView.tsx
git commit -m "feat: InventoryView ProductDetail responsive + serials card-view"
```

---

## Task 7: Fix AddProductView — two-column layout + form grids

**Files:**
- Modify: `src/views/AddProductView.tsx`

- [ ] **Step 1: Replace grid-12, col-*, and form-grid classes**

```tsx
// Line 190 — outer two-col grid
// OLD:  <div className="grid grid-12">
// NEW:  <div className="grid grid-cols-1 lg:grid-cols-12">

// Line 191 — left (fields) column
// OLD:  <div className="col-8 grid" style={{ gap: 'var(--gap)' }}>
// NEW:  <div className="col-span-12 lg:col-span-8 grid" style={{ gap: 'var(--gap)' }}>

// Line 310 — right (image/preview) column
// OLD:  <div className="col-4 grid" style={{ gap: 'var(--gap)' }}>
// NEW:  <div className="col-span-12 lg:col-span-4 grid" style={{ gap: 'var(--gap)' }}>

// Line 194 — basic info form grid (name, category, brand, model, SKU)
// OLD:  <div className="form-grid-2">
// NEW:  <div className="grid grid-cols-1 sm:grid-cols-2 gap-[14px]">

// Line 226 — price/warranty form grid
// OLD:  <div className="form-grid-3">
// NEW:  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[14px]">

// Line 297 — extra info form grid (reorder point, notes)
// OLD:  <div className="form-grid-2">
// NEW:  <div className="grid grid-cols-1 sm:grid-cols-2 gap-[14px]">
```

- [ ] **Step 2: Build and verify**

```bash
npm run build
```
Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add src/views/AddProductView.tsx
git commit -m "feat: AddProductView responsive two-column layout"
```

---

## Task 8: Fix BundlesView — bundle cards grid + create/edit layout

**Files:**
- Modify: `src/views/BundlesView.tsx`

- [ ] **Step 1: Replace grid classes**

```tsx
// Line 134 — bundle cards grid (list mode)
// OLD:  <div className="grid grid-3">
// NEW:  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">

// Line 197 — create/edit mode outer grid
// OLD:  <div className="grid grid-12">
// NEW:  <div className="grid grid-cols-1 lg:grid-cols-12">

// Line 198 — left (product picker) column
// OLD:  <div className="col-7 grid" style={{ gap: 'var(--gap)' }}>
// NEW:  <div className="col-span-12 lg:col-span-7 grid" style={{ gap: 'var(--gap)' }}>

// Line 243 — right (summary + pricing) column
// OLD:  <div className="col-5">
// NEW:  <div className="col-span-12 lg:col-span-5">
```

- [ ] **Step 2: Build and verify**

```bash
npm run build
```
Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add src/views/BundlesView.tsx
git commit -m "feat: BundlesView responsive grid layout"
```

---

## Task 9: Fix SettingsView — accounts table card-view

**Files:**
- Modify: `src/views/SettingsView.tsx`

- [ ] **Step 1: Add card-view to the accounts table**

The accounts table is at line 226 inside `AccountsCard`:

```tsx
// OLD:
<table className="tbl">
  <thead>
    <tr><th>ชื่อผู้ใช้</th><th>ชื่อ</th><th>สิทธิ์</th><th style={{ width: 150 }} /></tr>
  </thead>
  <tbody>
    {accounts.map((a) => (
      <tr key={a.id}>
        <td>
          <span style={{ fontWeight: 500 }}>@{a.username}</span>
          {a.id === user?.id && <span ...> (คุณ)</span>}
          {resetId === a.id && <div ...>...inline reset form...</div>}
        </td>
        <td className="muted">{a.full_name || '—'}</td>
        <td>
          <span className="chip" ...>{a.role === 'owner' ? 'เจ้าของร้าน' : 'พนักงาน'}</span>
        </td>
        <td style={{ textAlign: 'right' }}>
          <div style={{ display: 'inline-flex', gap: 4 }}>
            ...action buttons...
          </div>
        </td>
      </tr>
    ))}
    ...
  </tbody>
</table>

// NEW:
<table className="tbl tbl-cards">
  <thead>
    <tr><th>ชื่อผู้ใช้</th><th>ชื่อ</th><th>สิทธิ์</th><th style={{ width: 150 }} /></tr>
  </thead>
  <tbody>
    {accounts.map((a) => (
      <tr key={a.id}>
        <td className="cell-primary">
          <span style={{ fontWeight: 500 }}>@{a.username}</span>
          {a.id === user?.id && <span ...> (คุณ)</span>}
          {resetId === a.id && <div ...>...inline reset form...</div>}
        </td>
        <td className="muted" data-label="ชื่อ">{a.full_name || '—'}</td>
        <td data-label="สิทธิ์">
          <span className="chip" ...>{a.role === 'owner' ? 'เจ้าของร้าน' : 'พนักงาน'}</span>
        </td>
        <td className="cell-actions" style={{ textAlign: 'right' }}>
          <div style={{ display: 'inline-flex', gap: 4 }}>
            ...action buttons...
          </div>
        </td>
      </tr>
    ))}
    ...
  </tbody>
</table>
```

- [ ] **Step 2: Build and verify**

```bash
npm run build
```
Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add src/views/SettingsView.tsx
git commit -m "feat: SettingsView accounts table card-view on phones"
```

---

## Task 10: Final verification and AGENTS.md update

- [ ] **Step 1: Run a clean production build**

```bash
npm run build
```
Expected: TypeScript and Vite both exit 0. No errors or warnings about missing CSS classes.

- [ ] **Step 2: Check that no old layout class names remain in TSX files**

Run this search — all results should be zero:
```bash
# Should find NO matches:
grep -r "grid-4\|grid-3\|grid-2\|grid-12\|col-7\|col-8\|col-5\|col-4\|col-6\|form-grid-2\|form-grid-3" src/views/ src/components/
```
Expected output: empty (no matches).

- [ ] **Step 3: Update AGENTS.md**

In `AGENTS.md`, under TODO #6, mark the remaining responsive items as done and add a note:

```markdown
- [x] **6. Responsive + theming pass (completed 2026-06-07):**
  - [x] Tailwind CSS v4 installed (`@tailwindcss/vite`); breakpoints configured to match project breakpoints (sm:600 md:900 lg:1100 xl:1600); preflight coexists with existing CSS tokens — no theming changes.
  - [x] All `.grid-4/.grid-3/.grid-2/.grid-12/.col-*/.form-grid-*` CSS layout classes replaced with Tailwind responsive utilities across all 6 views + AddProduct + Bundles.
  - [x] Remaining card-view tables done: Analytics top-products, Analytics bundle performance, Sales cart, Inventory serials, Dashboard low-stock, Settings user list.
  - [x] Dead `.seg`/`.seg-btn` CSS removed.
```

- [ ] **Step 4: Final commit**

```bash
git add AGENTS.md
git commit -m "docs: AGENTS.md — mark TODO #6 responsive pass complete"
```

---

## Spec coverage check (self-review)

| Spec requirement | Task that covers it |
|---|---|
| Install Tailwind v4 + Vite plugin | Task 1 |
| Configure breakpoints (sm:600 md:900 lg:1100 xl:1600) | Task 2 |
| Keep preflight from conflicting with existing CSS | Task 2 (unlayered CSS wins) |
| Remove .grid-4/.grid-3/.grid-2/.grid-12 from CSS | Task 2 |
| Remove .col-* from CSS | Task 2 |
| Remove .form-grid-2/.form-grid-3 from CSS | Task 2 |
| Remove .seg/.seg-btn | Task 2 |
| DashboardView grid + low-stock card-view | Task 3 |
| AnalyticsView grid + top-products + bundle tables | Task 4 |
| SalesView grid + cart card-view + form-grid | Task 5 |
| InventoryView ProductDetail grid + serials card-view | Task 6 |
| AddProductView two-column layout | Task 7 |
| BundlesView grids | Task 8 |
| SettingsView user list card-view | Task 9 |
| Build clean + verify no old classes remain | Task 10 |
| AGENTS.md updated | Task 10 |
