/** Екіпажі людини для «Що далі»: заряд іде або орбіта вийшла не пізніше 3 днів тому. */
import { CHARGE_MS, type World } from "./engine";

const RECENT_MS = 3 * 86_400_000;

export type Crew = { id: string; author: string; mine: boolean; status: "charging" | "done"; start: number; people: { id: string; name: string }[]; no: number };

export function crewsFor(world: World, userId: string, now: number): Crew[] {
  const done = world.creations.filter((c) => c.status === "done");
  const names = new Map(world.accounts.map((a) => [a.id, a.name]));
  const out: Crew[] = [];
  for (const c of [...world.creations].reverse()) {
    if (c.status !== "charging" && c.status !== "done") continue;
    const ids = [c.userId, ...c.confirms.map((x) => x.witnessId)];
    if (!ids.includes(userId) || !c.chargeStartedAt) continue;
    if (c.status === "done" && now - (c.chargeStartedAt + CHARGE_MS) > RECENT_MS) continue;
    out.push({
      id: c.id, author: names.get(c.userId) ?? "Учасник", mine: c.userId === userId, status: c.status, start: c.chargeStartedAt,
      people: [...new Set(ids)].map((id) => ({ id, name: names.get(id) ?? "Учасник" })), no: done.indexOf(c) + 1,
    });
  }
  return out.slice(0, 4);
}

