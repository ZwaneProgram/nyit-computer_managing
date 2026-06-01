import { useState } from 'react';
import { Icons } from '../components/Icons';
import { BUNDLES, PRODUCTS, TXNS, productById } from '../data/catalog';
import { fmtTHB } from '../data/format';

interface ViewProps {
  showToast: (msg: string) => void;
}

interface LineItem {
  id: string;
  name: string;
  sku: string;
  cat?: string;
  cost: number;
  price: number;
  qty: number;
  isBundle?: boolean;
}

interface Customer {
  name: string;
  phone: string;
  address: string;
  taxId: string;
}

const EMPTY_CUSTOMER: Customer = { name: '', phone: '', address: '', taxId: '' };

export function SalesView({ showToast }: ViewProps) {
  const [mode, setMode] = useState<'new' | 'history'>('new');
  const [items, setItems] = useState<{ id: string; qty: number }[]>([
    { id: 'P-0150', qty: 1 },
    { id: 'P-0410', qty: 2 },
    { id: 'P-0510', qty: 1 },
  ]);
  const [type, setType] = useState<'item' | 'bundle'>('item');
  const [bundleId, setBundleId] = useState('B-001');
  const [customer, setCustomer] = useState<Customer>(EMPTY_CUSTOMER);
  const [payment, setPayment] = useState('transfer');
  const [paymentStatus, setPaymentStatus] = useState('paid');
  const [shipping, setShipping] = useState(80);
  const [discount, setDiscount] = useState(0);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const lineItems: LineItem[] =
    type === 'item'
      ? items.map((li) => {
          const p = productById(li.id)!;
          return { id: p.id, name: p.name, sku: p.sku, cat: p.cat, cost: p.cost, price: p.price, qty: li.qty };
        })
      : (() => {
          const b = BUNDLES.find((x) => x.id === bundleId)!;
          return [{ id: b.id, name: b.name, sku: 'BUNDLE/' + b.id, cost: b.cost, price: b.price, qty: 1, isBundle: true }];
        })();

  const subtotal = lineItems.reduce((s, p) => s + p.price * p.qty, 0);
  const cost = lineItems.reduce((s, p) => s + p.cost * p.qty, 0);
  const total = subtotal + shipping - discount;
  const profit = subtotal - cost - discount;

  const searchResults = PRODUCTS.filter(
    (p) =>
      !items.find((i) => i.id === p.id) &&
      (searchQ ? p.name.toLowerCase().includes(searchQ.toLowerCase()) || p.sku.toLowerCase().includes(searchQ.toLowerCase()) : true),
  ).slice(0, 6);

  if (confirmed) {
    return (
      <div className="confirm-screen">
        <div className="confirm-check"><Icons.check style={{ width: 32, height: 32 }} /></div>
        <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.01em' }}>บันทึกการขายสำเร็จ</div>
        <div className="muted" style={{ fontSize: 14, marginTop: 6, maxWidth: 420 }}>เลขที่บิล TXN-2410-0090 · สต๊อกถูกตัดอัตโนมัติ {lineItems.length} รายการ</div>
        <div className="card card-pad" style={{ marginTop: 28, width: '100%', maxWidth: 420, textAlign: 'left' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span className="muted">ยอดรวม</span>
            <span className="num" style={{ fontSize: 22, fontWeight: 600 }}>{fmtTHB(total)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="muted">กำไรสุทธิ</span>
            <span className="num" style={{ color: 'var(--pos)', fontWeight: 600 }}>+{fmtTHB(profit)}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 28, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button className="btn"><Icons.receipt /> พิมพ์ใบเสร็จ</button>
          <button className="btn btn-primary" onClick={() => { setConfirmed(false); setItems([]); setCustomer(EMPTY_CUSTOMER); }}>ขายรายการใหม่</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-head" style={{ marginBottom: 18 }}>
        <div>
          <div className="page-title">ระบบขายสินค้า</div>
          <div className="muted page-subtitle">เปิดบิลขายสินค้าเดี่ยวหรือชุดสินค้า · ระบบจะตัดสต๊อกอัตโนมัติ</div>
        </div>
      </div>

      <div className="tabs">
        <button className="tab" data-active={mode === 'new'} onClick={() => setMode('new')}>เปิดบิลใหม่</button>
        <button className="tab" data-active={mode === 'history'} onClick={() => setMode('history')}>ประวัติการขาย</button>
      </div>

      {mode === 'history' ? (
        <div className="card">
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>เลขที่บิล</th><th>วันที่</th><th>รายการ</th><th>ลูกค้า</th><th>พนักงาน</th>
                  <th style={{ textAlign: 'right' }}>ยอดรวม</th><th style={{ textAlign: 'right' }}>กำไร</th><th>สถานะ</th><th />
                </tr>
              </thead>
              <tbody>
                {TXNS.map((t) => (
                  <tr key={t.id}>
                    <td className="mono" style={{ fontSize: 12 }}>{t.id}</td>
                    <td><span className="muted" style={{ fontSize: 12.5 }}>{t.ts}</span></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {t.type === 'bundle' ? <span className="chip chip-accent">ชุด</span> : <span className="chip">ชิ้น</span>}
                        <span>{t.label}</span>
                      </div>
                    </td>
                    <td>{t.customer}</td>
                    <td><span className="muted">{t.staff}</span></td>
                    <td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{fmtTHB(t.amount)}</td>
                    <td className="num" style={{ textAlign: 'right', color: t.status === 'refunded' ? 'var(--ink-3)' : 'var(--pos)' }}>{t.status === 'refunded' ? '—' : '+' + fmtTHB(t.profit)}</td>
                    <td>
                      {t.status === 'paid' && <span className="chip chip-pos chip-dot">ชำระแล้ว</span>}
                      {t.status === 'pending' && <span className="chip chip-warn chip-dot">รอชำระ</span>}
                      {t.status === 'refunded' && <span className="chip chip-neg chip-dot">คืนเงิน</span>}
                    </td>
                    <td><button className="btn btn-sm btn-icon btn-ghost"><Icons.more /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-12">
          <div className="col-7 grid" style={{ gap: 'var(--gap)' }}>
            <div className="card card-pad">
              <div className="field-label" style={{ marginBottom: 8 }}>ประเภทการขาย</div>
              <div className="sale-type">
                <button
                  type="button"
                  onClick={() => setType('item')}
                  className="product-pick"
                  style={{ flex: 1, borderColor: type === 'item' ? 'var(--accent)' : 'var(--border)', background: type === 'item' ? 'var(--accent-soft-2)' : 'var(--surface)' }}
                >
                  <div className="sale-type-ic"><Icons.box /></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>สินค้าเดี่ยว</div>
                    <div className="muted" style={{ fontSize: 12 }}>เลือกหลายชิ้นได้</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setType('bundle')}
                  className="product-pick"
                  style={{ flex: 1, borderColor: type === 'bundle' ? 'var(--accent)' : 'var(--border)', background: type === 'bundle' ? 'var(--accent-soft-2)' : 'var(--surface)' }}
                >
                  <div className="sale-type-ic"><Icons.layers /></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>ชุดสินค้า (Bundle)</div>
                    <div className="muted" style={{ fontSize: 12 }}>เลือก 1 ชุดจากที่ตั้งไว้</div>
                  </div>
                </button>
              </div>
            </div>

            <div className="card">
              <div className="card-pad" style={{ paddingBottom: 0 }}>
                <div className="section-h">
                  <div><h3>{type === 'item' ? 'รายการสินค้า' : 'เลือกชุดสินค้า'}</h3></div>
                  <div className="spacer" />
                  {type === 'item' && <button className="btn btn-sm" onClick={() => setShowSearch((s) => !s)}><Icons.plus /> เพิ่มสินค้า</button>}
                </div>
              </div>

              {type === 'bundle' ? (
                <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {BUNDLES.map((b) => (
                    <button key={b.id} type="button" className={'product-pick' + (b.id === bundleId ? ' selected' : '')} onClick={() => setBundleId(b.id)}>
                      <div className="thumb thumb-lg">{b.items.length}×</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500 }}>{b.name}</div>
                        <div className="muted mono" style={{ fontSize: 11.5, marginTop: 1 }}>{b.id} · {b.items.length} ชิ้น</div>
                      </div>
                      <div className="num" style={{ fontWeight: 600 }}>{fmtTHB(b.price)}</div>
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  {showSearch && (
                    <div style={{ padding: '0 20px 12px' }}>
                      <div className="search" style={{ width: '100%' }}>
                        <Icons.search />
                        <input autoFocus placeholder="ค้นหาสินค้าจากชื่อ หรือ SKU..." value={searchQ} onChange={(e) => setSearchQ(e.target.value)} />
                      </div>
                      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 240, overflowY: 'auto' }}>
                        {searchResults.map((p) => (
                          <button key={p.id} type="button" className="product-pick" onClick={() => { setItems((is) => [...is, { id: p.id, qty: 1 }]); setSearchQ(''); setShowSearch(false); }}>
                            <div className="thumb">{p.cat.toUpperCase()}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 500 }}>{p.name}</div>
                              <div className="muted mono" style={{ fontSize: 11.5 }}>{p.sku} · คงเหลือ {p.stock}</div>
                            </div>
                            <div className="num">{fmtTHB(p.price)}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="table-wrap" style={{ borderRadius: 0 }}>
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>สินค้า</th>
                          <th style={{ textAlign: 'right', width: 110 }}>ราคา</th>
                          <th style={{ textAlign: 'center', width: 130 }}>จำนวน</th>
                          <th style={{ textAlign: 'right', width: 120 }}>ยอดรวม</th>
                          <th style={{ width: 40 }} />
                        </tr>
                      </thead>
                      <tbody>
                        {lineItems.map((p) => (
                          <tr key={p.id}>
                            <td>
                              <div className="product-cell">
                                <div className="thumb">{(p.cat ?? 'BD').toUpperCase()}</div>
                                <div>
                                  <div className="product-cell-name">{p.name}</div>
                                  <div className="product-cell-meta">{p.sku}</div>
                                </div>
                              </div>
                            </td>
                            <td className="num" style={{ textAlign: 'right' }}>{fmtTHB(p.price)}</td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                                <button className="btn btn-sm btn-icon btn-ghost" onClick={() => setItems((is) => is.map((i) => (i.id === p.id ? { ...i, qty: Math.max(1, i.qty - 1) } : i)))}>−</button>
                                <span className="num" style={{ minWidth: 24, textAlign: 'center', fontWeight: 600 }}>{p.qty}</span>
                                <button className="btn btn-sm btn-icon btn-ghost" onClick={() => setItems((is) => is.map((i) => (i.id === p.id ? { ...i, qty: i.qty + 1 } : i)))}>+</button>
                              </div>
                            </td>
                            <td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{fmtTHB(p.price * p.qty)}</td>
                            <td><button className="btn btn-sm btn-icon btn-ghost" onClick={() => setItems((is) => is.filter((i) => i.id !== p.id))}><Icons.trash /></button></td>
                          </tr>
                        ))}
                        {lineItems.length === 0 && (
                          <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center' }} className="muted">ยังไม่มีรายการ — กด "เพิ่มสินค้า" เพื่อเริ่ม</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            <div className="card card-pad">
              <div className="section-h">
                <div><h3>ข้อมูลลูกค้า</h3><div className="muted section-sub">กรอกเพื่อออกใบเสร็จและบันทึกประวัติ</div></div>
              </div>
              <div className="form-grid-2">
                <div className="field"><label className="field-label">ชื่อลูกค้า</label><input className="input" placeholder="คุณ..." value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} /></div>
                <div className="field"><label className="field-label">เบอร์โทร</label><input className="input mono" placeholder="08X-XXX-XXXX" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} /></div>
                <div className="field" style={{ gridColumn: '1 / -1' }}><label className="field-label">ที่อยู่จัดส่ง</label><input className="input" placeholder="(ไม่ต้องระบุ ถ้ารับเองที่หน้าร้าน)" value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} /></div>
                <div className="field"><label className="field-label">เลขผู้เสียภาษี (ถ้ามี)</label><input className="input mono" placeholder="0-0000-00000-00-0" value={customer.taxId} onChange={(e) => setCustomer({ ...customer, taxId: e.target.value })} /></div>
                <div className="field"><label className="field-label">วิธีจัดส่ง</label>
                  <select className="select" defaultValue="kerry">
                    <option value="pickup">รับเองที่หน้าร้าน (ไม่มีค่าส่ง)</option>
                    <option value="kerry">Kerry Express</option>
                    <option value="flash">Flash Express</option>
                    <option value="ems">ไปรษณีย์ EMS</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="col-5">
            <div className="sticky-aside">
              <div className="card card-pad">
                <div className="section-h"><div><h3>การชำระเงิน</h3></div></div>
                <div className="field" style={{ marginBottom: 14 }}>
                  <label className="field-label">ช่องทาง</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                    {[
                      { id: 'cash', label: 'เงินสด' },
                      { id: 'transfer', label: 'โอน' },
                      { id: 'card', label: 'บัตร' },
                      { id: 'qr', label: 'QR' },
                    ].map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => setPayment(o.id)}
                        className="btn btn-sm"
                        style={{ width: '100%', padding: 0, height: 38, background: payment === o.id ? 'var(--ink)' : 'var(--surface)', color: payment === o.id ? 'var(--bg)' : 'var(--ink)', borderColor: payment === o.id ? 'var(--ink)' : 'var(--border)' }}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <label className="field-label">สถานะการชำระ</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[
                      { id: 'paid', label: 'ชำระแล้ว' },
                      { id: 'pending', label: 'รอชำระ' },
                      { id: 'partial', label: 'มัดจำบางส่วน' },
                    ].map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => setPaymentStatus(o.id)}
                        className="btn btn-sm"
                        style={{ flex: 1, background: paymentStatus === o.id ? 'var(--accent-soft)' : 'var(--surface)', color: paymentStatus === o.id ? 'var(--accent)' : 'var(--ink-2)', borderColor: paymentStatus === o.id ? 'transparent' : 'var(--border)', fontWeight: paymentStatus === o.id ? 600 : 500 }}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="card card-pad">
                <div className="section-h"><div><h3>สรุปคำสั่งซื้อ</h3></div></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="muted">สินค้า ({lineItems.reduce((s, i) => s + i.qty, 0)} ชิ้น)</span>
                    <span className="num">{fmtTHB(subtotal)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="muted">ค่าจัดส่ง</span>
                    <input className="input num inline-num" type="number" value={shipping} onChange={(e) => setShipping(+e.target.value || 0)} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="muted">ส่วนลด</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <span className="num" style={{ color: discount ? 'var(--neg)' : 'var(--ink-3)' }}>−</span>
                      <input className="input num inline-num" type="number" value={discount} onChange={(e) => setDiscount(+e.target.value || 0)} />
                    </span>
                  </div>
                  <div className="divider" style={{ margin: '4px 0' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontWeight: 600 }}>ยอดสุทธิ</span>
                    <span className="num" style={{ fontSize: 22, fontWeight: 600 }}>{fmtTHB(total)}</span>
                  </div>
                  <div className="profit-banner">
                    <span style={{ color: 'var(--pos)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Icons.arrowUp style={{ width: 14, height: 14 }} /> กำไรประมาณการ
                    </span>
                    <span className="num" style={{ color: 'var(--pos)', fontWeight: 600 }}>+{fmtTHB(profit)}</span>
                  </div>
                </div>
              </div>

              <div className="card card-pad auto-stock-note">
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 12.5 }}>
                  <Icons.refresh style={{ color: 'var(--accent)', marginTop: 1 }} />
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--ink)' }}>สต๊อกจะถูกตัดอัตโนมัติ</div>
                    <div className="muted" style={{ marginTop: 2 }}>เมื่อกดยืนยัน ระบบจะลดจำนวนสินค้าในคลังตามรายการ และบันทึก Serial Number ที่ขายออกไป</div>
                  </div>
                </div>
              </div>

              <button
                className="btn btn-primary checkout-btn"
                disabled={!lineItems.length}
                onClick={() => { setConfirmed(true); showToast('เปิดบิลสำเร็จ บันทึกแล้ว'); }}
              >
                <Icons.check /> ยืนยันการขาย · {fmtTHB(total)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
