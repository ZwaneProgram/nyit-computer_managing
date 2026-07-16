export interface PosterSpecRow { slug: string; label: string; text: string }
export interface PosterData {
  subtitle: string;
  price: number;
  priceNote: string;
  specs: PosterSpecRow[];
  photoDataUri: string;
  phone: string;
  website: string;
  facebook: string;
  warranty: string;
}

const ACCENT = '#c7f032';        // yellow-green used across the reference posters
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Minimal line icons per category (stroke = currentColor, sized by container).
const ICONS: Record<string, string> = {
  cpu: '<rect x="6" y="6" width="12" height="12" rx="1"/><path d="M9 2v3M12 2v3M15 2v3M9 19v3M12 19v3M15 19v3M2 9h3M2 12h3M2 15h3M19 9h3M19 12h3M19 15h3"/>',
  mb: '<rect x="3" y="3" width="18" height="18" rx="1"/><rect x="6" y="6" width="5" height="5"/><path d="M14 7h4M14 10h4M7 14v3M10 14v3M14 15h3"/>',
  ram: '<rect x="2" y="7" width="20" height="10" rx="1"/><path d="M6 7v10M10 7v10M14 7v10M18 7v10M4 17v2M20 17v2"/>',
  ssd: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 7h8M8 11h8M8 15h5"/>',
  psu: '<rect x="3" y="5" width="18" height="14" rx="1"/><circle cx="9" cy="12" r="4"/><path d="M17 9h2M17 12h2M17 15h2"/>',
  gpu: '<rect x="2" y="6" width="20" height="12" rx="1"/><circle cx="8" cy="12" r="3"/><circle cx="15" cy="12" r="3"/>',
  default: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 12h8"/>',
};
const icon = (slug: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[slug] ?? ICONS.default}</svg>`;

export function buildBundlePosterHtml(d: PosterData): string {
  const priceStr = Math.round(d.price).toLocaleString('en-US');
  const rows = d.specs.map((r) => `
    <div class="spec">
      <div class="spec-ic">${icon(r.slug)}</div>
      <div class="spec-txt">
        <div class="spec-cat">${esc(r.label)}</div>
        <div class="spec-name">${esc(r.text)}</div>
      </div>
    </div>`).join('');

  const contact = [d.phone, d.website, d.facebook].filter(Boolean).map(esc).join('  ·  ');

  return `<!doctype html>
<html lang="th"><head><meta charset="utf-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Noto Sans Thai', 'Leelawadee UI', 'Tahoma', 'Loma', 'Garuda', system-ui, sans-serif; }
  .poster { width: 1200px; height: 1200px; position: relative; overflow: hidden;
    background: radial-gradient(120% 90% at 70% 0%, #262b33 0%, #14171c 55%, #0c0e12 100%);
    color: #fff; display: flex; flex-direction: column; }
  .head { display: flex; align-items: flex-start; gap: 20px; padding: 34px 40px 10px; }
  .logo { flex: 0 0 auto; background: #e0261f; border-radius: 8px; padding: 8px 14px;
    font-weight: 800; line-height: 1; text-align: center; }
  .logo b { display: block; font-size: 30px; } .logo span { display: block; font-size: 20px; letter-spacing: 2px; }
  .title { flex: 1 1 auto; padding-top: 2px; }
  .title h1 { font-size: 58px; font-weight: 800; letter-spacing: -1px; }
  .title .sub { font-size: 26px; color: ${ACCENT}; font-weight: 600; margin-top: 2px; }
  .price { flex: 0 0 auto; text-align: center; background: linear-gradient(180deg,#2b3138,#191d22);
    border: 2px solid ${ACCENT}; border-radius: 12px; padding: 10px 22px 12px; min-width: 260px; }
  .price .lbl { font-size: 22px; font-weight: 600; }
  .price .num { font-family: 'Anton', 'Arial Narrow', 'Impact', sans-serif; font-size: 76px; line-height: .9; color: ${ACCENT}; }
  .price .note { display: inline-block; margin-top: 8px; background: #e0261f; color: #fff;
    font-size: 16px; font-weight: 600; border-radius: 6px; padding: 3px 12px; }
  .body { flex: 1 1 auto; display: flex; gap: 22px; padding: 14px 40px 8px; min-height: 0; }
  .specs { flex: 0 0 46%; display: flex; flex-direction: column; justify-content: center; gap: 14px; }
  .spec { display: flex; align-items: center; gap: 16px; }
  .spec-ic { flex: 0 0 auto; width: 58px; height: 58px; color: ${ACCENT}; }
  .spec-ic svg { width: 100%; height: 100%; }
  .spec-cat { font-size: 20px; font-weight: 800; color: ${ACCENT}; letter-spacing: .5px; }
  .spec-name { font-size: 21px; font-weight: 600; color: #f3f4f2; line-height: 1.25; }
  .photo { flex: 1 1 auto; border-radius: 12px; overflow: hidden; display: flex; align-items: center; justify-content: center; }
  .photo img { width: 100%; height: 100%; object-fit: cover; }
  .foot { flex: 0 0 auto; background: #0a0c0f; padding: 18px 40px; display: flex; flex-direction: column; gap: 8px; }
  .foot .guar { display: flex; flex-wrap: wrap; gap: 10px 26px; font-size: 18px; color: #dfe2dc; }
  .foot .guar b { color: ${ACCENT}; }
  .foot .contact { font-size: 20px; font-weight: 700; color: #fff; }
</style></head>
<body>
  <div class="poster">
    <div class="head">
      <div class="logo"><b>N.Y.</b><span>ITSHOP</span></div>
      <div class="title"><h1>ชุดคอมพร้อมใช้งาน</h1><div class="sub">${esc(d.subtitle)}</div></div>
      <div class="price"><div class="lbl">ราคาเพียง</div><div class="num">${priceStr}.-</div><div class="note">${esc(d.priceNote)}</div></div>
    </div>
    <div class="body">
      <div class="specs">${rows}</div>
      <div class="photo"><img src="${d.photoDataUri}" alt="" /></div>
    </div>
    <div class="foot">
      <div class="guar"><span><b>✓</b> ประกันร้าน ${esc(d.warranty)}</span><span><b>✓</b> สินค้าคัดสภาพ</span><span><b>✓</b> ทดสอบทุกฟังก์ชัน</span><span><b>✓</b> จัดส่งไวทั่วไทย</span><span><b>✓</b> แพ็คแน่นหนา</span></div>
      <div class="contact">${contact}</div>
    </div>
  </div>
</body></html>`;
}
