import type { FastifyInstance } from 'fastify';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { query } from '../db';
import { requireAuth } from '../auth';

// AI sales-post generator. The user picks real item(s) from the database; we
// pull the authoritative data here (names/models/prices/warranty never come
// from the client), ask Gemini for ONLY the creative prose (headline,
// description, use-cases — and specs for single items), then assemble the post
// with the factual lines + the shop footer ourselves so prices and contact
// details are always exact. See AGENTS.md / the 2026-06-17 session.

const MODEL = () => process.env.GEMINI_MODEL || 'gemini-2.5-flash';

// Category slug -> emoji shown next to each component line in a setup post.
const CATEGORY_EMOJI: Record<string, string> = {
  cpu: '⚡',
  mb: '🧩',
  ram: '🧠',
  ssd: '🚀',
  psu: '🔌',
  gpu: '🎮',
  monitor: '🖥️',
  peripheral: '🎧',
  cooler: '❄️',
  case: '🖥️',
};
const emojiFor = (slug: string | null) => (slug && CATEGORY_EMOJI[slug]) || '🔧';

const baht = (n: number) => Math.round(n).toLocaleString('en-US');

interface Component {
  id: number;
  name: string;
  model: string | null;
  category_slug: string | null;
  category_name: string | null;
  price: number;
  stock: number;
  warranty_months: number;
}

const num = (v: unknown) => (v == null ? 0 : Number(v));

function normComponent(r: Record<string, unknown>): Component {
  return {
    id: Number(r.id),
    name: r.name as string,
    model: (r.model as string) ?? null,
    category_slug: (r.category_slug as string) ?? null,
    category_name: (r.category_name as string) ?? null,
    price: num(r.price),
    stock: num(r.stock),
    warranty_months: num(r.warranty_months),
  };
}

// Catalog rows (with representative in-stock price/warranty) for a set of ids.
async function fetchComponents(ids: number[]): Promise<Component[]> {
  if (!ids.length) return [];
  const { rows } = await query(
    `select p.id, p.name, p.model, c.slug as category_slug, c.name as category_name,
            coalesce(s.in_stock, 0)::int as stock,
            coalesce(s.price_min, 0) as price,
            coalesce(s.warranty_min, 0) as warranty_months
       from products p
       left join categories c on c.id = p.category_id
       left join (
         select product_id,
                count(*) filter (where status = 'in_stock') as in_stock,
                min(price) filter (where status = 'in_stock') as price_min,
                min(warranty_months) filter (where status = 'in_stock') as warranty_min
           from product_serials group by product_id
       ) s on s.product_id = p.id
      where p.id = any($1::bigint[])`,
    [ids],
  );
  // Preserve the caller's order.
  const byId = new Map(rows.map((r) => [Number((r as Record<string, unknown>).id), normComponent(r as Record<string, unknown>)]));
  return ids.map((id) => byId.get(id)).filter((c): c is Component => !!c);
}

// In-stock GPU catalogs for the "เพิ่มการ์ดจอได้" add-on list.
async function fetchGpuAddons(ids?: number[]): Promise<Component[]> {
  const { rows } = await query(
    `select p.id, p.name, p.model, c.slug as category_slug, c.name as category_name,
            coalesce(s.in_stock, 0)::int as stock,
            coalesce(s.price_min, 0) as price, 0 as warranty_months
       from products p
       join categories c on c.id = p.category_id
       join (
         select product_id,
                count(*) filter (where status = 'in_stock') as in_stock,
                min(price) filter (where status = 'in_stock') as price_min
           from product_serials group by product_id
       ) s on s.product_id = p.id
      where c.slug = 'gpu' and s.in_stock > 0
      order by s.price_min`,
  );
  let list = rows.map((r) => normComponent(r as Record<string, unknown>));
  if (ids?.length) {
    const keep = new Set(ids);
    list = list.filter((g) => keep.has(g.id));
  }
  return list;
}

