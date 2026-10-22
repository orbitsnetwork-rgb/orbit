/** Чисті правила живого шару (без сервера) — щоб їх можна було перевірити тестами. */
import type { World } from "@/lib/orbit/engine";
export const CHAT_MAX = 240;
export const CHAT_PER_MIN = 8;
export const CHAT_READ = 40;
export const HIDE_AFTER_REPORTS = 3;
export const WHY_MIN = 8;
export const WHY_MAX = 280;

/** Прибирає керівні символи й зайві пробіли. Текст далі показується лише як текст (React екранує), HTML не рендеримо. */
export function cleanText(raw: unknown, max = CHAT_MAX): string {
  return String(raw ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** «Ім’я П.» — як і всюди в Орбітах, повне ім’я в чат не йде. */
export function shortName(name: string): string {
  const parts = name.replace(/^❄\s*/, "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "Учасник";
  return parts.length > 1 ? `${parts[0]} ${parts[1][0]}.` : parts[0];
}

/**
 * Сигнал «схоже на автоклікер»: 20 кліків поспіль, кожен проміжок < 250 мс і розкид < 25 мс.
 * Лише сигнал для перевірки людиною; нічого не забирає й не блокує.
 */
export function looksScripted(stamps: number[]): boolean {
  if (stamps.length < 20) return false;
  const last = stamps.slice(-20);
  const gaps = last.slice(1).map((t, i) => t - last[i]);
  return gaps.every((gap) => gap > 0 && gap < 250) && Math.max(...gaps) - Math.min(...gaps) < 25;
}

/* ---------- Кімнати ---------- */

/** Одна кімната на запуск: поки збирається — «Запуск», після успіху — «Екіпаж №N» (та сама кімната, історія не губиться). */
export type RoomInfo = { id: string; kind: "world" | "launch" | "crew"; title: string; members: number };
export const WORLD_ROOM = "world";
const ROOM_RE = /^l:[A-Za-z0-9_-]{1,48}$/;

export function normRoom(raw: unknown): string | null {
  const s = typeof raw === "string" ? raw.slice(0, 52) : WORLD_ROOM;
  return s === WORLD_ROOM || ROOM_RE.test(s) ? s : null;
}

/** Учасники запуску: автор і всі, хто вже підтвердив. Невдалий запуск кімнати не має. */
export function roomMembers(world: World, room: string): string[] | null {
  if (room === WORLD_ROOM) return null;
  const creation = world.creations.find((row) => `l:${row.id}` === room);
  if (!creation || creation.status === "failed") return [];
  return [creation.userId, ...creation.confirms.map((row) => row.witnessId)];
}

/** Сервер викликає це для КОЖНОГО читання й запису. world — для всіх, хто увійшов. */
export function canUseRoom(world: World, userId: string, room: string): boolean {
  if (room === WORLD_ROOM) return world.accounts.some((a) => a.id === userId);
  return (roomMembers(world, room) ?? []).includes(userId);
}

export function roomsFor(world: World, userId: string): RoomInfo[] {
  const done = world.creations.filter((row) => row.status === "done");
  const out: RoomInfo[] = [{ id: WORLD_ROOM, kind: "world", title: "Світ", members: world.accounts.length }];
  for (const row of [...world.creations].reverse()) {
    if (row.status === "failed") continue;
    const people = [row.userId, ...row.confirms.map((c) => c.witnessId)];
    if (!people.includes(userId)) continue;
    const no = done.indexOf(row) + 1;
    out.push({ id: `l:${row.id}`, kind: row.status === "done" ? "crew" : "launch", title: row.status === "done" ? `Екіпаж №${no}` : row.userId === userId ? "Мій запуск" : "Запуск, який я підтримав", members: new Set(people).size });
  }
  return out.slice(0, 21);
}

/* ---------- Ліміти ---------- */

/** Спільний запобіжник на всі кімнати разом — удвічі більший за ліміт однієї кімнати. */
export const CHAT_PER_MIN_ALL = CHAT_PER_MIN * 2;
/** true, якщо нове повідомлення перевищить ліміт (n — у цій кімнаті за хвилину, all — у всіх кімнатах). */
export function overChatCap(nRoom: number, nAll: number): boolean {
  return nRoom >= CHAT_PER_MIN || nAll >= CHAT_PER_MIN_ALL;
}

/* ---------- Реакції (лише прикраса: жодних ✦, жодного впливу на економіку) ---------- */

export const REACTIONS = [
  { id: "spark", name: "✦ Підтримую" },
  { id: "launch", name: "До запуску" },
  { id: "galaxy", name: "Вау, галактика" },
  { id: "thanks", name: "Дякую" },
  { id: "hold", name: "Тримаймось разом" },
  { id: "star", name: "Зірка дня" },
  { id: "funny", name: "Смішно" },
  { id: "sad", name: "Сумно" },
  { id: "see", name: "Бачу тебе" },
  { id: "planet", name: "Новий світ" },
] as const;
export type ReactionId = (typeof REACTIONS)[number]["id"];
export const REACT_PER_MIN = 30;
export function normReaction(raw: unknown): ReactionId | null {
  return REACTIONS.some((r) => r.id === raw) ? (raw as ReactionId) : null;
}
export function reactionName(id: string): string {
  return REACTIONS.find((r) => r.id === id)?.name ?? id;
}
