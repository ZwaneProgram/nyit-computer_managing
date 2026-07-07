// Take a photo inside the web app.
//
// Two modes, chosen automatically:
//   • Secure context (HTTPS or localhost) → a live in-page camera (getUserMedia):
//     video preview + a capture button, several shots per session.
//   • Otherwise (e.g. the live http://IP site) → the native camera via
//     <input capture>, which hands off to the OS camera app and needs no HTTPS.
//
// getUserMedia is blocked by the browser outside a secure context — no library
// can change that — so the native-camera path is the reliable fallback.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icons } from './Icons';

/** Live camera only works in a secure context with a camera API present. */
export function canLiveCapture(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext === true &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

function cameraError(err: unknown): string {
  const name = (err as { name?: string })?.name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'ไม่ได้รับอนุญาตให้ใช้กล้อง กรุณาอนุญาตในเบราว์เซอร์';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'ไม่พบกล้องบนอุปกรณ์นี้';
  return 'เปิดกล้องไม่สำเร็จ อุปกรณ์หรือเบราว์เซอร์อาจไม่รองรับ';
}

export function CameraCapture({ onCapture, onError, disabled }: {
  onCapture: (file: File) => void;
  onError: (msg: string) => void;
  disabled?: boolean;
}) {
  const [live, setLive] = useState(false);

  // Native camera (works over plain http on phones).
  if (!canLiveCapture()) {
    return (
      <label className={'btn btn-sm' + (disabled ? ' is-disabled' : '')} style={{ cursor: disabled ? 'default' : 'pointer' }}>
        <Icons.camera style={{ width: 14, height: 14 }} /> ถ่ายรูป
        <input
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          disabled={disabled}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onCapture(f);
            e.target.value = '';
          }}
        />
      </label>
    );
  }

  return (
    <>
      <button type="button" className="btn btn-sm" disabled={disabled} onClick={() => setLive(true)}>
        <Icons.camera style={{ width: 14, height: 14 }} /> ถ่ายรูป
      </button>
      {live && <CameraModal onClose={() => setLive(false)} onCapture={onCapture} onError={onError} />}
    </>
  );
}

function CameraModal({ onClose, onCapture, onError }: {
  onClose: () => void;
  onCapture: (file: File) => void;
  onError: (msg: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setReady(true);
      } catch (err) {
        onError(cameraError(err));
        onClose();
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [onClose, onError]);

  const snap = () => {
    const video = videoRef.current;
    if (!video) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        onCapture(new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' }));
        setCount((c) => c + 1);
      },
      'image/jpeg',
      0.9,
    );
  };

  // Portal to <body> so the fixed overlay covers the viewport regardless of any
  // transformed/backdrop-filtered ancestor (the barcode-scanner lesson).
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      style={{ position: 'fixed', inset: 0, zIndex: 2147483647, display: 'flex', flexDirection: 'column', background: '#000', height: '100dvh', width: '100vw' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 16, color: '#fff', flex: '0 0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500 }}>
          <Icons.camera style={{ width: 18, height: 18 }} /> ถ่ายรูปสินค้า
          {count > 0 && <span style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 999, background: '#16a34a', fontSize: 12 }}>ถ่ายแล้ว {count}</span>}
        </div>
        <button onClick={onClose} aria-label="เสร็จ" style={{ display: 'grid', placeItems: 'center', height: 40, width: 40, borderRadius: 12, border: '1px solid rgba(255,255,255,0.2)', color: '#fff', background: 'transparent' }}>
          <Icons.x style={{ width: 20, height: 20 }} />
        </button>
      </div>

      <div style={{ position: 'relative', flex: '1 1 auto', overflow: 'hidden', background: '#000' }}>
        <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>

      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, flex: '0 0 auto' }}>
        <button
          type="button"
          onClick={snap}
          disabled={!ready}
          aria-label="ถ่ายภาพ"
          style={{ height: 68, width: 68, borderRadius: '50%', border: '4px solid #fff', background: ready ? '#fff' : '#888', cursor: ready ? 'pointer' : 'default' }}
        />
        <div style={{ fontSize: 13, color: '#cbd5e1' }}>{count > 0 ? 'กดปิดเมื่อถ่ายครบ' : 'เล็งกล้องไปที่สินค้าแล้วกดถ่าย'}</div>
      </div>
    </div>,
    document.body,
  );
}