// Build the fixed shop footer from settings. Each line only appears when its
// field is filled, so the owner controls exactly what shows.
function buildFooter(s: Record<string, unknown>, isSetup: boolean): string {
  const get = (k: string) => (s[k] as string | null)?.trim() || '';
  const lines: string[] = [];
  const warranty = get('post_warranty');
  const shipping = get('post_shipping');
  const payment = get('post_payment');
  const phone = get('post_phone') || get('phone');
  const website = get('post_website');
  const page = get('post_page_url');
  const shopee = get('post_shopee_url');
  const extra = get('post_extra');
  const hashtags = get('post_hashtags');

  if (warranty) lines.push(`🛡️ ${warranty}`);
  if (isSetup) lines.push('📦 ประกอบพร้อมใช้งาน เทสก่อนส่งทุกเครื่อง');
  if (shipping) lines.push(`🚚 ${shipping}`);
  if (payment) lines.push(`💳 ${payment}`);
  if (phone) lines.push(`📞 โทร: ${phone}`);
  lines.push('📩 ทักแชท / Inbox สอบถามได้เลยครับ');
  if (website) lines.push(`🌐 เว็บไซต์: ${website}`);
  if (page) lines.push(`👉 เพจร้าน: ${page}`);
  if (shopee) lines.push(`🛒 Shopee: ${shopee}`);
  if (extra) lines.push(extra);
  const body = lines.join('\n');
  return hashtags ? `${body}\n\n${hashtags}` : body;
}

// Strip code fences and pull the JSON object out of a model reply.
function parseJson(raw: string): Record<string, unknown> | null {
  let t = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  try {
    return JSON.parse(t) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const asLines = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];

// ---------- rate limiting ----------
// The free Gemini tier caps requests per minute (flash-lite ≈ 15/min), so when
// the owner clicks "generate" several times in a row we'd get 429s. To avoid
// that we run every Gemini call through one queue: calls never fire in parallel,
// we keep a minimum gap between them, and transient 429/503 errors are retried
// with backoff (honoring Google's suggested retryDelay). Tune with env vars:
//   GEMINI_RPM (default 12), GEMINI_MAX_RETRIES (default 4).
const RPM = Math.max(1, Number(process.env.GEMINI_RPM || 12));
const MIN_GAP_MS = Math.ceil(60_000 / RPM);
const MAX_RETRIES = Math.max(0, Number(process.env.GEMINI_MAX_RETRIES || 4));
const MAX_BACKOFF_MS = 30_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Turn a raw Gemini error into a short Thai message for the UI.
function friendlyAiError(err: unknown): string {
  const msg = String((err as Error)?.message || '');
  if (msg.includes('[429')) return 'โควต้า AI ของวันนี้/นาทีนี้เต็มแล้ว กรุณารอสักครู่แล้วลองใหม่ (Gemini rate limit)';
  if (msg.includes('[503') || /overloaded|unavailable/i.test(msg)) return 'เซิร์ฟเวอร์ AI มีคนใช้งานหนาแน่น กรุณาลองใหม่อีกครั้ง';
  return msg || 'เรียกใช้ AI ไม่สำเร็จ';
}

let queueTail: Promise<unknown> = Promise.resolve();
let lastCallAt = 0;

// Only retry genuinely transient errors: the model being overloaded (503).
// We deliberately do NOT retry 429 — on the free tier a 429 usually means the
// daily/quota budget is spent, and each retry is another request that counts
// against quota, so retrying makes it worse. The queue's spacing (below) is
// what prevents per-minute 429s; a 429 that still slips through is surfaced
// immediately instead of burning more quota.
function isOverloaded(err: unknown): boolean {
  const msg = String((err as Error)?.message || '');
  return msg.includes('[503') || /overloaded|unavailable/i.test(msg);
}

// Serialize + space out + retry every Gemini request.
async function withRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    const gap = lastCallAt + MIN_GAP_MS - Date.now();
    if (gap > 0) await sleep(gap);

    for (let attempt = 0; ; attempt++) {
      try {
        lastCallAt = Date.now();
        return await fn();
      } catch (err) {
        if (attempt >= MAX_RETRIES || !isOverloaded(err)) throw err;
        const backoff = Math.min(2_000 * 2 ** attempt, MAX_BACKOFF_MS);
        await sleep(backoff);
      }
    }
  };
  const result = queueTail.then(run, run);
  // Keep the chain alive even if this call rejects, so the queue never stalls.
  queueTail = result.catch(() => {});
  return result;
}

