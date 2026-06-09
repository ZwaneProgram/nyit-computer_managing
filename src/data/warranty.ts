// Warranty presets shared by the Add-Product and Inventory unit forms.
export const WARRANTY_PRESETS = [
  { v: '0', label: 'ไม่มีประกัน' },
  { v: '3', label: '3 เดือน' },
  { v: '6', label: '6 เดือน' },
  { v: '12', label: '12 เดือน (1 ปี)' },
  { v: '24', label: '24 เดือน (2 ปี)' },
  { v: '36', label: '36 เดือน (3 ปี)' },
  { v: '60', label: '60 เดือน (5 ปี)' },
];

export const isPresetWarranty = (m: string) => WARRANTY_PRESETS.some((p) => p.v === m);
