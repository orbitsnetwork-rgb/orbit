/**
 * 21: номерні орбіти «№ 000 123 з 8 000 000» і детерміновані косметичні риси.
 * Риси залежать лише від номера (той самий номер — ті самі риси на будь-якому телефоні). Без ✦, без передачі, без впливу на ціну.
 */
import { ORBIT_CAP } from "@/lib/orbit/engine";

export function orbitNo(id: number) {
  return `№ ${String(id).padStart(6, "0").replace(/(\d{3})(?=\d)/g, "$1 ")}`;
}
export function orbitOf(id: number) {
  return `${orbitNo(id)} з ${new Intl.NumberFormat("uk-UA").format(ORBIT_CAP).replace(/\u00a0/g, " ")}`;
}

/** FNV-1a + xorshift: стабільне псевдовипадкове число з номера. */
function seed(id: number) {
  let h = 0x811c9dc5;
  for (const ch of `orbit:${id}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return () => {
    h ^= h << 13; h >>>= 0;
    h ^= h >>> 17;
    h ^= h << 5; h >>>= 0;
    return h / 4294967296;
  };
}

const HUES = [
  { name: "Сонячна", hue: 38 },
  { name: "Іонна", hue: 190 },
  { name: "Туманна", hue: 285 },
  { name: "Полярна", hue: 150 },
  { name: "Марсіанська", hue: 12 },
  { name: "Зоряна", hue: 220 },
] as const;
const SKY = ["Оріон", "Лебідь", "Ліра", "Кассіопея", "Персей", "Андромеда", "Велика Ведмедиця", "Дракон", "Орел", "Пегас", "Скорпіон", "Стрілець"] as const;
const DUST = ["пилова", "кришталева", "оксамитова", "іскриста"] as const;

export type Traits = { hue: number; tint: string; sky: string; rings: number; moons: number; dust: string; tier: "Перша тисяча" | "Перші 100 тисяч" | "Рідкісна" | "Звичайна"; mirror: boolean };

export function traitsOf(id: number): Traits {
  const r = seed(id);
  const tint = HUES[Math.floor(r() * HUES.length)];
  const digits = String(id);
  const mirror = digits.length > 1 && digits === [...digits].reverse().join("");
  const roll = r();
  return {
    hue: tint.hue,
    tint: tint.name,
    sky: SKY[Math.floor(r() * SKY.length)],
    rings: 1 + Math.floor(r() * 3),
    moons: Math.floor(r() * 4),
    dust: DUST[Math.floor(r() * DUST.length)],
    tier: id <= 1000 ? "Перша тисяча" : id <= 100_000 ? "Перші 100 тисяч" : roll < 0.08 || mirror ? "Рідкісна" : "Звичайна",
    mirror,
  };
}
