import { useState, type FormEvent } from 'react';
import { Icons } from '../components/Icons';
import { CATEGORIES, categoryName } from '../data/catalog';
import { fmtTHB } from '../data/format';
import type { CategoryId, ViewId } from '../types';

interface ViewProps {
  onNav: (id: ViewId) => void;
  showToast: (msg: string) => void;
}

interface FormState {
  cat: Exclude<CategoryId, 'all'>;
  sku: string;
  serial: string;
  name: string;
  cost: string;
  price: string;
  model: string;
  warranty: string;
  notes: string;
  staff: string;
  date: string;
}

export function AddProductView({ onNav, showToast }: ViewProps) {
  const [form, setForm] = useState<FormState>({
    cat: 'gpu', sku: '', serial: '', name: '', cost: '', price: '',
    model: '', warranty: '36', notes: '', staff: 'กรกฎ จันทร์เกษม', date: '2026-05-26',
  });
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const cost = Number(form.cost);
  const price = Number(form.price);
  const profit = form.cost && form.price ? price - cost : 0;
  const margin = form.cost && form.price ? ((price - cost) / price) * 100 : 0;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    showToast('บันทึกสินค้าใหม่เรียบร้อย');
    setTimeout(() => onNav('inventory'), 600);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="page-head" style={{ marginBottom: 22 }}>
        <div>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => onNav('inventory')} style={{ marginBottom: 8 }}>← กลับไปคลังสินค้า</button>
          <div className="page-title">เพิ่มสินค้าใหม่</div>
          <div className="muted page-subtitle">กรอกข้อมูลสินค้าและตั้งราคาขาย</div>
        </div>
        <div className="page-head-actions">
          <button type="button" className="btn">บันทึกเป็นแบบร่าง</button>
          <button type="submit" className="btn btn-primary"><Icons.check /> บันทึกสินค้า</button>
        </div>
      </div>

      <div className="grid grid-12">
        <div className="col-8 grid" style={{ gap: 'var(--gap)' }}>
          <div className="card card-pad">
            <div className="section-h">
              <div><h3>ข้อมูลพื้นฐาน</h3><div className="muted section-sub">ชื่อสินค้าและการจัดหมวด</div></div>
            </div>
            <div className="form-grid-2">
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label className="field-label">ชื่อสินค้า *</label>
                <input className="input" placeholder="เช่น ASUS ROG Strix RTX 4080 Super" value={form.name} onChange={(e) => set('name', e.target.value)} required />
              </div>
              <div className="field">
                <label className="field-label">หมวดหมู่ *</label>
                <select className="select" value={form.cat} onChange={(e) => set('cat', e.target.value as FormState['cat'])}>
                  {CATEGORIES.filter((c) => c.id !== 'all').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="field-label">รุ่น / โมเดล</label>
                <input className="input" placeholder="เช่น 4080S-O16G-GAMING" value={form.model} onChange={(e) => set('model', e.target.value)} />
              </div>
              <div className="field">
                <label className="field-label">SKU *</label>
                <div className="input-prefix">
                  <span className="pfx mono" style={{ fontSize: 12 }}>SKU</span>
                  <input className="input mono" placeholder="GPU-RTX4080S-ROG" value={form.sku} onChange={(e) => set('sku', e.target.value)} required />
                </div>
              </div>
              <div className="field">
                <label className="field-label">Serial Number</label>
                <div className="input-prefix">
                  <span className="pfx"><Icons.qr /></span>
                  <input className="input mono" placeholder="SN-XXXX-0000" value={form.serial} onChange={(e) => set('serial', e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          <div className="card card-pad">
            <div className="section-h">
              <div><h3>ราคาและกำไร</h3><div className="muted section-sub">ระบบจะคำนวณกำไรอัตโนมัติ</div></div>
            </div>
            <div className="form-grid-3">
              <div className="field">
                <label className="field-label">ราคาทุน (บาท) *</label>
                <div className="input-prefix">
                  <span className="pfx">฿</span>
                  <input className="input num" type="number" placeholder="0" value={form.cost} onChange={(e) => set('cost', e.target.value)} required />
                </div>
              </div>
              <div className="field">
                <label className="field-label">ราคาขาย (บาท) *</label>
                <div className="input-prefix">
                  <span className="pfx">฿</span>
                  <input className="input num" type="number" placeholder="0" value={form.price} onChange={(e) => set('price', e.target.value)} required />
                </div>
              </div>
              <div className="field">
                <label className="field-label">รับประกัน (เดือน)</label>
                <select className="select" value={form.warranty} onChange={(e) => set('warranty', e.target.value)}>
                  {['12', '24', '36', '60', '84'].map((m) => <option key={m} value={m}>{m} เดือน</option>)}
                </select>
              </div>
            </div>
            <div className="profit-strip">
              <div>
                <div className="muted" style={{ fontSize: 11.5 }}>กำไรต่อชิ้น</div>
                <div className="num" style={{ fontSize: 18, fontWeight: 600, marginTop: 2, color: profit > 0 ? 'var(--pos)' : 'var(--ink-3)' }}>{fmtTHB(profit)}</div>
              </div>
              <div className="profit-divider" />
              <div>
                <div className="muted" style={{ fontSize: 11.5 }}>อัตรากำไร</div>
                <div className="num" style={{ fontSize: 18, fontWeight: 600, marginTop: 2, color: profit > 0 ? 'var(--pos)' : 'var(--ink-3)' }}>{margin.toFixed(1)}%</div>
              </div>
            </div>
          </div>

          <div className="card card-pad">
            <div className="section-h"><div><h3>ข้อมูลเพิ่มเติม</h3></div></div>
            <div className="form-grid-2">
              <div className="field">
                <label className="field-label">ผู้บันทึก</label>
                <div className="input-prefix">
                  <span className="pfx"><Icons.user /></span>
                  <input className="input" value={form.staff} onChange={(e) => set('staff', e.target.value)} />
                </div>
              </div>
              <div className="field">
                <label className="field-label">วันที่รับเข้า</label>
                <div className="input-prefix">
                  <span className="pfx"><Icons.calendar /></span>
                  <input className="input" type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
                </div>
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label className="field-label">โน้ตเพิ่มเติม</label>
                <textarea className="textarea" placeholder="เช่น สั่งจาก SuperComputer KKU, ใบกำกับเลขที่ INV-2410-0098" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        <div className="col-4 grid" style={{ gap: 'var(--gap)' }}>
          <div className="card card-pad">
            <div className="section-h">
              <div><h3>รูปสินค้า</h3><div className="muted section-sub">PNG / JPG ขนาดไม่เกิน 4MB</div></div>
            </div>
            <label className="upload-drop">
              <Icons.upload style={{ width: 24, height: 24 }} />
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-2)' }}>ลากไฟล์มาวาง หรือคลิกเพื่อเลือก</div>
              <div className="mono" style={{ fontSize: 11 }}>product photo · 4:3</div>
              <input type="file" accept="image/*" hidden />
            </label>
            <div className="hint-box">
              <Icons.warning style={{ width: 14, height: 14, color: 'var(--accent)', marginTop: 1 }} />
              <span>ใช้รูปพื้นหลังโปร่งใส หรือพื้นขาวจะดูสะอาดที่สุด</span>
            </div>
          </div>

          <div className="card card-pad">
            <div className="section-h"><div><h3>ตัวอย่าง</h3></div></div>
            <div className="product-cell" style={{ padding: '10px 0' }}>
              <div className="thumb thumb-lg">{form.cat.toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="product-cell-name" style={{ fontSize: 14 }}>{form.name || 'ชื่อสินค้า'}</div>
                <div className="product-cell-meta">{form.sku || 'SKU-XXX'}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  <span className="chip">{categoryName(form.cat)}</span>
                  <span className="chip">รับประกัน {form.warranty} ด.</span>
                </div>
              </div>
            </div>
            <div className="divider" />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span className="muted">ราคาขาย</span>
              <span className="num" style={{ fontWeight: 600 }}>{fmtTHB(price || 0)}</span>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
