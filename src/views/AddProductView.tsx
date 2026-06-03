import { useEffect, useRef, useState, type FormEvent } from 'react';
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
import { ApiError } from '../lib/api';
import type { ViewId } from '../types';

interface ViewProps {
  onNav: (id: ViewId) => void;
  showToast: (msg: string) => void;
  /** When set, the form edits this product instead of creating a new one. */
  editId?: number | null;
}

const isPresetWarranty = (m: string) => WARRANTY_PRESETS.some((p) => p.v === m);

const WARRANTY_PRESETS = [
  { v: '0', label: 'ไม่มี' },
  { v: '3', label: '3 เดือน' },
  { v: '6', label: '6 เดือน' },
  { v: '12', label: '12 เดือน (1 ปี)' },
  { v: '24', label: '24 เดือน (2 ปี)' },
  { v: '36', label: '36 เดือน (3 ปี)' },
  { v: '60', label: '60 เดือน (5 ปี)' },
];

export function AddProductView({ onNav, showToast, editId }: ViewProps) {
  const isEdit = editId != null;
  const [cats, setCats] = useState<Category[]>([]);
  const [form, setForm] = useState({
    category_id: '' as number | '',
    name: '', sku: '', brand: '', model: '',
    cost: '', price: '', low: '5', warranty: '36', notes: '',
  });
  const [warrantyCustom, setWarrantyCustom] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [serials, setSerials] = useState<string[]>([]);
  const [serialInput, setSerialInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchCategories()
      .then((c) => {
        setCats(c);
        // Only auto-pick the first category when creating (edit fills its own).
        if (!isEdit) setForm((f) => (f.category_id === '' && c[0] ? { ...f, category_id: c[0].id } : f));
      })
      .catch(() => setError('โหลดหมวดหมู่ไม่สำเร็จ'));
  }, [isEdit]);

  // Edit mode: load the product and prefill the form.
  useEffect(() => {
    if (editId == null) return;
    fetchProduct(editId)
      .then(({ product }) => {
        setForm({
          category_id: product.category_id ?? '',
          name: product.name,
          sku: product.sku ?? '',
          brand: product.brand ?? '',
          model: product.model ?? '',
          cost: product.cost ? String(product.cost) : '',
          price: product.price ? String(product.price) : '',
          low: String(product.low),
          warranty: String(product.warranty_months),
          notes: product.notes ?? '',
        });
        setImageUrl(product.image_url);
        setWarrantyCustom(!isPresetWarranty(String(product.warranty_months)));
      })
      .catch(() => setError('โหลดข้อมูลสินค้าไม่สำเร็จ'));
  }, [editId]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const cost = Number(form.cost);
  const price = Number(form.price);
  const profit = form.cost && form.price ? price - cost : 0;
  const margin = form.cost && form.price && price ? ((price - cost) / price) * 100 : 0;

  const addSerial = () => {
    const v = serialInput.trim();
    if (!v) return;
    if (serials.some((s) => s.toLowerCase() === v.toLowerCase())) {
      setSerialInput('');
      return;
    }
    setSerials((s) => [...s, v]);
    setSerialInput('');
  };

  const onPickImage = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      setImageUrl(await uploadImage(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'อัปโหลดรูปไม่สำเร็จ');
    } finally {
      setUploading(false);
    }
  };

  const save = async (status: ProductStatus) => {
    setError(null);
    if (!form.name.trim()) return setError('กรุณากรอกชื่อสินค้า');
    if (status === 'active' && !form.sku.trim()) {
      return setError('สินค้าที่บันทึกต้องมี SKU (หรือกด "บันทึกแบบร่าง")');
    }
    const input: ProductInput = {
      category_id: form.category_id === '' ? null : Number(form.category_id),
      name: form.name.trim(),
      sku: form.sku.trim() || null,
      brand: form.brand.trim() || null,
      model: form.model.trim() || null,
      cost: Number(form.cost) || 0,
      price: Number(form.price) || 0,
      low: Number(form.low) || 0,
      warranty_months: Number(form.warranty) || 0,
      image_url: imageUrl,
      notes: form.notes.trim() || null,
      status,
      serials,
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
          <div className="muted page-subtitle">{isEdit ? 'แก้ไขข้อมูลสินค้า (จัดการ Serial ได้ในหน้ารายละเอียดสินค้า)' : 'กรอกข้อมูลสินค้า เพิ่ม Serial Number ของแต่ละเครื่อง และตั้งราคาขาย'}</div>
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

      <div className="grid grid-12">
        <div className="col-8 grid" style={{ gap: 'var(--gap)' }}>
          <div className="card card-pad">
            <div className="section-h"><div><h3>ข้อมูลพื้นฐาน</h3><div className="muted section-sub">ชื่อสินค้าและการจัดหมวด</div></div></div>
            <div className="form-grid-2">
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label className="field-label">ชื่อสินค้า *</label>
                <input className="input" placeholder="เช่น ASUS ROG Strix RTX 5070" value={form.name} onChange={(e) => set('name', e.target.value)} />
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
                <input className="input" placeholder="เช่น RTX5070-O12G-GAMING" value={form.model} onChange={(e) => set('model', e.target.value)} />
              </div>
              <div className="field">
                <label className="field-label">SKU *</label>
                <div className="input-prefix">
                  <span className="pfx mono" style={{ fontSize: 12 }}>SKU</span>
                  <input className="input mono" placeholder="GPU-RTX5070-ROG" value={form.sku} onChange={(e) => set('sku', e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          <div className="card card-pad">
            <div className="section-h"><div><h3>ราคาและกำไร</h3><div className="muted section-sub">ระบบจะคำนวณกำไรอัตโนมัติ</div></div></div>
            <div className="form-grid-3">
              <div className="field">
                <label className="field-label">ราคาทุน (บาท)</label>
                <div className="input-prefix"><span className="pfx">฿</span>
                  <input className="input num" type="number" placeholder="0" value={form.cost} onChange={(e) => set('cost', e.target.value)} /></div>
              </div>
              <div className="field">
                <label className="field-label">ราคาขาย (บาท)</label>
                <div className="input-prefix"><span className="pfx">฿</span>
                  <input className="input num" type="number" placeholder="0" value={form.price} onChange={(e) => set('price', e.target.value)} /></div>
              </div>
              <div className="field">
                <label className="field-label">รับประกัน</label>
                <select
                  className="select"
                  value={warrantyCustom ? 'custom' : form.warranty}
                  onChange={(e) => {
                    if (e.target.value === 'custom') { setWarrantyCustom(true); }
                    else { setWarrantyCustom(false); set('warranty', e.target.value); }
                  }}
                >
                  {WARRANTY_PRESETS.map((m) => <option key={m.v} value={m.v}>{m.label}</option>)}
                  <option value="custom">อื่นๆ (กำหนดเอง)</option>
                </select>
                {warrantyCustom && (
                  <input className="input num" style={{ marginTop: 6 }} type="number" min="0" placeholder="ระบุจำนวนเดือน" value={form.warranty} onChange={(e) => set('warranty', e.target.value)} autoFocus />
                )}
              </div>
            </div>
            <div className="profit-strip">
              <div><div className="muted" style={{ fontSize: 11.5 }}>กำไรต่อชิ้น</div>
                <div className="num" style={{ fontSize: 18, fontWeight: 600, marginTop: 2, color: profit > 0 ? 'var(--pos)' : 'var(--ink-3)' }}>{fmtTHB(profit)}</div></div>
              <div className="profit-divider" />
              <div><div className="muted" style={{ fontSize: 11.5 }}>อัตรากำไร</div>
                <div className="num" style={{ fontSize: 18, fontWeight: 600, marginTop: 2, color: profit > 0 ? 'var(--pos)' : 'var(--ink-3)' }}>{margin.toFixed(1)}%</div></div>
            </div>
          </div>

          {!isEdit && (
          <div className="card card-pad">
            <div className="section-h"><div><h3>Serial Number ของแต่ละเครื่อง</h3><div className="muted section-sub">สต๊อก = จำนวน serial ที่เพิ่ม ({serials.length} เครื่อง)</div></div></div>
            <div className="field">
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="input mono"
                  placeholder="พิมพ์ Serial Number แล้วกด Enter หรือ เพิ่ม"
                  value={serialInput}
                  onChange={(e) => setSerialInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSerial(); } }}
                />
                <button type="button" className="btn" onClick={addSerial}><Icons.plus /> เพิ่ม</button>
              </div>
              <div className="field-hint">เพิ่มทีละเครื่อง — แต่ละ serial = 1 เครื่องในสต๊อก</div>
            </div>
            {serials.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {serials.map((s) => (
                  <span key={s} className="chip mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {s}
                    <button type="button" className="chip-x" onClick={() => setSerials((arr) => arr.filter((x) => x !== s))} aria-label="ลบ">
                      <Icons.x style={{ width: 11, height: 11 }} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
          )}

          <div className="card card-pad">
            <div className="section-h"><div><h3>ข้อมูลเพิ่มเติม</h3></div></div>
            <div className="form-grid-2">
              <div className="field">
                <label className="field-label">จุดสั่งซื้อ (เตือนเมื่อเหลือน้อยกว่า)</label>
                <input className="input num" type="number" placeholder="5" value={form.low} onChange={(e) => set('low', e.target.value)} />
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label className="field-label">โน้ตเพิ่มเติม</label>
                <textarea className="textarea" placeholder="เช่น สั่งจาก SuperComputer KKU, ใบกำกับเลขที่ INV-2410-0098" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        <div className="col-4 grid" style={{ gap: 'var(--gap)' }}>
          <div className="card card-pad">
            <div className="section-h"><div><h3>รูปสินค้า</h3><div className="muted section-sub">PNG / JPG / WEBP ไม่เกิน 4MB</div></div></div>
            {imageUrl ? (
              <div style={{ position: 'relative' }}>
                <img src={imageUrl} alt="ตัวอย่างสินค้า" style={{ width: '100%', borderRadius: 'var(--r-md)', display: 'block', aspectRatio: '4/3', objectFit: 'cover', background: 'var(--surface-sunk)' }} />
                <button type="button" className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => { setImageUrl(null); if (fileRef.current) fileRef.current.value = ''; }}>
                  <Icons.trash /> ลบรูป
                </button>
              </div>
            ) : (
              <label className="upload-drop">
                <Icons.upload style={{ width: 24, height: 24 }} />
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-2)' }}>{uploading ? 'กำลังอัปโหลด...' : 'คลิกเพื่อเลือกรูป'}</div>
                <div className="mono" style={{ fontSize: 11 }}>product photo · 4:3</div>
                <input ref={fileRef} type="file" accept="image/*" hidden disabled={uploading} onChange={(e) => onPickImage(e.target.files?.[0])} />
              </label>
            )}
          </div>

          <div className="card card-pad">
            <div className="section-h"><div><h3>ตัวอย่าง</h3></div></div>
            <div className="product-cell" style={{ padding: '10px 0' }}>
              <div className="thumb thumb-lg">
                {imageUrl ? <img src={imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} /> : <span style={{ fontSize: 9 }}>ไม่มีรูป</span>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="product-cell-name" style={{ fontSize: 14 }}>{form.name || 'ชื่อสินค้า'}</div>
                <div className="product-cell-meta">{form.sku || 'SKU-XXX'}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  <span className="chip">{cats.find((c) => c.id === form.category_id)?.name ?? 'ไม่ระบุหมวด'}</span>
                  <span className="chip">{serials.length} เครื่อง</span>
                </div>
              </div>
            </div>
            <div className="divider" />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span className="muted">ราคาขาย</span>
              <span className="num" style={{ fontWeight: 600 }}>{fmtTHB(price || 0)}</span>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
