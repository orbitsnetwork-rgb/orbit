import test from "node:test";
import assert from "node:assert/strict";
import { adoptClock, CHARGE_MS, CODE_MS, DAY_MS, FUND_PERIOD_MS, utcDay, type Creation, type World } from "./engine.ts";
import { clockQuiet, clockWindow } from "./clock-window.ts";
import { benchWorld } from "./bench-world.ts";

/** Детермінований ГВЧ, щоб падіння відтворювалось. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function randomWorld(r: () => number): World {
  const base = Date.UTC(2026, 9, 22, Math.floor(r() * 24), Math.floor(r() * 60));
  const w = benchWorld(Math.floor(r() * 6) + 2, { now: base, seed: Math.floor(r() * 1e9) }).world;
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const creations: Creation[] = w.creations.map((c) => {
    const status = r() < 0.9 ? pick(["done", "failed"] as const) : pick(["collecting", "charging"] as const);
    const code = status === "collecting" && r() < 0.6 ? "123456" : null;
    return {
      ...c,
      status,
      confirms: status === "collecting" ? (r() < 0.02 ? c.confirms.slice(0, 1) : []) : c.confirms,
      code,
      codeExpires: code ? base + Math.floor((r() - 0.3) * 2 * CODE_MS) : 0,
      chargeStartedAt: status === "charging" ? base - Math.floor(r() * CHARGE_MS * 1.2) : c.chargeStartedAt,
    };
  });
  return {
    ...w,
    creations,
    fund: r() < 0.5 ? 0 : Math.floor(r() * 1000),
    lastDistributionAt: base - Math.floor(r() * FUND_PERIOD_MS * 1.2),
    priceDay: utcDay(base - (r() < 0.2 ? DAY_MS : 0)),
    now: base,
  };
}

const strip = (w: World) => JSON.stringify({ ...w, now: 0 });

test("clockWindow: inside the window adoptClock changes nothing but now (2000 random worlds × 6 walls)", () => {
  const r = rng(42);
  let inside = 0;
  let outsideChanged = 0;
  for (let i = 0; i < 2000; i++) {
    const w = randomWorld(r);
    const win = clockWindow(w);
    for (let j = 0; j < 6; j++) {
      const wall = w.now + Math.floor((r() - 0.3) * 2 * DAY_MS);
      const after = adoptClock(w, wall);
      if (clockQuiet(win, wall)) {
        inside += 1;
        assert.equal(after.now, wall);
        assert.equal(strip(after), strip(w), `world ${i} wall ${wall}`);
      } else if (strip(after) !== strip(w)) outsideChanged += 1;
    }
  }
  assert.ok(inside > 1500, `enough samples inside: ${inside}`);
  assert.ok(outsideChanged > 100, `window is not trivially empty: ${outsideChanged}`);
});
