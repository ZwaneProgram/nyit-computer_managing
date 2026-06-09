import { useEffect, useState, type FormEvent } from 'react';
import { Icons } from '../components/Icons';
import { fmtTHB } from '../data/format';
import {
  createProduct,
  fetchCategories,
  fetchProduct,
  updateProduct,
  uploadImage,
  type Category,
  type ProductInput,
  type ProductStatus,
} from '../data/inventory';
import { fetchSettings } from '../data/settings';
import { ApiError } from '../lib/api';
import type { ViewId } from '../types';

interface ViewProps {
  onNav: (id: ViewId) => void;
  showToast: (msg: string) => void;
  /** When set, the form edits this product instead of creating a new one. */
  editId?: number | null;
}

const WARRANTY_PRESETS = [
  { v: '0', label: 'ไม่มี' },
  { v: '3', label: '3 เดือน' },
  { v: '6', label: '6 เดือน' },
  { v: '12', label: '12 เดือน (1 ปี)' },
  { v: '24', label: '24 เดือน (2 ปี)' },
  { v: '36', label: '36 เดือน (3 ปี)' },
  { v: '60', label: '60 เดือน (5 ปี)' },
];
const isPresetWarranty = (m: string) => WARRANTY_PRESETS.some((p) => p.v === m);

/** One physical unit being entered. */
interface UnitDraft {
  serial: string;
  sku: string;
  cost: string;
  price: string;
  warranty: string;
  warrantyCustom: boolean;
  note: string;
  image_url: string | null;
}
const emptyUnit = (from?: UnitDraft): UnitDraft => ({
  serial: '',
  sku: '',
  cost: from?.cost ?? '',
  price: from?.price ?? '',
  warranty: from?.warranty ?? '36',
  warrantyCustom: from?.warrantyCustom ?? false,
  note: '',
  image_url: null,
});

