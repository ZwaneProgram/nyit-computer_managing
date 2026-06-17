import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icons } from '../components/Icons';
import { ApiError } from '../lib/api';
import { fmtTHB } from '../data/format';
import {
  fetchProducts,
  fetchProduct,
  type Product,
  type Serial,
} from '../data/inventory';
import { fetchBundles, type Bundle } from '../data/bundles';
import { generatePost, formatPost, postToFacebook } from '../data/aiPost';

interface ViewProps {
  showToast: (msg: string) => void;
}

type Mode = 'single' | 'setup';
type SetupSource = 'bundle' | 'adhoc';

export function GeneratePostView({ showToast }: ViewProps) {
  const [mode, setMode] = useState<Mode>('single');
  const [products, setProducts] = useState<Product[]>([]);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [loading, setLoading] = useState(true);

  // single
  const [singleId, setSingleId] = useState<number | null>(null);
  const [serials, setSerials] = useState<Serial[]>([]);
  const [serialId, setSerialId] = useState<number | null>(null);

  // setup
  const [source, setSource] = useState<SetupSource>('adhoc');
  const [bundleId, setBundleId] = useState<number | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [includeGpu, setIncludeGpu] = useState(true);
  const [gpuPicked, setGpuPicked] = useState<Set<number>>(new Set());

  const [search, setSearch] = useState('');
  const [generating, setGenerating] = useState(false);
  const [post, setPost] = useState('');
  const [showEdit, setShowEdit] = useState(false);
  const [posting, setPosting] = useState(false);

  const fail = (err: unknown, fallback: string) =>
    showToast(err instanceof ApiError ? err.message : fallback);

  useEffect(() => {
    Promise.all([fetchProducts(), fetchBundles()])
      .then(([p, b]) => {
        setProducts(p);
        setBundles(b);
      })
      .catch((err) => fail(err, 'โหลดข้อมูลไม่สำเร็จ'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // In-stock GPUs available as upgrade add-ons; default all selected.
  const gpus = useMemo(
    () => products.filter((p) => p.category_slug === 'gpu' && p.stock > 0),
    [products],
  );
  useEffect(() => {
    setGpuPicked(new Set(gpus.map((g) => g.id)));
  }, [gpus]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = products.filter((p) => p.stock > 0 || p.draft_count === 0);
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.model ?? '').toLowerCase().includes(q) ||
        (p.category_name ?? '').toLowerCase().includes(q),
    );
  }, [products, search]);

  // Load a single product's units so the user can pick a specific one.
  const selectSingle = useCallback(async (id: number) => {
    setSingleId(id);
    setSerialId(null);
    setSerials([]);
    try {
      const { serials: s } = await fetchProduct(id);
      setSerials(s.filter((u) => u.status === 'in_stock'));
    } catch (err) {
      fail(err, 'โหลดหน่วยสินค้าไม่สำเร็จ');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const togglePick = (id: number) =>
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleGpu = (id: number) =>
    setGpuPicked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const canGenerate =
    mode === 'single'
      ? singleId != null
      : source === 'bundle'
        ? bundleId != null
        : picked.size > 0;

  const generate = async () => {
    if (!canGenerate) return;
    setGenerating(true);
    setPost('');
    try {
      let text: string;
      if (mode === 'single') {
        text = await generatePost({
          mode: 'single',
          productId: singleId!,
          serialId: serialId ?? undefined,
        });
      } else {
        text = await generatePost({
          mode: 'setup',
          bundleId: source === 'bundle' ? bundleId! : undefined,
          productIds: source === 'adhoc' ? [...picked] : undefined,
          includeGpuAddons: includeGpu,
          gpuAddonProductIds: includeGpu ? [...gpuPicked] : undefined,
        });
      }
      setPost(text);
      setShowEdit(false);
    } catch (err) {
      fail(err, 'สร้างโพสต์ไม่สำเร็จ');
    } finally {
      setGenerating(false);
    }
  };

  const copy = async () => {
    if (!post.trim()) return;
    try {
      await navigator.clipboard.writeText(formatPost(post));
      showToast('คัดลอกแล้ว! นำไปวางใน Facebook ได้เลย');
    } catch {
      showToast('คัดลอกไม่สำเร็จ — กดเลือกข้อความแล้วคัดลอกเอง');
    }
  };

  return (
    <div className="genpost grid" style={{ gap: 'var(--gap)' }}>
      <div className="page-head">
        <div>
          <div className="page-title">สร้างโพสต์ขาย AI</div>
          <div className="muted page-subtitle">
            เลือกสินค้าจากคลัง แล้วให้ AI เขียนโพสต์ขายแบบ Facebook / Marketplace ให้
          </div>
        </div>
      </div>

      <div className="genpost-cols">
        {/* ---- left: picker ---- */}
        <div className="card card-pad">
          {/* mode toggle */}
          <div className="seg-toggle">
            <button
              className={`btn ${mode === 'single' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setMode('single')}
            >
              <Icons.box /> ชิ้นเดียว
            </button>
            <button
              className={`btn ${mode === 'setup' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setMode('setup')}
            >
              <Icons.layers /> ชุดเซ็ต
            </button>
          </div>

          {loading ? (
            <div className="muted" style={{ padding: 12 }}>กำลังโหลด...</div>
          ) : mode === 'single' ? (
            <SingleItemPicker
              filtered={filtered}
              search={search}
              setSearch={setSearch}
              singleId={singleId}
              onSelect={selectSingle}
              serials={serials}
              serialId={serialId}
              setSerialId={setSerialId}
            />
          ) : (
            <SetupPicker
              source={source}
              setSource={setSource}
              bundles={bundles}
              bundleId={bundleId}
              setBundleId={setBundleId}
              filtered={filtered}
              search={search}
              setSearch={setSearch}
              picked={picked}
              togglePick={togglePick}
              includeGpu={includeGpu}
              setIncludeGpu={setIncludeGpu}
              gpus={gpus}
              gpuPicked={gpuPicked}
              toggleGpu={toggleGpu}
            />
          )}

          <div style={{ marginTop: 16 }}>
            <button className="btn btn-primary" onClick={generate} disabled={!canGenerate || generating}>
              {generating ? <>กำลังสร้างโพสต์...</> : <>✨ สร้างโพสต์ขาย</>}
            </button>
          </div>
        </div>

        {/* ---- right: result ---- */}
        <div className="card card-pad">
          <div className="section-h" style={{ alignItems: 'center' }}>
            <div><h3>ตัวอย่างโพสต์</h3></div>
            {post && (
              <button className="btn btn-sm btn-ghost" onClick={() => setShowEdit((v) => !v)}>
                {showEdit ? 'ดูตัวอย่าง' : 'แก้ไขข้อความ'}
              </button>
            )}
          </div>

          {!post ? (
            <div className="muted" style={{ padding: '28px 8px', textAlign: 'center', lineHeight: 1.7 }}>
              {generating ? 'AI กำลังเขียนโพสต์ให้...' : 'เลือกสินค้าทางซ้าย แล้วกด “สร้างโพสต์ขาย”'}
            </div>
          ) : showEdit ? (
            <textarea
              className="input"
              value={post}
              onChange={(e) => setPost(e.target.value)}
              onBlur={(e) => setPost(formatPost(e.target.value))}
              rows={22}
              style={{ resize: 'vertical', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}
            />
          ) : (
            <div className="genpost-preview">{post}</div>
          )}

          {post && (
            <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={copy}><Icons.receipt /> คัดลอกโพสต์</button>
              <button
                className="btn btn-primary"
                style={{ background: '#1877F2', borderColor: '#1877F2' }}
                onClick={async () => {
                  setPosting(true);
                  try {
                    const { postUrl } = await postToFacebook(formatPost(post));
                    showToast(postUrl ? 'โพสต์แล้ว! ดูได้ที่ Facebook' : 'โพสต์แล้ว!');
                    if (postUrl) window.open(postUrl, '_blank');
                  } catch (err) {
                    showToast(err instanceof Error ? err.message : 'โพสต์ไม่สำเร็จ');
                  } finally {
                    setPosting(false);
                  }
                }}
                disabled={posting}
              >
                {posting ? 'กำลังโพสต์...' : 'f โพสต์ลง Facebook'}
              </button>
              <button className="btn btn-ghost" onClick={generate} disabled={generating}>
                <Icons.refresh /> สร้างใหม่
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- single-item picker ----------
function SingleItemPicker(props: {
  filtered: Product[];
  search: string;
  setSearch: (s: string) => void;
  singleId: number | null;
  onSelect: (id: number) => void;
  serials: Serial[];
  serialId: number | null;
  setSerialId: (id: number | null) => void;
}) {
  const { filtered, search, setSearch, singleId, onSelect, serials, serialId, setSerialId } = props;
  return (
    <>
      <input
        className="input"
        placeholder="ค้นหาสินค้า (ชื่อ / รุ่น / หมวดหมู่)"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: 10 }}
      />
      <div className="genpost-list">
        {filtered.map((p) => (
          <button
            key={p.id}
            className={`genpost-pick${singleId === p.id ? ' selected' : ''}`}
            onClick={() => onSelect(p.id)}
          >
            <div style={{ fontWeight: 500 }}>{p.name}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              {p.category_name ?? '—'} · คงเหลือ {p.stock}
              {p.price_min != null && ` · ${fmtTHB(p.price_min)}`}
            </div>
          </button>
        ))}
        {!filtered.length && <div className="muted" style={{ padding: 10 }}>ไม่พบสินค้า</div>}
      </div>

      {singleId != null && serials.length > 0 && (
        <label style={{ display: 'block', marginTop: 12 }}>
          <div style={{ fontSize: 12.5, fontWeight: 500, marginBottom: 5 }}>เลือกหน่วย (ราคาที่จะใช้)</div>
          <select
            className="input"
            value={serialId ?? ''}
            onChange={(e) => setSerialId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">ถูกที่สุดในสต๊อก</option>
            {serials.map((s) => (
              <option key={s.id} value={s.id}>
                {s.serial} — {fmtTHB(s.price)}
                {s.warranty_months ? ` · ประกัน ${s.warranty_months} ด.` : ''}
              </option>
            ))}
          </select>
        </label>
      )}
    </>
  );
}

// ---------- setup picker ----------
function SetupPicker(props: {
  source: SetupSource;
  setSource: (s: SetupSource) => void;
  bundles: Bundle[];
  bundleId: number | null;
  setBundleId: (id: number | null) => void;
  filtered: Product[];
  search: string;
  setSearch: (s: string) => void;
  picked: Set<number>;
  togglePick: (id: number) => void;
  includeGpu: boolean;
  setIncludeGpu: (v: boolean) => void;
  gpus: Product[];
  gpuPicked: Set<number>;
  toggleGpu: (id: number) => void;
}) {
  const {
    source, setSource, bundles, bundleId, setBundleId, filtered, search, setSearch,
    picked, togglePick, includeGpu, setIncludeGpu, gpus, gpuPicked, toggleGpu,
  } = props;
  return (
    <>
      <div className="seg-pill">
        <button className={`btn btn-sm ${source === 'adhoc' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setSource('adhoc')}>
          เลือกสินค้าเอง
        </button>
        <button className={`btn btn-sm ${source === 'bundle' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setSource('bundle')}>
          ใช้ชุดที่บันทึกไว้
        </button>
      </div>

      {source === 'bundle' ? (
        <label style={{ display: 'block' }}>
          <div style={{ fontSize: 12.5, fontWeight: 500, marginBottom: 5 }}>เลือกชุดสินค้า</div>
          <select className="input" value={bundleId ?? ''} onChange={(e) => setBundleId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">— เลือกชุด —</option>
            {bundles.map((b) => (
              <option key={b.id} value={b.id}>{b.name} ({b.items.length} ชิ้น)</option>
            ))}
          </select>
        </label>
      ) : (
        <>
          <input
            className="input"
            placeholder="ค้นหาสินค้าเพื่อเพิ่มเข้าชุด"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ marginBottom: 10 }}
          />
          <div className="genpost-list">
            {filtered.map((p) => (
              <button
                key={p.id}
                className={`genpost-pick${picked.has(p.id) ? ' selected' : ''}`}
                onClick={() => togglePick(p.id)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontWeight: 500 }}>{picked.has(p.id) ? '✓ ' : ''}{p.name}</span>
                  <span className="muted" style={{ fontSize: 12 }}>{p.category_name ?? '—'}</span>
                </div>
              </button>
            ))}
            {!filtered.length && <div className="muted" style={{ padding: 10 }}>ไม่พบสินค้า</div>}
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>เลือกแล้ว {picked.size} ชิ้น</div>
        </>
      )}

      {/* GPU upgrade add-ons */}
      <div style={{ borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 12 }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
          <input type="checkbox" checked={includeGpu} onChange={(e) => setIncludeGpu(e.target.checked)} />
          เพิ่มรายการการ์ดจอให้ลูกค้าอัปเกรด (เฉพาะเครื่องที่ยังไม่มีการ์ดจอ)
        </label>
        {includeGpu && (
          gpus.length ? (
            <div style={{ marginTop: 8, display: 'grid', gap: 4, maxHeight: 160, overflowY: 'auto' }}>
              {gpus.map((g) => (
                <label key={g.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5 }}>
                  <input type="checkbox" checked={gpuPicked.has(g.id)} onChange={() => toggleGpu(g.id)} />
                  {g.model || g.name}
                  {g.price_min != null && <span className="muted">+{fmtTHB(g.price_min)}</span>}
                </label>
              ))}
            </div>
          ) : (
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>ไม่มีการ์ดจอในสต๊อก</div>
          )
        )}
      </div>
    </>
  );
}

