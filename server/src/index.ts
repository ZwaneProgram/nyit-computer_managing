import 'dotenv/config';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { mkdirSync } from 'node:fs';
import { authRoutes } from './auth';
import { categoryRoutes } from './routes/categories';
import { productRoutes } from './routes/products';
import { bundleRoutes } from './routes/bundles';
import { uploadRoutes, UPLOAD_DIR } from './routes/uploads';

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
await app.register(uploadRoutes);

const port = Number(process.env.PORT || 3000);
app
  .listen({ port, host: '0.0.0.0' })
  .then(() => app.log.info(`Nyit API listening on :${port}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
