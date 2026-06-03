import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Icons } from '../components/Icons';
import { fmtTHB, fmtN } from '../data/format';
import {
  addSerials,
  deleteProduct,
  deleteSerial,
  fetchCategories,
  fetchProduct,
  fetchProducts,
  type Category,
  type Product,
  type ProductStatus,
  type Serial,
} from '../data/inventory';
import { ApiError } from '../lib/api';
import type { ViewId } from '../types';

interface ViewProps {
  onNav: (id: ViewId) => void;
  showToast: (msg: string) => void;
  onEditProduct: (id: number) => void;
}

type SortKey = 'name' | 'stock' | 'cost' | 'price';
type StockFilter = 'all' | 'in' | 'low' | 'out';

/** Square thumbnail: photo if present, otherwise "ไม่มีรูป". */
function Thumb({ url, lg }: { url: string | null; lg?: boolean }) {
  return (
    <div className={lg ? 'thumb thumb-lg' : 'thumb'}>
      {url
        ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
        : <span style={{ fontSize: lg ? 10 : 8, color: 'var(--ink-4)' }}>ไม่มีรูป</span>}
    </div>
  );
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
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' });
  const [page, setPage] = useState(1);
  const perPage = 10;

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProducts(await fetchProducts(tab));
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
    if (stockFilter === 'low') arr = arr.filter((p) => p.stock <= p.low && p.stock > 0);
    if (stockFilter === 'out') arr = arr.filter((p) => p.stock === 0);
    if (stockFilter === 'in') arr = arr.filter((p) => p.stock > p.low);
    if (q) {
      const s = q.toLowerCase();
      arr = arr.filter((p) =>
        p.name.toLowerCase().includes(s) ||
        (p.sku ?? '').toLowerCase().includes(s) ||
        (p.brand ?? '').toLowerCase().includes(s));
    }
    arr.sort((a, b) => {
      const va = a[sort.key]; const vb = b[sort.key];
      const cmp = typeof va === 'string'
        ? va.localeCompare(vb as string, 'th')
        : (va as number) - (vb as number);
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [products, q, cat, stockFilter, sort]);

  const pageItems = filtered.slice((page - 1) * perPage, page * perPage);
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));

  const setSortKey = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  const onDelete = async (p: Product) => {
    if (!window.confirm(`ลบ "${p.name}" และ Serial ทั้งหมดของสินค้านี้?`)) return;
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
    p.stock === 0 ? <span className="chip chip-neg chip-dot">หมด</span>
      : p.stock <= p.low ? <span className="chip chip-warn chip-dot">เหลือน้อย</span>
        : <span className="chip chip-pos chip-dot">พร้อมขาย</span>;

  const quickFilters: { id: StockFilter; label: string; count: number }[] = [
    { id: 'all', label: 'ทั้งหมด', count: products.length },
    { id: 'in', label: 'มีสต๊อก', count: products.filter((p) => p.stock > p.low).length },
    { id: 'low', label: 'เหลือน้อย', count: products.filter((p) => p.stock <= p.low && p.stock > 0).length },
    { id: 'out', label: 'หมดสต๊อก', count: products.filter((p) => p.stock === 0).length },
  ];

  const totalValue = products.reduce((s, p) => s + p.cost * p.stock, 0);

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
        <div className="filterbar" style={{ marginBottom: 16 }}>
          <div className="search grow">
            <Icons.search />
            <input placeholder="ค้นหาชื่อสินค้า, SKU, หรือยี่ห้อ..." value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          </div>
          <select className="select select-auto" value={cat} onChange={(e) => { setCat(e.target.value === 'all' ? 'all' : Number(e.target.value)); setPage(1); }}>
            <option value="all">ทุกหมวดหมู่</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="quick-filters">
          {quickFilters.map((f) => (
            <button key={f.id} className={'quick-chip' + (stockFilter === f.id ? ' chip-accent' : '')} onClick={() => { setStockFilter(f.id); setPage(1); }}>
              {f.label} <span className="num" style={{ opacity: 0.6 }}>{f.count}</span>
            </button>
          ))}
        </div>

        <div className="table-wrap table-flush">
          <table className="tbl">
            <thead>
              <tr>
                <SortHd k="name">สินค้า</SortHd>
                <th>SKU</th>
                <th>หมวด</th>
                <SortHd k="stock" right>คงเหลือ</SortHd>
                <SortHd k="cost" right>ราคาทุน</SortHd>
                <SortHd k="price" right>ราคาขาย</SortHd>
                <th>สถานะ</th>
                <th style={{ width: 90 }} />
              </tr>
            </thead>
            <tbody>
              {pageItems.map((p) => (
                <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => setDetailId(p.id)}>
                  <td>
                    <div className="product-cell">
                      <Thumb url={p.image_url} />
                      <div>
                        <div className="product-cell-name">{p.name}</div>
                        <div className="product-cell-meta">{p.brand || '—'}{p.warranty_months ? ` · รับประกัน ${p.warranty_months} เดือน` : ''}</div>
                      </div>
                    </div>
                  </td>
                  <td><div className="mono" style={{ fontSize: 12 }}>{p.sku || '—'}</div></td>
                  <td><span className="muted" style={{ fontSize: 12.5 }}>{p.category_name || '—'}</span></td>
                  <td className="num" style={{ textAlign: 'right' }}>{p.stock}</td>
                  <td className="num muted" style={{ textAlign: 'right' }}>{fmtTHB(p.cost)}</td>
                  <td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{fmtTHB(p.price)}</td>
                  <td>{statusChip(p)}</td>
                  <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'inline-flex', gap: 4 }}>
                      <button className="btn btn-sm btn-icon btn-ghost" title="ดูรายละเอียด" onClick={() => setDetailId(p.id)}><Icons.arrowRight /></button>
                      <button className="btn btn-sm btn-icon btn-ghost" title="ลบ" onClick={() => onDelete(p)}><Icons.trash /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && pageItems.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40 }} className="muted">
                  {tab === 'draft' ? 'ยังไม่มีแบบร่าง' : 'ยังไม่มีสินค้า — กด "เพิ่มสินค้า" เพื่อเริ่ม'}
                </td></tr>
              )}
              {loading && (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40 }} className="muted">กำลังโหลด...</td></tr>
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

