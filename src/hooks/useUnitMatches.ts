import { useEffect, useState } from 'react';
import { searchUnits, type UnitMatch } from '../data/inventory';

/**
 * Debounced serial/SKU lookup. Given a search string, returns the in-stock
 * units whose serial or SKU matches (empty while the query is blank). Callers
 * derive matched product ids from `m.product_id` to surface those products in
 * their own (name/model) filters.
 */
export function useUnitMatches(query: string): UnitMatch[] {
  const [matches, setMatches] = useState<UnitMatch[]>([]);
  useEffect(() => {
    const q = query.trim();
    if (!q) { setMatches([]); return; }
    let alive = true;
    const id = window.setTimeout(() => {
      searchUnits(q)
        .then((u) => { if (alive) setMatches(u); })
        .catch(() => { if (alive) setMatches([]); });
    }, 250);
    return () => { alive = false; window.clearTimeout(id); };
  }, [query]);
  return matches;
}
