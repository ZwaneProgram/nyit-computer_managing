import { useMemo, useState, type ReactNode } from 'react';
import { Icons } from '../components/Icons';
import { CATEGORIES, PRODUCTS, categoryName } from '../data/catalog';
import { fmtTHB, fmtN } from '../data/format';
import type { CategoryId, Product, ViewId } from '../types';

interface ViewProps {
  onNav: (id: ViewId) => void;
}

type SortKey = 'name' | 'stock' | 'cost' | 'price';
type StockFilter = 'all' | 'in' | 'low' | 'out';

export function InventoryView({ onNav }: ViewProps) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<CategoryId>('all');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' });
  const [page, setPage] = useState(1);
  const perPage = 10;

  const filtered = useMemo(() => {
    let arr = PRODUCTS.slice();
    if (cat !== 'all') arr = arr.filter((p) => p.cat === cat);
    if (stockFilter === 'low') arr = arr.filter((p) => p.stock <= p.low && p.stock > 0);
    if (stockFilter === 'out') arr = arr.filter((p) => p.stock === 0);
    if (stockFilter === 'in') arr = arr.filter((p) => p.stock > p.low);
    if (q) {
      const s = q.toLowerCase();
      arr = arr.filter(
        (p) =>
          p.name.toLowerCase().includes(s) ||
          p.sku.toLowerCase().includes(s) ||
          p.serial.toLowerCase().includes(s),
      );
    }
    arr.sort((a, b) => {
      const va = a[sort.key];
      const vb = b[sort.key];
      const cmp = typeof va === 'string' ? va.localeCompare(vb as string, 'th') : (va as number) - (vb as number);
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [q, cat, stockFilter, sort]);

  const pageItems = filtered.slice((page - 1) * perPage, page * perPage);
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));

  const setSortKey = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  const SortHd = ({ k, children, right }: { k: SortKey; children: ReactNode; right?: boolean }) => (
    <th style={right ? { textAlign: 'right' } : undefined}>
      <span className="tbl-th-sort" onClick={() => setSortKey(k)}>
        {children}
        {sort.key === k
          ? sort.dir === 'asc'
            ? <Icons.arrowUp style={{ width: 11, height: 11 }} />
            : <Icons.arrowDown style={{ width: 11, height: 11 }} />
          : null}
      </span>
    </th>
  );

  const statusChip = (p: Product) =>
    p.stock === 0
      ? <span className="chip chip-neg chip-dot">หมด</span>
      : p.stock <= p.low
        ? <span className="chip chip-warn chip-dot">เหลือน้อย</span>
        : <span className="chip chip-pos chip-dot">พร้อมขาย</span>;

  const quickFilters: { id: StockFilter; label: string; count: number }[] = [
    { id: 'all', label: 'ทั้งหมด', count: PRODUCTS.length },
    { id: 'in', label: 'มีสต๊อก', count: PRODUCTS.filter((p) => p.stock > p.low).length },
    { id: 'low', label: 'เหลือน้อย', count: PRODUCTS.filter((p) => p.stock <= p.low && p.stock > 0).length },
    { id: 'out', label: 'หมดสต๊อก', count: PRODUCTS.filter((p) => p.stock === 0).length },
  ];

  return (
    <div className="grid" style={{ gap: 'var(--gap)' }}>
      <div className="page-head">
        <div>
          <div className="page-title">คลังสินค้า</div>
          <div className="muted page-subtitle">
            {fmtN(PRODUCTS.length)} รายการ · มูลค่ารวม {fmtTHB(PRODUCTS.reduce((s, p) => s + p.cost * p.stock, 0))}
          </div>
        </div>
        <div className="page-head-actions">
          <button className="btn"><Icons.download /> ส่งออก CSV</button>
          <button className="btn btn-primary" onClick={() => onNav('add-product')}><Icons.plus /> เพิ่มสินค้า</button>
        </div>
      </div>

      <div className="card card-pad" style={{ paddingBottom: 0 }}>
        <div className="filterbar" style={{ marginBottom: 16 }}>
          <div className="search grow">
            <Icons.search />
            <input
              placeholder="ค้นหาชื่อสินค้า, SKU, หรือ Serial Number..."
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
            />
          </div>
          <select
            className="select select-auto"
            value={cat}
            onChange={(e) => { setCat(e.target.value as CategoryId); setPage(1); }}
          >
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button className="btn"><Icons.filter /> ตัวกรอง</button>
        </div>

        <div className="quick-filters">
          {quickFilters.map((f) => (
            <button
              key={f.id}
              className={'quick-chip' + (stockFilter === f.id ? ' chip-accent' : '')}
              onClick={() => { setStockFilter(f.id); setPage(1); }}
            >
              {f.label} <span className="num" style={{ opacity: 0.6 }}>{f.count}</span>
            </button>
          ))}
        </div>

        <div className="table-wrap table-flush">
          <table className="tbl">
            <thead>
              <tr>
                <SortHd k="name">สินค้า</SortHd>
                <th>SKU / Serial</th>
                <th>หมวด</th>
                <SortHd k="stock" right>คงเหลือ</SortHd>
                <SortHd k="cost" right>ราคาทุน</SortHd>
                <SortHd k="price" right>ราคาขาย</SortHd>
                <th>สถานะ</th>
                <th style={{ width: 80 }} />
              </tr>
            </thead>
            <tbody>
              {pageItems.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="product-cell">
                      <div className="thumb">{p.cat.toUpperCase()}</div>
                      <div>
                        <div className="product-cell-name">{p.name}</div>
                        <div className="product-cell-meta">{p.brand} · รับประกัน {p.warranty} เดือน</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="mono" style={{ fontSize: 12 }}>{p.sku}</div>
                    <div className="mono muted" style={{ fontSize: 11, marginTop: 1 }}>{p.serial}</div>
                  </td>
                  <td><span className="muted" style={{ fontSize: 12.5 }}>{categoryName(p.cat)}</span></td>
                  <td className="num" style={{ textAlign: 'right' }}>{p.stock}</td>
                  <td className="num muted" style={{ textAlign: 'right' }}>{fmtTHB(p.cost)}</td>
                  <td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{fmtTHB(p.price)}</td>
                  <td>{statusChip(p)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 4 }}>
                      <button className="btn btn-sm btn-icon btn-ghost" title="แก้ไข"><Icons.edit /></button>
                      <button className="btn btn-sm btn-icon btn-ghost" title="เพิ่มเติม"><Icons.more /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {pageItems.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40 }} className="muted">ไม่พบสินค้าที่ตรงกับเงื่อนไข</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="pagn table-flush">
          <div>แสดง {(page - 1) * perPage + 1}–{Math.min(page * perPage, filtered.length)} จาก {filtered.length} รายการ</div>
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
