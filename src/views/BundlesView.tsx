import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icons } from '../components/Icons';
import { fmtTHB } from '../data/format';
import { fetchCategories, fetchProducts, type Category, type Product } from '../data/inventory';
import { createBundle, deleteBundle, fetchBundles, updateBundle, type Bundle } from '../data/bundles';
import { ApiError } from '../lib/api';

interface ViewProps {
  showToast: (msg: string) => void;
}

/** Square thumbnail: photo if present, otherwise "ไม่มีรูป". */
function Thumb({ url, lg }: { url: string | null; lg?: boolean }) {
  return (
    <div className={lg ? 'thumb thumb-lg' : 'thumb'}>
      {url
        ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
        : <span style={{ fontSize: lg ? 9 : 7, color: 'var(--ink-4)' }}>ไม่มีรูป</span>}
    </div>
  );
}

export function BundlesView({ showToast }: ViewProps) {
  const [mode, setMode] = useState<'list' | 'edit'>('list');
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // edit/create form
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [discount, setDiscount] = useState(5);
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [filterCat, setFilterCat] = useState<number | 'all'>('all');

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBundles(await fetchBundles());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => {
    fetchProducts().then(setProducts).catch(() => {});
    fetchCategories().then(setCats).catch(() => {});
  }, []);

  const productById = useMemo(() => {
    const m = new Map<number, Product>();
    products.forEach((p) => m.set(p.id, p));
    return m;
  }, [products]);

  const cost = selected.reduce((s, id) => s + (productById.get(id)?.cost_min ?? 0), 0);
  const listPrice = selected.reduce((s, id) => s + (productById.get(id)?.price_min ?? 0), 0);
  const bundlePrice = Math.round(listPrice * (1 - discount / 100));
  const profit = bundlePrice - cost;
  const margin = bundlePrice ? (profit / bundlePrice) * 100 : 0;

  const visible = products.filter((p) => {
    if (filterCat !== 'all' && p.category_id !== filterCat) return false;
    if (q && !p.name.toLowerCase().includes(q.toLowerCase()) && !(p.model ?? '').toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const startCreate = () => {
    setEditingId(null); setName(''); setDiscount(5); setSelected([]); setQ(''); setFilterCat('all');
    setMode('edit');
  };
  const startEdit = (b: Bundle) => {
    setEditingId(b.id); setName(b.name); setDiscount(b.discount_pct);
    setSelected(b.items.map((i) => i.product_id)); setQ(''); setFilterCat('all');
    setMode('edit');
  };

  const save = async () => {
    if (!name.trim() || !selected.length) return;
    setBusy(true);
    try {
      if (editingId != null) {
        await updateBundle(editingId, name.trim(), discount, selected);
        showToast('บันทึกการแก้ไขชุดสินค้าแล้ว');
      } else {
        await createBundle(name.trim(), discount, selected);
        showToast('สร้างชุดสินค้าเรียบร้อย');
      }
      setMode('list');
      loadList();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (b: Bundle) => {
    if (!window.confirm(`ลบชุด "${b.name}"?`)) return;
    try {
      await deleteBundle(b.id);
      showToast('ลบชุดสินค้าแล้ว');
      loadList();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'ลบไม่สำเร็จ');
    }
  };

  // ----- LIST MODE -----
  if (mode === 'list') {
    return (
      <div className="grid" style={{ gap: 'var(--gap)' }}>
        <div className="page-head">
          <div>
            <div className="page-title">ชุดสินค้า (Bundles)</div>
            <div className="muted page-subtitle">รวมสินค้าหลายชิ้นเป็นเซ็ตขายพร้อมส่วนลด</div>
          </div>
          <div className="page-head-actions">
            <button className="btn btn-primary" onClick={startCreate}><Icons.plus /> สร้างชุดใหม่</button>
          </div>
        </div>

        {error && <div className="muted" style={{ color: 'var(--neg)' }}>{error}</div>}
        {loading && <div className="muted" style={{ padding: 20 }}>กำลังโหลด...</div>}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {bundles.map((b) => {
            const off = b.list_price ? Math.round((1 - b.price / b.list_price) * 100) : 0;
            return (
              <div key={b.id} className="card" style={{ overflow: 'hidden' }}>
                <div className="bundle-cover">
                  <div style={{ display: 'flex', gap: 6 }}>
                    {b.items.slice(0, 4).map((it) => <Thumb key={it.product_id} url={it.image_url} lg />)}
                    {b.items.length > 4 && <div className="thumb thumb-lg" style={{ background: 'var(--ink)', color: 'var(--bg)' }}>+{b.items.length - 4}</div>}
                  </div>
                  {off > 0 && <span className="chip chip-accent" style={{ position: 'absolute', top: 12, left: 12 }}>ลด {off}%</span>}
                </div>
                <div className="card-pad">
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{b.name}</div>
                  <div className="muted mono" style={{ fontSize: 11.5 }}>{b.items.length} ชิ้น · ขายได้อีก {b.stock} ชุด{b.sold ? ` · ขายไปแล้ว ${b.sold}` : ''}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 14 }}>
                    <div>
                      <div className="muted" style={{ fontSize: 11.5 }}>ราคาชุด</div>
                      <div className="num" style={{ fontSize: 19, fontWeight: 600, marginTop: 2 }}>{fmtTHB(b.price)}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="muted" style={{ fontSize: 11.5 }}>กำไร</div>
                      <div className="num" style={{ fontSize: 14, fontWeight: 600, color: 'var(--pos)', marginTop: 2 }}>+{fmtTHB(b.profit)}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
                    <button className="btn btn-sm" style={{ flex: 1 }} onClick={() => startEdit(b)}><Icons.edit /> แก้ไข</button>
                    <button className="btn btn-sm btn-icon btn-ghost" title="ลบ" onClick={() => remove(b)}><Icons.trash /></button>
                  </div>
                </div>
              </div>
            );
          })}
          <button type="button" onClick={startCreate} className="card bundle-create">
            <div className="bundle-create-ic"><Icons.plus /></div>
            <div style={{ fontWeight: 500 }}>สร้างชุดใหม่</div>
            <div className="muted" style={{ fontSize: 12 }}>เลือกสินค้าหลายชิ้น ตั้งราคา และขาย</div>
          </button>
        </div>

        {!loading && bundles.length === 0 && (
          <div className="muted" style={{ textAlign: 'center', padding: 20 }}>ยังไม่มีชุดสินค้า — กด "สร้างชุดใหม่"</div>
        )}
      </div>
    );
  }

  // ----- CREATE / EDIT MODE -----
  return (
    <div>
      <div className="page-head" style={{ marginBottom: 22 }}>
        <div>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setMode('list')} style={{ marginBottom: 8 }}>← กลับไปรายการชุด</button>
          <div className="page-title">{editingId != null ? 'แก้ไขชุดสินค้า' : 'สร้างชุดสินค้าใหม่'}</div>
          <div className="muted page-subtitle">เลือกสินค้าจากคลัง ระบบจะรวมราคาให้อัตโนมัติ</div>
        </div>
        <div className="page-head-actions">
          <button className="btn btn-primary" disabled={!selected.length || !name.trim() || busy} onClick={save}>
            <Icons.check /> {busy ? 'กำลังบันทึก...' : editingId != null ? 'บันทึกการแก้ไข' : `สร้างชุด (${selected.length})`}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12">
        <div className="col-span-12 lg:col-span-7 grid" style={{ gap: 'var(--gap)' }}>
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
                <select className="select select-auto" value={filterCat} onChange={(e) => setFilterCat(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
                  <option value="all">ทุกหมวดหมู่</option>
                  {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="pick-list">
              {visible.map((p) => {
                const isSel = selected.includes(p.id);
                return (
                  <button key={p.id} type="button" className={'product-pick' + (isSel ? ' selected' : '')}
                    onClick={() => setSelected((s) => (isSel ? s.filter((x) => x !== p.id) : [...s, p.id]))}>
                    <Thumb url={null} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500 }}>{p.name}</div>
                      <div className="muted mono" style={{ fontSize: 11.5, marginTop: 1 }}>{p.model || '—'} · คงเหลือ {p.stock}</div>
                    </div>
                    <div className="num" style={{ fontWeight: 600 }}>{p.price_min == null ? '—' : `${fmtTHB(p.price_min)}+`}</div>
                    <div className="pick-check" data-on={isSel}>{isSel && <Icons.check style={{ width: 12, height: 12 }} />}</div>
                  </button>
                );
              })}
              {visible.length === 0 && <div className="muted" style={{ padding: 24, textAlign: 'center' }}>ไม่พบสินค้า</div>}
            </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-5">
          <div className="sticky-aside">
            <div className="card card-pad">
              <div className="section-h"><div><h3>สรุปชุดสินค้า</h3><div className="muted section-sub">{selected.length} ชิ้นในชุด</div></div></div>
              {selected.length === 0 ? (
                <div className="empty-block">
                  <Icons.layers style={{ width: 28, height: 28, margin: '0 auto 8px', display: 'block', color: 'var(--ink-4)' }} />
                  <div style={{ fontSize: 13 }}>ยังไม่มีสินค้า</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>เลือกจากรายการด้านซ้าย</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto' }}>
                  {selected.map((id) => {
                    const p = productById.get(id);
                    if (!p) return null;
                    return (
                      <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
                        <Thumb url={null} />
                        <div style={{ flex: 1, minWidth: 0, fontSize: 12.5 }}>
                          <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                          <div className="muted mono" style={{ fontSize: 11 }}>{p.model || '—'}</div>
                        </div>
                        <div className="num" style={{ fontSize: 12.5 }}>{p.price_min == null ? '—' : fmtTHB(p.price_min)}</div>
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
                <div className="summary-row"><span className="muted">ราคารวม (ก่อนลด)</span><span className="num">{fmtTHB(listPrice)}</span></div>
                <div className="summary-row"><span className="muted">ส่วนลด {discount}%</span><span className="num" style={{ color: 'var(--neg)' }}>−{fmtTHB(listPrice - bundlePrice)}</span></div>
                <div className="summary-row"><span className="muted">ต้นทุนรวม</span><span className="num">{fmtTHB(cost)}</span></div>
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