async function callGemini(prompt: string): Promise<string> {
  return withRateLimit(async () => {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);
    const model = genAI.getGenerativeModel({ model: MODEL() });
    const result = await model.generateContent(prompt);
    return result.response.text();
  });
}

// Same as callGemini but with Google Search grounding enabled.
// Gemini will search real manufacturer/retailer pages before answering.
async function callGeminiWithSearch(prompt: string): Promise<string> {
  return withRateLimit(async () => {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);
    const model = genAI.getGenerativeModel({
      model: MODEL(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: [{ googleSearch: {} } as any],
    });
    const result = await model.generateContent(prompt);
    return result.response.text();
  });
}

// Fetch the best-matching product page from JIB.co.th and return stripped text.
// Scores all search result links by how many words from name+model appear in the
// URL slug, then picks the highest scorer — avoids grabbing the wrong variant
// (e.g. Trinity OC when the user wants Solid Core OC).
// Returns null when scraping fails so the caller can fall back gracefully.
async function scrapeJib(
  name: string,
  model: string,
): Promise<{ text: string; title: string; url: string } | null> {
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  const q = encodeURIComponent(`${name} ${model}`.trim());
  try {
    const searchRes = await fetch(
      `https://www.jib.co.th/web/product/product_search/0/0/0/0/0/0/0/0/${q}`,
      { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) },
    );
    const searchHtml = await searchRes.text();

    // Collect all product page links from search results
    const links = [...searchHtml.matchAll(/href="(\/web\/product\/\d+\/[^"#?]+)"/g)]
      .map((m) => m[1])
      .filter((v, i, a) => a.indexOf(v) === i); // dedupe
    if (!links.length) return null;

    // Score each link by how many words from name+model appear in its slug
    const terms = `${name} ${model}`.toLowerCase().split(/\s+/).filter(Boolean);
    const best = links
      .map((link) => ({ link, score: terms.filter((t) => link.toLowerCase().includes(t)).length }))
      .sort((a, b) => b.score - a.score)[0].link;

    const productUrl = `https://www.jib.co.th${best}`;
    const productRes = await fetch(productUrl, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(8000),
    });
    const productHtml = await productRes.text();

    // Extract page title (h1 or <title>)
    const titleMatch = productHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
      ?? productHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch
      ? titleMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
      : best.split('/').pop()?.replace(/-/g, ' ') ?? '';

    const text = productHtml
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 5000);

    return { text, title, url: productUrl };
  } catch {
    return null;
  }
}

