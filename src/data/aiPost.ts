// AI sales-post data layer. The backend pulls the real item data, calls Gemini
// for the creative parts, and returns a fully-assembled Thai post string.
import { http } from '../lib/api';

export interface SinglePostInput {
  mode: 'single';
  productId: number;
  /** Optional specific unit; its price/warranty are used when given. */
  serialId?: number;
}

export interface SetupPostInput {
  mode: 'setup';
  /** A saved bundle, OR... */
  bundleId?: number;
  /** ...an ad-hoc list of product ids. */
  productIds?: number[];
  /** When the setup has no GPU, append a "เพิ่มการ์ดจอได้" upgrade list. */
  includeGpuAddons?: boolean;
  /** Limit the add-on list to these GPU product ids (default: all in stock). */
  gpuAddonProductIds?: number[];
}

export type GeneratePostInput = SinglePostInput | SetupPostInput;

export async function generatePost(input: GeneratePostInput): Promise<string> {
  const { post } = await http.post<{ post: string }>('/api/ai/generate-post', input);
  return formatPost(post);
}

export async function postToFacebook(text: string): Promise<{ postId: string; postUrl: string | null }> {
  return http.post<{ postId: string; postUrl: string | null }>('/api/ai/post-to-facebook', { text });
}

export async function generateProductDescription(
  name: string,
  model: string,
  category?: string,
): Promise<string> {
  const { description } = await http.post<{ description: string }>(
    '/api/ai/generate-product-description',
    { name, model, category },
  );
  return description;
}

export async function generateProductSpecs(
  name: string,
  model: string,
  category?: string,
): Promise<{ specs: [string, string][]; jib_source?: { title: string; url: string } }> {
  return http.post<{ specs: [string, string][]; jib_source?: { title: string; url: string } }>(
    '/api/ai/generate-product-specs',
    { name, model, category },
  );
}

export async function generateProductImage(
  productId: number,
  serialId?: number,
): Promise<{ imageUrl: string; prompt: string }> {
  return http.post<{ imageUrl: string; prompt: string }>(
    '/api/ai/generate-product-image',
    { productId, serialId },
  );
}

export function generateBundlePoster(
  bundleId: number,
  opts: { price?: number; priceNote?: string; subtitle?: string } = {},
): Promise<{ imageUrl: string }> {
  return http.post<{ imageUrl: string }>('/api/ai/generate-bundle-poster', { bundleId, ...opts });
}

export interface AiImage {
  id: number;
  url: string;
  prompt: string | null;
  created_at: string;
}

// Stored AI images for a product, newest first (see POST generate-product-image).
export function listProductAiImages(productId: number): Promise<AiImage[]> {
  return http.get<AiImage[]>(`/api/ai/images?productId=${productId}`);
}

export function deleteAiImage(id: number): Promise<void> {
  return http.del(`/api/ai/images/${id}`);
}

// Tidy a post for display/copy: normalise escaped newlines and collapse runs of
// blank lines. (Ported from the standalone generator's lib/formatPost.)
export function formatPost(text: string): string {
  if (!text) return '';
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '')
    .replace(/\\t/g, '  ')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}
