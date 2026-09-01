// Feature flags (backend).
//
// Mirrors `src/lib/features.ts` on the frontend — flip both together.
// See `FEATURE-FLAGS.md`.

/**
 * AI image generation endpoints:
 *   POST /api/ai/generate-product-image
 *   POST /api/ai/generate-bundle-poster
 *   GET  /api/ai/images
 *   DELETE /api/ai/images/:id
 *
 * false = the routes are still registered but reply 503; no AI provider is
 * called, so nothing can be billed. Routes/handlers are kept intact.
 */
export const AI_IMAGE_GEN_ENABLED = false;

/** Standard 503 body for a disabled feature. */
export const FEATURE_DISABLED = { error: 'feature disabled' };