export async function aiRoutes(app: FastifyInstance) {
  // POST /api/ai/generate-product-description — generate a Thai product description
  // from the product name + model number using Gemini.
  app.post('/api/ai/generate-product-description', { preHandler: requireAuth() }, async (req, reply) => {
    if (!process.env.GEMINI_API_KEY) {
      return reply.code(503).send({ error: 'ยังไม่ได้ตั้งค่า GEMINI_API_KEY' });
    }
    const b = (req.body ?? {}) as { name?: string; model?: string; category?: string };
    const name = b.name?.trim() || '';
    const model = b.model?.trim() || '';
    if (!name && !model) return reply.code(400).send({ error: 'กรุณาระบุชื่อสินค้าหรือรุ่น' });

    const prompt = `คุณเป็นผู้เชี่ยวชาญด้านคอมพิวเตอร์และอุปกรณ์ไอที
สินค้า: "${name}"${model ? ` รุ่น ${model}` : ''}${b.category ? ` หมวดหมู่: ${b.category}` : ''}

เขียนรายละเอียดสินค้าเป็นภาษาไทย สำหรับแสดงในเว็บไซต์ร้านคอมพิวเตอร์
ตอบกลับเป็น JSON เท่านั้น:
{
  "description": "รายละเอียด 2-3 ประโยค บอกสเปคและจุดเด่นสำคัญ ว่าเหมาะกับการใช้งานอะไร"
}
กฎ: ห้ามใส่ราคา ใช้ภาษาไทยทั้งหมด กระชับและตรงประเด็น`;

    try {
      const raw = await callGemini(prompt);
      const data = parseJson(raw);
      const description = (data?.description as string)?.trim();
      if (!description) return reply.code(502).send({ error: 'AI ไม่สามารถสร้างรายละเอียดได้' });
      return { description };
    } catch (err) {
      return reply.code(502).send({ error: friendlyAiError(err) });
    }
  });

  // POST /api/ai/generate-product-specs — generate a structured spec sheet as a
  // JSON array of [key, value] pairs from the product name + model number.
  // Uses plain callGemini (no Search grounding) with category-specific fields
  // to keep the response focused and avoid billing/quota issues.
  app.post('/api/ai/generate-product-specs', { preHandler: requireAuth() }, async (req, reply) => {
    if (!process.env.GEMINI_API_KEY) {
      return reply.code(503).send({ error: 'ยังไม่ได้ตั้งค่า GEMINI_API_KEY' });
    }
    const b = (req.body ?? {}) as { name?: string; model?: string; category?: string };
    const name = b.name?.trim() || '';
    const model = b.model?.trim() || '';
    if (!name && !model) return reply.code(400).send({ error: 'กรุณาระบุชื่อสินค้าหรือรุ่น' });

    const CATEGORY_FIELDS: Record<string, string[]> = {
      gpu:        ['GPU Model', 'Memory Size', 'Memory Type', 'HDMI Port', 'Display Port', 'Power Connector', 'Power Requirement'],
      cpu:        ['Socket', 'Cores / Threads', 'Base Clock', 'Boost Clock', 'Cache', 'TDP'],
      ram:        ['Capacity', 'Speed', 'Type', 'Form Factor', 'Latency (CL)'],
      ssd:        ['Capacity', 'Interface', 'Form Factor', 'Read Speed', 'Write Speed'],
      mb:         ['Socket', 'Form Factor', 'Chipset', 'Memory Slots', 'Max Memory', 'PCIe Slots'],
      psu:        ['Wattage', 'Efficiency Rating', 'Modular', 'Form Factor'],
      monitor:    ['Panel Size', 'Resolution', 'Refresh Rate', 'Panel Type', 'Response Time', 'Ports'],
      cooler:     ['Type', 'Socket Compatibility', 'TDP Rating', 'Fan Size'],
      case:       ['Form Factor', 'Drive Bays', 'Front I/O', 'Dimensions'],
      peripheral: ['Type', 'Connection', 'Interface'],
    };

    const slug = (b.category ?? '').toLowerCase().trim();
    const fields = CATEGORY_FIELDS[slug] ?? ['Model', 'Key Specification 1', 'Key Specification 2', 'Key Specification 3'];
    const fieldList = fields.map((f) => `    ["${f}", "..."]`).join(',\n');

    // Scrape JIB first; if it returns a result use that as the source, otherwise
    // fall back to Gemini's own training knowledge (still no Search grounding).
    const jib = await scrapeJib(name, model);

    const prompt = jib
      ? `You are a computer hardware expert extracting specs from a product page.
Product: "${name}"${model ? ` (${model})` : ''}

Here is the raw text content scraped from JIB.co.th product page:
---
${jib.text}
---

Extract ONLY the fields below from the text above. If a field is not found in the text, omit it.
Return ONLY a JSON object — no markdown, no explanation:
{
  "specs": [
${fieldList}
  ]
}`
      : `You are a computer hardware expert.
Product: "${name}"${model ? ` (${model})` : ''}${b.category ? ` — Category: ${b.category}` : ''}

Return ONLY the fields below based on your training knowledge. Omit any field you are not confident about.
Return ONLY a JSON object — no markdown, no explanation:
{
  "specs": [
${fieldList}
  ]
}`;

    try {
      const raw = await callGemini(prompt);
      const data = parseJson(raw);
      const specs = data?.specs;
      if (!Array.isArray(specs) || !specs.length) {
        return reply.code(502).send({ error: 'AI ไม่สามารถสร้างสเปกได้' });
      }
      const jib_source = jib ? { title: jib.title, url: jib.url } : undefined;
      return { specs, jib_source };
    } catch (err) {
      return reply.code(502).send({ error: friendlyAiError(err) });
    }
  });

  // POST /api/ai/post-to-facebook — publish a text post to the shop's FB Page.
  // The Page ID and Page Access Token are stored in shop_settings by the owner;
  // they never travel from the client so the token stays server-side only.
  app.post('/api/ai/post-to-facebook', { preHandler: requireAuth() }, async (req, reply) => {
    const { rows } = await query('select fb_page_id, fb_page_access_token from shop_settings where id = 1');
    const s = (rows[0] ?? {}) as Record<string, unknown>;
    const pageId = (s.fb_page_id as string | null)?.trim();
    const token  = (s.fb_page_access_token as string | null)?.trim();

    if (!pageId || !token) {
      return reply.code(503).send({
        error: 'ยังไม่ได้ตั้งค่า Facebook Page ID / Access Token ในหน้าตั้งค่า',
      });
    }

    const b = (req.body ?? {}) as { text?: string };
    const message = (b.text ?? '').trim();
    if (!message) return reply.code(400).send({ error: 'ไม่มีข้อความที่จะโพสต์' });

    try {
      const url = `https://graph.facebook.com/v21.0/${pageId}/feed`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, access_token: token }),
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok || data.error) {
        const msg = (data.error as Record<string, unknown> | undefined)?.message ?? 'Facebook API error';
        return reply.code(502).send({ error: String(msg) });
      }
      const postId = String(data.id ?? '');
      const postUrl = postId ? `https://www.facebook.com/${postId.replace('_', '/posts/')}` : null;
      return { postId, postUrl };
    } catch (err) {
      return reply.code(502).send({ error: (err as Error).message || 'โพสต์ไม่สำเร็จ' });
    }
  });

  app.post('/api/ai/generate-post', { preHandler: requireAuth() }, async (req, reply) => {
    if (!process.env.GEMINI_API_KEY) {
      return reply
        .code(503)
        .send({ error: 'ยังไม่ได้ตั้งค่า GEMINI_API_KEY ในเซิร์ฟเวอร์ (ดู server/.env)' });
    }

    const b = (req.body ?? {}) as {
      mode?: string;
      productId?: number;
      serialId?: number;
      bundleId?: number;
      productIds?: number[];
      includeGpuAddons?: boolean;
      gpuAddonProductIds?: number[];
    };
    const mode = b.mode === 'setup' ? 'setup' : 'single';

    const { rows: settingsRows } = await query('select * from shop_settings where id = 1');
    const settings = (settingsRows[0] ?? {}) as Record<string, unknown>;

    try {
      const post = mode === 'single'
        ? await generateSingle(b, settings)
        : await generateSetup(b, settings);
      if ('error' in post) return reply.code(post.code).send({ error: post.error });
      return { post: post.text };
    } catch (err) {
      app.log.error(err);
      return reply.code(502).send({ error: friendlyAiError(err) });
    }
  });
}

