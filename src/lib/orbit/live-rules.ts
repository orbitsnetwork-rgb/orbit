/** Чисті правила живого шару (без сервера) — щоб їх можна було перевірити тестами. */
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
