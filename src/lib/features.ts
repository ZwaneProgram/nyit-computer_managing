// Feature flags (frontend).
//
// One switch per feature. Flip the boolean, rebuild, done — no other file needs
// to change. The matching backend switch lives in `server/src/lib/features.ts`
// and must be flipped together. See `FEATURE-FLAGS.md`.

/**
 * AI image generation: the "🎨 สร้างรูปภาพ AI" button on the AI-post page, the
 * "🎨 สร้างโปสเตอร์ AI" bundle poster in Bundles, and the "✨ เลือกจากรูป AI"
 * library picker in ImageManager.
 *
 * false = every entry point is hidden (code kept intact, nothing deleted).
 */
export const AI_IMAGE_GEN_ENABLED = false;
