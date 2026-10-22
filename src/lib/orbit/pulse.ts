/**
 * v15: «пульс» екіпажів і місяця — лише читання з даних світу й власних подій. Косметика: без ✦ і без впливу на правила.
 * Чужих балансів тут немає і бути не може (клієнт їх і не отримує).
 */
import type { Creation, World } from "./engine";

const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;
/** Тижні UTC з понеділка: 1970-01-01 був четвер, тому зсув на 3 дні. */
export const weekNo = (ms: number) => Math.floor((ms + 3 * DAY) / WEEK);
export const weekStart = (ms: number) => weekNo(ms) * WEEK - 3 * DAY;

type CrewLike = { author: string; members: string[]; creation: Creation };
type EvLike = { t: string; at: number; other?: string; cr?: string };

/** Підтвердження всередині екіпажу: хтось із 9 людей підтвердив запуск іншого з тих самих 9. */
export function crewConfirms(world: Pick<World, "creations">, crew: CrewLike) {
  const people = new Set([crew.author, ...crew.members]);
  const out: { at: number; witness: string; author: string; cr: string }[] = [];
  for (const row of world.creations) {
    if (!people.has(row.userId)) continue;
    for (const c of row.confirms) if (c.witnessId !== row.userId && people.has(c.witnessId)) out.push({ at: c.at, witness: c.witnessId, author: row.userId, cr: row.id });
  }
  return out.sort((a, b) => a.at - b.at);
}

export type CrewStreak = { weeks: number; best: number; thisWeek: boolean; alive: boolean };

/**
 * Серія екіпажу — тижні поспіль, коли хтось з екіпажу підтвердив запуск іншого. Поточний тиждень ще не «зірвав» серію,
 * поки він не скінчився: якщо цього тижня ще нічого, рахуємо від минулого (alive, але thisWeek = false).
 */
export function crewStreak(world: Pick<World, "creations">, crew: CrewLike, now: number): CrewStreak {
  const weeks = new Set(crewConfirms(world, crew).map((c) => weekNo(c.at)));
  const cur = weekNo(now);
  const thisWeek = weeks.has(cur);
  let w = thisWeek ? cur : cur - 1;
  let run = 0;
  while (weeks.has(w)) { run += 1; w -= 1; }
  let best = 0, len = 0, prev = Number.NaN;
  for (const x of [...weeks].sort((a, b) => a - b)) { len = x === prev + 1 ? len + 1 : 1; best = Math.max(best, len); prev = x; }
  return { weeks: run, best, thisWeek, alive: run > 0 };
}

export type CrewWeek = { confirms: number; orbits: number; thanks: number; from: number };

/** Табель екіпажу за поточний тиждень (з понеділка, UTC). Подяки — лише ті, що бачить сама людина (свої надіслані й отримані). */
export function crewWeek(world: Pick<World, "creations">, crew: CrewLike, now: number, events: EvLike[] = []): CrewWeek {
  const from = weekStart(now);
  const people = new Set([crew.author, ...crew.members]);
  const confirms = crewConfirms(world, crew).filter((c) => c.at >= from && c.at <= now).length;
  const orbits = world.creations.filter((row) => people.has(row.userId) && row.status === "done" && row.chargeStartedAt !== null && row.chargeStartedAt + DAY >= from && row.chargeStartedAt + DAY <= now).length;
  const thanks = events.filter((e) => (e.t === "thanksGot" || e.t === "thanksSent") && e.at >= from && e.at <= now && e.other && people.has(e.other)).length;
  return { confirms, orbits, thanks, from };
}

/** Спільна тижнева ціль екіпажу: 12 підтверджень усередині екіпажу (пн–нд, UTC). Лише показ, без іскор і без формул. */
export const CREW_GOAL = 12;
export type CrewGoal = { goal: number; done: number; left: number; reached: boolean; pct: number };
export function crewGoal(week: Pick<CrewWeek, "confirms">, goal = CREW_GOAL): CrewGoal {
  const done = Math.max(0, Math.floor(week.confirms));
  return { goal, done, left: Math.max(0, goal - done), reached: done >= goal, pct: Math.min(100, Math.round((done / goal) * 100)) };
}

export type MonthRecap = { month: string; from: number; confirms: number; launches: number; orbits: number; thanks: number; activeDays: number; crews: number };

/** «Твій місяць на орбіті» — календарний місяць за Києвом. Лише власні дії людини, без жодних балансів. */
export function monthRecap(world: Pick<World, "creations">, userId: string, now: number, events: EvLike[] = [], tz = "Europe/Kyiv"): MonthRecap {
  const key = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit" }).format(ms);
  const dayKey = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
  const m = key(now);
  const inM = (ms: number) => ms <= now && key(ms) === m;
  let confirms = 0, launches = 0, orbits = 0, crews = 0;
  const days = new Set<string>();
  for (const row of world.creations) {
    const mine = row.userId === userId;
    const started = parseInt(row.id.split("-")[1] ?? "", 36);
    if (mine && Number.isFinite(started) && inM(started)) { launches += 1; days.add(dayKey(started)); }
    const born = row.status === "done" && row.chargeStartedAt !== null ? row.chargeStartedAt + DAY : null;
    if (mine && born !== null && inM(born)) orbits += 1;
    for (const c of row.confirms) if (c.witnessId === userId && inM(c.at)) { confirms += 1; days.add(dayKey(c.at)); }
    if (born !== null && inM(born) && (mine || row.confirms.some((c) => c.witnessId === userId))) crews += 1;
  }
  let thanks = 0;
  for (const e of events) {
    if (!inM(e.at)) continue;
    days.add(dayKey(e.at));
    if (e.t === "thanksGot") thanks += 1;
    if (e.t === "buy") orbits += 1;
  }
  const label = new Intl.DateTimeFormat("uk-UA", { timeZone: tz, month: "long", year: "numeric" }).format(now);
  return { month: label.replace(/\s*р\.?$/, ""), from: now, confirms, launches, orbits, thanks, activeDays: days.size, crews };
}

/** Готові «Дякую»: людина обирає одну з шести. На сервер іде лише номер 0–5. */
export const THANK_PHRASES = [
  "Дякую, що підтвердив(-ла)!",
  "Ти — частина моєї орбіти ✦",
  "Без тебе екіпажу б не було",
  "Дякую за довіру!",
  "Разом — до зірок!",
  "Ти зробив(-ла) мій день",
] as const;
export const phraseOf = (p: unknown) => (Number.isInteger(p) && (p as number) >= 0 && (p as number) < THANK_PHRASES.length ? THANK_PHRASES[p as number] : null);

/** Номер фрази з клієнта: лише ціле 0–5, інакше undefined (сервер, clean()). */
export function phraseIndex(raw: unknown): number | undefined {
  const n = typeof raw === "number" ? raw : typeof raw === "string" && /^\d$/.test(raw) ? Number(raw) : NaN;
  return Number.isInteger(n) && n >= 0 && n < THANK_PHRASES.length ? n : undefined;
}
