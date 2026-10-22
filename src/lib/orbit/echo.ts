/**
 * «Відлуння»: що нового сталося у твоєму сузір'ї з минулого разу — хтось, кого ти підтвердив,
 * сам підтвердив людину (хвиля пішла далі), або хтось підтвердив тебе. Чиста функція + стан у localStorage.
 */
import { constellationOf } from "./constellation";
import type { World } from "./engine";

export type Echo = { kind: "wave" | "in" | "out"; id: string; name: string; via?: string };

export function echoesSince(world: Pick<World, "accounts" | "creations">, me: string, seen: Set<string>): { fresh: Echo[]; all: string[] } {
  const c = constellationOf(world, me);
  const viaOf = new Map<string, string>();
  const outIds = new Set(c.out.map((s) => s.id));
  for (const cr of world.creations) for (const cf of cr.confirms) if (outIds.has(cf.witnessId) && !viaOf.has(cr.userId)) viaOf.set(cr.userId, cf.witnessId);
  const name = (id: string) => world.accounts.find((a) => a.id === id)?.name ?? "Учасник";
  const items: Echo[] = [
    ...c.in.map((s) => ({ kind: "in" as const, id: s.id, name: s.name })),
    ...c.wave.map((s) => ({ kind: "wave" as const, id: s.id, name: s.name, via: viaOf.has(s.id) ? name(viaOf.get(s.id)!) : undefined })),
  ];
  const key = (e: Echo) => `${e.kind}:${e.id}`;
  return { fresh: items.filter((e) => !seen.has(key(e))), all: items.map(key) };
}
