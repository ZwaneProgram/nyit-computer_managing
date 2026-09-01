// Full-screen image viewer: click a thumbnail anywhere, see it big.
//
// Portals to <body> like CameraCapture does, so the fixed overlay covers the
// viewport regardless of any transformed/backdrop-filtered ancestor (the
// barcode-scanner lesson). Closes on Esc, on the backdrop, or on the X;
// ← / → step through the gallery it was opened from.
import { useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Icons } from './Icons';

export function ImageLightbox({ images, index, onIndexChange, onClose }: {
  images: string[];
  index: number;
  onIndexChange: (next: number) => void;
  onClose: () => void;
}) {
  const count = images.length;
  const step = useCallback(
    (dir: -1 | 1) => onIndexChange((index + dir + count) % count),
    [index, count, onIndexChange],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (count < 2) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    };
    window.addEventListener('keydown', onKey);
    // Lock background scroll while the viewer is open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [step, onClose, count]);

  const url = images[index];
  if (!url) return null;

  return createPortal(
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="ดูรูปขนาดใหญ่"
      onClick={onClose}
    >
      <div className="lightbox-top" onClick={(e) => e.stopPropagation()}>
        {count > 1 && <span className="lightbox-count">{index + 1} / {count}</span>}
        <button type="button" className="lightbox-close" title="ปิด (Esc)" aria-label="ปิด" onClick={onClose}>
          <Icons.x />
        </button>
      </div>

      {count > 1 && (
        <button
          type="button"
          className="lightbox-nav prev"
          title="รูปก่อนหน้า"
          aria-label="รูปก่อนหน้า"
          onClick={(e) => { e.stopPropagation(); step(-1); }}
        >
          <Icons.arrowLeft />
        </button>
      )}

      {/* Clicks on the image itself must not close — only the backdrop does. */}
      <img className="lightbox-img" src={url} alt="" onClick={(e) => e.stopPropagation()} />

      {count > 1 && (
        <button
          type="button"
          className="lightbox-nav next"
          title="รูปถัดไป"
          aria-label="รูปถัดไป"
          onClick={(e) => { e.stopPropagation(); step(1); }}
        >
          <Icons.arrowRight />
        </button>
      )}
    </div>,
    document.body,
  );
}
