/**
 * Особисті події, подяки й походження орбіт — в окремих append-only таблицях, не в документі світу
 * (аудит K1: документ виріс би втричі й уперся б у межу jsonb на ≈15,8 тис. акаунтах).
 * Лише сервер. Таблиці створюються міграцією 0031 і, про всяк випадок, тут при першому зверненні (IF NOT EXISTS).
 */
import type { Sql } from "@/lib/db";
import { EVENTS_PER_USER, type Days, type Ev, type Mine } from "@/lib/orbit/social";
// @ts-ignore — vite raw import
import schema from "../../../migrations/0031_orbit_social.sql?raw";
// @ts-ignore — vite raw import
import payoutSchema from "../../../migrations/0032_orbit_payouts.sql?raw";
// @ts-ignore — vite raw import
import emissionSchema from "../../../migrations/0033_orbit_emission.sql?raw";
import type { DaySnap, Emission, Transparency } from "@/lib/orbit/emission";
import type { World } from "@/lib/orbit/engine";

const g = globalThis as { __orbitSocialReady__?: Promise<void> };

export function ensureSocial(sql: Sql): Promise<void> {
  g.__orbitSocialReady__ ??= (async () => {
    for (const stmt of (String(schema) + ";" + String(payoutSchema) + ";" + String(emissionSchema)).replace(/--.*$/gm, "").split(";").map((s) => s.trim()).filter(Boolean)) await sql.query(stmt, []);
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

/** Append-only: кожна виплата фонду (події «fund» останнього запису) — окремий рядок. */
export async function insertPayouts(sql: Sql, adds: [string, Ev][]) {
  for (const [userId, ev] of adds) {
    if (ev.t !== "fund" || !ev.amt) continue;
    await sql.query(`insert into orbit_payouts (at, user_id, amount) values ($1, $2, $3)`, [ev.at, userId, ev.amt]);
  }
}

/** Публічна частина історії фонду: останні 60 поділів і загальна сума. */
export async function readFundRuns(sql: Sql) {
  const runs = await sql.query<{ at: string | number; n: string | number; total: string | number }>(
    `select at, count(*) as n, sum(amount) as total from orbit_payouts group by at order by at desc limit 60`,
    [],
  );
  const all = await sql.query<{ s: string | number | null }>(`select sum(amount) as s from orbit_payouts`, []);
  return { fundRuns: runs.map((r) => ({ at: Number(r.at), n: Number(r.n), total: Number(r.total) })), fundPaidTotal: Number(all[0]?.s ?? 0) };
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
  const paid = await sql.query<{ at: string | number; amount: number }>(
    `select at, amount from orbit_payouts where user_id = $1 order by id desc limit 500`,
    [userId],
  );
  const myTotal = await sql.query<{ s: string | number | null }>(`select sum(amount) as s from orbit_payouts where user_id = $1`, [userId]);
  const runs = await readFundRuns(sql);
  return { mine: { ...runs, payouts: paid.map((r) => ({ at: Number(r.at), userId, amount: Number(r.amount) })), myPaidTotal: Number(myTotal[0]?.s ?? 0), events, days, thanksGot: Number(got[0]?.n ?? 0), thanked }, origins };
}

/** Рядок обліку випуску. Перший запис у порожню таблицю — «генезис»: маса до початку обліку. Порожні зміни не пишемо. */
export async function insertEmission(sql: Sql, row: Emission | null, before: number) {
  if (!row) return;
  const any = await sql.query<{ id: string | number }>(`select id from orbit_emission limit 1`, []);
  if (!any.length) {
    await sql.query(`insert into orbit_emission (at, mass, fund, kind) values ($1, $2, $3, 'genesis')`, [row.at, before, row.fund]);
  }
  if (!row.delta && !row.starter && !row.witness && !row.topup && !row.returned) return;
  await sql.query(
    `insert into orbit_emission (at, mass, fund, starter, witness, topup, returned, delta, unexplained) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [row.at, row.mass, row.fund, row.starter, row.witness, row.topup, row.returned, row.delta, row.unexplained],
  );
}

/** Звірка: поточна маса проти «генезис + усе пояснене». 0 — усе зійшлося. */
export async function reconcile(sql: Sql, world: World) {
  const { massOf } = await import("@/lib/orbit/emission");
  const g = await sql.query<{ mass: string | number }>(`select mass from orbit_emission where kind = 'genesis' order by id limit 1`, []);
  const s = await sql.query<{ m: string | number | null; u: string | number | null }>(
    `select sum(starter + witness + topup - returned) as m, sum(unexplained) as u from orbit_emission where kind = 'write'`,
    [],
  );
  const mass = massOf(world);
  const genesis = g.length ? Number(g[0].mass) : mass;
  const expected = genesis + Number(s[0]?.m ?? 0);
  return { mass, genesis, expected, diff: mass - expected, unexplained: Number(s[0]?.u ?? 0), ok: mass === expected && Number(s[0]?.u ?? 0) === 0 };
}

/** Публічні агрегати для сторінки «Прозорість»: по днях (UTC, 90 днів) і по місяцях. Без жодних id. */
export async function readTransparency(sql: Sql, world: World): Promise<Transparency> {
  const { massOf } = await import("@/lib/orbit/emission");
  const rows = await sql.query<{ at: string | number; mass: string | number; fund: string | number; starter: string | number; witness: string | number; topup: string | number; returned: string | number; unexplained: string | number; kind: string }>(
    `select at, mass, fund, starter, witness, topup, returned, unexplained, kind from orbit_emission order by id`,
    [],
  );
  const byDay = new Map<string, DaySnap>();
  for (const r of rows) {
    const day = new Date(Number(r.at)).toISOString().slice(0, 10);
    const d = byDay.get(day) ?? { day, mass: 0, fund: 0, minted: 0, returned: 0, starter: 0, witness: 0, topup: 0, unexplained: 0 };
    d.mass = Number(r.mass);
    d.fund = Number(r.fund);
    if (r.kind === "write") {
      d.starter += Number(r.starter);
      d.witness += Number(r.witness);
      d.topup += Number(r.topup);
      d.returned += Number(r.returned);
      d.unexplained += Number(r.unexplained);
      d.minted = d.starter + d.witness + d.topup;
    }
    byDay.set(day, d);
  }
  const days = [...byDay.values()].slice(-90);
  const months = new Map<string, Transparency["months"][number]>();
  for (const d of byDay.values()) {
    const month = d.day.slice(0, 7);
    const m = months.get(month) ?? { month, minted: 0, returned: 0, starter: 0, witness: 0, topup: 0, unexplained: 0 };
    m.minted += d.minted; m.returned += d.returned; m.starter += d.starter; m.witness += d.witness; m.topup += d.topup; m.unexplained += d.unexplained;
    months.set(month, m);
  }
  const check = await reconcile(sql, world);
  return { now: world.now, mass: massOf(world), fund: world.fund, reserve: world.reserve, accounts: world.accounts.length, days, months: [...months.values()].reverse(), reconciliation: check.diff + check.unexplained, checkedAt: Date.now() };
}
