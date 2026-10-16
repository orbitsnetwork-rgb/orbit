/**
 * Особисті події, подяки й походження орбіт — в окремих append-only таблицях, не в документі світу
 * (аудит K1: документ виріс би втричі й уперся б у межу jsonb на ≈15,8 тис. акаунтах).
 * Лише сервер. Таблиці створюються міграцією 0031 і, про всяк випадок, тут при першому зверненні (IF NOT EXISTS).
 */
import type { Sql } from "@/lib/db";
import { EVENTS_PER_USER, type Days, type Ev, type Mine } from "@/lib/orbit/social";
// @ts-ignore — vite raw import
import schema from "../../../migrations/0031_orbit_social.sql?raw";

const g = globalThis as { __orbitSocialReady__?: Promise<void> };

export function ensureSocial(sql: Sql): Promise<void> {
  g.__orbitSocialReady__ ??= (async () => {
    for (const stmt of String(schema).replace(/--.*$/gm, "").split(";").map((s) => s.trim()).filter(Boolean)) await sql.query(stmt, []);
  })().catch((error) => {
    g.__orbitSocialReady__ = undefined;
    throw error;
  });
  return g.__orbitSocialReady__;
}

export async function insertEvents(sql: Sql, adds: [string, Ev][]) {
  if (!adds.length) return;
  // Старіші спершу, щоб id зростав у тому ж порядку, що й час.
  for (const [userId, ev] of adds) {
    const { t, at, ...data } = ev;
    await sql.query(`insert into orbit_events (user_id, t, at, data) values ($1, $2, $3, $4::jsonb)`, [userId, t, at, JSON.stringify(data)]);
  }
}

export async function insertOrigins(sql: Sql, adds: [string, Ev][], at: number) {
  for (const [, ev] of adds) {
    if (ev.t !== "chargeOk" || ev.orbit == null || !ev.cr) continue;
    await sql.query(`insert into orbit_origins (orbit, cr, at) values ($1, $2, $3) on conflict (orbit) do nothing`, [ev.orbit, ev.cr, at]);
  }
}

/** true — записано вперше; false — ця подяка вже була. */
export async function insertThank(sql: Sql, cr: string, witnessId: string, authorId: string, at: number) {
  const rows = await sql.query<{ cr: string }>(
    `insert into orbit_thanks (cr, witness_id, author_id, at) values ($1, $2, $3, $4) on conflict do nothing returning cr`,
    [cr, witnessId, authorId, at],
  );
  return rows.length > 0;
}

/** Останні 200 подій людини, її подяки й походження орбіт, до яких вона причетна. */
export async function readMine(sql: Sql, userId: string, days: Days | null, crs: string[]): Promise<{ mine: Mine; origins: Record<string, string> }> {
  const evRows = await sql.query<{ t: string; at: string | number; data: unknown }>(
    `select t, at, data from orbit_events where user_id = $1 order by id desc limit ${EVENTS_PER_USER}`,
    [userId],
  );
  const events = evRows.map((row) => {
    const data = (typeof row.data === "string" ? JSON.parse(row.data) : row.data) as Omit<Ev, "t" | "at">;
    return { ...data, t: row.t, at: Number(row.at) } as Ev;
  });
  const got = await sql.query<{ n: string | number }>(`select count(*) as n from orbit_thanks where witness_id = $1`, [userId]);
  const sent = await sql.query<{ cr: string; witness_id: string }>(`select cr, witness_id from orbit_thanks where author_id = $1`, [userId]);
  const thanked: Record<string, string[]> = {};
  for (const row of sent) (thanked[row.cr] ??= []).push(row.witness_id);
  const origins: Record<string, string> = {};
  if (crs.length) {
    const rows = await sql.query<{ orbit: number; cr: string }>(`select orbit, cr from orbit_origins where cr = any($1::text[])`, [crs]);
    for (const row of rows) origins[String(row.orbit)] = row.cr;
  }
  return { mine: { events, days, thanksGot: Number(got[0]?.n ?? 0), thanked }, origins };
}
