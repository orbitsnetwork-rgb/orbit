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

/** Перевірка ключа для старого (текст) і нового (хеш) запису. */
export function verifyKey(keys: Record<string, string>, id: string | null, key: string | null): boolean {
  if (!id || !key) return false;
  const stored = keys[id];
  if (typeof stored !== "string") return false;
  if (!isHashed(stored)) return same(stored, key);
  const memo = createHash("sha256").update(`${id}\n${key}\n${stored}`).digest("base64url");
  if (cache.has(memo)) return true;
  const [, , salt, hash] = stored.split("$");
  if (!salt || !hash) return false;
  const want = Buffer.from(hash, "base64url");
  const got = scryptSync(key, Buffer.from(salt, "base64url"), want.length, PARAMS);
  const okay = want.length === got.length && timingSafeEqual(want, got);
  if (okay) {
    if (cache.size > 5000) cache.clear();
    cache.set(memo, true);
  }
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
