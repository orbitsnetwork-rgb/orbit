/**
 * Емблема — публічна ідентичність людини: колір + знак. Чиста косметика: без ✦, без впливу на правила.
 * Частина знаків відкривається діями (перевіряє сервер за даними світу), тож емблема — ще й тихий знак шляху.
 */
import type { World } from "./engine";
import { constellationOf } from "./constellation";

export const HUES = [38, 14, 350, 320, 270, 240, 205, 180, 150, 95] as const;
export type GlyphId = "letter" | "star" | "moon" | "sun" | "gem" | "peak" | "spark" | "nova" | "hex" | "comet" | "crown";
export type Glyph = { id: GlyphId; ch: string; title: string; need?: string };
export const GLYPHS: Glyph[] = [
  { id: "letter", ch: "", title: "Літера" },
  { id: "star", ch: "✦", title: "Іскра" },
  { id: "moon", ch: "☾", title: "Місяць" },
  { id: "gem", ch: "◆", title: "Кристал" },
  { id: "peak", ch: "▲", title: "Вершина" },
  { id: "hex", ch: "⬡", title: "Сота" },
  { id: "spark", ch: "✧", title: "Перший свідок", need: "Підтвердь чийсь запуск" },
  { id: "sun", ch: "☀", title: "Власне світло", need: "Запусти свою орбіту" },
  { id: "nova", ch: "✺", title: "Нова", need: "Підтвердь 5 запусків" },
  { id: "comet", ch: "☄", title: "Комета", need: "3 людини, яких ти підтвердив, запустились" },
  { id: "crown", ch: "❖", title: "Сузір'я", need: "Твоє сузір'я — 12 людей" },
];
export type Emblem = { hue: number; glyph: GlyphId };

export function unlockedGlyphs(world: Pick<World, "accounts" | "creations">, me: string): Set<GlyphId> {
  const c = constellationOf(world, me);
  const got = new Set<GlyphId>(GLYPHS.filter((g) => !g.need).map((g) => g.id));
  if (c.out.length >= 1) got.add("spark");
  if (world.creations.some((row) => row.userId === me && row.status === "done")) got.add("sun");
  if (c.out.length >= 5) got.add("nova");
  if (c.launchedOut >= 3) got.add("comet");
  if (c.total >= 12) got.add("crown");
  return got;
}

export function cleanEmblem(raw: unknown): Emblem | null {
  const v = (raw ?? {}) as { hue?: unknown; glyph?: unknown };
  const hue = Number(v.hue);
  if (!HUES.includes(hue as (typeof HUES)[number])) return null;
  if (!GLYPHS.some((g) => g.id === v.glyph)) return null;
  return { hue, glyph: v.glyph as GlyphId };
}

export const glyphChar = (id: GlyphId | undefined) => GLYPHS.find((g) => g.id === id)?.ch ?? "";
