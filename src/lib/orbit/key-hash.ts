/**
 * Ключі входу на сервері — лише у вигляді scrypt-хешу (аудит: «ключі зберігаються відкритим текстом»).
 * Лише сервер (node:crypto), тому модуль імпортується динамічно з серверних функцій.
 *
 * Формат запису: `s1$<lookup>$<salt>$<hash>`.
 *  - hash = scrypt(key, salt, 32), N=2^14, r=8, p=1 — перевірка не залежить від жодного секрету;
 *  - lookup = HMAC-SHA256(DEVICE_SECRET, key), 16 hex — лише щоб знайти акаунт за самим ключем
 *    (вхід без пошти) без перебору scrypt по всіх. Без секрету (локальна розробка) — сталий dev-рядок.
 * Старі ключі (відкритий текст) теж перевіряються і при першому вдалому вході замінюються на хеш.
 */
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const PREFIX = "s1$";
const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const cache = new Map<string, true>();

function pepper() {
  const set = process.env.DEVICE_SECRET?.trim();
  return set && set.length >= 16 ? set : DEV_PEPPER;
}

export function isHashed(stored: string | undefined): boolean {
  return typeof stored === "string" && stored.startsWith(PREFIX);
}

export function lookupOf(key: string, with_ = pepper()) {
  return createHmac("sha256", with_).update(`key:${key}`).digest("hex").slice(0, 16);
}
const DEV_PEPPER = "orbit-dev-only-lookup";

export function hashKey(key: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(key, salt, 32, PARAMS);
  return `${PREFIX}${lookupOf(key)}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

function same(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Формат, який видає mintKey (access.ts) — інших ключів у системі не було. */
export const KEY_RE = /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
export function plausibleKey(key: string | null | undefined): key is string {
  return typeof key === "string" && KEY_RE.test(key);
}

/**
 * R7: дешевий фільтр перед scrypt (≈50 мс CPU). Невдалі scrypt-перевірки рахуються на мережу (gate) в пам’яті процесу:
 * понад FAIL_MAX за 10 хв — scrypt більше не запускаємо (вважаємо ключ хибним). Вже перевірені ключі (cache) проходять завжди.
 */
const FAILS = new Map<string, { n: number; start: number }>();
export const FAIL_MAX = 60;
const FAIL_WINDOW = 10 * 60_000;
function budgetLeft(gate: string, now: number) {
  const row = FAILS.get(gate);
  return !row || now - row.start > FAIL_WINDOW || row.n < FAIL_MAX;
}
function spend(gate: string, now: number) {
  const row = FAILS.get(gate);
  if (!row || now - row.start > FAIL_WINDOW) {
    if (FAILS.size > 5000) FAILS.clear();
    FAILS.set(gate, { n: 1, start: now });
  } else row.n += 1;
}
/** Лише для тестів. */
export function resetFails() {
  FAILS.clear();
}

/** Перевірка ключа для старого (текст) і нового (хеш) запису. gate — мережа запиту (для R7). */
export function verifyKey(keys: Record<string, string>, id: string | null, key: string | null, gate?: string): boolean {
  if (!id || !key) return false;
  const stored = keys[id];
  if (typeof stored !== "string") return false;
  if (!isHashed(stored)) return same(stored, key);
  const memo = createHash("sha256").update(`${id}\n${key}\n${stored}`).digest("base64url");
  if (cache.has(memo)) return true;
  if (!plausibleKey(key)) return false;
  const now = Date.now();
  if (gate !== undefined && !budgetLeft(gate, now)) return false;
  const [, , salt, hash] = stored.split("$");
  if (!salt || !hash) return false;
  const want = Buffer.from(hash, "base64url");
  const got = scryptSync(key, Buffer.from(salt, "base64url"), want.length, PARAMS);
  const okay = want.length === got.length && timingSafeEqual(want, got);
  if (okay) {
    if (cache.size > 5000) cache.clear();
    cache.set(memo, true);
  } else if (gate !== undefined) spend(gate, now);
  return okay;
}

/** Акаунт за самим ключем: спершу за lookup (без перебору scrypt), потім серед старих текстових ключів. */
export function findByKey(keys: Record<string, string>, key: string | null): string | null {
  if (!key) return null;
  // R5: ключі, захешовані до появи DEVICE_SECRET (lookup з dev-рядком), теж знаходяться. Перевіряє все одно scrypt.
  const looks = new Set([lookupOf(key), lookupOf(key, DEV_PEPPER)]);
  for (const [id, stored] of Object.entries(keys)) {
    if (isHashed(stored) ? looks.has(stored.split("$")[1]) && verifyKey(keys, id, key) : same(stored, key)) return id;
  }
  return null;
}

/** Якщо ключ id ще текстовий і збігся — повертає ключі з хешем замість тексту (міграція при вході). */
export function upgradeKey(keys: Record<string, string>, id: string | null, key: string | null): Record<string, string> {
  if (!id || !key || isHashed(keys[id]) || !verifyKey(keys, id, key)) return keys;
  return { ...keys, [id]: hashKey(key) };
}

/**
 * R6: поступова міграція — на кожному записі світу хешуємо до `max` старих текстових ключів (scrypt ≈ 50 мс кожен),
 * щоб ключі тих, хто давно не входив, теж не лежали відкритим текстом. Для разового проходу — scripts/hash-keys.mjs.
 */
export function hashSome(keys: Record<string, string>, max = 3): Record<string, string> {
  let left = max;
  let out: Record<string, string> | null = null;
  for (const [id, stored] of Object.entries(keys)) {
    if (left <= 0) break;
    if (isHashed(stored)) continue;
    out ??= { ...keys };
    out[id] = hashKey(stored);
    left -= 1;
  }
  return out ?? keys;
}

/** Разова міграція всіх текстових ключів (скрипт scripts/hash-keys.mjs). */
export function hashAll(keys: Record<string, string>): { keys: Record<string, string>; changed: number } {
  let changed = 0;
  const out: Record<string, string> = {};
  for (const [id, stored] of Object.entries(keys)) {
    if (isHashed(stored)) out[id] = stored;
    else {
      out[id] = hashKey(stored);
      changed += 1;
    }
  }
  return { keys: out, changed };
}