type Result = { text: string } | { error: string; code: number };

// ---------- single item ----------
async function generateSingle(
  b: { productId?: number; serialId?: number },
  settings: Record<string, unknown>,
): Promise<Result> {
  let name = '';
  let model: string | null = null;
  let category = '';
  let price = 0;
  let warranty = 0;
  let note = '';

  if (b.serialId) {
    const { rows } = await query(
      `select ps.price, ps.warranty_months, ps.note as unit_note,
              p.name, p.model, p.notes as product_notes, c.name as category_name
         from product_serials ps
         join products p on p.id = ps.product_id
         left join categories c on c.id = p.category_id
        where ps.id = $1`,
      [b.serialId],
    );
    if (!rows[0]) return { error: 'ไม่พบหน่วยสินค้านี้', code: 404 };
    const r = rows[0] as Record<string, unknown>;
    name = r.name as string;
    model = (r.model as string) ?? null;
    category = (r.category_name as string) ?? '';
    price = num(r.price);
    warranty = num(r.warranty_months);
    note = ((r.unit_note as string) || (r.product_notes as string) || '').trim();
  } else if (b.productId) {
    const [c] = await fetchComponents([b.productId]);
    if (!c) return { error: 'ไม่พบสินค้านี้', code: 404 };
    name = c.name;
    model = c.model;
    category = c.category_name ?? '';
    price = c.price;
    warranty = c.warranty_months;
  } else {
    return { error: 'กรุณาเลือกสินค้า', code: 400 };
  }

  const priceHint = price > 0
    ? `ราคาขาย: ${baht(price)} บาท (ใช้ราคานี้)`
    : 'ยังไม่ระบุราคา — ห้ามแต่งราคาขึ้นมาเอง';
  const warrantyHint = warranty > 0 ? `การรับประกันสินค้า: ${warranty} เดือน` : '';

  const prompt = `คุณเป็นผู้เชี่ยวชาญเขียนโพสต์ขายสินค้าไอที/คอมพิวเตอร์บน Facebook Marketplace ในไทย
สินค้า: "${name}${model ? ` (${model})` : ''}"
หมวดหมู่: ${category || 'ไม่ระบุ'}
${priceHint}
${warrantyHint}
${note ? `ข้อมูลเพิ่มเติมจากร้าน: ${note}` : ''}

เขียนเนื้อหาโพสต์ขายภาษาไทย น้ำเสียงกระตือรือร้น น่าซื้อ ใช้คำที่คนไทยใช้จริง
ตอบกลับเป็น JSON อย่างเดียว ตามรูปแบบนี้ (ห้ามมีข้อความอื่นนอก JSON):
{
  "headline": "หัวข้อดึงดูด 1 บรรทัด",
  "description": "ย่อหน้าอธิบายสินค้า 2-3 ประโยค",
  "specs": ["สเปก/จุดเด่น 1", "สเปก/จุดเด่น 2", "สเปก/จุดเด่น 3", "สเปก/จุดเด่น 4", "สเปก/จุดเด่น 5"],
  "useCases": ["เหมาะกับการใช้งาน 1", "การใช้งาน 2", "การใช้งาน 3", "การใช้งาน 4"]
}
กฎ: ห้ามใส่ราคา/เบอร์โทร/ลิงก์ในคำตอบ (ระบบจะเติมให้เอง) ใช้ภาษาไทยทั้งหมด`;

  const data = parseJson(await callGemini(prompt));
  const headline = (data?.headline as string)?.trim() || `🔥 ${name} พร้อมส่ง!`;
  const description = (data?.description as string)?.trim() || '';
  const specs = asLines(data?.specs);
  const useCases = asLines(data?.useCases);

  const specEmojis = ['⚡', '🛡️', '💨', '🔋', '🖥️', '✨', '🔧'];
  const parts: string[] = [];
  parts.push(`🔥 ${headline}`);
  if (description) parts.push(description);
  parts.push(price > 0 ? `💰 ราคาเพียง ${baht(price)}.-` : '💰 สอบถามราคาทางอินบ็อกซ์');
  if (specs.length) {
    parts.push(['📌 สเปก / รายละเอียดสินค้า', ...specs.map((s, i) => `${specEmojis[i] ?? '•'} ${s}`)].join('\n'));
  }
  if (useCases.length) {
    parts.push(['🎯 เหมาะสำหรับ', ...useCases.map((u) => `✅ ${u}`)].join('\n'));
  }
  const footer = buildFooter(settings, false);
  if (footer) parts.push(footer);
  return { text: parts.join('\n\n') };
}

