// 14a: лише логіка «чи показати результат» — без UI, щоб екран результату вантажився окремим чанком.
import { CHARGE_MS, chanceOf, DAY_MS, type Creation, type World } from "@/lib/orbit/engine";

const seenKey = (id: string) => `orbits-result-${id}`;
/** Старіші результати не святкуємо вдруге на новому пристрої — просто позначаємо. */
const FRESH_FOR = 3 * DAY_MS;

function seen(id: string) {
  try {
    return localStorage.getItem(seenKey(id)) === "1";
  } catch {
    return true;
  }
}

export function markSeen(id: string) {
  try {
    localStorage.setItem(seenKey(id), "1");
  } catch {
    /* приватний режим */
  }
}

export type Outcome = {
  creation: Creation;
  passed: boolean;
  orbitId: number | null;
  chance: number;
  witnesses: string[];
};

/** Останній завершений заряд цієї людини, якого вона ще не бачила на цьому пристрої. */
export function unseenOutcome(world: World, userId: string): Outcome | null {
  const creation = world.creations.filter((item) => item.userId === userId && (item.status === "done" || item.status === "failed")).at(-1);
  if (!creation || creation.chargeStartedAt == null) return null;
  if (seen(creation.id)) return null;
  const readyAt = creation.chargeStartedAt + CHARGE_MS;
  if (world.now - readyAt > FRESH_FOR) {
    markSeen(creation.id);
    return null;
  }
  const passed = creation.status === "done";
  const orbit = passed
    ? world.orbits.filter((item) => item.ownerId === userId && item.createdAt >= readyAt).sort((a, b) => a.createdAt - b.createdAt)[0]
    : undefined;
  // Шанс беремо з журналу рушія («Шанс був N%»), а якщо запису вже немає — рахуємо за кількістю орбіт на момент заряду.
  const pattern = passed && orbit ? new RegExp(`#${orbit.id}\\b.*Шанс був (\\d+)%`) : /^Заряд зірвався.*Шанс був (\d+)%/;
  const line = world.log.filter((row) => row.at >= readyAt && pattern.test(row.text)).sort((a, b) => a.at - b.at)[0];
  const fromLog = line ? Number(pattern.exec(line.text)?.[1]) : NaN;
  const before = world.orbits.filter((item) => item.createdAt < readyAt).length;
  const chance = Number.isFinite(fromLog) ? fromLog : Math.round(chanceOf(before) * 100);
  const witnesses = creation.confirms.map((row) => world.accounts.find((account) => account.id === row.witnessId)?.name ?? "Учасник");
  return { creation, passed, orbitId: orbit?.id ?? null, chance, witnesses };
}
