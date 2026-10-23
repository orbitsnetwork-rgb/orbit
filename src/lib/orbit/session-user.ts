/**
 * Лише сервер (імпортується динамічно з обробників owner.ts): хто за цим ключем сесії.
 * Той самий шлях перевірки, що й whoIs у live.ts: кеш світу + verifyKey з лімітом спроб за IP.
 */
type Sql = import("@/lib/db").Sql;
const g = globalThis as { __orbitWorldCache__?: ReturnType<typeof import("@/lib/orbit/world-cache").makeWorldCache<import("@/lib/orbit/access").Bag>> };

export async function sessionUser(sql: Sql, raw: unknown): Promise<{ id: string } | null> {
  const body = (raw ?? {}) as { sessionId?: unknown; sessionKey?: unknown };
  const id = typeof body.sessionId === "string" && body.sessionId.startsWith("u-") ? body.sessionId.slice(0, 64) : null;
  const key = typeof body.sessionKey === "string" ? body.sessionKey.slice(0, 200) : null;
  if (!id || !key) return null;
  const dev = await import("@/lib/orbit/device");
  const { unpackDoc } = await import("@/lib/orbit/access");
  const { makeWorldCache } = await import("@/lib/orbit/world-cache");
  const K = await import("@/lib/orbit/key-hash");
  const rawIp = await (await import("@/lib/orbit/client-ip")).requestIp();
  g.__orbitWorldCache__ ??= makeWorldCache(unpackDoc);
  const bag = await g.__orbitWorldCache__.get((text, params) => sql.query(text, params));
  if (!bag) return null;
  if (!K.verifyKey(bag.keys, id, key, `v:${dev.ipTag(rawIp.split(",")[0].trim())}`)) return null;
  return bag.world.accounts.some((a) => a.id === id) ? { id } : null;
}
