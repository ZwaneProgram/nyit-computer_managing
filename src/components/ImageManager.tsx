// Reusable multi-image manager: add (file or camera), reorder, choose the cover.
// Used for product units (per unit) and bundles. The `cover` is the chosen
// thumbnail and is always one of `images` (or null when empty) — it maps to the
// existing `image_url` column so every existing thumbnail keeps working.
import { useRef, useState } from 'react';
import { Icons } from './Icons';
import { CameraCapture } from './CameraCapture';
import { ImageLightbox } from './ImageLightbox';
import { uploadImage } from '../data/inventory';
import { listProductAiImages, deleteAiImage, type AiImage } from '../data/aiPost';

export interface Gallery {
  images: string[];
  cover: string | null;
}

export function ImageManager({ value, onChange, onError, max = 8, productId }: {
  value: Gallery;
  onChange: (next: Gallery) => void;
  onError: (msg: string) => void;
  max?: number;
  productId?: number;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const { images, cover } = value;
  const full = images.length >= max;

  const [pickerOpen, setPickerOpen] = useState(false);
  const [aiImages, setAiImages] = useState<AiImage[]>([]);
  const [loadingAi, setLoadingAi] = useState(false);

  // Full-screen viewer. Only the source list + position are kept so a delete or
  // reorder underneath keeps the viewer in sync instead of showing a stale URL.
  const [zoom, setZoom] = useState<{ src: 'gallery' | 'ai'; index: number } | null>(null);
  const zoomImages = zoom ? (zoom.src === 'gallery' ? images : aiImages.map((a) => a.url)) : [];

  const openPicker = async () => {
    if (!productId) return;
    setPickerOpen(true);
    setLoadingAi(true);
    try {
      setAiImages(await listProductAiImages(productId));
    } catch (err) {
      onError(err instanceof Error ? err.message : 'โหลดรูป AI ไม่สำเร็จ');
    } finally {
      setLoadingAi(false);
    }
  };

  const addFromLibrary = (url: string) => {
    if (images.includes(url)) { onError('รูปนี้ถูกเลือกไว้แล้ว'); return; }
    if (images.length >= max) { onError(`ใส่รูปได้สูงสุด ${max} รูป`); return; }
    const next = [...images, url];
    onChange({ images: next, cover: cover ?? next[0] });
  };

  const removeFromLibrary = async (img: AiImage) => {
    try {
      await deleteAiImage(img.id);
      setAiImages((list) => list.filter((x) => x.id !== img.id));
      if (images.includes(img.url)) remove(img.url); // don't leave a dead URL in the gallery
    } catch (err) {
      onError(err instanceof Error ? err.message : 'ลบรูปไม่สำเร็จ');
    }
  };

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
                <button
                  type="button"
                  className="imgman-zoom"
                  title="ดูรูปขนาดใหญ่"
                  aria-label="ดูรูปขนาดใหญ่"
                  onClick={() => setZoom({ src: 'gallery', index: i })}
                />
                {cover === url && <span className="imgman-badge"><Icons.star /> ปก</span>}
                <button type="button" className="imgman-del" title="ลบรูป" aria-label="ลบรูป" onClick={() => remove(url)}><Icons.trash /></button>
                <div className="imgman-bar">
                  <button type="button" title="เลื่อนซ้าย" aria-label="เลื่อนซ้าย" disabled={i === 0} onClick={() => move(i, -1)}><Icons.arrowLeft /></button>
                  <button type="button" className={'imgman-cover' + (cover === url ? ' on' : '')} title="ตั้งเป็นรูปปก" disabled={cover === url} onClick={() => onChange({ images, cover: url })}><Icons.star /> ปก</button>
                  <button type="button" title="เลื่อนขวา" aria-label="เลื่อนขวา" disabled={i === images.length - 1} onClick={() => move(i, 1)}><Icons.arrowRight /></button>
                </div>
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
        {productId != null && (
          <button type="button" className="btn btn-sm imgman-ai-btn" disabled={full} onClick={openPicker}>
            ✨ เลือกจากรูป AI
          </button>
        )}
        <span className="imgman-count">{images.length}/{max}</span>
      </div>
      {pickerOpen && (
        <div className="imgman-picker">
          <div className="imgman-picker-head">
            <span className="imgman-picker-title">🎨 รูปที่ AI สร้างไว้</span>
            {!loadingAi && aiImages.length > 0 && <span className="imgman-picker-count">{aiImages.length} รูป</span>}
            <button type="button" className="imgman-picker-close" title="ปิด" aria-label="ปิด" onClick={() => setPickerOpen(false)}><Icons.x /></button>
          </div>
          <div className="imgman-picker-body">
            {loadingAi ? (
              <div className="imgman-picker-empty">กำลังโหลด…</div>
            ) : aiImages.length === 0 ? (
              <div className="imgman-picker-empty">
                ยังไม่มีรูปที่ AI สร้างสำหรับสินค้านี้
                <span className="muted">สร้างรูปได้ที่หน้า “สร้างโพสต์ AI”</span>
              </div>
            ) : (
              <div className="imgman-grid">
                {aiImages.map((img, ai) => {
                  const added = images.includes(img.url);
                  return (
                    <div key={img.id} className={'imgman-item' + (added ? ' is-added' : '')}>
                      <div className="imgman-thumb">
                        <img src={img.url} alt="" />
                        <button
                          type="button"
                          className="imgman-zoom"
                          title="ดูรูปขนาดใหญ่"
                          aria-label="ดูรูปขนาดใหญ่"
                          onClick={() => setZoom({ src: 'ai', index: ai })}
                        />
                        {added &&<span className="imgman-badge imgman-badge-ok"><Icons.check /> เพิ่มแล้ว</span>}
                        <button type="button" className="imgman-del" title="ลบออกจากคลัง" aria-label="ลบออกจากคลัง" onClick={() => removeFromLibrary(img)}><Icons.trash /></button>
                        <div className="imgman-bar">
                          <button type="button" className="imgman-use" disabled={added || full} onClick={() => addFromLibrary(img.url)}>
                            <Icons.check /> {added ? 'เพิ่มแล้ว' : 'ใช้รูปนี้'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
      {zoom && zoomImages.length > 0 && (
        <ImageLightbox
          images={zoomImages}
          index={Math.min(zoom.index, zoomImages.length - 1)}
          onIndexChange={(index) => setZoom({ ...zoom, index })}
          onClose={() => setZoom(null)}
        />
      )}
    </div>
  );
}
