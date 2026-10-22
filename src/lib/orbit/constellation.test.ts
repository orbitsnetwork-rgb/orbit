import { test } from "node:test";
import assert from "node:assert/strict";
import { constellationOf, layout } from "./constellation";
import { cleanEmblem, unlockedGlyphs } from "./emblem";

const acc = (id: string) => ({ id, name: `Ім'я ${id} Прізвище` }) as never;
const cr = (id: string, userId: string, witnesses: string[], status = "done") => ({ id, userId, status, confirms: witnesses.map((w, i) => ({ witnessId: w, at: 100 + i })) }) as never;

test("constellation: in, out, wave and dedupe", () => {
  const world = {
    accounts: ["me", "a", "b", "c", "d", "e"].map(acc),
    creations: [cr("1", "me", ["a"]), cr("2", "b", ["me"]), cr("3", "c", ["me"], "collecting"), cr("4", "d", ["b"]), cr("5", "a", ["me"]), cr("6", "e", ["b", "me"].slice(0, 1))],
  };
  const c = constellationOf(world, "me");
  assert.deepEqual(c.in.map((s) => s.id), ["a"]);
  assert.deepEqual(c.out.map((s) => s.id).sort(), ["a", "b", "c"]);
  assert.deepEqual(c.wave.map((s) => s.id).sort(), ["d", "e"]);
  assert.equal(c.launchedOut, 2);
  assert.equal(c.total, 5);
});

test("constellation: unknown/deleted accounts are skipped, self-confirm ignored", () => {
  const c = constellationOf({ accounts: [acc("me")], creations: [cr("1", "me", ["ghost", "me"])] }, "me");
  assert.equal(c.in.length, 0);
  assert.equal(c.total, 0);
});

test("layout is deterministic and inside the box", () => {
  const stars = constellationOf({ accounts: ["me", "a", "b"].map(acc), creations: [cr("1", "a", ["me"]), cr("2", "b", ["me"])] }, "me").out;
  const a = layout(stars, 1);
  assert.deepEqual(a, layout(stars, 1));
  for (const p of a) assert.ok(p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1);
});

test("emblem: validation and unlocks", () => {
  assert.equal(cleanEmblem({ hue: 13, glyph: "star" }), null);
  assert.equal(cleanEmblem({ hue: 38, glyph: "bogus" }), null);
  assert.deepEqual(cleanEmblem({ hue: 38, glyph: "moon" }), { hue: 38, glyph: "moon" });
  const fresh = unlockedGlyphs({ accounts: [acc("me")], creations: [] }, "me");
  assert.ok(fresh.has("star") && !fresh.has("spark") && !fresh.has("sun"));
  const world = { accounts: ["me", "a", "b", "c"].map(acc), creations: [cr("1", "me", ["a"]), cr("2", "a", ["me"]), cr("3", "b", ["me"]), cr("4", "c", ["me"])] };
  const got = unlockedGlyphs(world, "me");
  assert.ok(got.has("spark") && got.has("sun") && got.has("comet") && !got.has("nova") && !got.has("crown"));
});
