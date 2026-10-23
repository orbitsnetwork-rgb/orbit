/**
 * «Кільце ботів» — сигнал для власника (/owner). Лише читання й лише підказка людині: нічого не блокує, ✦ і орбіт не чіпає.
 *
 * Шукаємо групи акаунтів, які схоже веде одна людина або скрипт:
 *  - зв'язок «спільний пристрій»: два акаунти бували на одному пристрої (orbit_device_seen);
 *  - зв'язок «швидке підтвердження»: свідок підтвердив автора, обидва акаунти створені близько в часі
 *    (≤ BURST_PAIR_MS) і підтвердження сталося незабаром після створення (≤ FRESH_CONFIRM_MS).
 * Компоненти зв'язності за цими зв'язками — кандидати. Кожну оцінюємо прозорими сигналами (пояснення людською мовою),
 * а зовнішні підтвердження (від людей поза групою) знижують підозру: справжні люди мають коріння поза кільцем.
 *
 * Приватність: ідентифікатори пристроїв назовні не виходять — лише кількості.
 */
export type RingInput = {
  accounts: { id: string; name: string; createdAt: number }[];
  /** Хто кого підтвердив (свідок → автор), з часом. Дублікати пари допустимі. */
  confirms: { witness: string; author: string; at: number }[];
  /** Пристрій → акаунти, що на ньому бували. Ключі не виходять у результат. */
  seen: Record<string, string[]>;
  /** Акаунти з відкритою позначкою «схоже на бота» (автоклікер, замкнене коло). */
  flagged: string[];
};
export type Ring = {
  key: string;
  level: "high" | "mid";
  score: number;
  members: { userId: string; name: string }[];
  reasons: string[];
  stats: { size: number; sharedDevices: number; maxPerDevice: number; spanMin: number; inside: number; outside: number; flagged: number };
};

export const BURST_PAIR_MS = 24 * 60 * 60_000;
export const FRESH_CONFIRM_MS = 72 * 60 * 60_000;
export const BURST_SPAN_MS = 6 * 60 * 60_000;
export const SHOW_FROM = 45;
export const HIGH_FROM = 70;
const MAX_RINGS = 30;
const MAX_MEMBERS = 40;

function dsu(ids: string[]) {
  const up = new Map(ids.map((id) => [id, id]));
  const find = (x: string): string => { let r = x; while (up.get(r) !== r) r = up.get(r)!; let c = x; while (up.get(c) !== r) { const n = up.get(c)!; up.set(c, r); c = n; } return r; };
  return { find, join: (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) up.set(ra < rb ? rb : ra, ra < rb ? ra : rb); } };
}

export const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
};
const span = (ms: number) => (ms < 60 * 60_000 ? `${Math.max(1, Math.round(ms / 60_000))} хв` : `${Math.round(ms / 3_600_000)} год`);

/** Короткий стабільний ключ групи (для React і e2e), без ідентифікаторів пристроїв. */
function ringKey(ids: string[]) {
  let h = 2166136261;
  for (const ch of ids.join("|")) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return "r-" + h.toString(36);
}

