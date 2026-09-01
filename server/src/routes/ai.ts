import type { FastifyInstance } from 'fastify';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { writeFile, mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { query } from '../db';
import { requireAuth } from '../auth';
import { renderHtmlToPng } from '../lib/renderHtmlToPng';
import { buildBundlePosterHtml, type PosterSpecRow } from '../lib/bundlePosterTemplate';
import { AI_IMAGE_GEN_ENABLED, FEATURE_DISABLED } from '../lib/features';

const AI_IMAGE_DIR = fileURLToPath(new URL('../../uploads/ai-images', import.meta.url));

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

// ---------- MaxPlus research (web-search-grounded text) ----------
// MaxPlus is an OpenAI-compatible proxy (https://api.maxplus-ai.cc). We use its
// Responses API with the web_search tool so the model actually searches
// manufacturer + Thai retailer pages before answering — real research, not
// training-data guesses. Config via env: MAXPLUS_API_KEY, MAXPLUS_BASE_URL,
// MAXPLUS_TEXT_MODEL (default gpt-5.5).
//
// 2026-08-12: MaxPlus retired gpt-5.4. Its /v1/models now serves gpt-5.5,
// gpt-5.6-sol and gpt-5.6-terra, so the default moved to gpt-5.5 — asking for
// a retired model is what made this endpoint 502.
const MAXPLUS_BASE = () => (process.env.MAXPLUS_BASE_URL ?? 'https://api.maxplus-ai.cc').replace(/\/+$/, '');
const MAXPLUS_TEXT_MODEL = () => process.env.MAXPLUS_TEXT_MODEL ?? 'gpt-5.5';

// Pull the assistant's text out of a Responses-API reply (skips reasoning +
// web_search_call items). Falls back to the SDK-style output_text convenience field.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractResponsesText(data: any): string {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) return data.output_text;
  const out = data?.output;
  if (!Array.isArray(out)) return '';
  let text = '';
  for (const item of out) {
    if (item?.type === 'message' && Array.isArray(item.content)) {
      for (const c of item.content) {
        if (c?.type === 'output_text' && typeof c.text === 'string') text += c.text;
      }
    }
  }
  return text;
}

async function callMaxPlusResearch(instructions: string, userText: string): Promise<string> {
  // The web_search tool makes latency variable; MaxPlus's gateway occasionally
  // times out on a slow search. Retry once on a transient timeout/5xx.
  let lastErr = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${MAXPLUS_BASE()}/v1/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.MAXPLUS_API_KEY ?? ''}`,
      },
      body: JSON.stringify({
        model: MAXPLUS_TEXT_MODEL(),
        instructions,
        input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: userText }] }],
        tools: [{ type: 'web_search' }],
        stream: false,
        store: false,
        reasoning: { effort: 'low' },
        max_output_tokens: 2000,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (res.ok) return extractResponsesText(await res.json());

    const err = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    lastErr = ((err.error as Record<string, unknown> | undefined)?.message as string) ?? `HTTP ${res.status}`;
    // Only retry transient failures (gateway timeout / overloaded).
    const transient = res.status >= 500 || /too long|timeout|overloaded|unavailable/i.test(lastErr);
    if (!transient) break;
  }
  throw new Error(`MaxPlus: ${lastErr}`);
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

  // POST /api/ai/generate-product-specs — research a product's real spec sheet.
  // Uses MaxPlus (web-search-grounded) so the model actually looks up the exact
  // model on manufacturer + Thai retailer pages. Returns a JSON array of
  // [label, value] pairs using category-specific fields. Also scrapes JIB as
  // an extra hint the model can cross-check.
  app.post('/api/ai/generate-product-specs', { preHandler: requireAuth() }, async (req, reply) => {
    if (!process.env.MAXPLUS_API_KEY) {
      return reply.code(503).send({ error: 'ยังไม่ได้ตั้งค่า MAXPLUS_API_KEY ใน server/.env' });
    }
    const b = (req.body ?? {}) as { name?: string; model?: string; category?: string };
    const name = b.name?.trim() || '';
    const model = b.model?.trim() || '';
    if (!name && !model) return reply.code(400).send({ error: 'กรุณาระบุชื่อสินค้าหรือรุ่น' });

    const CATEGORY_FIELDS: Record<string, string[]> = {
      // GPU — rich spec sheet matching a retailer table (POWER COLOR / GIGABYTE style).
      gpu:        ['Brand', 'GPU Series', 'GPU Model', 'Memory Size', 'Bus Standard', 'CUDA Cores / Stream Processors', 'Boost Clock', 'Memory Clock', 'Max Digital Resolution', 'HDMI Port', 'Display Port', 'Power Connector', 'Power Requirement'],
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

    const instructions = `You are a computer hardware specification researcher with web search.
