// Warranty presets shared by the Add-Product and Inventory unit forms.
// Value '0' is the shop-warranty case (stored as 0 months). Its label differs
// per surface: 15 days for individual units, 30 days for bundles.
export const SHOP_WARRANTY_15 = 'ประกันร้าน 15 วัน';
export const SHOP_WARRANTY_30 = 'ประกันร้าน 30 วัน';

const MONTH_PRESETS = [
  { v: '3', label: '3 เดือน' },
  { v: '6', label: '6 เดือน' },
  { v: '12', label: '12 เดือน (1 ปี)' },
  { v: '24', label: '24 เดือน (2 ปี)' },
  { v: '36', label: '36 เดือน (3 ปี)' },
  { v: '60', label: '60 เดือน (5 ปี)' },
];

export const WARRANTY_PRESETS = [{ v: '0', label: SHOP_WARRANTY_15 }, ...MONTH_PRESETS];
export const BUNDLE_WARRANTY_PRESETS = [{ v: '0', label: SHOP_WARRANTY_30 }, ...MONTH_PRESETS];

export const isPresetWarranty = (m: string) => m === '0' || MONTH_PRESETS.some((p) => p.v === m);

/** Human label for a stored warranty. 0 months = shop warranty (label varies by surface). */
export const formatWarranty = (months: number, zeroLabel: string = SHOP_WARRANTY_15) =>
  months > 0 ? `${months} เดือน` : zeroLabel;

/** Display a stored warranty: free-text wins if present, else the months label. */
export const warrantyDisplay = (months: number, text?: string | null, zeroLabel: string = SHOP_WARRANTY_15) =>
  text && text.trim() ? text.trim() : formatWarranty(months, zeroLabel);

/**
 * Turn a form's warranty value into the two stored fields.
 * A preset (or a plain number typed in the custom box) stays a month count;
 * any other text is kept verbatim as free-text warranty.
 */
export const resolveWarranty = (value: string, custom: boolean): { warranty_months: number; warranty_text: string | null } => {
  const v = value.trim();
  if (!custom) return { warranty_months: Number(v) || 0, warranty_text: null };
  if (/^\d+$/.test(v)) return { warranty_months: Number(v), warranty_text: null };
  return { warranty_months: 0, warranty_text: v || null };
};
