/**
 * Сигнали довіри на картках «Шукаю орбіту». Чисті функції, без бази:
 * — ступінь (1°/2°/3°) і ланцюжок «через кого» — з того самого графа, що й «Шлях довіри» (дані світу, які клієнт уже має);
 * — скільки різних людей підтвердили запуски людини;
 * — до 2 несхованих «Слів поручителя» (сервер віддає лише несховані, тут — відбір і порядок).
 */
import type { World } from "./engine";
import { trustPath, type Graph } from "./trust-path";

export const CARD_WORDS = 2;
export type CardWord = { from: string; text: string; at: number };
export type WordRow = { witness_id: string; author_id: string; text: string; at: string | number; hidden?: boolean };

/** Слова для карток: лише несховані, лише від людей, які є у світі й не в блоці з тим, хто дивиться; найновіші, ≤2 на людину. */
export function pickCardWords(rows: WordRow[], known: Set<string>, blocked: Set<string> = new Set(), max = CARD_WORDS): Map<string, CardWord[]> {
  const out = new Map<string, CardWord[]>();
  const sorted = [...rows].sort((a, b) => Number(b.at) - Number(a.at) || a.witness_id.localeCompare(b.witness_id));
  for (const r of sorted) {
    if (r.hidden || !known.has(r.witness_id) || !known.has(r.author_id) || blocked.has(r.witness_id) || r.witness_id === r.author_id) continue;
    const list = out.get(r.author_id) ?? [];
    if (list.length >= max) continue;
    list.push({ from: r.witness_id, text: r.text, at: Number(r.at) });
    out.set(r.author_id, list);
  }
  return out;
}

/** Скільки різних людей (що є у світі) підтвердили хоч один запуск цієї людини. */
export function vouchersOf(world: Pick<World, "accounts" | "creations">, uid: string): number {
  const known = new Set(world.accounts.map((a) => a.id));
  const who = new Set<string>();
  for (const c of world.creations) if (c.userId === uid) for (const f of c.confirms) if (f.witnessId !== uid && known.has(f.witnessId)) who.add(f.witnessId);
  return who.size;
}

export type CardTrust = { d: number | null; via: string[]; vouchers: number };

/** Ступінь від мене (до 3°) і проміжні люди ланцюжка (без мене і без людини з картки). */
export function cardTrust(g: Graph, world: Pick<World, "accounts" | "creations">, me: string, uid: string): CardTrust {
  const vouchers = vouchersOf(world, uid);
  if (me === uid) return { d: 0, via: [], vouchers };
  const path = trustPath(g, me, uid, 3);
  if (!path) return { d: null, via: [], vouchers };
  return { d: path.length - 1, via: path.slice(1, -1), vouchers };
}

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
};

/** Короткий рядок під іменем: «Пряме підтвердження» / «Через Оля П.» / «Поза твоїм колом довіри». */
export function trustLine(t: CardTrust, nameOf: (id: string) => string): string {
  if (t.d === 1) return "Пряме підтвердження з тобою";
  if (t.d && t.d > 1) return `Через ${t.via.map(nameOf).join(" → ")}`;
  return "Поза твоїм колом довіри";
}

export function vouchersLine(n: number): string {
  if (!n) return "Ще без поручителів — знайомся обережно";
  return `${n} ${plural(n, "поручитель", "поручителі", "поручителів")}`;
}
