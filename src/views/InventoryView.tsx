import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Icons } from '../components/Icons';
import { fmtTHB, fmtN } from '../data/format';
import {
  addUnits,
  deleteProduct,
  deleteSerial,
  fetchCategories,
  fetchProduct,
  fetchProducts,
  updateSerial,
  uploadImage,
  type Category,
  type Product,
  type ProductStatus,
  type Serial,
  type UnitInput,
} from '../data/inventory';
import { WARRANTY_PRESETS, isPresetWarranty } from '../data/warranty';
import { ApiError } from '../lib/api';
import type { ViewId } from '../types';

interface ViewProps {
  onNav: (id: ViewId) => void;
  showToast: (msg: string) => void;
  onEditProduct: (id: number) => void;
}

type SortKey = 'name' | 'stock' | 'price' | 'created';
type StockFilter = 'all' | 'in' | 'out';

/** Local YYYY-MM-DD for a timestamp (for date-range filtering + display). */
function localDay(ts: string): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Price range label for a catalog's in-stock units. */
function priceLabel(p: Product): string {
  if (p.price_min == null) return '—';
  if (p.price_max != null && p.price_max !== p.price_min) return `${fmtTHB(p.price_min)}+`;
  return fmtTHB(p.price_min);
}

export function InventoryView({ onNav, showToast, onEditProduct }: ViewProps) {
  const [tab, setTab] = useState<ProductStatus>('active');
  const [products, setProducts] = useState<Product[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);

  const [q, setQ] = useState('');
  const [cat, setCat] = useState<number | 'all'>('all');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'created', dir: 'desc' });
  const [page, setPage] = useState(1);
  const perPage = 10;

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProducts(await fetchProducts(tab === 'draft'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { fetchCategories().then(setCats).catch(() => {}); }, []);

  const filtered = useMemo(() => {
    let arr = products.slice();
    if (cat !== 'all') arr = arr.filter((p) => p.category_id === cat);
    if (stockFilter === 'out') arr = arr.filter((p) => p.stock === 0);
    if (stockFilter === 'in') arr = arr.filter((p) => p.stock > 0);
    if (q) {
      const s = q.toLowerCase();
      arr = arr.filter((p) =>
        p.name.toLowerCase().includes(s) ||
        (p.model ?? '').toLowerCase().includes(s));
    }
    // Date-range filter on the catalog's created date (local day, inclusive).
    if (dateFrom) arr = arr.filter((p) => localDay(p.created_at) >= dateFrom);
    if (dateTo) arr = arr.filter((p) => localDay(p.created_at) <= dateTo);
    const sortVal = (p: Product): string | number =>
      sort.key === 'name' ? p.name
        : sort.key === 'stock' ? p.stock
        : sort.key === 'price' ? (p.price_min ?? 0)
        : Date.parse(p.created_at);
    arr.sort((a, b) => {
      const va = sortVal(a); const vb = sortVal(b);
      const cmp = typeof va === 'string'
        ? va.localeCompare(vb as string, 'th')
        : (va as number) - (vb as number);
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [products, q, cat, stockFilter, dateFrom, dateTo, sort]);

  const pageItems = filtered.slice((page - 1) * perPage, page * perPage);
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));

  const setSortKey = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  const onDelete = async (p: Product) => {
    if (!window.confirm(`ลบ "${p.name}" และเครื่องทั้งหมดของสินค้านี้?`)) return;
    try {
      await deleteProduct(p.id);
      showToast('ลบสินค้าแล้ว');
      loadList();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'ลบไม่สำเร็จ');
    }
  };

  if (detailId !== null) {
    return (
      <ProductDetail
        id={detailId}
        onBack={() => { setDetailId(null); loadList(); }}
        onDeleted={() => { setDetailId(null); loadList(); }}
        onEdit={() => onEditProduct(detailId)}
        showToast={showToast}
      />
    );
  }

  const SortHd = ({ k, children, right }: { k: SortKey; children: ReactNode; right?: boolean }) => (
    <th style={right ? { textAlign: 'right' } : undefined}>
      <span className="tbl-th-sort" onClick={() => setSortKey(k)}>
        {children}
        {sort.key === k ? (sort.dir === 'asc' ? <Icons.arrowUp style={{ width: 11, height: 11 }} /> : <Icons.arrowDown style={{ width: 11, height: 11 }} />) : null}
      </span>
    </th>
  );

  const statusChip = (p: Product) =>
    p.stock === 0
      ? <span className="chip chip-neg chip-dot">หมด</span>
      : <span className="chip chip-pos chip-dot">มีของ</span>;

  const quickFilters: { id: StockFilter; label: string; count: number }[] = [
    { id: 'all', label: 'ทั้งหมด', count: products.length },
    { id: 'in', label: 'มีของ', count: products.filter((p) => p.stock > 0).length },
    { id: 'out', label: 'หมด', count: products.filter((p) => p.stock === 0).length },
  ];

  const totalValue = products.reduce((s, p) => s + p.stock_cost, 0);

  return (
    <div className="grid" style={{ gap: 'var(--gap)' }}>
      <div className="page-head">
        <div>
          <div className="page-title">คลังสินค้า</div>
          <div className="muted page-subtitle">{fmtN(products.length)} รายการ · มูลค่ารวม {fmtTHB(totalValue)}</div>
        </div>
        <div className="page-head-actions">
          <button className="btn btn-primary" onClick={() => onNav('add-product')}><Icons.plus /> เพิ่มสินค้า</button>
        </div>
      </div>

      <div className="tabs">
        <button className="tab" data-active={tab === 'active'} onClick={() => { setTab('active'); setPage(1); }}>สินค้า</button>
        <button className="tab" data-active={tab === 'draft'} onClick={() => { setTab('draft'); setPage(1); }}>แบบร่าง</button>
      </div>

      <div className="card card-pad" style={{ paddingBottom: 0 }}>
        <div className="filterbar" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div className="search grow">
            <Icons.search />
            <input placeholder="ค้นหาชื่อสินค้า หรือรุ่น..." value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          </div>
          <select className="select select-auto" value={cat} onChange={(e) => { setCat(e.target.value === 'all' ? 'all' : Number(e.target.value)); setPage(1); }}>
            <option value="all">ทุกหมวดหมู่</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input className="input" type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} style={{ width: 'auto' }} title="เพิ่มตั้งแต่วันที่" />
          <input className="input" type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} style={{ width: 'auto' }} title="ถึงวันที่" />
          {(dateFrom || dateTo) && (
            <button className="btn btn-sm btn-ghost" onClick={() => { setDateFrom(''); setDateTo(''); setPage(1); }}>ล้างตัวกรองวันที่</button>
          )}
        </div>

        <div className="quick-filters">
          {quickFilters.map((f) => (
            <button key={f.id} className={'quick-chip' + (stockFilter === f.id ? ' chip-accent' : '')} onClick={() => { setStockFilter(f.id); setPage(1); }}>
              {f.label} <span className="num" style={{ opacity: 0.6 }}>{f.count}</span>
            </button>
          ))}
        </div>

        <div className="table-wrap table-flush">
          <table className="tbl tbl-cards">
            <thead>
              <tr>
                <SortHd k="name">สินค้า</SortHd>
                <th>หมวด</th>
                <SortHd k="stock" right>คงเหลือ</SortHd>
                <SortHd k="price" right>ราคาขาย</SortHd>
                <SortHd k="created">เพิ่มเมื่อ</SortHd>
                <th>สถานะ</th>
                <th style={{ width: 90 }} />
              </tr>
            </thead>
            <tbody>
              {pageItems.map((p) => (
                <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => setDetailId(p.id)}>
                  <td className="cell-primary">
                    <div>
                      <div className="product-cell-name">
                        {p.name}
                        {p.draft_count > 0 && <span className="chip" style={{ marginLeft: 6, fontSize: 10 }}>แบบร่าง {p.draft_count}</span>}
                      </div>
                      <div className="product-cell-meta">{p.model || '—'}</div>
                    </div>
                  </td>
                  <td data-label="หมวด"><span className="muted" style={{ fontSize: 12.5 }}>{p.category_name || '—'}</span></td>
                  <td className="num" data-label="คงเหลือ" style={{ textAlign: 'right' }}>{p.stock}</td>
                  <td className="num" data-label="ราคาขาย" style={{ textAlign: 'right', fontWeight: 600 }}>{priceLabel(p)}</td>
                  <td data-label="เพิ่มเมื่อ"><span className="muted" style={{ fontSize: 12.5 }}>{new Date(p.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}</span></td>
                  <td data-label="สถานะ">{statusChip(p)}</td>
                  <td className="cell-actions" style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'inline-flex', gap: 4 }}>
                      <button className="btn btn-sm btn-icon btn-ghost" title="ดูรายละเอียด" onClick={() => setDetailId(p.id)}><Icons.arrowRight /></button>
                      <button className="btn btn-sm btn-icon btn-ghost" title="ลบ" onClick={() => onDelete(p)}><Icons.trash /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && pageItems.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40 }} className="muted">
                  {tab === 'draft' ? 'ไม่มีสินค้าที่มีเครื่องแบบร่าง' : 'ยังไม่มีสินค้า — กด "เพิ่มสินค้า" เพื่อเริ่ม'}
                </td></tr>
              )}
              {loading && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40 }} className="muted">กำลังโหลด...</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {error && <div className="muted" style={{ padding: 16, color: 'var(--neg)' }}>{error}</div>}

        <div className="pagn table-flush">
          <div>แสดง {filtered.length === 0 ? 0 : (page - 1) * perPage + 1}–{Math.min(page * perPage, filtered.length)} จาก {filtered.length} รายการ</div>
          <div className="pagn-pages">
            <button onClick={() => setPage(Math.max(1, page - 1))}>‹</button>
            {Array.from({ length: totalPages }).map((_, i) => (
              <button key={i} data-active={page === i + 1} onClick={() => setPage(i + 1)}>{i + 1}</button>
            ))}
            <button onClick={() => setPage(Math.min(totalPages, page + 1))}>›</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

