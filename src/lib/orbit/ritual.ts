export type Ritual = { last: string; streak: number; best: number };

/** Наступний стан щоденного заряду після дотику сьогодні. Серія рветься, якщо пропущено добу. */
export function nextRitual(prev: Ritual, today: string, yesterday: string): Ritual {
  if (prev.last === today) return prev;
  const streak = prev.last === yesterday ? prev.streak + 1 : 1;
  return { last: today, streak, best: Math.max(prev.best, streak) };
}