ALWAYS search the web first — check the manufacturer's official product page and Thai retailers (JIB, Advice, Banana IT, Nyit) to find the exact specs for the SPECIFIC product model requested.
Only report values you can verify from search results. NEVER invent or guess a value — omit a field instead.
For the core-count field, use the correct term for the brand: "CUDA Cores" for NVIDIA, "Stream Processors" for AMD Radeon.`;

    const userText = `Product: "${name}"${model ? ` — model "${model}"` : ''}${b.category ? ` (category: ${b.category})` : ''}.
Research this exact product and return ONLY a JSON object (no markdown, no commentary) with a "specs" array of [label, value] pairs, using these fields. Omit any field you cannot verify:
{
  "specs": [
${fieldList}
  ]
}`;

    try {
      const raw = await callMaxPlusResearch(instructions, userText);
      const data = parseJson(raw);
      const specs = data?.specs;
      if (!Array.isArray(specs) || !specs.length) {
        return reply.code(502).send({ error: 'AI ไม่สามารถสร้างสเปกได้ (ลองใหม่อีกครั้ง)' });
      }
      return { specs };
    } catch (err) {
      return reply.code(502).send({ error: (err as Error).message || 'สร้างสเปกไม่สำเร็จ' });
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

  // POST /api/ai/generate-product-image — create a promotional ad image using
  // gpt-image-1. Pulls product data from DB, builds a category-specific prompt
  // matching the N.Y. ITSHOP house style, saves the result to uploads/ai-images/,
  // and returns the URL. Requires OPENAI_API_KEY in server/.env.
  app.post('/api/ai/generate-product-image', { preHandler: requireAuth() }, async (req, reply) => {
    if (!AI_IMAGE_GEN_ENABLED) return reply.code(503).send(FEATURE_DISABLED);
    if (!process.env.IMAGE_API_KEY && !process.env.OPENAI_API_KEY) {
      return reply.code(503).send({ error: 'ยังไม่ได้ตั้งค่า IMAGE_API_KEY ใน server/.env' });
    }

    const b = (req.body ?? {}) as { productId?: number; serialId?: number };
    let name = '', model = '', categorySlug = '', price = 0, productId = 0;

    if (b.serialId) {
      const { rows } = await query(
        `select ps.price, p.id as product_id, p.name, p.model, c.slug as category_slug
           from product_serials ps
           join products p on p.id = ps.product_id
           left join categories c on c.id = p.category_id
          where ps.id = $1`,
        [b.serialId],
      );
      if (!rows[0]) return reply.code(404).send({ error: 'ไม่พบหน่วยสินค้านี้' });
      const r = rows[0] as Record<string, unknown>;
      name = r.name as string;
      model = (r.model as string) ?? '';
      categorySlug = (r.category_slug as string) ?? '';
      price = num(r.price);
      productId = num(r.product_id);
    } else if (b.productId) {
      const [c] = await fetchComponents([b.productId]);
      if (!c) return reply.code(404).send({ error: 'ไม่พบสินค้านี้' });
      name = c.name;
      model = c.model ?? '';
      categorySlug = c.category_slug ?? '';
      price = c.price;
      productId = b.productId;
    } else {
      return reply.code(400).send({ error: 'กรุณาเลือกสินค้า' });
    }

    const prompt = buildImagePrompt({ name, model, categorySlug, price });

    try {
      const imgApiKey = process.env.IMAGE_API_KEY ?? process.env.OPENAI_API_KEY ?? '';
      const imgBaseUrl = (process.env.IMAGE_API_BASE_URL ?? 'https://api.openai.com').replace(/\/+$/, '');
      const imgModel = process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-2';

      const oaRes = await fetch(`${imgBaseUrl}/v1/images/generations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${imgApiKey}`,
        },
        body: JSON.stringify({
          model: imgModel,
          prompt,
          n: 1,
          size: '1024x1024',
          quality: 'high',
        }),
        signal: AbortSignal.timeout(120_000),
      });

      // Parse once: a MaxPlus failure can arrive inside a 200 body (see imageApiError).
      const oaData = (await oaRes.json().catch(() => ({}))) as
        Record<string, unknown> & { data?: Array<{ b64_json?: string; url?: string }> };
      const apiErr = imageApiError(oaRes.status, oaData);
      if (apiErr) return reply.code(502).send({ error: apiErr });

      const item = oaData.data?.[0];
      if (!item) return reply.code(502).send({ error: 'AI ไม่สร้างรูปภาพ' });

      // Save to disk and return a /uploads URL.
      await mkdir(AI_IMAGE_DIR, { recursive: true });
      const filename = `ai-${Date.now()}-${randomBytes(4).toString('hex')}.png`;
      const dest = join(AI_IMAGE_DIR, filename);

      if (item.b64_json) {
        await writeFile(dest, Buffer.from(item.b64_json, 'base64'));
      } else if (item.url) {
        const imgRes = await fetch(item.url, { signal: AbortSignal.timeout(30_000) });
        const buf = Buffer.from(await imgRes.arrayBuffer());
        await writeFile(dest, buf);
      } else {
        return reply.code(502).send({ error: 'ไม่ได้รับข้อมูลรูปภาพจาก AI' });
      }

      try {
        await query(
          'insert into ai_images (product_id, url, prompt) values ($1, $2, $3)',
          [productId, `/uploads/ai-images/${filename}`, prompt],
        );
      } catch (e) {
        app.log.error(e); // library record is best-effort; the file still exists
      }

      return { imageUrl: `/uploads/ai-images/${filename}`, prompt };
    } catch (err) {
      app.log.error(err);
      return reply.code(502).send({ error: friendlyImageError(err) });
    }
  });

  // GET /api/ai/images?productId=X — stored AI images for a product, newest first.
  app.get('/api/ai/images', { preHandler: requireAuth() }, async (req, reply) => {
    if (!AI_IMAGE_GEN_ENABLED) return reply.code(503).send(FEATURE_DISABLED);
    const productId = Number((req.query as { productId?: string }).productId);
    if (!Number.isInteger(productId) || productId <= 0) {
      return reply.code(400).send({ error: 'productId ไม่ถูกต้อง' });
    }
    const { rows } = await query(
      'select id, url, prompt, created_at from ai_images where product_id = $1 order by created_at desc, id desc',
      [productId],
    );
    return rows;
  });

  // DELETE /api/ai/images/:id — remove one image from the library and its file.
  app.delete('/api/ai/images/:id', { preHandler: requireAuth() }, async (req, reply) => {
    if (!AI_IMAGE_GEN_ENABLED) return reply.code(503).send(FEATURE_DISABLED);
    const id = Number((req.params as { id?: string }).id);
    if (!Number.isInteger(id) || id <= 0) {
      return reply.code(400).send({ error: 'id ไม่ถูกต้อง' });
    }
    const { rows } = await query<{ url: string }>(
      'delete from ai_images where id = $1 returning url',
      [id],
    );
    if (!rows[0]) return reply.code(404).send({ error: 'ไม่พบรูปนี้' });
    const filename = rows[0].url.split('/').pop();
    if (filename) {
      await unlink(join(AI_IMAGE_DIR, filename)).catch(() => {}); // best-effort
    }
    return { ok: true };
  });

  // POST /api/ai/generate-bundle-poster — render a promo spec-sheet poster for a
  // saved bundle. Template holds all text/specs/price from the DB; AI supplies
  // only the PC photo. Returns the poster URL; the client adds it to the bundle
  // gallery and saves the bundle to persist it.
  app.post('/api/ai/generate-bundle-poster', { preHandler: requireAuth() }, async (req, reply) => {
    if (!AI_IMAGE_GEN_ENABLED) return reply.code(503).send(FEATURE_DISABLED);
    if (!process.env.IMAGE_API_KEY && !process.env.OPENAI_API_KEY) {
      return reply.code(503).send({ error: 'ยังไม่ได้ตั้งค่า IMAGE_API_KEY ใน server/.env' });
    }
    const b = (req.body ?? {}) as { bundleId?: number; price?: number; priceNote?: string; subtitle?: string };
    if (!b.bundleId) return reply.code(400).send({ error: 'กรุณาบันทึกชุดสินค้าก่อนสร้างโปสเตอร์' });

    // Bundle exists?
    const { rows: bundleRows } = await query<{ discount_pct: number }>(
      'select discount_pct from bundles where id = $1',
      [b.bundleId],
    );
    if (!bundleRows[0]) return reply.code(404).send({ error: 'ไม่พบชุดสินค้านี้' });

    // Components → spec rows, ordered cpu→mb→ram→ssd→psu→gpu→other.
    const { rows: comps } = await query<{ name: string; model: string | null; slug: string | null; price: number }>(
      `select p.name, p.model, c.slug,
              coalesce(min(s.price) filter (where s.status = 'in_stock'), 0) as price
         from bundle_items bi
         join products p on p.id = bi.product_id
         left join categories c on c.id = p.category_id
         left join product_serials s on s.product_id = p.id
        where bi.bundle_id = $1
        group by p.id, p.name, p.model, c.slug
        order by p.name`,
      [b.bundleId],
    );
    if (!comps.length) return reply.code(400).send({ error: 'ชุดนี้ยังไม่มีสินค้า' });

    const CAT_LABEL: Record<string, string> = {
      cpu: 'CPU', mb: 'MAINBOARD', ram: 'RAM', ssd: 'STORAGE', psu: 'POWER SUPPLY', gpu: 'GPU', monitor: 'MONITOR',
    };
    const ORDER = ['cpu', 'mb', 'ram', 'ssd', 'psu', 'gpu'];
    const rank = (slug: string | null) => {
      const i = ORDER.indexOf(slug ?? '');
      return i === -1 ? ORDER.length : i;
    };
    const specs: PosterSpecRow[] = comps
      .slice()
      .sort((a, z) => rank(a.slug) - rank(z.slug))
      .map((c) => ({
        slug: c.slug ?? 'default',
        label: CAT_LABEL[c.slug ?? ''] ?? 'อุปกรณ์',
        text: [c.name, c.model].filter(Boolean).join(' ').toUpperCase(),
      }));

    // Price: caller value wins, else sum(component prices) * (1 - discount%).
    const sum = comps.reduce((s, c) => s + Number(c.price || 0), 0);
    const computed = Math.round(sum * (1 - (Number(bundleRows[0].discount_pct) || 0) / 100));
    const price = typeof b.price === 'number' && b.price > 0 ? b.price : computed;

    // Shop settings for the footer (fall back to store defaults when blank).
    const { rows: sRows } = await query<Record<string, string | null>>('select * from shop_settings where id = 1');
    const s = sRows[0] ?? {};
    const phone = s.post_phone || s.phone || '081-961-3869';
    const website = s.post_website || 'ny-itshop.com';
    const facebook = s.post_page_url || 'N.Y. ITSHOP';
    const warranty = s.post_warranty || '30 วัน';

    try {
      const photoPrompt = `A photorealistic studio product photo of a complete assembled desktop gaming PC tower with the side glass panel showing RGB fans and components, on a dark reflective surface, dramatic rim lighting, clean professional advertising photography. No text, no logos, no watermark, no captions. Centered subject, dark studio background.`;
      const photoBuf = await requestAiImageBuffer(photoPrompt);
      const photoDataUri = `data:${sniffImageMime(photoBuf)};base64,${photoBuf.toString('base64')}`;

      const html = buildBundlePosterHtml({
        subtitle: b.subtitle?.trim() || 'แรง ลื่น ครบ จบในเครื่องเดียว',
        price,
        priceNote: b.priceNote?.trim() || 'ราคานี้ยังไม่รวมการ์ดจอ',
        specs,
        photoDataUri,
        phone, website, facebook, warranty,
      });

      const png = await renderHtmlToPng(html, { width: 1200, height: 1200 });
      await mkdir(AI_IMAGE_DIR, { recursive: true });
      const filename = `ai-${Date.now()}-${randomBytes(4).toString('hex')}.png`;
      await writeFile(join(AI_IMAGE_DIR, filename), png);
      return { imageUrl: `/uploads/ai-images/${filename}` };
    } catch (err) {
      app.log.error(err);
      return reply.code(502).send({ error: friendlyImageError(err) });
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

// ---------- image generation ----------
interface CategoryTheme {
  color: string;
  atmosphere: string;
  productType: string;
  typeLabel: string;
}

const CATEGORY_IMAGE_THEME: Record<string, CategoryTheme> = {
  monitor:    { color: 'neon green', atmosphere: 'bright green neon laser beams and green fog emanating from both sides, dark gaming room floor with green reflections', productType: 'gaming monitor with ultra-thin bezels on a sleek adjustable stand', typeLabel: 'GAMING MONITOR' },
  gpu:        { color: 'purple and violet', atmosphere: 'purple and violet neon light beams and glowing mist, dark tech atmosphere with subtle circuit-board patterns on the floor', productType: 'graphics card with cooling fans and RGB lighting', typeLabel: 'GRAPHICS CARD' },
  cpu:        { color: 'electric blue and cyan', atmosphere: 'blue neon light rays and cyan digital data-stream particle effects, glowing circuit traces on dark floor', productType: 'CPU processor chip with metallic heat spreader', typeLabel: 'PROCESSOR' },
  ram:        { color: 'blue and cyan', atmosphere: 'blue and cyan RGB light glow and particle bokeh effects', productType: 'RAM memory module sticks with RGB lighting', typeLabel: 'GAMING RAM' },
  ssd:        { color: 'blue and teal', atmosphere: 'cool blue data-stream light effects and teal particles', productType: 'M.2 NVMe SSD storage card', typeLabel: 'NVMe SSD' },
  mb:         { color: 'blue and green', atmosphere: 'blue-green circuit-board glow and trace lighting patterns', productType: 'computer motherboard PCB with slots and heatsinks', typeLabel: 'MOTHERBOARD' },
  psu:        { color: 'orange and gold', atmosphere: 'warm amber and gold power glow with energy rays', productType: 'modular power supply unit', typeLabel: 'POWER SUPPLY' },
  cooler:     { color: 'ice blue and white', atmosphere: 'cold mist, ice crystals, and ice-blue light rays', productType: 'CPU cooler with large fans and heatsink fins', typeLabel: 'CPU COOLER' },
  case:       { color: 'white and silver', atmosphere: 'clean bright studio lighting with soft shadows', productType: 'ATX computer case with tempered glass side panel', typeLabel: 'PC CASE' },
  peripheral: { color: 'RGB rainbow', atmosphere: 'colorful RGB rainbow glow with multi-color light rays', productType: 'gaming peripheral accessory', typeLabel: 'GAMING PERIPHERAL' },
};

const DEFAULT_THEME: CategoryTheme = {
  color: 'blue and white',
  atmosphere: 'dramatic blue neon light rays and tech glow',
  productType: 'computer hardware component',
  typeLabel: 'COMPUTER HARDWARE',
};

// ---------- image API response handling ----------
// MaxPlus answers /v1/images/generations with HTTP 200 headers *immediately*,
// then holds the connection open padding the body with spaces while the picture
// renders, and only writes the real JSON at the very end. A failure therefore
// arrives as an `error` object inside a 200 body, so `res.ok` alone cannot tell
// success from failure. Always parse the payload and inspect it.
// (Verified 2026-08-12 against api.maxplus-ai.cc.)
function imageApiError(status: number, data: Record<string, unknown>): string | null {
  const err = data.error as Record<string, unknown> | undefined;
  if (err) {
    const msg = (err.message as string) || String(err.type ?? 'unknown error');
    return /timeout|took too long/i.test(msg)
      ? 'ระบบสร้างรูปภาพ AI ใช้เวลานานเกินไปจนหมดเวลา (ฝั่งผู้ให้บริการ) กรุณาลองใหม่ภายหลัง'
      : `Image API: ${msg}`;
  }
  if (status < 200 || status >= 300) return `Image API: HTTP ${status}`;
  return null;
}

// Node's AbortSignal.timeout rejects with a bare English "The operation was
// aborted due to timeout", which is what the shop owner used to see in a toast.
// Turn any abort/timeout into the same Thai wording the API's own timeout uses.
function friendlyImageError(err: unknown): string {
  const e = err as { name?: string; message?: string };
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError' || /aborted|timeout/i.test(e?.message ?? '')) {
    return 'ระบบสร้างรูปภาพ AI ใช้เวลานานเกินไปจนหมดเวลา (ฝั่งผู้ให้บริการ) กรุณาลองใหม่ภายหลัง';
  }
  return e?.message || 'สร้างรูปภาพไม่สำเร็จ';
}

// Sniff image MIME type from magic bytes to build a correct data URI.
function sniffImageMime(buf: Buffer): string {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 4 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return 'image/webp';
  return 'image/png';
}

// Call the configured image API and return the PNG bytes (used by the bundle
// poster to embed the AI photo as a data URI). Mirrors the product-image call.
async function requestAiImageBuffer(prompt: string): Promise<Buffer> {
  const imgApiKey = process.env.IMAGE_API_KEY ?? process.env.OPENAI_API_KEY ?? '';
  const imgBaseUrl = (process.env.IMAGE_API_BASE_URL ?? 'https://api.openai.com').replace(/\/+$/, '');
  const imgModel = process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-2';
  const res = await fetch(`${imgBaseUrl}/v1/images/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${imgApiKey}` },
    body: JSON.stringify({ model: imgModel, prompt, n: 1, size: '1024x1024', quality: 'high' }),
    signal: AbortSignal.timeout(120_000),
  });
  // Parse once: a MaxPlus failure can arrive inside a 200 body (see imageApiError).
  const data = (await res.json().catch(() => ({}))) as
    Record<string, unknown> & { data?: Array<{ b64_json?: string; url?: string }> };
  const apiErr = imageApiError(res.status, data);
  if (apiErr) throw new Error(apiErr);
  const item = data.data?.[0];
  if (item?.b64_json) return Buffer.from(item.b64_json, 'base64');
  if (item?.url) {
    const r = await fetch(item.url, { signal: AbortSignal.timeout(30_000) });
    return Buffer.from(await r.arrayBuffer());
  }
  throw new Error('AI ไม่สร้างรูปภาพ');
}

function buildImagePrompt(p: { name: string; model: string; categorySlug: string; price: number }): string {
  const theme = CATEGORY_IMAGE_THEME[p.categorySlug] ?? DEFAULT_THEME;
  const brand = p.name.toUpperCase();
  const model = p.model.toUpperCase();
  const priceStr = Math.round(p.price).toLocaleString('en-US');
  const hasPrice = p.price > 0;

  return `A professional square (1:1) product advertisement image for a Thai IT shop.

