/**
 * The order a PC's parts are listed in, by category slug (the shop's poster
 * order): CPU, cooler, board, RAM, storage, VGA, PSU, case, monitor. Anything
 * else comes after. The default part order for bundles until the owner sets
 * their own in ตั้งค่าระบบ; also used by schema.sql to number existing bundles.
 */
export const BUILD_ORDER = ['cpu', 'cpu-cooler', 'mb', 'ram', 'ssd', 'gpu', 'psu', 'case', 'monitor'];

/** Position of a category slug in BUILD_ORDER (unknown/none → last). */
export function buildRank(slug: string | null | undefined): number {
  const i = BUILD_ORDER.indexOf(slug ?? '');
  return i === -1 ? BUILD_ORDER.length : i;
}

export interface OrderedCategory { id: number; name: string; slug: string; }

/**
 * Every category in bundle-part order: the owner's saved ids first (unknown ids
 * dropped), then any category not in the list, in PC-build order then by name.
 */
export function orderCategories(categories: OrderedCategory[], savedIds: unknown): OrderedCategory[] {
  const byId = new Map(categories.map((c) => [Number(c.id), c]));
  const out: OrderedCategory[] = [];
  const seen = new Set<number>();
  for (const raw of Array.isArray(savedIds) ? savedIds : []) {
    const c = byId.get(Number(raw));
    if (c && !seen.has(Number(c.id))) { seen.add(Number(c.id)); out.push(c); }
  }
  const rest = categories
    .filter((c) => !seen.has(Number(c.id)))
    .sort((a, z) => buildRank(a.slug) - buildRank(z.slug) || a.name.localeCompare(z.name, 'th'));
  return [...out, ...rest].map((c) => ({ id: Number(c.id), name: c.name, slug: c.slug }));
}

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };

/** Category ids in the current bundle-part order (owner's setting, else PC-build order). */
export async function partOrderIds(db: Queryable): Promise<number[]> {
  const { rows: cats } = await db.query('select id, name, slug from categories');
  const { rows } = await db.query('select bundle_part_order from shop_settings where id = 1');
  return orderCategories(cats as OrderedCategory[], rows[0]?.bundle_part_order).map((c) => c.id);
}

/**
 * Renumber the parts of every bundle that follows the settings order (or just
 * `bundleId`, if it does) by that order, then name. Hand-arranged bundles
 * (custom_order = true) are left alone.
 */
export async function resortFollowingBundles(db: Queryable, bundleId: number | string | null = null): Promise<void> {
  const order = await partOrderIds(db);
  await db.query(
    `with ord as (
       select value::bigint as category_id, ordinality as pos
         from jsonb_array_elements_text($1::jsonb) with ordinality
     ), r as (
       select bi.bundle_id, bi.product_id,
              row_number() over (partition by bi.bundle_id order by coalesce(ord.pos, 1000000), p.name) - 1 as rn
         from bundle_items bi
         join bundles b on b.id = bi.bundle_id and not b.custom_order
         join products p on p.id = bi.product_id
         left join ord on ord.category_id = p.category_id
        where $2::bigint is null or bi.bundle_id = $2::bigint
     )
     update bundle_items bi set sort = r.rn
       from r
      where bi.bundle_id = r.bundle_id and bi.product_id = r.product_id`,
    [JSON.stringify(order), bundleId],
  );
}
