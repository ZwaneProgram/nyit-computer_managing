# Tailwind + Responsive Design Migration — Nyit Shop

**Date:** 2026-06-07  
**Status:** Approved

---

## Goal

Add Tailwind CSS to the project and use it to fix all remaining responsive issues across every screen. The existing CSS custom-property theming system (dark mode, accent colors, density slider) is kept entirely intact.

---

## Approach: Tailwind for Layout, CSS Variables for Theming

Keep `styles.css` as the source of truth for design tokens (`:root` variables, `[data-theme="dark"]`, `[data-density]`). Add Tailwind purely for layout utilities and responsive breakpoints. The two systems coexist without conflict.

**Why not full Tailwind theming:** Dark mode (data-attribute toggle), runtime accent-color swapping, and the density slider all depend on CSS custom properties changing at runtime. Tailwind's static config cannot replicate this without significant complexity and risk.

---

## Setup

### Install
```
npm install -D tailwindcss @tailwindcss/vite
```

### `tailwind.config.js`
- `content`: `["./src/**/*.{tsx,ts}"]`
- Custom breakpoints to match existing CSS media queries:
  - `sm`: `600px`   (phones → tablets)
  - `md`: `900px`   (sidebar collapse point)
  - `lg`: `1100px`  (laptop / 12-col split)
  - `xl`: `1600px`  (large desktop)
- Custom color tokens referencing CSS variables so Tailwind classes can optionally use them:
  - `ink`, `ink-2`, `ink-3`, `ink-4`
  - `surface`, `surface-2`, `surface-sunk`
  - `accent`, `border` (renamed `border-token` to avoid conflict)
- `darkMode`: `['selector', '[data-theme="dark"]']`
- `corePlugins.preflight`: `false` — do NOT reset base styles (the existing CSS already sets them)

### `styles.css`
Add `@tailwind base`, `@tailwind components`, `@tailwind utilities` at the top (after the existing resets/tokens section). All existing rules stay.

### `vite.config.ts`
Add `@tailwindcss/vite` plugin.

---

## Responsive Breakpoints Reference

| Tailwind prefix | px    | What collapses                          |
|-----------------|-------|-----------------------------------------|
| (base)          | 0+    | Phone: single column, card-view tables  |
| `sm:`           | 600px | Tablet: 2-col grids, normal tables      |
| `md:`           | 900px | Sidebar appears, full nav               |
| `lg:`           | 1100px| 3–4 col grids, sticky aside             |
| `xl:`           | 1600px| Wider sidebar, wider content max        |

---

## Per-Screen Changes

### App Shell (`App.tsx`, `Sidebar.tsx`, `Topbar.tsx`, `MobileNav.tsx`)
- Keep existing `.app`, `.sb`, `.main`, `.topbar` classes (they handle the sidebar drawer behaviour)
- Tailwind used only for any new layout tweaks needed

### Dashboard (`DashboardView.tsx`)
- KPI grid: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`
- Chart section: `grid grid-cols-1 lg:grid-cols-12` with col spans
- Recent transactions list: already responsive, minor padding adjustments

### Inventory (`InventoryView.tsx`, `AddProductView.tsx`)
- Product grid: already using card-view on phones ✅
- `AddProductView` form grids: replace `.form-grid-2`/`.form-grid-3` with `grid grid-cols-1 sm:grid-cols-2` / `sm:grid-cols-3`
- Serials table: add `tbl-cards` card-view treatment for phones (was in TODO #6)

### Bundles (`BundlesView.tsx`)
- Bundle cards grid: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`
- Bundle top-products table: add `tbl-cards` card-view for phones (was in TODO #6)

### Sales (`SalesView.tsx`)
- Main layout: `grid grid-cols-1 lg:grid-cols-12`
- Cart (left col): scrolls on phones → add `tbl-cards` card-view for phone (was in TODO #6)
- Summary aside: `lg:col-span-4`, stacks below on phones

### Analytics (`AnalyticsView.tsx`)
- KPI strip: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`
- Top-products table: add `tbl-cards` card-view for phones (was in TODO #6)
- Bundle performance table: add `tbl-cards` card-view for phones (was in TODO #6)
- Charts: already responsive

### Settings (`SettingsView.tsx`)
- Layout: single column, already ok
- User list table: add `tbl-cards` card-view for phones (was in TODO #6)
- Form grids: `grid grid-cols-1 sm:grid-cols-2`

### Categories (`CategoriesView.tsx`)
- List is already simple; minor padding/gap cleanup

### Login (`LoginView.tsx`)
- Card already centers and max-width constrains; minor tweak if needed

---

## CSS Cleanup

- Remove `.seg` and `.seg-btn` rules — density picker no longer uses the 3-button segment (it's a slider now)
- Remove any layout CSS rules that are fully replaced by Tailwind utilities (e.g. if `.grid-4` class is no longer used in TSX, remove the CSS rule)
- Keep all theming rules, color tokens, component-specific rules

---

## Card-View Pattern (unchanged from existing implementation)

The existing `tbl-cards` CSS class + `data-label` on `<td>` is the card-view pattern. We just need to apply it to the remaining tables:
- Analytics: top-products table, bundle performance table
- Sales: cart items
- Inventory: serials table
- Settings: user list table

---

## Success Criteria

- [ ] No horizontal scroll on any screen at 375px (iPhone SE)
- [ ] All tables either scroll gracefully or show card-view on phones
- [ ] Sidebar drawer still works on mobile
- [ ] Dark mode + accent themes + density slider still work
- [ ] `npm run build` passes clean (tsc + vite)
- [ ] Dead `.seg`/`.seg-btn` CSS removed