export function findRings(input: RingInput): Ring[] {
  const acc = new Map(input.accounts.map((a) => [a.id, a]));
  const ids = [...acc.keys()];
  const u = dsu(ids);
  // Пари (без дублікатів і без самопідтверджень/примар).
  const pairs = new Map<string, { witness: string; author: string; at: number }>();
  for (const c of input.confirms) {
    if (c.witness === c.author || !acc.has(c.witness) || !acc.has(c.author)) continue;
    const k = c.witness + ">" + c.author;
    const was = pairs.get(k);
    if (!was || c.at < was.at) pairs.set(k, c);
  }
  // Пристрої зі ≥2 відомими акаунтами.
  const devices: string[][] = [];
  for (const list of Object.values(input.seen)) {
    const known = [...new Set(list)].filter((id) => acc.has(id));
    if (known.length >= 2) devices.push(known);
  }
  for (const d of devices) for (let i = 1; i < d.length; i++) u.join(d[0], d[i]);
  for (const p of pairs.values()) {
    const a = acc.get(p.witness)!, b = acc.get(p.author)!;
    if (Math.abs(a.createdAt - b.createdAt) <= BURST_PAIR_MS && p.at - Math.max(a.createdAt, b.createdAt) <= FRESH_CONFIRM_MS) u.join(a.id, b.id);
  }
  const groups = new Map<string, string[]>();
  const root = new Map<string, string>();
  for (const id of ids) { const r = u.find(id); root.set(id, r); const g = groups.get(r); if (g) g.push(id); else groups.set(r, [id]); }
  // Один прохід по пристроях і парах замість «кожна група × усі пари» (на 10k людей це різниця між ~1 с і кількома мс).
  const devCount = new Map<string, number[]>();
  for (const d of devices) {
    const per = new Map<string, number>();
    for (const id of d) { const r = root.get(id)!; per.set(r, (per.get(r) ?? 0) + 1); }
    for (const [r, n] of per) if (n >= 2) { const l = devCount.get(r); if (l) l.push(n); else devCount.set(r, [n]); }
  }
  const insideOf = new Map<string, number>();
  const outsideOf = new Map<string, Set<string>>();
  for (const p of pairs.values()) {
    const ra = root.get(p.author)!;
    if (root.get(p.witness) === ra) insideOf.set(ra, (insideOf.get(ra) ?? 0) + 1);
    else { const o = outsideOf.get(ra); if (o) o.add(p.witness); else outsideOf.set(ra, new Set([p.witness])); }
  }
  const flagged = new Set(input.flagged);
  const out: Ring[] = [];
  for (const [r, g] of groups) {
    if (g.length < 3) continue;
    const devs = devCount.get(r) ?? [];
    const sharedDevices = devs.length;
    const maxPerDevice = devs.length ? Math.max(...devs) : 0;
    let lo = Infinity, hi = -Infinity;
    for (const id of g) { const t = acc.get(id)!.createdAt; if (t < lo) lo = t; if (t > hi) hi = t; }
    const spanMs = hi - lo;
    const inside = insideOf.get(r) ?? 0;
    const outside = outsideOf.get(r)?.size ?? 0;
    const nFlag = g.filter((id) => flagged.has(id)).length;
    const reasons: string[] = [];
    let score = 0;
    if (sharedDevices) {
      score += Math.min(40, 20 + 10 * (maxPerDevice - 2) + 5 * (sharedDevices - 1));
      reasons.push(`${sharedDevices} ${plural(sharedDevices, "пристрій", "пристрої", "пристроїв")} зі спільними акаунтами групи (до ${maxPerDevice} на одному)`);
    }
    if (spanMs <= BURST_SPAN_MS) {
      score += 20;
      reasons.push(`усі ${g.length} створені за ${span(spanMs)}`);
    }
    const density = inside / g.length;
    if (density >= 0.75) score += 20;
    else if (density >= 0.4) score += 10;
    if (inside) reasons.push(`${inside} ${plural(inside, "підтвердження", "підтвердження", "підтверджень")} всередині групи`);
    if (inside && outside === 0) { score += 15; reasons.push("жодного підтвердження від людей поза групою"); }
    else if (outside) { score -= 15 * outside; reasons.push(`${outside} ${plural(outside, "поручитель", "поручителі", "поручителів")} поза групою (знижує підозру)`); }
    if (nFlag) { score += Math.min(20, 10 * nFlag); reasons.push(`${nFlag} з позначкою «схоже на бота»`); }
    // Без жодного «твердого» сигналу (пристрій або позначка) і без щільних підтверджень — це просто люди, що прийшли разом.
    if (!sharedDevices && !nFlag && density < 0.75) continue;
    score = Math.max(0, Math.min(100, score));
    if (score < SHOW_FROM) continue;
    const sorted = [...g].sort((a, b) => acc.get(a)!.createdAt - acc.get(b)!.createdAt || (a < b ? -1 : 1));
    out.push({
      key: ringKey([...g].sort()),
      level: score >= HIGH_FROM ? "high" : "mid",
      score,
      members: sorted.slice(0, MAX_MEMBERS).map((id) => ({ userId: id, name: acc.get(id)!.name })),
      reasons,
      stats: { size: g.length, sharedDevices, maxPerDevice, spanMin: Math.round(spanMs / 60_000), inside, outside, flagged: nFlag },
    });
  }
  return out.sort((a, b) => b.score - a.score || b.stats.size - a.stats.size).slice(0, MAX_RINGS);
}
