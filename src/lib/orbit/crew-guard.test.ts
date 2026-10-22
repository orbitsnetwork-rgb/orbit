import assert from "node:assert/strict";
import test from "node:test";
import type { Creation, World } from "./engine.ts";
import { emptyWorld } from "./engine.ts";
import { closedLoop } from "./crew-guard.ts";

const cr = (id: string, author: string, ws: string[]) => ({ id, userId: author, status: "done", confirms: ws.map((w) => ({ witnessId: w, at: 0 })) }) as unknown as Creation;
function world(n: number, creations: Creation[]): World {
  const w = emptyWorld(0);
  return { ...w, accounts: Array.from({ length: n }, (_, i) => ({ id: `u${i}` })) as unknown as World["accounts"], creations };
}

test("closed loop: an island of 4 confirming only each other is flagged, the main network is not", () => {
  const main = [cr("a", "u0", ["u1", "u2", "u3"]), cr("b", "u1", ["u0", "u4", "u5"]), cr("c", "u2", ["u5", "u6", "u7"])];
  const ring = [cr("r1", "u10", ["u11", "u12", "u13"]), cr("r2", "u11", ["u10", "u12", "u13"])];
  const w = world(20, [...main, ...ring]);
  assert.equal(closedLoop(w, ring[1]), true);
  assert.equal(closedLoop(w, main[1]), false);
});

test("closed loop: off in a small world (<10 people)", () => {
  const ring = [cr("r1", "u0", ["u1", "u2", "u3"])];
  assert.equal(closedLoop(world(6, ring), ring[0]), false);
});
