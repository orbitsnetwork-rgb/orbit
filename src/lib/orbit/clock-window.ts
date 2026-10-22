/**
 * Масштабування (аудит C1): коли годинник НІЧОГО не змінює у збереженому світі.
 * adoptClock(world, wall) змінює світ лише якщо (див. engine.ts, рушій не чіпаємо):
 *  - є збір з достатньою кількістю підтверджень (promoteReady) — одразу;
 *  - код має codeExpires > wall + CODE_MS (годинник позаду) — тобто wall < codeExpires − CODE_MS;
 *  - wall < lastDistributionAt (Math.min);
 *  - заряд закінчився: wall ≥ chargeStartedAt + CHARGE_MS;
 *  - нова доба UTC: utcDay(wall) ≠ priceDay;
 *  - поділ фонду: fund > 0 і wall ≥ lastDistributionAt + FUND_PERIOD_MS.
 * Повертає вікно [from, until): для будь-якого wall у ньому adoptClock(world, wall) ≡ { ...world, now: wall }.
 * Порожнє вікно (from ≥ until) — треба звичайний шлях. Перевіряє property-тест clock-window.test.ts.
 */
import { CHARGE_MS, CODE_MS, DAY_MS, FUND_PERIOD_MS, crewNeed, type World } from "@/lib/orbit/engine";

export type ClockWindow = { from: number; until: number };

export function clockWindow(world: World): ClockWindow {
  const need = crewNeed(world);
  let from = world.lastDistributionAt;
  const dayStart = Date.parse(`${world.priceDay}T00:00:00.000Z`);
  if (!Number.isFinite(dayStart)) return { from: 0, until: 0 };
  from = Math.max(from, dayStart);
  let until = dayStart + DAY_MS;
  if (world.fund > 0) until = Math.min(until, world.lastDistributionAt + FUND_PERIOD_MS);
  for (const item of world.creations) {
    if (item.status === "collecting" && item.confirms.length >= need) return { from: 0, until: 0 };
    if (item.code) from = Math.max(from, item.codeExpires - CODE_MS + 1);
    if (item.status === "charging") {
      if (item.chargeStartedAt == null) continue;
      until = Math.min(until, item.chargeStartedAt + CHARGE_MS);
    }
  }
  return { from, until };
}

export function clockQuiet(win: ClockWindow, wall: number): boolean {
  return wall >= win.from && wall < win.until;
}
