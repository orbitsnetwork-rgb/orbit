import assert from "node:assert/strict";
import test from "node:test";
import { nextRitual } from "./ritual.ts";

test("daily charge: streak grows on consecutive days, resets after a gap, once per day", () => {
  let r = { last: "", streak: 0, best: 0 };
  r = nextRitual(r, "2026-10-01", "2026-09-30");
  assert.equal(r.streak, 1);
  assert.deepEqual(nextRitual(r, "2026-10-01", "2026-09-30"), r);
  r = nextRitual(r, "2026-10-02", "2026-10-01");
  assert.equal(r.streak, 2);
  r = nextRitual(r, "2026-10-05", "2026-10-04");
  assert.equal(r.streak, 1);
  assert.equal(r.best, 2);
});
