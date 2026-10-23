import { test } from "node:test";
import assert from "node:assert/strict";
import { crewsFor } from "./crews";
import { CHARGE_MS } from "./engine";

const w = (creations: unknown[]) => ({ accounts: [{ id: "a", name: "Аня" }, { id: "b", name: "Богдан" }, { id: "c", name: "Віра" }], creations }) as never;
test("crewsFor: author and witness see charging crew; outsider not", () => {
  const now = 10 * CHARGE_MS;
  const cr = { id: "c1", userId: "a", status: "charging", chargeStartedAt: now - 1000, confirms: [{ witnessId: "b" }] };
  assert.equal(crewsFor(w([cr]), "a", now)[0].mine, true);
  assert.equal(crewsFor(w([cr]), "b", now)[0].mine, false);
  assert.equal(crewsFor(w([cr]), "c", now).length, 0);
});
test("crewsFor: done shows for 3 days, collecting/failed never", () => {
  const now = 10 * CHARGE_MS;
  const done = { id: "d", userId: "a", status: "done", chargeStartedAt: now - CHARGE_MS - 1000, confirms: [{ witnessId: "b" }] };
  const old = { ...done, id: "o", chargeStartedAt: now - CHARGE_MS - 4 * 86_400_000 };
  const col = { id: "x", userId: "a", status: "collecting", chargeStartedAt: null, confirms: [] };
  const out = crewsFor(w([done, old, col]), "a", now);
  assert.deepEqual(out.map((c) => c.id), ["d"]);
  assert.equal(out[0].no, 1);
});
