/**
 * Особисті події, подяки й «Дні на орбіті». Лише сервер пише; рушій не змінюється.
 * Події виводимо з різниці «світ до → світ після» кожного запису документа, тож вони не залежать
 * від тексту спільного журналу й від імен (дві «Олена К.» більше не плутаються).
 */
import { SELLER_SHARE, WITNESS_OD, utcDay, type World } from "@/lib/orbit/engine";
import type { Topup } from "@/lib/orbit/access";

export type EvType =
  | "join"
  | "launch"
  | "confirmGiven"
  | "confirmed"
  | "charging"
  | "chargeOk"
  | "chargeFail"
  | "witnessOk"
  | "witnessFail"
  | "buy"
  | "sold"
  | "list"
  | "cancel"
  | "fund"
  | "topup"
  | "starter"
  | "thanksGot"
  | "thanksSent";

/** Подія людини: тип, час, сума (зі знаком), орбіта, інша людина, заявка, номер підтвердження. */
export type Ev = { t: EvType; at: number; amt?: number; orbit?: number; other?: string; cr?: string; n?: number };
export type Days = { last: string; count: number; streak: number; best: number };
/** origins: номер орбіти → заявка, з якої вона народилась (записуємо в момент заряду). */
export type Extra = { events: Record<string, Ev[]>; thanks: Record<string, string[]>; days: Record<string, Days>; origins: Record<string, string> };

export const EVENTS_PER_USER = 200;

export function emptyExtra(): Extra {
  return { events: {}, thanks: {}, days: {}, origins: {} };
}

export function asExtra(value: unknown): Extra {
  const out = emptyExtra();
  if (!value || typeof value !== "object") return out;
  const raw = value as { events?: unknown; thanks?: unknown; days?: unknown; origins?: unknown };
  if (raw.origins && typeof raw.origins === "object") {
    for (const [orbit, cr] of Object.entries(raw.origins as Record<string, unknown>)) if (/^\d+$/.test(orbit) && typeof cr === "string") out.origins[orbit] = cr;
  }
  if (raw.events && typeof raw.events === "object") {
    for (const [id, list] of Object.entries(raw.events as Record<string, unknown>)) {
      if (!id.startsWith("u-") || !Array.isArray(list)) continue;
      out.events[id] = list.filter((row): row is Ev => typeof row?.t === "string" && typeof row?.at === "number").slice(0, EVENTS_PER_USER);
    }
  }
  if (raw.thanks && typeof raw.thanks === "object") {
    for (const [cr, ids] of Object.entries(raw.thanks as Record<string, unknown>)) {
      if (Array.isArray(ids)) out.thanks[cr] = ids.filter((id): id is string => typeof id === "string").slice(0, 16);
    }
  }
  if (raw.days && typeof raw.days === "object") {
    for (const [id, row] of Object.entries(raw.days as Record<string, unknown>)) {
      const d = row as Partial<Days>;
      if (id.startsWith("u-") && typeof d?.last === "string" && typeof d.count === "number") {
        out.days[id] = { last: d.last, count: d.count, streak: d.streak ?? 1, best: d.best ?? d.count };
      }
    }
  }
  return out;
}

export function addEvents(events: Record<string, Ev[]>, adds: [string, Ev][]): Record<string, Ev[]> {
  if (!adds.length) return events;
  const next = { ...events };
  for (const [id, ev] of adds) next[id] = [ev, ...(next[id] ?? [])].slice(0, EVENTS_PER_USER);
  return next;
}

