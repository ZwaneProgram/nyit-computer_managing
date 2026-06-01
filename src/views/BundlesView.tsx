import { useState } from 'react';
import { Icons } from '../components/Icons';
import { BUNDLES, CATEGORIES, PRODUCTS, productById } from '../data/catalog';
import { fmtTHB } from '../data/format';
import type { CategoryId } from '../types';

interface ViewProps {
  showToast: (msg: string) => void;
}

export function BundlesView({ showToast }: ViewProps) {
  const [mode, setMode] = useState<'list' | 'create'>('list');
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [discount, setDiscount] = useState(5);
  const [q, setQ] = useState('');
  const [filterCat, setFilterCat] = useState<CategoryId>('all');

  const cost = selected.reduce((s, id) => s + (productById(id)?.cost ?? 0), 0);
  const listPrice = selected.reduce((s, id) => s + (productById(id)?.price ?? 0), 0);
  const bundlePrice = Math.round(listPrice * (1 - discount / 100));
  const profit = bundlePrice - cost;
  const margin = listPrice ? (profit / bundlePrice) * 100 : 0;

  const visible = PRODUCTS.filter((p) => {
    if (filterCat !== 'all' && p.cat !== filterCat) return false;
    if (q && !p.name.toLowerCase().includes(q.toLowerCase()) && !p.sku.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  if (mode === 'list') {
    return (
      <div className="grid" style={{ gap: 'var(--gap)' }}>
        <div className="page-head">
          <div>
            <div className="page-title">ชุดสินค้า (Bundles)</div>
            <div className="muted page-subtitle">รวมสินค้าหลายชิ้นเป็นเซ็ตขายพร้อมส่วนลด</div>
          </div>
          <div className="page-head-actions">
            <button className="btn btn-primary" onClick={() => setMode('create')}><Icons.plus /> สร้างชุดใหม่</button>
          </div>
        </div>

        <div className="grid grid-3">
          {BUNDLES.map((b) => {
            const items = b.items.map((id) => productById(id)!);
            const listSum = b.items.reduce((s, id) => s + productById(id)!.price, 0);
            const off = Math.round((1 - b.price / listSum) * 100);
            return (
              <div key={b.id} className="card" style={{ overflow: 'hidden' }}>
                <div className="bundle-cover">
                  <div style={{ display: 'flex', gap: 6 }}>
                    {items.slice(0, 4).map((it, i) => <div key={i} className="thumb thumb-lg">{it.cat.toUpperCase()}</div>)}
                    {items.length > 4 && <div className="thumb thumb-lg" style={{ background: 'var(--ink)', color: 'var(--bg)' }}>+{items.length - 4}</div>}
                  </div>
                  <span className="chip chip-accent" style={{ position: 'absolute', top: 12, left: 12 }}>ลด {off}%</span>
                </div>
                <div className="card-pad">
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{b.name}</div>
                  <div className="muted mono" style={{ fontSize: 11.5 }}>{b.id} · {b.items.length} ชิ้น · ขายไปแล้ว {b.sold}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 14 }}>
                    <div>
                      <div className="muted" style={{ fontSize: 11.5 }}>ราคาชุด</div>
                      <div className="num" style={{ fontSize: 19, fontWeight: 600, marginTop: 2 }}>{fmtTHB(b.price)}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="muted" style={{ fontSize: 11.5 }}>กำไร</div>
                      <div className="num" style={{ fontSize: 14, fontWeight: 600, color: 'var(--pos)', marginTop: 2 }}>+{fmtTHB(b.price - b.cost)}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
                    <button className="btn btn-sm" style={{ flex: 1 }}><Icons.edit /> แก้ไข</button>
                    <button className="btn btn-sm btn-primary" style={{ flex: 1 }}><Icons.cart /> ขายชุดนี้</button>
                  </div>
                </div>
              </div>
            );
          })}
          <button type="button" onClick={() => setMode('create')} className="card bundle-create">
            <div className="bundle-create-ic"><Icons.plus /></div>
            <div style={{ fontWeight: 500 }}>สร้างชุดใหม่</div>
            <div className="muted" style={{ fontSize: 12 }}>เลือกสินค้าหลายชิ้น ตั้งราคา และขาย</div>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-head" style={{ marginBottom: 22 }}>
        <div>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setMode('list')} style={{ marginBottom: 8 }}>← กลับไปรายการชุด</button>
          <div className="page-title">สร้างชุดสินค้าใหม่</div>
          <div className="muted page-subtitle">เลือกสินค้าจากคลัง ระบบจะรวมราคาให้อัตโนมัติ</div>
        </div>
        <div className="page-head-actions">
          <button className="btn" disabled={!selected.length}>บันทึกแบบร่าง</button>
          <button
            className="btn btn-primary"
            disabled={!selected.length || !name}
            onClick={() => { showToast('สร้างชุดสินค้าเรียบร้อย'); setMode('list'); setSelected([]); setName(''); }}
          >
            <Icons.check /> สร้างชุด ({selected.length})
          </button>
        </div>
      </div>

      <div className="stepper">
        <div className="stepper-step" data-state={name ? 'done' : 'active'}>
          <span className="stepper-num">{name ? <Icons.check style={{ width: 12, height: 12 }} /> : '1'}</span>ตั้งชื่อชุด
        </div>
        <div className="stepper-line" />
        <div className="stepper-step" data-state={selected.length ? (name ? 'active' : 'done') : (name ? 'active' : '')}>
          <span className="stepper-num">2</span>เลือกสินค้า
        </div>
        <div className="stepper-line" />
        <div className="stepper-step" data-state={selected.length ? 'active' : ''}>
          <span className="stepper-num">3</span>ตั้งราคาและบันทึก
        </div>
      </div>

      <div className="grid grid-12">
        <div className="col-7 grid" style={{ gap: 'var(--gap)' }}>
          <div className="card card-pad">
            <div className="field">
              <label className="field-label">ชื่อชุดสินค้า *</label>
              <input className="input" placeholder="เช่น ชุดประกอบสายเกมเมอร์ Tier S" value={name} onChange={(e) => setName(e.target.value)} style={{ fontSize: 15, fontWeight: 500 }} />
            </div>
          </div>

          <div className="card">
            <div className="card-pad" style={{ paddingBottom: 12 }}>
              <div className="section-h">
                <div><h3>เพิ่มสินค้าเข้าชุด</h3><div className="muted section-sub">คลิกที่สินค้าเพื่อเลือก/ยกเลิก</div></div>
              </div>
              <div className="filterbar" style={{ marginBottom: 12 }}>
                <div className="search grow">
                  <Icons.search />
                  <input placeholder="ค้นหาสินค้า..." value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
                <select className="select select-auto" value={filterCat} onChange={(e) => setFilterCat(e.target.value as CategoryId)}>
                  {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="pick-list">
              {visible.map((p) => {
                const isSel = selected.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={'product-pick' + (isSel ? ' selected' : '')}
                    onClick={() => setSelected((s) => (isSel ? s.filter((x) => x !== p.id) : [...s, p.id]))}
                  >
                    <div className="thumb">{p.cat.toUpperCase()}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500 }}>{p.name}</div>
                      <div className="muted mono" style={{ fontSize: 11.5, marginTop: 1 }}>{p.sku} · คงเหลือ {p.stock}</div>
                    </div>
                    <div className="num" style={{ fontWeight: 600 }}>{fmtTHB(p.price)}</div>
                    <div className="pick-check" data-on={isSel}>
                      {isSel && <Icons.check style={{ width: 12, height: 12 }} />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="col-5">
          <div className="sticky-aside">
            <div className="card card-pad">
              <div className="section-h">
                <div><h3>สรุปชุดสินค้า</h3><div className="muted section-sub">{selected.length} ชิ้นในชุด</div></div>
              </div>
              {selected.length === 0 ? (
                <div className="empty-block">
                  <Icons.layers style={{ width: 28, height: 28, margin: '0 auto 8px', display: 'block', color: 'var(--ink-4)' }} />
                  <div style={{ fontSize: 13 }}>ยังไม่มีสินค้า</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>เลือกจากรายการด้านซ้าย</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto' }}>
                  {selected.map((id) => {
                    const p = productById(id)!;
                    return (
                      <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
                        <div className="thumb" style={{ width: 30, height: 30, fontSize: 8 }}>{p.cat.toUpperCase()}</div>
                        <div style={{ flex: 1, minWidth: 0, fontSize: 12.5 }}>
                          <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                          <div className="muted mono" style={{ fontSize: 11 }}>{p.sku}</div>
                        </div>
                        <div className="num" style={{ fontSize: 12.5 }}>{fmtTHB(p.price)}</div>
                        <button type="button" className="btn btn-sm btn-icon btn-ghost" onClick={() => setSelected((s) => s.filter((x) => x !== id))}><Icons.x /></button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="card card-pad">
              <div className="section-h"><div><h3>ส่วนลดและราคา</h3></div></div>
              <div className="field" style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span className="field-label">ส่วนลดจากราคารวม</span>
                  <span className="num" style={{ fontWeight: 600 }}>{discount}%</span>
                </div>
                <input type="range" min={0} max={30} step={1} value={discount} onChange={(e) => setDiscount(+e.target.value)} style={{ width: '100%', accentColor: 'var(--accent)' }} />
              </div>
              <div className="summary-box">
                <div className="summary-row">
                  <span className="muted">ราคารวม (ก่อนลด)</span>
                  <span className="num">{fmtTHB(listPrice)}</span>
                </div>
                <div className="summary-row">
                  <span className="muted">ส่วนลด {discount}%</span>
                  <span className="num" style={{ color: 'var(--neg)' }}>−{fmtTHB(listPrice - bundlePrice)}</span>
                </div>
                <div className="summary-row">
                  <span className="muted">ต้นทุนรวม</span>
                  <span className="num">{fmtTHB(cost)}</span>
                </div>
                <div className="divider" style={{ margin: '4px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontWeight: 600 }}>ราคาขายชุด</span>
                  <span className="num" style={{ fontSize: 20, fontWeight: 600 }}>{fmtTHB(bundlePrice)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                  <span className="muted" style={{ fontSize: 12 }}>กำไรต่อชุด</span>
                  <span style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                    <span className="num" style={{ color: 'var(--pos)', fontWeight: 600 }}>+{fmtTHB(profit)}</span>
                    <span className="chip chip-pos">{margin.toFixed(1)}%</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
