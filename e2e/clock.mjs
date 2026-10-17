// Test-only preload (node --import): shifts Date.now by the ms stored in $ORBIT_E2E_CLOCK.
// Lets the suite fast-forward the 24 h charge / 3-day fund period without touching app code.
import { readFileSync } from "node:fs";
const file = process.env.ORBIT_E2E_CLOCK;
if (file) {
  const real = Date.now.bind(Date);
  let cached = 0, at = -1;
  const shift = () => {
    const t = real();
    if (t - at > 100) { at = t; try { cached = Number(readFileSync(file, "utf8")) || 0; } catch { cached = 0; } }
    return cached;
  };
  const RealDate = Date;
  class ShiftedDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(real() + shift()); else super(...a); }
    static now() { return real() + shift(); }
  }
  globalThis.Date = ShiftedDate;
}

// Test-only: deterministic Math.random when $ORBIT_E2E_SEED is set (charge outcome, codes).
const seed = Number(process.env.ORBIT_E2E_SEED);
if (Number.isFinite(seed) && process.env.ORBIT_E2E_SEED) {
  let a = seed >>> 0;
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
