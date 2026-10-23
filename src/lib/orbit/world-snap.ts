/**
 * Аудит C1, крок 2: знімок розпакованого світу в пам'яті процесу (ізоляту), ключований ВЕРСІЄЮ РЯДКА.
 *
 * Ключ = `xmin|updated_at` рядка orbit_world. xmin — номер транзакції, що записала цю версію рядка:
 * будь-який запис (orbitAct, Stripe, recover, account, cron) дає нову транзакцію → новий ключ, навіть
 * якщо дві транзакції почались в ту саму мікросекунду (updated_at = now() — час початку транзакції).
 *
 * Хто користується:
 *  - peek (опитування): як і раніше, лише читає;
 *  - шлях запису (orbitAct під FOR UPDATE): якщо ключ заблокованого рядка збігається зі знімком,
 *    рушій отримує знімок замість select doc + JSON.parse + unpackDoc (≈ 50% CPU запису; 3 МБ менше по мережі під блокуванням).
 *
 * Після власного запису процес запам'ятовує, ЩО саме записав (обʼєкт документа до серіалізації) і новий ключ
 * (update … returning). Розпаковується ліниво — лише якщо наступний запит у цьому ізоляті побачить той самий ключ.
 * Розпаковка — той самий unpackDoc, що й для рядка з бази (тест і ORBIT_SNAP_CHECK=1 звіряють це з JSON-круговим шляхом).
 *
 * Незмінність: знімок спільний для запитів, тож код запису не має змінювати його на місці (усе в рушії й access — копіями).
 * На проді заморожуємо контейнери верхнього рівня (дешево); з ORBIT_SNAP_CHECK=1 (тести, e2e) — глибоко, щоб будь-яка
 * спроба змінити знімок одразу падала з TypeError.
 */
import { unpackDoc, type Bag, type Identity } from "@/lib/orbit/access";
import { clockWindow, type ClockWindow } from "@/lib/orbit/clock-window";

export type Snap = { key: string; v: string; bag: Bag; win: ClockWindow; people: Map<string, Identity> };
type Pending = { key: string; v: string; doc: unknown };
type Holder = { snap: Snap | null; pending: Pending | null; stats: { hits: number; misses: number; lazy: number } };

const g = globalThis as { __orbitSnap__?: Holder };
function holder(): Holder {
  return (g.__orbitSnap__ ??= { snap: null, pending: null, stats: { hits: 0, misses: 0, lazy: 0 } });
}

/** Ключ версії рядка. SQL: `select xmin::text as rev, updated_at::text as v`. */
export function snapKey(row: { rev: string; v: string }) {
  return `${row.rev}|${row.v}`;
}
export const HEAD_SQL = `select xmin::text as rev, updated_at::text as v from orbit_world where id = 'world'`;
export const RETURNING = `returning xmin::text as rev, updated_at::text as v`;

export function snapCheck() {
  return typeof process !== "undefined" && process.env?.ORBIT_SNAP_CHECK?.trim() === "1";
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as object)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

function freezeShallow(bag: Bag) {
  const w = bag.world;
  for (const part of [w.accounts, w.orbits, w.creations, w.queue, w.trades, w.payouts, w.log, bag.keys, bag.devices, bag.people, bag.topups, bag.limits, bag.seen, bag.extra, bag.extra.days]) {
    if (part && typeof part === "object") Object.freeze(part);
  }
  Object.freeze(w);
  Object.freeze(bag);
}

/** Знімок з уже розпакованого документа (рядок з бази → unpackDoc). */
export function makeSnap(key: string, v: string, unpacked: Bag): Snap {
  const bag: Bag = { ...unpacked, world: { ...unpacked.world, sessionId: null } };
  if (snapCheck()) deepFreeze(bag);
  else freezeShallow(bag);
  return { key, v, bag, win: clockWindow(bag.world), people: new Map(bag.people.map((row) => [row.userId, row])) };
}

/** Знімок для цього ключа: готовий, або лінивий після власного запису, або null (тоді читаємо doc з бази). */
export function snapAt(key: string): Snap | null {
  const h = holder();
  if (h.snap && h.snap.key === key) {
    h.stats.hits += 1;
    return h.snap;
  }
  if (h.pending && h.pending.key === key) {
    const p = h.pending;
    h.pending = null;
    h.snap = makeSnap(p.key, p.v, unpackDoc(p.doc));
    h.stats.lazy += 1;
    return h.snap;
  }
  h.stats.misses += 1;
  return null;
}

/** Покласти знімок, прочитаний з бази. Старіший лінивий запис з іншим ключем відкидаємо. */
export function putSnap(snap: Snap) {
  const h = holder();
  h.snap = snap;
  if (h.pending && h.pending.key !== snap.key) h.pending = null;
  return snap;
}

/** Після УСПІШНОГО коміту власного запису: що записано і з яким ключем. */
export function rememberWrite(key: string, v: string, doc: unknown) {
  const h = holder();
  h.pending = { key, v, doc };
}

export function snapStats() {
  return { ...holder().stats };
}
export function clearSnap() {
  const h = holder();
  h.snap = null;
  h.pending = null;
  h.stats = { hits: 0, misses: 0, lazy: 0 };
}