EXACT VISUAL LAYOUT:
- Background: Pure black background filled with ${theme.atmosphere}. The dark reflective floor subtly mirrors the product and colored light.
- Top-left corner: A small dark rectangular logo badge. Inside: "N.Y." in large bold white text on the top line, "ITSHOP" in smaller bold white text directly below. The badge has a thin ${theme.color} glowing border.
- Top-right text area: "${brand}" in bold white text (medium size), directly below it "${model}" in very large bold white or ${theme.color} text. Both are prominent readable headlines with no blur.
- Below the model name: "${theme.typeLabel}" in smaller ${theme.color} text, serving as a product-category label.
- Center of image: A photorealistic, high-detail product photo of ${theme.productType} named "${p.name} ${p.model}". The product floats slightly above the reflective floor and is dramatically lit from below and from the sides with ${theme.color} light, creating an epic hero-shot appearance.
${hasPrice ? `- Bottom-right corner: A dark rectangular price tag badge with "${priceStr}.-" in large bold white numbers. The badge has a ${theme.color} glowing border.` : ''}

Overall style: Ultra-high-quality professional gaming hardware advertisement. Cinematic dramatic product photography. Similar to Samsung Odyssey gaming monitor or Intel CPU promotional marketing images. The text must be perfectly legible with no typos.`;
}
