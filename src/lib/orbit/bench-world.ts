/**
 * Синтетичний «живий» світ на N людей для бенчмарків і property-тестів (аудит C1). Лише тести/скрипти.
 * Пропорції: ~1,5 орбіти на людину, 2 запуски на людину (75% done, 15% failed, решта в процесі), 4 підтвердження,
 * угоди ≈ N, черга ≈ 10% N, 1,25 пристрою на людину, ключі h1$, люди з поштою й телефоном.
 */
import { DAY_MS, utcDay, type Account, type Creation, type Orbit, type Trade, type World } from "@/lib/orbit/engine";
import type { Bag, Identity } from "@/lib/orbit/access";

export function benchWorld(n: number, opts: { now?: number; seed?: number } = {}): Bag {
  const now = opts.now ?? Date.UTC(2026, 9, 22, 12);
  let s = (opts.seed ?? 7) >>> 0;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const id = (i: number) => `u-${(i * 2654435761 >>> 0).toString(36)}-${i}`;
  const day = utcDay(now);
  const accounts: Account[] = [];
  const people: Identity[] = [];
  const keys: Record<string, string> = {};
  for (let i = 0; i < n; i++) {
    const uid = id(i);
    accounts.push({
      id: uid, name: `Ім'я${i} П.`, stability: Math.floor(r() * 80), balance: Math.floor(r() * 2000), createdAt: now - Math.floor(r() * 60 * DAY_MS),
      confirmDay: day, confirmsToday: Math.floor(r() * 3), stabilityFromConfirmToday: Math.floor(r() * 10), stabilityDay: day, starterPending: r() < 0.2 ? 200 : 0,
      toppedUp: 0, impulseUntil: 0, lastActiveAt: now - Math.floor(r() * 5 * DAY_MS),
    });
    people.push({ userId: uid, given: `Ім'я${i}`, family: `Прізвище${i}`, birth: "1995-05-05", email: `user${i}@example.com`, phone: `+380${String(500000000 + i)}`, confirmed: true, mailCode: null });
    keys[uid] = `h1$${(i.toString(16) + "0".repeat(64)).slice(0, 64)}`;
  }
  const creations: Creation[] = [];
  for (let i = 0; i < n * 2; i++) {
    const u = Math.floor(r() * n);
    const x = r();
    const status: Creation["status"] = x < 0.75 ? "done" : x < 0.9 ? "failed" : x < 0.97 ? "charging" : "collecting";
    const confirms = status === "collecting" ? [] : Array.from({ length: 4 }, () => ({ witnessId: id(Math.floor(r() * n)), at: now - Math.floor(r() * 30 * DAY_MS) }));
    creations.push({ id: `cr-${i.toString(36)}-${Math.floor(r() * 1e9).toString(36)}`, userId: id(u), confirms, status, code: null, codeExpires: 0, codeDay: day, codesToday: 0, chargeStartedAt: status === "charging" ? now - Math.floor(r() * DAY_MS * 0.5) : status === "collecting" ? null : now - 40 * DAY_MS });
  }
  const orbits: Orbit[] = Array.from({ length: Math.floor(n * 1.5) }, (_, i) => ({ id: i + 1, ownerId: id(Math.floor(r() * n)), createdAt: now - Math.floor(r() * 60 * DAY_MS) }));
  const trades: Trade[] = Array.from({ length: n }, (_, i) => ({ at: now - Math.floor(r() * 30 * DAY_MS), amount: 100 + Math.floor(r() * 50), orbitId: (i % orbits.length) + 1, buyerId: id(Math.floor(r() * n)), sellerId: id(Math.floor(r() * n)) }));
  const queue = Array.from({ length: Math.floor(n / 10) }, (_, i) => ({ id: `l-${i}`, orbitId: (i % orbits.length) + 1, userId: id(Math.floor(r() * n)), createdAt: now - Math.floor(r() * DAY_MS) }));
  const seen: Record<string, string[]> = {};
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const dev = (i: number) => "d-" + Array.from({ length: 8 }, (_, k) => A[(i * 7 + k * 13 + Math.floor(i / (k + 1))) % A.length]).join("");
  for (let i = 0; i < Math.floor(n * 1.25); i++) seen[dev(i)] = [id(i % n), ...(r() < 0.1 ? [id(Math.floor(r() * n))] : [])];
  const devices: Bag["devices"] = {};
  for (let i = 0; i < Math.floor(n / 20); i++) devices[dev(i)] = { day, count: 1 };
  const world: World = {
    now, sessionId: null, accounts, orbits, creations, queue, trades, payouts: [], fund: 500, reserve: 0, nextNo: orbits.length + 1, price: 100, priceDay: day,
    lastDistributionAt: now - DAY_MS, log: Array.from({ length: 40 }, (_, i) => ({ at: now - i * 60_000, text: `Подія ${i}: щось сталося в орбіті.` })),
  };
  return { world, keys, devices, people, topups: [], limits: {}, seen, extra: { events: {}, thanks: {}, days: {}, origins: {} } };
}
