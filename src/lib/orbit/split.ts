/**
 * C1, крок 2 (читання): ті самі секції документа світу, зібрані з таблиць 0046 (люди, ключі, пристрої, запуски).
 * splitDoc повертає «сирий» документ, де секції замінено даними з таблиць; unpackDoc(splitDoc) ≡ unpackDoc(doc)
 * (property-тест split.test.ts). Поки джерело правди — doc; це основа для кроку 3 (прибрати секції з doc).
 */
type Query = <T>(text: string, params: unknown[]) => Promise<T[]>;
export type SplitDiff = { section: string; missing: number; extra: number; changed: number }[];

export async function splitDoc(query: Query, doc: Record<string, unknown>): Promise<Record<string, unknown>> {
  const [people, keys, seen, devices, creations] = await Promise.all([
    query<{ row: unknown }>(`select row from orbit_person order by ord, user_id`, []),
    query<{ user_id: string; hash: string }>(`select user_id, hash from orbit_key`, []),
    query<{ device: string; ids: unknown }>(`select device, ids from orbit_device_seen`, []),
    query<{ device: string; day: string; count: number }>(`select device, day, count from orbit_device_day`, []),
    query<{ row: unknown }>(`select row from orbit_creation order by ord, id`, []),
  ]);
  const world = (doc.world ?? {}) as Record<string, unknown>;
  return {
    ...doc,
    people: people.map((r) => r.row),
    keys: Object.fromEntries(keys.map((r) => [r.user_id, r.hash])),
    seen: Object.fromEntries(seen.map((r) => [r.device, r.ids])),
    devices: Object.fromEntries(devices.map((r) => [r.device, { day: r.day, count: Number(r.count) }])),
    world: { ...world, creations: creations.map((r) => r.row) },
  };
}

export async function splitDiff(query: Query): Promise<{ ok: boolean; rows: SplitDiff } | null> {
  try {
    const rows = (await query<{ section: string; missing: string | number; extra: string | number; changed: string | number }>(`select * from orbit_split_diff()`, [])).map((r) => ({
      section: r.section,
      missing: Number(r.missing),
      extra: Number(r.extra),
      changed: Number(r.changed),
    }));
    return { ok: rows.every((r) => r.missing === 0 && r.extra === 0 && r.changed === 0), rows };
  } catch {
    return null; // міграція 0046 ще не застосована
  }
}
