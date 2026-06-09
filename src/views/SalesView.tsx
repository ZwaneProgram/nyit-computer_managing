import { useCallback, useEffect, useState } from 'react';
import { Icons } from '../components/Icons';
import { fmtTHB } from '../data/format';
import { fetchProduct, fetchProducts, type Product, type Serial } from '../data/inventory';
import { fetchBundles, type Bundle } from '../data/bundles';
import { createSale, fetchSales, type NewSale, type Sale } from '../data/sales';
import { ApiError } from '../lib/api';

interface ViewProps {
  showToast: (msg: string) => void;
}

/** One chosen physical unit in the cart. */
interface CartUnit { serial: Serial; product_name: string }

export function SalesView({ showToast }: ViewProps) {
  const [mode, setMode] = useState<'new' | 'history'>('new');
  const [type, setType] = useState<'item' | 'bundle'>('item');
  const [products, setProducts] = useState<Product[]>([]);
  const [bundles, setBundles] = useState<Bundle[]>([]);

  const [cart, setCart] = useState<CartUnit[]>([]);
  const [bundleId, setBundleId] = useState<number | null>(null);
  const [bundleQty, setBundleQty] = useState(1);

  const [customer, setCustomer] = useState({ name: '', phone: '', address: '', taxId: '' });
  const [shipping, setShipping] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [expandedPid, setExpandedPid] = useState<number | null>(null);
  const [unitMap, setUnitMap] = useState<Record<number, Serial[]>>({});

  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState<Sale | null>(null);

  const [history, setHistory] = useState<Sale[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [hq, setHq] = useState('');
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

  useEffect(() => {
    const id = window.setTimeout(() => setHqDebounced(hq), 300);
    return () => window.clearTimeout(id);
  }, [hq]);

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

  // Lazy-load a product's in-stock units when its picker row is expanded.
  const loadUnits = async (pid: number) => {
    if (unitMap[pid]) return;
    try {
      const { serials } = await fetchProduct(pid);
      setUnitMap((m) => ({ ...m, [pid]: serials.filter((s) => s.status === 'in_stock') }));
    } catch { /* ignore */ }
  };

  const selectedBundle = bundles.find((b) => b.id === bundleId) ?? null;
  const chosenIds = new Set(cart.map((c) => c.serial.id));

  const subtotal = type === 'item'
    ? cart.reduce((s, c) => s + c.serial.price, 0)
    : (selectedBundle ? selectedBundle.price * bundleQty : 0);
  const cost = type === 'item'
    ? cart.reduce((s, c) => s + c.serial.cost, 0)
    : (selectedBundle ? selectedBundle.total_cost * bundleQty : 0);
  const total = subtotal + shipping - discount;
  const profit = subtotal - cost - discount;
  const itemCount = type === 'item' ? cart.length : bundleQty;

  const overStock = type === 'bundle' && !!selectedBundle && bundleQty > selectedBundle.stock;
  const canConfirm = !busy && !overStock && (type === 'item' ? cart.length > 0 : !!selectedBundle && bundleQty > 0);

  const searchResults = products.filter((p) =>
    p.stock > 0 &&
    (searchQ ? p.name.toLowerCase().includes(searchQ.toLowerCase()) || (p.brand ?? '').toLowerCase().includes(searchQ.toLowerCase()) : true),
  ).slice(0, 8);

  const addUnitToCart = (product_name: string, serial: Serial) => {
    if (chosenIds.has(serial.id)) return;
    setCart((c) => [...c, { serial, product_name }]);
  };

  const resetDraft = () => {
    setCart([]); setBundleId(null); setBundleQty(1);
    setCustomer({ name: '', phone: '', address: '', taxId: '' });
    setShipping(0); setDiscount(0);
    setShowSearch(false); setSearchQ(''); setExpandedPid(null);
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
        ? { items: cart.map((c) => ({ serial_id: c.serial.id })) }
        : { bundle_id: bundleId!, bundle_qty: bundleQty }),
    };
    setBusy(true);
    try {
      const sale = await createSale(payload);
      setConfirmed(sale);
      resetDraft();
      setUnitMap({});
      loadProducts();
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
        <div className="grid grid-cols-1 lg:grid-cols-12">
          <div className="col-span-12 lg:col-span-7 grid" style={{ gap: 'var(--gap)' }}>
            <div className="card card-pad">
              <div className="field-label" style={{ marginBottom: 8 }}>ประเภทการขาย</div>
              <div className="sale-type">
                <button type="button" onClick={() => setType('item')} className="product-pick"
                  style={{ flex: 1, borderColor: type === 'item' ? 'var(--accent)' : 'var(--border)', background: type === 'item' ? 'var(--accent-soft-2)' : 'var(--surface)' }}>
                  <div className="sale-type-ic"><Icons.box /></div>
                  <div style={{ flex: 1 }}><div style={{ fontWeight: 500 }}>สินค้าเดี่ยว</div><div className="muted" style={{ fontSize: 12 }}>เลือกทีละเครื่อง</div></div>
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
                        <input autoFocus placeholder="ค้นหาสินค้าจากชื่อ หรือยี่ห้อ..." value={searchQ} onChange={(e) => setSearchQ(e.target.value)} />
                      </div>
                      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 320, overflowY: 'auto' }}>
                        {searchResults.map((p) => (
                          <div key={p.id}>
                            <button type="button" className="product-pick" style={{ width: '100%' }}
                              onClick={() => { const next = expandedPid === p.id ? null : p.id; setExpandedPid(next); if (next != null) loadUnits(p.id); }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 500 }}>{p.name}</div>
                                <div className="muted mono" style={{ fontSize: 11.5 }}>{p.brand || '—'} · คงเหลือ {p.stock}</div>
                              </div>
                              <div className="num muted">{p.price_min == null ? '—' : `${fmtTHB(p.price_min)}+`}</div>
                              {expandedPid === p.id ? <Icons.arrowDown style={{ width: 14, height: 14 }} /> : <Icons.arrowRight style={{ width: 14, height: 14 }} />}
                            </button>
                            {expandedPid === p.id && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '6px 0 6px 16px' }}>
                                {(unitMap[p.id] ?? []).filter((u) => !chosenIds.has(u.id)).map((u) => (
                                  <button key={u.id} type="button" className="product-pick" onClick={() => addUnitToCart(p.name, u)}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div className="mono" style={{ fontSize: 12.5 }}>{u.serial}{u.sku ? ` · ${u.sku}` : ''}</div>
                                      <div className="muted" style={{ fontSize: 11 }}>{u.warranty_months ? `รับประกัน ${u.warranty_months} เดือน` : 'ไม่มีประกัน'}</div>
                                    </div>
                                    <div className="num" style={{ fontWeight: 600 }}>{fmtTHB(u.price)}</div>
                                  </button>
                                ))}
                                {(unitMap[p.id] ?? []).filter((u) => !chosenIds.has(u.id)).length === 0 && (
                                  <div className="muted" style={{ padding: 8, fontSize: 12 }}>ไม่มีเครื่องว่างให้เลือก</div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                        {searchResults.length === 0 && <div className="muted" style={{ padding: 12, textAlign: 'center' }}>ไม่พบสินค้า</div>}
                      </div>
                    </div>
                  )}
                  <div className="table-wrap" style={{ borderRadius: 0 }}>
                    <table className="tbl tbl-cards">
                      <thead><tr><th>เครื่อง</th><th style={{ textAlign: 'right', width: 130 }}>ราคา</th><th style={{ width: 40 }} /></tr></thead>
                      <tbody>
                        {cart.map((c) => (
                          <tr key={c.serial.id}>
                            <td className="cell-primary">
                              <div className="product-cell-name">{c.product_name}</div>
                              <div className="product-cell-meta mono">{c.serial.serial}{c.serial.sku ? ` · ${c.serial.sku}` : ''}</div>
                            </td>
                            <td className="num" data-label="ราคา" style={{ textAlign: 'right', fontWeight: 600 }}>{fmtTHB(c.serial.price)}</td>
                            <td className="cell-actions"><button className="btn btn-sm btn-icon btn-ghost" onClick={() => setCart((is) => is.filter((i) => i.serial.id !== c.serial.id))}><Icons.trash /></button></td>
                          </tr>
                        ))}
                        {cart.length === 0 && (
                          <tr><td colSpan={3} style={{ padding: 40, textAlign: 'center' }} className="muted">ยังไม่มีรายการ — กด "เพิ่มสินค้า" เพื่อเลือกเครื่อง</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            <div className="card card-pad">
              <div className="section-h"><div><h3>ข้อมูลลูกค้า</h3><div className="muted section-sub">ไม่บังคับ — กรอกเพื่อบันทึกประวัติ</div></div></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-[14px]">
                <div className="field"><label className="field-label">ชื่อลูกค้า</label><input className="input" placeholder="คุณ..." value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} /></div>
                <div className="field"><label className="field-label">เบอร์โทร</label><input className="input mono" placeholder="08X-XXX-XXXX" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} /></div>
                <div className="field" style={{ gridColumn: '1 / -1' }}><label className="field-label">ที่อยู่จัดส่ง</label><input className="input" placeholder="(ไม่ต้องระบุ ถ้ารับเองที่หน้าร้าน)" value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} /></div>
                <div className="field"><label className="field-label">เลขผู้เสียภาษี (ถ้ามี)</label><input className="input mono" placeholder="0-0000-00000-00-0" value={customer.taxId} onChange={(e) => setCustomer({ ...customer, taxId: e.target.value })} /></div>
              </div>
            </div>
          </div>

          <div className="col-span-12 lg:col-span-5">
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
                    <span className="muted">{type === 'bundle' ? `ชุดสินค้า (${itemCount})` : `สินค้า (${itemCount} เครื่อง)`}</span>
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
