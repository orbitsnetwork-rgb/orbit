/** Правила «Слова поручителя» — чисті, тестуються без бази. */
import { cleanText, maskWords } from "./live-rules";
import type { World } from "./engine";

export const WORD_MIN = 3;
export const WORD_MAX = 140;
export type VouchWord = { witnessId: string; authorId: string; text: string; at: number; hidden: boolean };

/** Чи підтверджував witness хоч один запуск author (пара раз за життя → щонайбільше одне слово). */
export function canVouch(world: Pick<World, "creations">, witness: string, author: string) {
  if (witness === author) return false;
  return world.creations.some((c) => c.userId === author && c.confirms.some((f) => f.witnessId === witness));
}

export function prepWord(raw: unknown): { text: string } | { error: string } {
  const text = cleanText(raw, WORD_MAX);
  if (Array.from(text).length < WORD_MIN) return { error: `Хоча б ${WORD_MIN} символи.` };
  if (/https?:\/\/|www\.|t\.me\/|@[a-z0-9_]{4,}/i.test(text)) return { error: "Без посилань і контактів — лише кілька слів про людину." };
  return { text: maskWords(text).text };
}
