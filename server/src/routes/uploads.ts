import type { FastifyInstance } from 'fastify';
import { createWriteStream } from 'node:fs';
import { mkdir, unlink } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { requireAuth } from '../auth';

/** Where uploaded product images live on disk (server/uploads). */
export const UPLOAD_DIR = fileURLToPath(new URL('../../uploads', import.meta.url));

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export async function uploadRoutes(app: FastifyInstance) {
  await mkdir(UPLOAD_DIR, { recursive: true });

  // Single image upload (multipart/form-data, field "file"). Returns { url }.
  app.post('/api/upload', { preHandler: requireAuth() }, async (req, reply) => {
    const data = await req.file().catch(() => null);
    if (!data) return reply.code(400).send({ error: 'ไม่พบไฟล์รูปภาพ' });

    const ext = EXT[data.mimetype];
    if (!ext) return reply.code(415).send({ error: 'รองรับเฉพาะรูปภาพ (JPG, PNG, WEBP, GIF)' });

    const name = `${Date.now()}-${randomBytes(6).toString('hex')}.${ext}`;
    const dest = join(UPLOAD_DIR, name);
    await pipeline(data.file, createWriteStream(dest));

    // @fastify/multipart flags this when the file exceeds the size limit.
    if (data.file.truncated) {
      await unlink(dest).catch(() => {});
      return reply.code(413).send({ error: 'ไฟล์ใหญ่เกินไป (สูงสุด 4MB)' });
    }

    return reply.code(201).send({ url: `/uploads/${name}` });
  });
}