// ---------- full setup / bundle ----------
async function generateSetup(
  b: {
    bundleId?: number;
    productIds?: number[];
    includeGpuAddons?: boolean;
    gpuAddonProductIds?: number[];
  },
  settings: Record<string, unknown>,
): Promise<Result> {
  let components: Component[] = [];
  let discountPct = 0;
  let title = 'ชุดคอมประกอบ';

  if (b.bundleId) {
    const { rows } = await query('select name, discount_pct from bundles where id = $1', [b.bundleId]);
    if (!rows[0]) return { error: 'ไม่พบชุดสินค้านี้', code: 404 };
    title = (rows[0] as Record<string, unknown>).name as string;
    discountPct = num((rows[0] as Record<string, unknown>).discount_pct);
    const { rows: itemRows } = await query(
      'select product_id from bundle_items where bundle_id = $1',
      [b.bundleId],
    );
    const ids = itemRows.map((r) => Number((r as Record<string, unknown>).product_id));
    components = await fetchComponents(ids);
  } else {
    const ids = Array.isArray(b.productIds) ? b.productIds.map(Number).filter(Number.isFinite) : [];
    if (!ids.length) return { error: 'กรุณาเลือกสินค้าอย่างน้อยหนึ่งรายการ', code: 400 };
    components = await fetchComponents(ids);
  }
  if (!components.length) return { error: 'ไม่พบสินค้าในชุดนี้', code: 400 };

  const listPrice = components.reduce((sum, c) => sum + c.price, 0);
  const price = Math.round(listPrice * (1 - discountPct / 100));

  const hasGpu = components.some((c) => c.category_slug === 'gpu');
  let gpuAddons: Component[] = [];
  if (!hasGpu && b.includeGpuAddons) {
    gpuAddons = await fetchGpuAddons(b.gpuAddonProductIds);
  }

  // Plain component list (no prices) for the model to reason about the build.
  const componentText = components
    .map((c) => `- ${c.category_name ?? 'อื่นๆ'}: ${c.name}${c.model ? ` (${c.model})` : ''}`)
    .join('\n');

  const prompt = `คุณเป็นผู้เชี่ยวชาญเขียนโพสต์ขายคอมพิวเตอร์ประกอบ (คอมเซ็ต) บน Facebook Marketplace ในไทย
ชื่อชุด: "${title}"
รายการอุปกรณ์ในเครื่อง:
${componentText}
${!hasGpu ? 'หมายเหตุ: เครื่องนี้ยังไม่รวมการ์ดจอ (ลูกค้าเพิ่มการ์ดจอได้ภายหลัง)' : ''}

เขียนเนื้อหาโพสต์ขายคอมเซ็ตภาษาไทย น้ำเสียงกระตือรือร้น น่าซื้อ เน้นว่าแรง คุ้ม อัปเกรดต่อได้
ตอบกลับเป็น JSON อย่างเดียว ตามรูปแบบนี้ (ห้ามมีข้อความอื่นนอก JSON):
{
  "headline": "หัวข้อดึงดูด 1 บรรทัด",
  "description": "ย่อหน้าอธิบายชุดคอม 2-3 ประโยค",
  "useCases": ["เหมาะกับการใช้งาน 1", "การใช้งาน 2", "การใช้งาน 3", "การใช้งาน 4", "การใช้งาน 5"]
}
กฎ: ห้ามแต่งสเปก/รุ่นอุปกรณ์เพิ่มเอง ห้ามใส่ราคา/เบอร์โทร/ลิงก์ (ระบบจะเติมรายการอุปกรณ์จริงและราคาให้เอง) ใช้ภาษาไทยทั้งหมด`;

  const data = parseJson(await callGemini(prompt));
  const headline = (data?.headline as string)?.trim() || `🔥 ${title} สเปกแรง คุ้มสุด!`;
  const description = (data?.description as string)?.trim() || '';
  const useCases = asLines(data?.useCases);

  const parts: string[] = [];
  parts.push(`🔥 ${headline}`);
  if (description) parts.push(description);
  parts.push(price > 0 ? `💰 ราคาเพียง ${baht(price)}.-` : '💰 สอบถามราคาทางอินบ็อกซ์');

  // Real component lines — exact model names, emoji by category.
  const specLines = components.map((c) => `${emojiFor(c.category_slug)} ${c.name}${c.model ? ` ${c.model}` : ''}`);
  parts.push(['📌 สเปกเครื่อง', ...specLines].join('\n'));

  // GPU upgrade add-ons (only when the build has no GPU and the user opted in).
  if (gpuAddons.length) {
    const addonLines = gpuAddons.map((g) => `⚡ ${g.model || g.name} +${baht(g.price)}.-`);
    parts.push(['🎮 เพิ่มการ์ดจอได้ พร้อมเล่นเกมทันที', ...addonLines].join('\n'));
  }

  if (useCases.length) {
    parts.push(['🎯 เหมาะสำหรับ', ...useCases.map((u) => `✅ ${u}`)].join('\n'));
  }
  const footer = buildFooter(settings, true);
  if (footer) parts.push(footer);
  return { text: parts.join('\n\n') };
}
