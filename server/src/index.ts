import 'dotenv/config';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { authRoutes } from './auth';
import { categoryRoutes } from './routes/categories';
import { productRoutes } from './routes/products';
import { bundleRoutes } from './routes/bundles';
import { saleRoutes } from './routes/sales';
import { statsRoutes } from './routes/stats';
import { uploadRoutes, UPLOAD_DIR } from './routes/uploads';
import { userRoutes } from './routes/users';
import { settingsRoutes } from './routes/settings';

const app = Fastify({ logger: true });

await app.register(cookie, { secret: process.env.COOKIE_SECRET || 'dev-cookie-secret' });
await app.register(multipart, { limits: { fileSize: 4 * 1024 * 1024, files: 1 } });

// Serve uploaded product images at /uploads/* (Caddy can serve these in prod too).
mkdirSync(UPLOAD_DIR, { recursive: true });
await app.register(fastifyStatic, { root: UPLOAD_DIR, prefix: '/uploads/' });

app.get('/api/health', async () => ({ ok: true, service: 'nyit-shop-server' }));

await app.register(authRoutes);
await app.register(categoryRoutes);
await app.register(productRoutes);
await app.register(bundleRoutes);
await app.register(saleRoutes);
await app.register(statsRoutes);
await app.register(uploadRoutes);
await app.register(userRoutes);
await app.register(settingsRoutes);

// In production, serve the built frontend (dist/) from this same server, so the
// whole app runs on a single port (no separate web server needed). In dev there
// is no dist/ — Vite serves the frontend and proxies /api here — so this is
// skipped. Override the location with FRONTEND_DIST if needed.
const DIST_DIR =
  process.env.FRONTEND_DIST || join(dirname(fileURLToPath(import.meta.url)), '../../dist');
if (existsSync(join(DIST_DIR, 'index.html'))) {
  await app.register(fastifyStatic, { root: DIST_DIR, prefix: '/', decorateReply: false });
  // SPA fallback: any non-API GET that isn't a real asset returns index.html.
  app.setNotFoundHandler((req, reply) => {
    if (req.method === 'GET' && !req.url.startsWith('/api') && !req.url.startsWith('/uploads')) {
      return reply.sendFile('index.html', DIST_DIR);
    }
    return reply.code(404).send({ error: 'not found' });
  });
  app.log.info(`Serving frontend from ${DIST_DIR}`);
}

const port = Number(process.env.PORT || 3000);
app
  .listen({ port, host: '0.0.0.0' })
  .then(() => app.log.info(`Nyit API listening on :${port}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
