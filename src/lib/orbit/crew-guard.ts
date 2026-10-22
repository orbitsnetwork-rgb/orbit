/**
 * Виявлення замкнених кілець у графі підтверджень. Лише позначка для перевірки людиною:
 * нічого не блокує, ✦ і орбіти не змінює.
 */
import type { Creation, World } from "@/lib/orbit/engine";

export const LOOP_MIN = 4;
export const LOOP_WORLD_MIN = 10;

/**
 * Замкнене коло: автор у зв'язній групі графа підтверджень (≥4 людей), яка ніяк не пов'язана
 * з найбільшою групою світу. Чесні люди зливаються в одну велику мережу; кільце фейків, що
 * підтверджує лише себе, лишається окремим островом.
 */
export function closedLoop(world: World, creation: Creation): boolean {
  if (world.accounts.length < LOOP_WORLD_MIN) return false;
  const adj = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  };
  for (const item of world.creations) for (const row of item.confirms) link(item.userId, row.witnessId);
  for (const row of creation.confirms) link(creation.userId, row.witnessId);
  const comp = new Map<string, number>();
  const sizes: number[] = [];
  for (const start of adj.keys()) {
    if (comp.has(start)) continue;
    const id = sizes.length;
    let size = 0;
    const stack = [start];
    comp.set(start, id);
    while (stack.length) {
      const cur = stack.pop()!;
      size++;
      for (const next of adj.get(cur) ?? []) if (!comp.has(next)) { comp.set(next, id); stack.push(next); }
    }
    sizes.push(size);
  }
  const mine = comp.get(creation.userId);
  if (mine === undefined) return false;
  const biggest = sizes.indexOf(Math.max(...sizes));
  return mine !== biggest && sizes[mine] >= LOOP_MIN;
}
