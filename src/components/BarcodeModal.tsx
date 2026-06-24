import { useCallback, useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { Icons } from './Icons';

interface BarcodeModalProps {
  /** Value actually encoded into the barcode (e.g. "8-47" = productId-serialId). */
  value: string;
  /** Human-readable text shown under the bars (e.g. the serial). Falls back to value. */
  text?: string;
  /** Heading shown above the barcode (e.g. the product name). */
  heading?: string;
  onClose: () => void;
}

/**
 * Popup that renders a CODE128 barcode for a single value and lets the user
 * print / download it. Used for per-unit product barcodes.
 */
export function BarcodeModal({ value, text, heading, onClose }: BarcodeModalProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !value) return;
    try {
      JsBarcode(svg, value, {
        format: 'CODE128',
        text: text || value,
        width: 2,
        height: 90,
        displayValue: true,
        font: 'monospace',
        fontSize: 15,
        textMargin: 6,
        margin: 12,
        lineColor: '#0d0f15',
        background: '#ffffff',
      });
    } catch {
      svg.replaceChildren();
    }
  }, [value, text]);

  const fileBase = `barcode-${value}`.replace(/[^\w.-]+/g, '_');

  const downloadPng = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.onload = () => {
      const scale = 3;
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `${fileBase}.png`;
      a.click();
    };
    img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(xml)))}`;
  }, [fileBase]);

  const printBarcode = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const win = window.open('', '_blank', 'width=420,height=320');
    if (!win) return;
    win.document.write(
      `<!doctype html><title>${value}</title>` +
        `<body style="margin:0;display:grid;place-items:center;height:100vh">${xml}</body>`,
    );
    win.document.close();
    win.focus();
    win.print();
  }, [value]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,0.55)', padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 420, background: 'var(--surface)', borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', padding: 20 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>บาร์โค้ดสินค้า</h3>
          <button className="btn btn-sm btn-icon btn-ghost" onClick={onClose} aria-label="ปิด"><Icons.x /></button>
        </div>
        {heading && <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>{heading}</div>}

        <div style={{ display: 'grid', placeItems: 'center', background: '#fff', borderRadius: 'var(--r-md)', padding: 12 }}>
          <svg ref={svgRef} role="img" aria-label="บาร์โค้ด" />
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={printBarcode}><Icons.receipt /> พิมพ์</button>
          <button className="btn btn-sm" style={{ flex: 1 }} onClick={downloadPng}><Icons.download /> PNG</button>
        </div>
      </div>
    </div>
  );
}
