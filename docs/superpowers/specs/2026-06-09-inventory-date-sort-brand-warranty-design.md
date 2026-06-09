# Inventory date sort/search + remove brand + edit-unit warranty dropdown (2026-06-09)

Three frontend-only tweaks to คลังสินค้า. No DB/API change — `products.created_at`
is already returned and the list loads all catalogs, so sorting/filtering is
client-side.

## 1. Sort newest→oldest + date-range search (`InventoryView`)
- Default sort = catalog **`created_at` descending** (newest first).
- Add a sortable **"เพิ่มเมื่อ"** column showing the local date the catalog was added.
- Add **from/to date pickers** in the filter bar + a "ล้างตัวกรอง" clear (shown
  only when a date is set). A catalog matches when its created date (local
  `YYYY-MM-DD`) is `>= from` and `<= to`, both inclusive. So Feb 1 → Dec shows
  everything created in that window.
- `SortKey` gains `'created'`; default `{ key: 'created', dir: 'desc' }`.
- Empty/loading row `colSpan` 6 → 7.

## 2. Remove ยี่ห้อ (brand) from the UI everywhere
- **AddProductView:** remove the brand input + `form.brand` state; `save()` sends
  `brand: null`.
- **InventoryView list:** row meta under the name shows **model** (`p.model`)
  instead of brand; search matches **name + model** (placeholder updated).
- **InventoryView detail:** remove the ยี่ห้อ summary row (keep รุ่น).
- **BundlesView picker:** search matches name (not brand); component meta shows
  `p.model`.
- DB `brand` column stays (unused); `Product.brand` field stays in the type.

## 3. Edit-unit warranty dropdown (`UnitFields` in `InventoryView`)
- Replace the plain "รับประกัน (เดือน)" number input with the same dropdown the
  Add screen uses: **ไม่มีประกัน (0)**, 3/6/12/24/36/60 months, and
  **อื่นๆ (กำหนดเอง)** → custom months number input.
- Share the preset list: extract `WARRANTY_PRESETS` + `isPresetWarranty` into
  **`src/data/warranty.ts`**; import in both `AddProductView` and `InventoryView`
  (removes the existing in-component copy).
- `UnitFormState` gains `warrantyCustom: boolean`; `blankUnit` sets it false;
  `startEdit` sets it from `!isPresetWarranty(String(s.warranty_months))`.

## Verification
- `tsc` + `npm run build` clean.
- Manual: list defaults newest-first; a Feb→Dec range filters correctly; brand
  gone from add/list/detail/search; editing a unit shows the warranty dropdown
  with ไม่มีประกัน + custom.
