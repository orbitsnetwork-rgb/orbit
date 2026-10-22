/** Лише сервер: хто викликає — за ключем сесії (той самий шлях, що й orbitAct/чат), світ із легкого кешу. */
import type { World } from "@/lib/orbit/engine";

type Sql = import("@/lib/db").Sql;
const g = globalThis as { __orbitWorldCache__?: ReturnType<typeof import("@/lib/orbit/world-cache").makeWorldCache<import("@/lib/orbit/access").Bag>> };

export function readCreds(raw: unknown): { sessionId: string | null; sessionKey: string | null } {
  const v = (raw ?? {}) as { sessionId?: unknown; sessionKey?: unknown };
  return {
    sessionId: typeof v.sessionId === "string" && /^u-[a-z0-9-]{1,40}$/i.test(v.sessionId) ? v.sessionId : null,
    sessionKey: typeof v.sessionKey === "string" ? v.sessionKey.slice(0, 200) : null,
  };
}

export async function worldOf(sql: Sql): Promise<World | null> {
  const { unpackDoc } = await import("@/lib/orbit/access");
  const { makeWorldCache } = await import("@/lib/orbit/world-cache");
  g.__orbitWorldCache__ ??= makeWorldCache(unpackDoc);
  const bag = await g.__orbitWorldCache__.get((text, params) => sql.query(text, params));
  return bag?.world ?? null;
}

export async function whoAmI(sql: Sql, c: { sessionId: string | null; sessionKey: string | null }): Promise<{ id: string; world: World } | null> {
  if (!c.sessionId || !c.sessionKey) return null;
  const server = await import("@tanstack/react-start/server");
  const dev = await import("@/lib/orbit/device");
  const { unpackDoc } = await import("@/lib/orbit/access");
  const { makeWorldCache } = await import("@/lib/orbit/world-cache");
  const K = await import("@/lib/orbit/key-hash");
  const rawIp = server.getRequestHeader("x-nf-client-connection-ip") ?? server.getRequestIP({ xForwardedFor: true }) ?? "unknown";
  g.__orbitWorldCache__ ??= makeWorldCache(unpackDoc);
  const bag = await g.__orbitWorldCache__.get((text, params) => sql.query(text, params));
  if (!bag || !K.verifyKey(bag.keys, c.sessionId, c.sessionKey, `v:${dev.ipTag(rawIp.split(",")[0].trim())}`)) return null;
  return bag.world.accounts.some((a) => a.id === c.sessionId) ? { id: c.sessionId, world: bag.world } : null;
}

/** Таблиця з міграції: створити при першому зверненні (IF NOT EXISTS), як у чаті. */
export async function ensureSchema(sql: Sql, flag: { p?: Promise<void> }, schema: string) {
  flag.p ??= (async () => {
    for (const stmt of schema.replace(/--.*$/gm, "").split(";").map((s) => s.trim()).filter(Boolean)) await sql.query(stmt, []);
  })().catch((e) => {
    flag.p = undefined;
    throw e;
  });
  await flag.p;
}

const RATE = new Map<string, number[]>();
export function allowRate(key: string, max: number, windowMs = 60_000, now = Date.now()) {
  const hits = (RATE.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) return false;
  hits.push(now);
  RATE.set(key, hits);
  if (RATE.size > 10000) RATE.clear();
  return true;
}
