/**
 * «Сузір'я» — мапа людських зв'язків з даних світу (лише читання, формули не чіпає).
 * Правило «пара раз за життя» робить кожну лінію унікальною: це справжній граф довіри.
 *  - in:  хто підтвердив мої запуски;
 *  - out: чиї запуски підтвердив я;
 *  - wave: кого вже підтвердили люди з out (друге коло — «хвиля», яку я запустив).
 */
import type { World } from "./engine";

export type Star = { id: string; name: string; at: number; launched: boolean };
export type Constellation = { in: Star[]; out: Star[]; wave: Star[]; launchedOut: number; total: number };

export function constellationOf(world: Pick<World, "accounts" | "creations">, me: string): Constellation {
  const names = new Map(world.accounts.map((a) => [a.id, a.name] as const));
  const done = new Set(world.creations.filter((c) => c.status === "done").map((c) => c.userId));
  const star = (id: string, at: number): Star => ({ id, name: names.get(id) ?? "Учасник", at, launched: done.has(id) });
  const inMap = new Map<string, number>();
  const outMap = new Map<string, number>();
  const helped = new Map<string, Map<string, number>>();
  for (const c of world.creations) {
    for (const cf of c.confirms) {
      if (cf.witnessId === c.userId) continue;
      if (c.userId === me) inMap.set(cf.witnessId, Math.min(inMap.get(cf.witnessId) ?? Infinity, cf.at));
      if (cf.witnessId === me) outMap.set(c.userId, Math.min(outMap.get(c.userId) ?? Infinity, cf.at));
      let row = helped.get(cf.witnessId);
      if (!row) helped.set(cf.witnessId, (row = new Map()));
      row.set(c.userId, Math.min(row.get(c.userId) ?? Infinity, cf.at));
    }
  }
  const sort = (m: Map<string, number>) => [...m].filter(([id]) => names.has(id)).sort((a, b) => a[1] - b[1]).map(([id, at]) => star(id, at));
  const near = new Set([me, ...inMap.keys(), ...outMap.keys()]);
  const waveMap = new Map<string, number>();
  for (const id of outMap.keys()) {
    for (const [next, at] of helped.get(id) ?? []) if (!near.has(next)) waveMap.set(next, Math.min(waveMap.get(next) ?? Infinity, at));
  }
  const out = sort(outMap);
  const res = { in: sort(inMap), out, wave: sort(waveMap) };
  return { ...res, launchedOut: out.filter((s) => s.launched).length, total: new Set([...res.in, ...res.out, ...res.wave].map((s) => s.id)).size };
}

/** Детерміновані позиції на колах (0..1), щоб картинка не стрибала між оновленнями. */
export function layout(stars: Star[], ring: number, seed = 0): { star: Star; x: number; y: number }[] {
  const n = stars.length;
  const r = [0, 0.24, 0.36, 0.46][ring] ?? 0.46;
  return stars.map((star, i) => {
    const a = seed + (i / Math.max(n, 1)) * Math.PI * 2 + (ring % 2 ? 0 : Math.PI / Math.max(n, 1));
    return { star, x: 0.5 + Math.cos(a) * r, y: 0.5 + Math.sin(a) * r };
  });
}
