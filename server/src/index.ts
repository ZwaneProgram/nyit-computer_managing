import 'dotenv/config';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { authRoutes } from './auth';
import { productRoutes } from './routes/products';

const app = Fastify({ logger: true });

await app.register(cookie, { secret: process.env.COOKIE_SECRET || 'dev-cookie-secret' });

app.get('/api/health', async () => ({ ok: true, service: 'nyit-shop-server' }));

await app.register(authRoutes);
await app.register(productRoutes);

const port = Number(process.env.PORT || 3000);
app
  .listen({ port, host: '0.0.0.0' })
  .then(() => app.log.info(`Nyit API listening on :${port}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
