// Reusable multi-image manager: add (file or camera), reorder, choose the cover.
// Used for product units (per unit) and bundles. The `cover` is the chosen
// thumbnail and is always one of `images` (or null when empty) — it maps to the
// existing `image_url` column so every existing thumbnail keeps working.
import { useRef } from 'react';
import { Icons } from './Icons';
import { CameraCapture } from './CameraCapture';
import { uploadImage } from '../data/inventory';

export interface Gallery {
  images: string[];
  cover: string | null;
}

export function ImageManager({ value, onChange, onError, max = 8 }: {
  value: Gallery;
  onChange: (next: Gallery) => void;
  onError: (msg: string) => void;
  max?: number;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const { images, cover } = value;
  const full = images.length >= max;

  const addFiles = async (files: File[]) => {
    const room = max - images.length;
    if (room <= 0) { onError(`ใส่รูปได้สูงสุด ${max} รูป`); return; }
    const urls: string[] = [];
    for (const f of files.slice(0, room)) {
      try { urls.push(await uploadImage(f)); }
      catch (err) { onError(err instanceof Error ? err.message : 'อัปโหลดรูปไม่สำเร็จ'); }
    }
    if (!urls.length) return;
    const next = [...images, ...urls];
    onChange({ images: next, cover: cover ?? next[0] });
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= images.length) return;
    const next = images.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange({ images: next, cover });
  };

  const remove = (url: string) => {
    const next = images.filter((u) => u !== url);
    onChange({ images: next, cover: cover === url ? (next[0] ?? null) : cover });
  };

  return (
    <div className="imgman">
      {images.length > 0 && (
        <div className="imgman-grid">
          {images.map((url, i) => (
            <div key={url} className={'imgman-item' + (cover === url ? ' is-cover' : '')}>
              <div className="imgman-thumb">
                <img src={url} alt="" />
                {cover === url && <span className="imgman-badge"><Icons.star /> ปก</span>}
              </div>
              <div className="imgman-row">
                <button type="button" title="เลื่อนซ้าย" disabled={i === 0} onClick={() => move(i, -1)}><Icons.arrowLeft /></button>
                <button type="button" title="เลื่อนขวา" disabled={i === images.length - 1} onClick={() => move(i, 1)}><Icons.arrowRight /></button>
                <button type="button" title="ตั้งเป็นรูปปก" className={cover === url ? 'on' : ''} onClick={() => onChange({ images, cover: url })}><Icons.star /></button>
                <button type="button" title="ลบรูป" className="danger" onClick={() => remove(url)}><Icons.trash /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="imgman-add">
        <button type="button" className="btn btn-sm" disabled={full} onClick={() => fileRef.current?.click()}>
          <Icons.upload style={{ width: 14, height: 14 }} /> เลือกรูป
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }}
        />
        <CameraCapture onCapture={(f) => addFiles([f])} onError={onError} disabled={full} />
        <span className="muted" style={{ fontSize: 11 }}>{images.length}/{max}</span>
      </div>
    </div>
  );
}