/** Що змінилося між двома станами світу — у вигляді особистих подій. */
export function diffEvents(prev: World, next: World, prevTopups: Topup[] = [], nextTopups: Topup[] = []): [string, Ev][] {
  const out: [string, Ev][] = [];
  const at = next.now;
  const known = new Set(prev.accounts.map((account) => account.id));
  for (const account of next.accounts) if (!known.has(account.id)) out.push([account.id, { t: "join", at: account.createdAt, amt: account.balance }]);
  // Б5: стартові ✦ зараховано за перший внесок.
  const pendingBefore = new Map(prev.accounts.map((account) => [account.id, account.starterPending ?? 0]));
  for (const account of next.accounts) {
    const was = pendingBefore.get(account.id) ?? 0;
    if (was > 0 && !(account.starterPending ?? 0)) out.push([account.id, { t: "starter", at, amt: was }]);
  }

  const before = new Map(prev.creations.map((item) => [item.id, item]));
  const oldOrbits = new Set(prev.orbits.map((orbit) => orbit.id));
  for (const item of next.creations) {
    const was = before.get(item.id);
    if (!was) out.push([item.userId, { t: "launch", at, cr: item.id }]);
    const had = new Set((was?.confirms ?? []).map((row) => row.witnessId));
    item.confirms.forEach((row, index) => {
      if (had.has(row.witnessId)) return;
      out.push([row.witnessId, { t: "confirmGiven", at: row.at, other: item.userId, cr: item.id, n: index + 1 }]);
      out.push([item.userId, { t: "confirmed", at: row.at, other: row.witnessId, cr: item.id, n: index + 1 }]);
    });
    if (item.status === "charging" && was?.status !== "charging") out.push([item.userId, { t: "charging", at, cr: item.id }]);
    if (was && was.status !== item.status && (item.status === "done" || item.status === "failed")) {
      const ok = item.status === "done";
      const orbit = ok ? next.orbits.find((row) => row.ownerId === item.userId && !oldOrbits.has(row.id))?.id : undefined;
      out.push([item.userId, { t: ok ? "chargeOk" : "chargeFail", at, cr: item.id, orbit }]);
      for (const row of item.confirms) {
        out.push([row.witnessId, { t: ok ? "witnessOk" : "witnessFail", at, cr: item.id, other: item.userId, orbit, amt: ok ? WITNESS_OD : 0 }]);
      }
    }
  }

  const traded = new Set<number>();
  for (const trade of next.trades.slice(prev.trades.length)) {
    traded.add(trade.orbitId);
    const buyer = next.orbits.find((orbit) => orbit.id === trade.orbitId)?.ownerId;
    const seller = prev.orbits.find((orbit) => orbit.id === trade.orbitId)?.ownerId;
    if (buyer) out.push([buyer, { t: "buy", at: trade.at, orbit: trade.orbitId, amt: -trade.amount, other: seller }]);
    if (seller) out.push([seller, { t: "sold", at: trade.at, orbit: trade.orbitId, amt: Math.floor(trade.amount * SELLER_SHARE), n: trade.amount }]);
  }
  const listed = new Set(prev.queue.map((row) => row.id));
  const still = new Set(next.queue.map((row) => row.id));
  for (const row of next.queue) if (!listed.has(row.id)) out.push([row.userId, { t: "list", at: row.createdAt, orbit: row.orbitId }]);
  for (const row of prev.queue) if (!still.has(row.id) && !traded.has(row.orbitId)) out.push([row.userId, { t: "cancel", at, orbit: row.orbitId }]);

  if (next.lastDistributionAt !== prev.lastDistributionAt) {
    for (const row of next.payouts) if (row.at === next.lastDistributionAt && row.at > prev.lastDistributionAt) out.push([row.userId, { t: "fund", at: row.at, amt: row.amount }]);
  }
  const paid = new Set(prevTopups.filter((row) => row.status === "paid").map((row) => row.id));
  for (const row of nextTopups) if (row.status === "paid" && !paid.has(row.id)) out.push([row.userId, { t: "topup", at: row.at, amt: row.amount }]);
  return out;
}

/** Нові орбіти з заряду → їхні заявки (для «Екіпажу» на картці орбіти). */
export function addOrigins(origins: Record<string, string>, adds: [string, Ev][]): Record<string, string> {
  const hits = adds.filter(([, ev]) => ev.t === "chargeOk" && ev.orbit !== undefined && ev.cr);
  if (!hits.length) return origins;
  const next = { ...origins };
  for (const [, ev] of hits) next[String(ev.orbit)] = ev.cr as string;
  return next;
}

/** «Дні на орбіті»: різні доби UTC, коли людина щось робила; серія — доби поспіль. */
export function markDay(days: Record<string, Days>, userId: string | null, now: number): Record<string, Days> {
  if (!userId) return days;
  const today = utcDay(now);
  const have = days[userId];
  if (have?.last === today) return days;
  const yesterday = utcDay(now - 24 * 60 * 60 * 1000);
  const streak = have && have.last === yesterday ? have.streak + 1 : 1;
  const count = (have?.count ?? 0) + 1;
  return { ...days, [userId]: { last: today, count, streak, best: Math.max(have?.best ?? 0, streak) } };
}

/** Що бачить сама людина про себе. */
/** Розподіл фонду (агрегат з orbit_payouts): коли, скільки людей, скільки ✦. */
export type FundRun = { at: number; n: number; total: number };
export type Mine = {
  events: Ev[];
  days: Days | null;
  thanksGot: number;
  thanked: Record<string, string[]>;
  /** Повна історія з окремої таблиці (сервер); якщо немає — екрани беруть world.payouts. */
  payouts?: { at: number; userId: string; amount: number }[];
  myPaidTotal?: number;
  fundRuns?: FundRun[];
  fundPaidTotal?: number;
};

export function mineOf(extra: Extra, world: World, userId: string): Mine {
  const own = new Set(world.creations.filter((item) => item.userId === userId).map((item) => item.id));
  const thanked: Record<string, string[]> = {};
  for (const id of own) if (extra.thanks[id]) thanked[id] = extra.thanks[id];
  return { events: extra.events[userId] ?? [], days: extra.days[userId] ?? null, thanksGot: thanksCount(extra, userId), thanked };
}

export function thanksCount(extra: Extra, userId: string) {
  let n = 0;
  for (const ids of Object.values(extra.thanks)) if (ids.includes(userId)) n += 1;
  return n;
}
