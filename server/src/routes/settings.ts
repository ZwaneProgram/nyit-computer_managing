import type { FastifyInstance } from 'fastify';
import { query } from '../db';
import { requireAuth, requireOwner } from '../auth';

// Shop settings are a singleton row (id = 1, created in schema.sql). Any
// logged-in user may read them (shop name etc. is shown around the app); only
// the owner may change them.
export async function settingsRoutes(app: FastifyInstance) {
  app.get('/api/settings', { preHandler: requireAuth() }, async () => {
    const { rows } = await query('select * from shop_settings where id = 1');
    return { settings: rows[0] };
  });

  app.put('/api/settings', { preHandler: requireOwner() }, async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const shop_name = String(b.shop_name ?? '').trim();
    if (!shop_name) return reply.code(400).send({ error: 'ต้องระบุชื่อร้าน' });
    const default_low = Math.max(0, Math.floor(Number(b.default_low ?? 0)) || 0);
    // AI sales-post footer fields — trimmed, empty becomes null.
    const t = (k: string) => (b[k] as string)?.trim() || null;

    const { rows } = await query(
      `update shop_settings set
         shop_name = $1, address = $2, tax_id = $3, phone = $4,
         default_low = $5, currency = $6,
         post_warranty = $7, post_shipping = $8, post_payment = $9,
         post_phone = $10, post_website = $11, post_page_url = $12,
         post_shopee_url = $13, post_hashtags = $14, post_extra = $15,
         fb_page_id = $16, fb_page_access_token = $17
       where id = 1
       returning *`,
      [
        shop_name,
        (b.address as string)?.trim() || null,
        (b.tax_id as string)?.trim() || null,
        (b.phone as string)?.trim() || null,
        default_low,
        String(b.currency ?? 'THB').trim() || 'THB',
        t('post_warranty'), t('post_shipping'), t('post_payment'),
        t('post_phone'), t('post_website'), t('post_page_url'),
        t('post_shopee_url'), t('post_hashtags'), t('post_extra'),
        t('fb_page_id'), t('fb_page_access_token'),
      ],
    );
    return { settings: rows[0] };
  });
}
