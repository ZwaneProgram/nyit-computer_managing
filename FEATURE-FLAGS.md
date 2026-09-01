# Feature flags

Small on/off switches for finished features we want **hidden but not deleted**.
No code is removed — flip a boolean, rebuild, and the feature is back exactly as
it was.

| Flag | Frontend | Backend |
|---|---|---|
| `AI_IMAGE_GEN_ENABLED` | `src/lib/features.ts` | `server/src/lib/features.ts` |

---

## `AI_IMAGE_GEN_ENABLED` — AI image generation

**Status: DISABLED (turned off 2026-09-01, by user request — re-enable later).**

### What it covers

| # | Where | What is hidden |
|---|---|---|
| 1 | AI-post page (`src/views/GeneratePostView.tsx`) | the `🎨 สร้างรูปภาพ AI` button + the "รูปภาพโฆษณา AI" result card |
| 2 | Bundles → edit a bundle (`src/views/BundlesView.tsx`) | the `🎨 สร้างโปสเตอร์ AI` button + its price/note/subtitle form |
| 3 | Image manager (`src/components/ImageManager.tsx`) | the `✨ เลือกจากรูป AI` button + the AI-image library picker |

Backend (`server/src/routes/ai.ts`) — these four routes reply **`503 {"error":"feature disabled"}`**
before doing any work, so **no AI provider is called and nothing can be billed**:

- `POST /api/ai/generate-product-image`
- `POST /api/ai/generate-bundle-poster`
- `GET /api/ai/images`
- `DELETE /api/ai/images/:id`

### What is NOT touched

Everything else stays live: the AI **sales post** generator (`สร้างโพสต์ขาย`),
AI product **description**, AI product **specs**, and Facebook posting. Normal
image **upload** (file + camera) in the image manager is untouched.

Nothing was deleted: route handlers, the `ai_images` table + its rows, files
already in `server/uploads/ai-images/`, `server/src/lib/bundlePosterTemplate.ts`
and `renderHtmlToPng.ts` are all intact.

---

## 🔛 How to turn it back ON

Two one-character edits (`false` → `true`), then rebuild:

```bash
# 1. frontend  — src/lib/features.ts
export const AI_IMAGE_GEN_ENABLED = true;

# 2. backend   — server/src/lib/features.ts
export const AI_IMAGE_GEN_ENABLED = true;
```

Local dev:

```bash
npm run build          # frontend
# backend: restart `cd server && npm run dev`
```

On the VPS (see `DEPLOY.md`):

```bash
cd /opt/nyit-app
git fetch origin && git reset --hard origin/main   # NEVER `git pull`
cd server && npm install && cd ..
npm run build
pm2 restart nyit-app
```

### Before re-enabling, check these still hold

- `IMAGE_API_KEY` (or `OPENAI_API_KEY`) is set in `server/.env`, and the key is
  bound to the **image** pool on MaxPlus — a text-pool key returns `409`.
- The MaxPlus image API can hide errors inside a **200** body; the route already
  handles that.
- The bundle poster needs a headless Chromium: `CHROMIUM_PATH` in `server/.env`.
- `AI_IMAGE_DIR` resolves to `server/uploads/ai-images/` (a past bug pointed it
  at the repo root and produced `{"error":"not found"}` on a paid image).

No migration or DB change is needed either way — the `ai_images` table stays.
