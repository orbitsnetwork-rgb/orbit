/** Ряди для графіків — лише з того, що вже є у світі (угоди, орбіти, виплати). Формули рушія не чіпаємо. */
import { DAY_MS, type Trade } from "@/lib/orbit/engine";

export type Range = "1d" | "7d" | "30d" | "all";
export const RANGES: { id: Range; label: string; long: string }[] = [
  { id: "1d", label: "1Д", long: "за добу" },
  { id: "7d", label: "7Д", long: "за 7 днів" },
  { id: "30d", label: "30Д", long: "за 30 днів" },
  { id: "all", label: "Все", long: "за весь час" },
];
const HOUR = 3_600_000;

export type Point = { t: number; v: number };
export type Series = { points: Point[]; inRange: Trade[]; from: number; change: number; lo: number; hi: number };

function spanOf(range: Range, trades: Trade[], now: number) {
  if (range === "1d") return { from: now - DAY_MS, step: HOUR };
  if (range === "7d") return { from: now - 7 * DAY_MS, step: 6 * HOUR };
  if (range === "30d") return { from: now - 30 * DAY_MS, step: DAY_MS };
  const first = trades.length ? Math.min(...trades.map((row) => row.at)) : now - DAY_MS;
  const from = Math.min(first, now - DAY_MS);
  return { from, step: Math.max(HOUR, Math.ceil((now - from) / 60)) };
}

/** Ціна угоди = ціна дня в момент угоди. Між угодами ціна тримається; остання точка — поточна ціна. */
export function priceSeries(trades: Trade[], price: number, now: number, range: Range): Series {
  const sorted = [...trades].sort((a, b) => a.at - b.at);
  const { from, step } = spanOf(range, sorted, now);
  const before = sorted.filter((row) => row.at < from);
  const inRange = sorted.filter((row) => row.at >= from && row.at <= now);
  let carry: number | null = before.length ? before[before.length - 1].amount : null;
  const points: Point[] = [];
  let cursor = 0;
  for (let t = from + step; t < now; t += step) {
    while (cursor < inRange.length && inRange[cursor].at <= t) carry = inRange[cursor++].amount;
    if (carry !== null) points.push({ t, v: carry });
  }
  points.push({ t: now, v: price });
  const values = points.map((row) => row.v);
  const first = points[0]?.v ?? price;
  return { points, inRange, from, change: first ? ((price - first) / first) * 100 : 0, lo: Math.min(...values), hi: Math.max(...values) };
}

/** Скільки подій на добу за останні N діб (стовпчики / спарклайни). */
export function perDay(times: number[], now: number, days = 14) {
  const out = Array.from({ length: days }, () => 0);
  const start = now - days * DAY_MS;
  for (const at of times) {
    if (at < start || at > now) continue;
    out[Math.min(days - 1, Math.floor((at - start) / DAY_MS))] += 1;
  }
  return out;
}

/** Сума значень на добу за останні N діб. */
export function sumPerDay(rows: { at: number; amount: number }[], now: number, days = 14) {
  const out = Array.from({ length: days }, () => 0);
  const start = now - days * DAY_MS;
  for (const row of rows) {
    if (row.at < start || row.at > now) continue;
    out[Math.min(days - 1, Math.floor((row.at - start) / DAY_MS))] += row.amount;
  }
  return out;
}

/** Зміна «сьогодні проти вчора» для лічильників: +N або 0. */
export function dayDelta(values: number[]) {
  if (values.length < 2) return 0;
  return values[values.length - 1] - values[values.length - 2];
}
