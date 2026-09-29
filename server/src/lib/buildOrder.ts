/**
 * The order a PC's parts are listed in, by category slug (the shop's poster
 * order): CPU, cooler, board, RAM, storage, VGA, PSU, case, monitor. Anything
 * else comes after, A–Z. Mirrors src/data/bundles.ts `BUILD_ORDER` and the
 * storefront's SQL in nyitfront/lib/products.ts.
 */
export const BUILD_ORDER = ['cpu', 'cpu-cooler', 'mb', 'ram', 'ssd', 'gpu', 'psu', 'case', 'monitor'];

/** Position of a category slug in BUILD_ORDER (unknown/none → last). */
export function buildRank(slug: string | null | undefined): number {
  const i = BUILD_ORDER.indexOf(slug ?? '');
  return i === -1 ? BUILD_ORDER.length : i;
}

/** SQL expression ranking a category-slug column by BUILD_ORDER (unknown/null → last). */
export const buildRankSql = (slugExpr: string) =>
  `coalesce(array_position(array[${BUILD_ORDER.map((s) => `'${s}'`).join(', ')}]::text[], ${slugExpr}), ${BUILD_ORDER.length + 1})`;
