/**
 * «Екіпаж»: автор і 8 людей, що підтвердили успішний запуск. Лише читання з даних світу.
 * Номер екіпажу — порядковий серед успішних запусків. Чату немає (відкладено).
 */
import { CONFIRM_NEED, type Creation, type World } from "@/lib/orbit/engine";

export type Crew = { no: number; creation: Creation; author: string; members: string[]; orbitId: number | null; at: number };
export type CrewStep = { id: string; author: string; status: Creation["status"]; together: number; at: number };

function opened(id: string) {
  const value = parseInt(id.split("-")[1] ?? "", 36);
  return Number.isFinite(value) ? value : 0;
}

export function crewsOf(world: World, origins: Record<string, string> = {}): Crew[] {
  const done = world.creations
    .map((creation, index) => ({ creation, index }))
    .filter(({ creation }) => creation.status === "done" && creation.confirms.length >= CONFIRM_NEED)
    .sort((a, b) => (a.creation.chargeStartedAt ?? 0) - (b.creation.chargeStartedAt ?? 0) || a.index - b.index);
  const byCr = new Map(Object.entries(origins).map(([orbit, cr]) => [cr, Number(orbit)]));
  // Без запису origins (старі запуски) номер орбіти відомий, лише якщо кожна орбіта народилась із заряду по черзі.
  const ordinal = world.creations.filter((row) => row.status === "done").length === world.nextNo - 1;
  return done.map(({ creation }, i) => ({
    no: i + 1,
    creation,
    author: creation.userId,
    members: creation.confirms.map((row) => row.witnessId),
    orbitId: byCr.get(creation.id) ?? (ordinal ? i + 1 : null),
    at: (creation.chargeStartedAt ?? opened(creation.id)) + 24 * 60 * 60 * 1000,
  }));
}

export function crewOfOrbit(world: World, orbitId: number, origins: Record<string, string> = {}) {
  return crewsOf(world, origins).find((crew) => crew.orbitId === orbitId) ?? null;
}

export function myCrews(world: World, userId: string, origins: Record<string, string> = {}) {
  return crewsOf(world, origins).filter((crew) => crew.author === userId || crew.members.includes(userId));
}

/** Спільна історія: запуски людей з екіпажу, які підтримали інші члени того ж екіпажу. */
export function crewHistory(world: World, crew: Crew): CrewStep[] {
  const people = new Set([crew.author, ...crew.members]);
  return world.creations
    .filter((row) => people.has(row.userId))
    .map((row) => ({ id: row.id, author: row.userId, status: row.status, together: row.confirms.filter((c) => people.has(c.witnessId)).length, at: row.chargeStartedAt ?? opened(row.id) }))
    .filter((row) => row.together > 0)
    .sort((a, b) => b.at - a.at);
}