interface DetailProps {
  id: number;
  onBack: () => void;
  onDeleted: () => void;
  onEdit: () => void;
  showToast: (msg: string) => void;
}

/** Blank unit form values. */
const blankUnit = (): UnitFormState => ({ serial: '', sku: '', cost: '', price: '', warranty: '36', warrantyCustom: false, note: '', image_url: null, draft: false });
interface UnitFormState {
  serial: string; sku: string; cost: string; price: string; warranty: string; warrantyCustom: boolean; note: string; image_url: string | null; draft: boolean;
}
const toUnitInput = (u: UnitFormState): UnitInput => ({
  serial: u.serial.trim(),
  sku: u.sku.trim() || null,
  cost: Number(u.cost) || 0,
  price: Number(u.price) || 0,
  warranty_months: Number(u.warranty) || 0,
  note: u.note.trim() || null,
  image_url: u.image_url,
  draft: u.draft,
});

function ProductDetail({ id, onBack, onDeleted, onEdit, showToast }: DetailProps) {
  const [product, setProduct] = useState<Product | null>(null);
  const [serials, setSerials] = useState<Serial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState<UnitFormState>(blankUnit());
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<UnitFormState>(blankUnit());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetchProduct(id);
      setProduct(r.product);
      setSerials(r.serials);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const addUnit = async () => {
    if (!addForm.serial.trim()) { showToast('ต้องระบุ Serial Number'); return; }
    setBusy(true);
    try {
      await addUnits(id, [toUnitInput(addForm)]);
      setAddForm(blankUnit());
      setAdding(false);
      showToast('เพิ่มเครื่องแล้ว');
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'เพิ่มไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (s: Serial) => {
    setEditId(s.id);
    setEditForm({
      serial: s.serial, sku: s.sku ?? '', cost: s.cost ? String(s.cost) : '',
      price: s.price ? String(s.price) : '', warranty: String(s.warranty_months),
      warrantyCustom: !isPresetWarranty(String(s.warranty_months)),
      note: s.note ?? '', image_url: s.image_url, draft: s.status === 'draft',
    });
  };

  const saveEdit = async () => {
    if (editId == null) return;
    if (!editForm.serial.trim()) { showToast('ต้องระบุ Serial Number'); return; }
    setBusy(true);
    try {
      await updateSerial(editId, toUnitInput(editForm));
      setEditId(null);
      showToast('บันทึกการแก้ไขแล้ว');
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const removeSerial = async (s: Serial) => {
    if (!window.confirm(`ลบเครื่อง serial ${s.serial}?`)) return;
    try {
      await deleteSerial(s.id);
      showToast('ลบเครื่องแล้ว');
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'ลบไม่สำเร็จ');
    }
  };

  const onDeleteProduct = async () => {
    if (!product) return;
    if (!window.confirm(`ลบ "${product.name}" และเครื่องทั้งหมด?`)) return;
    try {
      await deleteProduct(product.id);
      showToast('ลบสินค้าแล้ว');
      onDeleted();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'ลบไม่สำเร็จ');
    }
  };

  if (loading) return <div className="muted" style={{ padding: 40 }}>กำลังโหลด...</div>;
  if (error || !product) return (
    <div>
      <button className="btn btn-sm btn-ghost" onClick={onBack} style={{ marginBottom: 12 }}>← กลับ</button>
      <div className="muted" style={{ color: 'var(--neg)' }}>{error ?? 'ไม่พบสินค้า'}</div>
    </div>
  );

  const inStock = serials.filter((s) => s.status === 'in_stock').length;
  const draftCount = serials.filter((s) => s.status === 'draft').length;
  const serialStatusChip = (s: Serial['status']) => {
    if (s === 'draft') return <span className="chip chip-dot">แบบร่าง</span>;
    if (s === 'in_stock') return <span className="chip chip-pos chip-dot">ในสต๊อก</span>;
    if (s === 'sold') return <span className="chip chip-dot">ขายแล้ว</span>;
    return <span className="chip chip-warn chip-dot">คืน</span>;
  };

  return (
    <div className="grid" style={{ gap: 'var(--gap)' }}>
      <div className="page-head">
        <div>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onBack} style={{ marginBottom: 8 }}>← กลับไปคลังสินค้า</button>
          <div className="page-title">{product.name}</div>
          <div className="muted page-subtitle">{product.category_name || 'ไม่ระบุหมวด'}{product.status === 'draft' ? ' · แบบร่าง' : ''}</div>
        </div>
        <div className="page-head-actions">
          <button className="btn" onClick={onEdit}><Icons.edit /> แก้ไข</button>
          <button className="btn" onClick={onDeleteProduct}><Icons.trash /> ลบสินค้า</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12">
        <div className="col-span-12 lg:col-span-4">
          <div className="card card-pad">
            <div className="summary-box">
              <div className="summary-row"><span className="muted">รุ่น</span><span>{product.model || '—'}</span></div>
              <div className="summary-row"><span className="muted">คงเหลือ</span><span className="num">{inStock} เครื่อง</span></div>
              <div className="summary-row"><span className="muted">ช่วงราคาขาย</span><span className="num">{priceLabel(product)}</span></div>
              <div className="summary-row"><span className="muted">จุดสั่งซื้อ</span><span className="num">{product.low}</span></div>
            </div>
            {product.notes && <div className="hint-box" style={{ marginTop: 12 }}><Icons.warning style={{ width: 14, height: 14, color: 'var(--accent)', marginTop: 1 }} /><span>{product.notes}</span></div>}
          </div>
        </div>

        <div className="col-span-12 lg:col-span-8">
          <div className="card card-pad">
            <div className="section-h">
              <div><h3>เครื่องในสต๊อก ({inStock})</h3><div className="muted section-sub">แต่ละเครื่องมีราคา/รับประกัน/รูปของตัวเอง · รวม {serials.length} รายการ{draftCount > 0 ? ` · แบบร่าง ${draftCount}` : ''}</div></div>
              <div className="spacer" />
              {!adding && <button type="button" className="btn btn-sm btn-primary" onClick={() => setAdding(true)}><Icons.plus /> เพิ่มเครื่อง</button>}
            </div>

            {adding && (
              <div className="card card-pad" style={{ background: 'var(--surface-sunk)', marginBottom: 14 }}>
                <UnitFields value={addForm} onChange={setAddForm} onUploadError={showToast} />
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button className="btn btn-primary btn-sm" disabled={busy} onClick={addUnit}><Icons.check /> เพิ่ม</button>
                  <button className="btn btn-sm" onClick={() => { setAdding(false); setAddForm(blankUnit()); }}>ยกเลิก</button>
                </div>
              </div>
            )}

            <div className="table-wrap">
              <table className="tbl tbl-cards">
                <thead><tr><th>Serial / SKU</th><th style={{ textAlign: 'right' }}>ราคาทุน</th><th style={{ textAlign: 'right' }}>ราคาขาย</th><th>รับประกัน</th><th>สถานะ</th><th style={{ width: 80 }} /></tr></thead>
                <tbody>
                  {serials.map((s) => (
                    editId === s.id ? (
                      <tr key={s.id}>
                        <td colSpan={6} style={{ padding: 14 }}>
                          <UnitFields value={editForm} onChange={setEditForm} onUploadError={showToast} />
                          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                            <button className="btn btn-primary btn-sm" disabled={busy} onClick={saveEdit}><Icons.check /> บันทึก</button>
                            <button className="btn btn-sm" onClick={() => setEditId(null)}>ยกเลิก</button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={s.id}>
                        <td className="cell-primary">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {s.image_url
                              ? <a href={s.image_url} target="_blank" rel="noreferrer" title="ดูรูปเต็ม"><img src={s.image_url} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 'var(--r-md)', background: 'var(--surface-sunk)', display: 'block' }} /></a>
                              : <div style={{ width: 40, height: 40, borderRadius: 'var(--r-md)', background: 'var(--surface-sunk)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: 'var(--ink-4)', flexShrink: 0 }}>ไม่มีรูป</div>}
                            <div style={{ minWidth: 0 }}>
                              <div className="mono" style={{ fontSize: 12.5 }}>{s.serial}</div>
                              {s.sku && <div className="mono muted" style={{ fontSize: 11 }}>{s.sku}</div>}
                              {s.note && <div className="muted" style={{ fontSize: 11 }}>{s.note}</div>}
                            </div>
                          </div>
                        </td>
                        <td className="num muted" data-label="ราคาทุน" style={{ textAlign: 'right' }}>{fmtTHB(s.cost)}</td>
                        <td className="num" data-label="ราคาขาย" style={{ textAlign: 'right', fontWeight: 600 }}>{fmtTHB(s.price)}</td>
                        <td data-label="รับประกัน"><span className="muted" style={{ fontSize: 12.5 }}>{s.warranty_months ? `${s.warranty_months} เดือน` : 'ไม่มี'}</span></td>
                        <td data-label="สถานะ">{serialStatusChip(s.status)}</td>
                        <td className="cell-actions">
                          {s.status !== 'sold' && (
                            <div style={{ display: 'inline-flex', gap: 4 }}>
                              <button className="btn btn-sm btn-icon btn-ghost" title="แก้ไขเครื่องนี้" onClick={() => startEdit(s)}><Icons.edit /></button>
                              <button className="btn btn-sm btn-icon btn-ghost" title="ลบเครื่องนี้" onClick={() => removeSerial(s)}><Icons.trash /></button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  ))}
                  {serials.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: 30 }} className="muted">ยังไม่มีเครื่องในสต๊อก — กด "เพิ่มเครื่อง" ด้านบน</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Shared editable fields for one unit (add + edit). */
function UnitFields({ value, onChange, onUploadError }: {
  value: UnitFormState;
  onChange: (v: UnitFormState) => void;
  onUploadError: (msg: string) => void;
}) {
  const set = (patch: Partial<UnitFormState>) => onChange({ ...value, ...patch });
  const onPick = async (file: File | undefined) => {
    if (!file) return;
    try { set({ image_url: await uploadImage(file) }); }
    catch (err) { onUploadError(err instanceof Error ? err.message : 'อัปโหลดรูปไม่สำเร็จ'); }
  };
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[14px]">
      <div className="field">
        <label className="field-label">Serial Number *</label>
        <input className="input mono" placeholder="..." value={value.serial} onChange={(e) => set({ serial: e.target.value })} />
      </div>
      <div className="field">
        <label className="field-label">SKU (ไม่บังคับ)</label>
        <input className="input mono" placeholder="SKU001" value={value.sku} onChange={(e) => set({ sku: e.target.value })} />
      </div>
      <div className="field">
        <label className="field-label">รับประกัน</label>
        <select
          className="select"
          value={value.warrantyCustom ? 'custom' : value.warranty}
          onChange={(e) => {
            if (e.target.value === 'custom') set({ warrantyCustom: true });
            else set({ warrantyCustom: false, warranty: e.target.value });
          }}
        >
          {WARRANTY_PRESETS.map((m) => <option key={m.v} value={m.v}>{m.label}</option>)}
          <option value="custom">อื่นๆ (กำหนดเอง)</option>
        </select>
        {value.warrantyCustom && (
          <input className="input num" style={{ marginTop: 6 }} type="number" min="0" placeholder="ระบุจำนวนเดือน" value={isPresetWarranty(value.warranty) ? '' : value.warranty} onChange={(e) => set({ warranty: e.target.value })} autoFocus />
        )}
      </div>
      <div className="field">
        <label className="field-label">ราคาทุน (บาท)</label>
        <div className="input-prefix"><span className="pfx">฿</span>
          <input className="input num" type="number" placeholder="0" value={value.cost} onChange={(e) => set({ cost: e.target.value })} /></div>
      </div>
      <div className="field">
        <label className="field-label">ราคาขาย (บาท)</label>
        <div className="input-prefix"><span className="pfx">฿</span>
          <input className="input num" type="number" placeholder="0" value={value.price} onChange={(e) => set({ price: e.target.value })} /></div>
      </div>
      <div className="field">
        <label className="field-label">รูปของเครื่องนี้</label>
        {value.image_url ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src={value.image_url} alt="" style={{ width: 56, height: 42, objectFit: 'cover', borderRadius: 'var(--r-md)', background: 'var(--surface)' }} />
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => set({ image_url: null })}><Icons.trash /></button>
          </div>
        ) : (
          <label className="btn btn-sm" style={{ cursor: 'pointer', width: 'fit-content' }}>
            <Icons.upload style={{ width: 14, height: 14 }} /> เลือกรูป
            <input type="file" accept="image/*" hidden onChange={(e) => onPick(e.target.files?.[0])} />
          </label>
        )}
      </div>
      <div className="field" style={{ gridColumn: '1 / -1' }}>
        <label className="field-label">โน้ต  </label>
        <input className="input" placeholder="เช่น กล่องบุบ, ของโชว์" value={value.note} onChange={(e) => set({ note: e.target.value })} />
      </div>
      <div className="field" style={{ gridColumn: '1 / -1' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={value.draft} onChange={(e) => set({ draft: e.target.checked })} />
          <span className="field-label" style={{ margin: 0 }}>บันทึกเป็นแบบร่าง</span>
        </label>
      </div>
    </div>
  );
}
