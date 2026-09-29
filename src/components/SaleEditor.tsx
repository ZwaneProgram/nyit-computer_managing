import { useState } from 'react';
import { fmtTHB } from '../data/format';
import { updateSale, type SaleDetail } from '../data/sales';
import { Icons } from './Icons';

interface Props {
  sale: SaleDetail;
  onClose: () => void;
  onSaved: () => void;
}

const money = (value: string) => value.trim() !== '' && /^\d+(\.\d{0,2})?$/.test(value) && Number(value) < 1e10;
const cents = (value: string | number) => Math.round(Number(value) * 100);

export function SaleEditor({ sale, onClose, onSaved }: Props) {
  const [customer, setCustomer] = useState({
    customer_name: sale.customer_name ?? '', customer_phone: sale.customer_phone ?? '',
    customer_address: sale.customer_address ?? '', tax_id: sale.tax_id ?? '',
  });
  const [prices, setPrices] = useState(sale.items.map((line) => String(line.unit_price)));
  const [shipping, setShipping] = useState(String(sale.shipping));
  const [discount, setDiscount] = useState(String(sale.discount));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const subtotal = sale.items.reduce((sum, line, i) => sum + cents(prices[i]) * line.qty, 0);
  const cost = sale.items.reduce((sum, line) => sum + cents(line.unit_cost) * line.qty, 0);
  const total = subtotal + cents(shipping) - cents(discount);
  const profit = subtotal - cost - cents(discount);
  const valid = prices.every(money) && money(shipping) && money(discount) &&
    cents(discount) <= subtotal && [subtotal, total, profit].every((n) => Number.isSafeInteger(n) && Math.abs(n) < 1e12);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    setError('');
    try {
      await updateSale(sale.id, {
        ...customer, revision: sale.revision, shipping: Number(shipping), discount: Number(discount),
        items: sale.items.map((line, i) => ({ id: line.id, unit_price: Number(prices[i]) })),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึกการแก้ไขไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card card-pad" onSubmit={save} aria-label={`แก้ไขบิล #${sale.id}`}>
      <div className="section-h">
        <div><h3>แก้ไขบิล #{sale.id}</h3><div className="muted section-sub">{new Date(sale.created_at).toLocaleString('th-TH')} · {sale.staff_name || sale.staff_username || '—'}</div></div>
        <div className="spacer" />
        <button type="button" className="btn btn-sm" disabled={saving} onClick={onClose}>ยกเลิก</button>
      </div>
      <fieldset disabled={saving} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-[14px]">
          {([
            ['customer_name', 'ชื่อลูกค้า'], ['customer_phone', 'เบอร์โทร'],
            ['customer_address', 'ที่อยู่จัดส่ง'], ['tax_id', 'เลขผู้เสียภาษี'],
          ] as const).map(([key, label], index) => (
            <label className="field" key={key}>
              <span className="field-label">{label}</span>
              <input className="input" autoFocus={index === 0} maxLength={5000} value={customer[key]}
                onChange={(event) => setCustomer({ ...customer, [key]: event.target.value })} />
            </label>
          ))}
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 18 }}>แก้ไขราคาขายต่อชิ้น / ต่อชุดได้ · สินค้า จำนวน และต้นทุนยังคงตามบิลเดิม</p>
        <div className="table-wrap">
          <table className="tbl tbl-cards">
            <thead><tr><th>รายการ</th><th>จำนวน</th><th>ราคาขายต่อหน่วย</th><th>รวม</th></tr></thead>
            <tbody>{sale.items.map((line, i) => (
              <tr key={line.id}>
                <td className="cell-primary">{line.name}</td>
                <td data-label="จำนวน">{line.qty}</td>
                <td data-label="ราคาขายต่อหน่วย"><input className="input num" style={{ width: 140, maxWidth: '100%' }}
                  aria-label={`ราคาขาย ${line.name} รายการ ${i + 1}`} type="number" min="0" max="9999999999.99" step="0.01" required
                  value={prices[i]} onChange={(event) => setPrices((old) => old.map((price, j) => i === j ? event.target.value : price))} /></td>
                <td data-label="รวม" className="num">{fmtTHB(cents(prices[i]) * line.qty / 100, { maximumFractionDigits: 2 })}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        {sale.units.length > 0 && (
          <details style={{ marginTop: 12 }}><summary>เครื่องที่ขาย ({sale.units.length})</summary>
            <ul style={{ overflowWrap: 'anywhere' }}>{sale.units.map((unit) => <li key={unit.id}>{unit.name} · {unit.serial}{unit.sku ? ` · ${unit.sku}` : ''}</li>)}</ul>
          </details>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-[14px]" style={{ marginTop: 18 }}>
          <label className="field"><span className="field-label">ค่าจัดส่ง</span><input className="input num" type="number" min="0" max="9999999999.99" step="0.01" required value={shipping} onChange={(e) => setShipping(e.target.value)} /></label>
          <label className="field"><span className="field-label">ส่วนลด (บาท)</span><input className="input num" type="number" min="0" max="9999999999.99" step="0.01" required value={discount} onChange={(e) => setDiscount(e.target.value)} /></label>
        </div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 18 }}>
          <span>ยอดสินค้า <strong className="num">{fmtTHB(subtotal / 100, { maximumFractionDigits: 2 })}</strong></span>
          <span>ยอดสุทธิ <strong className="num">{fmtTHB(total / 100, { maximumFractionDigits: 2 })}</strong></span>
          <span>กำไร <strong className="num" style={{ color: profit < 0 ? 'var(--neg)' : 'var(--pos)' }}>{fmtTHB(profit / 100, { maximumFractionDigits: 2 })}</strong></span>
        </div>
        {!valid && <p className="muted" role="status">กรอกยอดเงินให้ครบ ทศนิยมไม่เกิน 2 ตำแหน่ง ส่วนลดต้องไม่เกินยอดสินค้า และยอดเงินต้องน้อยกว่า 10,000,000,000 บาท</p>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button type="submit" className="btn btn-primary" style={{ marginTop: 18 }} disabled={!valid || saving}><Icons.check /> {saving ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}</button>
      </fieldset>
    </form>
  );
}
