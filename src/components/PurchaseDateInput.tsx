/** Today's date on this device, YYYY-MM-DD (the value a date input uses). */
export const todayISO = () => new Date().toLocaleDateString('en-CA');

/** "2026-01-15" → "15/01/2026" (no Date parsing, so no timezone shift). */
export const fmtPurchaseDate = (iso: string | null | undefined) =>
  iso ? iso.split('-').reverse().join('/') : '—';

/** "วันที่ซื้อ" field: the day the shop bought the unit; future dates blocked. */
export function PurchaseDateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="field">
      <label className="field-label">วันที่ซื้อ</label>
      <input className="input" type="date" max={todayISO()} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
