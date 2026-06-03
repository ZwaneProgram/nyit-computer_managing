import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icons } from '../components/Icons';
import { fmtTHB } from '../data/format';
import { fetchProducts, type Product } from '../data/inventory';
import { fetchBundles, type Bundle } from '../data/bundles';
import { createSale, fetchSales, type NewSale, type Sale } from '../data/sales';
import { ApiError } from '../lib/api';

interface ViewProps {
  showToast: (msg: string) => void;
}

function Thumb({ url }: { url: string | null }) {
  return (
    <div className="thumb">
      {url
        ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
        : <span style={{ fontSize: 7, color: 'var(--ink-4)' }}>ไม่มีรูป</span>}
    </div>
  );
}

interface CartLine { product_id: number; qty: number }

export function SalesView({ showToast }: ViewProps) {
  const [mode, setMode] = useState<'new' | 'history'>('new');
  const [type, setType] = useState<'item' | 'bundle'>('item');
  const [products, setProducts] = useState<Product[]>([]);
  const [bundles, setBundles] = useState<Bundle[]>([]);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [bundleId, setBundleId] = useState<number | null>(null);
  const [bundleQty, setBundleQty] = useState(1);

  const [customer, setCustomer] = useState({ name: '', phone: '', address: '', taxId: '' });
  const [shipping, setShipping] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQ, setSearchQ] = useState('');

  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState<Sale | null>(null);

  const [history, setHistory] = useState<Sale[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [hq, setHq] = useState('');           // search box (debounced into hqDebounced)
  const [hqDebounced, setHqDebounced] = useState('');
  const [hFrom, setHFrom] = useState('');
  const [hTo, setHTo] = useState('');
  const [hPage, setHPage] = useState(1);
  const HISTORY_PER_PAGE = 25;

  const loadProducts = useCallback(() => {
    fetchProducts('active').then(setProducts).catch(() => {});
    fetchBundles().then(setBundles).catch(() => {});
  }, []);
  useEffect(() => { loadProducts(); }, [loadProducts]);

  // Debounce the search box (300ms).
  useEffect(() => {
    const id = window.setTimeout(() => setHqDebounced(hq), 300);
    return () => window.clearTimeout(id);
  }, [hq]);

  // Reset to page 1 whenever a filter changes.
  useEffect(() => { setHPage(1); }, [hqDebounced, hFrom, hTo]);

  const loadHistory = useCallback(() => {
    setHistoryLoading(true);
    fetchSales({
      q: hqDebounced || undefined,
      from: hFrom || undefined,
      to: hTo || undefined,
      limit: HISTORY_PER_PAGE,
      offset: (hPage - 1) * HISTORY_PER_PAGE,
    })
      .then((r) => { setHistory(r.sales); setHistoryTotal(r.total); })
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, [hqDebounced, hFrom, hTo, hPage]);
  useEffect(() => { if (mode === 'history') loadHistory(); }, [mode, loadHistory]);

  const productById = useMemo(() => {
    const m = new Map<number, Product>();
    products.forEach((p) => m.set(p.id, p));
    return m;
  }, [products]);

  const selectedBundle = bundles.find((b) => b.id === bundleId) ?? null;

  // Compute totals for the current draft.
  const itemLines = cart.map((c) => ({ p: productById.get(c.product_id)!, qty: c.qty })).filter((l) => l.p);
  const subtotal = type === 'item'
    ? itemLines.reduce((s, l) => s + l.p.price * l.qty, 0)
    : (selectedBundle ? selectedBundle.price * bundleQty : 0);
  const cost = type === 'item'
    ? itemLines.reduce((s, l) => s + l.p.cost * l.qty, 0)
    : (selectedBundle ? selectedBundle.total_cost * bundleQty : 0);
  const total = subtotal + shipping - discount;
  const profit = subtotal - cost - discount;

  const itemCount = type === 'item' ? itemLines.reduce((s, l) => s + l.qty, 0) : bundleQty;

  // Validity: something selected + not exceeding stock.
  const overStock = type === 'item'
    ? itemLines.some((l) => l.qty > l.p.stock)
    : (!!selectedBundle && bundleQty > selectedBundle.stock);
  const canConfirm = !busy && !overStock && (type === 'item' ? itemLines.length > 0 : !!selectedBundle && bundleQty > 0);

  const searchResults = products.filter((p) =>
    !cart.find((c) => c.product_id === p.id) &&
    (searchQ ? p.name.toLowerCase().includes(searchQ.toLowerCase()) || (p.sku ?? '').toLowerCase().includes(searchQ.toLowerCase()) : true),
  ).slice(0, 8);

  const resetDraft = () => {
    setCart([]); setBundleId(null); setBundleQty(1);
    setCustomer({ name: '', phone: '', address: '', taxId: '' });
    setShipping(0); setDiscount(0);
  };

  const confirm = async () => {
    if (!canConfirm) return;
    const payload: NewSale = {
      kind: type,
      customer_name: customer.name.trim() || null,
      customer_phone: customer.phone.trim() || null,
      customer_address: customer.address.trim() || null,
      tax_id: customer.taxId.trim() || null,
      shipping, discount,
      ...(type === 'item'
        ? { items: cart }
        : { bundle_id: bundleId!, bundle_qty: bundleQty }),
    };
    setBusy(true);
    try {
      const sale = await createSale(payload);
      setConfirmed(sale);
      resetDraft();
      loadProducts(); // stock changed
      showToast('บันทึกการขายแล้ว · ตัดสต๊อกอัตโนมัติ');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'บันทึกการขายไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  // ----- SUCCESS SCREEN -----
  if (confirmed) {
    return (
      <div className="confirm-screen">
        <div className="confirm-check"><Icons.check style={{ width: 32, height: 32 }} /></div>
        <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.01em' }}>บันทึกการขายสำเร็จ</div>
        <div className="muted" style={{ fontSize: 14, marginTop: 6, maxWidth: 420 }}>เลขที่บิล #{confirmed.id} · สต๊อกถูกตัดอัตโนมัติแล้ว</div>
        <div className="card card-pad" style={{ marginTop: 28, width: '100%', maxWidth: 420, textAlign: 'left' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span className="muted">ยอดรวม</span>
            <span className="num" style={{ fontSize: 22, fontWeight: 600 }}>{fmtTHB(confirmed.total)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="muted">กำไรสุทธิ</span>
            <span className="num" style={{ color: 'var(--pos)', fontWeight: 600 }}>+{fmtTHB(confirmed.profit)}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 28, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button className="btn" onClick={() => { setConfirmed(null); setMode('history'); }}>ดูประวัติการขาย</button>
          <button className="btn btn-primary" onClick={() => setConfirmed(null)}>ขายรายการใหม่</button>
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
        <div className="grid" style={{ gap: 'var(--gap)' }}>
          <div className="card card-pad" style={{ paddingBottom: 16 }}>
            <div className="filterbar" style={{ flexWrap: 'wrap', gap: 10 }}>
              <div className="search grow">
                <Icons.search />
                <input placeholder="ค้นหาเลขบิล, ลูกค้า, หรือสินค้า..." value={hq} onChange={(e) => setHq(e.target.value)} />
              </div>
              <input className="input" type="date" value={hFrom} onChange={(e) => setHFrom(e.target.value)} style={{ width: 'auto' }} title="ตั้งแต่วันที่" />
              <input className="input" type="date" value={hTo} onChange={(e) => setHTo(e.target.value)} style={{ width: 'auto' }} title="ถึงวันที่" />
              {(hq || hFrom || hTo) && (
                <button className="btn btn-sm btn-ghost" onClick={() => { setHq(''); setHFrom(''); setHTo(''); }}>ล้างตัวกรอง</button>
              )}
            </div>
          </div>

          <div className="card">
            <div className="table-wrap">
              <table className="tbl tbl-cards">
                <thead>
                  <tr>
                    <th>เลขที่บิล</th><th>วันที่</th><th>รายการ</th><th>ลูกค้า</th><th>พนักงาน</th>
                    <th style={{ textAlign: 'right' }}>ยอดรวม</th><th style={{ textAlign: 'right' }}>กำไร</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((t) => (
                    <tr key={t.id}>
                      <td className="mono cell-primary" style={{ fontSize: 12 }}>#{t.id}</td>
                      <td data-label="วันที่"><span className="muted" style={{ fontSize: 12.5 }}>{new Date(t.created_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}</span></td>
                      <td data-label="รายการ">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {t.kind === 'bundle' ? <span className="chip chip-accent">ชุด</span> : <span className="chip">ชิ้น</span>}
                          <span>{t.label}</span>
                        </div>
                      </td>
                      <td data-label="ลูกค้า">{t.customer_name || '—'}</td>
                      <td data-label="พนักงาน"><span className="muted">{t.staff_name || t.staff_username || '—'}</span></td>
                      <td className="num" data-label="ยอดรวม" style={{ textAlign: 'right', fontWeight: 600 }}>{fmtTHB(t.total)}</td>
                      <td className="num" data-label="กำไร" style={{ textAlign: 'right', color: 'var(--pos)' }}>+{fmtTHB(t.profit)}</td>
                    </tr>
                  ))}
                  {!historyLoading && history.length === 0 && (
                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40 }} className="muted">ไม่พบประวัติการขาย</td></tr>
                  )}
                  {historyLoading && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40 }} className="muted">กำลังโหลด...</td></tr>}
                </tbody>
              </table>
            </div>

            <div className="pagn">
              <div>แสดง {historyTotal === 0 ? 0 : (hPage - 1) * HISTORY_PER_PAGE + 1}–{Math.min(hPage * HISTORY_PER_PAGE, historyTotal)} จาก {historyTotal} รายการ</div>
              <div className="pagn-pages">
                <button disabled={hPage <= 1} onClick={() => setHPage((p) => Math.max(1, p - 1))}>‹</button>
                <button disabled={hPage * HISTORY_PER_PAGE >= historyTotal} onClick={() => setHPage((p) => p + 1)}>›</button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-12">
          <div className="col-7 grid" style={{ gap: 'var(--gap)' }}>
            <div className="card card-pad">
              <div className="field-label" style={{ marginBottom: 8 }}>ประเภทการขาย</div>
              <div className="sale-type">
                <button type="button" onClick={() => setType('item')} className="product-pick"
                  style={{ flex: 1, borderColor: type === 'item' ? 'var(--accent)' : 'var(--border)', background: type === 'item' ? 'var(--accent-soft-2)' : 'var(--surface)' }}>
                  <div className="sale-type-ic"><Icons.box /></div>
                  <div style={{ flex: 1 }}><div style={{ fontWeight: 500 }}>สินค้าเดี่ยว</div><div className="muted" style={{ fontSize: 12 }}>เลือกหลายชิ้นได้</div></div>
                </button>
                <button type="button" onClick={() => setType('bundle')} className="product-pick"
                  style={{ flex: 1, borderColor: type === 'bundle' ? 'var(--accent)' : 'var(--border)', background: type === 'bundle' ? 'var(--accent-soft-2)' : 'var(--surface)' }}>
                  <div className="sale-type-ic"><Icons.layers /></div>
                  <div style={{ flex: 1 }}><div style={{ fontWeight: 500 }}>ชุดสินค้า (Bundle)</div><div className="muted" style={{ fontSize: 12 }}>เลือก 1 ชุด</div></div>
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
                  {bundles.map((b) => (
                    <button key={b.id} type="button" className={'product-pick' + (b.id === bundleId ? ' selected' : '')} onClick={() => { setBundleId(b.id); setBundleQty(1); }}>
                      <div className="thumb thumb-lg">{b.items.length}×</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500 }}>{b.name}</div>
                        <div className="muted mono" style={{ fontSize: 11.5, marginTop: 1 }}>{b.items.length} ชิ้น · ขายได้ {b.stock} ชุด</div>
                      </div>
                      <div className="num" style={{ fontWeight: 600 }}>{fmtTHB(b.price)}</div>
                    </button>
                  ))}
                  {bundles.length === 0 && <div className="muted" style={{ padding: 16, textAlign: 'center' }}>ยังไม่มีชุดสินค้า</div>}
                </div>
              ) : (
                <>
                  {showSearch && (
                    <div style={{ padding: '0 20px 12px' }}>
                      <div className="search" style={{ width: '100%' }}>
                        <Icons.search />
                        <input autoFocus placeholder="ค้นหาสินค้าจากชื่อ หรือ SKU..." value={searchQ} onChange={(e) => setSearchQ(e.target.value)} />
                      </div>
                      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 260, overflowY: 'auto' }}>
                        {searchResults.map((p) => (
                          <button key={p.id} type="button" className="product-pick" disabled={p.stock === 0}
                            onClick={() => { setCart((is) => [...is, { product_id: p.id, qty: 1 }]); setSearchQ(''); setShowSearch(false); }}>
                            <Thumb url={p.image_url} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 500 }}>{p.name}</div>
                              <div className="muted mono" style={{ fontSize: 11.5 }}>{p.sku || '—'} · คงเหลือ {p.stock}</div>
                            </div>
                            <div className="num">{fmtTHB(p.price)}</div>
                          </button>
                        ))}
                        {searchResults.length === 0 && <div className="muted" style={{ padding: 12, textAlign: 'center' }}>ไม่พบสินค้า</div>}
                      </div>
                    </div>
                  )}
                  <div className="table-wrap" style={{ borderRadius: 0 }}>
                    <table className="tbl">
                      <thead><tr><th>สินค้า</th><th style={{ textAlign: 'right', width: 110 }}>ราคา</th><th style={{ textAlign: 'center', width: 130 }}>จำนวน</th><th style={{ textAlign: 'right', width: 120 }}>ยอดรวม</th><th style={{ width: 40 }} /></tr></thead>
                      <tbody>
                        {itemLines.map((l) => (
                          <tr key={l.p.id}>
                            <td>
                              <div className="product-cell">
                                <Thumb url={l.p.image_url} />
                                <div><div className="product-cell-name">{l.p.name}</div><div className="product-cell-meta">{l.p.sku || '—'} · คงเหลือ {l.p.stock}</div></div>
                              </div>
                            </td>
                            <td className="num" style={{ textAlign: 'right' }}>{fmtTHB(l.p.price)}</td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                                <button className="btn btn-sm btn-icon btn-ghost" onClick={() => setCart((is) => is.map((i) => (i.product_id === l.p.id ? { ...i, qty: Math.max(1, i.qty - 1) } : i)))}>−</button>
                                <span className="num" style={{ minWidth: 24, textAlign: 'center', fontWeight: 600, color: l.qty > l.p.stock ? 'var(--neg)' : undefined }}>{l.qty}</span>
                                <button className="btn btn-sm btn-icon btn-ghost" disabled={l.qty >= l.p.stock} onClick={() => setCart((is) => is.map((i) => (i.product_id === l.p.id ? { ...i, qty: i.qty + 1 } : i)))}>+</button>
                              </div>
                            </td>
                            <td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{fmtTHB(l.p.price * l.qty)}</td>
                            <td><button className="btn btn-sm btn-icon btn-ghost" onClick={() => setCart((is) => is.filter((i) => i.product_id !== l.p.id))}><Icons.trash /></button></td>
                          </tr>
                        ))}
                        {itemLines.length === 0 && (
                          <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center' }} className="muted">ยังไม่มีรายการ — กด "เพิ่มสินค้า" เพื่อเริ่ม</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            <div className="card card-pad">
              <div className="section-h"><div><h3>ข้อมูลลูกค้า</h3><div className="muted section-sub">ไม่บังคับ — กรอกเพื่อบันทึกประวัติ</div></div></div>
              <div className="form-grid-2">
                <div className="field"><label className="field-label">ชื่อลูกค้า</label><input className="input" placeholder="คุณ..." value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} /></div>
                <div className="field"><label className="field-label">เบอร์โทร</label><input className="input mono" placeholder="08X-XXX-XXXX" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} /></div>
                <div className="field" style={{ gridColumn: '1 / -1' }}><label className="field-label">ที่อยู่จัดส่ง</label><input className="input" placeholder="(ไม่ต้องระบุ ถ้ารับเองที่หน้าร้าน)" value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} /></div>
                <div className="field"><label className="field-label">เลขผู้เสียภาษี (ถ้ามี)</label><input className="input mono" placeholder="0-0000-00000-00-0" value={customer.taxId} onChange={(e) => setCustomer({ ...customer, taxId: e.target.value })} /></div>
              </div>
            </div>
          </div>

          <div className="col-5">
            <div className="sticky-aside">
              <div className="card card-pad">
                <div className="section-h"><div><h3>สรุปคำสั่งซื้อ</h3></div></div>
                {type === 'bundle' && selectedBundle && (
                  <div className="field" style={{ marginBottom: 12 }}>
                    <label className="field-label">จำนวนชุด (ขายได้ {selectedBundle.stock})</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button className="btn btn-sm btn-icon btn-ghost" onClick={() => setBundleQty((q) => Math.max(1, q - 1))}>−</button>
                      <span className="num" style={{ minWidth: 28, textAlign: 'center', fontWeight: 600, color: bundleQty > selectedBundle.stock ? 'var(--neg)' : undefined }}>{bundleQty}</span>
                      <button className="btn btn-sm btn-icon btn-ghost" disabled={bundleQty >= selectedBundle.stock} onClick={() => setBundleQty((q) => q + 1)}>+</button>
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="muted">{type === 'bundle' ? `ชุดสินค้า (${itemCount})` : `สินค้า (${itemCount} ชิ้น)`}</span>
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

              {overStock && (
                <div className="auth-error" role="alert"><Icons.warning style={{ width: 15, height: 15, flexShrink: 0 }} /><span>จำนวนเกินสต๊อกที่มี</span></div>
              )}

              <button className="btn btn-primary checkout-btn" disabled={!canConfirm} onClick={confirm}>
                <Icons.check /> {busy ? 'กำลังบันทึก...' : `ยืนยันการขาย · ${fmtTHB(total)}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
