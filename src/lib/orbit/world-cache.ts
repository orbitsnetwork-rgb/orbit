/**
 * Легкий кеш розпакованого документа світу для частих запитів (чат, довге опитування).
 * Безпечність: перед кожним використанням читаємо лише версію рядка (updated_at, без doc).
 * Будь-який запис світу (orbitAct, Stripe, reconcile…) оновлює updated_at = now(), тож старий кеш
 * ніколи не використовується після зміни: ключі, акаунти й склад запусків завжди актуальні.
 * Кеш — у пам'яті одного процесу; інші процеси перевіряють ту саму версію в базі.
 */
type Query = <T>(text: string, params: unknown[]) => Promise<T[]>;
export type CacheStats = { hits: number; misses: number };

export function makeWorldCache<B>(unpack: (doc: unknown) => B) {
  let held: { v: string; bag: B } | null = null;
  const stats: CacheStats = { hits: 0, misses: 0 };
  async function get(query: Query): Promise<B | null> {
    const head = await query<{ v: string }>(`select updated_at::text as v from orbit_world where id = 'world'`, []);
    if (!head[0]) { held = null; return null; }
    if (held && held.v === head[0].v) { stats.hits += 1; return held.bag; }
    // Версію беремо з того самого рядка, що й doc: якщо між запитами світ змінився, збережемо новішу пару.
    const rows = await query<{ doc: unknown; v: string }>(`select doc, updated_at::text as v from orbit_world where id = 'world'`, []);
    if (!rows[0]) { held = null; return null; }
    stats.misses += 1;
    const bag = unpack(rows[0].doc);
    held = { v: rows[0].v, bag };
    return bag;
  }
  return { get, stats, clear: () => { held = null; } };
}
