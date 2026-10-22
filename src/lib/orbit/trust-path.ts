/**
 * «Шлях довіри»: найкоротший ланцюжок підтверджень між двома людьми.
 * Кожне ребро — пара «свідок ↔ автор», яка можлива лише раз за життя, тому ланцюжок — сильний сигнал,
 * на відміну від «спільних друзів» у звичайних соцмережах. Лише читання світу.
 */
import type { World } from "./engine";

export type Graph = Map<string, Set<string>>;

export function trustGraph(world: Pick<World, "accounts" | "creations">): Graph {
  const known = new Set(world.accounts.map((a) => a.id));
  const g: Graph = new Map();
  const link = (a: string, b: string) => {
    if (a === b || !known.has(a) || !known.has(b)) return;
    if (!g.has(a)) g.set(a, new Set());
    if (!g.has(b)) g.set(b, new Set());
    g.get(a)!.add(b);
    g.get(b)!.add(a);
  };
  for (const c of world.creations) for (const cf of c.confirms) link(cf.witnessId, c.userId);
  return g;
}

/** BFS з обмеженням глибини (за замовчуванням 4 кроки). Повертає [from, …, to] або null. */
export function trustPath(g: Graph, from: string, to: string, maxHops = 4): string[] | null {
  if (from === to) return [from];
  const prev = new Map<string, string>([[from, ""]]);
  let layer = [from];
  for (let hop = 0; hop < maxHops && layer.length; hop++) {
    const next: string[] = [];
    for (const u of layer) {
      for (const v of [...(g.get(u) ?? [])].sort()) {
        if (prev.has(v)) continue;
        prev.set(v, u);
        if (v === to) {
          const path = [to];
          for (let x = u; x; x = prev.get(x)!) path.push(x);
          return path.reverse();
        }
        next.push(v);
      }
    }
    layer = next;
  }
  return null;
}

/** Ступінь для всіх людей одразу (1°, 2°, 3°): один BFS від мене. */
export function degreesFrom(g: Graph, me: string, maxHops = 3): Map<string, number> {
  const d = new Map<string, number>([[me, 0]]);
  let layer = [me];
  for (let hop = 1; hop <= maxHops && layer.length; hop++) {
    const next: string[] = [];
    for (const u of layer) for (const v of g.get(u) ?? []) if (!d.has(v)) { d.set(v, hop); next.push(v); }
    layer = next;
  }
  return d;
}