export function AddProductView({ onNav, showToast, editId }: ViewProps) {
  const isEdit = editId != null;
  const [cats, setCats] = useState<Category[]>([]);
  const [form, setForm] = useState({
    category_id: '' as number | '',
    name: '', brand: '', model: '', low: '5', notes: '',
  });
  const [units, setUnits] = useState<UnitDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCategories()
      .then((c) => {
        setCats(c);
        if (!isEdit) setForm((f) => (f.category_id === '' && c[0] ? { ...f, category_id: c[0].id } : f));
      })
      .catch(() => setError('โหลดหมวดหมู่ไม่สำเร็จ'));
  }, [isEdit]);

  // Create mode: seed the reorder point from the shop's default threshold.
  useEffect(() => {
    if (isEdit) return;
    fetchSettings()
      .then((s) => setForm((f) => ({ ...f, low: String(s.default_low) })))
      .catch(() => { /* keep the hard default */ });
  }, [isEdit]);

  // Edit mode: load the catalog and prefill the form (units managed on detail page).
  useEffect(() => {
    if (editId == null) return;
    fetchProduct(editId)
      .then(({ product }) => {
        setForm({
          category_id: product.category_id ?? '',
          name: product.name,
          brand: product.brand ?? '',
          model: product.model ?? '',
          low: String(product.low),
          notes: product.notes ?? '',
        });
      })
      .catch(() => setError('โหลดข้อมูลสินค้าไม่สำเร็จ'));
  }, [editId]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const setUnit = (i: number, patch: Partial<UnitDraft>) =>
    setUnits((arr) => arr.map((u, idx) => (idx === i ? { ...u, ...patch } : u)));
  const addUnitRow = () => setUnits((arr) => [...arr, emptyUnit(arr[arr.length - 1])]);
  const removeUnitRow = (i: number) => setUnits((arr) => arr.filter((_, idx) => idx !== i));

  const onPickImage = async (i: number, file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      setUnit(i, { image_url: await uploadImage(file) });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'อัปโหลดรูปไม่สำเร็จ');
    }
  };

  const save = async (status: ProductStatus) => {
    setError(null);
    if (!form.name.trim()) return setError('กรุณากรอกชื่อสินค้า');

    const input: ProductInput = {
      category_id: form.category_id === '' ? null : Number(form.category_id),
      name: form.name.trim(),
      brand: form.brand.trim() || null,
      model: form.model.trim() || null,
      low: Number(form.low) || 0,
      notes: form.notes.trim() || null,
      status,
      // Units only on create; edit mode manages them on the detail page.
      ...(isEdit ? {} : {
        units: units
          .filter((u) => u.serial.trim())
          .map((u) => ({
            serial: u.serial.trim(),
            sku: u.sku.trim() || null,
            cost: Number(u.cost) || 0,
            price: Number(u.price) || 0,
            warranty_months: Number(u.warranty) || 0,
            note: u.note.trim() || null,
            image_url: u.image_url,
          })),
      }),
    };
    setBusy(true);
    try {
      if (isEdit && editId != null) {
        await updateProduct(editId, input);
        showToast(status === 'draft' ? 'ย้ายไปแบบร่างแล้ว' : 'บันทึกการแก้ไขแล้ว');
      } else {
        await createProduct(input);
        showToast(status === 'draft' ? 'บันทึกแบบร่างแล้ว' : 'บันทึกสินค้าใหม่เรียบร้อย');
      }
      onNav('inventory');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    save('active');
  };

  return (
    <form onSubmit={onSubmit}>
      <div className="page-head" style={{ marginBottom: 22 }}>
        <div>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => onNav('inventory')} style={{ marginBottom: 8 }}>← กลับไปคลังสินค้า</button>
          <div className="page-title">{isEdit ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}</div>
          <div className="muted page-subtitle">{isEdit ? 'แก้ไขข้อมูลแคตตาล็อก (จัดการแต่ละเครื่องได้ในหน้ารายละเอียดสินค้า)' : 'กรอกข้อมูลแคตตาล็อก แล้วเพิ่มเครื่องแต่ละชิ้นพร้อมราคา/รับประกัน/รูปของชิ้นนั้น'}</div>
        </div>
        <div className="page-head-actions">
          <button type="button" className="btn" disabled={busy} onClick={() => save('draft')}>บันทึกแบบร่าง</button>
          <button type="submit" className="btn btn-primary" disabled={busy}><Icons.check /> {busy ? 'กำลังบันทึก...' : isEdit ? 'บันทึกการแก้ไข' : 'บันทึกสินค้า'}</button>
        </div>
      </div>

      {error && (
        <div className="auth-error" role="alert" style={{ marginBottom: 16 }}>
          <Icons.warning style={{ width: 15, height: 15, flexShrink: 0 }} /><span>{error}</span>
        </div>
      )}

      <div className="grid" style={{ gap: 'var(--gap)' }}>
        {/* ----- Catalog: basic info ----- */}
        <div className="card card-pad">
          <div className="section-h"><div><h3>ข้อมูลพื้นฐาน</h3><div className="muted section-sub">ชื่อสินค้าและการจัดหมวด (ใช้ร่วมกันทุกเครื่อง)</div></div></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-[14px]">
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="field-label">ชื่อสินค้า *</label>
              <input className="input" placeholder="เช่น ASUS ROG Strix RTX 5090" value={form.name} onChange={(e) => set('name', e.target.value)} />
            </div>
            <div className="field">
              <label className="field-label">หมวดหมู่</label>
              <select className="select" value={form.category_id} onChange={(e) => set('category_id', e.target.value === '' ? '' : Number(e.target.value))}>
                <option value="">— ไม่ระบุ —</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field-label">ยี่ห้อ</label>
              <input className="input" placeholder="เช่น ASUS" value={form.brand} onChange={(e) => set('brand', e.target.value)} />
            </div>
            <div className="field">
              <label className="field-label">รุ่น / โมเดล</label>
              <input className="input" placeholder="เช่น RTX5090-O24G-GAMING" value={form.model} onChange={(e) => set('model', e.target.value)} />
            </div>
          </div>
        </div>

        {/* ----- Catalog: extra info ----- */}
        <div className="card card-pad">
          <div className="section-h"><div><h3>ข้อมูลเพิ่มเติม</h3></div></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-[14px]">
            <div className="field">
              <label className="field-label">จุดสั่งซื้อ (เตือนเมื่อเหลือน้อยกว่า)</label>
              <input className="input num" type="number" placeholder="5" value={form.low} onChange={(e) => set('low', e.target.value)} />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="field-label">โน้ตเพิ่มเติม</label>
              <textarea className="textarea" placeholder="เช่น สั่งจาก SuperComputer KKU" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
            </div>
          </div>
        </div>

        {/* ----- Per-unit editor (create only) ----- */}
        {!isEdit && (
          <div className="card card-pad">
            <div className="section-h">
              <div><h3>เครื่องแต่ละชิ้น</h3><div className="muted section-sub">แต่ละชิ้นมี SKU / Serial / ราคา / รับประกัน / รูป ของตัวเอง · สต๊อก = {units.length} เครื่อง</div></div>
              <div className="spacer" />
              <button type="button" className="btn btn-sm" onClick={addUnitRow}><Icons.plus /> เพิ่มเครื่อง</button>
            </div>

            {units.length === 0 && (
              <div className="muted" style={{ padding: '18px 0', textAlign: 'center' }}>ยังไม่มีเครื่อง — กด "เพิ่มเครื่อง" (บันทึกแบบร่างได้โดยไม่ต้องมีเครื่อง)</div>
            )}

            <div className="grid" style={{ gap: 'var(--gap)' }}>
              {units.map((u, i) => {
                const up = Number(u.price) || 0, uc = Number(u.cost) || 0;
                const profit = u.price && u.cost ? up - uc : 0;
                return (
                  <div key={i} className="card card-pad" style={{ background: 'var(--surface-sunk)' }}>
                    <div className="section-h" style={{ marginBottom: 10 }}>
                      <div style={{ fontWeight: 600 }}>{form.name ? `${form.name} ` : 'เครื่อง '}#{i + 1}</div>
                      <div className="spacer" />
                      <button type="button" className="btn btn-sm btn-icon btn-ghost" title="ลบเครื่องนี้" onClick={() => removeUnitRow(i)}><Icons.trash /></button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[14px]">
                      <div className="field">
                        <label className="field-label">Serial Number *</label>
                        <input className="input mono" placeholder="SN-XXXX" value={u.serial} onChange={(e) => setUnit(i, { serial: e.target.value })} />
                      </div>
                      <div className="field">
                        <label className="field-label">SKU (ไม่บังคับ)</label>
                        <input className="input mono" placeholder="SKU001" value={u.sku} onChange={(e) => setUnit(i, { sku: e.target.value })} />
                      </div>
                      <div className="field">
                        <label className="field-label">รับประกัน</label>
                        <select
                          className="select"
                          value={u.warrantyCustom ? 'custom' : u.warranty}
                          onChange={(e) => {
                            if (e.target.value === 'custom') setUnit(i, { warrantyCustom: true });
                            else setUnit(i, { warrantyCustom: false, warranty: e.target.value });
                          }}
                        >
                          {WARRANTY_PRESETS.map((m) => <option key={m.v} value={m.v}>{m.label}</option>)}
                          <option value="custom">อื่นๆ (กำหนดเอง)</option>
                        </select>
                        {u.warrantyCustom && (
                          <input className="input num" style={{ marginTop: 6 }} type="number" min="0" placeholder="ระบุจำนวนเดือน" value={isPresetWarranty(u.warranty) ? '' : u.warranty} onChange={(e) => setUnit(i, { warranty: e.target.value })} autoFocus />
                        )}
                      </div>
                      <div className="field">
                        <label className="field-label">ราคาทุน (บาท)</label>
                        <div className="input-prefix"><span className="pfx">฿</span>
                          <input className="input num" type="number" placeholder="0" value={u.cost} onChange={(e) => setUnit(i, { cost: e.target.value })} /></div>
                      </div>
                      <div className="field">
                        <label className="field-label">ราคาขาย (บาท)</label>
                        <div className="input-prefix"><span className="pfx">฿</span>
                          <input className="input num" type="number" placeholder="0" value={u.price} onChange={(e) => setUnit(i, { price: e.target.value })} /></div>
                      </div>
                      <div className="field">
                        <label className="field-label">กำไรต่อชิ้น</label>
                        <div className="num" style={{ fontSize: 17, fontWeight: 600, paddingTop: 6, color: profit > 0 ? 'var(--pos)' : 'var(--ink-3)' }}>{fmtTHB(profit)}</div>
                      </div>
                      <div className="field" style={{ gridColumn: '1 / -1' }}>
                        <label className="field-label">โน้ต (เฉพาะเครื่องนี้)</label>
                        <input className="input" placeholder="เช่น กล่องบุบ, ของโชว์" value={u.note} onChange={(e) => setUnit(i, { note: e.target.value })} />
                      </div>
                      <div className="field" style={{ gridColumn: '1 / -1' }}>
                        <label className="field-label">รูปของเครื่องนี้</label>
                        {u.image_url ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <img src={u.image_url} alt="" style={{ width: 72, height: 54, objectFit: 'cover', borderRadius: 'var(--r-md)', background: 'var(--surface)' }} />
                            <button type="button" className="btn btn-sm" onClick={() => setUnit(i, { image_url: null })}><Icons.trash /> ลบรูป</button>
                          </div>
                        ) : (
                          <label className="btn btn-sm" style={{ cursor: 'pointer', width: 'fit-content' }}>
                            <Icons.upload style={{ width: 14, height: 14 }} /> เลือกรูป
                            <input type="file" accept="image/*" hidden onChange={(e) => onPickImage(i, e.target.files?.[0])} />
                          </label>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </form>
  );
}
