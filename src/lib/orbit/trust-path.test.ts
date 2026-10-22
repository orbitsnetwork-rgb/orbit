import { test } from "node:test";
import assert from "node:assert/strict";
import { degreesFrom, trustGraph, trustPath } from "./trust-path";

const acc = (id: string) => ({ id, name: id }) as never;
const cr = (userId: string, w: string[]) => ({ id: userId + w.join(), userId, status: "done", confirms: w.map((x) => ({ witnessId: x, at: 1 })) }) as never;
const world = { accounts: ["a", "b", "c", "d", "e", "x"].map(acc), creations: [cr("b", ["a"]), cr("c", ["b"]), cr("c", ["d"]), cr("e", ["d"]), cr("a", ["ghost"])] };

test("trust path: shortest chain, both directions, unknowns ignored", () => {
  const g = trustGraph(world);
  assert.deepEqual(trustPath(g, "a", "c"), ["a", "b", "c"]);
  assert.deepEqual(trustPath(g, "e", "a"), ["e", "d", "c", "b", "a"]);
  assert.equal(trustPath(g, "a", "e", 3), null);
  assert.equal(trustPath(g, "a", "x"), null);
  assert.equal(g.has("ghost"), false);
});

test("degrees from me", () => {
  const d = degreesFrom(trustGraph(world), "a");
  assert.equal(d.get("b"), 1);
  assert.equal(d.get("c"), 2);
  assert.equal(d.get("d"), 3);
  assert.equal(d.has("e"), false);
});

test("echo: only new wave/in since seen", async () => {
  const { echoesSince } = await import("./echo");
  const w = { accounts: ["me", "a", "b", "c"].map(acc), creations: [cr("a", ["me"]), cr("b", ["a"]), cr("me", ["c"])] };
  const first = echoesSince(w, "me", new Set());
  assert.deepEqual(first.fresh.map((e) => `${e.kind}:${e.id}:${e.via ?? ""}`).sort(), ["in:c:", "wave:b:a"]);
  assert.equal(echoesSince(w, "me", new Set(first.all)).fresh.length, 0);
});