function ProductDetail({ id, onBack, onDeleted, onEdit, showToast }: DetailProps) {
  const [product, setProduct] = useState<Product | null>(null);
  const [serials, setSerials] = useState<Serial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [serialInput, setSerialInput] = useState('');
  const [busy, setBusy] = useState(false);

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

  const addOne = async () => {
    const v = serialInput.trim();
    if (!v) return;
    setBusy(true);
    try {
      await addSerials(id, [v]);
      setSerialInput('');
      showToast('เพิ่มเครื่องแล้ว');
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'เพิ่มไม่สำเร็จ');
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
    if (!window.confirm(`ลบ "${product.name}" และ Serial ทั้งหมด?`)) return;
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
  const serialStatusChip = (s: SerialStatusLabel) => {
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
          <div className="muted page-subtitle">{product.sku || 'ยังไม่มี SKU'} · {product.category_name || 'ไม่ระบุหมวด'}{product.status === 'draft' ? ' · แบบร่าง' : ''}</div>
        </div>
        <div className="page-head-actions">
          <button className="btn" onClick={onEdit}><Icons.edit /> แก้ไข</button>
          <button className="btn" onClick={onDeleteProduct}><Icons.trash /> ลบสินค้า</button>
        </div>
      </div>

      <div className="grid grid-12">
        <div className="col-4">
          <div className="card card-pad">
            <div style={{ aspectRatio: '4/3', borderRadius: 'var(--r-md)', overflow: 'hidden', background: 'var(--surface-sunk)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              {product.image_url
                ? <img src={product.image_url} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span className="muted">ไม่มีรูป</span>}
            </div>
            <div className="summary-box">
              <div className="summary-row"><span className="muted">ยี่ห้อ</span><span>{product.brand || '—'}</span></div>
              <div className="summary-row"><span className="muted">รุ่น</span><span>{product.model || '—'}</span></div>
              <div className="summary-row"><span className="muted">ราคาทุน</span><span className="num">{fmtTHB(product.cost)}</span></div>
              <div className="summary-row"><span className="muted">ราคาขาย</span><span className="num" style={{ fontWeight: 600 }}>{fmtTHB(product.price)}</span></div>
              <div className="summary-row"><span className="muted">รับประกัน</span><span>{product.warranty_months ? `${product.warranty_months} เดือน` : 'ไม่มี'}</span></div>
              <div className="summary-row"><span className="muted">จุดสั่งซื้อ</span><span className="num">{product.low}</span></div>
            </div>
            {product.notes && <div className="hint-box" style={{ marginTop: 12 }}><Icons.warning style={{ width: 14, height: 14, color: 'var(--accent)', marginTop: 1 }} /><span>{product.notes}</span></div>}
          </div>
        </div>

        <div className="col-8">
          <div className="card card-pad">
            <div className="section-h">
              <div><h3>เครื่องในสต๊อก ({inStock})</h3><div className="muted section-sub">แต่ละ serial = 1 เครื่อง · รวมทั้งหมด {serials.length} รายการ</div></div>
            </div>
            <div className="field" style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="input mono" placeholder="เพิ่ม Serial Number ของเครื่องใหม่..." value={serialInput} disabled={busy}
                  onChange={(e) => setSerialInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOne(); } }} />
                <button type="button" className="btn btn-primary" onClick={addOne} disabled={busy}><Icons.plus /> เพิ่มเครื่อง</button>
              </div>
            </div>
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Serial Number</th><th>สถานะ</th><th>เพิ่มเมื่อ</th><th style={{ width: 50 }} /></tr></thead>
                <tbody>
                  {serials.map((s) => (
                    <tr key={s.id}>
                      <td className="mono" style={{ fontSize: 12.5 }}>{s.serial}</td>
                      <td>{serialStatusChip(s.status)}</td>
                      <td><span className="muted" style={{ fontSize: 12.5 }}>{new Date(s.created_at).toLocaleDateString('th-TH')}</span></td>
                      <td style={{ textAlign: 'right' }}>
                        {s.status === 'in_stock'
                          ? <button className="btn btn-sm btn-icon btn-ghost" title="ลบเครื่องนี้" onClick={() => removeSerial(s)}><Icons.trash /></button>
                          : null}
                      </td>
                    </tr>
                  ))}
                  {serials.length === 0 && (
                    <tr><td colSpan={4} style={{ textAlign: 'center', padding: 30 }} className="muted">ยังไม่มีเครื่องในสต๊อก — เพิ่ม Serial ด้านบน</td></tr>
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

type SerialStatusLabel = Serial['status'];
