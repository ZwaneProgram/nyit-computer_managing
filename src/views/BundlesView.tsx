import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icons } from '../components/Icons';
import { fmtTHB } from '../data/format';
import { fetchCategories, fetchProduct, fetchProducts, type Category, type Product, type Serial } from '../data/inventory';
import { createBundle, deleteBundle, fetchBundles, updateBundle, type Bundle } from '../data/bundles';
import { ImageManager } from '../components/ImageManager';
import { BUNDLE_WARRANTY_PRESETS, isPresetWarranty, warrantyDisplay, resolveWarranty, SHOP_WARRANTY_30 } from '../data/warranty';
import { ApiError } from '../lib/api';
import { generateBundlePoster } from '../data/aiPost';
import { AI_IMAGE_GEN_ENABLED } from '../lib/features';

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
  const [warranty, setWarranty] = useState('0');
  const [warrantyCustom, setWarrantyCustom] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [cover, setCover] = useState<string | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  // product_id -> pinned serial id (null = auto/cheapest).
  const [pins, setPins] = useState<Record<number, number | null>>({});
  // product_id -> in-stock units, loaded lazily for the pin dropdown.
  const [unitMap, setUnitMap] = useState<Record<number, Serial[]>>({});
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [filterCat, setFilterCat] = useState<number | 'all'>('all');

  const [posterOpen, setPosterOpen] = useState(false);
  const [posterPrice, setPosterPrice] = useState('');
  const [posterNote, setPosterNote] = useState('ราคานี้ยังไม่รวมการ์ดจอ');
  const [posterSubtitle, setPosterSubtitle] = useState('แรง ลื่น ครบ จบในเครื่องเดียว');
  const [posterBusy, setPosterBusy] = useState(false);

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

  // Load a product's in-stock units for the pin dropdown (once per product).
  const loadUnits = useCallback(async (pid: number) => {
    if (unitMap[pid]) return;
    try {
      const { serials } = await fetchProduct(pid);
      setUnitMap((m) => ({ ...m, [pid]: serials.filter((s) => s.status === 'in_stock') }));
    } catch { /* ignore */ }
  }, [unitMap]);

  // Price/cost of a component: the pinned unit when chosen, else the cheapest.
  const pinnedUnit = (pid: number): Serial | null => {
    const sid = pins[pid];
    if (sid == null) return null;
    return unitMap[pid]?.find((u) => u.id === sid) ?? null;
  };
  const priceFor = (pid: number) => pinnedUnit(pid)?.price ?? productById.get(pid)?.price_min ?? 0;
  const costFor = (pid: number) => pinnedUnit(pid)?.cost ?? productById.get(pid)?.cost_min ?? 0;

  const cost = selected.reduce((s, id) => s + costFor(id), 0);
  const listPrice = selected.reduce((s, id) => s + priceFor(id), 0);
  const bundlePrice = Math.round(listPrice * (1 - discount / 100));
  const profit = bundlePrice - cost;
  const margin = bundlePrice ? (profit / bundlePrice) * 100 : 0;

  const visible = products.filter((p) => {
    if (filterCat !== 'all' && p.category_id !== filterCat) return false;
    if (q && !p.name.toLowerCase().includes(q.toLowerCase()) && !(p.model ?? '').toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const startCreate = () => {
    setEditingId(null); setName(''); setDiscount(5); setWarranty('0'); setWarrantyCustom(false);
    setImages([]); setCover(null);
    setSelected([]); setPins({}); setUnitMap({}); setQ(''); setFilterCat('all');
    setMode('edit');
  };
  const startEdit = (b: Bundle) => {
    setEditingId(b.id); setName(b.name); setDiscount(b.discount_pct);
    setWarranty(b.warranty_text ?? String(b.warranty_months));
    setWarrantyCustom(!!b.warranty_text || !isPresetWarranty(String(b.warranty_months)));
    setImages(b.images); setCover(b.image_url);
    setSelected(b.items.map((i) => i.product_id));
    setPins(Object.fromEntries(b.items.map((i) => [i.product_id, i.serial_id])));
    setUnitMap({});
    b.items.forEach((i) => loadUnits(i.product_id)); // so the pin dropdown is ready
    setQ(''); setFilterCat('all');
    setMode('edit');
  };

  // Toggle a product in/out of the bundle; load its units when added.
  const toggleProduct = (pid: number) => {
    if (selected.includes(pid)) {
      setSelected((s) => s.filter((x) => x !== pid));
      setPins((p) => { const { [pid]: _drop, ...rest } = p; return rest; });
    } else {
      setSelected((s) => [...s, pid]);
      setPins((p) => ({ ...p, [pid]: null }));
      loadUnits(pid);
    }
  };

  const save = async () => {
    if (!name.trim() || !selected.length) return;
    setBusy(true);
    try {
      const { warranty_months, warranty_text } = resolveWarranty(warranty, warrantyCustom);
      const gallery = { images, image_url: cover };
      const items = selected.map((id) => ({ product_id: id, serial_id: pins[id] ?? null }));
      if (editingId != null) {
        await updateBundle(editingId, name.trim(), discount, warranty_months, warranty_text, items, gallery);
        showToast('บันทึกการแก้ไขชุดสินค้าแล้ว');
      } else {
        await createBundle(name.trim(), discount, warranty_months, warranty_text, items, gallery);
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

  const openPoster = () => {
    // Pre-fill with the auto-calculated price (component list price minus discount).
    const computed = Math.round(listPrice * (1 - discount / 100));
    setPosterPrice(computed > 0 ? String(computed) : '');
    setPosterOpen(true);
  };

  const runPoster = async () => {
    if (editingId == null) return;
    setPosterBusy(true);
    try {
      const priceNum = Number(posterPrice);
      const { imageUrl } = await generateBundlePoster(editingId, {
        price: Number.isFinite(priceNum) && priceNum > 0 ? priceNum : undefined,
        priceNote: posterNote.trim() || undefined,
        subtitle: posterSubtitle.trim() || undefined,
      });
      setImages((prev) => (prev.includes(imageUrl) ? prev : [...prev, imageUrl]));
      setCover((c) => c ?? imageUrl);
      setPosterOpen(false);
      showToast('สร้างโปสเตอร์แล้ว — อย่าลืมกดบันทึกการแก้ไข');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'สร้างโปสเตอร์ไม่สำเร็จ');
    } finally {
      setPosterBusy(false);
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
                  {b.image_url ? (
                    <img src={b.image_url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ display: 'flex', gap: 6 }}>
                      {b.items.slice(0, 4).map((it) => <Thumb key={it.product_id} url={it.image_url} lg />)}
                      {b.items.length > 4 && <div className="thumb thumb-lg" style={{ background: 'var(--ink)', color: 'var(--bg)' }}>+{b.items.length - 4}</div>}
                    </div>
                  )}
                  {off > 0 && <span className="chip chip-accent" style={{ position: 'absolute', top: 12, left: 12 }}>ลด {off}%</span>}
                </div>
                <div className="card-pad">
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{b.name}</div>
                  <div className="muted mono" style={{ fontSize: 11.5 }}>{b.items.length} ชิ้น · ขายได้อีก {b.stock} ชุด{b.sold ? ` · ขายไปแล้ว ${b.sold}` : ''}</div>
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>รับประกัน: {warrantyDisplay(b.warranty_months, b.warranty_text, SHOP_WARRANTY_30)}</div>
                  {b.items.some((it) => it.serial_id != null && !it.pinned_ok) && (
                    <div style={{ fontSize: 11, marginTop: 3, color: 'var(--neg)' }}>⚠ ชิ้นที่ปักหมุดบางชิ้นถูกขายแล้ว — ระบบจะเลือกชิ้นอื่นให้</div>
                  )}
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
            <div className="field" style={{ marginTop: 14 }}>
              <label className="field-label">รับประกัน</label>
              <select
                className="select"
                value={warrantyCustom ? 'custom' : warranty}
                onChange={(e) => {
                  if (e.target.value === 'custom') setWarrantyCustom(true);
                  else { setWarrantyCustom(false); setWarranty(e.target.value); }
                }}
              >
                {BUNDLE_WARRANTY_PRESETS.map((m) => <option key={m.v} value={m.v}>{m.label}</option>)}
                <option value="custom">กำหนดเอง...</option>
              </select>
              {warrantyCustom && (
                <input className="input" style={{ marginTop: 6 }} type="text" placeholder="พิมพ์ได้ตามต้องการ เช่น 15 วัน, ประกันตลอดชีพ" value={isPresetWarranty(warranty) ? '' : warranty} onChange={(e) => setWarranty(e.target.value)} autoFocus />
              )}
            </div>
            <div className="field" style={{ marginTop: 14 }}>
              <label className="field-label">รูปของชุดนี้ (ใส่ได้หลายรูป · เลือกรูปปกได้)</label>
              <ImageManager
                value={{ images, cover }}
                onChange={(g) => { setImages(g.images); setCover(g.cover); }}
                onError={showToast}
              />
              {AI_IMAGE_GEN_ENABLED && editingId != null && (
                <div style={{ marginTop: 10 }}>
                  {!posterOpen ? (
                    <button type="button" className="btn btn-sm imgman-ai-btn" onClick={openPoster}>
                      🎨 สร้างโปสเตอร์ AI
                    </button>
                  ) : (
                    <div className="imgman-picker">
                      <div className="imgman-picker-head">
                        <span className="imgman-picker-title">🎨 สร้างโปสเตอร์ชุดคอม</span>
                        <button type="button" className="imgman-picker-close" title="ปิด" aria-label="ปิด" onClick={() => setPosterOpen(false)}><Icons.x /></button>
                      </div>
                      <div className="imgman-picker-body" style={{ display: 'grid', gap: 10 }}>
                        <div className="field">
                          <label className="field-label">ราคาบนโปสเตอร์ (บาท)</label>
                          <input className="input num" type="number" placeholder="เช่น 21800" value={posterPrice} onChange={(e) => setPosterPrice(e.target.value)} />
                        </div>
                        <div className="field">
                          <label className="field-label">หมายเหตุราคา</label>
                          <input className="input" type="text" value={posterNote} onChange={(e) => setPosterNote(e.target.value)} />
                        </div>
                        <div className="field">
                          <label className="field-label">คำโปรย</label>
                          <input className="input" type="text" value={posterSubtitle} onChange={(e) => setPosterSubtitle(e.target.value)} />
                        </div>
                        <button type="button" className="btn btn-primary btn-sm" disabled={posterBusy} onClick={runPoster}>
                          {posterBusy ? 'กำลังสร้าง...' : 'สร้างโปสเตอร์'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
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
                    onClick={() => toggleProduct(p.id)}>
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
                    const units = unitMap[id];
                    const pin = pins[id] ?? null;
                    return (
                      <div key={id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0' }}>
                        <Thumb url={null} />
                        <div style={{ flex: 1, minWidth: 0, fontSize: 12.5 }}>
                          <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                          <select
                            className="select"
                            style={{ marginTop: 4, width: '100%', fontSize: 11.5, height: 30, padding: '0 8px' }}
                            value={pin ?? 'auto'}
                            onChange={(e) => {
                              const v = e.target.value === 'auto' ? null : Number(e.target.value);
                              setPins((prev) => ({ ...prev, [id]: v }));
                            }}
                          >
                            <option value="auto">อัตโนมัติ (ถูกสุด)</option>
                            {units == null
                              ? <option disabled>กำลังโหลดชิ้น...</option>
                              : units.map((u) => <option key={u.id} value={u.id}>{u.serial} · {fmtTHB(u.price)}</option>)}
                            {/* Pinned unit already sold: keep it selectable so the choice is visible. */}
                            {pin != null && units != null && !units.some((u) => u.id === pin) && (
                              <option value={pin}>ชิ้นที่ปักหมุด (ขายแล้ว)</option>
                            )}
                          </select>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                          <button type="button" className="btn btn-sm btn-icon btn-ghost" onClick={() => toggleProduct(id)}><Icons.x /></button>
                          <div className="num" style={{ fontSize: 12.5 }}>{fmtTHB(priceFor(id))}</div>
                        </div>
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
