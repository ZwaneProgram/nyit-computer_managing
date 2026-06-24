import { useCallback, useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { Icons } from '../components/Icons';

interface ViewProps {
  showToast: (msg: string) => void;
}

/** Public storefront base — a product barcode round-trips to {BASE}/products/{id}. */
const STOREFRONT_BASE = 'http://194.233.88.142:3001';

type Mode = 'product' | 'custom';

/** Supported 1D symbologies (matches what JsBarcode renders cleanly). */
const FORMATS = [
  { value: 'CODE128', label: 'CODE128 (ทั่วไป / ตัวอักษรได้)' },
  { value: 'EAN13', label: 'EAN-13 (13 หลัก)' },
  { value: 'EAN8', label: 'EAN-8 (8 หลัก)' },
  { value: 'UPC', label: 'UPC-A (12 หลัก)' },
] as const;

type Format = (typeof FORMATS)[number]['value'];

export function GenerateBarcodeView({ showToast }: ViewProps) {
  const [mode, setMode] = useState<Mode>('product');
  const [productId, setProductId] = useState('');
  const [customValue, setCustomValue] = useState('');
  const [format, setFormat] = useState<Format>('CODE128');
  const [showText, setShowText] = useState(true);
  const [barWidth, setBarWidth] = useState(2);
  const [height, setHeight] = useState(90);
  const [error, setError] = useState('');

  const svgRef = useRef<SVGSVGElement>(null);

  // The value actually encoded into the barcode. In product mode we encode just
  // the numeric id so the storefront scanner maps it straight to /products/{id}.
  const value = mode === 'product' ? productId.trim() : customValue.trim();
  const productUrl =
    mode === 'product' && productId.trim()
      ? `${STOREFRONT_BASE}/products/${productId.trim()}`
      : '';

  // Re-render the barcode whenever an input changes. JsBarcode throws on values
  // that don't fit the chosen symbology (e.g. letters in EAN-13) — surface that
  // as a friendly message instead of leaving a stale preview.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    if (!value) {
      svg.replaceChildren();
      setError('');
      return;
    }

    try {
      JsBarcode(svg, value, {
        format,
        width: barWidth,
        height,
        displayValue: showText,
        font: 'monospace',
        fontSize: 16,
        textMargin: 6,
        margin: 12,
        lineColor: '#0d0f15',
        background: '#ffffff',
      });
      setError('');
    } catch {
      svg.replaceChildren();
      setError(
        format === 'CODE128'
          ? 'สร้างบาร์โค้ดไม่ได้ ลองตรวจสอบค่าที่กรอก'
          : `ค่าไม่ตรงรูปแบบ ${format} — ลองใช้ CODE128 หรือกรอกตัวเลขให้ครบจำนวนหลัก`,
      );
    }
  }, [value, format, showText, barWidth, height]);

  const fileBase = `barcode-${value || 'empty'}`.replace(/[^\w.-]+/g, '_');

  const downloadSvg = useCallback(() => {
    const svg = svgRef.current;
    if (!svg || error || !value) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([xml], { type: 'image/svg+xml' });
    triggerDownload(URL.createObjectURL(blob), `${fileBase}.svg`, true);
    showToast('ดาวน์โหลด SVG แล้ว');
  }, [error, value, fileBase, showToast]);

  const downloadPng = useCallback(() => {
    const svg = svgRef.current;
    if (!svg || error || !value) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.onload = () => {
      const scale = 3; // crisp print resolution
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      triggerDownload(canvas.toDataURL('image/png'), `${fileBase}.png`, false);
      showToast('ดาวน์โหลด PNG แล้ว');
    };
    img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(xml)))}`;
  }, [error, value, fileBase, showToast]);

  const copyValue = useCallback(async () => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    showToast('คัดลอกค่าแล้ว');
  }, [value, showToast]);

  const printBarcode = useCallback(() => {
    const svg = svgRef.current;
    if (!svg || error || !value) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const win = window.open('', '_blank', 'width=480,height=360');
    if (!win) return;
    win.document.write(
      `<!doctype html><title>${value}</title>` +
        `<body style="margin:0;display:grid;place-items:center;height:100vh">${xml}</body>`,
    );
    win.document.close();
    win.focus();
    win.print();
  }, [error, value]);

  const canExport = Boolean(value) && !error;

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* ---- Controls ---- */}
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="mb-1 text-lg font-semibold">สร้างบาร์โค้ด</h2>
        <p className="mb-5 text-sm text-[var(--ink-3)]">
          สร้างบาร์โค้ดสำหรับติดสินค้า — สแกนแล้วลูกค้าจะเข้าหน้าสินค้าบนเว็บร้านทันที
        </p>

        {/* mode toggle */}
        <div className="mb-5 inline-flex rounded-xl border border-[var(--border)] p-1">
          {(
            [
              ['product', 'สำหรับสินค้า'],
              ['custom', 'กำหนดเอง'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setMode(key)}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
                mode === key ? 'bg-blue-600 text-white' : 'text-[var(--ink-3)] hover:text-[var(--ink)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === 'product' ? (
          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm font-medium">รหัสสินค้า (Product ID)</span>
            <input
              value={productId}
              onChange={(e) => setProductId(e.target.value.replace(/[^\d]/g, ''))}
              inputMode="numeric"
              placeholder="เช่น 8"
              className="h-11 w-full rounded-xl border border-[var(--border)] bg-transparent px-3 text-[var(--ink)] outline-none focus:border-blue-600"
            />
            {productUrl && (
              <span className="mt-2 block break-all text-xs text-[var(--ink-3)]">
                สแกนแล้วไปที่: <span className="font-mono text-blue-600">{productUrl}</span>
              </span>
            )}
          </label>
        ) : (
          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm font-medium">ค่าที่ต้องการเข้ารหัส</span>
            <input
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              placeholder="ข้อความ ตัวเลข หรือ URL"
              className="h-11 w-full rounded-xl border border-[var(--border)] bg-transparent px-3 text-[var(--ink)] outline-none focus:border-blue-600"
            />
          </label>
        )}

        <label className="mb-4 block">
          <span className="mb-1.5 block text-sm font-medium">รูปแบบ (Format)</span>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as Format)}
            className="h-11 w-full rounded-xl border border-[var(--border)] bg-transparent px-3 text-[var(--ink)] outline-none focus:border-blue-600"
          >
            {FORMATS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>

        <div className="mb-4 grid grid-cols-2 gap-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">ความกว้างแท่ง: {barWidth}</span>
            <input
              type="range"
              min={1}
              max={4}
              step={0.5}
              value={barWidth}
              onChange={(e) => setBarWidth(Number(e.target.value))}
              className="w-full"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">ความสูง: {height}</span>
            <input
              type="range"
              min={40}
              max={160}
              step={10}
              value={height}
              onChange={(e) => setHeight(Number(e.target.value))}
              className="w-full"
            />
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showText} onChange={(e) => setShowText(e.target.checked)} />
          แสดงข้อความใต้บาร์โค้ด
        </label>
      </section>

      {/* ---- Preview + actions ---- */}
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h3 className="mb-4 text-sm font-medium text-[var(--ink-3)]">ตัวอย่าง</h3>

        <div className="relative grid min-h-[180px] place-items-center rounded-xl border border-dashed border-[var(--border)] bg-white p-4">
          {/* always mounted so the effect can render/clear it via the ref */}
          <svg ref={svgRef} role="img" aria-label="ตัวอย่างบาร์โค้ด" />
          {!value && (
            <span className="absolute text-sm text-[var(--ink-3)]">กรอกค่าเพื่อสร้างบาร์โค้ด</span>
          )}
        </div>

        {error && (
          <p className="mt-3 flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
            <Icons.warning className="h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            onClick={downloadPng}
            disabled={!canExport}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 font-medium text-white transition hover:bg-blue-700 disabled:opacity-40"
          >
            <Icons.download className="h-4 w-4" />
            PNG
          </button>
          <button
            onClick={downloadSvg}
            disabled={!canExport}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border)] font-medium transition hover:border-blue-600 disabled:opacity-40"
          >
            <Icons.download className="h-4 w-4" />
            SVG
          </button>
          <button
            onClick={printBarcode}
            disabled={!canExport}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border)] font-medium transition hover:border-blue-600 disabled:opacity-40"
          >
            <Icons.receipt className="h-4 w-4" />
            พิมพ์
          </button>
          <button
            onClick={copyValue}
            disabled={!value}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border)] font-medium transition hover:border-blue-600 disabled:opacity-40"
          >
            <Icons.tag className="h-4 w-4" />
            คัดลอกค่า
          </button>
        </div>
      </section>
    </div>
  );
}

/** Anchor-click download helper; revokes object URLs after use. */
function triggerDownload(href: string, filename: string, revoke: boolean) {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.click();
  if (revoke) setTimeout(() => URL.revokeObjectURL(href), 1000);
}
