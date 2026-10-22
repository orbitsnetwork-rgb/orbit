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
  { id: "spark", name: "✦ Підтримую", short: "Підтримую" },
  { id: "launch", name: "До запуску", short: "До запуску" },
  { id: "galaxy", name: "Вау, галактика", short: "Вау!" },
  { id: "thanks", name: "Дякую", short: "Дякую" },
  { id: "hold", name: "Тримаймось разом", short: "Разом" },
  { id: "star", name: "Зірка дня", short: "Зірка дня" },
  { id: "funny", name: "Смішно", short: "Смішно" },
  { id: "sad", name: "Сумно", short: "Сумно" },
  { id: "see", name: "Бачу тебе", short: "Бачу тебе" },
  { id: "planet", name: "Новий світ", short: "Новий світ" },
  { id: "comet", name: "Вогонь", short: "Вогонь" },
  { id: "moon", name: "Думаю", short: "Думаю" },
] as const;
export type ReactionId = (typeof REACTIONS)[number]["id"];
export const REACT_PER_MIN = 30;
export function normReaction(raw: unknown): ReactionId | null {
  return REACTIONS.some((r) => r.id === raw) ? (raw as ReactionId) : null;
}
export function reactionName(id: string): string {
  return REACTIONS.find((r) => r.id === id)?.name ?? id;
}

/* ---------- Модерація (м'яко: маскуємо, не блокуємо; пауза лише після схованих скаргами повідомлень) ---------- */

/**
 * Грубі слова (укр/рос/англ) — маскуються «х•••», повідомлення все одно надсилається.
 * Корені матчаться лише з початку слова (з поширеними префіксами), щоб не чіпати «потребами», «Dickens» тощо.
 */
const ROOTS = ["хуй", "хуя", "хує", "хуї", "хуе", "пизд", "пізд", "бля", "єба", "єбу", "їба", "їбу", "еба", "ебу", "йоба", "сука", "суки", "сучк", "мудак", "мудил", "підар", "підор", "пидор", "пидар", "гандон", "залуп", "курва", "шлюх", "fuck", "shit", "bitch", "cunt", "asshole", "motherf", "dickhead", "bastard"];
const PREFIX = "(?:за|на|від|ви|роз|по|при|пере|до|о|з|у|від|от|вы|раз|mother)?";
const BAD_RE = new RegExp(`(^|[^\\p{L}])(${PREFIX}(?:${ROOTS.join("|")})[\\p{L}]*)`, "giu");
export function maskWords(text: string): { text: string; masked: number } {
  let masked = 0;
  const out = text.replace(BAD_RE, (_m, lead: string, word: string) => {
    masked += 1;
    const chars = Array.from(word);
    return lead + chars[0] + "•".repeat(Math.max(2, chars.length - 1));
  });
  return { text: out, masked };
}

/** Тимчасова пауза в чаті: 2 сховані скаргами повідомлення за 30 днів → 1 год; 3 і більше → 24 год. ✦ не чіпаються. */
export const MUTE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export function muteFor(hiddenRecent: number): number {
  if (hiddenRecent >= 3) return 24 * 60 * 60 * 1000;
  if (hiddenRecent >= 2) return 60 * 60 * 1000;
  return 0;
}
export function muteText(until: number): string {
  const d = new Date(until);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const left = until - Date.now();
  const when = left > 20 * 60 * 60 * 1000 ? `завтра о ${hm}` : `до ${hm}`;
  return `Чат для тебе на паузі ${when}: кілька твоїх повідомлень сховали скаргами. Читати можна, писати — пізніше. ✦ і орбіти це не зачіпає. Якщо це помилка — «Ще» → «Написати нам».`;
}

/** Автовидалення старих повідомлень — рішення власника. Вимкнено, якщо змінна не задана (0 = вимкнено). */
export function keepDays(raw: string | undefined): number {
  const n = Math.floor(Number(raw ?? ""));
  return Number.isFinite(n) && n >= 7 && n <= 3650 ? n : 0;
}

/* ---------- Сповіщення з чату (згруповано: одне на повідомлення / одне на кімнату) ---------- */
export type ChatNote = { key: string; at: number; text: string; room: string };
/** Без роду дієслова (не знаємо стать): «Нова реакція на твоє повідомлення «…» — Оля К.» / «Реакцій: 5 … — Оля К., Іван П. і ще 3». */
export function reactNoteText(names: string[], total: number, snippet: string): string {
  const two = names.slice(0, 2);
  const who = (two.join(", ") || "учасник") + (total > two.length ? ` і ще ${total - two.length}` : "");
  const s = snippet.length > 40 ? `${snippet.slice(0, 39)}…` : snippet;
  return `${total === 1 ? "Нова реакція" : `Реакцій: ${total}`} на твоє повідомлення «${s}» — ${who}`;
}
export function roomNoteText(title: string, n: number): string {
  const word = n % 10 === 1 && n % 100 !== 11 ? "нове повідомлення" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? "нові повідомлення" : "нових повідомлень";
  return `«${title}»: ${n >= 99 ? "99+" : n} ${word}`;
}
