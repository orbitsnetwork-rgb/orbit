/**
 * Підписаний ідентифікатор пристрою (лише сервер).
 *
 * Раніше id пристрою жив тільки в localStorage, тож очищення сховища обнуляло ліміт «3 імені на добу».
 * Тепер сервер видає HttpOnly-cookie `orbit_dev` = `<id>.<hmac>`; підробити чи змінити id без секрету неможливо.
 * Секрет — змінна середовища DEVICE_SECRET. Якщо її немає (локальна розробка), беремо випадковий секрет
 * на час життя процесу: cookie тоді переживає лише цей процес, а id береться з localStorage, як і раніше.
 * Жодного секрету в коді немає.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const DEVICE_COOKIE = "orbit_dev";
const DEVICE_RE = /^d-[A-Z2-9]{8}$/;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

let fallback: string | null = null;
let warned = false;

function secret(): string {
  const set = process.env.DEVICE_SECRET?.trim();
  if (set && set.length >= 16) return set;
  if (!warned) {
    warned = true;
    // R5: на продакшені без секрету кожен екземпляр функції має свій секрет — cookie пристрою і відбиток IP
    // «скидаються» між запитами, ліміти слабшають. Кричимо в журнал помилок, щоб це помітили після деплою.
    const prod = process.env.CONTEXT === "production" || process.env.NODE_ENV === "production";
    (prod ? console.error : console.warn)("DEVICE_SECRET is not set (or < 16 chars): device cookies are signed with a per-process random secret.");
  }
  fallback ??= randomBytes(32).toString("hex");
  return fallback;
}

function mac(id: string) {
  return createHmac("sha256", secret()).update(`device:${id}`).digest("base64url").slice(0, 32);
}

export function signDevice(id: string) {
  return `${id}.${mac(id)}`;
}

/** Повертає id з cookie, лише якщо підпис справжній. */
export function readDevice(cookie: string | undefined | null): string | null {
  if (!cookie) return null;
  const dot = cookie.lastIndexOf(".");
  if (dot < 0) return null;
  const id = cookie.slice(0, dot);
  const sig = cookie.slice(dot + 1);
  if (!DEVICE_RE.test(id)) return null;
  const want = Buffer.from(mac(id));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got) ? id : null;
}

export function mintDevice() {
  const bytes = randomBytes(8);
  let body = "";
  for (const byte of bytes) body += ALPHABET[byte % ALPHABET.length];
  return `d-${body}`;
}

/** IP не зберігаємо відкрито: лише короткий підписаний відбиток для ліміту реєстрацій. */
export function ipTag(ip: string) {
  return createHash("sha256").update(`${secret()}|ip|${ip}`).digest("base64url").slice(0, 16);
}
