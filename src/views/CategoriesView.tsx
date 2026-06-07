import { useCallback, useEffect, useState } from 'react';
import { Icons } from '../components/Icons';
import {
  createCategory,
  deleteCategory,
  fetchCategories,
  updateCategory,
  type Category,
} from '../data/inventory';
import { ApiError } from '../lib/api';

interface ViewProps {
  showToast: (msg: string) => void;
}

export function CategoriesView({ showToast }: ViewProps) {
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCats(await fetchCategories());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'โหลดหมวดหมู่ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const fail = (err: unknown, fallback: string) =>
    showToast(err instanceof ApiError ? err.message : fallback);

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await createCategory(name);
      setNewName('');
      showToast('เพิ่มหมวดหมู่แล้ว');
      load();
    } catch (err) {
      fail(err, 'เพิ่มไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async (c: Category) => {
    const name = editName.trim();
    if (!name) return;
    try {
      await updateCategory(c.id, name);
      setEditingId(null);
      showToast('บันทึกแล้ว');
      load();
    } catch (err) {
      fail(err, 'บันทึกไม่สำเร็จ');
    }
  };

  const remove = async (c: Category) => {
    const n = c.product_count ?? 0;
    const warn = n > 0 ? ` สินค้า ${n} รายการในหมวดนี้จะกลายเป็น "ไม่ระบุหมวด"` : '';
    if (!window.confirm(`ลบหมวด "${c.name}"?${warn}`)) return;
    try {
      await deleteCategory(c.id);
      showToast('ลบหมวดหมู่แล้ว');
      load();
    } catch (err) {
      fail(err, 'ลบไม่สำเร็จ');
    }
  };

  return (
    <div className="grid" style={{ gap: 'var(--gap)' }}>
      <div className="page-head">
        <div>
          <div className="page-title">จัดการหมวดหมู่</div>
          <div className="muted page-subtitle">เพิ่ม แก้ไข หรือลบหมวดหมู่สินค้า</div>
        </div>
      </div>

      <div className="card card-pad" style={{ maxWidth: 640 }}>
        <div className="section-h"><div><h3>เพิ่มหมวดหมู่ใหม่</h3></div></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="input"
            placeholder="ชื่อหมวดหมู่ เช่น เคส, โน้ตบุ๊ค, ชุดระบายความร้อน"
            value={newName}
            disabled={busy}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          />
          <button className="btn btn-primary" onClick={add} disabled={busy || !newName.trim()}><Icons.plus /> เพิ่ม</button>
        </div>
      </div>

      <div className="card card-pad" style={{ maxWidth: 640 }}>
        <div className="section-h"><div><h3>หมวดหมู่ทั้งหมด</h3><div className="muted section-sub">{cats.length} หมวด</div></div></div>
        <div className="table-wrap">
          <table className="tbl tbl-cards">
            <thead>
              <tr><th>ชื่อหมวดหมู่</th><th style={{ textAlign: 'right' }}>จำนวนสินค้า</th><th style={{ width: 90 }} /></tr>
            </thead>
            <tbody>
              {cats.map((c) => (
                <tr key={c.id}>
                  <td className="cell-primary">
                    {editingId === c.id ? (
                      <input
                        className="input"
                        value={editName}
                        autoFocus
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); saveEdit(c); }
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                      />
                    ) : (
                      <span style={{ fontWeight: 500 }}>{c.name}</span>
                    )}
                  </td>
                  <td className="num muted" data-label="จำนวนสินค้า" style={{ textAlign: 'right' }}>{c.product_count ?? 0}</td>
                  <td className="cell-actions">
                    <div style={{ display: 'inline-flex', gap: 4 }}>
                      {editingId === c.id ? (
                        <>
                          <button className="btn btn-sm btn-icon btn-ghost" title="บันทึก" onClick={() => saveEdit(c)}><Icons.check /></button>
                          <button className="btn btn-sm btn-icon btn-ghost" title="ยกเลิก" onClick={() => setEditingId(null)}><Icons.x /></button>
                        </>
                      ) : (
                        <>
                          <button className="btn btn-sm btn-icon btn-ghost" title="แก้ไข" onClick={() => { setEditingId(c.id); setEditName(c.name); }}><Icons.edit /></button>
                          <button className="btn btn-sm btn-icon btn-ghost" title="ลบ" onClick={() => remove(c)}><Icons.trash /></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && cats.length === 0 && (
                <tr><td colSpan={3} style={{ textAlign: 'center', padding: 30 }} className="muted">ยังไม่มีหมวดหมู่</td></tr>
              )}
              {loading && <tr><td colSpan={3} style={{ textAlign: 'center', padding: 30 }} className="muted">กำลังโหลด...</td></tr>}
            </tbody>
          </table>
        </div>
        {error && <div className="muted" style={{ paddingTop: 12, color: 'var(--neg)' }}>{error}</div>}
      </div>
    </div>
  );
}
